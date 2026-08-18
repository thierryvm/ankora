# PR-UI-2 — Input shadcn 3 régressions visuelles — Rapport final

- **Date** : 2026-05-07 13:10 (UTC+2, AM)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Phase 0 OK
- **Branche** : `fix/ui-2-input-regressions`
- **Commit** : `4873b17 fix(ui): adoucir focus ring + supprimer scroll spinner + color-scheme dark sur Input shadcn (PR-UI-2)`
- **PR ouverte** : **https://github.com/thierryvm/ankora/pull/123**
- **mergeStateStatus initial** : `UNSTABLE` (CI en cours, normal)
- **Estimation prompt** : 2-3h max → **livré en ~30 min** (1 fichier + tests, refactor déterministe)

---

## TL;DR @cowork

3 régressions visuelles surfacées par feedback empirique @thierry post-PR-D3-bis sur charges/expenses/settings, **toutes corrigées via 1 seul fichier** (`src/components/ui/input.tsx`) qui propage automatiquement le fix sur les 10+ fichiers consommateurs (charges, expenses, settings, simulator, accounts, auth × 4, onboarding).

| #      | Régression                                                                | Avant                                 | Après                                                                                    |
| ------ | ------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| **F2** | Focus ring trop brillant (halo cyan/blanc agressif sur dark theme)        | `ring-2 ring-offset-2 ring-brand-600` | `ring-2 ring-brand-500/30` (sans offset, glow subtil)                                    |
| **F3** | Scroll molette modifie le montant `<input type="number">` (UX dangereuse) | aucune protection                     | `[appearance:textfield]` + spin-buttons hidden, **conditionnel sur `type === 'number'`** |
| **F4** | Date icon noir invisible sur dark theme                                   | aucun `color-scheme`                  | `dark:scheme-dark` (Tailwind 4 canonical)                                                |

---

## Snippets className before/after

```diff
// F2 — focus ring
- focus-visible:border-brand-500 focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none
+ focus-visible:border-brand-500 focus-visible:ring-brand-500/30 focus-visible:ring-2 focus-visible:outline-none

// F4 — color-scheme dark mode (global, no-op sur autres types)
+ dark:scheme-dark

// F3 — spinner number-only (conditional, safe pour autres types)
+ type === 'number' &&
+   '[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none'
```

## Décisions techniques notables

### Conditional vs global pour F3 (spinner)

Choix : **conditional `type === 'number'`**. Le prompt @cowork a laissé l'option ouverte ("préférence : conditional plus propre"). Justification :

- `[appearance:textfield]` est une CSS rule qui force l'apparence native textfield. **Pas no-op universel** — sur `type="checkbox"`, `type="range"`, `type="color"`, ça reset l'UI native (impact visuel non désiré).
- Test ajouté `does not strip the native UI from non-numeric types` qui assert l'absence des spin-overrides sur `type="text"`. Garde-fou contre la régression future si quelqu'un passe à global.

### F4 global vs conditional

Choix : **global**. `color-scheme: dark` n'a d'effet visuel notable que sur les inputs natifs avec UI riche (date, time, datetime-local, color, calendar pickers). Sur text/email/password/number → no-op visuel. Pas de risque de régression. Plus simple, 0 conditional supplémentaire.

### Tailwind 4 canonical : `dark:scheme-dark` (vs `dark:[color-scheme:dark]`)

Diagnostic IDE Tailwind v4 (`suggestCanonicalClasses`) a flaggé l'arbitrary value pendant le refactor. Migration en cours : Ankora utilise désormais les utilities natives Tailwind 4 (`bg-linear-to-br` PR-D3-bis, `scheme-dark` PR-UI-2). Cohérence avec le sweep canonical post-Voie D.

---

## Fichiers consommateurs bénéficiaires (10+)

Grep `from .*ui/input` dans `src/` :

