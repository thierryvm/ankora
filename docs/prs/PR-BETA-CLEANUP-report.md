# PR-BETA-CLEANUP — Chore ROADMAP + Polish UI + Fix i18n callback

**Linear** : THI-279 (closed at merge)
**Branch** : `chore/beta-cleanup-roadmap-polish`
**Date** : 2026-05-25 (J-16 Sprint Beta)
**Pilote** : @cc-ankora (Claude Opus 4.7)
**Demandeur** : @cowork brief 2026-05-25 — handoff @cc-ankora pour fermer le sillage post-BETA-6 propre

---

## TL;DR

PR mini groupée — **4 items hygiène + polish** dans une seule branche pour gagner du temps CI :

1. ROADMAP sync (PR-BETA-1 + PR-BETA-6 + THI-279 backlog)
2. Cleanup code mort drawer `variant === 'app'` dans HeaderNav + prop `isAdmin` orpheline
3. Fix alignement badges « Prochaines factures » via grid 3 colonnes
4. Fix THI-279 i18n callback OAuth — préservation locale dans la redirect

**1254/1254 vitest pass** (+8 vs PR-BETA-6) — lint 0 erreurs, typecheck 0, build OK.

---

## Item 1 — ROADMAP sync (commit `e738e9e`)

Ajout d'un bloc « Update 25 mai 2026 » en tête de `docs/ROADMAP.md` :

