# THI-122 — Sourcery Comment 1 fix (PR #117) — Rapport @cc-ankora → @cowork

- **Date** : 2026-05-06 14:02 (UTC+2)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Opus 4.7 (Phase 0 OK)
- **Branche** : `feat/thi-122-404-error-boundary`
- **Commit ajouté** : `a51059b fix(global-error): use locale-aware html lang attribute (Sourcery #1)`
- **PR** : https://github.com/thierryvm/ankora/pull/117
- **mergeStateStatus initial post-push** : `BLOCKED` (CI re-trigger en cours, normal)

---

## TL;DR @cowork — 60 secondes

1. **Bug a11y/SEO Sourcery #1 résolu** : `<html lang>` extrait de `pickLocale()` au lieu de `"fr"` hardcodé. Lecteurs d'écran et crawlers reçoivent maintenant la bonne metadata language pour les fallbacks EN.
2. **Comment général Sourcery #2 (duplication FR/EN) traité** : commentaires de synchronisation cross-référencés ajoutés dans `global-error.tsx` ↔ `[locale]/error.tsx`. Pas de refactor centralisation (scope creep évité).
3. **Comments 2-3 (tests)** : ajoutés (5 min, valent le coup pour PII coverage).
4. **Comments 4-5 (refactor scope creep)** : skipped, documenté.
5. **101/101 tests dossiers nouveaux** + **604/604 vitest full suite** ✅. Lint + typecheck ✅.
6. **CI re-trigger automatique sur push**. Sourcery ré-analyse `a51059b` en parallèle.

---

## Décisions @cowork suivies

| #   | Décision @cowork                                                          | Application                                                                       |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | FIX Comment 1 (bug `<html lang>`)                                         | ✅ extracted `pickLocale()` → const locale, used `lang={locale}`                  |
| 2   | Comments 2-3 OPTIONNEL si bandwidth                                       | ✅ pris (5 min), 2 nouveaux tests dans `not-found.test.tsx`                       |
| 3   | SKIP Comments 4-5 (scope creep)                                           | ✅ skipped + documenté ici (cf. §"Comments 4-5 — skipped")                        |
| 4   | Comment général #2 (duplication FR/EN) → commentaires sync + flag backlog | ✅ commentaires bidirectionnels ajoutés + flag backlog dans §"Backlog post-merge" |

---

## Diff appliqué

### `src/app/global-error.tsx`

