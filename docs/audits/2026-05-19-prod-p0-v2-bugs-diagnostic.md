# Diagnostic P0 V2 — 3 bugs résiduels post-PR #169 (19 mai 2026)

**Auteur** : @cc-ankora (Opus 4.7)
**Branche** : `feat/fix-prod-p0-v2` (worktree isolé)
**Base** : `494c56a` (origin/main post PR #169 + #170)
**Date diagnostic** : 2026-05-19, 09h00 CEST (session matinale post-cleanup)
**Smoke test source** : @thierry iPhone 14 Safari + PWA réel + DevTools Brave 2026-05-18 ~22h CEST

## Résumé exécutif

| Bug | Statut         | Root cause                                                   | Sévérité | Effort fix |
| --- | -------------- | ------------------------------------------------------------ | -------- | ---------- |
| #1bis CSP inline style | CONFIRMÉ | React `style={{...}}` rendu en HTML attribute, bloqué par `style-src 'self' 'nonce-XYZ'` strict | P0       | S          |
| #2bis Fonts OTS parse  | CONFIRMÉ | ServiceWorker cache poisoned avec ancien HTML 404 pré-PR #169 — sert `0x0A0A0A0A` au lieu du TTF | P0       | XS         |
| #4 Drawer mobile       | CONFIRMÉ | Parent `<header sticky z-40 backdrop-blur>` crée un stacking context iOS Safari qui confine le drawer enfant `z-40` | P0       | S          |

**Recommandation @cc-ankora** : un seul PR multi-fix discipliné. Bug #2bis = 1 ligne sw.js (effort minimal, déblocage majeur). Bug #1bis = 3 sources factuelles identifiées, migration vers utility classes CSS sans toucher au CSP. Bug #4 = React Portal vers `document.body`.

---

## Bug #2bis — Fonts OTS parsing error (ServiceWorker cache poisoning)

### Évidence factuelle

**Serveur prod sert le bon TTF** (testé via curl avec iPhone UA + Desktop UA) :

```
$ curl -A "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 ...)" -sI https://ankora.be/fonts/Inter-Variable.ttf
HTTP/1.1 200 OK
Content-Type: font/ttf
Content-Length: 879708

$ curl -sA "Mozilla/5.0 (iPhone)" https://ankora.be/fonts/Inter-Variable.ttf | head -c 16 | xxd
00000000: 0001 0000 0013 0100 0004 0030 4744 4546  ...........0GDEF
                                                    ^^^^^^^^^^^^^^^ TTF magic + GDEF table
```

→ Signature TTF valide (`0x00010000`), pas de HTML, pas de newlines. Le serveur va bien.

**ServiceWorker intercepte** : [`public/sw.js:40-86`](public/sw.js) — `isBypass()` exclut `/app`, `/auth`, `/api`, `/_next/data`, `/onboarding` MAIS PAS `/fonts/*`. Donc `/fonts/Inter-Variable.ttf` passe par la branche cache-first (ligne 73-84) :

```js
event.respondWith(
  caches.match(request).then(
    (cached) =>
      cached ?? fetch(request).then(...)
  ),
);
```

**Cache poisoning** : avant PR #169 (mergé hier 18h47 CEST), `/fonts/Inter-Variable.ttf` retournait HTTP 404 + page HTML `_not-found` (le matcher proxy.ts ne couvrait pas `.ttf`). Le SW a caché cette mauvaise réponse au moment du premier accès. Le HTML commence par `<!DOCTYPE html>` qui en bytes ASCII = `0x3C 0x21 0x44 0x4F` ; mais l'erreur `invalid sfntVersion: 168430090 = 0x0A0A0A0A = '\n\n\n\n'` suggère que le browser lit 4 newlines au début. Hypothèse : avant PR #169, Next.js servait un HTML qui commençait avec des retours à la ligne (preformatted ou erreur boundary), encodé en UTF-8 sans BOM.

Quoi qu'il en soit, **le cache SW contient une mauvaise réponse pour `/fonts/*` chez les visiteurs qui ont accédé au site avant PR #169**.

### Options de fix

| Option | Effort | Risque |
| ------ | ------ | ------ |
| **A. Bump `CACHE_VERSION` + ajouter `/fonts/` à `isBypass()`** | XS (2 lignes) | Aucun — force invalidation + ne cache plus jamais les fonts (HTTP cache natif suffit) |
| B. Bump `CACHE_VERSION` seul | XS (1 ligne) | Bas — réinvalide une fois, mais nouvelles caches /fonts/* possibles à l'avenir |
| C. Ajouter validation TTF signature dans le SW avant de servir | M | Moyen — complexité accrue, risque effets de bord |

**Recommandation @cc-ankora** : **Option A**. Bump version (`v2-20260519`) + exclure `/fonts/` du cache SW. Les fonts sont des assets statiques peu modifiés, le HTTP cache natif du browser + `Cache-Control` du serveur suffisent largement. Pas besoin du SW pour ça.

### Vérification post-fix attendue

- Au prochain visit, l'event `activate` du nouveau SW (`CACHE_VERSION` bumpé) supprime toutes les anciennes caches (logique déjà en place ligne 31-37)
- `/fonts/*` n'est plus jamais caché par le SW
- Le browser fait des HTTP requests directes au serveur, qui retourne le bon TTF (`Cache-Control: public, max-age=0, must-revalidate` côté Vercel — peut être optimisé en sous-issue)

---

## Bug #1bis — CSP inline style attributes (style-src strict bloque)

### Évidence factuelle

3 violations DevTools console identifiées par @cowork, 3 sources factuelles confirmées :

| # | Source | Ligne | Style |
| - | ------ | ----- | ----- |
| 1 | `src/components/marketing/landing/sections/Hero.tsx` | L50-53 | `background: 'radial-gradient(50% 60% at 50% 20%, color-mix(in oklab, var(--color-brand-400) 15%, transparent), transparent 70%)'` |
| 2 | `src/components/marketing/landing/sections/WhatIfDemoClient.tsx` | L175 | `accentColor: 'var(--color-brand-400)'` |
| 3 | `src/components/marketing/landing/sections/WhatIfDemoClient.tsx` | L339 | `fontVariantNumeric: 'tabular-nums'` |

Les autres `style={{...}}` du codebase (Avatar, Chip, ColorPicker, ProgressBar, design-playground, opengraph-image, error pages) :
- soit ne sont pas sur des pages publiques (design-playground)
- soit ont des valeurs **dynamiques runtime** (ProgressBar width, Avatar size) qui changent post-hydration — CSP applique côté SSR donc bloqué technically, mais @cowork n'a pas listé ces 7 violations spécifiquement
- opengraph-image utilise next/og `ImageResponse` qui n'a pas la même contrainte CSP

**Pourquoi ces 3 spécifiquement** : ils sont rendus SSR sur la landing page `/`, page la plus visitée + la plus visible.

### Options de fix

| Option | Effort | Risque |
| ------ | ------ | ------ |
| A. Ajouter `'unsafe-hashes'` à `style-src` dans `proxy.ts` CSP | XS | **Moyen** — relâche la politique CSP, security-auditor doit valider, ouvre la voie à de futurs inline styles non audités |
| **B. Migrer les 3 styles vers utility CSS classes (Tailwind + globals.css)** | S | Bas — pas de changement CSP, design intact, plus maintenable |
| C. style.setProperty() via useEffect côté client | M | Élevé — anti-pattern SSR, FOUC possible, ne marche que sur composants client |

**Recommandation @cc-ankora** : **Option B**.

Mapping fix :
- **Style #3** (font-variant-numeric) → Tailwind class `tabular-nums` (déjà disponible)
- **Style #2** (accent-color) → Tailwind arbitrary value `accent-[var(--color-brand-400)]` OU créer utility CSS `.accent-brand-400 { accent-color: var(--color-brand-400); }`
- **Style #1** (hero radial gradient) → créer utility CSS `.hero-radial-glow { background: radial-gradient(...); }` dans `globals.css` `@layer utilities`

### Impact sécurité

- Pas de relaxation CSP — `'unsafe-hashes'` PAS ajouté
- `style-src 'self' 'nonce-XYZ'` reste strict
- security-auditor à passer mais zéro changement à proxy.ts

---

## Bug #4 — Drawer mobile s'affiche en dessous du contenu (iOS Safari)

### Évidence factuelle

**Hiérarchie DOM** (landing `/`) :

```
<html overflow-x-clip>
  <body overflow-x-clip>
    <header sticky top-0 z-40 backdrop-blur>      ← MktNav.tsx:47 (marketing)
      <BrandHomeLink />
      <nav desktop links />
      <HeaderNav>                                  ← inside header
        <button hamburger />
        <div fixed inset-0 z-30 bg-black/50 />    ← overlay
        <nav fixed top-0 right-0 z-40 w-80 />     ← drawer
      </HeaderNav>
    </header>
    <main>{children}</main>
  </body>
</html>
```

Sur pages cockpit (`/app/*`), même structure mais via `Header.tsx:41` (même classes `sticky top-0 z-40 backdrop-blur`).

**Pourquoi le drawer est confiné** :

CSS spec — un élément crée un **stacking context** lorsque :
- `position: sticky` AVEC `z-index !== auto` ✅ Header
- `backdrop-filter` non-`none` ✅ Header (`backdrop-blur`)

Un descendant `position: fixed` est positionné par rapport au viewport, MAIS **reste dans le stacking context de son ancêtre le plus proche qui en crée un**.

Donc :
- Le drawer (`fixed top-0 right-0 z-40`) est positioned au viewport ✅
- Mais son **z-index 40 est interne au stacking context du header**
- Le contenu `<main>` n'a pas de stacking context (z-auto implicite)
- Sur Chrome/Firefox, le stacking context du header est élevé "haut" car z-40 → le drawer apparaît au-dessus du main
- Sur **iOS Safari**, le `backdrop-filter` crée un stacking context plus contraint, **confiné à la hauteur visuelle du header**. Le drawer (descendant) hérite de cette contrainte et se rend en dessous du `<main>` qui occupe l'écran

Pattern documenté pour iOS Safari : voir [Stack Overflow CSS stacking context backdrop-filter iOS](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context) et le runbook interne `docs/runbooks/dev-on-iphone.md`.

### Options de fix

| Option | Effort | Risque |
| ------ | ------ | ------ |
| A. Retirer `backdrop-blur` du header | XS | Élevé — perte du glassmorphism visuel signature de la marque |
| B. Retirer `z-40` du header (utiliser `z-auto` ou no-z-index) | XS | Moyen — header n'est plus au-dessus du contenu lors du scroll, casse le sticky behavior |
| **C. React Portal — porter le drawer (overlay + nav) vers `document.body` direct** | S | Bas — pattern standard React, échappe complètement au stacking context parent |
| D. `isolation: isolate` sur le drawer | XS | Élevé — ne résout pas le problème (isolation ouvre un nouveau stacking context au lieu d'échapper au parent) |

**Recommandation @cc-ankora** : **Option C**. React Portal vers `document.body` est le pattern canonique pour les overlays/modals/drawers qui doivent échapper au stacking context du composant qui les déclenche.

### Plan implémentation

Modifier `src/components/layout/HeaderNav.tsx` :

```tsx
import { createPortal } from 'react-dom';

// État local pour SSR safety
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

// Garde le bouton hamburger inline (dans le header)
return (
  <>
    <button onClick={...} ref={triggerRef}>{isOpen ? <X /> : <Menu />}</button>

    {/* Drawer + overlay rendus dans body via Portal */}
    {mounted && isOpen && createPortal(
      <>
        <div className="fixed inset-0 z-30 bg-black/50" onClick={handleDrawerClose} />
        <nav id="mobile-nav-drawer" ref={navRef} role="dialog" ...>
          {/* contenu drawer existant */}
        </nav>
      </>,
      document.body,
    )}

    <div className="hidden items-center gap-2 lg:flex">
      {/* desktop theme toggle + locale switcher */}
    </div>
  </>
);
```

Le `mounted` state évite l'hydration mismatch (Portal ne peut pas rendre côté SSR car `document` n'existe pas).

### Impact

- ✅ Drawer rendu directement dans `<body>` → échappe à tout stacking context parent
- ✅ z-index relatif au document body (z-30 overlay, z-40 drawer)
- ✅ Pas de changement CSS, juste de hiérarchie React
- ⚠️ Tests Playwright qui targetent `header [role="dialog"]` ou similar doivent être adaptés (probablement aucun car le drawer a `id="mobile-nav-drawer"` au top level)

---

## Ordre d'exécution recommandé

1. **Bug #2bis (SW fonts)** — 2 lignes sw.js, plus simple. Débloquage immédiat pour visiteurs avec cache poisoned.
2. **Bug #1bis (CSP inline style)** — migration vers utility CSS, 3 fichiers touchés (Hero.tsx, WhatIfDemoClient.tsx, globals.css), aucun changement CSP.
3. **Bug #4 (drawer Portal)** — refactor HeaderNav.tsx pour utiliser createPortal, scope contained dans 1 fichier.

Tous tiennent dans un seul PR cohérent (scope discipliné : "production hotfixes V2 18/05") sur 4-5 fichiers.

## Quality gates obligatoires post-fix

- `npm run lint`, `lint:use-server`, `typecheck`, `test`, `e2e`, `build`
- Smoke localhost prod (`npm run start`) :
  - Console = 0 erreur CSP `style-src`
  - DevTools Application → Service Workers → vérifier nouvelle version, anciennes caches purgées
  - DevTools Mobile (iPhone 14) → ouvrir drawer → vérifier rendering au-dessus du contenu

## Agents QA obligatoires

- `security-auditor` — touch sw.js + style migrations (BLOCKER)
- `ui-auditor` — vérification utility classes design system
- `mobile-ios-auditor` — drawer Portal sur iOS Safari WebKit
- `gdpr-compliance-auditor` — ServiceWorker change impact
- `test-runner`

## Smoke test prod post-merge (DoD step 5)

- **@thierry iPhone 14 Safari + PWA** : ouvrir `/`, drawer mobile → liens visibles **au-dessus** du contenu, Console DevTools = 0 violation CSP, fonts chargées sans OTS error
- **@cowork DevTools Brave** : Console = 0 CSP error, Network = 0 font OTS error, drawer correctement positionné en desktop emulation iPhone

## STOP CONDITIONS rencontrées

Aucune. Les 3 root causes sont confirmées et factuelles. Effort total estimé < 1.5 jour.

---

**FIN DIAGNOSTIC — @cc-ankora attend validation @cowork avant Phase 3 (fix).**
