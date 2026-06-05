# Epic « Factures cohérentes » — spec

> spec-translator 2026-06-04. Demande informelle @thierry → spec structurée.
> CC Ankora exécute (plan-reviewer par PR touchant migration/Server Action).

## Diagnostic (vérifié, lecture seule prod)

- **Cause racine data** : migration `20260503000002_pr_d1_charges_enrichments.sql`
  (l.57-60) a backfillé `payment_months = array[due_month]` pour les
  non-mensuelles → une charge `quarterly` avec `due_month=1` a `payment_months=[1]`
  au lieu de `[1,4,7,10]`. D'où **S.W.D.E (eaux) « janv. 2027 »**. La fonction
  `paymentMonthsFromFrequency` est correcte ; les données n'ont jamais été
  recalculées avec.
- **Cause logique** : `nextDueDateForCharge` (l.37-52) roule toujours vers
  l'occurrence FUTURE (`offset===0 && day<refDay` → skip). Une échéance du mois
  courant dont le jour est passé + non payée **saute** → cache le retard.
- Workspace @thierry = 19 charges, **propre** (les « Crédit travaux » sont chez
  un autre user, RLS OK — confirmé).

## Découpage (4 PRs séquencées, < ~550 lignes chacune)

### PR-A — Cadence correcte + vue période courante _(voie LOURDE : migration + domaine)_

