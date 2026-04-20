# ADR-002 — Modèle « comptes + buckets » : enveloppes virtuelles dans des comptes logiques

- **Statut** : Accepted
- **Date** : 2026-04-20
- **Accepté le** : 2026-04-20 par Thierry vanmeeteren
- **Deciders** : Thierry vanmeeteren (Product Owner), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `product`, `domain-model`, `ux`
- **Portée** : Phase 1 (MVP), Phase 2 (pots partagés, simulateur bidirectionnel)
- **En lien avec** : [ADR-001](./ADR-001-no-psd2.md) — les comptes sont logiques, pas reliés à une banque réelle.

---

## Contexte & problème

Ankora aide l'utilisateur à **lisser des charges non-mensuelles en provisions
mensuelles**. Pour que l'utilisateur visualise et pilote ces provisions, il faut
un modèle qui réponde à trois questions opérationnelles :

1. **Où vit une provision ?** Dans un compte réel ? Une abstraction logique ?
   Une ligne calculée à la volée ?
2. **Comment plusieurs objectifs cohabitent-ils sur un même compte ?** Ex :
   l'épargne sert à la fois à lisser la taxe de circulation, à financer les
   vacances d'été, et à maintenir un matelas « imprévus ». L'utilisateur doit
   pouvoir séparer ces objectifs sans ouvrir 3 comptes bancaires.
3. **Qu'est-ce qui garantit la cohérence ?** Si la somme des objectifs dépasse
   le solde réel, l'utilisateur doit être alerté — sinon le produit ment.

Le choix de modèle domine le schéma DB, les écrans de l'application, la
nomenclature utilisée en i18n, et la sémantique des opérations (`deposit`,
`withdraw`, `transfer`, `reconcile`). Il conditionne aussi toute la stratégie
Phase 2 (pots partagés, simulateur bidirectionnel).

Les maquettes de landing (`design-mockup-landing.html` §« Le modèle enveloppe »)
et l'architecture à 3 comptes (`20260417000004_three_accounts_model.sql`) posent
déjà des invariants forts qu'il faut formaliser avant d'écrire la première ligne
de code côté domaine `buckets`.

---

## Décision — drivers

Critères, classés par poids :

1. **Cohérence avec les maquettes validées** — la landing vend explicitement
   le modèle « N comptes · N buckets » avec une **règle d'or** affichée à
   l'utilisateur : _« la somme de tes buckets doit toujours égaler le solde
   réel du compte. Ankora vérifie cette invariance en continu. »_ Toute
   décision qui casse cette promesse trahit le contrat produit.
2. **Alignement vocabulaire marché** — YNAB, Monarch Money, EveryDollar et les
   outils de _sinking funds_ utilisent tous la sémantique **enveloppe /
   bucket / category**. Adopter ce vocabulaire réduit la courbe d'apprentissage
   pour les utilisateurs qui viennent de ces outils.
3. **Simplicité de domaine** — le moteur Ankora est fait de fonctions pures
   sur `Money` (Decimal.js). Un modèle où les buckets sont des sommes
   calculables à partir de transactions atomiques est plus robuste qu'un
   modèle où chaque bucket a un solde indépendant qu'il faut synchroniser.
4. **Invariant testable** — on doit pouvoir écrire un test unitaire simple :
   `sum(buckets.balance) === account.balance` pour chaque compte. Si le modèle
   rend ce test difficile, il est mauvais.
5. **Extension Phase 2 sans refactor** — le modèle doit accueillir les pots
   partagés (comptes multi-utilisateurs) et le simulateur bidirectionnel sans
   refonte schéma.

---

## Options considérées

### Option A — Buckets = agrégats calculés à partir des transactions (virtual sum)

**Description** : pas de table `buckets` avec un solde. Chaque transaction
(`expense`, `charge_payment`, `transfer`) est taguée avec un `bucket_id`. Le
solde d'un bucket = somme des montants taggés, calculée à la volée.

| Critère                          | Verdict                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Cohérence comptable              | ✅ Parfaite — le solde dérive des mouvements, pas de dérive possible                   |
| Invariant Σ buckets = solde      | ✅ Trivial — la somme des transactions d'un compte = son solde                         |
| Performance lecture              | ⚠️ Scan de toutes les transactions par bucket ; OK jusqu'à ~10k, limite visible à 100k |
| UX — re-catégoriser une dépense  | ✅ Change le tag, les soldes se recalculent                                            |
| Simulation prospective (Phase 2) | ❌ Difficile — simuler le futur signifie inventer des transactions fictives            |
| Complexité de départ             | 🟢 Faible — une seule table source de vérité (transactions)                            |

### Option B — Buckets = soldes matérialisés avec transactions mouvementées

