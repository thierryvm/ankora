# CLAUDE.md — Ankora

Projet **Ankora** : cockpit personnel de finances (PWA Next.js 16 + Supabase, hébergé UE).
Ce fichier complète le `CLAUDE.md` global de Thierry. En cas de conflit, ce fichier prévaut.

## Positionnement réglementaire (non-négociable)

Ankora est un **outil d'éducation budgétaire et d'organisation**.
Ankora n'est **pas** un service de conseil en placement (contrainte FSMA Belgique).
Tout texte produit pour l'app doit éviter les formulations suggérant du conseil en investissement
("vous devriez placer", "nous recommandons d'investir", etc.).

## Stack

- Next.js 16.2+ (App Router, Server Components, Server Actions, typed routes)
- React 19.2+
- TypeScript strict (`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`)
- Tailwind CSS 4 (`@theme inline` — tokens dans `globals.css`)
- Supabase (Postgres + RLS + Auth + Storage, région EU-west)
- Upstash Redis (rate limiting)
- Zod v4 (validation iso client/server)
- Vitest 4 + Playwright + Lighthouse CI
- Husky + lint-staged

## Architecture

```
src/
  app/                 # App Router (layouts, pages, route handlers)
    (marketing)/       # landing, pricing, faq, legal
    (auth)/            # login, signup, callback
    app/               # dashboard privé — protégé par middleware
  components/
    brand/             # logo, favicon SVG
    ui/                # shadcn/ui primitives
    features/          # components métier par feature
  lib/
    domain/            # services financiers purs (Decimal.js, 0 dépendance DB)
    schemas/           # schémas Zod (1 fichier par agrégat)
    supabase/          # clients (browser, server, admin, middleware)
    security/          # rate-limit, audit-log
    gdpr/              # consent, export, deletion
    env.ts             # parse + valide les variables d'env via Zod
    site.ts            # source de vérité métadonnées SEO
supabase/
  migrations/          # schéma + RLS + triggers
.claude/
  agents/              # 7 QA agents (security, rls, financial, ui, lighthouse, seo-geo, gdpr, test-runner)
```

## Règles de code

1. **Domaine pur** : `src/lib/domain/` n'importe JAMAIS depuis `@supabase` ou Next.js — que du TS pur + `decimal.js`.
2. **Validation en entrée** : tout Server Action / Route Handler parse avec Zod **avant** toute logique.
3. **Authz serveur** : ne jamais trust un `userId`/`workspaceId` du client — toujours vérifier via la session Supabase.
4. **Audit** : toute action sensible (auth, GDPR, delete workspace) émet `logAuditEvent()`.
5. **Rate limit** : endpoints publics + mutations + export passent par `rateLimit()`.
6. **Nonce CSP** : jamais de script/style inline sans `nonce={nonce}`. Nonce lu via `headers()` dans Server Components.
7. **Messages UI en français**, commits/code/comments en anglais.
8. **Tests domain ≥ 90% lignes + fonctions, ≥ 85% branches**.

## Qualité obligatoire avant merge

- `npm run lint` → 0 erreur
- `npm run typecheck` → 0 erreur
- `npm run test` → 100% pass
- `npm run e2e` → 100% pass sur parcours critiques
- Lighthouse ≥ 95 performance, 100 a11y/BP/SEO
- Pas de warning console en dev

## Workflow agents (`.claude/agents/`)

- **security-auditor** : avant merge de toute PR touchant auth / middleware / RLS / headers
- **rls-flow-tester** : après toute migration ou changement RLS
- **financial-formula-validator** : après tout changement dans `src/lib/domain/`
- **ui-auditor** : après toute modification UI
- **lighthouse-auditor** : avant release candidate
- **seo-geo-auditor** : après ajout/renommage de pages publiques
- **gdpr-compliance-auditor** : dès qu'on touche à PII, cookies, export, deletion
- **test-runner** : après toute modification de code

## Commandes

```bash
npm run dev              # dev server (Turbopack)
npm run build            # prod build
npm run start            # prod server
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm run test             # Vitest
npm run test:coverage    # Vitest + coverage
npm run e2e              # Playwright
npm run lhci             # Lighthouse CI
npm run icons            # regénère PNG PWA depuis SVG
npm run security:audit   # npm audit
npm run supabase:types   # regénère src/lib/supabase/types.ts
```

## Variables d'environnement

Cf. `.env.example`. Toutes validées par Zod dans `src/lib/env.ts`. Le build échoue tôt si une variable manque ou est invalide.
