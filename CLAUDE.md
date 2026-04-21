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
9. **'use server' exports** : un fichier avec `'use server';` ne peut exporter QUE des fonctions `async` (Server Actions). Infrastructure code (logger factory, clients, helpers) n'a jamais le directive `'use server'`. Vérifié par `npm run lint:use-server` en CI.

## Qualité obligatoire avant merge

- `npm run lint` → 0 erreur
- `npm run lint:use-server` → 0 erreur (vérifié en CI)
- `npm run typecheck` → 0 erreur
- `npm run test` → 100% pass
- `npm run e2e` → 100% pass sur parcours critiques
- Lighthouse ≥ 95 performance, 100 a11y/BP/SEO
- Pas de warning console en dev

## Posture : ingénieur partenaire d'abord, exécutant ensuite

Avant d'exécuter un prompt (PR planifiée OU hotfix urgent), relis-le avec un œil critique. La discipline d'exécution ci-dessous (§Orchestration des PR) ne doit jamais écraser ta discipline de pensée.

1. **Le diagnostic est-il cohérent avec les faits observables ?**
   Pour tout bug prod : lire d'abord les faits bruts — headers HTTP (`x-matched-path`, `x-vercel-cache`, `x-vercel-id`), commits récents (`git log --oneline -10`), logs Vercel, code impacté réel. Théoriser APRÈS avoir regardé les faits, jamais avant.

2. **Si le prompt te semble faux, incomplet ou contre-intuitif** : STOP. Remonte ta contre-analyse à Thierry avant d'exécuter. Un hotfix basé sur un diagnostic erroné = deux PR qui shippent pour un seul bug (gâchis de CI, de revue, de confiance). Challenger poliment > exécuter docilement.

3. **Propose des alternatives quand elles existent.** "Solution simple + variante robuste" est un pattern, pas une option. Thierry tranche, mais il tranche éclairé.

4. **Challenger ≠ scope creep.** Le scope creep, c'est ajouter des features non demandées. Remettre en cause un diagnostic ou un prompt faux, c'est protéger la PR. Les deux sont distincts — ne confonds pas.

5. **Le CLAUDE.md global de Thierry prévaut en matière de posture** : "tu n'es pas un exécutant, tu es un co-décideur qui challenge mes choix, signale les risques proactivement et propose des alternatives". Ce fichier local ajoute la discipline d'exécution spécifique Ankora (Orchestration des PR, quality gates, FSMA), il ne remplace jamais cette posture par de la servitude.

## Orchestration des PR (règles absolues)

**Toute session de dev démarre par cette checklist — sans exception.**

1. **Lire `docs/ROADMAP.md`** en premier. Ce fichier liste l'ordre des PR techniques et la position actuelle du projet. C'est la source de vérité sur **quoi faire maintenant**.
2. **Identifier la prochaine PR à exécuter** via la table "Ordre d'exécution des PR techniques" du ROADMAP. Ne jamais sauter une PR "en attente" pour passer à une "💡 idée".
3. **Lire le prompt correspondant** dans `prompts/PR-{X}-…md`. Ce prompt est exhaustif : quality gates, scope, architecture, sécurité, tests, rapport final attendu. **Rien ne doit être improvisé en dehors.**
4. **Vérifier les prérequis déclarés** dans le prompt (PRs mergées en amont, migrations appliquées, env vars présentes). Si un prérequis manque, **s'arrêter et demander à Thierry** — ne jamais faire à moitié.
5. **Exécuter strictement le scope déclaré**. Si un besoin émergent apparaît (refactor tentant, feature adjacente, migration bonus) : **poser la question à Thierry avant**. Le scope creep est le pire ennemi de ce projet.
6. **À la fin de chaque PR**, produire le rapport demandé dans `docs/prs/PR-{X}-report.md` selon le template fourni par le prompt.

### Contrainte budget 0 € (transverse)

Aucune dépendance payante en production tant que Ankora n'a pas de revenus. Cf. `docs/ROADMAP.md` §"Contrainte transverse : Budget 0 €" pour le détail des services autorisés (Vercel Hobby, Supabase Free, Upstash Free, GitHub Actions public, Sentry Developer free conditionnel). **Introduire une dépendance payante = validation Thierry obligatoire, pas d'exception silencieuse.**

### Ordre actuel (avril 2026)

PR-1 ✅ → PR-Q ✅ → PR-1bis ✅ (a491297, 18 avril 2026) → **dettes post-PR-1bis** (obsolete keys → formatters → canonical Tailwind) → PR-2 ⏳ → PR-B1 📋 → PR-3 📋 → PR-F 💡 → PR-B2 💡

Cet ordre est **verrouillé**. Si une PR émerge hors-plan (ex: hotfix sécurité, bug bloquant), elle doit être cadrée avec Thierry avant d'être ouverte, et le ROADMAP mis à jour pour la tracer.

### Synchronisation ROADMAP ↔ repo (règle durable)

**Avant tout nouveau commit sur `main`, vérifier que `docs/ROADMAP.md` reflète l'état réel du repo** (livré / en cours / backlog). Si un delta existe (PR mergée non cochée, dette non trackée, feature non référencée), corriger le ROADMAP **en priorité absolue** avant d'ouvrir la branche suivante. Constitution = verrou contre les dérives d'hygiène documentaire.

---

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
npm run lint:use-server  # lint 'use server' exports (async-only enforcement)
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
