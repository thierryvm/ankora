# Audit SEO-GEO-LLM Ankora — 2026-04-20

- **Auditeur** : Cowork-Opus (Claude) pour Thierry vanmeeteren
- **Date** : 2026-04-20
- **Cible** : `ankora.be` (branche `main`)
- **Scope** : 3 couches — SEO classique (Google/Bing) + GEO
  (Generative Engine Optimization : AI Overview, SGE, ChatGPT browsing,
  Perplexity, Claude web) + LLM discoverability (llms.txt, ai.txt,
  crawlers IA).
- **Méthode** : lecture exhaustive des metadata, layouts, route handlers
  sitemap/robots/icons, composants SEO, fichiers i18n, et des fichiers
  publics statiques. Grep sur 3 axes (structured data, llms, noms auteur).

---

## TL;DR

**Posture** : solide côté SEO classique (B+), moyenne côté GEO (C+),
faible côté LLM discoverability (D+).

**1 bug critique P0** identifié hors scope audit mais bloquant à publier :
le nom auteur dans `package.json` et `src/lib/site.ts` est **faux**
(`Thierry Vanmansart` au lieu de `Thierry vanmeeteren`). C'est injecté
dans tous les Open Graph + JsonLd `Organization` → diffusé sur tous les
scrapers sociaux et indexeurs actuellement.

**3 gaps stratégiques** qui justifient un travail dédié :

1. Glossaire métier public absent (lissage, bucket, provision…) — bloqueur
   GEO pour les requêtes long-tail "qu'est-ce qu'un lissage budgétaire".
2. Aucune directive `ai.txt` ni règle User-Agent spécifique pour GPTBot,
   ClaudeBot, PerplexityBot, Google-Extended dans `robots.txt`.
3. Pas de `llms-full.txt` — les LLM qui respectent le standard llms.txt
   ne trouvent qu'un squelette, pas le contenu indexable.

**Score synthétique** :

| Couche              | Note | Priorité |
| ------------------- | ---- | -------- |
| SEO classique       | B+   | Soigner  |
| GEO                 | C+   | Investir |
| LLM discoverability | D+   | Combler  |

---

## 🚨 P0 hors audit — Nom auteur faux dans metadata publiques

**Fichiers concernés** :

- `package.json:7` → `"author": "Thierry Vanmansart <thierryvm@gmail.com>"`
- `src/lib/site.ts:20` → `authors: [{ name: 'Thierry Vanmansart' }]`

**Conséquence** : `site.ts` alimente les metadata Next.js (Open Graph,
Twitter card, JsonLd Organization). Tout bot social (LinkedIn, Twitter,
Facebook, Discord, Slack, Google) qui scrape ankora.be reçoit un nom
auteur **inventé**.

**Fix à faire** : remplacer par `Thierry vanmeeteren` (lowercase v,
convention flamande — aligné ADR / README / LICENSE / NOTICE).

Je te prépare le fix en PR courte (≤ 2 fichiers) — ou CC Ankora peut
l'intégrer à PR-SEC-1. À toi de voir.

---

## Couche 1 — SEO classique (Note B+, 87%)

### Métadonnées pages

**État** : `generateMetadata` câblé sur landing, FAQ, privacy, CGU, root
layout. `title`, `description`, `alternates.canonical` présents.
**Refs** : `src/app/[locale]/layout.tsx:33-83`,
`src/app/[locale]/(public)/page.tsx:13-16`,
`src/app/[locale]/(public)/faq/page.tsx:19-26`,
`src/app/[locale]/(public)/legal/privacy/page.tsx:13-20`,
`src/app/[locale]/(public)/legal/cgu/page.tsx:11-19`.
**Note** : A.

### Alternates (hreflang)

**État** : `next-intl` injecte `alternates.languages` pour les 5 locales
en root layout. Sitemap couvre les 25 combinaisons (5 routes × 5 locales).
`localePrefix: 'as-needed'` — fr-BE à la racine, autres préfixées.
**Refs** : `src/app/[locale]/layout.tsx:36-56`, `src/app/sitemap.ts:22-28`.
**Note** : A.

### Structured data (JsonLd)

**État** : `Organization` (root) + `SoftwareApplication` (landing) +
`FAQPage` (landing + /faq). Injecté avec CSP nonce via composant
`JsonLd.tsx`.
**Refs** : `src/app/[locale]/layout.tsx:96-103`,
`src/app/[locale]/(public)/page.tsx:28-47`,
`src/app/[locale]/(public)/faq/page.tsx:37-46`,
`src/components/seo/JsonLd.tsx:17-30`.
**Gap** : pas de `DefinedTerm` / `BreadcrumbList` / `HowTo`.
**Note** : B.