**Description** : table `buckets` avec colonne `balance` maintenue par
triggers / application. Chaque opération sur un bucket (affectation, retrait)
crée une transaction qui ajuste le solde du bucket **et** du compte parent en
transaction atomique.

| Critère                          | Verdict                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| Cohérence comptable              | ⚠️ Bonne si les triggers sont justes, mais possible dérive silencieuse |
| Invariant Σ buckets = solde      | ⚠️ Explicite — requiert une contrainte ou un check périodique          |
| Performance lecture              | ✅ O(1) — le solde est pré-calculé                                     |
| UX — re-catégoriser une dépense  | ⚠️ Transfert atomique entre buckets requis                             |
| Simulation prospective (Phase 2) | ✅ Excellent — on manipule des soldes cibles, on compare au réel       |
| Complexité de départ             | 🟡 Moyenne — logique duplicative à maintenir cohérente                 |

### Option C — Buckets = sous-comptes physiques distincts

**Description** : chaque bucket est un compte à part entière dans la table
`accounts`. Pas de concept « bucket » — juste plus de comptes.

| Critère                           | Verdict                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| Cohérence comptable               | ✅ Parfaite — chaque compte a son solde                            |
| Invariant Σ buckets = solde       | ❌ N'a plus de sens — il n'y a plus de « compte parent »           |
| UX — mapping avec la vraie banque | ❌ L'utilisateur n'a pas 15 comptes réels. Brise l'analogie banque |
| Contradiction avec ADR 3-comptes  | ❌ La migration `20260417000004` fige 3 comptes par workspace      |
| Extension pots partagés           | 🟡 Possible mais lourd — chaque pot = 1 compte                     |

---

## Décision

**Option B retenue (buckets = soldes matérialisés)** avec un **garde-fou
inspiré de l'Option A** : un check périodique recalcule la somme théorique
depuis les transactions et détecte toute dérive. Les deux modèles se
renforcent — le solde matérialisé donne la performance et la simulation
prospective ; le re-calcul depuis les transactions donne la vérité comptable.

### Traduction concrète

**Vocabulaire** :

- Terme canonique en code & UI : **`bucket`** (anglicisme assumé, utilisé
  dans toutes les maquettes et dans le vocabulaire marché YNAB / Monarch).
- Terme explicatif en copy produit (landing, onboarding) : **« enveloppe »**
  en FR-BE et FR, **« envelope »** en EN, **« envelope »** en NL-BE
  (la maquette utilise « enveloppes virtuelles »).
- Pas de synonymes dans le code — `bucket` partout. Les traductions UI sont
  gérées via `messages/*.json` (voir prompts/PR-2-glossary-and-strategy.md).

**Nature du bucket** :

- Un bucket appartient à **exactement un compte** (`account_kind`).
- Un bucket a une **catégorie fonctionnelle** :
  - `smoothing` — lissage d'une ou plusieurs `charges` périodiques (ex :
    « Lissage factures »).
  - `goal` — objectif d'épargne avec cible et échéance (ex : « Vacances
    août 2026 », 1 500 € au 2026-08-01).
  - `buffer` — matelas de sécurité sans cible (ex : « Imprévus »).
- Un bucket peut **regrouper plusieurs charges** (un bucket « Assurances » qui
  lisse auto + habitation + familiale) ou être **libre de toute charge** (un
  bucket « Vacances »).

**Invariant mathématique** :

```
Pour chaque compte A et chaque instant t :
    Σ ( bucket.balance  pour  bucket.account_kind = A ) = A.balance

Tolérance : 0,00 € (Decimal strict, pas d'arrondi)
```

Cet invariant est **central au contrat produit** (affiché sur la landing). Il
est enforce à 3 niveaux :

1. **Domaine** — toute opération (`deposit_to_bucket`, `withdraw_from_bucket`,
   `transfer_between_buckets`, `settle_charge_from_bucket`) est modélisée
   comme une paire d'écritures équilibrée (jamais une seule écriture).
2. **DB** — contrainte `CHECK` via une fonction PL/pgSQL appelée par trigger
   après chaque écriture sur `buckets`. Si Σ buckets ≠ solde compte → rollback.
3. **Application** — un job de réconciliation (edge function Supabase,
   quotidien) recalcule Σ à partir des transactions historiques et compare
   aux soldes matérialisés. Si dérive → alerte via la table `notifications`
   (ADR-003, à venir).

**Schéma DB (sketch)** :

