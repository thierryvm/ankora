# PR-A — Cadence backfill + payment-aware due-date (THI-329 + epic factures)

> Plan @cc-ankora 2026-06-05. Voie LOURDE (migration + domaine) → plan-reviewer obligatoire.
> Ticket : THI-329 (statut payé + next-due qui ignore les occurrences payées).
> Spec epic : `docs/plans/epic-factures-coherentes-spec.md`.

## Goal

Corriger à la racine les dates de factures incohérentes, **sans toucher** `nextDueDateForCharge` (**2 call-sites prod** : `upcoming.ts` repointé ici, `ChargesClient.tsx` en PR-B). Deux leviers :

1. **Backfill data** : `payment_months` recomputé pour les charges non-mensuelles mal stockées (S.W.D.E `[1]` → `[1,4,7,10]`).
2. **Domaine payment-aware** : nouvelle fonction « prochaine occurrence NON PAYÉE » → câblée dans le dashboard.

## Scope (PR-A — dashboard + data uniquement ; page charges = PR-B)

1. **Migration backfill** `payment_months` via `paymentMonthsFromFrequency(frequency, due_month)` pour les charges où l'array ne correspond pas à la fréquence (les mensuelles `[1..12]` ne bougent pas). Idempotente, pas de RLS touchée.
2. **Domaine** `nextUnpaidDueDate(charge, payments, fromIso)` (pur, NOUVEAU) :
   - itère les occurrences depuis le mois courant (offset 0..24) ;
   - **saute** les occurrences déjà payées (`payments.has(chargeId-year-month)`) ;
   - retourne la 1re occurrence NON payée : `{ dueDateIso, isOverdue: dueDateIso < fromIso }` ;
   - ne saute PAS l'occurrence du mois courant si son jour est passé + non payée (→ `isOverdue`).
   - `null` si tout payé dans la fenêtre OU charge inactive/`paymentMonths` vide.
   - **NE modifie PAS** `nextDueDateForCharge` (reste pour ses autres call-sites).
3. **Câblage dashboard** : `getUpcomingCharges` (`upcoming.ts`) utilise `nextUnpaidDueDate` au lieu de `nextDueDateForCharge`. Effet : Impôt juin payé → roule à juillet ; Taxe voiture juin non payée → bucket `overdue` ; S.W.D.E → date correcte. La carte `ProchainesFacturesCard` reçoit déjà `payments`.
4. i18n : aucune nouvelle clé requise (bucket `overdue` existe déjà). À confirmer.

## Non-goals (→ PR-B/C/D)

