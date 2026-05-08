# ADR-017 — Plans d'apurement / paiements échelonnés

- **Statut** : Proposed
- **Date** : 2026-05-09
- **Proposé par** : Cowork-Opus (Architecture)
- **Validation** : 2026-05-09 par @thierry (chat session, validation implicite via go Bloc B Plans d'apurement Surface 1 + audit visuel pixel-perfect)
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `domain`, `ux`, `differenciation`, `belgium`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-002 (bucket-model), ADR-009 amendé (capacité d'épargne nuancée), ADR-011 (santé provisions), ADR-012 (assistant virements), ADR-016 (tracking paiements multi-sources), future PR-D5 (onboarding + édition mouvements + plans d'apurement backend)

---

## Contexte & problème

Plusieurs cas réels d'utilisateurs Ankora (à commencer par @thierry lui-même) ne sont pas couverts par les concepts existants ADR-002 (charges récurrentes) ou ADR-016 (transactions ponctuelles) :

1. **Apurement fiscal** : @thierry a 2 407 € à payer en 11 fois (10 × 220 € + 1 × 207,93 €), prélèvement le 15 du mois. Ce n'est pas une charge récurrente classique (montant non identique chaque fois, durée finie connue à l'avance) ni une transaction ponctuelle (le paiement est étalé).

2. **Remboursement crédit personnel** : 12 000 € à rembourser sur 36 mois à 350 €/mois. Caractéristiques : montant fixe, durée fixe, fin programmée.

3. **Plan accordé fournisseur suite à arriéré** : 600 € d'énergie en 6 fois (cas typique belge après hiver coûteux). Caractéristiques : durée courte, montant régulier, gestion par fournisseur.

4. **Restitution trop-perçu fiscal** : l'État te rembourse 1 000 € en 5 fois sur 5 mois. Caractéristiques : flux ENTRANT (pas sortant), durée fixe.

5. **Paiement étalé d'amende** : 240 € d'amende routière en 4 fois sur 4 mois. Caractéristiques : montant régulier, durée courte.

**Problème commun** : ces cas ont une **durée finie connue à l'avance**, des **échéances précises**, et un **avancement traçable** (X sur N payées). Modéliser cela comme N transactions individuelles pré-créées avec status `pending` (cf. ADR-016) marche techniquement mais n'offre pas la **vue agrégée pédagogique** que l'utilisateur attend (« Combien il me reste à rembourser ? Quand ce sera fini ? Combien je débloque par mois après la fin ? »).

Ankora a une promesse de **clarté financière sans surprise** (cf. NORTH_STAR.md). Un utilisateur qui rembourse un Impôt sur 11 mois doit voir d'un coup d'œil :

- Total restant : 1 307 €
- Prochaine échéance : 15 juin · 220 €
- Avancement : 5/11 payées · 45,7 %
- Date de fin programmée : 15 mars 2027
- Insight pédagogique : « Quand tu auras fini ce plan, tu débloques 220 €/mois pour ton matelas ou un autre objectif. »

---

## Décision — drivers

Trois objectifs en tension :

1. **Clarté pédagogique** : un plan d'apurement doit être **agrégé visuellement** (une seule card, pas N transactions disséminées).
2. **Cohérence data model** : chaque échéance reste une `transaction` individuelle (pour bénéficier des status `pending` / `presumed_paid` / `paid` de ADR-016 et du toggle Payé pattern Coda).
3. **Différenciation produit** : aucun concurrent (Mint / Monarch / YNAB) ne gère explicitement ce concept. C'est une feature **ancrée dans la réalité belge** (apurements fiscaux, plans accordés énergie, rééchelonnements crédit).

---

## Décision adoptée