```sql
create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_kind text not null check (account_kind in ('principal','vie_courante','epargne')),
  label text not null check (char_length(label) between 1 and 60),
  category text not null check (category in ('smoothing','goal','buffer')),
  balance numeric(14,2) not null default 0 check (balance >= 0 and balance <= 1e12),
  goal_target numeric(14,2) check (goal_target is null or goal_target >= 0),
  goal_due_date date,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- FK composite vers accounts (workspace_id, account_kind) pour garantir
  -- qu'un bucket ne peut exister que si le compte parent existe.
  foreign key (workspace_id, account_kind)
    references public.accounts(workspace_id, kind)
);

-- Lien optionnel charge ↔ bucket (N:1) : une charge est lissée par zéro ou un
-- bucket. Géré en table de liaison pour permettre l'historique.
create table public.charge_buckets (
  charge_id uuid primary key references public.charges(id) on delete cascade,
  bucket_id uuid not null references public.buckets(id) on delete restrict,
  since date not null default current_date
);
```

**Domaine (sketch `src/lib/domain/bucket.ts`)** :

```ts
export type BucketCategory = 'smoothing' | 'goal' | 'buffer';

export type Bucket = {
  id: string;
  accountKind: AccountKind;
  label: string;
  category: BucketCategory;
  balance: Money;
  goalTarget: Money | null;
  goalDueDate: string | null;
};

/** Σ buckets sur un compte = solde du compte. Pure function, testable. */
export function sumBucketsByAccount(buckets: readonly Bucket[], accountKind: AccountKind): Money;

/** Détecte une dérive d'invariance sur un compte. */
export function checkInvariance(
  buckets: readonly Bucket[],
  account: Account,
): { ok: true } | { ok: false; delta: Money };

/** Provision cible d'un bucket `smoothing` = Σ monthlyProvisionFor(charges liées). */
export function smoothingProvisionTarget(bucket: Bucket, linkedCharges: readonly Charge[]): Money;

/** Santé d'un bucket `goal` : rythme requis vs temps restant. */
export function goalPace(bucket: Bucket, today: string): { monthlyNeeded: Money; onTrack: boolean };
```

**Pots partagés (Phase 2)** — positionnés **hors du modèle bucket** :

Un pot partagé est un **workspace** dédié (modèle déjà existant via
`workspace_members`), pas un bucket. Raison : le partage implique de la RLS
croisée, des permissions granulaires, de l'audit log, et une histoire de
règlements — tout ce que le bucket personnel n'a pas besoin de porter. On
évite ainsi un modèle hybride douloureux à maintenir.

**Simulateur bidirectionnel (Phase 2)** — posé sur le modèle :

- **Sens 1 (ascendant)** : `charges[] → monthly provisions → bucket fill-rate`
  ⇒ courbe 12 mois du solde de chaque bucket.
- **Sens 2 (descendant)** : `budget mensuel cible → répartition entre buckets`
  ⇒ Ankora calcule si la cible est tenable vu les échéances.

Le simulateur lit les buckets, ne les modifie pas. Pas d'impact schéma.

---

## Conséquences

### Positives

- **Contrat produit tenu** — la règle d'or de la landing est directement codée
  dans l'invariant de domaine + triggers DB.
- **Vocabulaire unifié** — `bucket` partout dans le code, `enveloppe` en copy :
  on ne navigue pas entre 3 termes.
- **Performance O(1)** sur la lecture des soldes — compatible avec les écrans
  dashboard et les rappels temps réel.
- **Simulateur bidirectionnel** déblocable sans refacto — le modèle expose
  déjà `Money` par bucket.
- **Alignement marché** — un utilisateur qui vient de YNAB ou Monarch
  reconnaît immédiatement la métaphore.
- **Schéma cohérent avec ADR-001** — aucun lien bancaire requis, les buckets
  sont purement logiques.
- **Extensibilité Phase 2** — pots partagés = workspaces, pas de modèle à
  surcharger.

### Négatives

- **Duplication contrôlée** — le solde d'un bucket est stocké **et**
  reconstructible depuis les transactions. Risque de dérive si la logique
  d'écriture bugge. Mitigation : trigger DB bloquant + job de réconciliation
  quotidien + tests de propriété sur chaque opération.
- **Complexité des opérations** — une dépense qui touche un bucket `smoothing`
  implique 2 écritures synchrones (compte + bucket). Les Server Actions doivent
  être transactionnelles (commit atomique Postgres). Pas de write côté
  client-only.
- **Migration manuelle requise** si on change la catégorie d'un bucket — les
  règles de `smoothing provision target` changent. Mitigation : catégorie
  `buffer` par défaut, promotion explicite en `smoothing` ou `goal` par
  l'utilisateur.
- **Modèle pot partagé séparé** — légère surprise pour l'utilisateur qui
  verrait les pots partagés dans une section différente de ses buckets
  personnels. Mitigation : UX unifiée en façade, modèle séparé en coulisse.

### Risques résiduels

