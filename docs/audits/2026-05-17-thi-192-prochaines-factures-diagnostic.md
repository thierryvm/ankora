# Diagnostic préparatoire — THI-192 Prochaines factures J-7/14/30 (lecture seule)

**Date** : 2026-05-17
**Agent** : @cc-ankora (Opus 4.7)
**Scope** : compréhension spec UX + inventaire technique + options d'implémentation. **Aucune ligne de code écrite.**
**Bloqueur amont** : THI-189 (frontière atoms vs ui).
**Décideurs** : @cowork (priorisation + arbitrage buckets) + @thierry (validation merge).

---

## TL;DR exécutif (10 lignes)

1. **Pas de section dédiée dans la spec canonique** : `dashboard-cockpit-vraie-vision-2026-05-03.md` (vault) ne décrit pas explicitement "Prochaines factures J-7/14/30". Le concept dérive de la section 7 (notifications réactives, seuils J-3 / overdue) et du NORTH_STAR. **3 sources, 3 variantes de buckets divergentes** — décision @cowork requise.
2. **Domain layer partiellement livré** : `nextDueDateForCharge(charge, fromIso)` existe (`src/lib/domain/charges/next-due-date.ts`, 32 tests Vitest). `genererNotifications()` existe (`src/lib/domain/cockpit/notifications.ts`) avec seuil `DUE_SOON_THRESHOLD_DAYS = 3` et kinds `charge_overdue` + `charge_due_soon`.
3. **Helper "upcoming charges bucketed" manquant** : ~30 lignes pure à ajouter dans le domain pour grouper les charges par bucket J-X. Trivial.
4. **DETTE BLOQUANTE DÉCOUVERTE** : `workspace-snapshot.ts:31` **stub `paymentDay: 1`** parce que le SELECT (ligne 166) ne lit pas la colonne `payment_day` (migration 20260503000002 livrée mais consommée nulle part). Sans le vrai `paymentDay`, `nextDueDateForCharge()` retournera toujours le 1er du mois — bogue critique pour THI-192. **À fixer en début de PR THI-192**, ~15 lignes.
5. **Aucune nouvelle migration Supabase requise** : `payment_day`, `payment_months[]`, `charge_payments` tables déjà livrées en PR-D1.
6. **Composants candidats** : `atoms/Chip` parfait pour badges J-7/J-14/J-30 ou J-7/J-3/J-0 (couleur via `color` prop), `ui/card` pour wrapper, `lucide-react` icons (Bell, Calendar, AlertCircle).
7. **Pas de `ChargeRow` / `ChargeList` extraits** dans la codebase actuelle — le rendu inline est encore dans les pages. Pour ce widget, le rendu compact (label + montant + chip J-X) sera ad-hoc, pas besoin de premier extract.
8. **3 options d'implémentation** plus bas — recommandation **Option A** (Server Component, 3 buckets groupés, pattern `EffortFinancierCard`, `ui/card` + `atoms/Chip`).
9. **Effort estimé Option A** : 1-1.5 jour (incluant fix dette `paymentDay` + helper domain + composant UI + i18n × 5 + tests Vitest + agents QA).
10. **Pré-requis avant exécution** : THI-189 mergée + sortie sas 48h post-19/05 + arbitrage @cowork sur buckets (J-7/14/30 vs J-7/3/0 vs J-3/0) + arbitrage 5 locales ou 2.

---

## 1. Spec UX — état + extrapolation requise

### 1.1 Trois sources, trois variantes

| Source                                           | Buckets                 | Statut                                                    |
| ------------------------------------------------ | ----------------------- | --------------------------------------------------------- |
| **Linear ticket THI-192** (autoritaire produit)  | **J-7 / J-14 / J-30**   | Linear (non vérifié directement, repris du brief @cowork) |
| **NORTH_STAR ligne 91** (Provisions affectées)   | **J-7 / J-3 / J-0**     | Mentionné comme "Alertes... avant échéance (PR-F)"        |
| **Spec canonique section 7**                     | **≤ 3 / < 0 (overdue)** | Seuils notifications cloche, pas de J-7/14/30             |
| **NORTH_STAR ligne 117** (table concurrentielle) | **J-7** seul            | "Alertes J-7 factures provisionnées"                      |

**Ambiguïté à trancher @cowork** : laquelle des 3 logiques implémenter ?