**Adopter une nouvelle entité `installment_plans`** (plans d'apurement) qui agrège N transactions individuelles avec une vue d'ensemble pédagogique.

### 1. Data model

```sql
CREATE TABLE installment_plans (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id                  uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id                 uuid REFERENCES categories(id) ON DELETE SET NULL,

  -- Identification
  name                        text NOT NULL,                            -- ex: "Impôt 2026", "Plan accordé énergie"
  description                 text,                                     -- contexte optionnel
  direction                   text NOT NULL CHECK (direction IN ('out', 'in')),  -- out = paiement utilisateur, in = restitution

  -- Montants
  total_amount                numeric(12,2) NOT NULL,                   -- ex: 2407.00
  installments_count          integer NOT NULL CHECK (installments_count BETWEEN 2 AND 60),
  installment_amount_std      numeric(12,2) NOT NULL,                   -- ex: 220.00
  installment_amount_final    numeric(12,2),                            -- ex: 207.93 (NULL si toutes égales, calculé sinon)

  -- Calendrier
  payment_day                 integer NOT NULL CHECK (payment_day BETWEEN 1 AND 31),
  start_date                  date NOT NULL,
  end_date                    date GENERATED ALWAYS AS (
    start_date + (installments_count - 1) * INTERVAL '1 month'
  ) STORED,

  -- État
  active                      boolean NOT NULL DEFAULT true,
  paused_until                date,                                     -- pour pause temporaire (ex: période de chômage négociée)
  notes                       text,

  -- Audit
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  cancelled_at                timestamptz,
  cancellation_reason         text
);

CREATE INDEX idx_installment_plans_workspace ON installment_plans(workspace_id, active);
CREATE INDEX idx_installment_plans_end_date ON installment_plans(end_date) WHERE active = true;

-- RLS workspace-scoped
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "installment_plans_workspace_member_read"
  ON installment_plans FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "installment_plans_workspace_owner_write"
  ON installment_plans FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'owner'));
```

### 2. Lien avec `transactions` (ADR-016)

Chaque plan d'apurement génère N transactions pré-créées :

```sql
ALTER TABLE transactions
  ADD COLUMN installment_plan_id uuid REFERENCES installment_plans(id) ON DELETE CASCADE,
  ADD COLUMN installment_index integer;  -- 1, 2, 3, ..., N (pour traçabilité)

CREATE INDEX idx_transactions_installment_plan ON transactions(installment_plan_id, installment_index);
```

Les transactions héritent du status enum (`pending` / `presumed_paid` / `paid` / `to_complete` / `cancelled`) défini en ADR-016. La cascade `ON DELETE CASCADE` garantit que supprimer un plan supprime ses échéances.

### 3. Génération automatique des transactions à la création

Server Action `createInstallmentPlan(input)` :

```typescript
async function createInstallmentPlan(input: {
  name: string;
  totalAmount: Decimal;
  installmentsCount: number;
  installmentAmountStd: Decimal;
  installmentAmountFinal?: Decimal;
  paymentDay: number;
  startDate: Date;
  accountId: string;
  categoryId?: string;
  direction: 'out' | 'in';
  notes?: string;
}) {
  // 1. Validation Zod stricte
  // 2. Calcul auto installmentAmountFinal si non fourni
  const finalAmount = input.installmentAmountFinal
    ?? input.totalAmount.minus(input.installmentAmountStd.times(input.installmentsCount - 1));

  // 3. Insertion plan
  const plan = await db.insert(installmentPlans).values({...}).returning();

  // 4. Génération des N transactions
  const transactions = [];
  for (let i = 1; i <= input.installmentsCount; i++) {
    const dueDate = addMonths(input.startDate, i - 1);
    const amount = i === input.installmentsCount ? finalAmount : input.installmentAmountStd;
    transactions.push({
      installment_plan_id: plan.id,
      installment_index: i,
      label: `${input.name} · Échéance ${i}/${input.installmentsCount}`,
      amount: input.direction === 'out' ? amount.negated() : amount,
      date_planned: dueDate,
      status: 'pending',
      account_id: input.accountId,
      category_id: input.categoryId,
    });
  }
  await db.insert(transactionsTable).values(transactions);

  // 5. Audit log
  await logAuditEvent({ event: 'installment_plan.created', plan_id: plan.id });

  return plan;
}
```

### 4. UI — Surface 1 Dashboard cockpit

Card dédiée entre Activité récente et Tes Signaux (déjà livrée par Claude Design en Bloc B) :

```
┌──────────────────────────────────────────────────────────────┐
│ PLANS D'APUREMENT                              + Nouveau plan│
│ Tu rembourses 2 plans en cours                              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🏛  Impôt 2026                  PROCHAINE                │ │
│ │     Total 2 407 €   ·   11 échéances    220,00 €        │ │
│ │                                  15 juin 2026            │ │
│ │ ████████░░░░░░░░░░  5/11 PAYÉES · 45,7 %                │ │
│ │ 1 100 € payés · reste 1 307 €                            │ │
│ │ Voir les 6 échéances restantes →                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ⚡ Plan accordé énergie         PROCHAINE                │ │
│ │     Total 600 €   ·   6 échéances     100,00 €          │ │
│ │                                  15 juin 2026            │ │
│ │ ████████████████░░  4/6 PAYÉES · 66,7 %                 │ │
│ │ 400 € payés · reste 200 €                                │ │
│ │ Voir les 2 échéances restantes →                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [+ Ajouter un plan d'apurement]                              │
└──────────────────────────────────────────────────────────────┘
```

### 5. Drawer drilldown au clic sur un plan

Affiche la liste des N échéances avec status, toggle Payé inline (pattern Coda), et boutons d'action :

- Header : titre + sub-card progression (X/N + montants payés/restants)
- Liste : N lignes avec date / montant / status badge / toggle Payé
- En bas : insight pédagogique
- Actions : `[Modifier le plan]` (ouvre EditDrawer pré-rempli) + `[Supprimer le plan]` (variant ghost destructive avec confirmation modal)

### 6. Drawer création (`+ Nouveau plan d'apurement`)

Réutilise le pattern `EditDrawer` (atom Drawer) avec champs field-driven :

| Champ                      | Type   | Required | Helper                                           |
| -------------------------- | ------ | -------- | ------------------------------------------------ |
| `name`                     | text   | ✓        | "ex : Impôt 2026"                                |
| `direction`                | enum   | ✓        | radio out / in (out par défaut)                  |
| `category_id`              | select | optional | catégories utilisateur                           |
| `account_id`               | select | ✓        | comptes utilisateur (compte courant par défaut)  |
| `total_amount`             | money  | ✓        | "Montant total à rembourser"                     |
| `installments_count`       | number | ✓        | 2-60                                             |
| `installment_amount_std`   | money  | ✓        | "Montant standard par échéance"                  |
| `installment_amount_final` | money  | optional | auto-calculé si vide = total − std × (count − 1) |
| `payment_day`              | number | ✓        | 1-31                                             |
| `start_date`               | date   | ✓        | "Date de la 1ère échéance"                       |
| `notes`                    | text   | optional | contexte libre                                   |

**Helper texte vivant** (preview en bas du drawer) : « Avec ces réglages, tu rembourseras 2 407 € en 11 mensualités de 220 € (sauf la dernière 207,93 €) à partir du 15 mai 2026, soit jusqu'au 15 mars 2027. »

### 7. Empty state (avant création du 1er plan)

Card collapsed avec illustration discrète + texte rassurant :

> **Tu n'as pas de plan d'apurement actif.**
> Si tu rembourses un crédit, un arriéré fiscal, une amende étalée — déclare-le ici pour le suivre dans Ankora.
>
> [+ Créer mon premier plan]

### 8. Insight pédagogique sur la fin du plan

Quand un plan approche de sa fin (`installments_remaining ≤ 3`), Ankora affiche un nudge contextualisé :

> 🎉 **Plus que 2 échéances avant la fin de ton plan Impôt 2026.**
> Quand ce sera fini (15 mars 2027), tu débloques 220 €/mois supplémentaires pour ton matelas ou un autre objectif.

Ce nudge est calculé côté `domain/installment-plans.ts` (fonction pure) à partir des paramètres du plan + date courante.

---

## Conséquences positives

- ✅ **Clarté pédagogique** : un plan agrégé en une seule card vs disséminé en N transactions.
- ✅ **Cohérence data model** : chaque échéance reste une `transaction` (héritage des features ADR-016 status / toggle Payé / présomption auto J+3).
- ✅ **Différenciation produit** : feature spécifique au contexte belge (apurements fiscaux courants), aucun concurrent direct.
- ✅ **Cascade FK propre** : suppression plan = suppression échéances ; soft delete via `cancelled_at` pour audit.
- ✅ **Pause temporaire** : `paused_until` permet de gérer un rééchelonnement négocié (ex: période de chômage).
- ✅ **Direction OUT/IN** : couvre aussi les restitutions trop-perçu fiscal (rare mais réel).
- ✅ **Domain pur testable** : génération des échéances + calcul progression + nudges = fonctions déterministes.

## Conséquences négatives

- ❌ **Complexité ajoutée** : nouvelle entité = 1 table + 2 colonnes sur `transactions` + Server Actions dédiées. Mitigation : scope clair, tests Vitest exhaustifs (≥ 25 cas).
- ❌ **Risque de doublon UX** : un utilisateur peut créer un plan d'apurement ET déclarer chaque échéance comme charge récurrente mensuelle. Mitigation : badge "Auto-généré par plan d'apurement" sur les transactions issues d'un plan + désactivation édition individuelle (édition se fait au niveau du plan parent).
- ❌ **Edge case dernier paiement ajustement** : `installment_amount_final` non égal à `installment_amount_std`. Validation : la somme des N échéances DOIT égaler `total_amount` à 0,01 € près.
- ❌ **Pause complexe à modéliser** : si l'utilisateur active `paused_until`, les échéances entre la date courante et `paused_until` doivent être décalées. Logique non triviale, à documenter en sous-règle. Mitigation : scope V1 = pas de feature pause dans l'UI (champ existe en DB mais non éditable côté UI). Pause = V1.1.

---

## Alternatives évaluées

### Alternative 1 — Modéliser comme N charges récurrentes mensuelles avec date de fin

Créer N entrées `recurring_templates` avec frequency `mensuelle` + `end_date` programmée.

**Rejetée** : `recurring_templates` est conçu pour des charges **infinies** (loyer, abonnement). Ajouter `end_date` complique la table et le moteur de cron `tick_recurring_templates`. De plus, l'UX agrégée (vue d'ensemble du plan) serait perdue.

