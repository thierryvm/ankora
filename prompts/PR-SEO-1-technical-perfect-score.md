# PR-SEO-1 — Technical SEO/GEO/LLM perfect score (Couches techniques)

> **À lancer après PR-B1 (ou en parallèle si tu peux gérer 2 branches en
> même temps — elle ne touche pas les mêmes fichiers).**
> Issue de l'audit SEO-GEO-LLM du 2026-04-20
> (`docs/seo/AUDIT-SEO-GEO-LLM-2026-04-20.md`).
> Objectif : passer de **B+ / C+ / D+** à **A / A / A** sur les 3 couches
> techniques.

## Contexte

Ankora est un projet **vitrine** — chaque point de score SEO/GEO/LLM
compte pour la crédibilité face aux recruteurs tech qui sourcent via
Google, ChatGPT, Claude, Perplexity. L'audit a identifié 6 chantiers
techniques qui, cumulés, font passer l'app à A sur les 3 couches.

**Cette PR couvre uniquement les aspects techniques** (fichiers,
schemas, build). La PR-SEO-2 couvrira le contenu (glossaire, copywriting,
liens autorité).

## Périmètre

Chantier 1 — **OG images dynamiques** (landing + FAQ + legal)
Chantier 2 — **`ai.txt` + règles User-Agent IA dans `robots.txt`**
Chantier 3 — **`llms-full.txt` généré au build**
Chantier 4 — **`datePublished` + `dateModified` dans JsonLd schemas**
Chantier 5 — **`BreadcrumbList` schema global + `HowTo` sur landing**
Chantier 6 — **Webmanifest + PWA metadata enrichis** (si gap)

## Chantier 1 — OG images dynamiques

### Fichiers à créer

- `src/app/[locale]/opengraph-image.tsx` — image OG landing (1200×630)
- `src/app/[locale]/twitter-image.tsx` — image Twitter (1200×675)
- `src/app/[locale]/(public)/faq/opengraph-image.tsx` — OG FAQ
- `src/app/[locale]/(public)/legal/privacy/opengraph-image.tsx` — OG privacy
- `src/app/[locale]/(public)/legal/cgu/opengraph-image.tsx` — OG CGU

### Specs

Utiliser `next/og` (ImageResponse API, Edge runtime, **zéro dépendance
nouvelle**, built-in Next.js 16).

Design : brand-aligned avec ankora.be (tokens du design-system existant
— teal `#0F766E`, background `#F8FAFC`, typographie Fraunces + Manrope).
Chaque image affiche :

- Logo Ankora™ (SVG ou emoji ⚓ fallback)
- Titre de la page (title metadata dynamique)
- Tagline produit (one-liner factuel — cf. PR-SEO-2)
- Watermark `ankora.be` discret en bas

**Contrainte importante** : pas d'appel réseau (fetch fonts, fetch
images). Inline tout ou utilise les fonts Vercel edge-friendly.
`ImageResponse` a un cold start ~ 200 ms — acceptable pour OG.

### Tests