- Page charges (badges, toggle, redesign, marqueur `is_watched`) → PR-B (carry #221).
- Reset + alerte oubli → PR-C. CadenceField → PR-D.
- Ne PAS modifier `nextDueDateForCharge`. Ne PAS déduire les payées du total lissé.

## Fichiers

- `supabase/migrations/YYYYMMDD_backfill_payment_months.sql` (CREATE)
- `src/lib/domain/charges/next-unpaid-due-date.ts` (CREATE) + `__tests__/` (CREATE)
- `src/lib/domain/charges/index.ts` (export)
- `src/lib/domain/charges/upcoming.ts` (MODIFY — utilise nextUnpaidDueDate ; signature `getUpcomingCharges` inchangée, elle a déjà `payments`)
- `src/lib/domain/charges/__tests__/upcoming.test.ts` (MODIFY — cas payé→roule, non-payé-passé→overdue, S.W.D.E-like backfillé)

## Logique (réconcilie THI-329 + feedback session)

```
nextUnpaidDueDate(charge, payments, fromIso):
  for offset in 0..23:
    (y, m) = currentMonth + offset
    if m not in paymentMonths: continue
    if payments.get(`${id}-${y}-${m}`) === true: continue   // skip paid
    day = min(paymentDay, daysInMonth(y,m))
    due = `${y}-${pad(m)}-${pad(day)}`
    return { dueDateIso: due, isOverdue: due < fromIso }
  return null
```

- Impôt juin payé → offset 0 sauté → juillet (pas overdue). ✓
- Taxe voiture juin non payée → offset 0 → juin, isOverdue. ✓
- S.W.D.E backfillé [1,4,7,10], non payé, juin → juillet. ✓ (ancre perfectionnée plus tard via CadenceField PR-D)

## Risk tiering / QA

Voie LOURDE : migration + domaine. Agents : **plan-reviewer** (ce doc), **financial-formula-validator** (nextUnpaidDueDate + upcoming), **rls-flow-tester** (migration — backfill, pas de RLS touchée mais confirmer), **dashboard-ux-auditor** (Prochaines factures), **test-runner**. `security-auditor` non requis (pas d'action/authz nouvelle). `i18n-auditor` si nouvelle clé.

## Migration — prudence

- `UPDATE charges SET payment_months = <recompute> WHERE payment_months <> <recompute>` — recompute en SQL OU script de migration. Préférer une fonction SQL inline reproduisant `paymentMonthsFromFrequency` (monthly=[1..12], quarterly=[a,a+3,a+6,a+9] mod 12, semiannual=[a,a+6], annual=[a]) pour rester déterministe. Vérifier sur copie avant prod. Pas de DELETE, pas de perte.
- @thierry corrigera les ANCRES réelles (S.W.D.E mai) via CadenceField (PR-D) — le backfill ne devine pas l'ancre, il dé-casse seulement (un seul mois → la cadence complète).

## DoD

typecheck · lint · lint:use-server · test · build · QA agents · Sourcery silencieux · DoD5 · rapport `docs/prs/PR-epic-factures-A-report.md`.

## Smoke @thierry

Dashboard `/app` : « Prochaines factures » — Impôt (juin payé) n'apparaît plus en juin (roulé) ; Taxe voiture (juin non payée) en « En retard » ; S.W.D.E n'affiche plus janv. 2027.

## Changements plan-reviewer intégrés (🟡 APPROVED WITH CHANGES, 2026-06-05)

- **CR-1 (ledger mono-mois)** : `paymentsLedger` est construit dans `app/page.tsx` depuis `snapshot.currentMonthPayments` (filtré DB sur le mois courant). Donc le skip-paid de `nextUnpaidDueDate` n'a d'effet **que sur l'occurrence du mois courant** — suffisant pour THI-329 (on ne peut pas avoir payé une échéance future). Invariant à documenter en JSDoc. Tests `next-unpaid-due-date.test.ts` : ledger réaliste mono-mois, clé `${id}-${year}-${month}` **sans zero-pad** (format exact `paymentKey()` dans `cockpit/types.ts`).
- **CR-2 (signature)** : `nextUnpaidDueDate(charge: UpcomingChargeInput & { id: string }, payments: ReadonlyMap<string, boolean>, fromIso: string)` — shape minimal `{ id, paymentMonths, paymentDay, isActive }`, PAS `ChargeRecord`. `id` requis pour la clé ledger.
- **CR-3** : 2 call-sites prod confirmés (corrigé supra).
- **Migration** : SQL inline via CTE — `array_agg(DISTINCT ((due_month+o-1)%12)+1 ORDER BY 1)` sur `unnest(ARRAY[0,3,6,9])` (quarterly) / `[0,6]` (semiannual) / `[1..12]` (monthly) / `[due_month]` (annual). UPDATE avec `WHERE c.payment_months IS DISTINCT FROM r.pm` (idempotent, zéro perte, ne touche que les incohérentes). Timestamp migration > `20260528000001`. Owner = RLS bypass (pas de service-role).
- **upcoming.test.ts** : le test qui documentait l'overdue comme « structurellement inatteignable » est **RÉÉCRIT** (PR-A rend l'overdue atteignable : occurrence courante non payée + passée → bucket overdue).
- **Hygiène** : créer la branche `feat/thi-329-payment-aware-due-date` depuis `main` AVANT tout code.