- **A** : J-7 / J-14 / J-30 (Linear THI-192 littéral — buckets larges, vue "anticipation mensuelle")
- **B** : J-7 / J-3 / J-0 (NORTH_STAR — buckets courts, alerte d'imminence)
- **C** : hybride J-30 / J-14 / J-7 / J-3 / overdue (5 niveaux — exhaustif mais lourd)

**Préférence @cc-ankora** : **B** (J-7 / J-3 / J-0 + overdue). Cohérent avec NORTH_STAR positionnement produit (anti-frais retard) ET avec le seuil existant `DUE_SOON_THRESHOLD_DAYS = 3` dans `notifications.ts`. Mais c'est un choix produit, @cowork tranche.

### 1.2 Format affichage (extrapolation depuis pattern dashboard)

Aucune description précise dans la spec. Extrapolation cohérente avec section 7 + pattern dashboard existant :

- **Bucketing visuel** : 3 sous-sections empilées (label bucket + count + montant total + liste des charges).
- **Tri intra-bucket** : par `dueDate` croissante (la plus urgente en premier).
- **Format ligne** : `<Icon catégorie>` + `<Label charge>` + `<Chip J-X (couleur tone)>` + `<Montant>` à droite + éventuel `<Toggle payé>` (si pas déjà payé ce cycle).
- **Empty state** : "Aucune facture à venir dans les 30 prochains jours 🎉".
- **Interaction click** : à clarifier @cowork (drawer drilldown ? lien vers `/app/charges` filtré ?). Recommandation MVP : click → naviguer vers `/app/charges`.

---

## 2. Inventaire technique factuel

### 2.1 Domain layer (status : ⚠️ PARTIEL — 1 dette + 1 helper à ajouter)

| Élément                                                                                                         | Status                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/charges/next-due-date.ts` (`nextDueDateForCharge`)                                              | ✅ Livré, 32 tests Vitest                                                                                                                                                                         |
| `src/lib/domain/cockpit/notifications.ts` (`genererNotifications` + kinds `charge_overdue` / `charge_due_soon`) | ✅ Livré, seuil `DUE_SOON_THRESHOLD_DAYS = 3`                                                                                                                                                     |
| `src/lib/domain/charge-payments/` (queries `isChargePaidInPeriod`)                                              | ✅ Livré, types complets                                                                                                                                                                          |
| **Helper "bucketise upcoming charges by J-X"**                                                                  | ❌ **À ajouter** (~30 lignes pure + tests)                                                                                                                                                        |
| **`workspace-snapshot.ts:31` stub `paymentDay: 1`**                                                             | ❌ **DETTE BLOQUANTE** — le SELECT ligne 166 ne lit pas `payment_day` ni `payment_months[]`, donc `toCockpitCharges()` stub. Sans fix : `nextDueDateForCharge()` retourne toujours "1er du mois". |

**API helper proposée** :

```ts
// src/lib/domain/charges/upcoming.ts (à créer)
export type UpcomingBucket = 'j7' | 'j14' | 'j30' | 'overdue'; // ou j7/j3/j0 selon @cowork
export type UpcomingItem = Readonly<{
  charge: ChargeRecord;
  dueDateIso: string;
  daysUntilDue: number; // négatif si overdue
  isPaid: boolean;
}>;
export type UpcomingByBucket = Readonly<Record<UpcomingBucket, readonly UpcomingItem[]>>;

export function getUpcomingCharges(input: {
  charges: readonly ChargeRecord[];
  payments: ChargePaymentLedger;
  todayIso: string;
  ref: ReferencePeriod;
}): UpcomingByBucket;
```

Pure, déterministe, testable Vitest. Pas de `Date.now()` (caller passe `todayIso`).

### 2.2 Data flow (status : ⚠️ DETTE 15 lignes)

| Élément                                      | Status                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration `payment_day` + `payment_months[]` | ✅ Livrée (`20260503000002_pr_d1_charges_enrichments.sql`)                                                                                               |
| `getWorkspaceSnapshot()` SELECT charges      | ❌ Ligne 166 : `.select('id, label, amount, frequency, due_month, category_id, is_active, notes, paid_from')` — **manque `payment_day, payment_months`** |
| `toCockpitCharges()` mapping                 | ❌ Ligne 30-31 : stub `paymentMonths: [c.dueMonth]` + `paymentDay: 1`                                                                                    |
| `chargePayments` dans snapshot               | ✅ Disponible (ligne 246)                                                                                                                                |

**Fix dette** :

1. Étendre `SELECT` ligne 166 : ajouter `payment_day, payment_months`.
2. Étendre `ChargeRecord` mapping ligne ~196 : `paymentDay: c.payment_day, paymentMonths: c.payment_months`.
3. Adapter `toCockpitCharges()` lignes 24-34 : utiliser les vraies valeurs (déjà disponibles), virer les stubs.

~15 lignes modifiées. **Bénéfice transverse** : les autres calculs cockpit (Effort, Capacité, Santé Provisions, Assistant Virements, Notifications) gagnent en précision sur les charges quarterly/semiannual/annual.

### 2.3 Composants UI existants

| Composant                           | Utilité pour THI-192                                                      |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `atoms/Chip` (CD#3)                 | ✅ Badge J-7/J-3/J-0 avec `color` prop                                    |
| `atoms/Card` (CD#3, monolithique)   | ❓ Si Option B THI-189 retenue                                            |
| `ui/card` (shadcn)                  | ✅ Wrapper standard dashboard (pattern existant)                          |
| `lucide-react` icons                | ✅ Bell, Calendar, AlertCircle, Clock                                     |
| `EffortFinancierCard.tsx`           | ✅ Pattern à cloner (Server Component + getTranslations + formatCurrency) |
| `ChargeRow` / `ChargeList` extraits | ❌ N'existent pas, rendu inline ad-hoc OK pour MVP                        |

### 2.4 i18n

À ajouter (rappel : 5 locales ou 2 ? cf. CLAUDE.md projet — v1.0 FR + EN seulement, mais parité actuelle à 5) :

```
dashboard.upcomingBills.title
dashboard.upcomingBills.bucketJ7
dashboard.upcomingBills.bucketJ3 (ou J14)
dashboard.upcomingBills.bucketJ0 (ou J30)
dashboard.upcomingBills.overdue
dashboard.upcomingBills.empty
dashboard.upcomingBills.itemDueIn (avec ICU plural pour "due dans X jour(s)")
```

~7-8 clés × 5 locales = ~40 lignes JSON.

### 2.5 Tests existants modèles

- Domain : pattern `it.each()` Vitest dans `next-due-date.test.ts` (32 cas) — bonne base pour tester `getUpcomingCharges()`.
- UI : pattern absent (cf. Phase 4 — Server Components dashboard testés via E2E + visual snapshot).

---

## 3. Options d'implémentation

### Option A ⭐ — Server Component 3 buckets groupés + helper domain + fix dette (RECOMMANDÉE)

**Principe** : Créer `ProchainesFacturesCard.tsx` (Server Component) qui appelle un nouveau helper `getUpcomingCharges()` et rend 3 sous-sections groupées par bucket. Inclut le fix dette `paymentDay` en pré-requis interne.

**Composition** :

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/atoms';
import { Bell, Calendar } from 'lucide-react';
import { getUpcomingCharges } from '@/lib/domain/charges';
// Server Component async
```

**Pros** :

- Réutilise le pattern dashboard existant (cohérence visuelle).
- Server Component → 0 JS shippé.
- Sous-sections claires = lecture rapide UX (anti-cognitive-load Monarch-style).
- Aligné Option C THI-189 (cross-import `atoms/Chip` dans `ui/card`-wrapped — même cas que THI-190).
- Fix dette `paymentDay` apporte bénéfice transverse (Santé Provisions + Notifications gagnent en précision).

**Cons** :

- 3 sous-sections + empty states = composant un peu plus dense que les autres dashboard cards.
- Si arbitrage @cowork bascule sur 5 buckets (J-30/14/7/3/overdue), le visuel devient lourd → préférer scrolling list flat.

**Effort estimé** : **1-1.5 jour** :

- Fix dette `workspace-snapshot.ts` : ~15 lignes (+ ajustement éventuel des autres call-sites `toCockpitCharges`).
- Helper `getUpcomingCharges()` : ~30 lignes + 10-15 tests Vitest.
- Composant `ProchainesFacturesCard.tsx` : ~120 lignes.
- i18n × 5 (ou × 2) : ~40 lignes JSON.
- Câblage `src/app/[locale]/app/page.tsx` : +5 lignes.
- Tests Vitest snapshot composant : ~30 lignes (optionnel).
- Agents QA : `dashboard-ux-auditor` + `ui-auditor` + `i18n-auditor` + `mobile-ios-auditor` (densité visuelle mobile).

**Fichiers impactés** : **6-7**

- `src/lib/data/workspace-snapshot.ts` (modif SELECT + mapping)
- `src/lib/domain/charges/upcoming.ts` (nouveau)
- `src/lib/domain/charges/__tests__/upcoming.test.ts` (nouveau)
- `src/lib/domain/charges/index.ts` (barrel)
- `src/components/dashboard/ProchainesFacturesCard.tsx` (nouveau)
- `src/app/[locale]/app/page.tsx` (intégration)
- `messages/{fr-BE,nl-BE,en,de-DE,es-ES}.json` (5 fichiers — ou 2)

**Risque** : **faible-moyen**. Modif `workspace-snapshot` peut casser silencieusement d'autres call-sites — à valider via `test-runner` complet.

---

### Option B — Card unique liste plate + chips J-X par ligne

**Principe** : pas de sous-sections, une seule liste plate triée par `dueDate` croissante, chaque ligne porte un Chip J-X coloré.

**Pros** :

- Plus simple côté UI (~80 lignes au lieu de 120).
- Mobile-first naturel (scrolling list).
- Évite la lourdeur si @cowork tranche pour 5 buckets.

**Cons** :

- Moins lisible visuellement (pas de séparation temporelle nette).
- Le user doit lire chaque ligne pour saisir l'urgence.
- Diverge du pattern "section grouped" typique des dashboards Monarch.

**Effort estimé** : **0.5-1 jour** (toujours fix dette `paymentDay` requis).

**Risque** : **faible**.

---

### Option C — Timeline horizontale visuelle (SVG/flex)

**Principe** : barre horizontale 0→30 jours avec markers par charge, tooltip au hover.

**Pros** :

- Très visuel, signal d'urgence immédiat.
- Différenciateur produit (aucun concurrent ne le fait).

**Cons** :

- Mobile-first difficile (timeline horizontale = scroll latéral risqué).
- A11y SVG custom (équivalent ARIA `progressbar` ou liste navigable ?).
- Effort plus élevé pour ce signal.
- Risque "joli mais peu actionnable" — Monarch-level vise actionable, pas wow-factor.

**Effort estimé** : **2-3 jours** (incluant a11y custom + responsive mobile).

**Risque** : **moyen-élevé** (mobile + a11y custom SVG).

---

## 4. Recommandation @cc-ankora

**Option A** pour les raisons suivantes :

1. **Cohérent pattern dashboard** (3e/4e card au même format que Effort/Capacité/Santé).
2. **Aligné Option C THI-189** (cross-import `atoms/Chip` → `ui/card`, exactement comme THI-190 — cohérence d'usage des atoms).
3. **Fix dette transverse bénéfique** : la correction `paymentDay` débloque la précision de `Notifications réactives` (déjà livré) ET de `Santé Provisions` (THI-190 dépend de `payments` correctement câblés).
4. **Effort 1-1.5 jour** = compatible Beta P1 si exécuté entre 20-25 mai.
5. **Mobile-first respecté** : scrolling vertical, pas de timeline horizontale.
6. **A11y standard** : liste avec headings sémantiques par bucket + chips ARIA-label "Due dans X jours".

**Plan d'exécution suggéré (post-THI-189 merge + arbitrage buckets @cowork)** :

1. ✅ Vérifier ADR THI-189 signée (Option C frontière).
2. ✅ @cowork tranche buckets : J-7/14/30 vs J-7/3/0 vs J-3/0.
3. ✅ @cowork tranche locales : 5 vs 2 pour Beta.
4. Créer branche `feat/thi-192-prochaines-factures-card`.
5. Fix dette `workspace-snapshot.ts` (SELECT + mapping, retirer stubs).
6. `npm run test` immédiatement → valider 0 régression sur les autres call-sites.
7. Créer `src/lib/domain/charges/upcoming.ts` + tests Vitest (10-15 cas).
8. Créer `src/components/dashboard/ProchainesFacturesCard.tsx`.
9. Intégrer dans `src/app/[locale]/app/page.tsx`.
10. Ajouter clés i18n.
11. Invoquer `dashboard-ux-auditor` + `ui-auditor` + `i18n-auditor` + `mobile-ios-auditor`.
12. PR → review @thierry → merge.
13. Update ROADMAP : THI-192 ✅ → enchaîner THI-195.

**Pré-requis avant exécution** :

- ⏳ THI-189 mergée (frontière atoms/ui).
- ⏳ Sortie fenêtre sas 48h post-19/05.
- ⏳ Arbitrage @cowork sur buckets.
- ⏳ Arbitrage @cowork sur locales (5 ou 2).

---

## 5. Séquence post-19/05 mise à jour (4 dettes maintenant)

Mise à jour suite à la découverte de la dette `paymentDay` dans Phase 5 :

| Ordre | Item                                                                     | Effort                                | Pré-requis                                  | Débloque                                           |
| ----- | ------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| 1     | **THI-189 — Frontière atoms/ui Option C**                                | 0.5-1 j                               | ADR signée @thierry                         | THI-190 + THI-192 + THI-195                        |
| 2     | **PR-FIX-CONSENT — Option A**                                            | 0.5 j                                 | Aucun                                       | 3 tests E2E + bug user #126                        |
| 3     | **THI-192 dette préalable — fix `paymentDay` dans `workspace-snapshot`** | 0.3 j (intégrable dans la PR THI-192) | THI-189 mergée                              | THI-192 + précision Notifications/Santé Provisions |
| 4     | **THI-190 — Health gauge Option A**                                      | 0.5-1 j                               | THI-189 mergée + arbitrage seuils 3 niveaux | Beta P1 (1/3)                                      |
| 5     | **THI-192 — Prochaines factures Option A**                               | 1-1.5 j (inclut dette #3)             | THI-189 mergée + arbitrage buckets          | Beta P1 (2/3)                                      |
| 6     | **THI-195 — Simulateur drawer** (Phase 6 si signal @cowork)              | TBD                                   | THI-189 mergée                              | Beta P1 (3/3)                                      |

**Total Beta P1 enchainable** : ~3-4.5 jours d'exécution propre + arbitrages @cowork préalables. Très réaliste pour fenêtre 20-31 mai.

---

## 6. Données brutes vérifiées

- Spec vault : `dashboard-cockpit-vraie-vision-2026-05-03.md` sections 7 + 8 (notifications + previsions, pas de section dédiée upcoming bills).
- NORTH_STAR : ligne 26 (Beta P1 scope), ligne 91 (J-7/J-3/J-0), ligne 117 (J-7 différenciateur).
- Linear THI-192 : J-7/14/30 (non lu directement, repris du brief @cowork).
- Domain : `src/lib/domain/charges/next-due-date.ts` (32 tests), `src/lib/domain/cockpit/notifications.ts` (`DUE_SOON_THRESHOLD_DAYS = 3`).
- Dette identifiée : `src/lib/data/workspace-snapshot.ts:31` stub `paymentDay: 1` + SELECT ligne 166 sans `payment_day, payment_months`.
- Migration `payment_day` : `supabase/migrations/20260503000002_pr_d1_charges_enrichments.sql`.
- ChargePaymentRecord type : `src/lib/domain/charge-payments/types.ts`.

---

## 7. Hors scope

- THI-195 (simulateur drawer) — Phase 6 si signal @cowork.
- THI-191 / THI-193 / THI-194 (V1.0, pas Beta).
- Refactor extraction `ChargeRow` / `ChargeList` composants (peut être fait plus tard en PR séparée).
- Système Bell + dropdown notifications (livré, hors scope THI-192).

---

## 8. STOP conditions évaluées

- ✅ **Spec ambiguë mais identifiée** : extrapolation documentée, arbitrage @cowork formalisé.
- ⚠️ **Dépendance domain manquante découverte** : stub `paymentDay` — fix intégrable dans la PR THI-192 (~15 lignes), pas un bloqueur séparé. **REMONTÉ EN POINT D'ATTENTION** dans la séquence post-19/05.
- ✅ **Diagnostic < 1h** : ~55 min écoulés.
- ✅ **Self-check fatigue (4e Phase)** : OK. Patterns similaires aux 3 phases précédentes, charge cognitive raisonnable. Légère vigilance accrue sur la rédaction (tendance à expliquer trop).

---

## 9. Prochaines actions proposées

1. **@cowork** lit ce diagnostic et tranche :
   - Option A / B / C (recommandation A).
   - Buckets : J-7/14/30 vs J-7/3/0 vs J-3/0 (recommandation J-7/3/0 cohérent NORTH_STAR + seuil existant).
   - Locales : 5 (parité) ou 2 (Beta dégradée FR + EN).
2. **@cowork** décide : Phase 6 (THI-195 ce soir) ou pause + commit des 4 diagnostics dans une PR docs-only post-19/05 ?
3. **@cc-ankora** exécutera la PR THI-192 sur signal @cowork après THI-189 merge.

---

**Fin du diagnostic.** Aucune modification code. Working tree main inchangé (sauf création de ce fichier markdown + les 3 diagnostics précédents).
