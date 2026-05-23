# PR-FIX-I18N-UX — Rapport final

| Champ         | Valeur                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR GitHub     | [#177](https://github.com/thierryvm/ankora/pull/177)                                                                                                   |
| Branche       | `fix/thi-i18n-ux`                                                                                                                                      |
| Linear        | [THI-252](https://linear.app/thierryvm/issue/THI-252) (partial loader) + [THI-255](https://linear.app/thierryvm/issue/THI-255) (spec written, fixme'd) |
| Date          | 2026-05-23                                                                                                                                             |
| Modèle        | Claude Opus 4.7 (pinned via `.claude/settings.local.json`)                                                                                             |
| Worktree      | `F:\PROJECTS\Apps\ankora-worktrees\fix-thi-i18n-ux`                                                                                                    |
| Durée session | ~2 h (diagnostic + implementation + tests + agents + Sourcery iterations)                                                                              |
| Lien Phase B  | PR-FIX-I18N-PERF — à ouvrir après merge (cf. handoff §"Suite")                                                                                         |

---

## 1. Scope livré

Phase A du split PR-FIX-I18N décidé après diagnostic. UX-only, **zéro changement architectural**.

### 1.1 LocaleSwitcher — visible pending state (THI-252 partial, THI-255 partial)

`src/components/layout/LocaleSwitcher.tsx` :

- Import `Loader2` de `lucide-react`.
- Wrapper `<span className="inline-flex items-center gap-2">` autour du `<select>` pour cohabiter avec le spinner.
- `aria-busy={pending}` sur le `<select>` (WCAG 4.1.2 Name, Role, Value).
- `Loader2` rendu conditionnellement avec `aria-hidden="true"`, `data-testid="locale-switching-spinner"`, `text-brand-600 h-3 w-3 animate-spin`.
- `<span role="status" aria-live="polite" className="sr-only">{pending ? t('switching') : ''}</span>` pour les lecteurs d'écran (WCAG 4.1.3 Status Messages).
- `disabled:cursor-progress disabled:opacity-60` pour signaler "en cours" plutôt que "interdit".

Aucune modification du `startTransition` existant ni du `setLocaleAction` Server Action — verrou Phase B.

### 1.2 i18n key `ui.localeSwitcher.switching` — parité 5 locales

| Locale | Valeur                   |
| ------ | ------------------------ |
| fr-BE  | Changement de langue…    |
| en     | Switching language…      |
| nl-BE  | Taal wijzigen…           |
| de-DE  | Sprache wird gewechselt… |
| es-ES  | Cambiando idioma…        |

Namespace `ui.localeSwitcher` retenu (cohérent avec `label`/`aria`/`options` colocalisés), déviation explicite vs le brief @cowork qui suggérait `common.nav.localeSwitching`. Validation `i18n-auditor` : APPROVED, parité OK + ellipse `…` (U+2026) uniforme.

### 1.3 Tests Vitest — 4 nouveaux specs (passing)

`src/components/layout/__tests__/LocaleSwitcher.test.tsx` :

- `at rest` : select enabled, `aria-busy=false`, spinner hidden, role=status vide.
- `during transition` : select disabled + `aria-busy=true` + spinner visible + role=status annonce le label i18n.
- `after transition` : at-rest state restored, spinner caché, status vide.
- `aria-hidden contract` : spinner décoratif, role=status reste l'annonce canonique.

Pattern deferred Promise pour controller le timing de `setLocaleAction` et observer le pending window. Assertion locale-agnostic (lit `frMessages.ui.localeSwitcher.switching` directement) — robuste aux futures retouches de traduction. Fix Sourcery overall comment.

### 1.4 Tests Playwright — 3 specs `test.fixme()` (TICKET 7 spec written, Phase B activates)

`e2e/i18n/locale-switcher.spec.ts` (nouveau) :

1. Quatre switches FR↔EN successifs settle on the last selection.
2. Locale survives a cross-page navigation (`/` → `/faq`) via cookie `NEXT_LOCALE`.
3. i18n parity across the main routes (`/`, `/faq`, `/glossaire`).

Chaque test annoté avec un commentaire `// Unfixme in PR-FIX-I18N-PERF (Phase B) — ...` qui pointe vers le root cause architectural (`cookies()` dans `[locale]/layout.tsx` → `ƒ Dynamic` → cold RSC refetch > 15 s en dev). Rationale étendu dans le header JSDoc du spec file.

`playwright.config.ts` : spec ajouté à `testIgnore` sur `mobile-safari` + `mobile-chrome` (même rationale, propagation mobile encore plus lente sous Pixel 7 / iPhone 14 emulation).

### 1.5 Bonus — `z-[60]` / `z-[70]` → `z-60` / `z-70` (Tailwind 4 canonical)

`src/components/layout/HeaderNav.tsx` lignes 179 + 206 : migration arbitrary-brackets → canonical. Tailwind 4 `tailwindcss-intellisense` flaggait `suggestCanonicalClasses` dans l'IDE (signalé par @thierry). `npm run build` confirme la compilation propre. Commentaire inline ("Tailwind has no z-60/z-70 step") corrigé (outdated pour v4).

---

## 2. Tests E2E — statut explicite (honest disclosure)

| Layer              | Count      | Statut          | Couvre                                                                                               |
| ------------------ | ---------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| **Vitest unit**    | 4 nouveaux | ✅ Passing      | Contrat loader (disabled, aria-busy, spinner, status announcement)                                   |
| **Playwright E2E** | 3 nouveaux | ⏳ `test.fixme` | Contrat TICKET 7 (rapid switches, cross-page persist, route parity) — **documenté mais non-exécuté** |

**Pourquoi `fixme`** : le contrat ne peut pas tenir tant que Phase B n'a pas lifté `cookies()` hors de `[locale]/layout.tsx`. En `npm run dev`, le premier switch FR→EN dépasse déjà le budget Playwright 15 s parce que chaque switch déclenche une refetch RSC complet. Lock à un known-failing path = soit gate cette PR sur Phase B (défait le split), soit entraîne l'équipe à ignorer du rouge CI.

**Phase B DoD** : déactiver `test.fixme` sur chacun des 3 specs en lockstep avec le fix architectural. Acceptance criterion : tous les 3 passent à < 500 ms.

---

## 3. Quality gates locaux (5/5 PASS)

| Gate                      | Statut                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run lint`            | 0 errors (6 warnings pré-existants, untouched files)             |
| `npm run lint:use-server` | 0 errors                                                         |
| `npm run typecheck`       | 0 errors                                                         |
| `npm run test`            | **1188 / 1188** pass (4 new Vitest specs)                        |
| `npm run build`           | success (z-60/z-70 confirme la compilation Tailwind 4 canonical) |

---

## 4. Agents QA (3/3, 0 blocker)

| Agent                | Verdict             | Notes hors scope                                                                                                                                                                                                       |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n-auditor`       | APPROVED            | 5 dérives parité pré-existantes (FR copy-paste dans NL/DE/ES `landing.*` + `app.cockpit.*` + `app.accounts.rename` + `errors.accounts.notFound` + `glossary.*`). Dette pré-existante, scope Beta NL/DE/ES post-launch. |
| `ui-auditor`         | APPROVED_WITH_NOTES | 2 LOW Phase B : focus restoration post-pending (a11y-high non-bloquant) + redondance `t('label')` vs `t('aria')`.                                                                                                      |
| `mobile-ios-auditor` | APPROVED_WITH_NOTES | 1 ios-high pré-existant : `text-xs` (12 px) sur `<select>` déclenche auto-zoom iOS Safari. Hors scope cette PR, à bundler dans dédiée mobile-iOS.                                                                      |

`test-runner` non re-lancé — non requis car les changements sont visuel/a11y only (pas de risque régression cross-flow).

---

## 5. DoD compact

- [x] Phase 0 model check (Opus 4.7 pinned)
- [x] Worktree dédié `ankora-worktrees/fix-thi-i18n-ux`
- [x] CI lint + lint:use-server + typecheck + test + build ✅
- [ ] CI E2E (Playwright cible chromium-desktop seul) — to verify post-push
- [x] Sourcery overall comment adressé (locale-agnostic assertion)
- [ ] Tous threads PR résolus avant merge — 0 inline thread sur PR #177 (`check-sourcery-resolved` ✅), seul un overall body comment qui est traité dans le code
- [x] Rapport `docs/prs/PR-FIX-I18N-UX-report.md` (ce document)
- [x] `CHANGELOG.md` mis à jour (entry 2026-05-23 — Phase A)
- [x] Linear THI-252 + THI-255 → In Progress + linked PR
- [ ] Smoke test iPhone réel post-merge @thierry (drawer mobile → switch langue → vérifier spinner visible). Le drawer ferme encore — c'est Phase B.

---

## 6. Diagnostic challenge & posture (saluée par @cowork)

Initial brief @cowork : "drawer ferme + délai → loader UI fixe ça". Lecture `LocaleSwitcher.tsx` immediate révèle que `startTransition + disabled={pending}` **existaient déjà**. Le vrai bug est architectural (`cookies()` dans layout). Flag à @cowork avant exécution → split UX/PERF validé.

Pattern méta confirmé : **code verify before prescribe** (cf. learning Obsidian `2026-05-23-pattern-sourcery-resolve-race-condition-rerun.md` étendu à un autre cas).

Honest disclosure du statut `fixme` E2E acceptée par @cowork comme exemplaire — bien plus utile qu'une PR qui prétendrait Done sur du partiel.

---

## 7. Suite — handoff PR-FIX-I18N-PERF (Phase B)

Scope candidat :

1. Extraire `cookies()` du `[locale]/layout.tsx` (audit perf THI-243 RC #2) — refactor majeur, risque architectural.
2. Optimiser `next-intl` middleware matcher (audit perf THI-243 RC #4).
3. Drawer-stay-open architectural : si le layout retourne à `○ Static`, le HeaderNav Client Component reste mounted → state `isOpen` préservé.
4. Acceptance : switch < 500 ms desktop + mobile (budget audit).
5. **Déactiver `test.fixme`** sur les 3 scenarios `e2e/i18n/locale-switcher.spec.ts`. Tous 3 doivent passer (+ versions mobile à ajouter si le timing le permet).
6. Re-run agents `i18n-auditor`, `mobile-ios-auditor`, `lighthouse-auditor` (perf score ≥ 95).
7. Smoke test iPhone réel par @thierry : switch FR→EN sur drawer mobile reste ouvert + < 500 ms.

Estimate Phase B : ~3-4 h (investigation `cookies()` extraction + tests + agents + smoke).

— @cc-ankora, 2026-05-23
