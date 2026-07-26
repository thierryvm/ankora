# PR-D4 PHASE 1 BACKEND — Final Report (CRUD charges + dépenses + charge_payments)

> **De** : @cc-ankora (Claude Code, Opus 4.7)
> **À** : @cowork + @thierry
> **Date** : 2026-05-07 PM
> **PR** : [#130](https://github.com/thierryvm/ankora/pull/130)
> **Branche** : `feat/pr-d4-phase-1-backend-crud-charges-expenses`
> **Commit** : `17f720c`
> **Fenêtre** : Opus 4.7 critique 3 jours (avant Pro 10 mai)

---

## TL;DR

PR-D4 Phase 1 backend pur livrée. **Aucune nouvelle migration** (PR-D1 a déjà tout livré — diagnostic à la phase 2 a permis d'éviter 8h de migrations redondantes). Travail réel concentré sur domain pur + Server Actions + tests + snapshot enrichi + i18n. **853/853 tests + 98.63% coverage domain + 5 agents QA PASS**. Estimation 3-4h Opus tenue (vs prompt initial 8-10h).

---

## 1. Résumé décisions tranchées (validées @cowork)

### Les 4 décisions stratégiques de Phase 2

1. **Aucune nouvelle migration Supabase** — PR-D1 (mergée 2026-05-03) a déjà livré schema complet : `payment_months[]`, `payment_day`, `sort_order`, table `charge_payments` avec RLS + UNIQUE `(charge_id, period_year, period_month)` + indexes. ADR-010 + ADR-011 = source canonique.

2. **Naming aligné PR-D1** — j'ai utilisé les noms DB existants partout :
   - `payment_day` (au lieu de `due_date_day` du prompt)
   - `period_month` / `period_year` / `paid_at` (timestamptz) + `paid_amount` (au lieu de `payment_month`/`paid_on (date)` du prompt)

3. **`due_month` deprecated mais sync** — gardé en backward-compat. À chaque INSERT/UPDATE, l'application écrit `due_month = paymentMonths[0]` pour ne pas casser le snapshot legacy. Drop dans une PR-CLEANUP-LEGACY future.

4. **Snapshot scope mois courant** — `charge_payments` fetch limité à `(currentYear, currentMonth)` via 2 `.eq()` filters. PR-D5 widening 3-month plus tard.

### Précisions @cowork intégrées

- **Audit log payload** `{ chargeId, periodMonth, periodYear, paid }` ✅ implémenté (sauf `paid_amount` exclu volontairement — PII-adjacent finance, cf. comment dans `audit-log.ts:67-72`)
- **Server Action signature** `togglePaymentAction` retourne `{ paid: boolean, paidAmount: number | null }` ✅ ; `paidAmount = charge.amount` par défaut si paid=true
- **Tests cibles ≥ 90% sur 3 dossiers domain** ✅ atteint 98.63% lines / 100% functions
- **5 agents QA OBLIGATOIRES** ✅ tous lancés et PASS (cf. §5)

---

## 2. Travail livré

### 2.1 Migrations Supabase

**Aucune** (volontairement). Diagnostic Phase 2 a confirmé que toutes les colonnes/tables attendues existent déjà :

| Élément                                                   | Source                         | Naming DB                                                         |
| --------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `charges.payment_months[]` check 1..12                    | PR-D1 migration 2/4            | identique                                                         |
| `charges.payment_day` (1-31)                              | PR-D1 migration 2/4            | `payment_day` (vs `due_date_day` prompt)                          |
| `charges.sort_order`                                      | PR-D1 migration 2/4            | identique                                                         |
| `charges.category_id` FK                                  | initial schema                 | identique                                                         |
| `charges.paid_from`                                       | three_accounts_model           | identique                                                         |
| `expenses.category_id` FK                                 | initial schema                 | identique                                                         |
| `expenses.note`, `expenses.paid_from`                     | initial + three_accounts_model | identiques                                                        |
| Index `expenses (workspace_id, occurred_on DESC)`         | initial schema                 | `expenses_workspace_date_idx`                                     |
| Table `charge_payments` complète + RLS + UNIQUE + indexes | PR-D1 migration 4/4            | naming `period_*` / `paid_at` (vs `payment_*` / `paid_on` prompt) |

### 2.2 Schemas Zod

**`src/lib/schemas/charge.ts`** étendu :

```ts
chargeInputSchema = z.object({
  label,
  amount,
  frequency,
  dueMonth, // legacy
  paymentMonths: z.array(z.number().int().min(1).max(12)).min(1).max(12).optional(),
  paymentDay: z.number().int().min(1).max(31).optional(),
  sortOrder: z.number().int().min(0).optional(),
  categoryId,
  isActive,
  notes,
  paidFrom,
});
chargeUpdateSchema = chargeInputSchema.partial();
```

**`src/lib/schemas/charge-payment.ts`** créé :

```ts
chargePaymentToggleSchema = z.object({
  chargeId: z.string().uuid(),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  paidAmount: z.number().finite().min(0).max(1_000_000).optional(),
  note: z.string().max(500).optional().nullable(),
});
```

### 2.3 Domain pur (Decimal.js, 0 dépendance DB, immutability)

**`src/lib/domain/charges/`** (5 fichiers + 3 test files) :

```ts
type ChargeRecord = Readonly<{ id, workspaceId, label, amount: Money, frequency, paymentMonths, paymentDay, dueMonth, sortOrder, categoryId, isActive, notes, paidFrom }>

updateCharge(current: ChargeRecord, updates: ChargeUpdateInput): ChargeRecord
  // Sort + dedup paymentMonths, sync dueMonth = paymentMonths[0]
  // Trim label, normalize empty notes to null

validateChargeUpdate(updates: ChargeUpdateInput): { ok: true } | { ok: false; errors }

nextDueDateForCharge(charge: ChargeRecord, fromIso: string): string | null
  // Iterate up to 24 months ahead, clamp paymentDay to month last day
  // Returns ISO YYYY-MM-DD or null (inactive / empty paymentMonths)

chargeMatchesMonth(charge: ChargeRecord, year: number, month: number): boolean
```

**`src/lib/domain/expenses/`** (4 fichiers + 1 test file) :

```ts
type ExpenseRecord = Readonly<{ id, workspaceId, label, amount: Money, occurredOn, categoryId, note, paidFrom }>

updateExpense(current: ExpenseRecord, updates: ExpenseUpdateInput, todayIso: string): ExpenseRecord
  // Rejects future dates, validates calendar (Feb 30 etc.), trim label

validateExpenseUpdate(updates: ExpenseUpdateInput, todayIso: string): { ok: true } | { ok: false; errors }

// Helpers fusionnés depuis ancien expenses.ts flat :
totalAmount(expenses: readonly Expense[]): Money
latestExpenses(expenses: readonly Expense[], limit: number): Expense[]
```

**`src/lib/domain/charge-payments/`** (4 fichiers + 2 test files) :

```ts
type ChargePaymentRecord = Readonly<{ id, chargeId, workspaceId, periodYear, periodMonth, paidAt, paidAmount: Money, bucketId, note, createdBy, createdAt }>

markChargePaid(input: { charge, year, month, paidAtIso, createdBy, overrides? }): Omit<ChargePaymentRecord, 'id' | 'createdAt'>
  // Throws on inactive charge, out-of-range year/month, negative paidAmount

isChargePaidForMonth(chargeId, payments, year, month): boolean
chargesPaidForMonth(charges, payments, year, month): readonly ChargeRecord[]
chargesUnpaidForMonth(charges, payments, year, month): readonly ChargeRecord[]
```

**Re-export `src/lib/domain/index.ts`** :

```ts
export * as Charges from '@/lib/domain/charges';
export * as ChargePayments from '@/lib/domain/charge-payments';
```

### 2.4 Server Actions

**`updateChargeAction(id: string, input: unknown): Promise<ActionResult>`** (étendu) :

- UUID validation early-return (security-auditor MEDIUM fix)
- Authz : `authorizedWorkspace()` + `.eq('workspace_id', ctx.workspaceId)`
- Zod parse strict via `chargeUpdateSchema`
- Sort + dedup `paymentMonths`, mirror `due_month = paymentMonths[0]`
- Pass-through `paymentDay`, `sortOrder`, `paidFrom`
- `logAuditEvent(CHARGE_UPDATED)` + `rateLimit('mutation', user:${id})`
- `revalidateDashboard() + revalidateAppPath('charges')`

**`updateExpenseAction(id: string, input: unknown): Promise<ActionResult>`** (NOUVEAU) :

- Pattern identique, Zod via `expenseUpdateSchema`
- `logAuditEvent(EXPENSE_UPDATED)`
- `revalidateAppPath('expenses')`

**`togglePaymentAction(input: unknown): Promise<ActionResult<{ paid: boolean; paidAmount: number | null }>>`** (NOUVEAU dans `src/lib/actions/charge-payments.ts`) :

- Authz workspace + Zod parse
- **Vérif ownership charge** : `select id, amount, workspace_id from charges where id=? and workspace_id=?` AVANT toute écriture (security-critical)
- Idempotent toggle : if existing payment row → DELETE ; else INSERT avec `paid_amount = charges.amount` ou override
- `logAuditEvent(CHARGE_PAYMENT_TOGGLED, { period_year, period_month, paid })` (sans `paid_amount` — PII-adjacent)
- DB UNIQUE constraint `(charge_id, period_year, period_month)` protège contre double-INSERT en cas de race

**`deleteChargeAction` + `deleteExpenseAction`** : UUID validation ajoutée (cohérence avec les update actions).

### 2.5 Audit log

**`src/lib/security/audit-log.ts`** :

- Nouveau `AuditEvent.CHARGE_PAYMENT_TOGGLED = 'charge.payment_toggled'`
- Safe metadata keys ajoutés : `period_year`, `period_month`, `paid`
- `paid_amount` **délibérément exclu** (PII-adjacent en finance, cf. comment dans le code)

### 2.6 Workspace snapshot

**`src/lib/data/workspace-snapshot.ts`** :

- 6ème requête `Promise.all` : `select charge_id, period_year, period_month, paid_amount, paid_at from charge_payments where workspace_id=? AND period_year=? AND period_month=?`
- Nouveau type `WorkspaceSnapshot.currentMonthPayments: Array<{ chargeId, periodYear, periodMonth, paidAmount, paidAt }>`
- Nouveau type `WorkspaceSnapshot.currentPeriod: { year: number; month: number }`
- TZ `Europe/Brussels` cohérente avec cashflow boundaries

### 2.7 i18n parité 5/5 locales (782 clés alignées)

| Clé                                    | fr-BE                                        | en                               | nl-BE                                        | es-ES                                             | de-DE                                                |
| -------------------------------------- | -------------------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `errors.charges.notFound`              | Cette charge est introuvable.                | This bill could not be found.    | Deze vaste kost is niet gevonden.            | No se ha encontrado este gasto fijo.              | Diese Fixkosten wurden nicht gefunden.               |
| `errors.charges.payments.toggleFailed` | Impossible de marquer la charge comme payée. | Unable to mark the bill as paid. | Kan de vaste kost niet als betaald markeren. | No se ha podido marcar el gasto fijo como pagado. | Fixkosten konnten nicht als bezahlt markiert werden. |
| `errors.expenses.updateFailed`         | Impossible de mettre à jour la dépense.      | Unable to update the expense.    | Kan de uitgave niet bijwerken.               | No se ha podido actualizar el gasto.              | Ausgabe konnte nicht aktualisiert werden.            |
| `errors.expenses.notFound`             | Cette dépense est introuvable.               | This expense could not be found. | Deze uitgave is niet gevonden.               | No se ha encontrado este gasto.                   | Diese Ausgabe wurde nicht gefunden.                  |

Validation node : 782/782 keys identiques sur les 5 locales.

---

## 3. Coverage Vitest mesurée

```
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered
domain             |   99.15 |    97.61 |     100 |     100 |
domain/charges     |   98.64 |    98.03 |     100 |   98.27 |
  next-due-date.ts |   96.29 |    94.73 |     100 |   95.45 | line 52 (defensive 24-month cap)
  update.ts        |     100 |    98.68 |     100 |     100 |
domain/expenses    |   95.91 |    96.87 |     100 |     100 |
  update.ts        |   95.12 |    96.42 |     100 |     100 |
domain/charge-payments → 100% (non listé = pas de gap)
schemas/charge-payment.ts → 0% (Zod schema, testé via actions)

Statements: 98.63%   (435/441)
Branches:   97.79%   (354/362)
Functions:  100%     (89/89)
Lines:      99.19%   (369/372)

Seuils CI : 90/85/90/90 → tous battus largement.
```

**Tests** : 853 / 853 pass, 76 fichiers, 0 erreur tsc, 0 erreur lint:use-server.

---

## 4. Output 5 agents QA

### `financial-formula-validator` → ✅ PASS

> Aucun bug de correctness mathématique ni floating-point trap détecté. Decimal.js partout (precision=20, ROUND_HALF_EVEN bancaire). Immutability respectée (`Object.freeze`, `Readonly<{...}>`). `nextDueDateForCharge` clamp paymentDay correctement (Feb 28/29, Avr 30). `markChargePaid` rejette inactifs + amount négatifs. `updateCharge` sort + dedup + sync dueMonth. `updateExpense` rejette futures dates + Feb 30. Couverture exhaustive des fréquences (monthly/quarterly/semiannual/annual) et frontières mois 1/12.

### `rls-flow-tester` → ✅ PASS

> Test matrix 7 scénarios — tous bloqués par double-couche app + RLS DB :
>
> - cross-workspace UPDATE/DELETE charges/expenses → `.eq('workspace_id', ctx.workspaceId)` + RLS USING `is_workspace_editor`
> - togglePaymentAction sur chargeId d'un autre workspace → vérif ownership explicite renvoie `errors.charges.notFound` AVANT INSERT
> - INSERT charge_payments avec workspace_id forgé → policy `force row level security` + WITH CHECK `created_by = auth.uid()`
>
> Note LOW : `authorizedWorkspace()` sélectionne premier workspace par `joined_at ASC` (single-workspace v1, à documenter pour PR-D5+ multi-workspace).

### `security-auditor` → ✅ PASS_WITH_NOTES (MEDIUM fixé)

> **MEDIUM** Missing UUID validation sur `id` dans `updateChargeAction`/`deleteChargeAction`/`updateExpenseAction`/`deleteExpenseAction` → **FIXÉ** dans le commit `17f720c` (z.string().uuid() early-return).
>
> **LOW** `authorizedWorkspace()` dupliqué byte-pour-byte dans 3 fichiers actions → tracker **PR-CLEANUP-AUTHZ-HELPER** (extract vers `src/lib/actions/_helpers.ts`).
>
> Validations PASS : Authz strict server-side, Zod parse partout, rate-limit avant write, audit log complet (paid_amount exclu), error codes opaques (pas de stack/colonne DB), pas de modif CSP/middleware, pas de PII dans logs, idempotence DB-protected.

### `i18n-auditor` → ✅ PASS_WITH_NOTES (hors scope)

> Parité 5/5 locales OK (4 nouvelles clés, structure correcte y compris nested `payments.toggleFailed`). Glossaire respecté (`vaste kost` / `Fixkosten` / `gasto fijo` / etc.). Pas de placeholder ICU oublié. Pas de résidu FR.
>
> **Bug pré-existant MEDIUM hors scope** : `errors.accounts.notFound` contient la valeur EN "This account could not be found." dans nl-BE/de-DE/es-ES (ligne 1134). À tracker dans **PR-FIX-I18N-ACCOUNTS-NOTFOUND** (déléguer à `i18n-translator`).

### `test-runner` → ✅ ALL_GREEN

```
Vitest:    853/853 passed (76 files), 15.66s
typecheck: 0 errors
lint:use-server: All "use server" files contain only async exports
```

---

## 5. Statut CI sur PR #130

À surveiller post-push (commit `17f720c`) :

- Lint + Typecheck + Unit Tests
- Security audit (npm audit)
- Sourcery review (rate-limit hebdo possible vu PR-NAV-1 récente)
- Vercel Preview Comments
- Playwright E2E : 7 fails pré-existants attendus (cookies-consent + landing iPhone SE + error-boundaries 404), aucune régression NAV-1 ni D4 attendue

@thierry/@cowork à valider sur GitHub avant merge.

---

## 6. DoD-5 strict

| #   | Critère                                                      | Statut                                                                                                       |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | Tous les checks CI critiques verts                           | ⏳ en cours sur `17f720c` (Lint + Tests + Security + Vercel attendus verts ; Playwright fails pré-existants) |
| 2   | Sourcery silencieux sur dernier commit                       | ⏳ à vérifier post-CI                                                                                        |
| 3   | Toutes les reviews humaines approuvées                       | ⏳ en attente review @thierry                                                                                |
| 4   | Pas de conflit avec main                                     | ✅ branche fast-forward de `9095bb8`                                                                         |
| 5   | Rapport final livré à @thierry avec preuve de chaque critère | ✅ ce document                                                                                               |

---

## 7. Trackers à ouvrir après merge

| Tracker                           | Type     | Priority | Source                                                                 |
| --------------------------------- | -------- | -------- | ---------------------------------------------------------------------- |
| **PR-CLEANUP-LEGACY**             | refactor | MEDIUM   | drop `due_month` deprecated post-alpha                                 |
| **PR-CLEANUP-AUTHZ-HELPER**       | refactor | LOW      | extraire `authorizedWorkspace()` dup 3x (security-auditor LOW finding) |
| **PR-FIX-I18N-ACCOUNTS-NOTFOUND** | fix      | MEDIUM   | 3 locales en anglais sur clé existante (i18n-auditor finding)          |
| **PR-D5**                         | feat     | HIGH     | snapshot 3-month window pour cockpit décalage Santé Provisions         |
| **PR-D4 PHASE 2 UI**              | feat     | HIGH     | drawer édition charges/dépenses, toggle paye, intégration mockups CD#3 |

---

## 8. Recommandation suite

**Vendredi 8 mai** : @thierry valide PR #130 ce soir / demain matin → merge si DoD-5 vert.

**Suite recommandée** :

### Option A — PR-CAT-1 PHASE 1 backend (Opus-critique) — RECOMMANDÉE

Enchaîner directement vendredi 8 mai matin sur **PR-CAT-1 PHASE 1 backend** (categories CRUD complet, comme PR-D4 mais sur les categories). C'est :

- Opus-critique (RLS + Server Actions + audit log + Zod schemas)
- Pré-requis pour CD#3 weekend (les mockups vont consommer categories)
- Estimation 2-3h Opus si même pattern PR-D4 (encore plus rapide car pas de migration vu que `categories` existe + `color_token` + `is_system` PR-D1)
- Fenêtre Opus 4.7 fermant dimanche 10 mai

### Option B — Pause repos avant CD#3

Repos vendredi soir / samedi matin avant que CD#3 démarre samedi midi. Risque : Phase 2 UI dimanche pourrait être bloquée par categories backend manquant.

**Mon avis** : Option A. PR-D4 Phase 1 a été plus rapide qu'estimée (3h vs 8h). Reste budget Opus pour PR-CAT-1 Phase 1. Si je termine PR-CAT-1 vendredi soir, pause samedi midi → Phase 2 UI dimanche en Sonnet sur les 2 backends prêts.

— @cc-ankora · 2026-05-07 PM