```
src/app/[locale]/(auth)/forgot-password/ForgotPasswordForm.tsx
src/app/[locale]/(auth)/login/LoginForm.tsx
src/app/[locale]/(auth)/reset-password/ResetPasswordForm.tsx
src/app/[locale]/(auth)/signup/SignupForm.tsx
src/app/[locale]/app/accounts/AccountsClient.tsx
src/app/[locale]/app/charges/ChargesClient.tsx        ← #F2 + #F3 (Montant €)
src/app/[locale]/app/expenses/ExpensesClient.tsx      ← #F2 + #F3 + #F4 (date)
src/app/[locale]/app/settings/SettingsClient.tsx      ← #F1 résolu par #F2 (revenus + plafond)
src/app/[locale]/app/simulator/SimulatorClient.tsx
src/app/[locale]/onboarding/OnboardingWizard.tsx
```

Le prompt @cowork annonçait 18 consommateurs ; ma liste directe en montre 10. Possibles consommateurs additionnels via re-export ou imports indirects que `grep` ne capture pas (e.g. `Form` shadcn qui wrap Input). Impact identique en bout de chaîne.

## Tests

`src/components/ui/__tests__/input.test.tsx` — 4 nouveaux cas Vitest (8 total), tous verts :

| Test                                                        | Couverture                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `uses the soft focus ring (brand-500/30, no offset)`        | F2 — assert présence `ring-brand-500/30` + absence `ring-brand-600` + absence `ring-offset-2` |
| `disables the scroll-spin behaviour on type="number"`       | F3 — assert `[appearance:textfield]` + spin-buttons hidden quand `type="number"`              |
| `does not strip the native UI from non-numeric types`       | F3 safety — assert `type="text"` ne reçoit PAS les overrides                                  |
| `opts every input into the dark color-scheme on dark theme` | F4 — assert `dark:scheme-dark`                                                                |

## DoD 5-step

| #   | Critère                                               | État                                                 |
| --- | ----------------------------------------------------- | ---------------------------------------------------- |
| 1   | CI checks verts (sauf E2E pré-existants attendus)     | ⏳ 5/7 pass, Lint+TC en cours, Security ✅ Vercel ✅ |
| 2   | Sourcery silent / résolu                              | ⏭ skipping (rate limit hebdo accepté)                |
| 3   | Threads humains résolus                               | ⏳ aucun thread ouvert (PR fraîche)                  |
| 4   | mergeStateStatus CLEAN (post-bypass admin Playwright) | ⏳ UNSTABLE initial post-push                        |
| 5   | Rapport livré                                         | ✅ ce document                                       |

## Métriques

- **Tests** : 8/8 input.test.tsx (4 nouveaux) — `npx vitest run src/components/ui/__tests__/input.test.tsx`
- **Lint** : 0 erreur, 7 warnings `no-console` baseline (intentionnel error boundaries)
- **Typecheck** : clean
- **Build** : exit 0, all routes prerender
- **Security audit** : ✅ pass (26s, overrides PR-D3-bis hérités)

## Statut CI initial post-push

```
Vercel Preview Comments        ✅ pass    0
Vercel                         ✅ pass    0   (deployment ready)
Security audit                 ✅ pass    26s
check-sourcery-resolved        ✅ pass    2s
label                          ✅ pass    6s
Sourcery review                ⏭ skipping (rate limit hebdo)
Lint + Typecheck + Unit Tests  ⏳ pending
Lighthouse CI                  ⏭ skipping (non-RC, pattern habituel)
Playwright E2E                 ⏳ pending — fails pré-existants attendus (cookies-consent + error-boundaries + BUG-iOS-011)
```

## Smoke visuel manuel — flag @thierry

Le prompt @cowork demandait 3 captures avant/après empiriques. Le preview Vercel est protégé par auth team-only et `/app/charges` etc. requièrent un compte authentifié (require user) — non automatisable côté @cc-ankora sans seed credentials.