- **Migration backfill** : recompute `payment_months` via
  `paymentMonthsFromFrequency(frequency, due_month)` pour les charges
  incohérentes (corrige S.W.D.E ; n'altère pas les mensuelles `[1..12]`).
- **Domaine** `currentPeriodDueDate(charge, year, month)` (pur, NOUVEAU,
  distinct de `nextDueDateForCharge` qu'on ne touche PAS — 7 call-sites) :
  retourne l'occurrence du mois courant sans rouler en avant. États : dû ce
  mois / en retard non payé / payé / futur.
- **UI** charges : `nextDueLabel` utilise `currentPeriodDueDate` + badge « en
  retard » si jour passé & non payé. `getUpcomingCharges` (dashboard) : injecte
  les occurrences intra-mois passées non payées dans `overdue`.
- **Carry** : le redesign liste + le toggle Payé (déjà construits sur la branche
  `feat/charges-phase2-paid-toggle` / PR #221, NON mergée) sont portés ici ; le
  **trim rejeté est retiré**.
- i18n : `app.charges.{dueDateOverdue, dueDateThisMonth}` ×5.
- QA : plan-reviewer, financial-formula-validator, rls-flow-tester, dashboard-ux, mobile-ios, i18n, test-runner.
- **Non-goals** : ne pas modifier `nextDueDateForCharge`, ni le form création/édition.

### PR-B — Marqueur « à surveiller » + dashboard remanié _(voie LOURDE : migration + Server Action)_

- **Migration** : `ALTER TABLE charges ADD COLUMN is_watched boolean NOT NULL DEFAULT false`.
- **Schéma/types/snapshot/actions** : `isWatched` dans `chargeInputSchema`,
  `ChargeRecord`, `Charge`, snapshot SELECT ; nouvelle Server Action
  `toggleWatchAction` (authz workspace, rate-limit, audit `CHARGE_WATCH_TOGGLED`,
  revalidate). `useOptimistic` côté UI.
- **UI** : bouton « À surveiller » inline (icône bookmark, 44px). Dashboard :
  bucket `j30 "Mois prochain"` **remplacé** par bucket `watched` (charges
  `is_watched` non payées). « Ce mois-ci » = **5 non-payées par date** + montant
  = **reste à payer** (dues-ce-mois non cochées) + mot d'explication.
- i18n : `watchAria, unwatchAria, toastWatched, toastUnwatched`, `errors.charges.watchFailed`, `dashboard.upcomingBills.buckets.watched` ×5.
- QA : plan-reviewer, security-auditor, rls-flow-tester, dashboard-ux, mobile-ios, i18n, test-runner.

### PR-C — Reset checkboxes + alerte oubli _(LOURDE si cron / LÉGÈRE si manuel)_

- **Reset** : `resetPeriodPaymentsAction(year, month)` (DELETE charge_payments
  du workspace pour la période ; authz, rate-limit, audit) + bouton
  « Réinitialiser le mois » + dialog de confirmation.
- **Alerte oubli** : `getOverdueUnpaidCount(charges, payments, period, today)`
  (pur) → bandeau dashboard « {N} factures oubliées du mois précédent ».
- i18n : `resetPeriodButton, resetPeriodConfirm, resetPeriodDone`, `dashboard.upcomingBills.overdueAlert` ×5.
- QA : security-auditor (DELETE bulk), dashboard-ux, i18n, test-runner.

### PR-D — CadenceField (THI-301) _(voie LÉGÈRE, plan-reviewer déjà ✅ APPROVED)_

- Reprise directe du plan THI-301 (éditeur de cadence précis → @thierry fixe
  ancre + jour réels ; re-sauver corrige `payment_months`). Réf : handoff
  `2026-06-01-2145-thi-300-charges-totals-grouping.md` / mémoire `project_thi301_cadencefield_inflight`.

## Décisions @thierry (VERROUILLÉES 2026-06-05)

- **A. Nom marqueur** : `is_watched` (tranché CC, sémantique claire).
- **B. Reset** : ✅ **manuel + alerte oubli** (bouton « Réinitialiser le mois » + confirmation ; PAS d'auto-cron en v1 — auto = opt-in post-launch).
- **C. Toggle watch** : ✅ **bouton inline** sur la ligne (cohérent avec le toggle Payé, `useOptimistic`).

## Nuance cadence (clé pour PR-A + PR-D)

- Trimestriel/semestriel = tous les N mois **à partir de l'ancre `due_month`**,
  PAS universellement 3/6/9/12. Ex : S.W.D.E réel (ancre mai) = `[2,5,8,11]` ;
  ancre janvier → `[1,4,7,10]` ; ancre mars → `[3,6,9,12]`.
- Le **backfill PR-A** recompute depuis le `due_month` STOCKÉ (souvent faux —
  S.W.D.E a `due_month=1` → `[1,4,7,10]`) : il **dé-casse** (rend vraiment
  trimestriel, fin du « janv. 2027 ») mais ne devine PAS la bonne ancre.
  @thierry fixe l'ancre réelle via **CadenceField (PR-D)**.
- **UX critique PR-D** : @thierry trouve les fréquences déroutantes (verbatim
  2026-06-05). CadenceField doit être SIMPLE — idéalement **choix direct des
  mois** OU « payé tous les X mois à partir de [mois] » avec **aperçu clair des
  prochaines dates** — sans exiger de comprendre l'arithmétique d'ancrage.
- CRUD complet exigé sur ces données (modifier/adapter/supprimer) — @thierry corrige ses dates lui-même.

## Ordre d'exécution recommandé

**PR-A d'abord** (corrige les dates + le « juillet avant juin » = le plus
impactant), puis B, C, D. PR-D (CadenceField) peut se paralléliser (indépendant).

## DoD (par PR)

CI verte · Sourcery silencieux · review @thierry · pas de conflit main ·
rapport `docs/prs/PR-epic-factures-<X>-report.md`.

## Smoke @thierry post-merge

- PR-A : `/app/charges` en juin → S.W.D.E n'affiche plus « janv. 2027 » ; charge
  mensuelle jour passé non payée = badge « en retard » ; dashboard la montre en « En retard ».
- PR-B : marquer une facture « à surveiller » → apparaît dans la section dashboard dédiée ; décocher → disparaît.
- PR-C : cocher 2 payées → « Réinitialiser le mois » → décochées ; lendemain sans cocher → badge « N oubliées ».
