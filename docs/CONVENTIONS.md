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

## Migrations Supabase — conventions post-30 octobre 2026

À partir du **30 octobre 2026**, Supabase n'exposera plus automatiquement les tables du schema `public` via PostgREST / GraphQL. Toute table créée sans GRANT explicite renverra **404 silencieux** côté client (comportement "table inexistante").

Source : [Supabase changelog 45329](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

### Template migration obligatoire

```sql
create table if not exists public.<nom> (
  -- colonnes
);

-- 1. RLS obligatoire
alter table public.<nom> enable row level security;
-- ... policies ...

-- 2. GRANT explicite (NOUVEAU — était implicite avant le 30/10/2026)
grant select, insert, update, delete on table public.<nom>
  to anon, authenticated;
```

**Exceptions valides** (pas de GRANT volontaire) :

- Tables audit log write-only (service_role uniquement)
- Tables internes non exposées au client

### Pattern REVOKE FROM PUBLIC — fonctions privées

`REVOKE FROM anon, authenticated` ne suffit pas pour fermer une fonction PostgREST. Les rôles `anon` et `authenticated` héritent du grant par défaut PostgreSQL via le rôle `PUBLIC` — `has_function_privilege('anon', ...)` retourne toujours `true`.

```sql
-- Pour toute fonction qui ne doit PAS être exposée à PostgREST :
revoke execute on function public.<fn>() from public;
```

Sans ce `REVOKE FROM PUBLIC`, la fonction reste exécutable même après un `REVOKE` ciblé. Source empirique : Terminal Learning migration 015 (16 mai 2026).

### Recommandation V2 — schema `api` dédié

Long terme, envisager un schema `api` distinct pour les tables réellement exposées au client (plus propre que `public` qui mélange tables exposées, fonctions internes, vues, etc.). À cadrer dans un ADR dédié si la dette s'aggrave.

### Refs

- Linear ticket [THI-206](https://linear.app/thierryvm/issue/THI-206) — PR-INFRA-4 (deadline 30 octobre 2026)
- Obsidian learning : `90_Meta/learnings/2026-05-16-supabase-breaking-changes-2026-cross-project.md`