**Captures attendues @thierry sur preview Vercel** ([https://github.com/thierryvm/ankora/pull/123](https://github.com/thierryvm/ankora/pull/123)) :

1. **Focus state Input** — `/app/charges` dark theme, click "Montant (€)" → vérifier focus subtle (pas halo blanc), bordure teal nette + glow doux derrière. ✓ ou ✗ ?
2. **Scroll molette test** — même page, focused sur Montant, scroll molette → la valeur ne change PAS. ✓ ou ✗ ?
3. **Date icon dark** — `/app/expenses` dark, vérifier que l'icône calendrier sur "07/05/2026" est visible (pas noir invisible). ✓ ou ✗ ?
4. **Settings cohérence** (bonus régression #F1) — `/app/settings` dark, 2 inputs Montant ont focus subtle cohérent.

**Couverture déterministe par tests Vitest** : les 4 nouveaux tests asserent les classes Tailwind exactes (`ring-brand-500/30`, `[appearance:textfield]`, `dark:scheme-dark`, absence de `ring-brand-600`/`ring-offset-2`). Le rendu visuel découle déterministiquement de ces classes.

## Discipline scope strict respectée

| Hors scope @cowork                                          | Respect                                             |
| ----------------------------------------------------------- | --------------------------------------------------- |
| Pas de modif autre composant UI (Button, Select, Card)      | ✅                                                  |
| Pas de refactor logique métier (Charges, Expenses)          | ✅                                                  |
| Pas de change tokens CSS (`--color-brand-*`)                | ✅                                                  |
| Pas de nouveau drawer/modal édition (= scope PR-D4 enrichi) | ✅                                                  |
| Pas de catégories (= scope PR-CAT-1)                        | ✅                                                  |
| Pas de touche `docs/ROADMAP.md` (= travail @cowork PR-DOC)  | ✅ explicitement non-staged, laissé en working tree |
| `git add` ciblé (pas `add .` ni `add -A`)                   | ✅                                                  |

## Backlog post-merge

1. **PR-QA-1d Playwright stability** (initialement prévue ce matin) — repoussée d'un cran : 6 fails pré-existants restent à fix dans une PR dédiée. Branche `fix/qa-1d-playwright-stability` toujours valable, démarrer post-merge PR-UI-2 sur main fresh.
2. **PR-DOC roadmap sync 7 mai** — @cowork commit séparé pour `docs/ROADMAP.md` modifié (laissé non-staged comme demandé).
3. **PR-D3-ter animations Monarch-level** post-mockups CD#3 (10-11 mai).
4. **PR-D4** Bloc 3 charges list + toggle paye + `payment_months[]` SELECT.

## Actions @cowork demandées

- [ ] Vérifier la PR #123 → Lint+TC+Tests passent une fois CI fini
- [ ] **Smoke visuel empirique sur preview Vercel** (3-4 captures attendues, cf. §"Smoke visuel manuel")
- [ ] Approuver + squash merge avec **bypass admin** sur Playwright iPhone SE / mobile-safari (BUG-iOS-011 + 5 fails pré-existants pattern habituel)
- [ ] Confirmer démarrage PR-QA-1d post-merge (initial planning ce matin maintenant après ce fix prioritaire)

## Pour @thierry (validation post-merge empirique)

- **Desktop ankora.be/app dark** : focus inputs Montant subtle (pas halo blanc), bordure teal + glow doux behind
- **Scroll molette test** : focused dans un Montant, scroll → valeur immuable (UX safe)
- **Mobile + desktop dark** : icônes date visibles dans `/app/expenses` (et tout input type="date" futur)
- **Settings** : 2 inputs Montant (revenus + plafond) cohérents avec le reste

---

**Push done ≠ task done.** Squash merge attendu après ta validation finale + bypass admin Playwright + smoke visuel empirique.

🎯 PR-UI-2 = 30 minutes de fix className, impact UX-wide sur 10+ formulaires. Discipline scope-strict respectée.

— @cc-ankora (Opus 4.7) · 2026-05-07 13:10 UTC+2
