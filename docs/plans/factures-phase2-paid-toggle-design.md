# Factures Phase 2 — Payé toggle + paid-aware summary + dashboard trim + redesign

> Plan @cc-ankora 2026-06-04. À valider par `plan-reviewer` avant tout code.
> Demande @thierry (informelle) : « on n'a rien pour valider qu'un paiement a
> été effectué » + « trop de factures du mois prochain » sur le dashboard +
> redesign visuel validé. Inspiration : son tableau Coda (Payé / Montant payé /
> Solde restant) — **sans le copier**.

## Goal

Brancher l'UI manquante sur le backend de paiement **déjà construit + testé**
(`togglePaymentAction`), refléter l'état payé, trimmer le bucket dashboard
« Mois prochain », et appliquer le redesign visuel validé visuellement.

## Contexte (code-vérifié, 2026-06-04)

- **Backend EXISTE, aucune UI ne l'appelle** (grep `.tsx` = 0 match) :
  - `src/lib/actions/charge-payments.ts` → `togglePaymentAction(input)` →
    `ActionResult<{ paid, paidAmount }>`. Toggle idempotent (INSERT=payé /
    DELETE=non payé). Authz workspace **avant** write, rate-limit `mutation`,
    audit `CHARGE_PAYMENT_TOGGLED`, `revalidateDashboard()` + `revalidateAppPath('charges')`.
  - Schéma `chargePaymentToggleSchema` : `{ chargeId(uuid), periodYear(2000-2100),
periodMonth(1-12), paidAmount?(optional), note? }`. `paidAmount` omis →
    défaut `charges.amount` côté action. **Le toggle simple n'envoie que
    `{chargeId, periodYear, periodMonth}`.**
  - Domaine `charge-payments/{mark-paid,queries,types}` + tests. Migration
    `20260503000004_pr_d1_charge_payments.sql` (RLS workspace).
- **Snapshot** (`workspace-snapshot.ts`) expose `currentMonthPayments:
Array<{chargeId, periodYear, periodMonth, paidAmount...}>` (mois courant
  uniquement) + `currentPeriod {year, month}` (TZ Europe/Brussels).
- **Charges page** (`charges/page.tsx`) passe charges/subtotals/totals —
  **aucune donnée paiement** aujourd'hui.
- **Dashboard buckets** (`ProchainesFacturesCard` + `getUpcomingCharges`) :
  labels `overdue="En retard"`, `j7="Cette semaine"`, `j14="Ce mois-ci"`,
  `j30="Mois prochain"`. `j30` liste TOUTES les factures dues à 15–30 j
  (12 chez @thierry) → cause du « trop de factures ».

## Scope (MVP — toggle simple, validé @thierry)

1. **Toggle « Payé / À payer »** sur la page charges, par facture **due ce
   mois** (`paymentMonths.includes(currentPeriod.month)`). Appelle
   `togglePaymentAction({chargeId, periodYear: currentPeriod.year,
periodMonth: currentPeriod.month})`. État optimiste local (seedé depuis
   `paidChargeIds`), `useTransition`; revert + toast sur erreur. Factures non
   dues ce mois : pas de toggle (futur).
2. **Style payé + résumé « ce mois »** : ligne payée = ✓ + montant atténué.
   Petite ligne de résumé distincte du total lissé : « X/Y factures payées ce
   mois · reste {montant} » (dérivé des factures dues ce mois). **Ne touche pas**
   au total « Effort mensuel lissé » / « Équivalent annuel » (métrique
   différente, lissage ≠ cash du mois).
3. **Trim dashboard** : `ProchainesFacturesCard` plafonne chaque bucket à
   `MAX_VISIBLE = 4` lignes + « +N autres » (le lien « Voir toutes » existe
   déjà dans le header). Corrige le « mois prochain » à 12 lignes.
4. **Redesign visuel validé** : `<ul>` encadré arrondi par groupe fréquence ;
   en-tête groupe = icône `Repeat` neutre + fréquence + **compteur** ;
   **sous-total déplacé en bas** du groupe, **coloré brand**
   (`text-brand-700` light / token brand dark). Dark mode vérifié. **Conserve
   tous les testids** (`charges-group-*`, `charges-group-subtotal-*`,
   `charges-row-*`, `charges-total`), le groupement, le CRUD, le total global.

## Non-goals

- Montant partiel (`paidAmount` override) → Phase 3 si besoin réel.
- Toggle inline sur la carte dashboard → fast-follow (la page charges est la
  surface de gestion primaire).
- Marquer payé pour une période future (mois courant uniquement).

## Fichiers touchés

- `src/app/[locale]/app/charges/page.tsx` — passer `paidChargeIds: string[]`
  (depuis `snapshot.currentMonthPayments.map(p => p.chargeId)`) + `currentPeriod
{year, month}` à `ChargesClient`.
- `src/app/[locale]/app/charges/ChargesClient.tsx` — (a) redesign liste/groupes/
  sous-totaux ; (b) toggle Payé par ligne due ce mois (état optimiste
  `useState<Set<string>>` seedé, `useTransition` + `togglePaymentAction`) ;
  (c) résumé « ce mois » payé/reste. Conserver tous les testids + le
  `renderChargeRow` responsive existant (adapter, pas réécrire à zéro).
