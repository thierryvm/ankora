# Plan d'implémentation — THI-192 Prochaines factures J-7/14/30

**Date** : 2026-05-19
**Agent** : @cc-ankora (Opus 4.7)
**Branche** : `feat/thi-192-prochaines-factures`
**Base** : `origin/main` `aeaa22f` (post PR #172 LocaleSwitcher FR+EN)
**Référence amont** : [`docs/audits/2026-05-17-thi-192-prochaines-factures-diagnostic.md`](2026-05-17-thi-192-prochaines-factures-diagnostic.md)
**Linear** : THI-192 — réouvert en `In Progress` ce 19/05 par @thierry (était batch-fermé Done par erreur le 18/05 19:03 UTC, capturé par doctrine "git log before scope")

---

## TL;DR (8 lignes)

1. **Linear THI-192 cadre le scope produit** : buckets **J-7 / J-14 / J-30** explicites + tap → `/app/charges`. Aucune ambiguïté côté ticket — l'arbitrage J-7/3/0 vs J-7/14/30 vu dans le diagnostic 17/05 est **tranché par le ticket** = J-7/14/30.
2. **Dette `paymentDay: 1` toujours présente** (workspace-snapshot.ts:31, SELECT line 166). **Fix intégré dans cette PR** car bloqueur fonctionnel. Bénéfice transverse : Notifications + Santé Provisions gagnent en précision.
3. **Migration DB déjà livrée** (`20260503000002_pr_d1_charges_enrichments.sql`) — colonnes `payment_months smallint[]` + `payment_day smallint` existent avec defaults. Aucune nouvelle migration.
4. **Helper domain à créer** : `src/lib/domain/charges/upcoming.ts` (~50 lignes pure + 15-20 tests Vitest).
5. **Composant UI à créer** : `src/components/dashboard/UpcomingBillsCard.tsx` (~150 lignes Server Component, pattern cloné de `ProvisionHealthGaugeCard`).
6. **i18n FR+EN seulement** (doctrine v1.0 verrouillée PR #172). Ajouter ~10 clés dans `messages/fr-BE.json` + `messages/en.json` uniquement. **NE PAS toucher** `nl-BE.json` / `es-ES.json` / `de-DE.json`.
7. **Effort estimé** : 1-1.5 jour. **Risque** : faible-moyen (fix dette `paymentDay` peut révéler des assertions dans tests existants — à valider via test-runner complet en début).
8. **Pré-requis remplis** : worktree créé, deps installées, doctrine LocaleSwitcher en place. Aucun blocker amont.

---

## 1. Spec produit (Linear THI-192)

Lu via Linear MCP (`mcp__linear-server__get_issue`) :

```
Title  : Ankora PR-D6/D7 — Prochaines factures J-7/14/30 (dashboard cockpit v3 #5)
Status : In Progress (réouvert 19/05 par @thierry)
Labels : Mobile, UX, Feature
Priority : 3 (Medium) — Essentielle Beta jalon 10/06/2026
```

Acceptance criteria (verbatim Linear) :

- Bucket **"Cette semaine" (J-7)**, **"Ce mois-ci" (J-14)**, **"Mois prochain" (J-30)**
- Liste des charges récurrentes à venir avec dates calculées
- Total provisionné vs total dû par bucket
- Indicateur visuel "couverture OK / à provisionner X €"
- Tap → navigation `/app/charges`
- Calcul **cron-aware** (charges récurrentes avec `frequency` parsée)
- Couleur respecte tokens sémantiques
- Empty state si aucune charge dans le bucket

**Note d'interprétation @cc-ankora** : les buckets J-7/J-14/J-30 sont **cumulatifs croissants** (toute facture dans les 7 prochains jours = bucket J-7 ; dans les 8-14j = J-14 ; dans les 15-30j = J-30). Pas de bucket "overdue" au sens Linear, mais on inclura un bucket caché "overdue" (j < 0) pour les retards car ils sont actionnables (cohérent avec `genererNotifications()` qui le distingue déjà via `charge_overdue`). À valider @cowork.

---

## 2. Inventaire technique — état confirmé

### 2.1 Domain layer

| Élément                                                                             | Status                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/charges/next-due-date.ts` (`nextDueDateForCharge(charge, fromIso)`) | ✅ Livré, 32 tests Vitest. Algorithme cron-aware sur `paymentMonths[]` + `paymentDay`. Pure, déterministe.          |
| `src/lib/domain/cockpit/notifications.ts` (`genererNotifications`)                  | ✅ Livré. Seuil `DUE_SOON_THRESHOLD_DAYS = 3`. Hors scope THI-192 mais référence pour cohérence "overdue/due_soon". |
| `src/lib/domain/charges/types.ts`                                                   | ✅ Existe. À étendre avec `paymentDay` + `paymentMonths` côté `Charge`.                                             |
| `src/lib/domain/charges/index.ts` (barrel)                                          | ✅ Existe. À étendre pour exporter `getUpcomingCharges()`.                                                          |
| **Helper `getUpcomingCharges()`**                                                   | ❌ **À créer** (`src/lib/domain/charges/upcoming.ts`)                                                               |

### 2.2 Data flow — dette confirmée

| Élément                                      | État actuel                                                                                                                                 | Action                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Migration `payment_day` + `payment_months[]` | ✅ Livrée (`20260503000002_pr_d1_charges_enrichments.sql`)                                                                                  | Aucune                                      |
| SELECT `workspace-snapshot.ts:166`           | ❌ `select('id, label, amount, frequency, due_month, category_id, is_active, notes, paid_from')` — **manque `payment_day, payment_months`** | **Fix : ajouter au SELECT**                 |
| Mapping `rawCharges` lignes 190-200          | ❌ Ne lit pas `c.payment_day` ni `c.payment_months`                                                                                         | **Fix : ajouter aux champs mappés**         |
| Type `Charge` (`src/lib/domain/types.ts`)    | ❌ Ne déclare ni `paymentDay` ni `paymentMonths`                                                                                            | **Fix : étendre le type**                   |
| `toCockpitCharges()` lignes 24-34            | ❌ Stub `paymentMonths: [c.dueMonth]` + `paymentDay: 1`                                                                                     | **Fix : utiliser les vraies valeurs**       |
| Call-sites `toCockpitCharges`                | 1 seul (`src/app/[locale]/app/page.tsx`)                                                                                                    | Aucune modif consumer requise (transparent) |

### 2.3 Composants existants pour pattern

- **Pattern dashboard card** : `ProvisionHealthGaugeCard.tsx` (197 lignes) — Server Component, `Card` from `ui/`, Lucide icons, `getTranslations`, `formatCurrency`, tier tokens success/warning/danger, `data-testid` pour tests, accent gradient + glow décoratif.
- **`ProgressBar` atoms** : non utilisé pour UpcomingBills (visuel "liste groupée" plutôt que jauge).
- **`Chip` atoms** : candidat pour badges J-7/J-14/J-30 par charge (couleur via `color` prop).
- **`Card` from `ui/card`** : convention dashboard maintenue (cohérent ADR-020 — les dashboard cards utilisent `ui/Card` wrapper + atoms internes).

### 2.4 i18n — doctrine v1.0 LocaleSwitcher

PR #172 (mergée ce midi) verrouille `LOCALES_VISIBLE = ['fr-BE', 'en']`. Mais `LOCALES` complet reste source de vérité pour le routing. Pour les NEW i18n keys :

**Décision @cc-ankora** : ajouter les ~10 clés **dans 2 fichiers seulement** : `fr-BE.json` + `en.json`. **Ne PAS toucher** `nl-BE.json`, `es-ES.json`, `de-DE.json`.

**Implication** : un user qui force `/nl-BE/app` via URL directe verra les keys EN comme fallback (next-intl messages parity test à surveiller — si le test parity strict bloque la PR, on devra placer la même clé dans les 5 fichiers AVEC les valeurs fr-BE/en réelles + les 3 autres en placeholder identique à fr-BE OU exclure ce namespace du parity test). **STOP-CONDITION potentielle** — à valider via test-runner Phase 4. Le diagnostic 17/05 a noté cette nuance non résolue.

Fallback prudent si parity test casse : copier les valeurs FR dans les 3 fichiers NL/ES/DE comme placeholder (pas de native review nécessaire, c'est du contenu non-exposé via UI). Effort +5 lignes par fichier.

---

## 3. Algorithme `getUpcomingCharges()`

### 3.1 Signature

```ts
// src/lib/domain/charges/upcoming.ts

import type { Charge } from '@/lib/domain/types';
import type { ChargePaymentLedger } from '@/lib/domain/charge-payments/types';
import { nextDueDateForCharge } from './next-due-date';

export type UpcomingBucket = 'overdue' | 'j7' | 'j14' | 'j30';

export type UpcomingItem = Readonly<{
  charge: Charge;
  /** Next due date in ISO format `YYYY-MM-DD`. Null only filtered out upstream. */
  dueDateIso: string;
  /** Negative if overdue, 0..30 otherwise. */
  daysUntilDue: number;
  /** Whether this charge has been paid for the period whose dueDate falls inside. */
  isPaid: boolean;
}>;

export type UpcomingByBucket = Readonly<{
  overdue: readonly UpcomingItem[];
  j7: readonly UpcomingItem[];
  j14: readonly UpcomingItem[];
  j30: readonly UpcomingItem[];
}>;

export type GetUpcomingChargesInput = Readonly<{
  charges: readonly Charge[];
  payments: ChargePaymentLedger;
  /** "Today" in ISO format `YYYY-MM-DD`, Europe/Brussels timezone. */
  todayIso: string;
}>;

export function getUpcomingCharges(input: GetUpcomingChargesInput): UpcomingByBucket;
```

### 3.2 Pseudo-code

```
Pour chaque charge active :
  dueDateIso = nextDueDateForCharge(charge, todayIso)
  si dueDateIso = null → skip

  daysUntilDue = (dueDateIso - todayIso) en jours
  isPaid = payments.has(chargeId, dueDateYear, dueDateMonth)

  Si daysUntilDue < 0 ET !isPaid → bucket 'overdue'
  Sinon si daysUntilDue ≤ 7  → bucket 'j7'
  Sinon si daysUntilDue ≤ 14 → bucket 'j14'
  Sinon si daysUntilDue ≤ 30 → bucket 'j30'
  Sinon → skip (au-delà de 30j)

Trier chaque bucket par daysUntilDue ascendant (le plus urgent d'abord).
```

**Pureté** : aucun `Date.now()`, aucun I/O. Le caller fournit `todayIso` (computed via `getCurrentMonthBoundariesISO` style, Europe/Brussels timezone). Testable avec Vitest `it.each()`.

### 3.3 Calcul `daysUntilDue` (pur)

```ts
function diffInDays(fromIso: string, toIso: string): number {
  // Both ISO YYYY-MM-DD. Convert to UTC midnight timestamps and diff.
  const from = Date.UTC(...split(fromIso));
  const to = Date.UTC(...split(toIso));
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}
```

UTC-anchored : élimine les DST drifts intra-année.

---

## 4. Composant UI `UpcomingBillsCard.tsx`

### 4.1 Architecture

Server Component clonant le pattern `ProvisionHealthGaugeCard` :

```tsx
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/atoms';
import { Link } from '@/i18n/navigation';
import { getUpcomingCharges, type UpcomingByBucket } from '@/lib/domain/charges';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';
import type { Charge } from '@/lib/domain/types';
import type { ChargePaymentLedger } from '@/lib/domain/charge-payments/types';

type Props = {
  charges: readonly Charge[];
  payments: ChargePaymentLedger;
  todayIso: string;
  locale: Locale;
};

export async function UpcomingBillsCard({ charges, payments, todayIso, locale }: Props) {
  const t = await getTranslations('dashboard.upcomingBills');
  const result = getUpcomingCharges({ charges, payments, todayIso });
  // ... render 3 bucket sections + empty state
}
```

### 4.2 Layout proposé

```
┌─────────────────────────────────────────────────────┐
│ 📅 Prochaines factures                         🔗 → │  ← CardTitle + Link "Voir toutes"
├─────────────────────────────────────────────────────┤
│                                                     │
│ ⚠️ En retard (1 facture · 45 €)              [...]│  ← bucket overdue (si > 0)
│                                                     │
│ 🔥 Cette semaine (2 · 120 €)                       │  ← bucket j7
│   ├ Loyer                    J-3 (15/05)    850 €  │
│   └ Électricité ENGIE        J-6 (18/05)     65 €  │
│                                                     │
│ 📅 Ce mois-ci (3 · 195 €)                          │  ← bucket j14
│   ...                                               │
│                                                     │
│ 🗓️ Mois prochain (1 · 1200 €)                      │  ← bucket j30
│   └ Assurance habitation     J-25 (10/06) 1200 €  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Empty state global : "Aucune facture à venir dans les 30 prochains jours 🎉".
Empty state per-bucket : section masquée si bucket vide.

### 4.3 Tap action

`<Link href="/app/charges">` enveloppe la Card OU un lien explicite "Voir toutes →" dans le CardHeader. **Recommandation** : lien explicite (pas Card cliquable globalement, conflit a11y avec Chips internes).

### 4.4 "Couverture OK / à provisionner X €" (acceptance criteria Linear)

Acceptance dit : "Total provisionné vs total dû par bucket + indicateur visuel couverture OK / à provisionner X €".

Le calcul couverture nécessite **liens entre charges et provisions** — c'est exactement ce que `calculerSanteProvisions()` (THI-190) calcule pour le tableau global mais **par bucket** demanderait un sous-calcul.

**Recommandation @cc-ankora** : pour le MVP THI-192, afficher uniquement le **total dû par bucket** (somme des `charge.amount`). Le delta "à provisionner" est déjà visible globalement dans `ProvisionHealthGaugeCard` (section #2). Ajouter le delta par-bucket serait du scope creep + redondance. **À valider @cowork.**

Si @cowork insiste sur le delta par-bucket : `calculerSanteProvisions()` retourne `detailParCharge` — on peut sommer les `epargneRequise` des charges du bucket. ~10 lignes additionnelles.

---

## 5. Plan de tests Vitest

### 5.1 `upcoming.test.ts` (domain pure)

```ts
describe('getUpcomingCharges', () => {
  // Bucketing
  it.each([
    { days: -1, bucket: 'overdue' },
    { days: 0, bucket: 'j7' },     // Today counts as j7
    { days: 7, bucket: 'j7' },
    { days: 8, bucket: 'j14' },
    { days: 14, bucket: 'j14' },
    { days: 15, bucket: 'j30' },
    { days: 30, bucket: 'j30' },
    { days: 31, bucket: null },    // Filtered out
  ])('places a charge due in $days days into $bucket', ...);

  // Edge cases
  it('skips inactive charges');
  it('skips charges where nextDueDateForCharge returns null');
  it('excludes overdue charges that have been paid');
  it('sorts each bucket by ascending daysUntilDue');
  it('handles month-boundary correctly (Feb 28→29 leap year)');
  it('handles year-boundary correctly (Dec → Jan)');
  it('returns empty buckets when no charges match');
  it('handles paymentDay=31 in months with fewer days');

  // Snapshot determinism
  it('is deterministic given fixed todayIso (no Date.now)');
});
```

Cible : ~15-20 cas. Couverture domain ≥90% lignes + fonctions (cf. CLAUDE.md "Tests domain ≥ 90% lignes + fonctions, ≥ 85% branches").

### 5.2 `workspace-snapshot.test.ts` (fix dette)

Si tests existent → vérifier ils passent après fix `paymentDay`. Si absents → ajouter 1-2 cas e2e légers (mock Supabase) pour valider le mapping `paymentDay` + `paymentMonths`.

### 5.3 `UpcomingBillsCard.test.tsx` (UI snapshot)

Suit pattern `ProvisionHealthGaugeCard.test.tsx` (201 lignes existantes) :

- Test rendering avec différents buckets remplis
- Test empty state
- Test sort intra-bucket
- Test Link `/app/charges` présent

~30-40 lignes test.

---

## 6. Fichiers impactés

| Fichier                                                         | Action                                                                               | Lignes                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| `src/lib/domain/types.ts`                                       | Étendre `Charge` avec `paymentDay: number` + `paymentMonths: readonly number[]`      | +2                         |
| `src/lib/data/workspace-snapshot.ts`                            | SELECT line 166 + mapping rawCharges + `toCockpitCharges`                            | ~15 modif                  |
| `src/lib/domain/charges/upcoming.ts`                            | NEW                                                                                  | ~70                        |
| `src/lib/domain/charges/__tests__/upcoming.test.ts`             | NEW                                                                                  | ~250                       |
| `src/lib/domain/charges/index.ts`                               | Re-export `upcoming`                                                                 | +1                         |
| `src/components/dashboard/UpcomingBillsCard.tsx`                | NEW                                                                                  | ~150                       |
| `src/components/dashboard/__tests__/UpcomingBillsCard.test.tsx` | NEW                                                                                  | ~80                        |
| `src/app/[locale]/app/page.tsx`                                 | Import + render section #5 + pass props (charges, payments ledger, todayIso, locale) | +15                        |
| `messages/fr-BE.json`                                           | Namespace `dashboard.upcomingBills` (~10 keys)                                       | +12                        |
| `messages/en.json`                                              | idem                                                                                 | +12                        |
| `messages/nl-BE.json` / `es-ES.json` / `de-DE.json`             | **À évaluer Phase 4 selon parity test**                                              | 0 ou +36 (placeholders FR) |

**Total estimé** : ~600 lignes additions, ~30 modifications. 8-11 fichiers.

---

## 7. Effort + séquence exécution

| Étape                                                       | Effort | Cumul  |
| ----------------------------------------------------------- | ------ | ------ |
| 1. Fix dette `paymentDay` + tests pré-existants             | 30 min | 30 min |
| 2. Helper `getUpcomingCharges()` + tests Vitest 15-20 cas   | 2h     | 2h30   |
| 3. Composant `UpcomingBillsCard.tsx`                        | 1h30   | 4h     |
| 4. Intégration `app/page.tsx` + tests composant             | 30 min | 4h30   |
| 5. i18n FR + EN (10 clés × 2 fichiers)                      | 30 min | 5h     |
| 6. Validation parity test + fallback NL/ES/DE si nécessaire | 15 min | 5h15   |
| 7. Quality gates (lint + typecheck + test + build)          | 30 min | 5h45   |
| 8. Agents QA (5 agents en parallèle)                        | 30 min | 6h15   |
| 9. Smoke test localhost prod + commit + push + PR           | 30 min | 6h45   |
| 10. CI watch + Sourcery + DoD 5/5                           | 30 min | 7h15   |

**Total** : ~1 jour effectif. Cible : merger ce soir si GO Phase 2 maintenant.

---

## 8. Risques + STOP CONDITIONS

### Risques identifiés

| Risque                                                                                     | Sévérité    | Mitigation                                                                                   |
| ------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------- |
| Fix dette `paymentDay` casse tests pré-existants (assertions sur `paymentDay: 1` stub)     | Moyenne     | `test-runner` complet en début, ajuster cas spécifiques                                      |
| Parity i18n test bloque PR si NL/ES/DE manquent les nouvelles keys                         | Moyenne     | Fallback prêt : copier valeurs FR dans NL/ES/DE comme placeholder                            |
| Acceptance "Total provisionné par bucket" demande sous-calcul de `calculerSanteProvisions` | Faible      | Recommandation MVP "total dû seulement", validation @cowork ; fallback +10 lignes si demandé |
| Composant dense (3 buckets + overdue) sur mobile                                           | Faible      | Empty buckets masqués, scrolling vertical, `mobile-ios-auditor` Phase 5                      |
| Performance : `getUpcomingCharges` iterate sur 24-mois × charges                           | Très faible | Pure, déterministe, ≤100 charges typiques → <1ms                                             |

### STOP CONDITIONS

- ✅ Linear THI-192 confirmé en `In Progress`
- ✅ Dette `paymentDay: 1` confirmée + plan fix intégré
- ✅ Aucune nouvelle migration requise
- ✅ Pattern dashboard cohérent (ProvisionHealthGaugeCard cloné)
- ⚠️ Parity i18n test à valider Phase 4 (fallback prêt)
- ⚠️ Sous-calcul "couverture par bucket" à arbitrer @cowork (MVP "total dû seulement" recommandé)

**Aucune STOP CONDITION bloquante.**

---

## 9. Décisions @cowork attendues (avant Phase 3 exécution)

1. **GO/NO-GO global** sur le plan
2. **Buckets** : confirmer J-7/J-14/J-30 **cumulatifs croissants** (un bucket par fenêtre, charge ne paraît qu'une fois) — interprétation @cc-ankora
3. **Overdue bucket** : on l'inclut séparément (cohérent avec `genererNotifications` `charge_overdue`) ? OUI/NON
4. **"Total provisionné vs dû par bucket"** : MVP "total dû seulement" recommandé, OU veut-on le delta "à provisionner X €" tout de suite ?
5. **i18n strategy** : OK pour `fr-BE.json` + `en.json` only, avec fallback placeholders NL/ES/DE **si** le parity test bloque ?
6. **Tap action** : lien explicite "Voir toutes →" dans CardHeader (recommandation a11y) OU Card globalement cliquable ?

---

## 10. Hors scope (intentionnel)

- Section #3 Timeline 6 mois prédictive (THI-191 ou ticket distinct)
- Section #4 Enveloppes drag-to-rebalance
- Section #6 Goals épargne avec ETA
- Section #7 Simulateur what-if drawer cockpit
- Refactor extraction `ChargeRow` / `ChargeList` composants (peut être PR séparée)
- Bell + dropdown notifications (déjà livré)
- Migration nouvelle (rien à migrer, schema OK)

---

**FIN PLAN — @cc-ankora attend GO/NO-GO @cowork sur les 6 décisions §9 avant Phase 3.**