```diff
+ /**
+  * NOTE: this COPY object MUST stay in sync with `messages/{locale}.json`
+  * `errors.boundary.*` keys. global-error.tsx runs at root level, OUTSIDE
+  * the `[locale]` route group, so it cannot use next-intl. Any wording
+  * change in `messages/*.json` must be mirrored here (and vice versa).
+  *
+  * Cf. src/app/[locale]/error.tsx for the i18n-driven counterpart.
+  */
  const COPY = { ... };

  export default function GlobalError({ error, reset }: GlobalErrorProps) {
    useEffect(() => { ... }, [error.digest]);
-   const copy = COPY[pickLocale()];
+   const locale = pickLocale();
+   const copy = COPY[locale];

    return (
-     <html lang="fr">
+     <html lang={locale}>
        <body className="bg-background font-sans antialiased">
        ...
```

### `src/app/[locale]/error.tsx`

```diff
+ /**
+  * NOTE: the `errors.boundary.*` keys read from `messages/*.json` are
+  * mirrored as a hardcoded fallback inside `src/app/global-error.tsx`,
+  * which runs at the App Router root and cannot reach next-intl. Any
+  * wording change here MUST be mirrored in global-error.tsx (and vice
+  * versa) to keep both surfaces consistent.
+  */
  export default function ErrorBoundary({ error, reset }: ErrorProps) {
```

### Tests ajoutés

**`src/app/__tests__/global-error.test.tsx`** — 2 cas via `renderToStaticMarkup` :

```tsx
it('emits <html lang="fr"> when the FR copy is shown (a11y/SEO — Sourcery #1)', ...);
it('emits <html lang="en"> when the EN copy is shown (a11y/SEO — Sourcery #1)', ...);
```

> Note technique : React Testing Library filtre les balises `<html>`/`<body>` quand un composant est mounté dans un `<div>` container. `renderToStaticMarkup` (de `react-dom/server`) bypass cette restriction et permet d'asserter directement sur le HTML string output.

**`src/app/__tests__/not-found.test.tsx`** — 2 cas :

```tsx
it('honours the cookie over Accept-Language when both disagree (Sourcery #2)', ...);
it('treats regional EN cookie variants like en-GB as English (Sourcery #3)', ...);
```

---

## Comments 4-5 — skipped (scope creep, posture senior @cowork)

| Comment | Suggestion Sourcery                              | Décision                                                                                                                         |
| ------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| #4      | Extraire helpers (NotFoundLayout, NotFoundCTAs)  | **SKIP** — code actuel = 109 lignes lisibles, complexité cognitive faible. Refactor purement esthétique non requis pour qualité. |
| #5      | Unify pickLocale + logging dans une seule helper | **SKIP partiel** — la partie 1 (single source of truth pour locale) est résolue par Comment 1 fix. Le rest = scope creep.        |

**Posture** : ces 2 refactors étaient des suggestions structurelles non bloquantes. Le code actuel respecte le principe KISS et reste maintenable. Réintroduire un mini-framework "error helpers" pour 3 surfaces différentes (404 / route error / global error) ajouterait du couplage sans gain net.

---

## Quality gates ✅ (post-fix, locaux)

| Gate                          | Résultat                                                         |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm run lint`                | ✅ 0 erreur, 7 warnings `no-console` (intentionnel, inchangé)    |
| `npm run lint:use-server`     | ✅ All `use server` files contain only async exports             |
| `npm run typecheck`           | ✅ 0 erreur                                                      |
| `npx vitest run` (full suite) | ✅ **604/604 tests pass**, 61 fichiers (4 nouveaux cas vs avant) |
| `npm run build`               | ✅ (vérifié pré-Sourcery, pas re-run, pas de modif de surface)   |

---

## DoD canonique 5/5 — état actuel

| #   | Critère DoD                                       | État                                                     |
| --- | ------------------------------------------------- | -------------------------------------------------------- |
| 1   | `gh pr checks` ✅ tous verts                      | ⏳ CI re-trigger en cours sur `a51059b`                  |
| 2   | Sourcery silent sur le DERNIER commit (`a51059b`) | ⏳ Sourcery re-analyse en cours                          |
| 3   | Threads humains résolus                           | ⏳ aucun thread humain ouvert (Sourcery only)            |
| 4   | Branch up-to-date with main                       | ✅ rebased on `5fb9cb3` (rien n'a bougé sur main depuis) |
| 5   | mergeStateStatus CLEAN                            | ⏳ `BLOCKED` initial post-push (normal, CI en cours)     |

**À surveiller** : le job Playwright E2E peut afficher BUG-iOS-011 #116 (overflow iPhone SE 18px sur landing) — **inhérent à `main`, accepté @cowork pour le merge bypass admin selon ta directive**.

---

## Statut CI initial post-push

- ⏳ Lint + Typecheck + Unit Tests : pending
- ⏳ Security audit : pending
- ⏳ check-sourcery-resolved : pending (re-running)
- ⏳ label : pending
- ✅ Vercel Preview Comments : pass (instant)
- ⏳ Vercel : deploying

À ce stade je n'attends pas en boucle (per `feedback_no_auto_polling.md`). Tu pourras vérifier toi-même via :

```bash
gh pr checks 117
gh api repos/thierryvm/ankora/pulls/117/comments \
  --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
```

---

## Backlog post-merge (flag pour @cowork)

1. **`src/lib/error-copy.ts` centralisation FR/EN** — possible si on détecte une divergence empirique entre `messages/*.json` `errors.boundary.*` et `global-error.tsx` `COPY`. Pas urgent v1.0. Les commentaires de sync ajoutés ce commit suffisent comme garde-fou pour le moment.
2. **Pattern documentation** — la découverte "not-found.tsx ne peut pas vivre dans `[locale]/` avec ce setup root passthrough" mérite une mini-section dans `docs/design/architecture-decisions.md` ou ADR dédié pour les futures itérations error handling.

---

## Actions @cowork demandées

- [ ] Vérifier la PR #117 → CI re-pass + Sourcery silent sur `a51059b`
- [ ] Si Sourcery refait des comments → décider scope (probablement aucun nouveau bloquant)
- [ ] Approuver + squash merge avec **bypass admin** sur le check Playwright iPhone SE (BUG-iOS-011 #116, accepté)
- [ ] (optionnel) Créer 1 ticket Linear "Future centralisation `lib/error-copy.ts`" si tu juges utile

## Pour @thierry (validation post-merge)

- 1 nouveau commit `a51059b` ajouté à la PR #117
- Bug a11y/SEO `<html lang>` corrigé proprement
- Sprint Voie D PR-D3 toujours sur les rails pour lundi 12 mai (rien d'impacté)

---

**Push done ≠ task done.** Squash merge attendu après ta validation finale + bypass admin Playwright.

— @cc-ankora (Opus 4.7) · 2026-05-06 14:02 UTC+2