- PR-BETA-1 (THI-265, `5232dda`, #179) trackée comme mergée — refactor visuel `/app/charges`
- PR-BETA-6 (THI-277, `0cdf924`, #182) trackée comme mergée — Apple HIG Bottom Tab Bar + 5 hotfix
- Sprint Beta restantes annoncées : **3 PR** — PR-BETA-3 / PR-BETA-4 / PR-BETA-5 (scope réduit)
- THI-279 i18n callback OAuth ajoutée au backlog Beta

Aligne le repo sur la doctrine `CLAUDE.md` Ankora §"Synchronisation ROADMAP ↔ repo (règle durable)".

## Item 2 — Cleanup HeaderNav (commit `25b6f52`)

Depuis PR-BETA-6 hotfix #1, le `shouldRenderMobileTrigger` gate a rendu le bloc `{variant === 'app' && (…)}` du drawer **inatteignable** (le hamburger trigger + portail drawer ne sont plus rendus pour le variant app). Le bloc était du code mort doublonnant la BottomTabBar's More sheet.

### Fichiers

- ✏️ `src/components/layout/HeaderNav.tsx` : suppression du bloc (~70 lignes) + retrait de la prop `isAdmin` orpheline + JSDoc breadcrumb
- ✏️ `src/components/layout/Header.tsx` : retrait du forward `isAdmin={showAdminLink}` (le desktop admin link continue d'utiliser `showAdminLink` directement)
- ✏️ `src/components/layout/__tests__/Header.test.tsx` : retrait des 3 specs `data-is-admin` forwarding (couvert par MoreSheet test suite)
- ✏️ `src/components/layout/__tests__/HeaderNav.test.tsx` : renommage describe + tightening des specs anti-régression

**Diff** : 4 fichiers, +32 / −112 lignes.

## Item 3 — Badge alignment Prochaines factures (commit `70f42cb`)

### Bug

Smoke iPhone @thierry 25/05 sur cockpit `/app` « THIS WEEK 15 bills » : les chips « In 7 days » dérivent horizontalement entre items adjacents. Cause = `flex justify-between` avec chip + amount dans un sibling `shrink-0` du label `min-w-0` → le X du chip varie avec la largeur du label adjacent.

### Fix

Refactor `<li>` en **grid 3 colonnes** :

- Col 1 (label + date) : `minmax(0, 1fr)` — préserve la troncature
- Col 2 (chip jour-count) : `auto` + `min-w-24` (6rem) → couvre tous les strings i18n (FR « En retard de 365 jours » ≈ 18 chars, EN « 365 days overdue » ≈ 16 chars) + `inline-flex justify-center` pour centrer
- Col 3 (montant) : `auto` + `min-w-18` (4.5rem) + `text-right` → alignement à droite cohérent

Les classes `tabular-nums` sont préservées sur les 2 blocs numériques pour la stabilité des chiffres.

### Fichier

- ✏️ `src/components/dashboard/ProchainesFacturesCard.tsx` : 1 fichier, +26 / −15 lignes

**Pas de nouveau test** — changement visuel/contractuel, le `ProchainesFacturesCard.test.tsx` existant continue de passer (vérifié dans suite complète).

## Item 4 — Fix THI-279 i18n callback OAuth (commit `e30b987`)

### Bug

Smoke @thierry 25/05 sur PR #182 preview : login OAuth Google depuis `/en` (ou autre locale non-default) → callback → URL collapse vers `/en?code=…` (raw landing avec le code OAuth toujours présent) au lieu de `/en/app`.

### Cause root

`src/app/auth/callback/route.ts` faisait `NextResponse.redirect(new URL('/app', request.url))` **sans aucune connaissance de la locale**. Le proxy next-intl tentait ensuite de rerouter `/app` mais le cookie/locale state était mal préservé pendant le bounce.

### Fix

Lecture du cookie `NEXT_LOCALE` (set par next-intl + `setLocaleAction` via LocaleSwitcher) au début du `GET` handler, validation contre `routing.locales`, et préfixe `/<locale>` sur **tous** les targets de redirect (sauf default `fr-BE` per `localePrefix: 'as-needed'`).

Couvre :

- `/app` et `/onboarding` (happy path)
- `/login?error=missing_code` (pas de code)
- `/login?error=exchange_failed` (Supabase code exchange error)
- `/login` (post-exchange `getUser` returned null)
- Le `?next=…` query param (target safe-redirect) est aussi préfixé, le guard same-origin existant préservé.

### Fichiers

- ✏️ `src/app/auth/callback/route.ts` : ajout `resolveLocale()` + `localiseTarget()` helpers + JSDoc complet, application sur les 5 paths de redirect
- ➕ `src/app/auth/callback/__tests__/route.test.ts` : nouveau, **10 specs** couvrant la matrice complète (fr-BE unprefixed, EN/DE-DE prefixed, no cookie → default, spoofed cookie → default, onboarding branch, next-param prefix, protocol-relative next rejection, 3 error branches)

**Diff** : 2 fichiers, +207 / −4 lignes.

### Limite connue (à smoke test prod)

Cette fix assume que l'OAuth roundtrip atteint bien `/auth/callback`. Si la **config Supabase Google OAuth Console** redirect URL pointe ailleurs (ex: `/`), le code ne tourne jamais — c'est un bug infra séparé. Smoke step ajoutée ci-dessous pour @thierry post-merge.

---

## Quality gates

```text
npm run lint              → 0 erreurs (6 warnings pré-existants hors scope)
npm run lint:use-server   → 0 erreurs
npm run typecheck         → 0 erreurs
npm run test (1254 tests) → 100% pass — 102 files, 24.8 s
npm run build             → succès, 0 erreur
```

**+8 tests Vitest** vs PR-BETA-6 livré (10 callback specs − 2 specs admin forwarding retirées).

---

## Smoke test à faire @thierry POST-merge sur preview Vercel

### Visual

- [ ] Cockpit `/app` (mobile iPhone réel) → assert badges chip alignés verticalement (« In 7 days » sous « In 3 days » sous « Today » → même X)
- [ ] Montants alignés à droite cohérents (« €1,234.00 » sous « €56.00 » alignés sur le edge droit)

### i18n callback OAuth

- [ ] Login depuis `/en` → après OAuth Google → assert URL = `/en/app` (PAS `/en?code=…`)
- [ ] Login depuis `/` (FR default) → après OAuth → assert URL = `/app` (sans préfixe)
- [ ] Login depuis `/de-DE` → après OAuth → assert URL = `/de-DE/app`
- [ ] First-time signup → onboarding flow respecte la locale (`/en/onboarding`)

### ⚠️ Si callback fix ne marche pas en prod

Vérifier la config **Supabase Dashboard → Authentication → URL Configuration** :

- Site URL : `https://ankora.be`
- Redirect URLs : doit contenir `https://ankora.be/auth/callback` (PAS `https://ankora.be/*`)

Si la config est `/*` ou `/`, le bug persiste — la fix code-side est sans effet. Ticket infra séparé requis.

---

## DoD 5/5

| #   | Critère          | Status | Preuve                                                   |
| --- | ---------------- | ------ | -------------------------------------------------------- |
| 1   | CI verts         | ⏳     | À vérifier sur PR ouverte (lint/typecheck/test local ✅) |
| 2   | Sourcery silent  | ⏳     | À vérifier post-push                                     |
| 3   | Reviews approved | ⏳     | @thierry valide                                          |
| 4   | 0 conflit main   | ✅     | Branche basée sur `0cdf924` (HEAD main 25/05)            |
| 5   | Rapport livré    | ✅     | Ce fichier                                               |

---

## Linkage Linear

- **THI-279** i18n callback OAuth → **Done** au merge (livré item #4)
- **THI-265** PR-BETA-1 → déjà Done (trackée maintenant dans ROADMAP item #1)
- **THI-277** PR-BETA-6 → déjà Done (trackée maintenant dans ROADMAP item #1)

---

## Refs

- Rapport CC Ankora 25/05 sur PR-BETA-6 §"Dette doctrinale + Dette technique"
- Prompt @cowork PR-BETA-CLEANUP 2026-05-25 13:55
- Capture @thierry badges désalignés cockpit `/app` (25/05)
- Smoke @thierry langue switch après OAuth (25/05)
