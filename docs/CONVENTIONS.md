# Conventions — Ankora

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess` + `noImplicitOverride`
- Jamais de `any`. Utiliser `unknown` + narrowing.
- Jamais de `as` sauf pour narrower après une garde runtime.
- Imports absolus via alias `@/*`.

## React

- Server Components par défaut. `"use client"` uniquement si :
  - Hooks React (useState, useEffect, useRef)
  - Event handlers directs sur DOM
  - Accès aux API navigateur (localStorage, navigator, etc.)
- Jamais de fetch client d'une donnée privée — toujours Server Action + revalidation.
- Composants nommés en PascalCase, fichiers en kebab-case (`charge-form.tsx`).
- Props typées explicitement — pas de `React.FC`.

## Tailwind 4

- Utiliser les tokens `@theme` (brand-_, accent-_, semantic) — pas d'hex arbitraires.
- `cn()` pour combiner les classes conditionnelles.
- Responsive : mobile-first (`sm:`, `md:`, `lg:` pour enrichir, jamais `max-*`).
- Dark mode via `prefers-color-scheme` — pas de `dark:` class.

## Nommage

- Fichiers : kebab-case (`charge-form.tsx`, `rate-limit.ts`)
- Composants : PascalCase
- Fonctions / variables : camelCase
- Constantes : SCREAMING_SNAKE_CASE
- Types / Interfaces : PascalCase
- Enums en objets `as const` + type dérivé (pas d'`enum` TS)

## Commits

Conventional Commits:

```
type(scope): description

type = feat | fix | refactor | test | docs | chore | security | perf | style | ci | build | revert
```

Exemples :

- `feat(charges): add recurring frequency selector`
- `fix(rls): tighten workspace_members self-access policy`
- `security(csp): remove unsafe-eval from script-src`

## Branches

- `main` — production, protégée
- `develop` — intégration continue
- `feature/xxx` — nouvelle feature
- `fix/xxx` — bug
- `security/xxx` — patch sécurité
- `release/vX.Y.Z` — préparation release

## Tests

- **Unit (Vitest)** : tout `src/lib/domain/` + `src/lib/security/` + `src/lib/gdpr/`
- **Component (Testing Library)** : composants avec logique non-triviale
- **E2E (Playwright)** : parcours critiques (signup, login, create charge, export GDPR, delete account)

## Copy / UI

- Français pour tout texte visible
- Anglais pour code, commentaires, commits, docs techniques
- **Interdit** : "placement", "investissement", "conseil financier" — contraire à la contrainte FSMA
- **Ton** : direct, rassurant, factuel. Pas de fausse familiarité, pas de jargon.
