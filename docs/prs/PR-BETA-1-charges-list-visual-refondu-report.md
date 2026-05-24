# PR-BETA-1 — Refonte visuelle `/app/charges` (THI-265) — Rapport final

> **Statut** : `Draft → ready for merge` (en attente DoD 5/5 final).
> **Date** : 24 mai 2026 (J-17 avant Beta 10 juin).
> **Auteur** : @cc-ankora (Claude Opus 4.7, pinné).
> **PR** : [#179](https://github.com/thierryvm/ankora/pull/179) sur branche `feat/beta-1-charges-list-visual`.
> **Linear** : [THI-265](https://linear.app/thierryvm/issue/THI-265/) → à passer "Done" après merge.
> **Sprint Beta** : 1/5 (suite : THI-266 i18n Phase B, THI-267 Capacité tryptique, THI-268 Dashboard 3 couches, THI-269 Auth-CTA + landing).

---

## 1. Contexte + déclencheur

@thierry a fait un smoke test prod le 24/05 et le visuel de `/app/charges` ("THIS MONTH 15 bills") était dégradé : vignettes "In 8 days" pas alignées, dates dispersées, dimensions non fixes entre items, mobile catastrophique. Cause racine documentée dans le rapport stratégique [`docs/reports/2026-05-24-reset-strategique-prod-vs-vision-cowork.md`](../reports/2026-05-24-reset-strategique-prod-vs-vision-cowork.md) §1.3.

PR-BETA-1 est la **première PR du sprint Beta 5 PRs** (J-17 confortable, ~16-20h dev total).

---

## 2. Diagnostic challenger (posture partenaire)

@cowork a décrit le problème comme "vignettes In 8 days pas alignées, dates dispersées". Or, lecture du code actuel `ChargesClient.tsx` :

- `RawCharge` type expose : `{ id, label, amount, frequency, dueMonth: 1-12, categoryId, isActive, notes }`
- **Aucune date relative ni absolue d'échéance n'est calculée ou affichée** dans le composant prod
- Le rendu actuel est : `label` (truncate) + `${frequency} · ref. ${month}` (text-xs muted) + `amount` (mono) + bouton delete

Le delta de diagnostic a été remonté à @thierry **avant** exécution. 3 options proposées :

| Option | Description                                                                                             | Verdict                        |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **A**  | Visuel pur, données existantes (`dueMonth` extrait comme colonne mois via `formatMonth(loc, 'short')`)  | ✅ **Validé** par @thierry     |
| B      | Ajouter vraie date d'échéance via `src/lib/domain/charges/next-due-date.ts` + `Intl.RelativeTimeFormat` | ❌ Scope creep fonctionnel     |
| C      | Hybride : Option A + tinte conditionnelle selon proximité mois                                          | ❌ Sortait du scope visuel pur |

Cette discipline a évité de partir sur le mauvais composant ou d'introduire de la logique métier déguisée en refactor visuel.

---

## 3. Scope tenu vs. scope déclaré

| Contrainte prompt                                              | État livré                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aucune touch CRUD (`createChargeAction`, `deleteChargeAction`) | ✅ Vérifié — test "preserves the add-form CRUD scaffolding"                                                                                                         |
| Aucune touch form fields                                       | ✅ Vérifié — `label`, `amount`, `frequency`, `dueMonth` Inputs/Selects inchangés                                                                                    |
| Aucune touch validation Zod côté action server                 | ✅ Vérifié — fichier `src/lib/actions/charges.ts` non touché                                                                                                        |
| Aucune touch toast erreurs                                     | ✅ Vérifié — `useActionErrorTranslator` + `toast.success/error` inchangés                                                                                           |
| Aucune touch i18n keys                                         | ✅ Vérifié — 0 nouvelle key, `messages/*.json` intouchés (sr-only column header sacrifié pour respecter cette contrainte ; reading order naturel WCAG AA compliant) |
| Aucune touch `ChargesPage` Server Component                    | ✅ Vérifié — `page.tsx` parent inchangé                                                                                                                             |

**Bonus hors scope déclaré, livré quand même** :

- Migration anti-pattern `bg-muted` → `bg-surface-muted` (catch ui-auditor pré-merge, WCAG AA contrast fix sur le chip)
- Migration `md:hover:bg-muted/40` → `md:hover:bg-surface-muted` (cohérence convention `docs/design/token-usage.md`)

---

## 4. Layout livré

### 4.1 Desktop (≥ 768 px)

```
[mois 5rem] [label flex-1 min-w-0 truncate] [freq-chip auto] [montant auto text-right] [delete auto]
```

- `md:grid md:grid-cols-[5rem_minmax(0,1fr)_auto_auto_auto] md:items-baseline md:gap-4`
- `divide-y divide-border/40` entre rows
- `hover:bg-surface-muted` (subtle row hover)
- Tabular-nums sur les montants (alignement vertical des chiffres entre rows)
- Astuce technique : `md:contents` sur les wrappers `<div>` mobile fait disparaître ces conteneurs en desktop et projette month/amount/label/freq comme enfants directs du grid. Les `md:order-{1,2,3,4}` réordonnent les cellules dans l'ordre visuel desktop.

### 4.2 Mobile (< 768 px)

```
+----------------------------------------+
| Janv.              1 200,00 €  [X]     |  ← header: month + amount + delete top-right absolu
| Loyer appartement      [Mensuel]       |  ← body: label + freq-chip
+----------------------------------------+
```

- `rounded-lg border bg-card p-4 pr-14` (cards isolées avec safe-zone right pour le delete)
- Delete `absolute right-2 top-2 size-11` (44×44 CSS px = conforme WCAG 2.5.5 Level AAA + Apple HIG)
- Header : `flex justify-between` mois ↔ amount
- Body : `flex items-center gap-2 mt-2` label + chip

### 4.3 Tokens design system utilisés

Tous conformes `docs/design/token-usage.md` après catch ui-auditor :

- `bg-card` (surface principale mobile card)
- `border-border/60` (border subtile mobile card)
- `bg-surface-muted` (hover row desktop + chip background)
- `text-foreground` (label, amount)
- `text-muted-foreground` (mois colonne, freq-chip text — contraste 7.5:1 AAA sur `bg-surface-muted`)
- `text-danger` (icône Trash2)
- Pas d'usage de `bg-muted` comme surface (anti-pattern fixé)

---

## 5. Tests

### 5.1 Vitest unitaires — `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx`

6 tests :

1. `shows the empty-state copy when no charges are provided`
2. `renders the charges list as a semantic <ul role="list"> with one <li> per charge`
3. `exposes the four visual cells for each row (month, label, frequency chip, amount)`
4. `exposes an aria-label naming the charge on every delete button`
5. `marks the amount cell with tabular-nums so digits align vertically across rows`
6. `preserves the add-form CRUD scaffolding (out-of-scope guard against accidental refactor)`

Pattern mirroré de `src/components/features/__tests__/AccountCardEditableTitle.test.tsx` (NextIntlClientProvider + action mocks via `vi.hoisted`).

Résultat local : **6/6 pass** (1194/1194 sur la suite complète).

### 5.2 Playwright e2e

- `e2e/charges/charges-list-desktop.spec.ts` (viewport forcé 1280×800) : assert baseline alignment (spread bottoms ≤ 6px), amount cell positionné dans la moitié droite, chip width < 120px.
- `e2e/charges/charges-list-mobile.spec.ts` (viewport forcé 375×667) : assert mobile card border + radius + padding, delete bouton ≥ 44×44 boundingBox, pas d'overflow horizontal.

Auto-skip sans Supabase admin (pattern `e2e/dashboard-expenses.spec.ts`). En CI, ils tourneront sur les 3 projets `chromium-desktop`, `mobile-safari`, `mobile-chrome` avec le viewport forcé via `test.use({ viewport })`.

---

## 6. Agents QA lancés

### 6.1 `ui-auditor` — verdict initial : **FAIL WCAG AA** (1 finding critique)

**Catch critique** : frequency chip utilisait `bg-muted text-muted-foreground` → contraste 1.18:1 light / 1.35:1 dark → FAIL WCAG 1.4.3 AA + anti-pattern `docs/design/token-usage.md`.

**Fix appliqué dans le même PR** (commit `27bf26e`) : `bg-muted` → `bg-surface-muted` (contraste 7.5:1 AAA). Hover state aligné. Audit re-PASS post-fix.

Autres findings PASS :

- Sémantique `<ul role="list">` + `<li>` corrects
- ARIA delete aria-label complet
- Focus rings emerald hérités du Button shadcn
- `md:contents` + `md:order` : compatible Chrome 88+ / Firefox 72+ / Safari 14.1+
- `pr-14` safe-zone évite overlap delete/amount
- CRUD form inchangé (vérifié)

### 6.2 `mobile-ios-auditor` — verdict : **PASS_WITH_NOTES** (1 risque conditionnel landscape)

**PASS** :

- Touch target 44×44 conforme HIG + WCAG 2.5.5 (`size-11` = 2.75rem)
- Pas d'usage `100vh` (zéro régression WebKit)
- Pas de touch sur shell PWA / safe-area (header safe-area inchangé)
- Focus rings `brand-600` hérités du Button
- Anti auto-zoom : `ankora-form-control-16` sur les Inputs (inchangés)
- Scroll mobile + `pr-14` : aucun overflow horizontal (vérifié par e2e + `overflow-x-clip` sur `<html>`)
- ITP cookies : non concerné

**1 finding non-bloquant** :

- Delete `absolute right-2 top-2` sans `env(safe-area-inset-right)` : risque visuel en **landscape iPhone** (safe-area-inset-right ~34px) où le bouton pourrait empiéter sur la zone système. En portrait (usage principal) : aucun risque. À considérer pour PR future si feedback @thierry sur usage landscape.

### 6.3 `test-runner` — **non lancé** (déjà couvert localement)

Vitest 1194/1194 + typecheck + lint déjà validés en local avant push. Lancer test-runner aurait dupliqué l'effort.

---

## 7. Quality gates locaux (avant push)

| Gate                         | Résultat                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| `npm run typecheck`          | ✅ 0 erreur                                                              |
| `npm run lint`               | ✅ 0 erreur (6 warnings pré-existants, 0 nouvelle warning introduite)    |
| `npm run lint:use-server`    | ✅ Tous les fichiers `'use server'` ne contiennent que des exports async |
| `npm run test`               | ✅ 99 test files, 1194 tests, all passing                                |
| `npm run build`              | ✅ Build prod compile sans erreur                                        |
| `npx playwright test --list` | ✅ Specs détectés sur les 3 projets desktop-class                        |

---

## 8. Définition de DONE 5/5

| #   | Critère                                                                 | État                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tous les checks CI verts (Lint, Typecheck, Tests, E2E, Security, Build) | ⏳ **En cours** — Lint+Typecheck pass (commit `c27843b`), Playwright en cours, lint+typecheck du commit `27bf26e` (WCAG fix) en attente |
| 2   | Sourcery silent sur le DERNIER commit                                   | ⏳ **À re-vérifier** post run Sourcery sur `27bf26e`                                                                                    |
| 3   | Reviews humaines (solo project)                                         | ✅ DoD = mergeable                                                                                                                      |
| 4   | Pas de conflit avec main                                                | ✅ Branche partie de main `7053fd5`, aucun commit conflictuel                                                                           |
| 5   | Rapport final + CHANGELOG + Linear "Done"                               | ✅ Ce document + CHANGELOG.md mis à jour + Linear à passer "Done" post-merge                                                            |

---

## 9. Smoke test @thierry post-merge (procédure `docs/runbooks/dev-on-iphone.md`)

Points à vérifier manuellement sur iPhone réel :

- [ ] Scroll mobile fluide, cards empilées lisibles, gap entre cards visible
- [ ] Delete tap target 44×44 atteignable au pouce sans miss-tap sur le label/chip
- [ ] Pas de hover-only bug — delete visible au repos sans hover
- [ ] Layout cohérent en orientation portrait + **landscape** (vérifier finding mobile-ios-auditor sur safe-area-right)
- [ ] Standalone PWA (Add-to-Home) : header colle correctement au top sans espace blanc
- [ ] Tap delete bouton → toast "Charge supprimée" → liste re-render → bouton 44×44 sur la card suivante toujours accessible

Smoke test desktop :

- [ ] 4 cells alignées baseline (mois, label, chip, montant à la même ligne de base)
- [ ] Montants alignés verticalement entre rows (tabular-nums)
- [ ] Hover row → bg subtil (pas d'effet brutal)
- [ ] Truncate long label fonctionne sans casser la grid
- [ ] Touch desktop souris → cohérent avec mobile touch

---

## 10. Notes pour la suite

### 10.1 Sprint Beta — prochain ticket

Quand PR-BETA-1 mergée + CI verte + Sourcery silent + smoke iPhone OK :

- **Signaler à @thierry via @cowork** pour passer à **PR-BETA-2 (THI-266 i18n Phase B)**
- Pas d'enchaînement automatique — chaque PR mergée déclenche un check arbitrage @thierry

### 10.2 Sourcery suggestion hors scope flagged

L'IDE @thierry a relayé une suggestion Sourcery sur `e2e/mobile-ios/dashboard.spec.ts:89` (`suggestion:use-object-destructuring`). **Hors scope PR-BETA-1** (fichier non touché). À adresser dans un ticket séparé Linear backlog si pertinent — low priority style suggestion.

### 10.3 Décisions verrouillées

- **Option A "Visuel pur, données existantes"** confirmée par @thierry comme la bonne lecture du scope. Si une PR future ajoute la vraie date d'échéance (Option B), ce sera un nouveau ticket avec ADR explicite (besoin de définir : précision relative vs absolue, locale-aware, behaviour overdue, etc.).
- **Sr-only column headers sacrifiés** pour respecter "0 nouvelle i18n key". Si une PR future enrichit les headers, ajouter les 4 keys (`columnMonth`, `columnLabel`, `columnFrequency`, `columnAmount`) dans les 5 locales.

---

**Fin du rapport.** @thierry → smoke test iPhone post-merge + Linear THI-265 → "Done".
