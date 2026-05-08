# ADR-018 — Provisions bidirectionnelles : audit trail OUT/IN entre comptes courants et compte de lissage

- **Statut** : Proposed
- **Date** : 2026-05-09
- **Auteur** : @cowork (Cowork desktop, Opus)
- **Deciders** : Thierry vanmeeteren (Product Owner), @cowork (Architecture), @cc-ankora (Implémentation)
- **Tags** : `architecture`, `domain-model`, `ux`, `audit`, `provisions`, `bidirectionnel`
- **Portée** : V1.0 publique (PR-D5 tracking paiements multi-sources + onglet Mouvements Compte Épargne)
- **En lien avec** :
  - [ADR-002](./ADR-002-bucket-model.md) — modèle comptes + buckets, invariant `sum(buckets.balance) === account.balance`
  - [ADR-009](./ADR-009-capacite-epargne-reelle.md) — amendé 2026-05-09 (3 concepts UX : Reste disponible / Reste à vivre / Capacité d'épargne réelle)
  - [ADR-012](./ADR-012-assistant-virements.md) — assistant virements bucket-to-bucket
  - [ADR-016](./ADR-016-tracking-paiements-multi-sources.md) — tracking paiements (Proposed)
  - [ADR-017](./ADR-017-plans-apurement.md) — plans d'apurement (Proposed) ; les échéances d'apurement consomment des provisions

---

## Contexte & problème

### Verbatim Thierry (2026-05-09)

> « Les montants qui partent vers compte de lissage, reviennent toujours vers compte courant pour payer la bonne facture au bon moment. »

Cette phrase capture l'essence du modèle Ankora pour les charges non-mensuelles : **l'argent ne disparaît pas dans le compte de lissage, il y dort temporairement le temps que la facture tombe**. La promesse produit s'effondre si l'utilisateur ne peut pas voir ce ballet aller-retour de manière fluide et auditable.

### Le problème concret

Aujourd'hui (post-ADR-002 + ADR-012), Ankora modélise des **virements** simples entre comptes (`account_transfers`) et entre buckets (`bucket_transfers`). Mais le cas d'usage **provision non-mensuelle** est intrinsèquement **bidirectionnel et cyclique** :

1. **OUT (mensualisation)** : chaque mois, X € quittent le compte courant et alimentent le bucket dédié dans le compte de lissage. Ex : Taxe voiture 25 €/mois × 12 mois → bucket "Taxe voiture 2026".
2. **IN (rapatriement à échéance)** : juste avant la date de paiement de la facture annuelle (ou pluri-mensuelle), le bucket est vidé et le montant cumulé revient sur le compte courant pour permettre le paiement effectif. Ex : 300 € reviennent au 28/05 pour payer la Taxe voiture du 01/06 au Trésor public.
3. **Paiement final** : la transaction de paiement (sortie du compte courant vers le créancier) est l'aboutissement du cycle.

Sans audit trail dédié, l'utilisateur voit dans le hero waterfall une provision mensuelle de 25 €/mois (OUT), puis tout d'un coup un mouvement IN de 300 € en mai qui semble surgir de nulle part, suivi d'une dépense de 300 € au profit de "Trésor Public Belgique" en juin. **Il perd le fil narratif et doute de la cohérence des chiffres** — exactement le contraire de la promesse "Ankora te rend le contrôle".

### Pourquoi ADR-002 ne suffit pas

ADR-002 garantit l'invariant comptable (`sum(buckets) === account.balance`), mais ne capture pas :

- **L'intention** d'un virement OUT (« je provisionne pour la Taxe voiture 2026 ») vs un virement IN (« je rapatrie pour payer la facture qui tombe »).
- **Le lien** entre le cycle de provisionnement et la transaction finale de paiement.
- **La timeline** : l'utilisateur veut voir "ce que mon argent fait pour moi" en chronologie, pas comme une pile de virements anonymes.
- **La pédagogie** : un nouvel utilisateur a besoin de comprendre que provisionner ≠ dépenser, et que rapatrier ≠ recevoir un revenu.

ADR-016 (tracking paiements) traite de la détection du moment où un paiement est effectif. ADR-017 (plans d'apurement) traite des paiements étalés N×M. ADR-018 traite du **chemin invisible** que prend l'argent entre le moment où il est "mis de côté" et le moment où il sert effectivement à payer.

---

## Décision — drivers

Critères, classés par poids :

1. **Lisibilité utilisateur** — le verbatim Thierry est non-négociable : l'utilisateur doit voir où va son argent et d'où il revient, sans aller chercher dans 3 écrans.
2. **Audit trail comptable** — chaque mouvement IN doit être traçable jusqu'à la charge récurrente qui l'a généré et, le cas échéant, jusqu'à la transaction de paiement qui a clos le cycle.
3. **Cohérence avec ADR-002** — pas de duplication de solde, pas de table parallèle qui réinvente les buckets. On enrichit le modèle existant, on ne le remplace pas.
4. **FSMA-safe (R-02)** — pas de vocabulaire d'investissement. On parle de "provisions", "lissage", "matelas", jamais de "placements", "rendements", "intérêts capitalisés".
5. **Anti-culpabilisation persona Thierry (R-06)** — si un cycle de provisionnement échoue (déficit avant échéance), le copy doit aider, pas culpabiliser. Pas de rouge agressif, pas de "vous n'avez pas mis assez".
6. **Mobile-first (R-07)** — la timeline IN/OUT doit tenir sur 375px sans scroll horizontal et sans tooltip qui sort de l'écran.
7. **Budget 0 € (R-01)** — pas de cron payant, pas de service tiers de notification. Notif in-app uniquement V1.0, email V1.1 post-MRR.

---

## Options considérées

### Option 1 — Ne rien faire de spécifique (utiliser `account_transfers` + `bucket_transfers` génériques)

**Pour** : aucun travail de modélisation supplémentaire. Le modèle ADR-002 fonctionne.

**Contre** :

- Aucun lien entre un virement OUT et le virement IN qui le rapatrie 11 mois plus tard.
- Aucune timeline dédiée → l'utilisateur doit reconstruire le cycle mentalement.
- Impossible de répondre proprement à la question « combien me reste-t-il à provisionner pour la Taxe voiture cette année ? » sans heuristique fragile.
- Impossible de générer une notif J-3 « rapatrier 300 € vers compte courant » sans table dédiée.

**Verdict** : ❌ rejetée. La promesse produit (« voir le ballet aller-retour ») devient impossible à tenir.

### Option 2 — Table dédiée `provision_transfers` (raffinement de `account_transfers`)

**Pour** :

- Intention explicite (`direction enum`, `recurring_template_id`, `installment_plan_id`).
- Audit trail trivial : `JOIN` sur `recurring_template_id` pour reconstituer un cycle complet.
- Permet la timeline IN/OUT avec une seule requête.
- Permet le calcul automatique du "rapatriement attendu J-3" sans heuristique.

**Contre** :

- Risque de dérive vers une 2e source de vérité si on n'est pas strict sur l'invariant ADR-002.
- 1 table de plus à maintenir + RLS + tests.

**Verdict** : ✅ retenue, à condition de poser explicitement que `provision_transfers` **dérive** de `account_transfers` (FK 1-1) sans dupliquer les montants.

### Option 3 — Ajouter une colonne `intent enum` sur `account_transfers` directement

**Pour** :

- Pas de nouvelle table.
- Plus simple à requêter.

**Contre** :

- `account_transfers` est volontairement générique (cf. ADR-002). Lui ajouter une sémantique métier "provision" pollue son rôle.
- Champs spécifiques (`recurring_template_id`, `installment_plan_id`, `provision_cycle_year`) n'ont aucun sens pour un transfer ad hoc utilisateur.
- Sparse columns NULL la majorité du temps → indique un défaut de modélisation.

**Verdict** : ❌ rejetée. Couplage métier inapproprié dans une table d'infrastructure.

### Option 4 — Modélisation "double-écriture" pure (chaque cycle = paire d'événements liés)

**Pour** : élégance théorique du couplage paire OUT/IN comme entité unique.

**Contre** :

- Surcomplique le cas où un cycle est rompu (utilisateur dépense la provision avant échéance, change de fournisseur en cours d'année, met en pause).
- Surcomplique les ajustements (R-10 — montant mensuel modifié à mi-cycle).
- Modèle trop rigide pour une UX d'humain qui change d'avis.

**Verdict** : ❌ rejetée. Ankora est un cockpit humain, pas un grand livre comptable rigide.

---

## Décision retenue

**Option 2 — table dédiée `provision_transfers` qui enrichit (sans dupliquer) `account_transfers`**, avec timeline UI IN/OUT bidirectionnelle dans l'onglet Mouvements de la card Compte Épargne, et drawer drilldown par cycle.

---

## Spec technique

### Schéma DB (migration `20260509_add_provision_transfers.sql`)

```sql
-- Direction du virement de provision dans le cycle annuel/pluri-mensuel
CREATE TYPE provision_direction AS ENUM (
  'out',  -- compte courant → compte de lissage (mensualisation)
  'in'    -- compte de lissage → compte courant (rapatriement avant paiement)
);

CREATE TABLE provision_transfers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Lien fort vers le virement bas-niveau (ADR-002)
  -- 1-1, ON DELETE CASCADE : si le transfer brut est supprimé, l'audit l'est aussi.
  account_transfer_id   UUID NOT NULL UNIQUE REFERENCES account_transfers(id) ON DELETE CASCADE,

  -- Sémantique métier
  direction             provision_direction NOT NULL,

  -- Lien vers la charge récurrente provisionnée
  -- (ex: Taxe voiture annuelle 300 € échue le 01/06/2026)
  recurring_template_id UUID NOT NULL REFERENCES recurring_templates(id) ON DELETE RESTRICT,

  -- Cycle annuel concerné (année civile de l'échéance, pas année de la provision)
  provision_cycle_year  SMALLINT NOT NULL CHECK (provision_cycle_year BETWEEN 2025 AND 2099),

  -- Lien optionnel : si direction = 'in', la transaction de paiement final qui clôt le cycle
  -- (ex: virement 300 € au Trésor public le 01/06/2026)
  -- NULL tant que le paiement n'est pas confirmé (ADR-016)
  settlement_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  -- Plan d'apurement (ADR-017) si la facture finale est elle-même étalée
  -- Rare mais possible : on provisionne mensuellement pour un futur plan d'apurement
  installment_plan_id   UUID REFERENCES installment_plans(id) ON DELETE SET NULL,

  -- Métadonnées
  notes                 TEXT,                   -- note libre user (~280 chars max côté UI)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Garde-fous
  CONSTRAINT direction_in_no_apurement_orphan CHECK (
    NOT (direction = 'in' AND settlement_transaction_id IS NULL AND installment_plan_id IS NULL)
    OR created_at > now() - INTERVAL '7 days'  -- tolère 7 jours pour matcher le settlement
  )
);

-- Index pour reconstituer un cycle complet en O(log n)
CREATE INDEX idx_provision_transfers_cycle
  ON provision_transfers (workspace_id, recurring_template_id, provision_cycle_year, direction);

-- Index pour la timeline IN/OUT chronologique
CREATE INDEX idx_provision_transfers_workspace_chrono
  ON provision_transfers (workspace_id, created_at DESC);

-- RLS workspace-scoped
ALTER TABLE provision_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY provision_transfers_select_own
  ON provision_transfers FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY provision_transfers_insert_own
  ON provision_transfers FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY provision_transfers_update_own
  ON provision_transfers FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY provision_transfers_delete_own
  ON provision_transfers FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

### Invariants

1. **Pair OUT cumulés ≥ IN cumulés par cycle** : pour un `(recurring_template_id, provision_cycle_year)` donné, `SUM(amount WHERE direction='out') ≥ SUM(amount WHERE direction='in')` à tout instant. Sinon = bug ou main user (donner un signal soft, pas culpabilisant).
2. **Cycle clos = 1 settlement** : pour un cycle clôturé, exactement 1 row `direction='in'` doit avoir `settlement_transaction_id IS NOT NULL` (ou `installment_plan_id` si paiement étalé).
3. **Pas d'orphelin** : tout `provision_transfers` row a un `account_transfer_id` valide ; supprimer le transfer brut supprime l'audit (CASCADE).
4. **ADR-002 préservé** : `provision_transfers` ne contient AUCUN solde. Tous les montants sont lus via `JOIN account_transfers`.

### Server Actions

```typescript
// src/lib/actions/provisions.ts

'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';

const ProvisionTransferInput = z.object({
  recurring_template_id: z.string().uuid(),
  direction: z.enum(['out', 'in']),
  amount: z.number().positive().max(1_000_000), // garde-fou
  cycle_year: z.number().int().min(2025).max(2099),
  notes: z.string().max(280).optional(),
  // Pour direction='in' uniquement
  settlement_transaction_id: z.string().uuid().optional(),
  installment_plan_id: z.string().uuid().optional(),
});

export async function createProvisionTransfer(
  input: z.infer<typeof ProvisionTransferInput>,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const parsed = ProvisionTransferInput.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthenticated' };

  await rateLimit({ key: `provision:${user.id}`, limit: 60, windowSec: 60 });

  // 1. Créer le account_transfer brut (ADR-002)
  // 2. Créer le provision_transfers qui le qualifie
  // 3. Audit log
  // (transactionnel via Supabase RPC ou Postgres function)
  // ... implémentation détaillée en PR-D5

  return { success: true, id: '...' };
}
```

### UI — onglet Mouvements Compte Épargne

**Déjà livré par Claude Design en Bloc B (2026-05-08)** : timeline IN/OUT chronologique avec icônes flèches haut/bas, montants colorés (OUT = neutre, IN = teal "argent qui revient pour payer"), groupement par mois.

Reste à livrer côté CC Ankora intégration (PR-D5) :

1. **Drawer drilldown par cycle** : tap sur une ligne IN ouvre un drawer "Cycle Taxe voiture · 2026" avec grille 12 mois (chip vert pour OUT effectués, chip neutre pour OUT à venir, gros chip teal pour IN final, chip "Payée" si settlement_transaction matché).
2. **Tooltip pédagogique** sur le label "Mouvements" : « L'argent ne disparaît pas — il attend que la facture tombe. » (FR-BE, R-14).
3. **Notification J-3 in-app** avant l'échéance d'une charge récurrente avec bucket cumulé : « Taxe voiture · 300 € prêts à être rapatriés ». Bouton "Rapatrier maintenant" lance la création de la paire `account_transfers` + `provision_transfers` direction='in'.
4. **Ajustement manuel R-10** : possibilité de modifier le montant d'un OUT mensuel à mi-cycle. Auto-rebalance proposé pour les mois restants (ex: « Tu veux que les 8 mois suivants compensent ce mois-ci à 32 €/mois ou tu préfères garder 25 €/mois et avoir 25 € de moins au final ? »).
5. **Mode "cycle rompu"** : si l'utilisateur dépense le bucket avant l'échéance (R-06 anti-culpa : « Pas de panique, on regarde comment rééquilibrer »), drawer propose 3 chemins : reprovisionner sur les mois restants, accepter le déficit et activer un plan d'apurement (ADR-017) si la facture est étalée, ou repousser l'échéance.

### Cas d'usage typiques (seeds Thierry mai 2026)

| Cycle                  | OUT mensuel                             | IN attendu             | Settlement                                   |
| ---------------------- | --------------------------------------- | ---------------------- | -------------------------------------------- |
| **Taxe voiture 2026**  | 25 €/mois × 12 (juin 2025 → mai 2026)   | 300 € au 28/05/2026    | Paiement Trésor public 01/06/2026            |
| **Taxe poubelle 2026** | 10 €/mois × 12 (avril 2025 → mars 2026) | 120 € au 22/03/2026 ✅ | Paiement Commune 25/03/2026 ✅ déjà clôturé  |
| **Taxe égout 2026**    | ~5 €/mois × 12 (avril 2025 → mars 2026) | 55 € au 22/03/2026 ✅  | Paiement Commune 25/03/2026 ✅ déjà clôturé  |
| **Dashlane annuel**    | ~4,50 €/mois × 12                       | 53 € au 09/04/2026 ✅  | Paiement Dashlane 11/04/2026 ✅ déjà clôturé |

→ 3 cycles déjà clôturés en 2026 (visibles en historique grisé), 1 cycle actif (Taxe voiture), 0 cycle de plus pour Thierry (cf. R-13 : pas d'invention de mutuelle annuelle ni d'assurance habitation séparée — tout est mensualisé).

### Lien avec ADR-009 amendé (3 concepts)

- **Reste disponible** = Revenus − Charges fixes − **Provisions OUT du mois en cours** − Virement matelas saisi
- **Reste à vivre** = budget vie courante (saisi user, R-10 ajustable)
- **Capacité d'épargne réelle** = Reste disponible − Reste à vivre

Les `provision_transfers direction='out'` du mois en cours alimentent le calcul du Reste disponible. Les `direction='in'` du mois en cours **ne s'ajoutent pas aux revenus** — ils sont neutres dans le hero waterfall (juste un déplacement entre buckets, pas une rentrée d'argent fraîche). C'est crucial pour ne pas tromper l'utilisateur (un IN de 300 € en juin ne signifie PAS qu'il a 300 € de plus à dépenser).

---

## Conséquences

### Positives

- **Promesse produit tenue** : l'utilisateur voit clairement le ballet OUT/IN.
- **Audit trail propre** : un cycle complet se reconstitue en 1 requête.
- **Notif J-3 trivialement implémentable** : `SELECT ... WHERE direction='out' AND cycle close in 3 days`.
- **Compatibilité ADR-017** : si une facture annuelle est elle-même étalée (cas rare), le `installment_plan_id` fait le pont.
- **R-06 anti-culpa respecté** : copy "cycle rompu" propose 3 chemins, jamais 1 jugement.

### Négatives / dette acceptée

- 1 table de plus + RLS + tests + audit log → ~2-3 jours dev en PR-D5.
- Risque de double-comptage si un dev néglige la règle "lire les montants via JOIN" → mitigé par 1 test d'invariant en CI : `SUM(provision_transfers via account_transfers) === SUM(account_transfers de type provision)`.
- L'utilisateur peut être perdu au début par le concept "rapatrier" → mitigé par tooltip pédagogique + tutoriel onboarding Étape 3.

### Risques résiduels (avec niveau)

| Risque                                                                              | Niveau    | Mitigation                                                                          |
| ----------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| User dépense le bucket avant échéance et perd le fil                                | **Moyen** | Drawer "cycle rompu" 3 chemins (R-06 anti-culpa) + nudge J-3                        |
| Double-comptage en cas de bug `direction='in'` orphelin                             | **Bas**   | CHECK constraint 7-day grace + test invariant CI                                    |
| Notif J-3 spam si plusieurs cycles convergent                                       | **Bas**   | Aggregation côté UI : "3 rapatriements à prévoir cette semaine"                     |
| User ajuste le montant en cours de cycle (R-10) et oublie de réviser le total cible | **Moyen** | Auto-rebalance proposé dans le drawer ajustement                                    |
| Migration future vers cycles non-annuels (semestriel, trimestriel)                  | **Bas**   | `provision_cycle_year` reste pertinent ; ajouter `cycle_period` enum si besoin V1.2 |

---

## Métriques de succès (post-V1.0, 30 jours après release)

1. **Taux d'utilisateurs avec ≥ 1 cycle de provision actif** : cible ≥ 60% (Ankora a justement été conçu pour ça).
2. **Taux de cycles clôturés sans rupture** : cible ≥ 80% (mesure de la confiance dans le modèle).
3. **Taux de notif J-3 actionnée (rapatriement effectué via in-app)** : cible ≥ 50%.
4. **NPS spécifique question "Le ballet OUT/IN m'aide à comprendre où va mon argent"** : cible ≥ 8/10.
5. **Bug rate sur invariant `OUT cumulés ≥ IN cumulés`** : cible 0 erreur en prod sur 90 jours glissants.

---

## Plan d'implémentation (PR-D5)

1. Migration DB `20260509_add_provision_transfers.sql` (schéma + RLS + index).
2. Server Actions `createProvisionTransfer`, `closeProvisionCycle`, `adjustOutMonthly` dans `src/lib/actions/provisions.ts`.
3. Helpers domain pur dans `src/lib/domain/provisions.ts` (calculs cumulés, détection deadline, suggestion rebalance).
4. Composants UI :
   - `<ProvisionTimeline />` (onglet Mouvements, déjà designé Bloc B)
   - `<ProvisionCycleDrawer />` (drilldown par cycle)
   - `<ProvisionRepatriationNudge />` (notif J-3 in-app)
5. Tests Vitest domain ≥ 90% couverture (cycles, ruptures, ajustements R-10).
6. Tests Playwright e2e : flow complet "provisionner → rapatrier → payer" sur seeds Thierry.
7. Audit `gdpr-compliance-auditor` (provision_transfers contient un lien fort vers user via workspace, doit être inclus dans export GDPR art. 20 et anonymisé en deletion art. 17).
8. Audit `financial-formula-validator` (vérifier l'invariant OUT ≥ IN par cycle, vérifier non-double-comptage dans hero waterfall).
9. i18n FR-BE 100% (R-14) + audit `i18n-auditor`.

---

## Décision

**ADR-018 — Proposed**, en attente de validation explicite de @thierry pour passage à `Accepted`.

À valider conjointement avec ADR-016 (tracking paiements) et ADR-017 (plans d'apurement) avant ouverture de la PR-D5.

---

**Note** : cette ADR rend opérationnelle la promesse Ankora « voir le ballet aller-retour de ton argent ». Sans elle, le modèle ADR-002 reste correct comptablement mais opaque pour l'utilisateur. Avec elle, Ankora peut tenir sa promesse de cockpit lisible sans devenir un grand livre comptable.
