# PR-B — Page charges : période courante + carry #221 (THI-329)

> Plan @cc-ankora 2026-06-06. Epic « Factures cohérentes » (spec : `docs/plans/epic-factures-coherentes-spec.md`).
> À valider par `plan-reviewer` avant tout code (touche domaine + UI > 50 lignes).

## Goal

La page `/app/charges` reflète la **réalité du mois courant** par facture (payée / en retard / due ce mois / à venir) au lieu de rouler prématurément vers l'occurrence suivante (« juillet avant juin »), et expose le toggle Payé + le redesign déjà construits sur #221.

## Diagnostic (code-vérifié 2026-06-06)

- **`ChargesClient.tsx` (main)** affiche par ligne `nextDueLabel(c)` → `nextDueDateForCharge(charge, todayIso)` (l.183-194). Cette fonction **roule toujours en avant** : une charge mensuelle dont juin est passé/payé affiche **juillet**. C'est la cause exacte du « tu affiches juillet avant juin » sur la page (verbatim @thierry P5).
- **#221 (`feat/charges-phase2-paid-toggle`, OPEN, 461+/20−)** a construit + QA'd : toggle Payé (`useOptimistic` + `togglePaymentAction` existant/testé), style payé (line-through), résumé « Payées ce mois : x/y · reste {montant} », redesign groupes (header `Repeat` + compteur, `<ul>` arrondi bordé, sous-total **sous** la liste coloré `brand-700`), `paidHint`. **MAIS `nextDueLabel` y utilise encore `nextDueDateForCharge`** → le bug date persiste même avec le toggle (marquer juin payé tout en affichant « juillet » = incohérent). C'est pourquoi carry #221 **et** fix date doivent shipper ensemble.
- **#221 trim** (`ProchainesFacturesCard` plafonné à 4 + « +N autres », clé `dashboard.upcomingBills.moreCount`) = **REJETÉ @thierry** (veut un marqueur « à surveiller », PR ultérieure). NON carry.
- **Faits git réels (CR-1, vérifiés 2026-06-06)** : la session courante est sur la branche `feat/thi-329-payment-aware-due-date` (= #223, HEAD `b97c248`), c'est pourquoi PR-A est présent sur le disque. **`origin/main` (`d1a2b4d`) n'a PAS PR-A** : `next-unpaid-due-date.ts` absent, `index.ts` exporte `upcoming` (pré-existant THI-192) mais pas `nextUnpaid`/`currentPeriod`. **PR-B branche depuis `origin/main`** (`git checkout main` d'abord), donc un main SANS PR-A. L'indépendance tient : `currentPeriodDueDate` (nouveau) + le carry #221 ne dépendent PAS de `nextUnpaidDueDate`/`upcoming.ts`. Conflit au 2e merge = uniquement le bloc d'exports `index.ts` (#223 ajoute `nextUnpaid`, PR-B ajoute `currentPeriod`) → trivial, **garder les deux**.
- **Deps de carry confirmées sur `origin/main`** : `togglePaymentAction` (`src/lib/actions/charge-payments.ts:46`), snapshot `rawCharges`/`currentMonthPayments`/`currentPeriod` (`workspace-snapshot.ts:99/123/131`), `ChargeEditDrawer.tsx`. Le carry depuis main n'amène que le câblage UI (ChargesClient + page + test + clés i18n).
- **Snapshot** (`workspace-snapshot.ts`) expose déjà `rawCharges`, `currentMonthPayments` (mois courant, scoping serveur), `currentPeriod {year, month}` (Europe/Brussels). `togglePaymentAction` (`src/lib/actions/charge-payments.ts`) : authz workspace avant write, rate-limit `mutation`, audit `CHARGE_PAYMENT_TOGGLED`, revalidate. **Déjà construit + testé** — PR-B le câble seulement (pas de nouvelle Server Action, pas de migration).

## Domaine — `currentPeriodDueDate` (NOUVEAU, pur)

`src/lib/domain/charges/current-period-due-date.ts`. Pur TS (pas de Decimal, pas de DB). Helpers `daysInMonth/pad2/pad4` locaux au fichier (cohérent avec `next-due-date.ts` / `next-unpaid-due-date.ts` ; extraction d'un util partagé = chore différé post-merge #223, quand les 3 résolveurs sont sur `main` — endorsé financial-formula-validator O3).

```ts
export type CurrentPeriodCharge = Readonly<{
  paymentMonths: readonly number[];
  paymentDay: number;
  isActive: boolean;
}>;

export type ChargePeriodStatus = 'paid' | 'overdue' | 'dueThisMonth' | 'upcoming';

export type CurrentPeriodDueResult = Readonly<{
  /** Date à afficher (ISO YYYY-MM-DD). Mois courant si dû ce mois, sinon prochaine occurrence. */
  dueDateIso: string;
  status: ChargePeriodStatus;
}>;

/**
 * Statut de l'occurrence ANCRÉE au mois courant (ne roule PAS en avant quand
 * la charge est due ce mois) :
 *  - dû ce mois + payé           → 'paid'        (date = ce mois)
 *  - dû ce mois + jour passé +!payé → 'overdue'  (date = ce mois)
 *  - dû ce mois + jour à venir   → 'dueThisMonth'(date = ce mois)
 *  - pas dû ce mois              → 'upcoming'    (date = prochaine occurrence réelle)
 * Renvoie null si inactive ou paymentMonths vide (le call-site retombe sur
 * formatMonth(dueMonth), comportement existant).
 */
export function currentPeriodDueDate(
  charge: CurrentPeriodCharge,
  period: Readonly<{ year: number; month: number }>,
  todayIso: string,
  isPaid: boolean,
): CurrentPeriodDueResult | null;
```

**Algo** : si `!isActive` ou `paymentMonths.length===0` → null. Scan `offset` 0..23 depuis `(period.year, period.month)` ; première occurrence dont le mois ∈ `paymentMonths`. Si `offset===0` (le mois courant EST un mois de paiement) → date = ce mois (clamp jour), statut **`paid` si `isPaid` (priorité absolue), sinon** `overdue` si `dueDateIso < todayIso`, sinon `dueThisMonth`. Si `offset>0` → date = cette occurrence future, statut `upcoming` (`isPaid` ignoré). Comparaison overdue = lexicale ISO (cohérent `next-unpaid-due-date.ts`).

**Invariant ledger (CR-2) — à documenter en JSDoc** (calqué sur `next-unpaid-due-date.ts:14-20`) : `isPaid` est un scalaire **scopé au mois courant** `(period.year, period.month)` uniquement — le call-site le dérive de `optimisticPaid.has(c.id)`, et le ledger snapshot (`currentMonthPayments`) est **mono-mois**. Ne JAMAIS passer un `isPaid` d'une occurrence future (statut `upcoming` ignore `isPaid` par construction). **Différence délibérée avec `nextUnpaidDueDate`** : ce résolveur **ancre** au mois courant et se contente de le **labelliser** `paid` (il ne saute pas l'occurrence payée) ; `nextUnpaidDueDate` **saute** les occurrences payées via une Map. Documenter cette divergence pour éviter une fusion incorrecte des deux résolveurs lors d'un refactor futur.

## Scope (fichiers exacts)

| Fichier                                                            | Action                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/charges/current-period-due-date.ts`                | **NEW** — fonction ci-dessus                                                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/domain/charges/__tests__/current-period-due-date.test.ts` | **NEW** — TDD (voir tests)                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/domain/charges/index.ts`                                  | export `currentPeriodDueDate` + types                                                                                                                                                                                                                                                                                                                                                                   |
| `src/app/[locale]/app/charges/page.tsx`                            | **carry #221** : `paidChargeIds` + `currentPeriod`                                                                                                                                                                                                                                                                                                                                                      |
| `src/app/[locale]/app/charges/ChargesClient.tsx`                   | **carry #221** intégral, PUIS remplacer `nextDueLabel`→`currentPeriodDueDate` + badge « En retard » sur ligne `overdue` ; retirer import `nextDueDateForCharge`                                                                                                                                                                                                                                         |
| `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx`    | **carry #221** + tests badge overdue / date mois-courant / paid                                                                                                                                                                                                                                                                                                                                         |
| `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json`                       | **NEW** (vérifiés absents des 5 locales de main) `app.charges.{toastMarkedPaid,toastMarkedUnpaid,markPaidAria,unmarkPaidAria,paidSummary,paidHint,statusOverdue}` ; **déjà sur main, ne pas ré-ajouter** `errors.charges.payments.toggleFailed` (présent sur les 5 locales d'origin/main) ; **NE PAS carry** `dashboard.upcomingBills.moreCount` (CR-3 : n'existe que sur #221, rien à retirer de main) |

**Carry mécanique** : `git checkout main` PUIS `git checkout -b feat/cc-charges-current-period`, puis `git checkout origin/feat/charges-phase2-paid-toggle -- "src/app/[locale]/app/charges/ChargesClient.tsx" "src/app/[locale]/app/charges/page.tsx" "src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx"` (récupère le travail #221 testé sans le retaper). **Gate CR-4** : juste après le checkout, lancer `npm run typecheck` — ça surface immédiatement tout import présent uniquement sur #221 (avant d'empiler les modifs date/badge). Messages : **ajout manuel ciblé** des clés ci-dessus, **dans le même commit que le client carry**, sur les **5 locales** (sinon `i18n-auditor` + hydratation/tests échouent). PUIS layer `currentPeriodDueDate` + badge + retrait import `nextDueDateForCharge`. **NE PAS** carry `ProchainesFacturesCard.tsx` (= reste la version `main`, sans trim).

## Badge UI

Ligne `overdue` (due ce mois, jour passé, non payée) : petit badge texte `app.charges.statusOverdue` (« En retard ») en `text-danger`, à côté de la date. `paid` : déjà signalé par le toggle ✓ + amount line-through (#221) — pas de badge texte supplémentaire. `dueThisMonth` / `upcoming` : date seule. Tokens sémantiques only, pas d'inline style (CSP). Mobile-first.

## Tests (TDD)

**Domaine** (`current-period-due-date.test.ts`) : dû ce mois jour passé non payé→`overdue` (date=ce mois, PAS le mois suivant) ; dû ce mois jour à venir non payé→`dueThisMonth` ; **payé bat overdue** (jour passé + `isPaid`→`paid`) ; **payé bat dueThisMonth** (jour à venir + `isPaid`→`paid`) ; mensuel juin payé→reste juin `paid` (ne roule PAS en juillet) ; trimestriel [1,4,7,10] en juin→`upcoming` juillet ; annuel [3] en juin→`upcoming` mars N+1 ; clamp 31 fév→28/29 ; inactive→null ; paymentMonths vide→null ; passage année.

**UI** (`ChargesClient.test.tsx`, carry + ajouts) : badge « En retard » rendu pour charge overdue ; pas de badge si dueThisMonth/upcoming ; ligne mensuelle due ce mois affiche le mois courant (pas le suivant) ; toggle Payé bascule overdue→paid (badge disparaît). Conserver tous les testids #221.

## Non-goals

- Pas de modif `nextDueDateForCharge` (les autres call-sites le gardent), `next-unpaid-due-date.ts` (#223), `togglePaymentAction`, schéma, migration.
- Pas le trim / `moreCount` / `ProchainesFacturesCard`.
- Pas le marqueur `is_watched` ni le remaniement dashboard « Ce mois 5 / À surveiller » → PR suivante.
- Pas d'extraction du util date partagé (chore différé post-merge #223).

## Risk tiering / QA — voie LOURDE (domaine + UI métier)

`plan-reviewer` (ce doc) → `financial-formula-validator` (currentPeriodDueDate) → `dashboard-ux-auditor` (page charges) → `mobile-ios-auditor` (toggle 44px, badge, safe-area) → `i18n-auditor` (parité 5 locales + drop moreCount cohérent) → `test-runner`. Pas de `security-auditor`/`rls-flow-tester` (aucune action/RLS/migration nouvelle).

## DoD

CI verte · `lint:use-server` OK · Sourcery silencieux/résolu · review @thierry · pas de conflit `main` · rapport (corps PR). Smoke : `/app/charges` en juin → charge mensuelle payée affiche juin payé (pas juillet) ; charge jour passé non payée = badge « En retard » ; toggle bascule l'état ; trimestriel hors-mois = prochaine date réelle.