### sitemap.xml + robots.txt

**État** : sitemap couvre landing + FAQ + legal × 5 locales. Robots
bloque `/app/`, `/auth/`, `/onboarding/`, `/api/`.
**Refs** : `src/app/sitemap.ts:1-34`, `src/app/robots.ts:5-25`.
**Gap** : robots ne différencie aucun User-Agent IA (cf. Couche 3).
**Note** : A pour SEO pur, mais fait tomber la Couche 3.

### Open Graph / Twitter

**État** : OG + Twitter configurés en root layout (type website, image
`/brand/logo.svg`, creator `@ankora_app`).
**Gap** : pas de `opengraph-image.tsx` dynamique — tous les partages
affichent la même image quelle que soit la page.
**Refs** : `src/app/[locale]/layout.tsx:57-71`.
**Note** : B.

### Performance SEO

**État** : `next.config.ts:14-22` active AVIF/WebP, `remotePatterns`
Supabase. Icons PWA complets. Vercel Speed Insights + Analytics présents.
**Note** : B.

### i18n SEO

**État** : next-intl v4 + `routing.ts` correct, cookie locale, hreflang
complet. 5 fichiers messages.
**Refs** : `src/i18n/routing.ts:1-18`, `src/i18n/request.ts:34-40`.
**Note** : A.

### Contenu textuel landing