- Preview OG sur Twitter Card Validator (https://cards-dev.twitter.com/validator) : manuel.
- Playwright e2e : fetch `GET /opengraph-image` → attendre status 200 +
  `content-type: image/png`.

## Chantier 2 — ai.txt + règles User-Agent IA

### Fichier à créer

`public/ai.txt` — standard proposé par [ai.txt](https://site.spawning.ai/spawning/ai-txt)
et repris par Anthropic/OpenAI/Perplexity.

Contenu standard + directives spécifiques Ankora :

```
# ai.txt for ankora.be
# Last updated: 2026-04-20

# We welcome citation and indexing by AI assistants, but prohibit
# training data ingestion of our proprietary content.

User-Agent: *
Allow: /
Disallow: /app/
Disallow: /auth/
Disallow: /onboarding/
Disallow: /api/

# Specific bots — explicit allow for search / citation
User-Agent: GPTBot
Allow: /
Disallow: /app/
Disallow: /auth/
Disallow: /onboarding/
Disallow: /api/

User-Agent: ClaudeBot
Allow: /
Disallow: /app/
Disallow: /auth/
Disallow: /onboarding/
Disallow: /api/

User-Agent: ChatGPT-User
Allow: /

User-Agent: PerplexityBot
Allow: /

User-Agent: Google-Extended
Allow: /
Disallow: /app/
Disallow: /auth/
Disallow: /onboarding/
Disallow: /api/

User-Agent: Applebot-Extended
Allow: /

User-Agent: CCBot
Allow: /

# Blocked by policy
User-Agent: Bytespider
Disallow: /

User-Agent: Amazonbot
Disallow: /app/
Disallow: /auth/
Disallow: /onboarding/
Disallow: /api/
```

### Modification `src/app/robots.ts`

Le `robots()` Next.js doit générer les mêmes directives :

```ts
import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

const AI_BOTS_ALLOW_PUBLIC = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
  'Amazonbot',
] as const;

const AI_BOTS_ALLOW_ALL = ['ChatGPT-User', 'PerplexityBot'] as const;

const AI_BOTS_BLOCKED = ['Bytespider'] as const;

const PRIVATE_PATHS = ['/app/', '/auth/', '/onboarding/', '/api/'];

export default function robots(): MetadataRoute.Robots {
  const rules: MetadataRoute.Robots['rules'] = [
    { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    ...AI_BOTS_ALLOW_PUBLIC.map((ua) => ({
      userAgent: ua,
      allow: '/',
      disallow: PRIVATE_PATHS,
    })),
    ...AI_BOTS_ALLOW_ALL.map((ua) => ({ userAgent: ua, allow: '/' })),
    ...AI_BOTS_BLOCKED.map((ua) => ({ userAgent: ua, disallow: '/' })),
  ];
  return {
    rules,
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
```

### Tests

- `curl https://ankora.be/robots.txt` → vérifier présence des 9 User-Agents.
- `curl https://ankora.be/ai.txt` → vérifier le fichier statique.
- Test unit `src/app/robots.test.ts` qui parse le retour et vérifie les
  règles.

## Chantier 3 — llms-full.txt généré au build

### Concept

`public/llms.txt` existe déjà (squelette court). Créer `llms-full.txt`
qui concatène en markdown brut :

1. Header identique à `llms.txt`.
2. Landing copy complète (title, hero, features, how-it-works, FAQ).
3. Page FAQ complète (8 Q&A).
4. Résumés légaux (privacy, CGU, cookies — max 500 mots chacun).
5. Glossaire 7 entrées (dépend de PR-SEO-2 — si pas encore livré,
   placer un TODO dans le script pour intégration automatique après
   merge de PR-SEO-2).

### Fichiers à créer

- `scripts/build-llms-full.mjs` — script Node (Edge-compatible pas
  nécessaire, c'est un script de build) qui lit `messages/fr-BE.json`
  (source de vérité i18n pour le contenu landing + FAQ) + les fichiers
  legal, concatène, sort en `public/llms-full.txt`.
- `package.json` — ajouter `"prebuild": "node scripts/build-llms-full.mjs"`.

### Format de sortie

```markdown
# Ankora — LLM Full Reference

> Generated 2026-04-20 · Source https://ankora.be

[... contenu llms.txt existant ...]

## Landing page

### Hero

[extrait messages.hero]

### Features

- [feature 1 title] : [feature 1 body]
- [feature 2 title] : [feature 2 body]
- [feature 3 title] : [feature 3 body]

### How it works

[steps 1-3]

## FAQ (8 questions)

### Q: [question 1]

[answer 1]

[... 7 autres ...]

## Legal summary

### Privacy

[500 mots max]

### Terms of Service (CGU)

[500 mots max]

### Cookies

[500 mots max]

## Glossary (7 terms)

### Bucket

[definition]

[... 6 autres ...]
```

### Tests

- `npm run build` produit `public/llms-full.txt` non-vide.
- Lint : vérifier que le fichier dépasse 2 000 caractères (sinon c'est
  qu'on a oublié un bloc).
- Snapshot test du format général (sections + ordre).

## Chantier 4 — datePublished + dateModified dans schemas

### Fichiers concernés

- `src/app/[locale]/layout.tsx` → `Organization` schema
- `src/app/[locale]/(public)/page.tsx` → `SoftwareApplication` + `FAQPage`
- `src/app/[locale]/(public)/faq/page.tsx` → `FAQPage`
- `src/components/seo/JsonLd.tsx` → accepter props optionnels

### Implémentation

Deux sources possibles :

1. **Dates manuelles** via variables en tête de fichier (`const PUBLISHED = '2026-01-01'; const UPDATED = '2026-04-20';`). Simple, explicite, sous contrôle. Recommandé.
2. **Git log dynamique** via `git log -1 --format=%aI -- <file>`. Plus automatisé, mais nécessite accès à `.git` en build (OK avec Vercel, KO si on déploie sans le `.git`).

**Choix** : option 1 pour commencer (simplicité + audit trail clair), bascule option 2 plus tard si besoin. Documenter dans les fichiers concernés :

```ts
// SEO: ISO 8601 dates for schema.org freshness signals
const PAGE_PUBLISHED = '2026-01-15';
const PAGE_UPDATED = '2026-04-20';
```

Puis injecter dans le JsonLd :

```ts
{
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  // ... existing fields ...
  datePublished: PAGE_PUBLISHED,
  dateModified: PAGE_UPDATED,
}
```

### Tests

- Snapshot JsonLd : vérifier présence `datePublished` et `dateModified`
  en format ISO 8601 valide.

## Chantier 5 — BreadcrumbList + HowTo schemas

### BreadcrumbList

À injecter sur **toutes les pages publiques autres que la landing** :

- `/faq` → Home > FAQ
- `/legal/privacy` → Home > Legal > Privacy
- `/legal/cgu` → Home > Legal > Terms
- `/glossaire` (après PR-SEO-2) → Home > Glossaire

Créer un composant `src/components/seo/Breadcrumb.tsx` qui prend un
tableau `[{ name, url }]` et émet le schema `BreadcrumbList` correct.

### HowTo sur landing

La section "How it works" de la landing (3 étapes) est l'archétype du
schema `HowTo`. À injecter dans `src/app/[locale]/(public)/page.tsx` :

```ts
{
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: t('howTo.title'),
  description: t('howTo.description'),
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: t('steps.1.title'),
      text: t('steps.1.body'),
    },
    // ... 2 autres ...
  ],
}
```

### Tests

- Validator Google Rich Results Test (manuel).
- Snapshot du HTML de la page FAQ contient `"@type":"BreadcrumbList"`.

## Chantier 6 — Webmanifest + PWA metadata enrichis

### Vérifications à faire

- Lire `src/app/manifest.ts` ou `public/manifest.json`. Est-il présent ?
  Expose-t-il `name`, `short_name`, `description`, `theme_color`,
  `background_color`, `icons`, `start_url`, `display: 'standalone'` ?
- Si manquant ou incomplet, créer/enrichir.
- Ajouter `lang` dynamique (current locale).

### Implémentation recommandée

```ts
// src/app/manifest.ts
import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    display: 'standalone',
    background_color: SITE.background,
    theme_color: SITE.themeColor,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
```

## Acceptance criteria

- [ ] 5 OG images dynamiques (landing + FAQ + privacy + CGU + Twitter
      landing) rendent un PNG 1200×630 ou 1200×675 valide.
- [ ] `public/ai.txt` existe, contient les 9+ User-Agents attendus.
- [ ] `src/app/robots.ts` émet les mêmes règles User-Agent que ai.txt.
- [ ] `npm run build` génère `public/llms-full.txt` non-vide (>= 2000
      chars).
- [ ] Toutes les pages JsonLd ont `datePublished` + `dateModified` ISO 8601.
- [ ] `BreadcrumbList` injecté sur FAQ + legal pages.
- [ ] `HowTo` injecté sur landing.
- [ ] `manifest.ts` expose le webmanifest complet avec icônes maskable.
- [ ] `npm run typecheck` + `npm run lint` + `npm run test` passent.
- [ ] Lighthouse SEO score ≥ 100 en prod.

## Contraintes non négociables

- **Zéro dépendance nouvelle.** Tout via Next.js 16 built-in + scripts
  Node natifs.
- **Pas de refactor du design-system** — on utilise les tokens existants.
- **i18n conservée** — les OG images et schemas doivent respecter la
  locale active.
- **CSP compatible** — les JsonLd restent injectés via le composant
  `JsonLd.tsx` existant qui applique le nonce.
- **Branche** : `feat/seo/technical-perfect-score`
- **Commit** : `feat(seo): technical perfect score — OG + ai.txt + llms-full + schemas`
- **Target** : `main`

## Risques à surveiller

- **Cold start OG images** : `ImageResponse` peut être lent au premier
  rendu. Si c'est bloquant, fallback sur images statiques PNG pré-générées
  en build.
- **Taille bundle** : les OG images embarquent parfois des fonts inlinées.
  Si le bundle Edge explose, décharger les fonts via fetch dans une
  function cachée.
- **i18n × OG** : si tu génères une OG par locale, assure-toi que la
  locale est bien récupérée du segment dynamique `[locale]`.

## Sortie attendue

- 1 PR, ~ 15-20 fichiers touchés (5 OG + 1 ai.txt + 1 robots + 1 script
  llms-full + 3-5 pages pour datePublished + 2-3 composants schema +
  1 manifest).
- Diff reviewable en < 45 min.
- Description PR qui cite `docs/seo/AUDIT-SEO-GEO-LLM-2026-04-20.md`
  section "Top 5 quick wins".

---

**Séquence recommandée** : PR-2b merge → PR-SEC-1 → ADR-004 logger →
PR-B1 bug-reporting → **PR-SEO-1 (cette PR)** → **PR-SEO-2 (contenu)**.
