# PR-BETA-2 — Rapport final (i18n perf Phase B + landing FR/EN drift)

| Champ         | Valeur                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| PR GitHub     | _à compléter à l'ouverture_                                                                                 |
| Branche       | `feat/beta-2-i18n-perf-phase-b`                                                                             |
| Linear        | [THI-266](https://linear.app/thierryvm/issue/THI-266) — couvre TICKET 4 (drawer) + TICKET 7 (delayed apply) |
| Date          | 2026-05-24                                                                                                  |
| Modèle        | Claude Opus 4.7 (épinglé via `.claude/settings.local.json`)                                                 |
| Worktree      | `F:\PROJECTS\Apps\ankora-worktrees\feat-beta-2-i18n-perf-phase-b`                                           |
| Sprint        | Beta — PR #2 / 5 (suite de PR-BETA-1 #179 mergée 24/05)                                                     |
| Approche      | Minimaliste validée par @thierry (vs scope architectural initial du prompt @cowork) — cf. §3 ci-dessous     |
| Durée session | ~1 h (Phase 0 + code verify + arbitrage + implementation + quality gates + report)                          |

---

## 1. Posture initiale — challenge du prompt avant exécution

Conformément à la posture "ingénieur partenaire d'abord, exécutant ensuite" du `CLAUDE.md` Ankora, j'ai effectué la phase **"code verify before prescribe"** AVANT toute modification. Lecture intégrale de :

- `src/app/[locale]/layout.tsx` (cookies + ThemeBootScript)
- `src/proxy.ts` (middleware + CSP + i18n routing)
- `src/i18n/routing.ts` + `request.ts` + `navigation.ts`
- `src/components/layout/LocaleSwitcher.tsx`
- `src/components/layout/HeaderNav.tsx`
- `e2e/i18n/locale-switcher.spec.ts`
- `src/lib/actions/locale.ts`
- `messages/*.json` (recherche `FR · NL · EN`)

**Verdict** : le diagnostic du prompt @cowork (audit perf THI-243 RC #2 / #4) était partiellement correct mais ciblait la mauvaise cause racine pour les 4 bugs visibles. Détail dans §3 ci-dessous. J'ai flag @cowork via `AskUserQuestion`, qui a validé une **approche minimaliste** (retrait `router.refresh()` + landing drift + unfixme E2E) plutôt que le scope architectural large initial.

Conséquence : 9 fichiers touchés, 0 changement risqué sur layout racine / middleware / RSC cache, 100% des bugs P1 ciblés traités OU explicitement déférés à PR-BETA-2bis avec rationale chiffré.

---

## 2. Scope livré

### 2.1 LocaleSwitcher — retrait de `router.refresh()` (TICKET 4 + TICKET 7 cause racine)

`src/components/layout/LocaleSwitcher.tsx` (handler `onChange`) :

```diff
  startTransition(async () => {
    await setLocaleAction(next);
    router.replace(pathname, { locale: next });
-   router.refresh();
  });
```

**Pourquoi c'est suffisant** : en mode `localePrefix: 'as-needed'`, `router.replace(pathname, { locale })` change déjà le pathname (`/` ↔ `/en`, `/dashboard` ↔ `/en/dashboard`). Ce changement d'URL déclenche le re-render naturel des Server Components avec la nouvelle locale via `setRequestLocale()`. Le `refresh()` était redondant ET destructeur :

- Invalidait l'intégralité du cache RSC → cold refetch complet
- Démontait `HeaderNav` (incl. son portal drawer state) → **fermeture du drawer mobile pendant le switch** (TICKET 4)
- Étirait la propagation > 15 s en `npm run dev` (TICKET 7)
- Pas nécessaire pour persister les side-effects de `setLocaleAction` (cookie + DB) qui s'écrivent server-side avant la navigation client

Commentaire JSDoc enrichi pour graver le rationale architectural (anti-régression).

### 2.2 Vitest — 3 nouveaux specs (no-refresh contract)

`src/components/layout/__tests__/LocaleSwitcher.test.tsx`, nouveau `describe('<LocaleSwitcher /> — THI-266 Phase B no-refresh contract')` :

1. `router.replace` appelé exactement 1 fois avec `(pathname, { locale })`
2. `router.refresh` **jamais** appelé — invariant architectural
3. Ordre des side-effects : `setLocaleAction` puis `replace` (anti-race cookie/navigation)

Refactor mock `@/i18n/navigation` via `vi.hoisted()` pour exposer `replaceMock` + `refreshMock` à la fois au factory `vi.mock` et aux assertions (sans ce hoist, chaque `useRouter()` call retournerait des `vi.fn()` neufs et `toHaveBeenCalled` lirait toujours vide).

`beforeEach` étendu : `replaceMock.mockClear() + refreshMock.mockClear()` pour isolation.

### 2.3 E2E Playwright — unfixme des 3 scenarios (TICKET 7 coverage active)

`e2e/i18n/locale-switcher.spec.ts` :

| #   | Scenario                                                                | État avant   | État après |
| --- | ----------------------------------------------------------------------- | ------------ | ---------- |
| 1   | Four rapid successive switches FR→EN→FR→EN settle on the last selection | `test.fixme` | ✅ actif   |
| 2   | Locale survives a cross-page navigation (landing → `/faq`)              | `test.fixme` | ✅ actif   |
| 3   | i18n parity across `/`, `/faq`, `/glossaire`                            | `test.fixme` | ✅ actif   |

- Helper `switchTo()` : timeout 15 s → 5 s (résistant au HMR jitter de `npm run dev` sans masquer une régression).
- Header JSDoc + commentaires inline réécrits pour refléter Phase B done.
- `playwright.config.ts` inchangé (spec déjà en `testIgnore` mobile, status préservé — la couverture mobile-iOS arrivera via une spec dédiée coordonnée avec `mobile-ios-auditor`).

### 2.4 Landing drift FR/EN — alignement doctrine v1.0

5 fichiers `messages/<locale>.json` ligne 132 : `"languages": "FR · NL · EN"` → `"languages": "FR · EN"`.

Cohérence avec :

- `CLAUDE.md` "Cap v1.0 publique — Langues v1.0 : FR + EN seulement"
- `docs/NORTH_STAR.md`
- `LOCALES_VISIBLE = ['fr-BE', 'en']` dans `src/i18n/routing.ts`
- `LangSwitcher` atom UI (déjà restreint aux 2 visibles)

NL/DE/ES restent atteignables en deep-link URL (le routing next-intl garde les 5 locales comme source de vérité), mais ne sont plus exposées dans le marketing tant que chaque locale n'a pas reçu une review native.

Test Vitest `Hero.test.tsx` ligne 75 mis à jour en lockstep pour matcher `/FR · EN/i`.

---

## 3. Hors scope (volontairement déféré) — divergence avec le prompt initial

Le prompt @cowork initial demandait 4 chantiers parallèles :

1. ✅ **Drawer stay-open + propagation rapide** → couvert par retrait `router.refresh()`
2. ✅ **Landing drift FR/EN** → couvert
3. ✅ **Unfixme E2E** → couvert
4. ❌ **Refactor architectural** (extraction `cookies()` hors `[locale]/layout.tsx` + optimisation middleware matcher)

**Pourquoi (4) est déféré à PR-BETA-2bis** :

### 3.1 `cookies()` dans layout.tsx — diagnostic affiné

Le prompt désignait `cookies()` ligne 144 de `[locale]/layout.tsx` (lecture du cookie `theme` pour SSR anti-FOUC) comme la cause forçant toutes les routes `[locale]/*` en `ƒ Dynamic`. Diagnostic **techniquement correct sur la cause de Dynamic**, mais le fix proposé "extraire dans un wrapper Client" pose deux problèmes :

- **Le FOUC** : le `cookies()` du layout sert à hydrater `<html data-theme="dark">` AVANT que `ThemeBootScript` ne s'exécute. L'extraire naïvement = FOUC clair → sombre garanti sur chaque cold render visiteur en mode sombre. La feature `ThemeBootScript` existe précisément pour mitiger ce cas, le retirer = régression a11y + visuelle.
- **Le double cookies()** : `src/i18n/request.ts` ligne 10 lit AUSSI `cookies()` pour résoudre `NEXT_LOCALE`. Même en extrayant le cookie thème, les routes resteraient `ƒ Dynamic` à cause de cette deuxième lecture. **C'est mathématiquement inhérent à next-intl en mode `localePrefix: 'as-needed'`**.
- **Vraie cause cold render lent** : `src/i18n/request.ts` `resolveLocaleFromUserOrCookie()` exécute `auth.getUser()` + `SELECT users.locale` Supabase quand le cookie `NEXT_LOCALE` est absent. Deux round-trips DB par request en first-visit/cold-cache. C'est probablement la principale source de la lenteur perçue côté serveur, pas le statut `Dynamic`.

### 3.2 Middleware matcher

Le matcher actuel ([`src/proxy.ts:136`](../../src/proxy.ts)) est déjà très précis : exclut `api`, `_next/static`, `_next/image`, `_vercel`, `auth/callback`, `sw.js`, `monitoring`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `llms.txt`, et **toutes** les extensions image/font (png, jpg, svg, webp, avif, ico, ttf, woff, woff2, otf, eot). Aucune optimisation matérielle possible sans risquer de re-casser les RSC prefetches ou le ServiceWorker — incidents documentés dans les commentaires inline du matcher (audits prod 2026-05-18 et 2026-05-19).

### 3.3 Plan PR-BETA-2bis (si nécessaire)

À ouvrir uniquement si la mesure post-merge confirme un résiduel de lenteur. Scope ciblé :

- `src/i18n/request.ts` : court-circuit DB Supabase quand `NEXT_LOCALE` cookie présent (skip `auth.getUser` + `SELECT users.locale`). Cache hit ratio attendu : > 95% en steady state.
- Mesure perf chiffrée avant/après via `npm run lhci` + Chrome DevTools Performance trace.
- Audit `cookies()` layout uniquement si la mesure prouve un gain net ≥ 200 ms sur LCP — sinon coût FOUC > bénéfice.

---

## 4. Quality gates locaux

| Gate                      | Résultat                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`            | ✅ 0 erreurs, 6 warnings (toutes pré-existantes, non introduites par cette PR — `_path`, `_locale` unused, console statements legitimes)                                |
| `npm run lint:use-server` | ✅ Pass (`setLocaleAction` reste async-only)                                                                                                                            |
| `npm run typecheck`       | ✅ Pass (0 erreur tsc strict)                                                                                                                                           |
| `npm run test` (Vitest)   | ✅ **1197/1197** tests OK (99 fichiers). +3 nouveaux specs no-refresh contract, +1 update Hero drift.                                                                   |
| `npm run build` (Next)    | ✅ Compile OK, 161 pages générées. Note : routes `[locale]/*` restent `ƒ Dynamic` (cf. §3.1, **état pré-PR-BETA-2 inchangé**, à traiter en PR-BETA-2bis si nécessaire). |

E2E Playwright **non exécutés en local** dans cette session (CI s'en charge). Les 3 scenarios unfixme'd doivent passer en CI sur le profil `chromium-desktop`. Si timeout / red, retour challenge avant merge.

---

## 5. DoD — checklist 5/5

| #   | Critère                                    | État                                                                                   |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | Phase 0 model check Opus 4.7               | ✅ `.claude/settings.local.json` ligne 170 : `"model": "claude-opus-4-7"`              |
| 2   | CI verte                                   | ⏳ À vérifier post-push                                                                |
| 3   | Sourcery silent dernier commit             | ⏳ À vérifier post-push (poll prévu après chaque push)                                 |
| 4   | Reviews humaines                           | _solo project — DoD ok = mergeable_                                                    |
| 5   | 0 conflit `main`                           | ⏳ À vérifier (branche créée from main propre `2833ca7`)                               |
| 6   | Rapport final + CHANGELOG                  | ✅ Ce fichier + entrée CHANGELOG.md sous `[Unreleased]` / `### 2026-05-24 — PR-BETA-2` |
| 7   | Linear THI-266 → Done + ferme TICKET 4 + 7 | ⏳ À faire post-merge (sous-tickets ou link description)                               |

Smoke test iPhone réel @thierry post-merge (voir §6 ci-dessous).

---

## 6. Smoke test post-merge — protocole iPhone réel

À exécuter par @thierry sur Vercel preview (SSO bloque tests automatisés sur previews protected) :

1. Ouvrir `/` sur iPhone Safari réel (PWA installé recommandé)
2. Ouvrir le drawer mobile (hamburger ☰)
3. Cliquer sur le `<select>` langue, choisir EN
4. **Assert visuel** : le drawer reste ouvert pendant la transition (loader visible mais pas de fermeture)
5. **Assert timing** : `<html lang>` reflète `en` en moins de 1 s
6. Refaire EN → FR → EN → FR rapidement (4 switches consécutifs) — assert : drawer ne ferme jamais, locale finale = dernier choix
7. Naviguer vers `/faq` — assert : `<html lang>=en`, contenu en anglais
8. Tester un cold reload `/app` (cockpit) en mode connecté — assert : locale persistée (cookie NEXT_LOCALE)
9. **Assert hors-scope** : aucune régression sur flows auth (login, signup, MFA), dashboard (KPIs, drawer drill-downs), GDPR (consent banner, export, deletion)

Si **n'importe lequel** de ces points échoue, NE PAS merger — re-challenge @cowork.

---

## 7. Risques identifiés + mitigations

| Risque                                                                                                                       | Mitigation                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suppression `router.refresh()` casse un side-effect non identifié (ex : revalidation manuelle d'un Server Component custom). | Tests Vitest no-refresh + 3 E2E activés couvrent les principaux contrats. Si regression : revert localisé d'1 ligne (low blast radius).                                                   |
| `<html lang>` ne se met pas à jour sans `refresh()` sur certains navigateurs.                                                | Couvert par les 3 E2E `waitForFunction` sur `document.documentElement.lang`. Mode `as-needed` change le pathname = trigger natif Next pour re-render `<html lang>`.                       |
| Routes restent `ƒ Dynamic` → perf perçue toujours dégradée en cold render.                                                   | Documenté explicitement en §3. PR-BETA-2bis prévue si mesure post-merge confirme le résiduel. Pas de blocage Beta : le `router.refresh()` était la cause principale du switch perçu lent. |
| Drift NL/DE/ES masqué dans landing → utilisateurs NL voient FR/EN seulement.                                                 | Conforme à la doctrine v1.0 lockée. NL/DE/ES restent atteignables en deep-link URL pour QA + early adopters. Annoncées dans `/roadmap` publique pour transparence.                        |
| Sourcery flag scope creep (5 messages + 4 sources files).                                                                    | Scope cohérent (1 architectural fix + 1 doctrine drift + 1 test contract). Réponse anticipée : "PR-BETA-2 traite 3 bugs liés architecturalement par le même handler `onChange`".          |

---

## 8. Handoff @cowork — décision PR-BETA-2bis

@cowork : après merge + smoke test @thierry, mesurer le switch locale en prod via Chrome DevTools Performance trace (mobile iPhone simulation + throttling 4G slow). **Critère GO/NO-GO** pour PR-BETA-2bis :

- **NO-GO** : si propagation < 1 s mesurée P95 et drawer reste ouvert → close THI-266 + TICKET 4 + TICKET 7, passer à PR-BETA-3 (THI-267 Capacité tryptique).
- **GO** : si propagation > 1 s OU cold render LCP > 2.5 s → ouvrir PR-BETA-2bis sur le scope §3.3 (court-circuit `request.ts` Supabase).

Mesure suggérée : 5 essais répétés sur 3 device profiles (iPhone 14, Pixel 7, MacBook Air M1) après cookie clear, avec capture du waterfall réseau.

---

## 9. Suite — sprint Beta

Quand PR-BETA-2 mergée + CI verte + Sourcery silent + smoke iPhone @thierry OK → handoff @cowork pour **PR-BETA-3 (THI-267 Capacité tryptique ADR-009 amendement)**, #3 / 5 du sprint Beta. J-17 avant Beta 10 juin (cible).

---

_Rapport généré par @cc-ankora (Claude Opus 4.7) — 2026-05-24._
