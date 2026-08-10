# PLAN DE REFONTE ANKORA — v2 (final)

> ## ⚠️ SUPERSEDED — 8 août 2026
>
> Ce document est **remplacé** par
> [`2026-08-08-refonte-app-architecture-cible.md`](./2026-08-08-refonte-app-architecture-cible.md),
> qui s'appuie sur des parcours **mesurés au navigateur** plutôt que sur une
> lecture de code ([l'inventaire](../../audits/2026-08-08-inventaire-parcours-refonte.md)).
>
> Il reste consultable pour son analyse, mais **deux prescriptions y sont
> périmées** et induiraient en erreur :
>
> - `/app/simulator` devait rediriger vers **`/app?simulate=1`** (§4.2, §7). La
>   cible retenue est **`/app`** nu : ouvrir une fenêtre modale en réponse à une
>   demande de page surprend, et câbler un paramètre d'URL vers un tiroir mérite
>   d'être fait une seule fois, délibérément, pour toutes les feuilles.
> - Les dimensions mobiles y sont raisonnées sur **390 × 844**. L'écran utile
>   d'un iPhone 14 fait **664 px** une fois la barre de Safari posée — mesuré.
>   Tout budget de hauteur calculé sur 844 se donne 27 % d'espace inexistant.

**26 juillet 2026.** Version corrigée après trois critiques adversariales. Toutes les affirmations factuelles ci-dessous ont été revérifiées sur le repo à l'instant (chemins et numéros de ligne cités). Ce document est autoportant : il suffit pour exécuter l'étape 1 sans connaître le projet.

**Ce qui a le plus changé par rapport à la v1** : le programme passe de 4 migrations sur le chemin critique à **une seule**, la première PR livre de la valeur visible au lieu du 6ᵉ lot, et le filet e2e passe de « chantier parallèle non planifié » à l'étape 2 bloquante. Détail complet en §9.

---

## 0. GATE 0 — relevé factuel avant la première ligne de code

**Le verrou multi-agent annoncé par la v1 n'existe plus.** Vérifié à l'instant : `git branch --show-current` → `main`, `git status --porcelain` → **vide**. `chore/preflight-hooks` et `chore/repo-cleanup` n'existent plus qu'en remote. La v1 et les critiques qui s'appuyaient dessus (« index non vide sur `.husky/`, `package.json`, `CLAUDE.md` ») sont **périmées**. Aucun blocage.

Reste un GATE 0 réduit, **en lecture seule, 30 minutes, aucune PR**, dont la sortie est collée dans le premier rapport :

| #   | Commande                                                                                                                               | Pourquoi                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `git status --porcelain && git branch --show-current`                                                                                  | Confirmer working dir propre. Si un autre agent tourne → `git worktree add`, jamais partage du dossier.                                                                                                             |
| G2  | `select version();`                                                                                                                    | La syntaxe `on delete set null (colonne)` exige **PG 15+**. Si < 15, la FK composite du chantier P3 est purement et simplement abandonnée (cf. §3.4).                                                               |
| G3  | `select conname, contype from pg_constraint where conrelid = 'public.expenses'::regclass;`                                             | Le nom `expenses_category_id_fkey` est une **hypothèse d'auto-nommage**. Un `drop constraint` sur un nom deviné échoue.                                                                                             |
| G4  | `select count(*) from expenses; select date_trunc('month', occurred_on) m, count(*) from expenses group by 1 order by 1 desc limit 6;` | Deux étapes de la v1 (pagination, perf) étaient priorisées sans un seul chiffre. À < 300 lignes, la pagination par curseur est du gaspillage.                                                                       |
| G5  | `select workspace_id, name, count(*) from categories group by 1,2 having count(*) > 1;`                                                | Il n'existe **aucune** contrainte d'unicité sur `categories(workspace_id, name)` (vérifié : `20260416000001_initial_schema.sql:48-58`). Tout backfill par nom est dangereux tant que ceci n'a pas retourné 0 ligne. |
| G6  | `supabase migration list --linked`                                                                                                     | Les migrations sont poussées **manuellement** (doctrine projet). Rien ne garantit que le schéma prod == `supabase/migrations/`. À vérifier avant de raisonner dessus.                                               |
| G7  | Chronométrage manuel du chargement de `/app/expenses` en prod (DevTools, 3 mesures)                                                    | Sinon l'étape « perf » optimise une douleur non mesurée.                                                                                                                                                            |

**Règle** : si G6 révèle une dérive, **stop** — on réconcilie avant tout. Si G2 retourne < 15, on note l'abandon du chantier P3 et on ne le rouvre jamais « au cas où ».

---

## 1. DIAGNOSTIC — pourquoi les utilisateurs sont perdus

Cinq causes racines, chacune adossée à une preuve de code.

### C1 — La navigation expose le modèle de données, pas les questions de l'utilisateur

`src/components/layout/app-destinations.ts:72-80` déclare 7 destinations de rang **strictement égal** : `cockpit, bills, expenses, simulate, commitments, accounts, settings`. Six noms de tables plus les réglages. Le desktop les rend toutes dans une rangée de `Button variant="ghost"` identiques (`Header.tsx:129`), avec « Paramètres » présent **deux fois** (rangée de nav + menu `AccountButton.tsx:154-163`).

Trois de ces destinations décrivent la même chose — de l'argent qui sort : `charges` (récurrent daté), `commitments` (dette/échéancier), `expenses` (ponctuel). Ce sont les trois plus gros composants du repo. L'utilisateur choisit entre trois portes pour un même geste mental.

### C2 — Rien n'indique où l'on est, et il existe une plage de largeurs sans navigation

`aria-current` n'apparaît qu'à trois endroits (`app-destinations.ts:98`, `BottomTabBar.tsx:174-180`, `ui/breadcrumb.tsx:24`). **La nav desktop ne pose aucun état actif.** Les fils d'Ariane ont été retirés le 19 juillet au motif que « la nav du header marque déjà la page active » — factuellement faux.

Zone morte vérifiée à l'instant :

| Surface         | Classe                                          | Visible            |
| --------------- | ----------------------------------------------- | ------------------ |
| Nav app desktop | `Header.tsx:129` → `hidden … lg:flex`           | ≥ 1024 px          |
| Barre d'onglets | `BottomTabBar.tsx:168` → `md:hidden`            | < 768 px           |
| Hamburger       | `HeaderNav.tsx:369` → `variant === 'marketing'` | jamais dans `/app` |

**Entre 768 et 1023 px, aucune destination du cockpit n'est atteignable.** Seul `AccountButton` (`md:flex`, ligne 114) survit — il donne les réglages et la déconnexion, pas les destinations. Et le logo pointe `href="/"` en dur (`BrandHomeLink.tsx:31`) : il **éjecte hors de l'application**.

### C3 — Le même écran porte quatre noms, et seulement en français

`/app/charges` = « Charges » (header), « Factures » (onglet), « Mes charges » (titre), « Ajouter une charge » (CTA). `/app` = « Tableau de bord » / « Cockpit » / « Mon cockpit ». C'est documenté comme délibéré (`Header.tsx:29-35`). **En anglais la divergence n'existe pas** (`Bills` partout) : le francophone, locale primaire, est le seul à subir le double vocabulaire.

Sur l'argent : `dashboard.situation.flow.resteDisponible` (« Reste disponible ») et `app.expenses.resteAVivreLabel` (« Reste à vivre ») sont **deux grandeurs différentes sous des noms confusables**.

### C4 — Ce qui existe est invisible ; ce qui manque est déjà en base

**« On ne peut pas modifier une dépense » est faux.** `ExpenseEditDrawer.tsx` (217 l.) est monté ligne 337 de `ExpensesClient.tsx`, appelle `updateExpenseAction`, est couvert par 4 blocs de tests. Le déclencheur est un `Pencil` en `text-muted-foreground` collé à une corbeille rouge qui capte l'œil. Défaut d'affordance, pas de code manquant.

**« Il n'y a pas de vraies catégories » est faux aussi.** La table existe depuis le schéma initial, enrichie de `color_token` (contraint à 8 tokens) et `is_system`, et **8 catégories sont semées à chaque inscription** (`20260503000003:42-52`) : Logement, Famille, Taxes, Santé, Abonnements, Assurances, Transport, Autres. `expenses.category_id` existe (`initial_schema.sql:90`), le schéma Zod le porte, `createExpenseAction` l'écrit (`expenses.ts:59`). **Mais l'UI envoie `categoryId: null` en dur** — vérifié : `ExpensesClient.tsx:78` est le seul site de production concerné (les deux autres occurrences sont des fixtures de test).

Pire, en amont : `src/app/[locale]/app/expenses/page.tsx:17-23` mappe les dépenses vers le client **en perdant `categoryId` et `paidFrom`**. Le champ n'atteint même pas le composant.

**Conclusion : ce n'est pas une refonte de modèle, c'est un débranchement à réparer.**

### C5 — Le produit ne dit pas la vérité sur l'argent

`calculerSituationDuMois()` (`src/lib/domain/cockpit/situation-mois.ts:55-95`) calcule `capacite = resteDisponible − budgetVieCourante`, où `budgetVieCourante` est une valeur **saisie à la main** (défaut 500 €). Les dépenses **réelles** n'entrent nulle part. Dépasser son budget de 300 € ne change ni le chiffre ni le statut vert/orange/rouge.

Et le compteur ment plus gravement que ne le disait la v1 : `getExpenses(workspaceId, limit = 50)` (`workspace-snapshot.ts:387-394`) **n'a aucun filtre de mois** — c'est le top 50 de tous les temps. Le total affiché à côté, lui, vient de `snapshot.monthlyExpenses`, borné au mois courant (`workspace-snapshot.ts:229-235`). **La liste et le total ne décrivent pas le même ensemble.**

> **Synthèse.** L'utilisateur est perdu parce que (a) on lui demande de choisir entre trois portes menant au même concept, (b) rien ne lui dit où il est, (c) le même écran change de nom selon d'où il le regarde, (d) ce qui existe est invisible, (e) le chiffre central ne réagit pas à ce qu'il saisit. **Aucun des cinq ne se répare en repeignant l'interface.**

---

## 2. DÉCISIONS D'ARCHITECTURE À TRANCHER — bloc ADR (étape 5)

Doctrine `CLAUDE.md` banned-list §2 : une décision d'architecture ne se prend jamais dans la session qui l'implémente. Douze décisions, chacune avec ma recommandation, l'alternative, et ce qui casse en cas d'erreur.

### D1 — Un axe d'imputation ou deux ? → **ADR-022**

**Reco : un seul axe. `catégorie == enveloppe`. Une dépense s'impute à une et une seule catégorie.** Le split (découper une dépense en N lignes, chacune avec UNE catégorie) est le seul mécanisme de multi-imputation. Les tags restent possibles plus tard, **sans budget, jamais imputables**.

Ce qui casse avec deux axes budgétaires : double comptage garanti, l'utilisateur ne sait plus lequel porte le budget, et `financial-formula-validator` ne peut plus prouver « somme des catégories == total de la période ».

**Vocabulaire** : « catégorie » en surface. « Enveloppe » est un bon modèle de calcul interne et un mauvais mot d'interface.

### D2 — Quelle taxonomie par défaut ? → **ADR-023** _(nouveau — était un « risque » en v1)_

**Le problème** : les 8 catégories seedées sont une taxonomie de **charges fixes**, pas de dépenses. Vérifié dans `20260503000003:45-52` — cinq des huit sont typées `fixed` ou correspondent à des prélèvements. Il manque Courses/Alimentation, Restaurant/Sorties, Loisirs, Shopping : l'écrasante majorité de ce qu'on saisit à la main.

Livrer un sélecteur où l'utilisateur qui note ses courses du samedi n'a que « Autres » revient à confirmer son reproche de départ, cette fois avec du code livré.

**Reco : 8 catégories orientées dépenses courantes, partagées avec les charges** — Courses, Logement, Transport, Santé, Loisirs & sorties, Abonnements, Famille, Autres. `Autres` reste `is_system = true`. Les catégories retirées (Taxes, Assurances) ne sont **pas supprimées** chez les utilisateurs existants : le seed n'est modifié que pour les nouveaux, et une catégorie existante n'est jamais renommée sous les pieds de son propriétaire.

**Cette décision doit être tranchée avant l'étape 6, pas pendant.** C'est la décision produit la plus visible du programme.

### D3 — Libellés et couleurs des catégories → **ADR-024**

**Reco sur le fond** : les catégories système portent un `slug` stable ; le libellé affiché vient de `messages/*.json` ; la couleur vient de `color_token` (déjà contraint à 8 valeurs — le risque « hex libre hors WCAG » est **déjà neutralisé**). Pas de color-picker libre.

**Reco sur le calendrier — corrigée** : cette bascule **n'est pas un prérequis** de la couche catégories. Elle sert un utilisateur anglophone qui n'existe pas encore, et elle exige une migration à backfill risqué (cf. G5). Elle est **déplacée dans la couche lexique (étape 16)**. En attendant, le code lit `slug ?? name`.

**Point à trancher explicitement** : que se passe-t-il quand l'utilisateur renomme une catégorie système ? Soit c'est interdit (`is_system` bloque le renommage), soit c'est autorisé et la catégorie sort du système de traduction **avec un message qui le dit**. Le silence est le pire des trois.

### D4 — Le chiffre souverain, et ce que « dépenses réelles » veut dire → **ADR-025**

**Reco, en trois grandeurs nommées distinctement :**

| Grandeur                                          | Formule                                                         | Rôle                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reste à dépenser** _(souverain, sur l'accueil)_ | `budgetVieCourante − dépensesRéellesMois`                       | Réagit à **chaque** saisie, dans les deux sens. Supprimer une dépense le fait remonter.                                                           |
| **Dépensé à ce jour**                             | somme réelle                                                    | Second rang, dépliable.                                                                                                                           |
| **Capacité d'épargne**                            | `resteDisponible − max(budgetVieCourante, dépensesRéellesMois)` | Figure de planification. Ne bouge qu'au dépassement — **c'est correct** : on ne peut pas mettre de côté un argent qu'on pourrait encore dépenser. |

**Définition normative de « dépenses réelles »**, sans laquelle `financial-formula-validator` ne peut rien prouver :
`paid_from = 'vie_courante'` **ET** `deleted_at is null` **ET** `occurred_on` dans `[début de mois, début du mois suivant[` calculé en **Europe/Brussels**.

Aujourd'hui `page.tsx:42` somme **toutes** les dépenses du mois, tous `paid_from` confondus : une dépense payée depuis l'épargne ampute le budget vie courante alors qu'elle ne le touche pas.

**Doublon charge ↔ dépense** : un utilisateur qui note « Loyer 850 » en dépense alors que le loyer est déjà une charge fixe est compté deux fois. v1.0 : **avertissement UI** au moment de la saisie (« un montant identique existe en charge ce mois-ci — est-ce bien une dépense en plus ? »), pas de lien `charge_id`. Décision tracée.

**Remboursements** : `expenses.amount` porte `check (amount >= 0)` et `expenses` n'a pas de champ `kind`. Position v1.0 assumée : **Ankora ne modélise pas les remboursements**, écrit dans l'ADR et dans la micro-copy des états vides. Ne pas laisser le trou implicite.

**Alternative rejetée** : capacité calculée sur un **projeté fin de mois** (réel extrapolé au rythme observé). Rejetée pour v1.0 — trop bruyant avant le jour 10, et présenter une projection comme un chiffre la rapproche d'une promesse, ce qu'on s'interdit (§7). Une phrase conditionnelle secondaire (« à ce rythme, tu finirais le mois à X € ») reste possible après le jour 10, en option basse priorité.

**Alternative rejetée aussi** — et c'est une critique que j'écarte explicitement : « dériver le budget vie courante de `revenus − charges − provisions − engagements` ». Cette formule **est déjà** `resteDisponible`. Si `budgetVieCourante = resteDisponible`, alors `capacite = 0` par construction et le produit perd son objet. Ce qui est juste dans la critique, c'est que **500 € par défaut est arbitraire** : la correction est de le faire **proposer à l'onboarding** avec `resteDisponible` affiché comme plafond (« il te reste 1 340 € après tes charges — combien gardes-tu pour la vie courante ? »), pas de le dériver.

### D5 — Suppression dure ou réversible ? → **ADR-026**

**Reco : soft delete (`deleted_at`) + toast « Annuler » de 5 s.** `ExpensesClient.tsx:165-176` déclenche aujourd'hui `deleteExpenseAction(id)` **directement au clic**, sans confirmation, sans undo, avec le bouton collé au crayon en 44 px sur mobile. Et `deleteExpenseAction` n'a **aucun test**.

**Correction technique obligatoire dans l'ADR** : le soft delete ne peut pas être garanti au seul niveau applicatif. La policy actuelle est `create policy "expenses_editor_write" on public.expenses for all using (...)` (`20260416000002_rls_policies.sql:76`) — **le DELETE dur reste autorisé** via PostgREST avec la clé anon publique + un JWT de session. L'ADR acte la scission en policies explicites `for select` / `for insert` / `for update`, **sans policy DELETE**, la purge définitive passant par le service role.

**Étape immédiate, avant la migration** (livrée à l'étape 1) : dialog de confirmation nommant la dépense et le montant. Zéro migration, réduit le risque tout de suite.

### D6 — Invariant de solde → **ADR-027**

`accounts.balance` est **déclaratif** (`20260417000004:24`), aucun trigger n'existe sur `expenses`. C'est un choix volontaire mais **non écrit**. À graver : « Ankora est un journal d'enveloppes, pas un grand livre comptable. Les soldes de comptes ne dérivent jamais des dépenses. »

> **⛔ ABANDONNÉ le 2026-08-10. ADR-027 n'a jamais été écrit.** La proposition ci-dessus a été
> tranchée en sens inverse par [ADR-038](../../adr/ADR-038-journal-des-mouvements.md) D6, accepté
> le 2026-08-05 : les soldes **se dérivent** des flux — mouvements, dépenses, paiements de charges
> et d'engagements — et cessent d'être saisis. La ligne est conservée parce qu'elle documente une
> intention antérieure et son abandon ; elle ne doit plus être exécutée. Ordre d'exécution :
> [ADR-040](../../adr/ADR-040-ordre-execution-du-journal.md).

### D7 — Une primitive modale unique → **ADR-028** (amende ADR-020)

`ADR-020` (Accepted) désigne `ui/` comme couche Radix canonique et rejette l'alternative au motif « réécrire Dialog, Form, Select, Sheet, Switch sans Radix = risque a11y MAJEUR ». Or **ces composants ont zéro call-site prod**, pendant qu'il existe **cinq implémentations maison de panneau** avec chacune son focus trap : `SimulatorDrawer` (211 l.), `AjusterResteAVivreDrawer` (306 l.), `ExpenseEditDrawer` (217 l.), `ChargeEditDrawer` (254 l.), `atoms/Drawer` (615 l., démo seule). La prémisse de l'ADR est fausse dans les faits : le risque a11y est déjà là, en cinq exemplaires.

En prime, la règle ESLint censée tenir la frontière (`eslint.config.mjs:21-31`) interdit `@/components/atoms/Button` et `@/components/atoms/Card` — **deux chemins qui n'existent plus**. Garde-fou décoratif.

**Reco** : primitive `Sheet/Drawer` unique, migration des 4 drawers maison, suppression du mort, règle `no-restricted-imports` réécrite. **Exécution à l'étape 11 seulement** — elle a besoin d'un call-site réel pour ne pas être un refactor à vide.

### D8 — Comment restaure-t-on un filet e2e ? → **ADR-029**

**Reco corrigée : Supabase local (`supabase start`) dans le job GitHub Actions.** La v1 recommandait un second projet Supabase gratuit ; c'est le mauvais choix :

- un projet Free **inactif se met en pause au bout de ~7 jours** ; les migrations étant poussées à la main, il **dérive** du schéma de la PR testée ;
- les runners GitHub sont **Linux avec Docker** — l'objection « lourd sous Windows » ne concerne que le poste de @thierry, pas la CI ;
- avec Supabase local, la clé `service_role` est la clé de dev bien connue, **publique et non secrète** : l'objection historique « pas de service_role de prod en CI » disparaît entièrement ;
- le schéma vient des migrations **de la PR**, donc zéro drift.

Le second projet cloud reste utile pour les smoke tests de preview, **pas pour la CI**.

État actuel vérifié : **43 occurrences** de `test.skip` / `test.fixme` dans `e2e/`, dont **2 skips inconditionnels** — `e2e/auth.spec.ts:40` (« forgot-password: always reports success (no enumeration) », c'est-à-dire une **propriété de sécurité**) et `e2e/i18n/locale-switcher.spec.ts:186`.

**Règle d'attente, applicable dès l'étape 1 et jusqu'à la fin de l'étape 2** : chaque PR livre son parcours e2e seedé exécuté en local, avec le **rapport Playwright uploadé en artefact**, pas un copier-coller.

### D9 — Architecture de navigation cible → **ADR-030** _(nouveau)_

La v1 restructurait toute la navigation à l'étape 7 **sans ADR**, en violation directe de la doctrine qu'elle invoquait pour justifier son propre bloc ADR. Corrigé : la structure cible (§4), la règle de gouvernance, le sort de `/app/simulator` et la liste des 5 entrées sont actés en ADR, **avec trace de validation @thierry**, avant toute ligne de code.

### D10 — Amendement `NORTH_STAR` → **ADR-031** — _signature @thierry requise_

`CLAUDE.md` grave « Tout dashboard minimaliste = refus de merge » et liste 8 sections obligatoires, écrites le 23 avril contre une cible « niveau Monarch ». Le retour terrain de juillet — « tout est mélangé, confus » — est une donnée **plus récente et plus fiable** qu'une spec.

**Reformulation proposée** : l'exigence n'est pas « 8 sections », c'est **« aucune question importante sans réponse »**, ce qui se satisfait avec 3 blocs à l'accueil (chiffre souverain + prochains chocs + saisie rapide) et des destinations dédiées pour le reste.

**Sans cet amendement écrit, la refonte se fait contre la constitution du projet.** Décision @thierry, pas décision d'agent.

**Mitigation du risque de gel** (critique retenue) : si @thierry refuse, le programme **ne s'arrête pas**. Les étapes 1, 2, 3, 6, 7, 9 sont indépendantes d'ADR-031. Seules les étapes 8 et 13 (accueil) se replient sur « corriger le calcul sans toucher à la densité ». Le refus coûte deux étapes dégradées, pas le programme.

### D11 — Discipline des migrations → **ADR-032** _(nouveau)_

Quatre règles non négociables, chacune née d'un défaut réel de la v1 :

1. **Ordonnancement `push-avant-merge`.** Pour toute étape à migration : PR migration seule → `supabase db push --linked` → vérification → **puis** PR du code qui en dépend. Motif : `.is('deleted_at', null)` sur une colonne absente renvoie **PostgREST 42703** — il n'existe aucun fallback de lecture, contrairement à `slug ?? name`. Sans cette règle, entre le squash-merge et le push manuel, `getWorkspaceSnapshot` échoue et **les 6 pages de `/app` tombent**, pas seulement les dépenses.
2. **Toute migration est additive et rétrocompatible** avec le code déjà déployé. Colonne nullable uniquement.
3. **Chemin de retour arrière obligatoire** : `supabase db dump --linked -f backup-<date>.sql` archivé hors repo + un `*_down.sql` **testé** en local (`db reset` → up → down → up) **avant** tout push prod. Il n'y a qu'un projet Supabase, en plan Free (pas de PITR), avec un utilisateur réel : la restauration n'est pas un bouton.
4. **Interdits en dur dans `supabase/migrations/**`\*\* :
   - `CREATE INDEX CONCURRENTLY` — le CLI applique chaque migration dans une transaction, c'est interdit dans un bloc transactionnel ;
   - `on delete set null` **sans liste de colonnes** sur une FK composite dont une colonne est `NOT NULL`.

### D12 — Déploiement progressif → **ADR-033** _(nouveau)_

`main` déploie en production. Les deux changements les plus perceptibles du programme — la structure de navigation (étape 10) et la définition du chiffre souverain (étape 13) — partiraient en une fois, sans recours autre qu'un revert à chaud d'une PR de 500 lignes.

**Reco** : deux drapeaux d'environnement Vercel, coût nul, `NEXT_PUBLIC_FLAG_NAV_V2` et `FLAG_COCKPIT_REEL`, activés par @thierry **après** smoke test manuel de la preview, désactivables sans redeploy pour le flag serveur. Décidés en ADR, implémentés dès l'étape 9.

---

## 3. MODÈLE DE DONNÉES CIBLE — dépenses

### 3.1 État actuel vérifié

```sql
-- initial_schema.sql:83-94
create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(12,2) not null check (amount >= 0),
  occurred_on date not null,
  category_id uuid references public.categories(id) on delete set null,  -- FK SIMPLE
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index expenses_workspace_date_idx on public.expenses(workspace_id, occurred_on desc);
-- + paid_from ('principal'|'vie_courante'|'epargne') ajouté par 20260417000004:62-63
```

RLS : `expenses_member_select` en lecture, `expenses_editor_write` **`for all`** en écriture (le trou du D5).

### 3.2 Une seule migration sur le chemin critique

**M1 — étape 12, suppression réversible.** C'est la **seule** migration du programme de refonte.

```sql
-- PR migration (poussée AVANT le merge du code, cf. ADR-032 règle 1)
alter table public.expenses add column if not exists deleted_at timestamptz;
create index if not exists expenses_workspace_date_live_idx
  on public.expenses(workspace_id, occurred_on desc) where deleted_at is null;

-- Scission de la policy fourre-tout : plus aucun DELETE dur via PostgREST
drop policy "expenses_editor_write" on public.expenses;
create policy "expenses_editor_insert" on public.expenses
  for insert with check (public.is_workspace_editor(workspace_id) and created_by = auth.uid());
create policy "expenses_editor_update" on public.expenses
  for update using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));
-- pas de policy DELETE : la purge passe par le service role
```

Fichier `M1_down.sql` fourni et testé : `drop index`, `drop column`, restauration de la policy `for all` à l'identique.

**Aucune autre migration n'est requise par le programme.** La navigation par mois s'appuie sur l'index existant `expenses_workspace_date_idx` ; le compteur exact utilise `count: 'exact'` de PostgREST ; la suggestion de catégorie est **dérivée**, sans table (cf. §3.4).

### 3.3 Contrat d'agrégat — défini **une seule fois**, à l'étape 7

La v1 se contredisait sur `snapshot.monthlyExpenses` : l'étape 5 y ajoutait un group-by, l'étape 10 la remplaçait par une RPC `sum()`, l'étape 13 la mettait en cache. Une somme scalaire ne rend ni le group-by, ni les N dernières lignes, ni le compte.

**Contrat unique, figé à l'étape 7 et jamais rouvert ensuite :**

```ts
// src/lib/data/expenses.ts — accesseur UNIQUE, tout SELECT sur expenses passe par ici
type MonthSummary = {
  total: number;              // Decimal converti au bord RSC
  count: number;              // count: 'exact', jamais dérivé d'une liste
  byCategory: Array<{ categoryId: string | null; total: number; count: number }>;
};
getMonthSummary(workspaceId, year, month): Promise<MonthSummary>
listExpenses(workspaceId, { year, month, limit, cursor? }): Promise<Expense[]>
```

Deux bénéfices : le compteur et le total viennent **de la même source bornée** (fin du mensonge C5), et il n'existe **qu'un seul endroit** où ajouter `.is('deleted_at', null)` à l'étape 12 — ce qui transforme le garde-fou « grep » impossible de la v1 en une invariance structurelle.

### 3.4 Ce que le modèle cible **n'inclut pas** — et pourquoi

| Non retenu                                              | Raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Table `expense_label_rules`**                         | La v1 créait une table (2 policies RLS, `hit_count`, migration, entrée export RGPD, toggle de confidentialité) pour une information **déjà présente dans `expenses`**. Remplacée par une requête dérivée : `select category_id from expenses where workspace_id = ? and lower(btrim(label)) = ? and deleted_at is null order by occurred_on desc limit 1`. Zéro table, zéro migration, zéro donnée nouvelle, zéro toggle. On ne matérialisera une table que le jour où l'utilisateur demande une **règle explicite**, et on assumera le coût RGPD ce jour-là.                                                                                                                                                                                                                                         |
| **Colonne générée `label_normalized` + index**          | Ne sert que la recherche et la mémoire de libellé. La recherche est repoussée (§7-6), la mémoire est dérivée. À G4 < 1 000 lignes, `lower(btrim())` à la volée est instantané.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Pagination par curseur**                              | Deux raisons. (1) Repoussée : à la volumétrie mesurée en G4, `.range()` suffit. (2) Le curseur de la v1 était **faux** : `occurred_on` est un `date` non unique et l'ordre n'a aucun tie-break, donc `.lt('occurred_on', cursor)` **saute silencieusement** toutes les lignes partageant la date frontière. Le jour où elle arrive : curseur composite `(occurred_on, id)`, index `(workspace_id, occurred_on desc, id desc) where deleted_at is null`, et test obligatoire « 30 dépenses le même jour, pagination par 10, union des pages == source, sans doublon ni trou ». Acté dans ADR-032.                                                                                                                                                                                                      |
| **RPC SQL de somme**                                    | Portait la classe de faille la plus grave possible ici (RPC mal scopée contournant RLS) pour un gain non mesuré. Si elle revient : `security invoker`, migration déclarée, `rls-flow-tester` obligatoire.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **FK composite `(category_id, workspace_id)` + `slug`** | **Sorti du chemin critique** → chantier parallèle P3 (§8). Deux raisons. (1) La faille est **théorique** — l'UI n'a jamais écrit `category_id` — et la garde applicative `.eq('workspace_id', ctx.workspaceId)` la referme pour 3 lignes de TypeScript, sans migration. (2) La forme écrite en v1 était **mortelle** : `foreign key (category_id, workspace_id) references categories(id, workspace_id) on delete set null` met à NULL **toutes** les colonnes référençantes, or `expenses.workspace_id` est `not null` (vérifié `initial_schema.sql:85`). Conséquence : supprimer une catégorie devient impossible (erreur 23502) et, plus grave, `executeDeletion()` (`gdpr/deletion.ts:48`, `delete from workspaces`) peut échouer — **la suppression de compte RGPD art. 17 devient impossible**. |
| `envelope_allocations`, `envelope_transfers`            | Refonte de produit, pas de page. Hors v1.0. Rappel pour le jour venu : **un transfert n'est jamais une dépense**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tags`                                                  | Cf. D1. Jamais dans la même couche que les catégories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Pièces jointes / reçus                                  | Supabase Storage = coût. Budget 0 €.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Récurrence de dépense                                   | Déjà modélisée par `charges`. La dupliquer recréerait C1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Trigger de solde                                        | Cf. D6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 4. ARCHITECTURE DE NAVIGATION CIBLE (ADR-030)

### 4.1 La règle de gouvernance, écrite avant la structure

> **Toute nouvelle surface répond à : onglet, accueil, ou « Plus » ?**
> Un onglet ne se mérite que par une fréquence d'usage **hebdomadaire au minimum**. Un item de premier niveau ne s'ajoute qu'en en retirant un.

Ce n'est pas théorique : bunq a **supprimé** son onglet Travel en V5 pour garder le bancaire au centre. Belfius a empilé De Lijn, parking, carburant, titres-services, immobilier, eSIM… et a dû **ajouter un moteur de recherche pour retrouver ses propres fonctions**. Quand on en arrive là, l'architecture de l'information a déjà échoué.

### 4.2 Structure cible — mobile

```
┌──────────────────────────────────────────────┐
│  Accueil   Factures    ( + )   Dépenses  Plus│
└──────────────────────────────────────────────┘
```

| Entrée       | Route           | Contenu                                                                                                                                                       |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accueil**  | `/app`          | Chiffre souverain (reste à dépenser) + prochains chocs + bande « à traiter »                                                                                  |
| **Factures** | `/app/charges`  | Segment interne : _À venir_ / _Engagements_ — absorbe `/app/commitments` **sans aucune fusion de table**                                                      |
| **( + )**    | —               | Feuille d'action : Ajouter une dépense · Ajouter une facture · Marquer une facture payée. Fait tomber « ajouter une dépense » à **1 tap depuis n'importe où** |
| **Dépenses** | `/app/expenses` | Liste du mois, détail éditable                                                                                                                                |
| **Plus**     | feuille         | Comptes · Réglages · Sécurité · RGPD · Aide · Légal · Déconnexion                                                                                             |

**Analyse / statistiques : pas d'onglet.** Icône en haut à droite de l'Accueil — ce que font Revolut et N26, les deux acteurs les plus data-driven. La barre d'onglets sert à **agir**, pas à lire.

**Simulateur : plus d'onglet.** Il a aujourd'hui trois portes aux comportements différents (onglet mobile, header desktop, et un bouton du cockpit qui ouvre `SimulatorDrawer` **en place** sans naviguer, `page.tsx:495-503`). Cible : garder le tiroir contextuel, `/app/simulator` devient une redirection vers `/app?simulate=1`. Libère la place du « + ».

**Réserve honnête sur l'onglet « Dépenses »** (critique retenue) : dans une app 100 % manuelle, une liste chronologique est un journal de ce qu'on vient de taper — valeur faible, fréquence faible. Chez Revolut le flux **est** la valeur parce qu'il arrive tout seul. On garde l'onglet en v1 **mais on l'instrumente** (§6.4) avant de graver la structure ; si la mesure confirme le doute, l'onglet 4 devient « Où va l'argent » (répartition par catégorie du mois, historique en vue interne).

### 4.3 Structure cible — desktop

Même sélection, **breakpoint aligné sur `lg`** pour supprimer la zone morte : `BottomTabBar` passe de `md:hidden` à `lg:hidden`, `AccountButton` de `md:flex` à `lg:flex`. Au-dessus de 1024 px : nav groupée (Suivi / Planification / Compte), doublon « Paramètres » supprimé, `aria-current="page"` sur la destination active.

### 4.4 Règles transverses

1. **Un concept = un mot, dans toutes les locales.** Le libellé vit **dans le registre** `app-destinations.ts` (une clé i18n par destination), consommé par header + onglets + feuille. Le commentaire « labels per-surface on purpose » se retire avec le code : cette doctrine **produit** le symptôme C3.
2. **La chrome dépend de l'état de session, pas du groupe de routes.** `shouldMountBottomTabBar()` (`src/lib/layout/bottom-tab-bar-state.ts`) fait déjà le calcul et a 4 appelants — point d'ancrage pour ramener 5 chromes à 2.
3. **`/admin` n'est plus un cul-de-sac** : `grep "Link|href=" src/app/[locale]/admin/` → zéro. Ajouter un retour vers `/app`.
4. **Le logo ne sort plus de l'app** : `BrandHomeLink.tsx:31` reçoit une prop `homeHref` résolue par le layout.
5. **Pas de recherche interne comme réponse au problème de nav.** Test : _si la retirer rend l'app inutilisable, l'architecture est ratée._

---

## 5. LES ÉTAPES

**Conventions.** 1 étape = 1 branche = 1 PR (sauf mention « 2 PR »). Diff cible ≤ 600 lignes. **Budget : 1 à 2 sessions par étape. Non mergeable à la fin de la 2ᵉ session → découpage obligatoire, jamais prolongation.** « Voie » renvoie au risk tiering projet : LOURDE = `plan-reviewer` + agents QA ciblés + DoD 5 critères ; LÉGÈRE = typecheck + lint + tests + self-review.

**Sélection des agents QA : par ce que le diff touche, jamais par liste figée.** Et **un seul auditeur visuel par diff** (§6.4) — règle appliquée réellement, y compris aux étapes 11 et 17 où la v1 la violait.

**Budget de poids client : +5 Ko gzip max sur la route touchée**, mesuré à la sortie de `next build` avant/après, collé au rapport. Vaut dès l'étape 1.

**Points d'arrêt sûrs** — endroits où le programme peut s'interrompre sans laisser le produit incohérent : **après 3, après 8, après 13, après 17**. Ne jamais entamer 10 sans la disponibilité pour finir 11.

---

### ÉTAPE 1 — Dépenses : filet unitaire, 3 bugs, et affordance réparée _(première valeur visible)_

**Branche** `fix/refonte-01-depenses-filet-affordance` · **Voie LOURDE** (Server Actions) · **~450 l.** · **1-2 sessions**

**Objectif** — Poser le filet de non-régression sur les Server Actions de dépenses, corriger trois bugs réels, et rendre l'édition découvrable — dans la même PR, parce que ce sont les mêmes fichiers et que la valeur ne doit pas attendre le 6ᵉ lot.

**Périmètre**

_Filet (invisible, mais préalable au reste)_

1. `src/lib/actions/__tests__/expenses.test.ts` ne teste **que** `updateExpenseAction`. `createExpenseAction` — le chemin le plus utilisé — et `deleteExpenseAction` — le seul irréversible — n'ont **aucun** test. Écrire une table en miroir exact pour chacun : authz sans session, membership absente, rate-limit, validation Zod, erreur DB, `logAuditEvent()` émis.

_Bugs_

2. **`paid_from` ignoré à la création.** `expense.ts:19` déclare `paidFrom: accountKindSchema.default('vie_courante')` ; l'INSERT de `expenses.ts:53-61` liste `workspace_id, created_by, label, amount, occurred_on, category_id, note` — **`paid_from` absent**. Ça marche par coïncidence (défaut DB). `updateExpenseAction` le gère bien (`:105`). → 1 ligne + test.
3. **Date par défaut en UTC.** `ExpensesClient.tsx:47-49` : `new Date().toISOString().slice(0,10)`, alors que tout le reste de la feature est en Europe/Brussels — `expenses/page.tsx:27-38` le fait explicitement avec un commentaire disant que c'est exprès. En heure d'été belge, entre 00:00 et 02:00 locales, le formulaire pré-remplit **la veille** ; le 1ᵉʳ du mois, la dépense part sur le mois précédent et devient invisible partout, sans signal. → `todayInAnkoraTz()` dans `src/lib/date/tz.ts`, `ANKORA_TIMEZONE` sort de `workspace-snapshot.ts` pour devenir la source unique.
4. **`formatDate` sans `timeZone: 'UTC'`.** `src/lib/i18n/formatters.ts:83-89` formate des valeurs _date-only_ dans le fuseau du runtime, alors que `formatMonth()` juste en dessous (`:105-113`) passe bien `timeZone: 'UTC'` — l'incohérence est **interne au même fichier**. Serveur Vercel en UTC → « 18 juil. » ; navigateur à l'ouest de Greenwich → « 17 juil. » : date fausse d'un jour **et** divergence d'hydratation.

_Affordance (visible)_

5. **La ligne entière devient la cible de tap** et ouvre `ExpenseEditDrawer` (qui existe déjà, monté `ExpensesClient.tsx:337`).
6. **La corbeille sort de la liste** : l'action destructive vit dans le drawer d'édition. Confirmation nommant la dépense et le montant (« Supprimer "Delhaize" — 42,30 € ? »). Zéro migration : c'est l'alternative explicitement prévue par D5 en attendant le soft delete de l'étape 12.

**Critères de sortie vérifiables**

- `createExpenseAction` et `deleteExpenseAction` : ≥ 6 blocs `describe` chacun, miroir de `update`.
- Test `TZ=America/New_York` : `formatDate('2026-07-18', 'en')` rend « Jul 18 » — **et la preuve que ce test échoue** si on retire `timeZone: 'UTC'`.
- Test avec horloge figée au 1ᵉʳ du mois à 00:30 heure belge : le formulaire propose la date du jour **local**.
- Test : `createExpenseAction({ paidFrom: 'epargne' })` écrit bien `paid_from = 'epargne'` (assertion sur le payload de l'INSERT).
- Couverture **par fichier** `src/lib/actions/expenses.ts` ≥ 80 % (seuil ciblé, pas de glob — cf. §6.1).
- **Structurel, pas chronométrique** : un test DOM prouve qu'aucun bouton de suppression n'est atteignable depuis la liste, et qu'un tap sur `[data-testid="expense-row"]` ouvre le drawer.
- Parcours e2e seedé local : créer → éditer → supprimer avec confirmation. **Rapport Playwright uploadé en artefact**, pas collé.
- `next build` : delta de poids de la route `/app/expenses` ≤ +5 Ko gzip.

**Tests** — ~12 blocs unitaires actions, 3 unitaires formatters, 2 composants (date par défaut, ligne tappable), 1 parcours e2e.

**Agents QA** — `plan-reviewer` (avant), `test-quality-auditor`, `financial-formula-validator` (bornes de mois / fuseau), `ui-auditor` (auditeur visuel unique de l'étape), `test-runner`.

**Risques** — Le passage à Europe/Brussels change le défaut du formulaire : vérifier qu'aucun test existant ne dépendait de l'UTC. Le fix `formatDate` change l'affichage pour les runtimes non-UTC : c'est l'intention, à signaler au CHANGELOG.

**Hors périmètre** — Catégories. Soft delete. Refonte du formulaire. Toute modification de nav. `src/lib/domain/expenses/update.ts` (son sort est décidé à l'étape 11).

---

### ÉTAPE 2 — Filet e2e réel en CI _(bloquante pour tout ce qui suit)_

**Branche** `ci/refonte-02-filet-e2e` · **Voie LOURDE** (workflows GHA → PR dédiée obligatoire, banned-list §3) · **~300 l.** · **1-2 sessions**

**Objectif** — Faire qu'un `gh pr checks ✅` veuille dire quelque chose. Aujourd'hui **43 occurrences** de skip/fixme dans `e2e/`, et le trou couvre exactement les surfaces à refondre.

**Périmètre**

- Job GHA `e2e-full` : `supabase start` (runner Linux, Docker présent), application des migrations **de la PR**, seed de deux utilisateurs via la clé service_role **locale** (clé de dev publique, non secrète — ce qui règle définitivement l'objection historique), `npm run e2e`.
- Neutraliser Upstash en environnement de test : implémentation en mémoire de `rateLimit()` derrière un flag `RATE_LIMIT_DRIVER=memory`, sinon `e2e:auth` casse sur un Upstash factice (dette connue).
- `E2E_BASE_URL` + port dédié : `PLAYWRIGHT_BASE_URL` est **ignorée** par la config, et `:3000` est occupé par un autre projet local. Documenter dans `docs/runbooks/e2e.md`.
- `--workers=1` conservé.
- Réactiver les cas `seededUser`-gated et `admin`-gated. Traiter les **2 skips inconditionnels** : `e2e/auth.spec.ts:40` (propriété de sécurité anti-énumération) et `e2e/i18n/locale-switcher.spec.ts:186` — réactiver, ou retirer en l'assumant par écrit. Corriger l'entrée `CHANGELOG.md` du 24 mai qui affirme « 4 scenarios actifs » alors que le n°4 est skippé.
- Limiter le coût : le job complet se déclenche sur les chemins concernés (`src/**`, `supabase/**`, `e2e/**`) ; le job léger existant reste sur tout.

**Critères de sortie vérifiables**

- Nombre de cas e2e **réellement exécutés en CI** relevé avant / après (sortie `--reporter=list`), écart chiffré au rapport.
- **Nouveau critère permanent du DoD** : ce nombre est **jamais décroissant**. Une PR qui le fait baisser sans justification écrite est refusée.
- `grep -rn "test\.skip('" e2e/` → 0 skip **inconditionnel** (les skips conditionnels restent légitimes).
- Consommation de minutes GHA du job mesurée sur 3 exécutions, chiffre au rapport (contrainte budget 0 €).
- Une régression volontaire (casser `createExpenseAction`) fait **échouer** le job — preuve au rapport.

**Tests** — L'étape _est_ le test. Aucun test applicatif nouveau.

**Agents QA** — `plan-reviewer` (workflows GHA), `test-quality-auditor`, `security-auditor` (aucune clé de prod ne doit entrer dans le workflow), `test-runner`.

**Risques** — Temps de boot de la stack locale sur runner (~1-2 min) et consommation de minutes. Si le coût dérape : réduire le déclenchement aux PR touchant `src/lib/actions/**`, `supabase/**`, `e2e/**`.

**Hors périmètre** — Second projet Supabase cloud (rejeté, cf. D8). Toute modification de `src/**` fonctionnelle. `.husky/`, branch protection.

---

### ÉTAPE 3 — RGPD P0 : la suppression de compte doit réellement supprimer

**Branche** `fix/refonte-03-rgpd-deletion` · **Voie LOURDE** · **~400 l.** · **1-2 sessions**

**Objectif** — Refermer le seul blocage réglementaire du projet. La v1 le renvoyait en « chantier parallèle à planifier par @thierry », après avoir écrit qu'il bloque l'ouverture publique — puis planifiait 15 couches d'UI qui n'ont de sens qu'après cette ouverture.

**Périmètre**

1. **`executeDeletion()` n'a aucun appelant.** Vérifié : `grep -rn "executeDeletion" src/` → la définition (`gdpr/deletion.ts:39`) et un commentaire (`require-admin.ts:74`). `requestDeletion()` écrit pourtant `status='pending'` avec `scheduled_for = now + 30 jours`, et l'en-tête du fichier annonce « hard delete after 30-day grace period ». **Rien ne consomme cette file** : `vercel.json` (vérifié intégralement) ne contient **aucune clé `crons`**, aucun `pg_cron`, aucune Edge Function. → route `/api/cron/gdpr-deletion` protégée par secret interne + `crons` dans `vercel.json` (gratuit sur Hobby).
2. **Écrire les tests de `executeDeletion()` AVANT de la brancher.** C'est la fonction la plus destructrice du repo et elle en a zéro. Tests d'intégration sur la stack locale de l'étape 2 : pseudonymisation de `audit_log`, cascade `workspaces`, suppression de l'utilisateur auth, idempotence, échec partiel.
3. **L'export RGPD est déjà incomplet — trou plus large que signalé.** `src/lib/gdpr/export.ts:22-32` énumère **7 tables en dur** : `users, workspaces, charges, expenses, categories, user_consents, audit_log`. Le schéma en compte au moins 13. **Manquent : `accounts`, `commitments`, `charge_payments`, `workspace_settings`, `workspace_members`, `deletion_requests`.** Article 20 non satisfait **aujourd'hui**, indépendamment de toute refonte. → compléter, bumper `schemaVersion` à `'1.1'`, et **ajouter un test qui compare la liste des tables de `public` à la liste exportée** pour que la prochaine table oubliée fasse échouer la CI.
4. `purge_audit_log_older_than_12_months()` (`20260417000002:67`) n'est jamais planifiée → `audit_log` croît indéfiniment. **Même cron**, pas un second.
5. Vérifier l'écart entre ce que promet la politique de confidentialité publique et ce que fait le code. Corriger le texte ou le code, jamais laisser l'écart.
6. Bonus 15 lignes, même classe : `recordCookieConsentAction` (`src/lib/actions/consent.ts:32`) est le **seul** Server Action du repo qui ne passe pas par Zod, alors que la règle projet n°2 l'exige. Un pattern à 36/37 se dégrade ; à 37/37 il se défend.

**Critères de sortie vérifiables**

- `grep -rn "executeDeletion" src/ --include="*.ts" | grep -v "gdpr/deletion.ts"` → ≥ 1 appelant réel.
- Test d'intégration : une demande de suppression datée de 31 jours est effectivement exécutée par la route cron ; une demande de 29 jours ne l'est pas.
- Test de complétude d'export : liste des tables `public` == liste exportée (échoue si on ajoute une table sans l'exporter).
- La route cron refuse un appel sans secret (401), et le secret n'apparaît **jamais** dans une URL ou un log.
- `gdpr-compliance-auditor` : PASS.

**Tests** — Intégration `executeDeletion` (5 cas), intégration route cron (3), complétude d'export (1, structurel), unitaire Zod consent.

**Agents QA** — `plan-reviewer`, `gdpr-compliance-auditor`, `security-auditor`, `rls-flow-tester`, `test-runner`.

**Risques** — **Le plus destructeur du programme.** Une route cron mal protégée ou un `executeDeletion` bogué supprime des comptes. Mitigation : tests d'abord, exécution en `dry-run` loggé pendant 7 jours avant activation réelle (variable d'env), et jamais de déclenchement manuel en prod pendant la PR.

**Hors périmètre** — Toute UI. Le portail de suppression côté utilisateur existe déjà.

---

### ÉTAPE 4 — Hygiène outillage & gouvernance _(2 PR)_

**Branches** `chore/refonte-04a-outillage` puis `chore/refonte-04b-docs` · **04a : voie LOURDE** (touche `package.json` → `plan-reviewer` obligatoire par `CLAUDE.md:198` ; la v1 la classait LÉGÈRE, c'était une violation de sa propre doctrine) · **04a ~150 l., 04b ~200 l. de `git mv`** · **1 session chacune**

#### 4a — Outillage

**Périmètre**

- `package.json:39-40` : `"security:audit": "tsx scripts/security-audit.ts"` et `"security:headers": "tsx scripts/check-security-headers.ts"` pointent vers **deux fichiers inexistants** (vérifié : `scripts/` contient `apply-migrations.mjs`, `build-llms-full.mjs`, `commit-i18n-tooling.ps1`, `e2e-auth.mjs`, `generate-pwa-icons.ts`, `import-coda-charges.ts`, `lint-use-server.mjs`, `preflight-accounts.mjs`). → `security:audit` devient `npm audit --audit-level=high --omit=dev` (aligné sur `ci.yml:57`) ; `security:headers` supprimé. Corriger `CLAUDE.md:331`.
- `git rm scripts/commit-i18n-tooling.ps1` — script one-shot daté, `Set-Location` en dur, `Stop-Process node -Force`, suppression de `.git\index.lock` sans confirmation. Zéro référence.
- `scripts/apply-migrations.mjs` : **d'abord** migrer sa note de contournement DNS Cloudflare vers `docs/runbooks/supabase-migrations.md`, **ensuite** `git rm`. Il importe `pg`, absent de `package.json` : il ne peut plus s'exécuter.
- `npm rm date-fns` — 0 import dans `src/`. **`@hookform/resolvers` est GELÉ, pas supprimé** : `react-hook-form` est encore importé par `src/components/ui/form.tsx:14`, et le sort de cette couche est tranché par ADR-028 (étape 5) puis exécuté à l'étape 11. Supprimer maintenant serait une dépendance vers une étape ultérieure — exactement le défaut que les critiques ont relevé.
- `eslint.config.mjs` : retirer `'design_handoff_ankora_v1/**'` du `globalIgnores` (dossier supprimé) ; garder `'.tmp/**'`. Réécrire la règle `no-restricted-imports` qui interdit `@/components/atoms/Button` et `Card`, **chemins qui n'existent plus** depuis le renommage en `AnkButton`/`AnkCard`.
- `.prettierignore` : `src/app/apple-icon.svg` → `public/apple-icon.svg`.
- Instrumentation `[503-diag]` : 13 occurrences (10 dans `src/lib/auth/require-user.ts`, 3 dans `src/lib/supabase/middleware.ts`), dont un `diagDetails()` qui **sérialise `e.stack` non rédigé**. Le commentaire dit « Remove once Étape 2 has shipped » — fin mai. **Arbitrage @thierry** : 503 résolu → suppression complète ; non résolu → retirer les stacks et passer en niveau `debug`. Ne pas trancher seul.

**Critères de sortie** — `npm run security:audit` s'exécute et retourne un code exploitable · `npm run lint && npm run typecheck && npm run test` → 0 erreur · `npm run build` réussit (la suppression de `date-fns` doit être validée par un **build complet**, pas seulement par un grep : un import dynamique échapperait au grep) · `grep -rn "date-fns" src/ tests/ e2e/` → 0 · `grep -rn "atoms/Button\|atoms/Card" eslint.config.mjs` → 0 · `grep -rn "503-diag" src/` conforme à l'arbitrage.

**Agents QA** — `plan-reviewer` (package.json), `test-runner`.

**Hors périmètre 4a** — `docs/`, `.claude/`, tout `src/**` fonctionnel, les 4 primitives `ui/` (dialog, form, sheet, switch), `src/lib/supabase/client.ts`, `design-playground` (13 fichiers, gatée en prod, `robots: { index: false }`, spec e2e dédiée — c'est l'outil de validation visuelle de l'étape 17), les 3 SVG brand (1,7 Ko, variantes de marque), `JetBrainsMono-Variable.woff2` (déclaré en `@font-face`, consommé via `--font-mono` : **vivant**).

#### 4b — Gouvernance & agents

**Périmètre**

- `.claude/agents/plan-reviewer.md:41` et `spec-translator.md:49` épinglent en dur **`claude-opus-4-8`** (vérifié). Sur Opus 5, le gate obligatoire avant chaque étape démarre par un faux 🔴 ou par un rubber-stamp. → remplacer par « l'exécuteur tourne-t-il sur un Opus, n'importe quelle version, via l'alias `opus` ? Haiku ou Sonnet sur sécurité / architecture / RLS / CSP / migrations / production → REJECT ».
- `.claude/agents/admin-dashboard-auditor.md:15` déclare le trigger `src/app/[locale]/app/admin/**` — **chemin inexistant** (le vrai est `src/app/[locale]/admin/**`). L'agent ne se déclenche jamais et on croit la surface auditée.
- `.claude/agents/financial-formula-validator.md` : ajouter la section **« Dépenses & catégorisation »** avec les 9 invariants du §6.2. Modèle : reste **Opus**.
- `.claude/agents/spec-translator.md:93-107` omet `test-quality-auditor`, `prod-bug-investigator`, `mobile-liquid-glass-auditor` : toute spec qu'il produit sous-prescrit la QA.
- `CLAUDE.md` + `ROADMAP.md` annoncent **16 agents**. Vérifié : `.claude/agents/` en contient **18** (`plan-reviewer` et `spec-translator` manquent des deux inventaires). Corriger. Ajouter la **précédence des auditeurs visuels** (§6.4). Marquer `llm-security-auditor` « 💤 dormant — réactiver à l'introduction d'une dépendance IA » : le conserver, la banned-list §4 interdit de retirer un agent QA sans validation @thierry.
- `docs/ROADMAP.md` : la première ligne non-✅ de la table d'exécution est `PR-2 — Traductions NL/EN/ES/DE`. Un agent lancé demain par @thierry travaillerait sur la traduction du néerlandais. → remplacer par une table **« Couches de refonte »**. Le fichier fait 74 674 octets et empile 5 blocs « Update » avant le sommaire → réécrire en une page d'état + lien vers `docs/_archive/roadmap-log.md`.
- `.claude/commands/pr-next.md`, `pr-start.md`, `pr-audit.md` : lire la nouvelle table. `.claude/commands/README.md` : supprimer la section Installation (référence un dossier disparu).
- Archivage `docs/` : **`git mv` uniquement, zéro suppression**. Vérifié : `docs/` contient **20 fichiers `.md` à la racine**. Liste nominative à déplacer vers `docs/_archive/` : `AUDIT-2026-04.md`, `AUDIT-GITHUB-2026-04.md`, `SETUP-SESSION.md` (qui dit lui-même « Document temporaire… À supprimer »), `audit-console-pr25.md`, `audit-inline-styles-p3.md`, `claude-code-starter.md`, `tailwind-canonical-audit.md`, plus `docs/prs/**`, `docs/handoffs/**`, `docs/audits/2026-04-*` et `2026-05-*`. **Restent nommément à la racine (13)** : `ARCHITECTURE.md`, `CONVENTIONS.md`, `NORTH_STAR.md`, `ROADMAP.md`, `ankora-product-quality-bar-v1.md`, `competitive-landscape.md`, `cowork-handoff-conventions.md`, `design-tokens.md`, `github-workflow.md`, `glossary-howto.md`, `i18n-glossary.md`, `security-audit-log.md`, `testing-strategy.md`.
- `CLAUDE.md` : trancher la convention des composants métier. Le fichier décrit `components/features/ # components métier par feature` — le dossier contient **2 fichiers**, pendant que le métier vit dans `components/dashboard/` (7), `components/commitments/` (1) et des `*Client.tsx` colocalisés. **Reco : colocation par route**, la plus proche de la réalité et la plus idiomatique App Router.

**Critères de sortie vérifiables** _(réécrits — ceux de la v1 étaient inatteignables : « `ls docs/_.md`→ 8 » alors que le périmètre en laisse 13, et «`grep -c "^| "` → 18 » compte les lignes de **tout** le fichier, qui contient plusieurs tables)\*

- La racine `docs/` contient **exactement les 13 fichiers nommés ci-dessus** — vérifié par comparaison de liste, pas par un compte.
- **Test de parité** : un test compare `ls .claude/agents/*.md` à l'inventaire de `CLAUDE.md` et de `ROADMAP.md`, et échoue en cas d'écart. Remplace le `grep -c` cassé et empêche la dérive future.
- `grep -rn "claude-opus-4-8" .claude/` → 0.
- `/pr-next` retourne une étape de refonte, pas `PR-2 Traductions` — sortie collée au rapport.
- `git log --diff-filter=D -- docs/` sur la PR : **aucun** fichier supprimé, uniquement des `R` de rename.
- `grep -rn "docs/prs/\|docs/handoffs/\|docs/audits/2026-0" --include="*.md" .` avant/après : tout lien relatif interne corrigé dans le même commit.

**Agents QA** — `test-runner` (04a et 04b), `plan-reviewer` (04a uniquement).

**Hors périmètre** — Toute modification de `src/**`. Toute **création** de nouvel agent (`information-architecture-auditor` et consorts sont **proposés**, pas créés — décision @thierry). `.husky/`, workflows GHA, branch protection.

---

### ÉTAPE 5 — Bloc ADR : les 12 décisions, **zéro ligne de code**

**Branche** `docs/refonte-05-adr` · **Voie LOURDE** (`plan-reviewer` sur le bloc complet) · **~700 l. de markdown** · **1-2 sessions**

**Objectif** — Écrire les 12 décisions du §2 dans une session distincte de celle qui les implémente (banned-list §2). Sept des douze conditionnent du code livré plus loin ; trois conditionnent un schéma.

**Périmètre — un fichier par décision** : ADR-022 (axe unique) · ADR-023 (**taxonomie par défaut** — la décision produit la plus visible, sortie des « risques » de la v1) · ADR-024 (slug/couleurs + calendrier + sort du renommage d'une catégorie système) · ADR-025 (**chiffre souverain, définition normative de « dépenses réelles », doublon charge↔dépense, position sur les remboursements**) · ADR-026 (soft delete + scission des policies RLS) · ADR-027 (invariant de solde) · ADR-028 (primitive modale, amende ADR-020) · ADR-029 (e2e = Supabase local en CI) · ADR-030 (**architecture de navigation cible** — absente de la v1) · ADR-031 (**amendement NORTH_STAR — signature @thierry**) · ADR-032 (**discipline des migrations** : gate, down.sql, push-avant-merge, interdits) · ADR-033 (**flags de déploiement progressif**).

Dans la même PR, `docs/CONVENTIONS.md` reçoit :

- la liste des **non-suppressions documentées** (3 SVG brand, `design-playground`, `JetBrainsMono-Variable.woff2`, `src/lib/supabase/client.ts`) pour qu'un futur agent ne les reprenne pas comme cibles ;
- la convention unique de tests : colocalisé `src/**/__tests__/`, `tests/` réservé aux suites transverses — aujourd'hui 113 fichiers colocalisés + 15 dans `tests/`, avec chevauchement direct sur `charges` et `expenses`.

**Critères de sortie vérifiables** — 12 fichiers `docs/adr/ADR-0XX-*.md` au format canonique, statut `Accepted` · `plan-reviewer` ✅ APPROVED sur le bloc complet · ADR-023, ADR-030 et ADR-031 portent une trace explicite de validation @thierry (commentaire de PR ou approbation) · `git diff --stat` : **aucun** fichier `src/`, `supabase/`, `messages/` modifié.

**Tests / Agents QA** — Aucun test. `plan-reviewer` (Opus).

**Risques** — Le risque est social : @thierry peut refuser ADR-031. **Le programme ne gèle pas pour autant** (cf. D10) : seules les étapes 8 et 13 se replient. Second risque : @thierry peut refuser la taxonomie d'ADR-023 — c'est précisément pourquoi elle est ici et non en « risque » de l'étape 6, où un refus aurait imposé de rouvrir une migration déjà poussée.

**Hors périmètre** — Absolument tout le code, y compris « juste le petit fix évident pendant qu'on y est ».

---

### ÉTAPE 6 — Catégories dans les Dépenses _(le débranchement réparé, zéro migration)_

**Branche** `feat/refonte-06-categories-depenses` · **Voie LOURDE** (Server Actions) · **~400 l.** · **1-2 sessions**

**Objectif** — Rendre les catégories déjà seedées visibles et sélectionnables, **sans aucune migration**.

**Périmètre**

- **Garde applicative** dans `createExpenseAction` / `updateExpenseAction` : `.eq('workspace_id', ctx.workspaceId)` sur la vérification de catégorie. Trois lignes de TypeScript qui referment la référence croisée inter-workspace — sans le `drop constraint` sur trois tables en production que la v1 plaçait avant toute valeur livrée.
- `src/lib/data/expenses.ts` (nouveau) : l'accesseur unique du §3.3, avec `getCategories(workspaceId)` enveloppé dans `cache()` de React.
- `src/app/[locale]/app/expenses/page.tsx:17-23` : ajouter **`categoryId` ET `paidFrom`** au mapping RSC — piège vérifié, les deux champs sont perdus à la frontière — et au type `RawExpense` (`ExpensesClient.tsx:21`).
- Sélecteur en **chips**, pas en `<select>`. `Autres` (`is_system`) pré-sélectionné par défaut, jamais de choix vide. Retrait de `categoryId: null` (`ExpensesClient.tsx:78`).
- **Suggestion dérivée** dès cette étape (remontée de l'étape 11 de la v1, car c'est le vrai réducteur de friction) : à la saisie d'un libellé déjà utilisé, la dernière catégorie employée est pré-sélectionnée. Requête pure, **zéro table, zéro migration, zéro toggle** — `select category_id from expenses where workspace_id = ? and lower(btrim(label)) = ? order by occurred_on desc limit 1`. Micro-copy : jamais « catégorisation automatique », toujours « suggestion ».
- Badge coloré par ligne (`color_token` → classe Tailwind via table de correspondance côté code, aucun style inline).
- Application d'ADR-023 : ajustement du seed `seed_default_categories()` **pour les nouveaux workspaces uniquement**. Aucune catégorie existante n'est renommée ni supprimée.
- Ajout du namespace i18n `categories.*` en **fr-BE et en**, lu en `slug ?? name` (le slug arrive à l'étape 16).

**Critères de sortie vérifiables**

- `grep -rn "categoryId: null" "src/app/[locale]/app/expenses/"` → 0.
- Test d'intégration (stack locale étape 2) : créer une dépense → `category_id` non nul en base.
- Test d'intégration : un `categoryId` appartenant à un **autre** workspace est rejeté par le Server Action **avant** d'atteindre la base.
- Test : saisir « Delhaize » après l'avoir déjà catégorisé en « Courses » pré-sélectionne « Courses » ; saisir un libellé inconnu pré-sélectionne « Autres ».
- Contraste des 8 badges validé AA en thème clair **et** sombre.
- `i18n-auditor` : PASS, parité des 5 fichiers, 0 résidu FR dans `en`.
- e2e seedé (CI, plus seulement local) : créer une dépense catégorisée → la voir catégorisée dans la liste.
- Poids de la route : ≤ +5 Ko gzip.

**Tests** — Unitaires `getCategories` et suggestion dérivée (casse, espaces, libellé vide, workspace étranger), composant sélecteur (défaut = `Autres`, changement de sélection, suggestion), intégration authz, e2e.

**Agents QA** — `plan-reviewer`, `i18n-auditor`, `ui-auditor` (**auditeur visuel unique**), `test-quality-auditor`, `test-runner`. _Pas de `financial-formula-validator` : aucun agrégat n'est livré ici — c'est délibéré, voir ci-dessous._

**Risques** — Faible depuis que la migration est sortie du périmètre.

**Hors périmètre** — **Aucun total par catégorie.** C'est délibéré : la table `categories` est partagée avec `charges`, et afficher « Logement : 0 € » à un utilisateur qui paie un loyer tracé en charge serait livrer un chiffre faux dans la couche censée restaurer la confiance. Les totaux arrivent à l'étape 7, quand les deux surfaces sont câblées. Également hors périmètre : CRUD des catégories, groupes, budget par catégorie, drag-to-reorder, règles explicites, le scope YNAB complet de `PR-CAT-1`.

---

### ÉTAPE 7 — Catégories sur les charges, totaux, états vides

**Branche** `feat/refonte-07-categories-charges-totaux` · **Voie LOURDE** · **~400 l.** · **1-2 sessions**

**Objectif** — Câbler la seconde surface pour que le total par catégorie dise la vérité, et figer le contrat d'agrégat **une fois pour toutes**.

**Périmètre**

- `ChargesClient.tsx:253` : retrait de `categoryId: null`, champ catégorie dans le formulaire de charge existant, même garde applicative que l'étape 6. Idem `SimulatorClient.tsx:145`.
- **Contrat d'agrégat du §3.3 implémenté et figé** : `getMonthSummary()` retourne `{ total, count, byCategory }` avec `count: 'exact'` de PostgREST. Toutes les lectures de dépenses passent par `src/lib/data/expenses.ts`. `page.tsx` cesse d'appeler `getExpenses()` puis de sommer `snapshot.monthlyExpenses`.
- **Totaux par catégorie**, calculés en Decimal depuis la source complète, jamais depuis une liste plafonnée.
- **États vides pédagogiques** sur les 4 surfaces principales : chacun explique en une phrase ce que la page répond et propose l'action de démarrage. Aujourd'hui celui des dépenses est une phrase grise (`expenses-empty-state`).

**Critères de sortie vérifiables**

- `grep -rn "categoryId: null" src/` → 0 hors fixtures de test.
- Somme des groupes par catégorie == total du mois, à l'euro près, **prouvé par test**.
- Le total inclut les charges du mois : un loyer de 850 € tracé en charge apparaît bien sous « Logement ».
- **Le compteur et le total viennent du même appel** : test qui échoue si l'un est dérivé d'une liste et l'autre de la source.
- Aucun `Decimal` ne traverse la frontière RSC (grep + fixture de test passant des `number`).
- `financial-formula-validator` : invariants 1, 2, 4, 5 du §6.2 prouvés.

**Tests** — Unitaires d'agrégation (catégorie nulle absorbée par `Autres`, catégorie supprimée, `kind = 'income'` jamais additionné aux sorties), unitaires du compteur exact, composants d'états vides, e2e « saisir → voir le groupe bouger ».

**Agents QA** — `plan-reviewer`, `financial-formula-validator`, `i18n-auditor`, `ui-auditor` (**unique**), `test-runner`.

**Risques** — Le contrat d'agrégat est le point de passage obligé de 5 étapes ultérieures. S'il est mal posé ici, les étapes 12, 13 et 14 le rouvrent. C'est pourquoi il est **figé** par ADR et par test, pas par convention.

**Hors périmètre** — Pagination, recherche, RPC SQL, navigation par mois (étape 14). Toute migration.

---

### ÉTAPE 8 — Premier jour : onboarding, budget proposé, checklist

**Branche** `feat/refonte-08-premier-jour` · **Voie LOURDE** · **~450 l.** · **1-2 sessions** · _point d'arrêt sûr après cette étape_

**Objectif** — Réparer les 90 premières secondes. « Les utilisateurs sont perdus » se joue là, sur des écrans vides — et la v1 ne touchait jamais l'onboarding.

**Périmètre**

- `OnboardingWizard.tsx` (265 l.) fait 3 étapes : nom d'espace, revenu mensuel, une charge. Il n'explique pas le modèle enveloppes, ne demande pas le budget vie courante (qui reste au **défaut arbitraire de 500 €**), n'introduit ni catégories ni geste de saisie.
- Nouvelle séquence : revenus → 2-3 charges → **affichage du `resteDisponible` CALCULÉ** (revenus − charges − provisions − engagements) → « il te reste 1 340 € après tes charges fixes. Combien gardes-tu pour la vie courante ? » avec `resteDisponible` comme plafond visible → première dépense saisie dans la foulée.
  _Note : le budget vie courante n'est pas dérivé de cette formule — le dériver rendrait la capacité d'épargne structurellement nulle. Il est **proposé dans son contexte**, ce qui est différent et suffit à faire disparaître le 500 € arbitraire._
- Checklist de démarrage sur l'accueil, qui **disparaît une fois complète**.
- `/onboarding` reçoit une chrome minimale (aujourd'hui : aucune).

**Critères de sortie vérifiables** — Un nouveau compte ne voit **jamais** la valeur 500 € sans l'avoir choisie (test d'intégration sur le signup) · e2e complet du parcours d'inscription jusqu'à la première dépense saisie · la checklist disparaît quand ses 4 items sont faits, et ne réapparaît pas au rechargement · `dashboard-ux-auditor` : PASS sur la Layer 0 narrative.

**Tests** — e2e du premier jour (le cœur de l'étape), composants de checklist, intégration du seed de settings.

**Agents QA** — `plan-reviewer`, `dashboard-ux-auditor` (**auditeur visuel unique** — il garde la Layer 0 narrative et cède l'a11y générique), `i18n-auditor`, `test-runner`.

**Risques** — Modifier l'onboarding touche `handle_new_user()` indirectement. Vérifier qu'aucun compte existant n'est affecté.

**Hors périmètre** — Toute migration. Refonte de l'accueil (étape 13).

---

### ÉTAPE 9 — Navigation : couverture et repérage _(bugs, pas architecture)_

**Branche** `fix/refonte-09-nav-couverture` · **Voie LÉGÈRE** · **~300 l.** · **1 session**

**Objectif** — Qu'à toute largeur d'écran, l'utilisateur puisse naviguer et sache où il est. Ce sont des **bugs** ; les corriger avant la restructuration permet de savoir ensuite ce qui a cassé quoi.

**Périmètre**

- `BottomTabBar.tsx:168` : `md:hidden` → `lg:hidden`. `AccountButton.tsx:114` : `md:flex` → `lg:flex`. Aligner les commentaires et offsets de `Footer.tsx:18,23,38,40`, `ScrollToTop.tsx`, `MoreSheet.tsx:171` — 5 fichiers raisonnent sur `md`.
- État actif : extraire la liste du header dans un Client Component `AppNavLinks` utilisant `usePathname()` + `isDestinationActive`, **ou** lire `x-pathname` (déjà posé par `src/proxy.ts` et consommé par `shouldMountBottomTabBar`). Même traitement dans `MoreSheet.tsx:241-251`.
- `AdminTopbar.tsx:37` : wordmark cliquable + entrée « Retour au cockpit ».
- `BrandHomeLink.tsx:31` : prop `homeHref` résolue par le layout → `/app` si session, `/` sinon.
- **Poser les deux flags d'ADR-033** (`NEXT_PUBLIC_FLAG_NAV_V2`, `FLAG_COCKPIT_REEL`), à `false`, avec leur test de lecture. Aucun comportement ne change encore.

⚠️ **Ne pas toucher `src/proxy.ts`** au-delà de la lecture. `proxy.ts` DOIT poser les headers de requête **avant** `handleI18nRouting` — next-intl fige les headers, toute mutation ultérieure est invisible des Server Components et le nonce CSP devient `undefined`.

**Critères de sortie vérifiables**

- Spec e2e **nouvelle** : pour chaque largeur de 320, 375, 768, 834, 1024, 1440 px, au moins une surface de navigation vers `/app/charges` est visible et cliquable. **C'est le seul garde-fou qui empêche la zone morte de revenir.**
- Pour chacune des 7 destinations : `aria-current="page"` présent **exactement une fois par surface**.
- Depuis `/admin` en 1280 px, un lien de retour vers `/app` est visible sans le bouton « précédent ».
- Connecté, un clic sur le logo depuis `/app/expenses` reste dans l'application.
- Les deux flags sont lisibles côté serveur et client, testés à `true` et `false`.

**Tests** — Spec e2e multi-viewport (le cœur), tests composant `aria-current`, test `BrandHomeLink` avec et sans session, tests de flag.

**Agents QA** — `mobile-ios-auditor` (**auditeur visuel unique** : la barre apparaît désormais sur iPad, safe-area à revérifier), `test-runner`.

**Risques** — Passer la barre à `lg:hidden` la fait apparaître sur iPad, où elle n'était jamais rendue : vérifier les paddings de bas de page qui compensent aujourd'hui à `md` (`Footer.tsx:40`, `ScrollToTop.tsx`). Faible, mais c'est le genre de détail qui produit un chevauchement.

**Hors périmètre** — Toute restructuration des destinations (étape 10). Tout renommage de libellé. Toute modification du registre.

---

### ÉTAPE 10 — Navigation : structure cible _(2 PR, derrière flag)_

**Branches** `feat/refonte-10a-nav-registre` puis `feat/refonte-10b-nav-structure` · **10a LÉGÈRE ~200 l., 10b LOURDE ~350 l.** · **1 session chacune**

**Objectif** — Passer de 7 destinations plates nommées d'après des tables à 5 entrées nommées d'après des intentions, avec la saisie à 1 tap depuis n'importe où. **Découpée en deux** parce que la partie mécanique est réversible et mergeable seule, la partie perceptible ne l'est pas.

#### 10a — Registre (mécanique, sans changement visible)

- Ajouter **une clé de libellé par destination dans le registre**. Aujourd'hui les libellés vivent dans 3 tables parallèles côté consommateurs : c'est la source de C3.
- **Bug vérifié** : `MoreSheet.tsx:74-82`, `SHEET_LABELS` mappe en dur `cockpit/bills/expenses/simulate` sur `'accounts'`, avec un commentaire affirmant « le jour où l'une passe dans la feuille, son libellé y est déjà ». **C'est faux** : elle s'afficherait « Comptes ». TypeScript ne signale rien car le `Record` est complet. → valeurs de repli en `null` typé (comme `TAB_LABELS` le fait déjà, `BottomTabBar.tsx:99-108`), et échec de rendu si une destination `mobilePlacement: 'sheet'` a un libellé `null`.
- `app-destinations.test.ts` : `realRouteSegments()` fait un `readdirSync` de **profondeur 1** — `/app/settings/deletion-status` échappe au contrôle. → descente récursive.

**Critères 10a** — Une seule clé i18n source par destination (`grep`) · le test du registre passe en descente récursive · **aucun changement visuel** : les captures avant/après sont identiques.

#### 10b — Structure à 5 entrées, derrière `NEXT_PUBLIC_FLAG_NAV_V2`

- Bottom-tab à 5 entrées, feuille d'action du « + » (Ajouter une dépense · Ajouter une facture · Marquer une facture payée).
- Regroupement Factures/Engagements par **segment de vue interne**, sans aucune fusion de table.
- `/app/simulator` → redirection vers `/app?simulate=1`.
- `MoreSheet` réorganisé en sections nommées (aujourd'hui 12-13 lignes en 4 sections hétérogènes mélangeant navigation, préférences, légal et déconnexion).
- Suppression du doublon « Paramètres ». Desktop : nav groupée (Suivi / Planification / Compte).

**Critères 10b vérifiables** — La barre contient exactement 5 entrées quand le flag est `true`, et l'ancienne structure quand il est `false` (les deux testées) · depuis n'importe quelle page de `/app/*`, « ajouter une dépense » est à **1 tap**, mesuré par un compte d'interactions DOM, pas par un chronomètre · « Factures » est identique dans le header, l'onglet et le titre de page, en FR **et** en EN · la spec multi-viewport de l'étape 9 reste verte dans les deux états du flag · captures avant/après dans le rapport.

**Agents QA** — `plan-reviewer` (10b), `dashboard-ux-auditor` (**auditeur visuel unique**), `i18n-auditor` (renommages), `test-runner`.

**Risques** — Perception : @thierry voit tout changer d'un coup — d'où le flag et les captures. Second risque, vérifié : les ids `bills` / `simulate` sont **baqués dans des `data-testid`** asservis par `BottomTabBar.test.tsx` et `e2e/mobile-ios/bottom-tab-bar.spec.ts`. **Ne pas les renommer.** (La CI ne masque plus ce piège depuis l'étape 2, mais la règle reste.)

**Hors périmètre** — Toute migration. Toute fusion `charges`/`commitments` en base. Toute refonte visuelle. Recherche interne.

---

### ÉTAPE 11 — Formulaire unifié, à divulgation progressive

**Branche** `feat/refonte-11-form-unifie` · **Voie LOURDE** · **~450 l.** · **1-2 sessions** _(si le périmètre menace 600 l., découper : 11a = formulaire sur la primitive existante, 11b = migration des 3 autres drawers)_

**Objectif** — Un seul formulaire pour créer et éditer, **sans alourdir le geste le plus fréquent de l'app**.

**Correction majeure vs v1** : la v1 faisait passer le formulaire de 3 à 6 champs, en exposant `paid_from` (`principal | vie_courante | epargne`, le jargon d'enveloppe le plus opaque du modèle) dans la saisie quotidienne, puis fixait un critère « < 5 s » incompatible. Sans agrégation bancaire, **la saisie EST le produit** : si elle coûte plus cher, l'utilisateur décroche, un trou de 3 jours devient un backlog, et le backlog ne se rattrape jamais.

**Périmètre**

- Fusion de la saisie inline (`ExpensesClient.tsx:70-96`) et de `ExpenseEditDrawer.tsx` en un composant unique, sur la primitive retenue par ADR-028.
- **Par défaut : 3 champs + 1 catégorie déjà suggérée** (montant, libellé, date, catégorie pré-sélectionnée par la suggestion de l'étape 6). `note` et `paid_from` vivent sous un repli **« Plus de détails »**, jamais obligatoire, dont la valeur par défaut n'est jamais demandée.
- **Réducteurs de friction ajoutés** (absents de la v1) : focus automatique sur le montant ; chips des **5 derniers libellés utilisés** ; bouton **« Enregistrer et ajouter »** (saisie en rafale) ; rattrapage explicite « j'ai des jours de retard » qui pré-remplit les dates.
- Parsing unique du montant. Aujourd'hui : création `Number(amount)` (`:76`), édition `Number(amount.replace(',', '.'))` avec gardes (`ExpenseEditDrawer.tsx:92`) — deux comportements sur la même donnée monétaire. Cible : **virgule décimale fr-BE**, `inputmode="decimal"`, label au-dessus (pas de placeholder qui disparaît).
- **`fieldErrors` affichés inline.** Les Server Actions les renvoient déjà, structurés (`expenses.ts:44-50` et `:87-93`), le type `ActionResult` les transporte, et **aucun des deux composants ne les lit** : les deux se contentent d'un `toast.error(translateError(...))` générique. Les messages granulaires existent (`expense.label.tooLong`, `expense.amount.tooHigh`, `expense.date.format`). Il manque ~15 lignes côté client, plus `aria-describedby` / `aria-invalid`.
- **Avertissement de doublon charge↔dépense** (ADR-025) : montant identique à une charge du mois → question, pas blocage.
- Statuer sur `src/lib/domain/expenses/update.ts` : 27 tests verts sur une règle « pas de date future » **jamais appliquée en production** (`grep` ne retourne que les définitions et le ré-export). Le Server Action valide avec un simple `regex(/^\d{4}-\d{2}-\d{2}$/)` : `9999-12-31` passe en base. **Porter les règles dans Zod (`.refine()`, source unique iso client/serveur, règle projet n°2) et supprimer le module orphelin** — ainsi que `balance.ts` si ses exports restent sans appelant.

**Critères de sortie vérifiables**

- Le formulaire par défaut expose **exactement 4 contrôles** ; `note` et `paid_from` ne sont atteignables qu'après ouverture du repli — asserté dans le DOM.
- Un montant négatif affiche « le montant doit être positif » **sous le champ montant**, pas un toast générique.
- `9999-12-31` est rejeté, avec un test qui **échoue** si on retire le `.refine()`. Idem `2026-02-30`.
- « 12,50 » et « 12.50 » produisent le même montant en base.
- `grep -rn "validateExpenseUpdate" src/` → 0 (ou bien le module est réellement appelé — pas les deux états).
- e2e : créer avec les 6 champs → rouvrir → tous pré-remplis à l'identique ; « Enregistrer et ajouter » enchaîne sans fermer.
- Poids de la route : ≤ +5 Ko gzip.

**Tests** — Composant (repli, erreurs inline, parsing virgule/point, chips de libellés), unitaires schéma (date future, calendrier invalide), e2e parcours + rafale.

**Agents QA** — `plan-reviewer`, `mobile-ios-auditor` (**auditeur visuel unique** : auto-zoom sur input, cible tactile, focus rings — le sujet dominant d'un formulaire mobile), `i18n-auditor`, `test-quality-auditor`, `test-runner`.

**Risques** — La consolidation de la primitive modale touche 4 drawers. Règle d'abandon appliquée : si la 2ᵉ session ne suffit pas, on découpe 11a/11b.

**Hors périmètre** — Soft delete (étape 12). Recherche et filtres. Split d'une dépense en plusieurs catégories.

---

### ÉTAPE 12 — Suppression réversible _(2 PR — migration puis code)_

**Branches** `feat/refonte-12a-migration-soft-delete` puis `feat/refonte-12b-soft-delete` · **Voie LOURDE** · **12a ~120 l. SQL, 12b ~350 l.** · **1 session chacune**

**Objectif** — Rendre la suppression annulable et interdire toute perte par mistap — sans casser l'application pendant la fenêtre de décalage.

**Ordonnancement imposé par ADR-032** : PR 12a mergée → `supabase db push --linked` → `supabase migration list --linked` vérifié → **puis** PR 12b. Sans cette séquence, un `.is('deleted_at', null)` sur une colonne absente renvoie **PostgREST 42703** et fait tomber `getWorkspaceSnapshot`, donc **les 6 pages de `/app`**, pour le seul utilisateur réel en production.

#### 12a — Migration seule

Migration M1 du §3.2 (colonne `deleted_at`, index partiel, scission des policies RLS), **plus `M1_down.sql` testé** en local (`db reset` → up → down → up), **plus** `supabase db dump --linked` archivé hors repo. Aucun code applicatif.

**Critères 12a** — `db reset` → up → down → up passe · la sortie de `supabase db push --linked` est au rapport · `supabase migration list --linked` post-push au rapport · un DELETE dur via PostgREST avec un JWT de session est **refusé** (test d'intégration) · l'application déployée **avant** la migration continue de fonctionner (rétrocompatibilité : colonne nullable, policies équivalentes en lecture/écriture).

#### 12b — Code

- `deleteExpenseAction` passe en `UPDATE … set deleted_at = now()`. Nouvelle `restoreExpenseAction` (avec authz, `rateLimit()`, `logAuditEvent()`).
- Toast « Annuler » de 5 s.
- **Un seul endroit** à modifier grâce à l'accesseur unique de l'étape 7 : `src/lib/data/expenses.ts` ajoute `.is('deleted_at', null)`. Le grep impossible de la v1 (`grep -rn "from('expenses')" | grep -v deleted_at` → vérifié : renvoie **6** même pour du code parfaitement correct, car `.from('expenses')` est sur sa propre ligne dans les 6 occurrences) est remplacé par une **règle ESLint `no-restricted-syntax`** interdisant `.from('expenses')` hors de l'accesseur.
- L'export RGPD exporte les supprimées **avec** leur `deleted_at` (art. 15 : la donnée est détenue tant qu'elle est en base).
- Purge définitive : rétention 30 jours, exécutée par le **cron de l'étape 3** — pas un second cron. _(La v1 déléguait cette purge à un chantier qui n'était dans aucune étape.)_

**Critères 12b vérifiables** — Une dépense supprimée disparaît de la liste, du total du mois, du compteur et du €/jour : **un test pour chacun des quatre** · « Annuler » restaure à l'identique (montant, catégorie, note, date, compte payeur) · la règle ESLint échoue si un nouveau `.from('expenses')` apparaît hors accesseur · `rls-flow-tester` + `security-auditor` : PASS · `gdpr-compliance-auditor` : l'export reste complet · `financial-formula-validator` : invariant 6 du §6.2 prouvé.

**Agents QA** — `plan-reviewer` (12a et 12b), `security-auditor`, `rls-flow-tester`, `financial-formula-validator`, `gdpr-compliance-auditor`, `test-runner`.

**Risques** — Un filtre oublié fait réapparaître une dépense supprimée dans un total : bug d'argent silencieux. Le garde-fou est **structurel** (accesseur unique + ESLint), plus une checklist humaine.

**Hors périmètre** — Soft delete de `charges` et `commitments` (même pattern, couche ultérieure). L'état « masqué / exclu des stats mais compté au solde » à la Revolut : un troisième état complexifie toutes les formules.

---

### ÉTAPE 13 — Cockpit : prévu et réel réconciliés _(derrière flag)_

**Branche** `feat/refonte-13-cockpit-reel` · **Voie LOURDE** (domaine financier) · **~350 l.** · **1-2 sessions** · _point d'arrêt sûr après cette étape_

**Objectif** — Faire réagir le chiffre central du produit à ce que l'utilisateur saisit.

**Périmètre** — Application stricte d'ADR-025 :

- `depensesReellesMois` entre dans `SituationDuMoisInput` (`situation-mois.ts:55-95`), **avec la définition normative** : `paid_from = 'vie_courante'` ET `deleted_at is null` ET mois courant borné Europe/Brussels. _(Aujourd'hui `page.tsx:42` somme toutes les dépenses tous `paid_from` confondus.)_
- **Chiffre souverain = « Reste à dépenser » = `budgetVieCourante − dépensesRéellesMois`**, formulé comme une réponse : « il te reste 412 € à dépenser d'ici le 31 ». Il réagit **dans les deux sens** : sous-dépenser le fait monter, supprimer une dépense aussi.
- « Dépensé à ce jour » et « Budget vie courante » au second rang, dépliables.
- Capacité d'épargne = `resteDisponible − max(budgetVieCourante, dépensesRéellesMois)`, en troisième rang, page de planification.
- Renommage explicite des deux grandeurs quasi homonymes de C3, affichées côte à côte au moins une fois.
- **Grammaire des couleurs** : rouge **uniquement** avec un bouton de réparation adjacent ; jaune snoozable pour le sous-financement ; neutre partout ailleurs. Une app d'éducation budgétaire qui culpabilise perd son utilisateur au 3ᵉ mois.
- Le tout derrière `FLAG_COCKPIT_REEL`, activé par @thierry après smoke test.
- **Message d'explication au premier affichage** de la nouvelle définition : le chiffre de référence de l'utilisateur change, il doit le savoir.

**Critères de sortie vérifiables** _(deux cas nommés — la v1 en avait un seul, auto-contradictoire : « saisir une dépense → voir le hero bouger » alors que `max()` ne bouge pas tant que réel < prévu)_

- **Cas A** : réel 300 € < budget 500 € → « Reste à dépenser » passe de 500 à 200 € ; **capacité d'épargne inchangée** ; statut inchangé.
- **Cas B** : réel 800 € > budget 500 € → « Reste à dépenser » négatif et signalé ; **capacité dégradée de 300 €** ; statut dégradé ; bouton de réparation présent.
- **Cas C** : une dépense `paid_from = 'epargne'` de 200 € **ne change ni** le reste à dépenser **ni** la capacité — test qui échoue si le filtre est retiré.
- Test qui **échoue** si on retire l'entrée `depensesReellesMois` de l'input.
- Le flag à `false` reproduit exactement l'ancien comportement (test de non-régression).
- Aucun rouge sans action de réparation adjacente (`dashboard-ux-auditor`).
- Aucun `Decimal` ne traverse la frontière RSC.

**Tests** — Unitaires domaine (les 3 cas + mois vide + réel == prévu), property-based sur les bornes, composant hero, e2e « saisir une dépense → voir le chiffre bouger ».

**Agents QA** — `plan-reviewer`, `financial-formula-validator` (**le plus critique du programme** : le reste à vivre **est** le produit — aucun raccourci), `dashboard-ux-auditor` (**auditeur visuel unique**), `i18n-auditor` (micro-copy FSMA), `test-runner`.

**Risques** — Un chiffre faux ici détruit le produit. Le flag est le seul retour arrière acceptable ; il est obligatoire. Second risque : si ADR-031 a été refusé, cette étape se limite au calcul, sans toucher à la densité de l'accueil.

**Hors périmètre** — Allocation par enveloppe, transferts, cibles par catégorie, cycle budgétaire calé sur la paie. Tous excellents, tous hors v1.0.

---

### ÉTAPE 14 — Historique : navigation par mois et compteur exact

**Branche** `feat/refonte-14-historique-mois` · **Voie LÉGÈRE** · **~250 l.** · **1 session**

**Objectif** — Faire cesser le mensonge du compteur et rendre les mois passés atteignables. **Rien d'autre.**

_Réduction assumée vs v1 : la v1 investissait ~500 lignes (colonne générée, index partiel, curseur, RPC de somme, `EXPLAIN ANALYZE` en critère) sur la surface la moins utile d'une app sans agrégation — relire un historique qu'on a soi-même tapé. À la volumétrie mesurée en G4, `.range()` suffit. Cf. §3.4 pour ce qui est reporté et à quelle condition._

**Périmètre** — Chevrons `‹ Juillet 2026 ›`, requête bornée `gte/lt` (comme le fait déjà `getWorkspaceSnapshot:233-234`) via l'accesseur unique · compteur serveur exact déjà livré par le contrat d'agrégat de l'étape 7 · filtre par catégorie côté client · pagination `.range()` simple, 50 par page.

**Correction du bug de fond** : `getExpenses(workspaceId, limit = 50)` (`workspace-snapshot.ts:387`) **n'a aucun filtre de mois** — c'est le top 50 de tous les temps, affiché à côté d'un total borné au mois. La liste et le total ne décrivent pas le même ensemble. L'accesseur unique de l'étape 7 le corrige structurellement ; cette étape en expose le résultat.

**Critères de sortie vérifiables** — Avec N dépenses dans le mois, l'écran affiche « N dépenses » et le total du **même** ensemble · la 51ᵉ dépense du mois est atteignable · naviguer vers juin affiche les dépenses de juin, pas un mélange · le mois affiché est calculé en Europe/Brussels · `financial-formula-validator` : le total ne change pas après introduction de la pagination.

**Tests** — Unitaires bornes de mois (janvier→décembre, année bissextile), unitaires pagination (dernière page, page vide), e2e navigation par mois.

**Agents QA** — `financial-formula-validator`, `ui-auditor` (**unique**), `test-runner`.

**Risques** — Faible. Aucune migration, aucun objet de schéma.

**Hors périmètre** — Curseur composite, `label_normalized`, recherche texte, RPC de somme, export CSV, statistiques pivotables. **Condition de réouverture, écrite** : un utilisateur réel dépassant 500 dépenses, ou une lenteur mesurée. Pas avant.

---

### ÉTAPE 15 — Performance et cache

**Branche** `perf/refonte-15-cache` · **Voie LOURDE** · **~300 l.** · **1-2 sessions**

**Objectif** — Tenir la promesse « fluide et performante » avec le meilleur rapport gain/effort du repo.

**Périmètre**

- `src/lib/supabase/server.ts:6` : `createClient()` **n'est pas** enveloppé dans `cache()` de React (vérifié). Sur une requête `/app/expenses` il y a **trois** allers-retours `auth.getUser()` : `middleware.ts:38`, le layout via `requireUser():51`, et `workspace-snapshot.ts:154`. Le commentaire du layout affirme « (cookie-deduped) » — rien ne déduplique.
  **Objectif réaliste : 3 → 2, pas 3 → 1.** Le proxy est une invocation **séparée** du rendu RSC ; `cache()` ne déduplique jamais à travers cette frontière. La v1 posait un critère binaire impossible. Le vrai gain réseau vient de remplacer les `getUser()` du **rendu** par `getClaims()` (vérification locale du JWT asymétrique, zéro aller-retour GoTrue), en gardant `getUser()` côté proxy.
- `getWorkspaceSnapshot()` : trois requêtes séquentielles d'ouverture (`users:158`, `workspace_members:165`) avant le `Promise.all` de 7 (`:188`). → remonter dans le `Promise.all`, envelopper la fonction dans `cache()`.
- **Découpage du snapshot par besoin de route** : `monthlyExpenses` est chargée **sans borne** et transportée sur **les 6 pages** de l'app, y compris celles qui n'affichent aucune dépense. C'est un travail à part entière (~250 l.), budgété **ici** et pas traité comme un corollaire gratuit.
- Rendu statique : **toutes** les routes sont ƒ dynamiques, y compris `/faq`, `/glossaire`, `/legal/*`. Cause explicite dans les warnings de build : `[locale]/layout.tsx:3` importe `cookies()` via `getOptionalUser()` pour un CTA conditionnel. → isoler la partie dépendante de la session sous `<Suspense>` (Cache Components / PPR).
- i18n : `[locale]/layout.tsx:202` passe `messages` **entier** au `NextIntlClientProvider` — 60 à 65 Ko et ~1 000 clés par locale, la copie de la landing et de l'admin voyage jusque `/app/expenses`. → `pick()` sur les namespaces réellement consommés côté client.

**Critères de sortie vérifiables**

- Nombre d'appels `auth.getUser()` par requête `/app/expenses` : **3 → 2**, mesuré par un **client Supabase instrumenté en test d'intégration** (compteur d'appels), pas en production.
- `npm run build` : au moins les pages légales et la FAQ passent en ○ (statique) ou ◐ (PPR).
- Poids JS client de `/app/expenses` : **−10 Ko gzip minimum**, sortie `next build` avant/après.
- **Le nonce CSP reste correct** — contrainte qui a déjà mordu deux fois (`src/proxy.ts:80-92`). Vérification manuelle en preview + `security-auditor`.
- Vercel Speed Insights (déjà branché, `[locale]/layout.tsx:8`) : chiffre avant/après, à comparer à la mesure G7.

**Tests** — Non-régression sur le nonce (Server Component lisant `headers()`), test d'intégration du compteur d'appels, e2e complète verte.

**Agents QA** — `plan-reviewer`, `security-auditor` (**CSP/nonce**), `lighthouse-auditor`, `test-runner`.

**Risques** — **Le nonce CSP.** `cache()` sur `createClient()` et le PPR touchent tous deux au chemin de propagation. `src/proxy.ts` DOIT poser les headers **avant** `handleI18nRouting`. Ne pas réordonner. Vérification manuelle obligatoire.

**Hors périmètre** — Optimisations RLS (`(select auth.uid())`) : chantier P4. Changement de région Supabase. Toute dépendance payante.

---

### ÉTAPE 16 — Lexique FR-BE, micro-copy FSMA, slug i18n

**Branche** `feat/refonte-16-lexique-be` · **Voie LÉGÈRE** · **~300 l.** · **1-2 sessions**

**Objectif** — Parler la langue de l'utilisateur belge et verrouiller le positionnement réglementaire dans les mots. **C'est aussi ici qu'atterrit le `slug` i18n des catégories** (ADR-024), déplacé depuis le chemin critique.

**Périmètre** — Passe complète sur `messages/fr-BE.json` et `en.json` via le skill `i18n-translator`.

**À employer** : compte à vue, extrait de compte, solde, **rentrées et dépenses** (pas « revenus/charges »), ordre permanent, domiciliation, bénéficiaire, créancier, mandat, **communication** (le champ libre d'un virement belge ne s'appelle ni « libellé » ni « référence »), IBAN, **frais exceptionnels**, dépenses quotidiennes, dépenses occasionnelles, imprévus, réserve financière, provision, mettre de côté, affecter, répartir, couvrir, échéance, lisser, reste à vivre.

**À bannir** : placer, investir, rendement, produit, opportunité, rentabilité, « vous devriez », « nous recommandons », toute allocation recommandée, toute projection présentée comme une promesse. Et **tout vocabulaire suggérant un mouvement d'argent réel** (« transférer vers l'enveloppe ») : les enveloppes d'Ankora sont comptables et virtuelles ; le contraire serait potentiellement une revendication de service de paiement.

**Périmètre de vérification élargi** (critique retenue) : la passe ne couvre pas seulement `messages/*.json` mais aussi **les libellés de sortie du simulateur et du hero**. « Vous atteindrez X en Y mois » est exactement le point où une projection d'organisation glisse vers une promesse de résultat — et c'est le seul écran que la v1 laissait hors de son contrôle lexical. Grammaire imposée : hypothèse conditionnelle explicite, pas de futur affirmatif, mention visible « estimation basée sur tes chiffres actuels, pas une prévision ».

**Slug i18n des catégories** : ajout de la colonne `slug` (nullable, contrainte de format), index unique partiel, et **backfill restreint** — matcher le triplet exact du seed `(name, color_token, kind)` de `20260503000003` **ET** `created_by = owner du workspace`, avec déduplication par `min(id)` sur `(workspace_id, name)`. G5 doit avoir retourné 0 ligne. Un utilisateur ayant créé sa propre « Transport » ne voit **pas** son libellé remplacé par une clé i18n. Migration soumise à ADR-032 (dump, down.sql, push-avant-merge).

**Format monétaire** : `1 234,56 €` — virgule décimale, espace insécable pour les milliers, symbole **après** le montant précédé d'une espace insécable.

**Ajouts de contenu, coût quasi nul, gain de confiance élevé** : promesse négative anti-fraude dans le registre Febelfin (« Ankora ne vous demandera jamais votre mot de passe, ni par e-mail ni par téléphone ») · panneau « ce que nous ne faisons pas » (pas de conseil en placement, pas d'agrégation bancaire, pas de revente de données, **aucune commission ni affiliation sur un produit financier**) · page `/accessibilite` publique et honnête, déclarant la conformité **partielle** (l'aveu est lui-même un signal de crédibilité).

**Critères de sortie vérifiables** — `i18n-auditor` PASS, parité des 5 fichiers, 0 résidu FR dans `en` · test unitaire : `formatMoney(1234.56, 'fr-BE')` → `1 234,56 €` avec espaces insécables **vérifiés au codepoint** (U+00A0) · `grep -iE "placer|investir|rendement|nous recommandons|vous devriez" messages/fr-BE.json` → 0 · les libellés du simulateur ne contiennent aucun futur affirmatif (test sur les clés concernées) · `/accessibilite` existe, est indexable, est liée depuis le footer · basculer FR→EN change les 8 libellés système et **ne change pas** ceux créés par l'utilisateur.

**Tests** — Parité i18n (`tests/i18n/messages-parity.test.ts`, déjà en place), formatters monétaires fr-BE, SEO de la nouvelle page, migration idempotente (rejouée deux fois).

**Agents QA** — `i18n-auditor`, `seo-geo-auditor` (nouvelle page publique), `gdpr-compliance-auditor` (panneau « ce que nous ne faisons pas »), `test-runner`. `plan-reviewer` sur la partie migration.

**Risques** — Le backfill de slug. Mitigation : G5 vert, matching par triplet, déduplication, et un utilisateur ayant renommé une catégorie système la voit rester en texte libre (comportement souhaité, **documenté**).

**Hors périmètre** — Les 3 locales post-launch (nl-BE, de-DE, es-ES) : dette tracée, passe dédiée avant activation. Toute nouvelle page marketing.

---

### ÉTAPE 17 — Polish visuel : la grammaire, pas les valeurs

**Branche** `feat/refonte-17-visuel` · **Voie LÉGÈRE** · **~400 l.** · **1-2 sessions** · _point d'arrêt final_

**Objectif** — Livrer la qualité d'exécution « style Revolut » **sur une architecture déjà correcte**, jamais avant.

**Périmètre** — Grammaire, pas valeurs : profondeur par **luminance de surface**, pas par ombre portée (signature Revolut) · rayons plein (`9999px`) pour boutons/pills/badges, 20 px cartes, 12 px inputs · hauteurs boutons ≥ 48 px, inputs 56 px, pills ≥ 44 px · accents saturés **réservés aux illustrations**, jamais en fond de bouton · chiffres en **tabular figures**, hiérarchie brutale sur le chiffre souverain · espacement de base 4 px.

**Ce qu'on ne copie pas, et pourquoi (à écrire dans le rapport)** :

- **Noir pur `#000000` en canvas global** : fragilise le contraste des surfaces glass (le contrat exige AA dans l'état translucide **et** le fallback opaque) et coûte cher en `backdrop-filter` sur WebKit iOS.
- **Aeonik Pro** : police commerciale sous licence, hors budget 0 €. Rester sur Inter/Geist, compenser par l'interlettrage négatif aux grandes tailles.
- **L'échelle typographique marketing** (display 80-136 px, `line-height: 1.0`) : un cockpit mobile dense n'a rien à faire avec des titres de 80 px. On reprend la hiérarchie et le contraste de graisse, pas l'échelle.

**Critères de sortie vérifiables** — `mobile-liquid-glass-auditor` PASS (contraste AA dans l'état glass **et** le fallback opaque, `prefers-reduced-transparency` et `prefers-reduced-motion` respectés, pas d'empilement de `backdrop-filter`) · Lighthouse ≥ 95 perf, 100 a11y/BP/SEO · **aucune régression du plancher de support navigateur** : chaque fonctionnalité récente (`backdrop-filter`, container queries, view transitions) a un fallback opaque testé · `grep` : 0 hex arbitraire hors `globals.css`, tout passe par les tokens `@theme` · captures de non-régression sur `design-playground` (la vitrine des 11 atoms **est** l'outil de validation de cette étape).

**Agents QA** — `mobile-liquid-glass-auditor` (**auditeur visuel unique** — il est le seul juge du contrat glass ; `ui-auditor` et `mobile-ios-auditor` **ne sont pas convoqués**, contrairement à la v1 qui en alignait quatre en violation de sa propre règle), `lighthouse-auditor`, `test-runner`.

**Risques** — Tentation de repeindre au lieu de finir. Cette étape est **délibérément la dernière**.

**Hors périmètre** — Toute modification fonctionnelle. Toute nouvelle dépendance (lib d'animation, de graphes, icônothèque sous licence). Toute imitation d'un établissement bancaire (§7).

---

## 6. STRATÉGIE DE TEST

### 6.1 Répartition par niveau

| Niveau                                | Périmètre                                           | Seuil                                                          | Outil                    |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- | ------------------------ |
| Unitaire domaine                      | `src/lib/domain/**`, `src/lib/schemas/**`           | **maintenu** 90 % lignes+fonctions / 85 % branches             | Vitest                   |
| Property-based                        | formules financières (bornes, arrondis, invariants) | 0 contre-exemple                                               | Vitest                   |
| **Unitaire actions & data — NOUVEAU** | fichier par fichier, jamais en glob                 | `expenses.ts` ≥ 80 % dès l'étape 1, élargi fichier par fichier | Vitest                   |
| Composant                             | `*Client.tsx`, drawers, sélecteurs                  | 1 test par comportement livré                                  | Vitest + Testing Library |
| e2e                                   | 1 parcours bout-en-bout par étape                   | 100 % pass **en CI** dès l'étape 2                             | Playwright               |
| Agent QA                              | cf. §6.4                                            | verdict explicite au rapport                                   | `.claude/agents/`        |

**Sur le seuil « actions »** : `vitest.config.ts:19` limite aujourd'hui `coverage.include` à `src/lib/domain/**`, `src/lib/schemas/**` et `formatters.ts`. Le 98,87 % affiché est honnête mais **partiel** : `src/lib/actions/` (37 Server Actions, où vivent l'authz, le rate limiting et l'audit) n'est **pas mesuré du tout**.

Un plancher **glob** à 60 % sur `src/lib/actions/**` échouerait dès l'étape 1, parce que 5 fichiers du dossier (accounts, consent, locale, onboarding, settings) n'ont **aucun** test — et le réflexe prévisible serait de baisser le seuil à une valeur cosmétique, tuant le garde-fou pour les 16 étapes suivantes. D'où des **seuils par fichier**, ajoutés au fil des couches.

### 6.2 Comment on prouve que les formules financières sont justes

`financial-formula-validator` (Opus, à conserver en Opus pendant tout le programme) est aujourd'hui **aveugle au périmètre dépenses** : il ne connaît que charges, provisions et cockpit. L'étape 4b l'étend, **avant** l'étape 6.

Invariants encodés, chacun avec un test qui **peut échouer** :

1. **Somme des catégories == total de la période.** La catégorie `Autres` (`is_system`) absorbe le null.
2. **Une catégorie supprimée ou renommée ne change aucun montant historique.**
3. **Bornes de période inclusives-exclusives explicites** sur `occurred_on` (`gte startOfMonth`, `lt startOfNextMonth`), en **Europe/Brussels**, jamais en UTC.
4. **`kind = 'income'` n'est jamais additionné aux sorties.**
5. **Un total d'argent se somme depuis la source complète**, et **le compteur vient de la même source que le total**.
6. **Les dépenses `deleted_at is not null` sont exclues** de tous les totaux, du compteur, de la barre de progression et du €/jour.
7. **`paid_from = 'epargne'` ne décrémente pas le budget vie courante** — tranché par ADR-025, plus « renvoyé à un ADR qui n'existe pas » comme en v1.
8. **Decimal.js sur tout agrégat**, et **Decimal ne traverse jamais la frontière RSC** (passer `number`, envelopper `money()` côté client ; les fixtures doivent passer des `number`, un Decimal masque le crash).
9. **Aucun arrondi intermédiaire** : arrondi uniquement au rendu.

### 6.3 Preuve de mutation, obligatoire à chaque étape

Chaque rapport de PR contient la preuve qu'**au moins un nouveau test échoue** si on casse volontairement le comportement livré (mutation manuelle documentée : quelle ligne modifiée, quel test rouge). `test-quality-auditor` répond à « ces tests auraient-ils attrapé le bug ? », pas à « y a-t-il des tests ? ».

### 6.4 Précédence des auditeurs visuels — **appliquée réellement**

Quatre agents se recoupent sur le contraste et les cibles tactiles. Les invoquer tous quadruple le coût et produit des seuils contradictoires. Précédence gravée dans `CLAUDE.md` à l'étape 4b :

- `mobile-liquid-glass-auditor` — **seul juge** du contrat glass (contraste translucide + fallback opaque, `prefers-reduced-transparency`, anti-stacking, perf `backdrop-filter`).
- `ui-auditor` — cède ces points, garde WCAG générique + sémantique + tokens.
- `mobile-ios-auditor` — strictement les quirks WebKit (safe-area, `100dvh`, ITP, auto-zoom inputs).
- `dashboard-ux-auditor` — garde la Layer 0 narrative, renonce à sa checklist a11y générique.

**Règle : un seul auditeur visuel par diff.** Vérifiable — chaque étape de ce plan en nomme **exactement un**. C'est la différence avec la v1, qui gravait la règle puis en convoquait trois à l'étape 8 et quatre à l'étape 15.

### 6.5 Mesure produit — dérivée, sans nouvelle table

Le symptôme de départ est « les utilisateurs sont perdus » ; sans mesure d'usage, personne ne pourra dire à la fin si la confusion a été réparée, et aucune couche inutile ne pourra être coupée en cours de route.

**Quatre indicateurs, tous dérivables des données existantes — zéro table, zéro surface RGPD nouvelle :**

1. dépenses saisies par semaine (`expenses.created_at`) ;
2. délai depuis la dernière saisie (**l'indicateur de décrochage, risque de mort n°1**) ;
3. part des dépenses catégorisées **hors** « Autres » ;
4. profondeur de saisie : part des dépenses avec `note` ou `paid_from` explicite.

Livrés comme une vue read-only de l'admin panel à l'étape 7. **Le 5ᵉ indicateur souhaitable (destinations visitées) exigerait une table d'événements : il est écarté.** Le doute sur l'onglet « Dépenses » (§4.2) se tranchera à l'indicateur 1 croisé au 3.

**Point de contrôle humain** : @thierry utilise l'app **7 jours consécutifs** aux deux premiers points d'arrêt sûrs (après 3, après 8) avant que la couche suivante démarre. Sans ce point, le programme est une exécution à l'aveugle.

---

## 7. CE QU'ON NE FAIT PAS

### Tentations techniques

1. **Rejouer un nettoyage déjà fait.** `.gitignore` couvre déjà l'intégralité des artefacts. Rien à ajouter côté déchets.
2. **Supprimer `ui/dialog`, `ui/form`, `ui/sheet`, `ui/switch` en douce.** 0 call-site prod, mais `ADR-020` les désigne comme canoniques. Décision explicite en ADR-028, pas suppression silencieuse. Sans arbitrage : les garder.
3. **Supprimer `design-playground`, les 3 SVG brand ou `JetBrainsMono-Variable.woff2`.** Documenté en non-suppression (étape 5).
4. **`npm audit fix --force`.** Rétrograde Next vers la 9. Overrides ciblés en PR dédiée, jamais autre chose.
5. **Toucher `src/proxy.ts`, `.husky/`, les workflows GHA ou la branch protection dans une PR de couche.** Banned-list §3. (L'étape 2 touche GHA — c'est **sa** PR dédiée, avec `plan-reviewer`.)
6. **Renommer les ids `bills` / `simulate`** du registre : baqués dans des `data-testid` asservis par deux suites.
7. **Fusionner `charges` et `commitments` en base.** Le regroupement d'IA est réversible ; la fusion de tables ne l'est pas.
8. **Mélanger transferts et dépenses dans la même table** le jour où les enveloppes arrivent.
9. **Sommer un total depuis une liste plafonnée**, ou dériver un compteur d'une source différente du total.
10. **`CREATE INDEX CONCURRENTLY` dans une migration**, ni `on delete set null` sans liste de colonnes sur une FK composite. ADR-032.
11. **Merger du code qui lit une colonne avant que la migration soit poussée.** ADR-032 règle 1.

### Tentations produit

12. **Copier l'architecture de l'information de Revolut.** @thierry demande « style Revolut » : lui livrer l'**esthétique** et lui **refuser** l'**architecture**. La liste chronologique en écran principal et le donut de catégories supposent un flux automatique. Sans PSD2, ce sont des coquilles remplies à la main pour un résultat **inférieur** à ce que BNP Paribas Fortis ou KBC donnent déjà gratuitement. **C'est le seul scénario où Ankora meurt** — et c'est exactement la trajectoire de la page Dépenses actuelle : un relevé bancaire en moins bien. **À valider explicitement avec @thierry**, car c'est une divergence assumée par rapport à sa formulation.
13. **Devenir une super-app.** L'erreur centrale de Belfius, littéralement le symptôme dont se plaint @thierry.
14. **Ajouter une recherche interne pour réparer la navigation.** Quand on ajoute un moteur de recherche pour retrouver ses propres écrans, l'architecture a déjà échoué.
15. **Importer 60 catégories par défaut.** Monarch peut se le permettre : ses transactions arrivent déjà catégorisées. En saisie manuelle, 60 est un mur. 8 est déjà la limite haute.
16. **Livrer les tags dans la même couche que les catégories.**
17. **Copier le zéro-based dur de YNAB.** Ankora **montre** le non-affecté, ne **bloque** jamais. Bloquer, c'est garantir que l'utilisateur arrête de saisir, donc que les données deviennent fausses.
18. **Fonder le design émotionnel sur le rouge.** Le rouge permanent fait basculer de « j'ai dépassé ce mois-ci » à « je suis mauvais avec l'argent », et le mécanisme de défense est la désinstallation.
19. **Un dashboard personnalisable par widgets.** Demander à un utilisateur perdu de concevoir l'écran qui devait le guider est une abdication de design.
20. **Alourdir la saisie.** Tout champ ajouté au chemin par défaut doit être justifié par écrit. La divulgation progressive est la règle, pas l'exception.

### Lignes rouges réglementaires et budgétaires

21. **Tout ce qui approche l'investissement** : portefeuille, patrimoine net, comparaison de rendements, nomination d'un produit, affiliation, commission. La position d'Ankora est solide **précisément parce qu'elle ne porte sur aucun instrument financier**. Sécurité structurelle tant qu'on n'y touche pas, perdue le jour où une carte « faites fructifier votre réserve » apparaît.
22. **Suggérer un agrément.** Pas de logos de banques, pas de « sécurisé comme une banque », pas d'allusion BNB ou FSMA, pas de badge de conformité non audité.
23. **Un vocabulaire de mouvement d'argent réel.** Les enveloppes d'Ankora sont **comptables et virtuelles**. « Affecter », « répartir », « prévoir » — jamais « transférer vers l'enveloppe ».
24. **Promettre de l'auto-catégorisation.** L'équivalent honnête est la suggestion **locale** dérivée. Aucun service tiers d'enrichissement marchand.
25. **Un assistant IA génératif sur les finances.** Coût récurrent incompatible avec le budget 0 € ; surface OWASP LLM ; et surtout risque FSMA — un modèle génératif qui conseille sur des finances personnelles **peut produire une phrase de conseil en placement, et c'est Ankora qui en répondra**. Si cette voie s'ouvre : ADR dédié, session séparée, BYOK uniquement.
26. **Toute dépendance payante** : agrégateur PSD2, API de catégorisation, lib de graphes ou d'animation sous licence, police Aeonik Pro, analytics propriétaire, LLM hébergé. À assumer publiquement : **le 0 € permanent est une conséquence directe de l'absence de PSD2** — ce qui rend la gratuité crédible plutôt que suspecte.

### Tentations de process

27. **Traiter les corpus marché comme un cahier des charges.** Ce sont des hypothèses sourcées. Elles passent par `spec-translator` puis `plan-reviewer`.
28. **Étendre le scope en cours de PR.** Banned-list §1.
29. **Désactiver un agent QA parce qu'il échoue.** Banned-list §4.
30. **Prolonger une étape au-delà de 2 sessions.** Découpage obligatoire.
31. **Déclarer une étape DONE sur un `gh pr checks ✅`.** Cf. §10.

---

## 8. CHANTIERS PARALLÈLES — hors chemin critique

Exécutables en **worktree séparé** (`git worktree add`), jamais dans le même working dir.

| #      | Chantier                                                                                                                                                                                                                                                                                                                | Urgence                                                   | Note                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | ~~RGPD `executeDeletion()`~~                                                                                                                                                                                                                                                                                            | —                                                         | **Promu étape 3.** C'était le seul P0 réglementaire, renvoyé par la v1 hors du plan qu'elle organisait.                                                                                                                                                                                                                                                                                                                 |
| **P2** | ~~Filet e2e CI~~                                                                                                                                                                                                                                                                                                        | —                                                         | **Promu étape 2.**                                                                                                                                                                                                                                                                                                                                                                                                      |
| **P3** | **Intégrité catégories** : clé composite `categories(id, workspace_id)`, FK composites sur `expenses`/`charges`/`commitments` en **`on delete set null (category_id)`** (PG 15+ requis, cf. G2), index `workspace_members(user_id, joined_at)` **sans `CONCURRENTLY`**, dans une **migration séparée** de celle des FK. | Basse — la garde applicative de l'étape 6 referme le trou | Une migration par table, jamais trois `drop`+`add` dans un fichier. Tests obligatoires **avant** push : (a) supprimer une catégorie ayant N dépenses → succès, `category_id` NULL, `workspace_id` **intact**, montants inchangés ; (b) **supprimer un workspace complet** (chemin `executeDeletion`) sur `supabase db reset`. Si G2 retourne < 15 : chantier **abandonné définitivement**, la garde applicative suffit. |
| **P4** | **Perf RLS** : `is_workspace_member(ws_id)` est appelée avec un argument **dépendant de la ligne** (`using (public.is_workspace_member(workspace_id))`), donc Postgres ne peut pas hisser l'appel en InitPlan : 10 000 lignes = 10 000 exécutions. Mitigation : `(select auth.uid())` à l'intérieur des fonctions.      | Basse aujourd'hui, chère plus tard                        | Migration + RLS = voie lourde, PR dédiée, `plan-reviewer`. **Ne jamais mélanger à une PR de refonte UI.**                                                                                                                                                                                                                                                                                                               |
| **P5** | **Dette npm** : 14 vulnérabilités (13 high, 1 low), **toutes transitives et hors runtime** (minimatch/brace-expansion via eslint, chrome-launcher/rimraf/glob via `@lhci/cli`, esbuild). Zéro vuln sur une dépendance de runtime.                                                                                       | Basse                                                     | Fix = `overrides` npm ciblés en PR dédiée. Ne bloque rien.                                                                                                                                                                                                                                                                                                                                                              |

---

## 9. ORDRE ET DÉPENDANCES

```
GATE 0 ──► 1 Dépenses (VALEUR) ──► 2 Filet e2e ──► 3 RGPD P0 ──[ARRÊT SÛR]──►
4 Hygiène+Gouvernance (4a,4b) ──► 5 Bloc ADR ──┬──► 6 Catégories dépenses ──► 7 Catégories charges + contrat d'agrégat ──► 8 Premier jour ──[ARRÊT SÛR]
                                               │
                                               └──► 9 Nav couverture + flags ──► 10 Nav structure (10a,10b) ──► 11 Formulaire
                                                                                                                     │
                                                    12 Soft delete (12a,12b) ◄───────────────────────────────────────┘
                                                                    │
                                                                    ▼
                                                    13 Cockpit réel ──[ARRÊT SÛR]──► 14 Historique ──► 15 Perf ──► 16 Lexique ──► 17 Visuel
```

**Justification, arête par arête** — et cette fois l'affirmation « aucune étape ne dépend d'une étape ultérieure » est **vraie**, chaque dépendance inverse de la v1 ayant été supprimée nommément (§10) :

- **1 en premier** : valeur visible en session 1. Son filet est unitaire (Vitest, aucun Supabase requis) donc n'attend pas l'étape 2 ; son risque est borné par une couverture ≥ 80 % sur le seul fichier touché.
- **2 avant tout le reste** : sans filet e2e réel, `gh pr checks ✅` ne prouve rien sur 15 étapes qui touchent la production.
- **3 juste après 2** : `executeDeletion()` a besoin de tests d'intégration contre une vraie base — donc de l'étape 2. Et c'est le seul blocage légal.
- **4 avant 5** : `plan-reviewer` doit valider le bloc ADR **après** que son gate `claude-opus-4-8` soit corrigé, sinon le premier plan démarre par un faux 🔴 ou un rubber-stamp. Et `financial-formula-validator` doit connaître le périmètre dépenses avant qu'on lui demande de valider une formule de dépenses.
- **5 avant tout code de refonte** : banned-list §2. Dix des douze décisions conditionnent du code livré plus loin.
- **6 avant 7** : la garde applicative et l'accesseur naissent en 6 ; le contrat d'agrégat qui les consomme se fige en 7.
- **7 avant 8** : l'onboarding montre le `resteDisponible` calculé, qui dépend de l'agrégat fiable.
- **9 avant 10** : la zone morte 768-1023 px et l'absence d'état actif sont des **bugs**. Les corriger d'abord donne une base saine ; les corriger pendant la restructuration rendrait impossible de savoir ce qui a cassé quoi. Les flags naissent en 9 pour que 10 puisse les utiliser.
- **10 avant 11** : le formulaire unifié vit dans une IA stable.
- **11 avant 12** : le soft delete déplace l'action destructive — il a besoin du formulaire comme point d'accueil.
- **12 avant 13** : le cockpit réel exclut les dépenses supprimées ; l'inverse imposerait de reprendre le calcul.
- **13 avant 14** : on ne pagine pas un historique dont la définition d'agrégat vient de changer.
- **15 après 13** : on n'optimise pas un chemin de données qu'on est en train de changer.
- **16 et 17 en dernier** : le lexique se fige quand les écrans sont figés ; le polish se pose sur une IA correcte. **Repeindre avant de replanifier est l'erreur classique.**

---

## 10. RITUEL DE CLÔTURE PAR ÉTAPE (DoD)

Aucune étape n'est terminée tant que les **6 critères** ne sont pas explicitement prouvés dans le rapport de PR :

1. **CI verte** — Lint, Typecheck, Tests, **e2e-full**, Security, Build.
2. **Nombre de cas e2e exécutés en CI non décroissant** (nouveau, depuis l'étape 2).
3. **Sourcery silencieux sur le DERNIER commit** :
   ```bash
   gh api repos/thierryvm/ankora/pulls/<N>/comments \
     --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
   ```
   Sourcery est **asynchrone** : re-lire après chaque push, y compris après un force-push. Ne jamais faire confiance à une seule lecture.
4. **Reviews humaines approuvées et résolues.**
5. **Aucun conflit avec `main`**, `mergeStateStatus` = CLEAN.
6. **Rapport final livré à @thierry**, contenant : la preuve de chaque critère · la sortie des agents QA avec leur verdict · le **rapport Playwright en artefact** · la **preuve de mutation** (§6.3) · le **delta de poids gzip** de la route touchée · pour toute étape à migration, les quatre preuves d'ADR-032 (dump, down.sql testé, `migration list --linked`, créneau de push).

**`push done ≠ task done`.**

**Handoff obligatoire** — chaque session écrit son handoff au format canonique dans le vault (`Athenaeum/10_Projects/ankora/cc-handoffs/`) **et** en miroir dans `docs/handoffs/`, **avant** toute compaction ou fin de session. Double redondance : si l'iCloud n'a pas sync, GitHub reste la source de vérité.

**Cleanup de branche** — squash merge : `git branch -d` refusera. `git fetch --prune origin` → `-d` → si refus, cross-check `gh pr list --state merged --json headRefName` → seulement alors `-D`.

---

## 11. CE QUE LES CRITIQUES ONT CHANGÉ

### Corrections appliquées

| #   | Critique                                                                                                                                                                                 | Correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | FK composite `on delete set null` sans liste de colonnes met `workspace_id` (NOT NULL) à NULL sur 3 tables ; casse la suppression de catégorie **et** `executeDeletion()` (RGPD art. 17) | **Vérifié exact** (`initial_schema.sql:85`). Double correction : la FK composite **sort du chemin critique** (chantier P3, la garde applicative de l'étape 6 suffit) **et** sa forme est corrigée en `on delete set null (category_id)`, conditionnée à PG 15+ (G2), avec les deux tests exigés — dont « supprimer un workspace complet », chemin `executeDeletion`. Une table par migration.                                                                                                           |
| B2  | Aucun chemin de retour arrière sur les migrations ; un seul projet Supabase, plan Free, sans PITR                                                                                        | **Retenue.** ADR-032 : dump obligatoire + `*_down.sql` **testé** (`db reset` → up → down → up) + `migration list --linked` + push par @thierry sur créneau choisi. Et le programme passe de 4 migrations sur le chemin critique à **1**.                                                                                                                                                                                                                                                                |
| B3  | L'étape soft delete casse `/app` entre le merge et le push manuel (PostgREST 42703, pas de fallback)                                                                                     | **Retenue et généralisée.** ADR-032 règle 1 : `push-avant-merge` pour toute migration consommée par du code, et migration rétrocompatible avec le code déjà déployé. L'étape 12 devient 2 PR.                                                                                                                                                                                                                                                                                                           |
| B4  | Le filet e2e est prérequis de tout et placé hors séquence, sans date                                                                                                                     | **Retenue.** Devient l'**étape 2**, bloquante. Nouveau critère permanent au DoD : nombre de cas e2e exécutés en CI **non décroissant**.                                                                                                                                                                                                                                                                                                                                                                 |
| B5  | « Aucune étape ne dépend d'une étape ultérieure » est faux 5 fois                                                                                                                        | **Retenue, les 5 corrigées** : (1) `@hookform/resolvers` **gelé** au lieu d'être supprimé (`react-hook-form` est encore importé par `ui/form.tsx:14`, vérifié) ; (2) le cron de purge est celui de l'étape 3, qui existe désormais ; (3) la taxonomie est tranchée en **ADR-023**, plus en « risque » d'une étape post-migration ; (4) le regroupement Factures/Engagements est acté en **ADR-030** avant l'étape 10 ; (5) le sort de `domain/expenses/update.ts` est acté en ADR-028 et exécuté en 11. |
| B6  | Rien de visible avant la 6ᵉ branche ; migration risquée avant toute valeur                                                                                                               | **Retenue.** L'étape 1 livre de la valeur perceptible (ligne tappable, suppression sécurisée) et la migration disparaît du début du programme.                                                                                                                                                                                                                                                                                                                                                          |
| B7  | Le formulaire passe de 3 à 6 champs avant d'alléger la saisie                                                                                                                            | **Retenue.** Divulgation progressive (4 contrôles par défaut, `note`/`paid_from` sous repli), suggestion de catégorie **remontée à l'étape 6**, plus 4 réducteurs de friction absents de la v1 (focus auto, chips de libellés récents, « Enregistrer et ajouter », rattrapage de retard). Critère « < 5 s » remplacé par un critère **structurel** asserté dans le DOM.                                                                                                                                 |
| B8  | L'onboarding et les états vides ne sont jamais touchés                                                                                                                                   | **Retenue.** Nouvelle **étape 8 « Premier jour »** + états vides pédagogiques à l'étape 7.                                                                                                                                                                                                                                                                                                                                                                                                              |
| M1  | L'étape nav n'a aucun ADR alors que le plan invoque la banned-list §2                                                                                                                    | **Retenue.** **ADR-030** créé, avec signature @thierry. L'étape est découpée en 10a (mécanique, réversible) / 10b (perceptible, derrière flag).                                                                                                                                                                                                                                                                                                                                                         |
| M2  | L'étape gouvernance est sous-dimensionnée et ses critères sont inatteignables                                                                                                            | **Retenue et vérifiée** : `docs/` contient **20** fichiers `.md` à la racine, la liste d'archivage n'en nommait que 7 → le critère « 8 fichiers » était impossible ; `grep -c "^                                                                                                                                                                                                                                                                                                                        | "` compte tout le fichier. Découpée en 4a/4b, critères réécrits en **listes nominatives** + un **test de parité agents** qui échoue en cas d'écart. |
| M3  | L'étape hygiène touche `package.json` et se classe LÉGÈRE sans `plan-reviewer`                                                                                                           | **Retenue.** 4a passe en voie LOURDE avec `plan-reviewer`. _(La partie « collision avec `chore/preflight-hooks` » est écartée : voir ci-dessous.)_                                                                                                                                                                                                                                                                                                                                                      |
| M4  | Critères de sortie non vérifiables ou garantis d'échouer                                                                                                                                 | **Retenues, une par une** : le grep `deleted_at` (**vérifié faux** : les 6 `.from('expenses')` sont sur leur propre ligne) devient une **règle ESLint** ; « < 5 s » devient structurel ; « plus de warns au build » sort de l'étape hygiène ; « code tolère `slug ?? name` » retiré (l'étape ne lit pas `slug`) ; « 1 seul `getUser()` » devient **3 → 2** mesuré par client instrumenté.                                                                                                               |
| M5  | `CREATE INDEX CONCURRENTLY` interdit en bloc transactionnel, et contredit le « hors périmètre » de sa propre étape                                                                       | **Retenue.** Interdit en dur par ADR-032. L'index part au chantier P3, sans `CONCURRENTLY`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| M6  | Le backfill de slug par nom exact est dangereux (aucune unicité sur `(workspace_id, name)`)                                                                                              | **Retenue et vérifiée** (`initial_schema.sql:48-58`). G5 en lecture seule, matching par **triplet du seed** + `created_by`, déduplication par `min(id)` — et le tout **déplacé à l'étape 16**, hors chemin critique.                                                                                                                                                                                                                                                                                    |
| M7  | Curseur de pagination sur `occurred_on` seul : lignes silencieusement sautées                                                                                                            | **Retenue.** La pagination par curseur est **retirée** du programme ; si elle revient, ADR-032 impose le curseur composite `(occurred_on, id)`, l'index correspondant et le test « 30 dépenses le même jour ».                                                                                                                                                                                                                                                                                          |
| M8  | `max(prévu, réel)` ne récompense jamais la retenue ; seul le dépassement produit un signal, et il est rouge                                                                              | **Retenue.** Le chiffre souverain devient **« Reste à dépenser » = budget − réel**, qui réagit dans les deux sens. `max()` reste pour la capacité d'épargne (planification), avec la justification écrite. Critère e2e reformulé en **3 cas nommés** au lieu d'un seul auto-contradictoire.                                                                                                                                                                                                             |
| M9  | « Dépenses réelles » n'est jamais défini ; double comptage charge↔dépense ; `paid_from='epargne'` renvoyé à un ADR inexistant                                                            | **Retenue.** Définition normative dans **ADR-025** (`paid_from='vie_courante'` ET `deleted_at is null` ET bornes Europe/Brussels), avertissement de doublon à l'étape 11, et cas C testé à l'étape 13.                                                                                                                                                                                                                                                                                                  |
| M10 | Contrat d'agrégat contradictoire entre trois étapes                                                                                                                                      | **Retenue.** Contrat unique `getMonthSummary()` + accesseur unique, **figé à l'étape 7** par ADR et par test. Le découpage du snapshot est **budgété** à l'étape 15 (~250 l.), plus traité en corollaire gratuit.                                                                                                                                                                                                                                                                                       |
| M11 | Soft delete garanti seulement au niveau applicatif ; la policy `for all` autorise le DELETE dur                                                                                          | **Retenue et vérifiée** (`20260416000002_rls_policies.sql:76`). ADR-026 : scission en `for select`/`for insert`/`for update`, **aucune policy DELETE**. Le grep humain devient une règle ESLint.                                                                                                                                                                                                                                                                                                        |
| M12 | Un 2ᵉ projet Supabase Free se met en pause et dérive du schéma                                                                                                                           | **Retenue.** Remplacé par `supabase start` dans le job GHA (runners Linux, zéro drift, clé service_role locale non secrète). Le projet cloud reste pour les smoke tests de preview.                                                                                                                                                                                                                                                                                                                     |
| M13 | Aucun déploiement progressif ; nav et chiffre souverain partent d'un coup                                                                                                                | **Retenue.** **ADR-033** : deux flags d'env, posés à l'étape 9, utilisés en 10b et 13.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| M14 | UPDATE de masse non borné, table de règles non plafonnée, index manquant, trou export RGPD                                                                                               | **Retenue autrement** : la table `expense_label_rules` **n'est plus créée** (suggestion dérivée). L'export RGPD est traité à l'**étape 3** — et le trou est **plus large que signalé** : 7 tables exportées sur 13+, il manque `accounts`, `commitments`, `charge_payments`, `workspace_settings`, `workspace_members`, `deletion_requests`. Ajout d'un **test de complétude structurel**.                                                                                                              |
| M15 | L'index btree ne peut pas servir un « contient »                                                                                                                                         | **Retenue.** La recherche est retirée du programme ; si elle revient, le choix (préfixe + `text_pattern_ops` vs `pg_trgm` + GIN) est tranché en ADR, pas au moment du `EXPLAIN`.                                                                                                                                                                                                                                                                                                                        |
| M16 | Seuils de couverture en glob : échec garanti puis abaissement cosmétique                                                                                                                 | **Retenue et vérifiée** (5 fichiers de `src/lib/actions/` sans aucun test). Seuils **par fichier**, élargis au fil des couches.                                                                                                                                                                                                                                                                                                                                                                         |
| M17 | Coût cérémonial > coût de production ; « un seul auditeur visuel » gravé puis violé                                                                                                      | **Retenue.** Budget explicite 1-2 sessions par étape + règle d'abandon. La règle d'un auditeur visuel unique est **appliquée** : chaque étape en nomme exactement un (la v1 en alignait 3 à l'étape 8 et 4 à l'étape 15).                                                                                                                                                                                                                                                                               |
| M18 | RPC de somme = migration non déclarée, porteuse de la faille la plus grave                                                                                                               | **Retenue.** RPC **retirée**. Si elle revient : `security invoker`, migration déclarée, `rls-flow-tester` obligatoire.                                                                                                                                                                                                                                                                                                                                                                                  |
| M19 | Aucune donnée de volumétrie ; nom de contrainte supposé                                                                                                                                  | **Retenue.** GATE 0 (G3, G4, G7) en lecture seule. Deux étapes (historique, perf) sont dimensionnées **après** la mesure, pas avant.                                                                                                                                                                                                                                                                                                                                                                    |
| M20 | Aucune mesure de succès produit                                                                                                                                                          | **Retenue, en moins cher.** 4 indicateurs **dérivés des données existantes** (zéro table, zéro surface RGPD). Le 5ᵉ (destinations visitées) est écarté faute de justifier une table d'événements. Plus un point de contrôle humain de 7 jours aux arrêts sûrs.                                                                                                                                                                                                                                          |
| M21 | Onglet « Dépenses » = liste chronologique, contredit la règle de gouvernance                                                                                                             | **Retenue partiellement.** Réserve écrite au §4.2, onglet conservé en v1 **mais instrumenté** ; bascule vers « Où va l'argent » si les indicateurs 1 et 3 confirment.                                                                                                                                                                                                                                                                                                                                   |
| M22 | Slug i18n bloquant pour livrer de l'anglais à un utilisateur francophone unique                                                                                                          | **Retenue.** Déplacé à l'étape 16. Le sort du renommage d'une catégorie système est **tranché explicitement** dans ADR-024, plus laissé implicite.                                                                                                                                                                                                                                                                                                                                                      |
| M23 | Risque FSMA sur les libellés du simulateur, hors contrôle lexical                                                                                                                        | **Retenue.** Périmètre de l'étape 16 élargi aux libellés du simulateur et du hero, avec une grammaire de sortie imposée.                                                                                                                                                                                                                                                                                                                                                                                |
| M24 | Pas de modélisation des remboursements                                                                                                                                                   | **Retenue.** Position explicite en ADR-025 : Ankora ne les modélise pas en v1.0, écrit dans l'ADR **et** dans la micro-copy.                                                                                                                                                                                                                                                                                                                                                                            |
| M25 | Aucun budget de poids client par étape                                                                                                                                                   | **Retenue.** +5 Ko gzip max sur la route touchée, mesuré à `next build`, dès l'étape 1.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M26 | Aucune cadence ni règle d'arrêt                                                                                                                                                          | **Retenue.** 1-2 sessions par étape, règle d'abandon, et 4 **points d'arrêt sûrs** identifiés.                                                                                                                                                                                                                                                                                                                                                                                                          |
| M27 | Catégories câblées côté dépenses mais pas côté charges → total par catégorie faux                                                                                                        | **Retenue.** L'étape 6 ne livre **aucun total** (badge + chips seulement) ; les totaux arrivent à l'étape 7, quand les deux surfaces sont câblées. Contradiction « 5 vs 8 chips » supprimée : 8 chips, alignées sur ADR-023.                                                                                                                                                                                                                                                                            |
| M28 | Historique sur-ingénieré (colonne générée, curseur, RPC, `EXPLAIN` en critère)                                                                                                           | **Retenue.** L'étape 14 se réduit à ce qui répare un mensonge : navigation par mois + compteur exact. Le reste est reporté **avec une condition de réouverture écrite**.                                                                                                                                                                                                                                                                                                                                |

### Critiques écartées, avec justification

| Critique                                                                                                                                                                                                    | Pourquoi elle ne tient pas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **« GATE 0 : collision multi-agent active, `chore/preflight-hooks` avec index non vide sur `.husky/`, `package.json`, `CLAUDE.md` »** — et la critique dérivée « l'étape 0 entre en collision avec ce WIP » | **Factuellement périmé.** Vérifié à l'instant : `git branch --show-current` → `main`, `git status --porcelain` → **vide**. `chore/preflight-hooks` et `chore/repo-cleanup` n'existent plus qu'en remote. Le §0 de la v1 était déjà obsolète au moment où les critiques ont été écrites, et la critique l'a repris sans revérifier. GATE 0 devient un relevé factuel de 30 minutes, pas un verrou. _(La partie utile de cette critique — l'étape hygiène doit passer sous `plan-reviewer` parce qu'elle touche `package.json` — est retenue et appliquée.)_ |
| **« Dériver le reste à vivre du calcul `revenus − charges − provisions − engagements` au lieu de le faire saisir »**                                                                                        | **Techniquement faux.** Cette formule **est** `resteDisponible` (`situation-mois.ts:81`). Si `budgetVieCourante = resteDisponible`, alors `capacite = resteDisponible − budgetVieCourante = 0` **par construction** : la capacité d'épargne, qui est l'objet du produit, devient structurellement nulle. Ce qui est juste dans la critique — le défaut de **500 € est arbitraire** — est retenu et corrigé autrement : le budget est **proposé dans son contexte** à l'onboarding, avec `resteDisponible` affiché comme plafond (étape 8).                 |
| **« Réduire le bloc ADR à 3 décisions ; les 5 autres s'écrivent au fil de l'eau »**                                                                                                                         | **Rejetée.** « Au fil de l'eau » = décider dans la session qui implémente, ce que la banned-list §2 interdit explicitement, après un incident documenté. Le bloc **grossit** au contraire de 8 à 12 décisions, précisément parce que les critiques ont montré que la v1 en laissait quatre implicites (taxonomie, navigation, discipline de migration, flags) — dont trois ont produit un bug bloquant dans le plan. Le bloc reste **une seule PR de markdown**, pas 12 sessions.                                                                          |
| **« Le programme peut geler en position 2/16 si @thierry refuse ADR-031 »**                                                                                                                                 | **Rejetée dans sa conclusion.** Un refus d'ADR-031 (amendement NORTH_STAR) n'affecte que la **densité de l'accueil**, donc les étapes 8 et 13, qui se replient sur « corriger le calcul sans toucher à la densité ». Les étapes 1, 2, 3, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17 en sont indépendantes. Le refus coûte deux étapes dégradées, pas le programme. La v1 disait « stop » ; c'était excessif.                                                                                                                                                      |
| **« Fusionner étapes 0 et 1 en une PR d'hygiène de 30 minutes »**                                                                                                                                           | **Partiellement rejetée.** Les deux sont fusionnées en une étape (4), mais **en 2 PR** : 4a touche `package.json` et des dépendances (voie lourde, `plan-reviewer`), 4b déplace ~80 fichiers par`git mv`. Les mélanger rendrait la revue impossible : un diff de renommage massif noierait la modification de dépendances, qui est la partie risquée.                                                                                                                                                                                                      |

| Critique                                                                                                                             | Pourquoi elle ne tient pas                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **« Le seul recours pour l'étape nav est un `git revert` d'une PR de 500 lignes »**                                                  | **Rejetée dans sa prémisse, retenue dans son remède.** La prémisse suppose une PR monolithique ; le découpage 10a/10b la supprime, et le flag d'ADR-033 rend le retour arrière instantané sans revert. Le remède demandé (flag) est appliqué.                                                                                                                    |
| **« Le critère "sortie Playwright collée au rapport" est un artefact produit par l'agent qui s'auto-évalue, donc non falsifiable »** | **Retenue sur le fond, écartée sur la portée.** Corrigé par l'upload du rapport Playwright en **artefact GitHub** (vérifiable par @thierry sans passer par l'agent). Mais la critique en tirait qu'il fallait supprimer la règle d'attente : non — entre l'étape 1 et la fin de l'étape 2, c'est la seule preuve disponible. On la garde, on la rend vérifiable. |
| **« Étape 4 : le drop/add de contraintes est le plus élevé du programme, à placer après le premier lot »**                           | **Retenue au-delà de ce qui était demandé.** La critique proposait de déplacer la migration ; elle est **supprimée du programme** et reléguée au chantier P3, conditionnée à G2, avec la garde applicative comme réponse suffisante.                                                                                                                             |

---

## 12. RÉSUMÉ EXÉCUTIF POUR @THIERRY

**Trois choses que l'audit a établies et qui changent le cadrage de ta demande :**

1. **« On ne peut pas modifier une dépense » est faux.** `ExpenseEditDrawer.tsx` existe, est monté (`ExpensesClient.tsx:337`), est testé. Le crayon est une icône fantôme collée à une corbeille rouge. Problème de **visibilité**, pas de code manquant — réparé dès l'**étape 1**, pour un coût très faible.
2. **« Il n'y a pas de vraies catégories » est faux aussi.** 8 catégories sont créées dans ta base à chaque inscription (`20260503000003:45-52`), avec couleur et type ; le Server Action les écrit déjà (`expenses.ts:59`) ; le schéma Zod les valide déjà. **Deux lignes d'UI les débranchent** : `categoryId: null` (`ExpensesClient.tsx:78`) et un mapping RSC qui perd le champ (`expenses/page.tsx:17-23`). C'est la couche la moins chère du programme et celle dont l'effet perçu est le plus fort.
3. **La confusion des menus n'est pas un problème de menus.** La navigation expose tes six tables au lieu de tes questions, et trois des sept destinations décrivent la même chose : de l'argent qui sort. Aucune refonte visuelle ne réparera ça — c'est pourquoi le polish est délibérément la **dernière** étape.

**Quatre décisions qui t'appartiennent, avant que le code aille loin :**

- **ADR-023 — la taxonomie des catégories.** Tes 8 catégories seedées (Logement, Famille, Taxes, Santé, Abonnements, Assurances, Transport, Autres) sont une taxonomie de **charges fixes**. Il manque Courses, Restaurant, Loisirs, Shopping — l'écrasante majorité de ce qu'on saisit à la main. Livrer le sélecteur sans trancher, c'est garantir que 70 % de tes dépenses tombent dans « Autres ». **Ma reco : 8 catégories orientées dépenses courantes**, partagées avec les charges, sans jamais renommer une catégorie existante.
- **ADR-030 — la navigation à 5 entrées.** Tu passeras de 7 destinations à 5, avec un bouton « + » central qui met « ajouter une dépense » à 1 tap depuis n'importe où. Derrière un flag, activable et désactivable par toi.
- **ADR-031 — l'amendement NORTH_STAR.** Les « 8 sections obligatoires du dashboard » écrites le 23 avril entrent en collision frontale avec ton retour de juillet. Reformulation proposée : « aucune question importante sans réponse » remplace « 8 sections ». **Si tu refuses, le programme continue** — seules deux étapes se replient.
- **Le créneau de la seule migration du programme** (étape 12, suppression réversible). Un seul projet Supabase, plan Free, pas de PITR, un utilisateur réel : le push se fait quand tu le décides, jamais en fin de session, jamais sans sauvegarde préalable.

**Un blocage légal, traité en 3ᵉ position et pas relégué :** `executeDeletion()` — la suppression de compte RGPD — **n'a aucun appelant** (`grep -rn "executeDeletion" src/` → la définition et un commentaire). Une demande de suppression écrit une ligne « pending » que **rien ne consomme** : aucune clé `crons` dans `vercel.json`, aucun `pg_cron`. Et l'export RGPD énumère **7 tables sur 13+** — `accounts`, `commitments`, `charge_payments`, `workspace_settings`, `workspace_members`, `deletion_requests` n'en sortent jamais. Ce n'est pas un chantier parallèle : c'est ce qui rend le produit légalement livrable, donc ce qui donne un sens au reste.

**Et une bonne nouvelle immédiate** : le verrou multi-agent annoncé par la version précédente de ce plan n'existe plus. Working tree propre sur `main`, aucune session concurrente. **Rien ne bloque le démarrage de l'étape 1.**