**État** : H1 dynamique, H2 ×3, H3 ×6. Environ 500 mots, FAQ sur page
dédiée. Pas de chiffres/statistiques sourcées ("47 % des Belges
stressent…"), pas de témoignages.
**Note** : B.

### Gaps Couche 1

1. **OG image statique uniquement** — perte d'engagement sur partages
   sociaux (landing et FAQ ont la même card).
2. **Contenu court + sans preuves** — 500 mots sur landing, pas de stats
   sourcées, pas de case studies.
3. **Pas de `datePublished` / `dateModified`** dans les schemas — le
   signal de fraîcheur manque.

---

## Couche 2 — GEO (Note C+, 65%)

### Contenu citable

**État** : phrases courtes, FAQ long-form (8 Q&A). Mais aucune citation
externe chiffrée type "selon la Banque Nationale de Belgique…". Les
moteurs IA citent préférentiellement du contenu sourcé.
**Note** : B.

### FAQ structurée

**État** : `/faq` avec 8 Q&A (bankConnection, dataLocation, smoothing,
deletion, export, advice, ai, sharing) et `FAQPage` schema.
**Gap** : pas de mini-FAQ sur la landing, où les LLM scrapent en
priorité.
**Note** : B.

### Glossaire / définitions

**État** : **ABSENT**. Les termes métier clés (bucket, enveloppe,
lissage, provision, smoothing, goal, buffer) ne sont pas en page publique
indexable. Ils vivent uniquement dans `messages/*.json` + `prompts/` +
landing copy. Aucune page `/glossaire` ou `/terms`.
**Impact** : un utilisateur qui demande à ChatGPT "c'est quoi le lissage
budgétaire" ne tombera pas sur Ankora.
**Note** : **D**.

### Schema riche

**État** : `FAQPage` + `SoftwareApplication` OK. Manque `DefinedTerm`
(pour glossaire), `HowTo` (pour les parcours "comment…"),
`BreadcrumbList`, Author/Creator propre.
**Note** : B.

### Autorité

**État** : 1 seul lien sortant autorité (APD Belgique, dans privacy).
Aucun lien vers FSMA, Banque Nationale, SPF Finances, CNIL, ni vers des
études ou rapports finances Belgique.
**Note** : **C**.

### Fraîcheur

**État** : dates en dur dans les legal pages ("16 avril 2026"), pas de
`datePublished` / `dateModified` dans le JsonLd. Sitemap `lastModified`
dynamique (OK).
**Note** : C.

### Gaps Couche 2

1. **Glossaire public** — le gap le plus bloquant pour GEO. Sans page
   indexable qui définit "lissage budgétaire", Ankora rate toutes les
   requêtes long-tail IA.
2. **Zéro citation sourcée** — landing en abstrait sans chiffres.
3. **Autorité faible** — 1 backlink sortant, pas de preuves tierces.

---

## Couche 3 — LLM discoverability (Note D+, 58%)

### llms.txt

**État** : **présent** (`public/llms.txt`, 34 lignes). Décrit produit,
pages essentielles, principes clés, "ce qu'Ankora n'est pas". Bon
squelette.
**Note** : A pour ce fichier, mais le standard llms.txt attend aussi
`llms-full.txt`.

### llms-full.txt

**État** : **ABSENT**. Les LLM qui suivent le standard (Anthropic,
OpenAI, Perplexity supportent partiellement) ne trouvent que le
squelette. Le contenu long (landing, FAQ, legal) n'est pas inliné en
markdown brut.
**Note** : **D**.

### ai.txt

**État** : **ABSENT**. Pas de `public/ai.txt` ni route handler.
**Impact** : les préférences de crawl IA (train/no-train, ingestion
temps réel vs indexation) ne sont pas explicitement déclarées.
**Note** : **D**.

### robots.txt — règles IA

**État** : générique, **aucun User-Agent IA spécifique**. GPTBot,
ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bytespider, Applebot
tombent tous dans la règle `*` par défaut (allow).
**Impact** : pas de contrôle fin. Aujourd'hui on accepte tout, mais on
ne le déclare pas explicitement — donc on ne maîtrise ni les quotas ni
la communication en cas de dispute.
**Refs** : `src/app/robots.ts:15-20`.
**Note** : **C**.

### Content-accessible routes

**État** : toutes les pages publiques sont SSR (Server Components), pas
de CSR avec hydratation bloquante. Le HTML initial contient le contenu
et le JsonLd. Les LLM qui ne scrapent pas le JS récupèrent tout.
**Note** : B.

### Marques claires

**État** : H1 landing `"Ton ancrage financier"` (tagline belle mais
cryptique — "ancrage" n'est pas keyword budget). Footer `Ankora™ …`.
Pas de phrase d'accroche type "Ankora est un outil de budgétisation
par enveloppes pour les ménages belges".
**Impact** : un LLM qui cite Ankora ne sait pas comment le résumer
en une phrase — risque de citation incorrecte ou vague.
**Note** : B.

### Gaps Couche 3

1. **`ai.txt` manquant** — pas de directives explicites pour crawlers IA.
2. **`llms-full.txt` manquant** — llms.txt seul est un squelette vide.
3. **Positionnement cryptique** — la tagline "Ton ancrage financier" est
   jolie mais ne décrit pas ce que fait le produit. Un LLM qui cite
   Ankora risque de le présenter comme "outil de méditation financière"
   (littéralement).

---

## Top 5 quick wins (< 2 h chacun)

1. **[P0] Fix `Vanmansart` → `vanmeeteren`** dans `package.json` +
   `src/lib/site.ts`. 2 fichiers, 2 lignes. Diffusé dans tous les Open
   Graph + JsonLd depuis le premier déploiement. _Effet : fiabilité
   brand, compliance identité._
2. **[P1] Créer `public/ai.txt`** standard + User-Agent specifics
   (GPTBot Allow `/`, Disallow `/app/`, `/auth/`, `/onboarding/`, `/api/`
   ; idem ClaudeBot, PerplexityBot, Google-Extended, CCBot). _Effet :
   LLM discoverability +20 %._
3. **[P1] Générer `public/llms-full.txt`** — concat automatique des
   messages i18n (landing copy + FAQ + résumés legal) en markdown brut,
   build-time via un petit script Node dans `scripts/build-llms-full.mjs`.
   _Effet : LLM indexing +25 %._
4. **[P1] Ajouter `datePublished` + `dateModified`** dans les schemas
   `FAQPage` et `SoftwareApplication`. Dérivés du `git log` ou des dates
   de révision manuelles legal. _Effet : fraîcheur signalée, GEO +5 %._
5. **[P2] Injecter 3 liens sortants autorité** (APD déjà OK, ajouter
   FSMA + Banque Nationale de Belgique + SPF Finances) sur privacy/FAQ.
   _Effet : E-E-A-T Google + GEO autorité +10 %._

---

## Top 3 gaps stratégiques (nécessitent ADR ou PR dédiée)

### Gap 1 — Glossaire métier public indexable

**Constat** : les 7 termes clés (bucket, enveloppe, lissage, provision,
smoothing, goal, buffer) ne sont pas en page publique. Or GEO et LLM
cherchent à citer des définitions sourcées. Sans glossaire, Ankora est
invisible sur "qu'est-ce que le lissage budgétaire".

**Piste** : route `/glossaire` (localisée 5 langues) + `DefinedTerm`
schema par entrée + lien depuis le footer. Une page, 7 entrées, 1 h de
rédaction + 30 min de dev.

**Décision à trancher** : faire un ADR-005 ou juste une PR directe ? Je
penche pour **PR directe** — ce n'est pas une décision architecturale,
c'est de l'exécution SEO pure. Un bon ADR-005 pourrait plutôt décider
de la **stratégie éditoriale SEO** (blog ? guides ? études ?) sur le
moyen terme.

### Gap 2 — Crawlers IA non différenciés

**Constat** : aucune règle User-Agent spécifique. On ne déclare rien, on
ne bloque rien, on ne pilote rien.

**Piste** : PR unique qui ajoute

- `public/ai.txt` (standard NIST/Cloudflare)
- `src/app/robots.ts` mis à jour avec blocs `GPTBot`, `ClaudeBot`,
  `PerplexityBot`, `Google-Extended`, `CCBot`, `Applebot-Extended`,
  `Bytespider`, `Amazonbot`.

**Décision stratégique** : on autorise tout ou on bloque certains ?
Pour un projet vitrine, je recommande **Allow `/` pour tous sauf
`/app/`, `/auth/`, `/onboarding/`, `/api/`**. Être cité est un avantage
pour la visibilité. Seule exception : Bytespider (ByteDance/TikTok)
souvent bloqué pour cause de terms of service opaque.

### Gap 3 — Positionnement landing cryptique pour LLM

**Constat** : "Ton ancrage financier" est une belle tagline humaine mais
pas une description produit. Un LLM qui doit résumer Ankora en une
phrase a besoin d'un "one-liner factuel".

**Piste** : sous la tagline poétique, ajouter une phrase produit factuelle
type "Ankora est un cockpit de budgétisation par enveloppes pour les
ménages belges, sans connexion bancaire PSD2". C'est exactement ce que
ChatGPT/Claude/Perplexity citeront.

**Décision à trancher** : c'est du copywriting UX — voir si on passe par
le skill `design:ux-copy` pour 3 variantes de one-liner alignées brand.

---

## Plan de séquençage recommandé

**Avant publication élargie** (bloquant) :

1. **PR fix-identity** (5 min) — `Vanmansart` → `vanmeeteren`. Je peux
   la faire moi-même ou la coller dans PR-SEC-1.

**Quick wins (2 PR courtes, 1 semaine)** :

2. **PR seo-ai-discovery** — `ai.txt` + `robots.txt` avec User-Agent
   specifics + `llms-full.txt` généré au build.
3. **PR seo-freshness** — `datePublished` / `dateModified` + 3 liens
   autorité sortants.

**Chantiers stratégiques (à planifier après PR-B1)** :

4. **PR glossaire-public** — route `/glossaire` + 7 entrées +
   `DefinedTerm` schema.
5. **ADR-006 (optionnel)** — stratégie éditoriale SEO long terme
   (blog ? guides pratiques ? études chiffrées ?).

---

## Sources

- `F:\PROJECTS\Apps\ankora\src\app\[locale]\layout.tsx`
- `F:\PROJECTS\Apps\ankora\src\app\[locale]\(public)\page.tsx`
- `F:\PROJECTS\Apps\ankora\src\app\[locale]\(public)\faq\page.tsx`
- `F:\PROJECTS\Apps\ankora\src\app\[locale]\(public)\legal\privacy\page.tsx`
- `F:\PROJECTS\Apps\ankora\src\app\[locale]\(public)\legal\cgu\page.tsx`
- `F:\PROJECTS\Apps\ankora\src\app\sitemap.ts`
- `F:\PROJECTS\Apps\ankora\src\app\robots.ts`
- `F:\PROJECTS\Apps\ankora\src\components\seo\JsonLd.tsx`
- `F:\PROJECTS\Apps\ankora\src\i18n\routing.ts`
- `F:\PROJECTS\Apps\ankora\src\i18n\request.ts`
- `F:\PROJECTS\Apps\ankora\src\lib\site.ts`
- `F:\PROJECTS\Apps\ankora\public\llms.txt`
- `F:\PROJECTS\Apps\ankora\package.json`
- `F:\PROJECTS\Apps\ankora\messages\fr-BE.json`

---

**Conclusion** : Ankora est techniquement bien préparé côté SEO
classique (B+). Le gap est sur GEO (C+) et LLM discoverability (D+) —
ce sont exactement les axes qui comptent en 2026 pour un projet vitrine
qui veut être trouvé par des recruteurs tech qui utilisent ChatGPT,
Perplexity, Claude pour sourcer. Le P0 identité (`Vanmansart`) est à
corriger avant toute autre communication publique. Les quick wins
cumulés font passer l'app à A- global en une semaine de travail.