- **Si l'invariance dérive silencieusement** en prod (bug non testé,
  race condition), l'utilisateur reçoit une alerte mais voit des chiffres
  faux pendant quelques heures. Mitigation : check périodique horaire pour
  les 10 premiers utilisateurs, puis quotidien. Escalade en cas de dérive
  récurrente.
- **Limite 60 caractères sur le label de bucket** — à revoir si des
  utilisateurs se plaignent (peu probable vu le cadrage « Vacances », « Taxe
  auto », « Lissage factures »).
- **Pas de nesting** (bucket dans bucket) — assumé. Un bucket = une feuille,
  pas un arbre. Si un jour un utilisateur veut « Vacances > Été / Hiver », il
  crée deux buckets frères. KISS.

---

## Conformité & contraintes croisées

| Contrainte                              | Respect de cette décision                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Invariant landing « Σ buckets = solde » | ✅ Codé en domaine + DB + réconciliation périodique                           |
| ADR-001 (pas de banque connectée)       | ✅ Buckets 100 % logiques, aucun lien PSD2                                    |
| 3-accounts-model (migration 20260417)   | ✅ FK composite `(workspace_id, account_kind)` conserve l'invariant 3 comptes |
| Decimal strict (ARCHITECTURE.md)        | ✅ `balance numeric(14,2)` + `Money = Decimal` côté domaine                   |
| RLS Supabase                            | ✅ RLS héritée via `workspace_id`, mêmes policies que `accounts`              |
| Hosting EU                              | ✅ Aucune donnée hors UE                                                      |
| Budget 0 €                              | ✅ Aucune dépendance tierce                                                   |

---

## Alternatives explicitement **non** retenues

- **Sous-comptes bancaires réels** (Revolut Pockets, N26 Spaces) — exigeraient
  une intégration PSD2 rejetée par ADR-001.
- **Tags sans matérialisation** (Option A pure) — performance insuffisante
  pour le dashboard et bloquant pour le simulateur bidirectionnel.
- **Hiérarchie de buckets** (bucket parent / enfant) — complexité non
  justifiée par les use cases identifiés. Revoir seulement si demande
  utilisateur forte en Phase 3.
- **Buckets partagés entre comptes** (ex : un bucket « Vacances » qui
  consomme à la fois du courant et de l'épargne) — casse l'invariant
  Σ buckets = solde d'un compte donné. Contre-indiqué.

---

## Références terminologiques

- **YNAB (You Need A Budget)** — utilise `categories` comme enveloppes, avec
  le concept de _sinking funds_ (« True Expenses » dans leur doc) pour les
  charges non-mensuelles. Vocabulaire repris partiellement.
- **Monarch Money** — trois catégories de buckets : `Fixed`, `Non-monthly`,
  `Flex`. Notre typologie `smoothing / goal / buffer` est inspirée de cette
  approche, simplifiée.
- **EveryDollar (Ramsey Solutions)** — méthode « zero-based budget » avec
  envelopes, pas de sinking funds explicite.
- **Landing Ankora** (`design-mockup-landing.html`) — section « Le modèle
  enveloppe » : buckets Lissage, Vacances, Imprévus, comparatif marché
  « N comptes · N buckets ».

---

## Révision

Cet ADR sera réévalué si :

1. Un bug récurrent d'invariance est détecté en prod (→ revoir Option A pure).
2. Les utilisateurs demandent massivement du nesting ou des buckets
   cross-comptes (→ itérer sur le modèle).
3. Phase 3 introduit une fonctionnalité qui exige un modèle transactionnel
   différent (ex : prêts entre utilisateurs, double-entry accounting complet).

Tant que ces conditions ne sont pas réunies, la décision tient.

---

## Liens & références

- [ADR-001 — No-PSD2](./ADR-001-no-psd2.md) — dépendance directe (pas de
  comptes bancaires réels).
- [ROADMAP.md — Phase 2](../ROADMAP.md#phase-2--pots-partagés--ia-byok) —
  pots partagés et simulateur bidirectionnel.
- [ARCHITECTURE.md](../ARCHITECTURE.md) — couches, Decimal strict.
- Migration `20260417000004_three_accounts_model.sql` — invariant 3 comptes.
- `src/lib/domain/budget.ts`, `src/lib/domain/provision.ts` — math de
  provisioning existante, à étendre au niveau bucket.
- `design-mockup-landing.html` §« Le modèle enveloppe » — contrat visuel.
- `prompts/PR-2-glossary-and-strategy.md` — glossaire i18n, source de
  vérité pour les traductions `bucket / enveloppe / envelope`.

---

**Décision acceptée le 2026-04-20.** Toute modification requiert un ADR de
supersession (ADR-NNN) qui documente la bascule.