### Alternative 2 — Modéliser comme une seule charge avec montant total et auto-divider

Ne stocker que le `total_amount` et calculer les échéances à la volée à partir de `installments_count` + `payment_day`.

**Rejetée** : impossible de tracker l'avancement par échéance (status `paid` / `pending` par échéance). Le toggle Payé pattern Coda exige une transaction par échéance.

### Alternative 3 — Modéliser comme N transactions individuelles SANS plan parent

Créer juste N transactions `pending` avec un libellé partagé (ex: "Impôt 2026 · 1/11").

**Rejetée** : impossible d'avoir l'agrégation visuelle (vue d'ensemble du plan en une card). L'utilisateur voudrait modifier le plan d'un coup (ex: changer le payment_day), pas chaque transaction individuellement.

### Alternative 4 — Inclure dans `recurring_templates` avec un type `installment_plan`

Discriminer via une colonne `template_type` enum ('recurring' | 'installment').

**Rejetée** : pollution de schéma. Les charges récurrentes et les plans d'apurement ont des contraintes différentes (durée infinie vs finie, montant fixe vs ajustable, end_date NULL vs calculé). Mieux vaut 2 tables avec une vue UNION si besoin.

---

## Plan d'implémentation

### PR-D5 (onboarding + édition mouvements + plans d'apurement)

1. **Migration Supabase** :
   - Création table `installment_plans` + RLS workspace-scoped + index
   - Ajout colonnes `installment_plan_id` + `installment_index` sur `transactions` + index
   - Update CHECK transactions pour cohérence amount selon direction du plan parent

2. **Domain pur** (`src/lib/domain/installment-plans/`) :
   - `validatePlanInput(input)` : Zod schema strict
   - `computeInstallments(plan)` : génère les N échéances avec date_planned + amount
   - `computeProgress(plan, transactions)` : retourne {paid_count, paid_amount, remaining_count, remaining_amount, percent}
   - `computeNextEchéance(plan, transactions, today)` : retourne la prochaine échéance pending
   - `computeFinishNudge(plan, transactions, today)` : retourne le message si ≤ 3 échéances restantes
   - Tests Vitest ≥ 25 cas couvrant : 11 échéances avec ajustement final, 6 échéances égales, restitution direction in, edge case dernier paiement = std (pas d'ajustement), durée 60 mois max, etc.

3. **Server Actions** :
   - `createInstallmentPlan(input)` avec Zod parse + audit log + génération transactions
   - `updateInstallmentPlan(id, patch)` avec audit log + regen transactions si `installments_count` ou `start_date` change
   - `cancelInstallmentPlan(id, reason)` avec soft delete + audit log
   - `markInstallmentPaid(transactionId, paidDate)` réutilise pattern ADR-016

4. **UI** :
   - `InstallmentPlansBlock` (Surface 1 entre Activité récente et Tes Signaux) — déjà livré par Claude Design en Bloc B
   - `InstallmentPlanCard` (sub-component pour chaque plan)
   - `InstallmentPlanCreateDrawer` (réutilise EditDrawer atom)
   - `InstallmentPlanDetailDrawer` (drilldown avec liste N échéances + actions modify/delete)

5. **i18n** : ~25 nouvelles clés `messages/{fr-BE,en}.json`

6. **Tests E2E Playwright** :
   - Création plan apurement Impôt 11 échéances → vérification 11 transactions générées
   - Toggle Payé sur 5/11 échéances → progression 45,7 % affichée correctement
   - Suppression plan → cascade delete des transactions associées
   - Edge case ajustement final différent de std

7. **Agents QA** : `financial-formula-validator`, `rls-flow-tester`, `security-auditor`, `i18n-auditor`, `mobile-ios-auditor`

---

## Risques

- **Risque 1 — Cohérence amount plan ↔ somme transactions** : si un user édite manuellement le montant d'une échéance, l'invariant `Σ amounts = total_amount` casse. Mitigation : édition d'une échéance individuelle DÉSACTIVÉE côté UI (édition se fait au niveau du plan parent qui regénère les transactions).
- **Risque 2 — Pause `paused_until` non implémentée V1** : champ DB existe mais pas d'UI. Risque qu'un développeur futur l'expose sans prendre en compte la complexité du décalage des échéances. Mitigation : commentaire SQL explicite + ADR-017 sous-règle "pause = V1.1".
- **Risque 3 — Direction `in` (restitutions) sous-utilisée** : peut-être un cas rare, risque de complexité inutile. Mitigation : garder le champ direction en DB mais ne pas le mettre en avant dans l'UI V1 (defaults sur `out`). Si feedback user, on le sortira en V1.1.
- **Risque 4 — Limite `installments_count` 60 mois** : un crédit immobilier peut aller jusqu'à 360 mois (30 ans). Mitigation : V1 limite 60 mois (5 ans) — couvre 95% des cas (apurements fiscaux, plans accordés). V1.1 si feedback : étendre à 360 (mais générer 360 transactions est lourd, alternative = stocker juste le plan sans transactions et calculer à la volée).

---

## Métriques de succès

À mesurer 4 semaines post-PR-D5 :

- **Taux de création de plan d'apurement** : % de workspaces avec ≥ 1 plan actif. Cible ≥ 30 % (signal que la feature est utilisée par les profils en tension financière).
- **Compréhension UX** : enquête NPS sur la card Plans d'apurement. "Tu vois clairement où tu en es ?" Cible ≥ 80 % oui.
- **Délai création → 1ère échéance payée** : médiane jours entre création plan et toggle Payé sur 1ère échéance. Cible ≤ 35 jours (cohérent avec un plan mensuel).
- **Taux d'abandon plan (cancelled_at)** : % de plans annulés avant la fin. Cible ≤ 10 %.
- **Nudge "fin du plan" effectivité** : taux de hover sur le nudge dans les 3 derniers mois du plan. Cible ≥ 50 %.

---

## Décision finale

À valider explicitement par @thierry. Statut `Proposed` jusqu'à confirmation en chat session ou par PR de merge de cet ADR. La validation implicite est déjà actée via la livraison Bloc B Surface 1 + Bloc D Étape 3 plan apurement optionnel par Claude Design 2026-05-08/09.

---

## Mises à jour de cet ADR

| Date       | Auteur              | Changement                          |
| ---------- | ------------------- | ----------------------------------- |
| 2026-05-09 | cowork-orchestrator | Création initiale (statut Proposed) |
