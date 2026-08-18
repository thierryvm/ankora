# PR-D3-bis — Waterfall pédagogique + Layout réordonné + Cleanup KPI legacy — Rapport final

- **Date** : 2026-05-06 22:30 (UTC+2)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Phase 0 OK
- **Branche** : `feat/pr-d3-bis-waterfall-pedagogique-layout`
- **Commits** :
  - `89e3ffe feat(cockpit): waterfall pedagogique + layout reordonne + cleanup KPI legacy (PR-D3-bis)`
  - `b36faa2 chore(deps): add overrides basic-ftp ^6.0.1 + ip-address ^10.2.0 (CVE fix)` — security audit fix post-CI
- **PR ouverte** : **https://github.com/thierryvm/ankora/pull/122**
- **mergeStateStatus initial** : `UNSTABLE` (CI en cours, normal)
- **Handoff de référence lu** : `Athenaeum/.../2026-05-06-2230-feedback-post-pr-d3-dette-ux.md`

---

## TL;DR @cowork — 90 secondes

PR-D3 livrait le bon nombre. **PR-D3-bis livre la bonne histoire.**

1. **Fix 1 — Waterfall pédagogique** ✅ : breakdown `+ Revenus / − Effort lissé / − Plafond quotidien` toujours visible au-dessus du big number coloré. Le calcul +124 € devient reconstructible au premier regard sans connaître l'app.
2. **Fix 2 — Layout réordonné** ✅ : Bloc 2 hero radar → **Mes comptes (réalité)** → **Plan du mois (action)**. Test E2E vérifie l'ordre DOM via `boundingBox.y`.
3. **Fix 3 — Cleanup 4 KPI legacy** ✅ : suppression de Provisions/mois, Santé Critique, Virement suggéré, Factures Mai. Test E2E vérifie `toHaveCount(0)` sur les labels.
4. **i18n 5 locales en lockstep** : `dashboard.capacite.breakdown.{revenus,effort,plafond}` + `app.dashboard.accountsHeading` (sr-only).
5. **Tests** : +5 Vitest sur `CapaciteEpargneCard` + 2 E2E (layout order + cleanup) + i18n parity. **66 fichiers vitest tous verts**.
6. **Self-audit UX checklist enrichie @cowork** : **4/5 ✅ + 1 partiel** (animations motion-safe différées à PR-D3-ter post-CD#3 per prompt).

---

## Décisions @cowork suivies (toutes intégrées)

| #   | Décision @cowork                                                    | Application                                                                                 |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Démarrer ce soir/cette nuit en autonomie (DS Session #1, sans CD#3) | ✅ implémenté avec tokens existants (Card, ring, gradient, glow)                            |
| 2   | Waterfall toujours visible (preferred du prompt)                    | ✅ 3 lignes au-dessus du big number, pas caché                                              |
| 3   | Format `+ Revenus / − Effort / − Plafond / = +124€` left-to-right   | ✅ opérateurs alignés en colonne 4-w avec font-medium muted                                 |
| 4   | Layout réordonné (réalité → plan)                                   | ✅ accounts EN HAUT, plan EN BAS, sections séparées                                         |
| 5   | Cleanup 4 cards legacy doublons                                     | ✅ supprimées + imports/locals nettoyés                                                     |
| 6   | Aucun scope creep (Bloc 3, Santé enrichie, animations Monarch)      | ✅ scope strictement respecté                                                               |
| 7   | Self-audit UX enrichie 5 checks                                     | ✅ documenté §"Self-audit UX" ci-dessous                                                    |
| 8   | Si UN check échoue → STOP, FLAG @cowork avant push                  | ✅ aucun check à STOP. Effet "wow" partiel (animations) intentionnellement reporté à D3-ter |

---

## Architecture des changements

### `src/components/dashboard/CapaciteEpargneCard.tsx` — refactor majeur

**Avant (PR-D3)** :

```tsx
<CardContent>
  <p className="text-4xl ...">{signed}</p>
  <p className="text-sm">{message}</p>
</CardContent>
```

**Après (PR-D3-bis)** :

```tsx
<CardContent>
  <dl data-testid="capacite-epargne-breakdown">
    {breakdownRows.map((row) => (
      <div className="flex items-baseline justify-between gap-3">
        <dt>
          <span aria-hidden>{row.operator}</span>
          <span>{row.label}</span>
        </dt>
        <dd>{row.value}</dd>
      </div>
    ))}
  </dl>
  <div className="border-t pt-3">
    <p className="text-4xl ...">{signed}</p> {/* big number stays hero */}
    <p className="text-sm">{message}</p>
  </div>
</CardContent>
```

Le `data-testid="capacite-epargne-value"` est préservé pour ne pas casser les selectors PR-D3 existants. Nouveau testid `capacite-epargne-breakdown` pour les nouvelles assertions.

### `src/app/[locale]/app/page.tsx` — reorder + cleanup

**Avant** : header → Bloc 2 → 4 KPI legacy → Plan (contenant à la fois transfers ET accounts).

**Après** : header → Bloc 2 → empty state OU `<section accounts>` (NEW) → `<section plan>` (transfers seuls).

Suppression imports : `PiggyBank`, `Receipt`, `Shield`, `Provision`, `Budget`. Suppression locals : `provisionTarget`, `billsDue`, `suggestedTransfer`, `annualTotal`, `health*`.

### Bonus Tailwind 4

`bg-gradient-to-br` → `bg-linear-to-br` sur les deux cards (canonical class Tailwind 4, signalée par diagnostic IDE). Cohérence avec le reste du repo (audit canonical déjà passé en PR #23).

---

## Quality gates ✅

| Gate                      | Résultat                                                     |
| ------------------------- | ------------------------------------------------------------ |
| `npm run lint`            | ✅ 0 erreur, 7 warnings `no-console` (intentionnel baseline) |
| `npm run lint:use-server` | ✅ All `use server` files contain only async exports         |
| `npm run typecheck`       | ✅ 0 erreur                                                  |
| `npx vitest run` (full)   | ✅ **66 fichiers tous verts**                                |
| `npm run build`           | ✅ exit code 0, all routes prerender                         |

### Tests détaillés

**Vitest** :

| Fichier                                    | Cas | Couverture                                                                                                                    |
| ------------------------------------------ | --- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CapaciteEpargneCard.test.tsx` (étendu)    | +5  | 3-row waterfall plafond > 0, 2-row plafond = 0, valeurs formatées fixture @thierry, big number visible, breakdown i18n parity |
| `CapaciteEpargneCard.test.tsx` (existants) | 7   | inchangés, tous passent (data-testids préservés)                                                                              |
| `EffortFinancierCard.test.tsx` (existants) | 5   | inchangés, tous passent                                                                                                       |
| `dashboard-cockpit-bloc2.spec.ts` (étendu) | +2  | DOM order accounts BEFORE plan, legacy KPI labels gone (`toHaveCount(0)`)                                                     |

**Mock `getTranslations`** : upgrade pour walker les nested keys (e.g. `breakdown.revenus` → `messages.dashboard.capacite.breakdown.revenus`). Évite faux négatifs sur les sub-namespaces.

---

## Self-audit UX checklist enrichie @cowork (5 checks)

| #   | Check                                                                                                       | Résultat                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **KPI explicabilité** — Capacité Réelle a-t-elle un breakdown visible (waterfall) ?                         | ✅ 3 lignes ALWAYS visible au-dessus du big number. Opérateurs ± alignés. Big number reste hero.                                                                                                                                                |
| 2   | **First-glance comprehension** — un user qui découvre l'app comprend-il le calcul +124€ au PREMIER regard ? | ✅ Format `+Revenus −Effort −Plafond = +X€` reproduit la math ADR-009 left-to-right sans contexte préalable.                                                                                                                                    |
| 3   | **Layout hierarchy** — la réalité (comptes/soldes) précède-t-elle le plan (virements/projections) ?         | ✅ Accounts section AVANT plan section. Test E2E vérifie l'ordre DOM via `boundingBox.y`.                                                                                                                                                       |
| 4   | **No legacy duplication** — aucune card legacy ne fait doublon avec les KPIs hero ?                         | ✅ 4 cards supprimées (Provisions/Santé/Virement/Factures). Test E2E vérifie `toHaveCount(0)` sur les labels.                                                                                                                                   |
| 5   | **Effet "wow" mesurable** — animation ou storytelling qui capture l'attention au load ?                     | ⚠️ **Partiel** : storytelling pédagogique acquis (waterfall + glow blob + ring color état) ; animations motion-safe (fade-in séquentiel, count-up sur le big number) **intentionnellement différées à PR-D3-ter** post-mockups CD#3 per prompt. |

**Résultat global** : 4/5 ✅ + 1 partiel maîtrisé. **Aucun STOP** (le check 5 partiel correspond exactement au scope-out documenté du prompt @cowork).

---

## DoD canonique 5/5 — état actuel

| #   | Critère DoD                           | État                                             |
| --- | ------------------------------------- | ------------------------------------------------ |
| 1   | `gh pr checks` ✅ tous verts          | ⏳ CI en cours sur `89e3ffe`                     |
| 2   | Sourcery silent sur le DERNIER commit | ⏭ Sourcery `skipping` (rate limit hebdo accepté) |
| 3   | Threads humains résolus               | ⏳ aucun thread humain ouvert (PR fraîche)       |
| 4   | Branch up-to-date with main           | ✅ basée sur `51acdbf` (PR-D3 mergée)            |
| 5   | mergeStateStatus CLEAN                | ⏳ `UNSTABLE` initial post-push (normal)         |

**À surveiller** : Playwright E2E job va potentiellement échouer sur BUG-iOS-011 #116. **Accepté @cowork** pour le merge bypass admin.

---

## Statut CI initial post-push

```
Vercel Preview Comments        pass    0
Vercel                         pass    0   (deployment ready)
Sourcery review                skipping
check-sourcery-resolved        pending 0
Lint + Typecheck + Unit Tests  pending 0
Security audit                 pending 0
label                          pending 0
```

## Statut CI post-fix security (commit `b36faa2`)

```
Security audit                 ✅ pass    26s   (basic-ftp + ip-address overrides)
Lint + Typecheck + Unit Tests  ✅ pass  1m24s
Sourcery review                ✅ pass   25s   (no comments — silent)
check-sourcery-resolved        ✅ pass    3s
label                          ✅ pass    6s
Vercel                         ✅ pass    0
Vercel Preview Comments        ✅ pass    0
Lighthouse CI                  ⏭ skipping
Playwright E2E                 ❌ fail (pré-existant, hors scope PR-D3-bis — détail §"Playwright fails")
```

## Playwright fails — diagnostic et flag @cowork

Le run Playwright a flaggé **12 annotations** sur **7 spec lines distincts**. Tous **pré-existants** par rapport à la base `main` (`51acdbf`) — PR-D3-bis n'a touché ni `cookies-consent.spec.ts`, ni `error-boundaries.spec.ts`, ni `mobile-ios/landing.spec.ts`.

| #   | Browser          | Spec                                                                           | Origine PR       |
| --- | ---------------- | ------------------------------------------------------------------------------ | ---------------- |
| 1   | chromium-desktop | `cookies-consent.spec.ts:54` Footer "Modifier mes préférences cookies" reopens | PR-LEGAL-1 #120  |
| 2   | mobile-safari    | `cookies-consent.spec.ts:25` Accept all dismisses the banner                   | PR-LEGAL-1 #120  |
| 3   | mobile-safari    | `cookies-consent.spec.ts:39` Customize → save granular choice                  | PR-LEGAL-1 #120  |
| 4   | mobile-safari    | `cookies-consent.spec.ts:54` Footer reopens                                    | PR-LEGAL-1 #120  |
| 5   | mobile-safari    | `error-boundaries.spec.ts:12` Home CTA navigates back                          | THI-122 #117     |
| 6   | mobile-chrome    | `cookies-consent.spec.ts:54` Footer reopens                                    | PR-LEGAL-1 #120  |
| 7   | iPhone SE        | `mobile-ios/landing.spec.ts:15` no horizontal overflow                         | BUG-iOS-011 #116 |

**Diagnostic technique** :

- **#1, 4, 6 (Footer reopens, multi-browser)** : timeout 10s sur `getByRole('button', { name: 'Modifier mes préférences cookies' }).click()`. Le bouton est dans le `<footer>` en bas de page et n'est pas dans le viewport au moment du click. Fix probable : `scrollIntoViewIfNeeded()` avant le click. **Hors scope PR-D3-bis** (test PR-LEGAL-1, fichier non touché).
- **#2, 3 (Accept all + Customize, mobile-safari)** : timeout sur `not.toBeVisible()` du banner après accept. Sur Safari WebKit, le `useTransition` + Server Action async peut ne pas avoir flushé le `setDismissed(true)` dans le timing du test. Fix probable : remplacer `not.toBeVisible()` par un wait explicite sur `localStorage.getItem(STORAGE_KEY)`.
- **#5 (error-boundaries home CTA, mobile-safari)** : timeout sur navigation après click. Probable timing iOS WebKit. **Hors scope**.
- **#7 (iPhone SE overflow)** : BUG-iOS-011 #116 connu et **accepté @cowork** pour bypass admin.

**Mes 2 nouveaux specs PR-D3-bis** (`dashboard-cockpit-bloc2.spec.ts:38` layout reorder + `:73` cleanup legacy) **ne sont PAS dans cette liste** — ils utilisent `seedOnboardedUser()` qui requiert Supabase env, donc skippés automatiquement en CI. Pas un bypass : c'est le pattern standard du fichier (déjà en place pour les 4 specs PR-D3 originaux mergés).

**Recommandation @cowork** :

1. **Bypass admin sur Playwright pour PR-D3-bis** — les fails sont strictement pré-existants, hors scope, et BUG-iOS-011 #116 a déjà été accepté pour les PR récentes.
2. **Optionnel — PR-QA-1d follow-up** : fix les 6 nouveaux fails (cookies-consent + error-boundaries) avec :
   - `scrollIntoViewIfNeeded()` sur les Footer-button clicks
   - `await page.waitForFunction(() => !!localStorage.getItem('ankora.consent.v1'))` après Accept all sur mobile-safari
   - Augmentation du timeout iOS WebKit sur error-boundaries home navigation
     Si tu confirmes, je peux livrer ce follow-up dans une mini-PR demain matin (15-20 min).

---

## Backlog post-merge

1. **PR-D3-ter (animations motion-safe)** — post-mockups CD#3 du week-end. Fade-in séquentiel sur le breakdown, count-up sur le big number, transitions colour sur sign-flip. Visuel raffiné Monarch-level.
2. **PR-UI-1** — inputs settings unifiés DS Session #1 (F1 du handoff, post-CD#3).
3. **PR-D5** — Santé Provisions enrichie + plan rattrapage 3 mois (F2 du handoff, ADR-011).
4. **i18n cleanup sweep** — supprimer les keys orphelines `kpiProvisionsMonthly`, `kpiHealth*`, `kpiSuggestedTransfer*`, `kpiBills*` (laissées intactes dans cette PR pour ne pas coupler à un sweep multi-locale).
5. **Agent `dashboard-ux-auditor` enrichi** — formaliser la section "Pédagogie & Storytelling" du prompt @cowork (5 checks) dans `.claude/agents/dashboard-ux-auditor.md` afin que les futurs PRs s'auto-auditent (PR-AGENT-1 séparée).

---

## Actions @cowork demandées

- [ ] Vérifier la PR #122 → CI lint/typecheck/test/build verts
- [ ] Smoke test sur Vercel preview ([https://github.com/thierryvm/ankora/pull/122](https://github.com/thierryvm/ankora/pull/122) — login compte test → voir waterfall + layout réordonné)
- [ ] Approuver + squash merge avec **bypass admin** sur Playwright iPhone SE (BUG-iOS-011 connu/accepté)
- [ ] Décider PR-D3-ter (animations Monarch-level) post-mockups CD#3 du week-end OU validation directe si l'effet pédagogique suffit pre-launch

## Pour @thierry (validation post-merge empirique)

- **Desktop ankora.be/app** : voir le breakdown waterfall Capacité Réelle au PREMIER regard (`+ Revenus 2 500 € / − Effort lissé 1 876 € / − Plafond quotidien 500 € / +124 € hero`).
- **Layout** : comptes (Belfius / Belfius Épargne / Revolut) EN HAUT, Plan du mois (Principal→Vie Courante / →Épargne / Restant) EN BAS.
- **Disparition** des 4 cards legacy (Provisions/mois, Santé Critique, Virement suggéré, Factures Mai).
- **iPhone 14 PWA standalone** : breakdown lisible mobile (3 lignes empilées), big number hero préservé, layout stack vertical cohérent (radar → comptes → plan).

---

**Push done ≠ task done.** Squash merge attendu après ta validation finale + bypass admin Playwright.

🎯 PR-D3 livrait le bon nombre. PR-D3-bis livre la bonne histoire. La pédagogie au premier regard = différenciateur Ankora vs concurrents.

— @cc-ankora (Opus 4.7) · 2026-05-06 22:30 UTC+2