- `src/components/dashboard/ProchainesFacturesCard.tsx` — `MAX_VISIBLE` slice +
  « +N autres ».
- `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` — clés :
  `app.charges.{paidToggleAria, unpaidToggleAria, markedPaidToast,
markedUnpaidToast, togglePaidFailed, paidSummary, dueThisMonthBadge?}` +
  `dashboard.upcomingBills.moreCount`. NL/DE/ES traduits (glossaire, registre).
- Tests : `ChargesClient` (toggle on/off optimiste + erreur revert, style payé,
  résumé), `ProchainesFacturesCard` (cap + overflow count), wiring action
  (mock `togglePaymentAction`).

## Logique période

- `currentPeriod` = `snapshot.currentPeriod` (déjà calculé, TZ Brussels).
- `paidChargeIds` = `new Set(snapshot.currentMonthPayments.map(p => p.chargeId))`
  (déjà filtré mois courant côté snapshot).
- Toggle visible ssi `c.paymentMonths.includes(currentPeriod.month)` (RawCharge
  porte déjà `paymentMonths`).
- Optimisme : flip local du Set ; si `result.ok === false` → revert + toast
  `translateError(result.errorCode)`.

## Sécurité / risk tiering

Voie LOURDE-light : appelle une Server Action **existante** (aucune modif de
l'action / RLS / domaine / migration). `plan-reviewer` (ce doc) + QA ciblés :
`dashboard-ux-auditor`, `mobile-ios-auditor` (toggle = touch target 44px),
`i18n-auditor` (nouvelles clés ×5), `security-auditor` (chemin d'appel action :
pas de `chargeId` trusté côté client au-delà de ce que l'action revérifie ;
confirmer authz inchangée). `financial-formula-validator` non requis (aucune
math domaine ; résumé = sommes simples). `rls-flow-tester` non requis (pas de
migration/RLS touchée).

## DoD

`typecheck` · `lint` · `lint:use-server` · `test` · `build` · QA agents ·
Sourcery silencieux · DoD5. Validation visuelle @thierry sur preview Vercel
(desktop + mobile, light + dark).

## Découpage

Un seul PR « feat(charges): Phase 2 — Payé toggle + redesign + dashboard trim »
si < ~550 lignes. Si dépassement → split : (PR-A) charges page toggle+redesign,
(PR-B) dashboard trim. Estimation : ~400–500 lignes → un PR.

## Changements plan-reviewer intégrés (🟡 APPROVED WITH CHANGES, 2026-06-04)

- **CR-1 — état optimiste (le + important)** : utiliser **`useOptimistic`**
  (React 19) et NON un `useState<Set>` seedé une fois. Base = `paidChargeIds`
  (prop serveur, re-synchronisée à chaque `revalidateAppPath('charges')`). Le
  reducer flippe un `chargeId` ; après la transition + revalidation, React
  réconcilie automatiquement vers la vérité serveur (rollback natif sur erreur,
  puisque la DB n'a pas changé → `paidChargeIds` inchangé). Toast d'erreur si
  `result.ok === false`. Zéro double-source-of-truth.
- **CR-2 — limite assumée (ajout Non-goals)** : une facture en retard
  (`overdue` au dashboard) dont `paymentMonths` n'inclut PAS le mois courant
  n'aura **pas** de toggle sur la page charges en Phase 2 (toggle = mois
  courant only). Limite UX assumée, pas un bug.
- **CR-3 — tests existants à adapter (nommés)** :
  - `ChargesClient.test.tsx:~121` « exactement 1 listitem par charge » → le
    toggle vit DANS le `<li>` existant, aucun `<li>`/`role=listitem` parasite.
  - `e2e/charges/charges-list-desktop.spec.ts:95,121` baseline grid ≤ 6px →
    re-vérifier si `renderChargeRow` change de colonnes (préférer **ne pas**
    ajouter de 7e colonne : intégrer le toggle dans une cellule existante / en
    tête de ligne pour préserver l'alignement baseline 6 colonnes).
  - `e2e/charges/charges-list-mobile.spec.ts:66-68` (pas de `rounded-lg`/
    `bg-card`/`p-4` sur la row) → le `rounded` s'applique au `<ul>` du groupe,
    PAS à la `<li>`.
  - `ChargesClient.test.tsx:365-407` parité i18n → **étendre** la liste des clés
    attendues aux nouvelles clés ×5 locales (sinon parité NL/DE/ES non gated).
- **CR-4 — commits atomiques** (même PR unique) : (1) redesign visuel liste/
  sous-totaux ; (2) toggle Payé + wiring action + résumé ; (3) trim dashboard.
  Revert granulaire possible.
