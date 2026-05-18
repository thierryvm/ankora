# Diagnostic P0 — bugs prod ankora.be (18 mai 2026)

**Auteur** : @cc-ankora (Opus 4.7)
**Branche** : `feat/fix-prod-p0-csp-fonts-rsc` (worktree isolé)
**Base** : `e46b654` (origin/main post merges #165 #166 #167)
**Date** : 2026-05-18, 17h30 CEST
**Smoke test source** : @cowork + @thierry iPhone réel, 18/05 ~12h CEST

## Résumé exécutif

Sur les 4 bugs P0 remontés, le diagnostic factuel post-investigation donne :

| #   | Bug                | Statut diagnostic                                          | Sévérité réelle |
| --- | ------------------ | ---------------------------------------------------------- | --------------- |
| 1   | CSP violations     | **CONFIRMÉ — root cause identifiée**                       | P0              |
| 2   | Fonts 404          | **CONFIRMÉ — root cause identifiée**                       | P0              |
| 3   | RSC prefetch 404   | **CONFIRMÉ — root cause identifiée**                       | P1              |
| 4   | Mobile drawer vide | **Probablement résolu par PR-UX-1 (#167)** — à reconfirmer | P0 → résolu     |

**Recommandation @cc-ankora** : un PR multi-fix discipliné qui adresse #1 + #2 + #3 en un commit cohérent (tous les 3 touchent au middleware `src/proxy.ts` et au layout, donc bundling logique). Bug #4 nécessite un nouveau smoke test post-deploy car PR-UX-1 mergée à 14h02 CEST a très probablement résolu le problème (le smoke test @cowork est antérieur de 2h au merge).

## Méthodologie

Diagnostic factuel sur la prod ankora.be via `curl` + analyse du HTML rendu (pas de spéculation côté code seul). Référence : posture "ingénieur partenaire" CLAUDE.md → faits observables d'abord, théorie après.

Évidence reproductible par :

```bash
curl -sI "https://ankora.be/fonts/Inter-Variable.ttf"        # bug #2
curl -sI -H "RSC: 1" -H "Next-Router-Prefetch: 1" \
  "https://ankora.be/?_rsc=test"                              # bug #3
curl -s "https://ankora.be/" | grep -oE '<script[^>]*>'       # bug #1
```

---

## Bug #1 — CSP violations sur inline script theme-boot

### Root cause CONFIRMÉE en local (fix appliqué)

Investigation initiale (hypothèse fausse) : le script placé entre `<html>` et `<body>` perdait son nonce lors du rendering. Faux — le déplacement seul n'a pas résolu le bug.

Vraie root cause découverte par instrumentation (`data-test-nonce`) :
**`getNonce()` retournait `undefined` côté Server Component**. Le RSC payload contenait `"nonce":"$undefined"`.

Pourquoi : dans `src/proxy.ts` (version pré-fix), l'ordre était :

```ts
const response = handleI18nRouting(request); // <- snapshot des request.headers
// ...
request.headers.set('x-nonce', nonce); // <- mutation post-snapshot, ignorée
```

`handleI18nRouting()` de next-intl construit la réponse en capturant un snapshot des request headers. Toute mutation `request.headers.set()` APRÈS est invisible aux Server Components downstream (qui lisent via `headers()` côté Next.js). Le nonce était bien généré et appliqué au CSP de la response (donc Next.js framework scripts l'utilisaient), mais les Server Components voyaient `undefined`.

### Fix appliqué

Deux changements coordonnés :

1. **`src/proxy.ts`** — déplacer `request.headers.set('x-nonce', ...)` AVANT `handleI18nRouting(request)`. Idem pour `x-pathname` (utilisé par audit logging admin). Documentation de l'ordre clarifiée pour qu'un futur dev ne re-swap pas.

2. **`src/components/theme/ThemeBootScript.tsx`** (nouveau) — extraction du script theme-boot dans un Server Component dédié qui lit `getNonce()` et émet `<script nonce={...}>` via `createElement`. Pattern mirroré sur `JsonLd.tsx`. Placé en premier enfant de `<body>` (cf. layout.tsx) — pas strictement nécessaire pour le nonce (le vrai bug est en proxy.ts) mais sémantiquement plus propre que le placement initial entre `<html>` et `<body>`.

### Vérification locale

```bash
# Avant fix :
# <script>(function(){try{var t=localStorage...   <-- pas de nonce, CSP block

# Après fix (npm run build && npm run start, curl http://localhost:3000/):
# <script nonce="V0VjWmVocGU3YzVuM196Ykpud1dj">(function(){try{var t=localStorage...
# Tous les inline scripts (theme-boot + Next.js framework + JsonLd) portent le nonce.
```

### Impact sécurité

- Pas de relaxation du CSP — `'unsafe-inline'` n'est PAS ajouté
- `script-src 'self' 'nonce-XYZ' 'strict-dynamic'` reste intact
- `style-src 'self' 'nonce-XYZ'` reste intact
- Audit `security-auditor` à passer avant merge (revue de l'ordre d'exécution proxy)

---

## Bug #2 — Fonts 404 (Inter / Fraunces / JetBrainsMono)

### Root cause confirmée

Évidence factuelle :

```
$ curl -sI "https://ankora.be/fonts/Inter-Variable.ttf"
HTTP/1.1 404 Not Found
X-Matched-Path: /_not-found
Link: <https://ankora.be/fonts/Inter-Variable.ttf>; rel="alternate"; hreflang="fr-BE",
      <https://ankora.be/nl-BE/fonts/Inter-Variable.ttf>; rel="alternate"; hreflang="nl-BE",
      ...
```

Le header `Link` avec hreflang prouve que **next-intl middleware a traité `/fonts/Inter-Variable.ttf` comme un path de page localisable** et l'a routé vers `/_not-found`.

Le matcher dans [`src/proxy.ts`](../../src/proxy.ts) lignes 105-112 :

```
'/((?!api|auth/callback|monitoring|_next/static|_next/image|_vercel|
   favicon.ico|icon.svg|apple-icon.svg|manifest.webmanifest|robots.txt|
   sitemap.xml|llms\\.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico)
  ).*)'
```

… exclut **uniquement les images** (`png|jpg|jpeg|gif|svg|webp|avif|ico`) mais PAS les fonts (`.ttf .woff .woff2 .otf .eot`).

Les 3 fichiers fonts existent dans `/public/fonts/` :

- `Inter-Variable.ttf`
- `Fraunces-Variable.ttf`
- `JetBrainsMono-Variable.ttf`

Mais Vercel/Next.js ne les sert jamais car le middleware les intercepte d'abord et leur applique next-intl routing.

### Options de fix

| Option                                                                        | Effort       | Risque                                       |
| ----------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| **A. Ajouter `ttf\|woff\|woff2\|otf\|eot` à la regex d'exclusion**            | XS (1 ligne) | Bas — extensions standard, pas de cas limite |
| B. Déplacer les fonts dans `/public/_next/static/fonts/` (préfixe déjà exclu) | S            | Moyen — modif globals.css path requise       |

**Recommandation @cc-ankora** : **Option A**. Patch minimal et explicite.

### Note collatérale (post-fix)

Le `globals.css` référence ces fonts via `@font-face url('/fonts/X.ttf')`. Une fois le matcher corrigé, vérifier en local que le CSS résout correctement les paths. Aucun changement CSS requis a priori.

---

## Bug #3 — RSC prefetch 404 sur ~30 URLs

### Root cause confirmée

Évidence factuelle reproductible :

```
$ curl -sI -H "RSC: 1" -H "Next-Router-Prefetch: 1" "https://ankora.be/?_rsc=test"
HTTP/1.1 404 Not Found
X-Matched-Path: /_not-found
```

vs. sans le marker prefetch :

```
$ curl -sI -H "RSC: 1" "https://ankora.be/?_rsc=test"
HTTP/1.1 200 OK
X-Matched-Path: /[locale].rsc
X-Nextjs-Rewritten-Path: /fr-BE
```

Le matcher [`src/proxy.ts`](../../src/proxy.ts) lignes 108-111 :

```ts
missing: [
  { type: 'header', key: 'next-router-prefetch' },
  { type: 'header', key: 'purpose', value: 'prefetch' },
],
```

… exclut explicitement les prefetches du middleware. Commentaire dans le code :

> Prefetch requests are excluded so the CSP nonce isn't cached across users.

**Mais conséquence inattendue** : sans middleware, next-intl ne rewrite plus `/` → `/fr-BE`. Next.js essaie de matcher `/` qui ne correspond à aucune route (le routing est `[locale]/...`). Résultat : 404.

### Vérification de l'hypothèse "cache nonce"

La précaution `missing:` est over-engineered : les responses RSC prod portent déjà `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. Vercel CDN ne cache donc PAS ces réponses. Le risque "nonce caché entre users" n'existe pas en prod.

### Options de fix

| Option                                                                  | Effort        | Risque                                                |
| ----------------------------------------------------------------------- | ------------- | ----------------------------------------------------- |
| **A. Retirer le `missing:` filter du matcher**                          | XS (3 lignes) | Bas — `Cache-Control: no-store` déjà en place sur RSC |
| B. Ajouter un second matcher pour les prefetches avec middleware allégé | M             | Moyen — duplication logique                           |
| C. Désactiver le prefetch sur tous les `<Link>`                         | XS            | Élevé — dégradation perf navigation                   |
| D. Documenter le bug et désactiver le prefetch sélectivement            | S             | Moyen — accepte la dette                              |

**Recommandation @cc-ankora** : **Option A**. Retirer le `missing:` filter, mettre à jour le commentaire explicatif (`Cache-Control: no-store` déjà appliqué via RSC route handler Next.js, donc le nonce ne fuite pas entre users).

### Impact sécurité

Validation `security-auditor` obligatoire. Le nonce devient per-prefetch (au lieu d'absent) — neutre sécurité positive. À confirmer que les RSC responses passent bien `no-store`.

---

## Bug #4 — Mobile drawer vide

### Diagnostic

@cowork rapporte : "le drawer s'ouvre (header 'Menu' + X visible) mais les liens internes ne s'affichent PAS".

### Analyse code post-PR-UX-1

Le code actuel sur `e46b654` (main HEAD post-PR-UX-1 #167) dans [`HeaderNav.tsx`](../../src/components/layout/HeaderNav.tsx) lignes 168-274 contient bien :

- variant `'marketing'` : Product / Simulator / Pricing / FAQ + Login/Signup OR My Cockpit
- variant `'app'` : Dashboard / Accounts / Charges / Expenses / Simulator / Settings + Admin (conditional)

Le drawer rend correctement les liens via `{variant === 'marketing' && (<>...</>)}` ou `{variant === 'app' && (<>...</>)}`.

### Timeline critique

- **12h00 CEST** : smoke test @cowork iPhone — bug #4 observé
- **14h02 CEST** : PR-UX-1 (#167) mergée — title : "drawer mobile parity + remove disabled MktNav items"
- **~14h05 CEST** : Vercel auto-deploy de main avec PR-UX-1
- **17h30 CEST** : diagnostic @cc-ankora — code POST-fix

**Hypothèse @cc-ankora** : Le bug #4 a été causé par un état pré-PR-UX-1 où le drawer n'avait pas les liens product/simulator/pricing. PR-UX-1 a précisément ajouté ces liens (`tMkt('product')`, etc.). Le smoke test @cowork à 12h CEST est antérieur de 2h au merge → bug très probablement résolu.

### Action recommandée

**Reconfirmer post-deploy de cette PR** par un smoke test @thierry iPhone + @cowork DevTools. Si bug persiste, ouvrir une investigation séparée (probablement liée à useTranslations namespace ou CSS visibility). **Ne PAS coder un fix spéculatif.**

---

## Ordre d'exécution recommandé

1. **Bug #2 (fonts 404)** — fix le plus simple, 1 ligne regex
2. **Bug #3 (RSC prefetch 404)** — fix middleware, même fichier que #2, change logique du matcher
3. **Bug #1 (CSP theme-boot)** — fix layout, déplacement du `<script>` dans `<body>`
4. **Bug #4** — pas de fix code dans cette PR, vérification post-deploy uniquement

Tous les fix tiennent dans un seul PR cohérent (scope discipliné : "production hotfixes 18/05") sur 2 fichiers : `src/proxy.ts` + `src/app/[locale]/layout.tsx`.

## Quality gates obligatoires post-fix

- `npm run lint`
- `npm run lint:use-server`
- `npm run typecheck`
- `npm run test`
- `npm run e2e` (incluant tests mobile WebKit)
- `npm run build` + `npm run start` (smoke local)
- Vérifier DevTools console = 0 erreur CSP attendu

## Agents QA obligatoires

- `security-auditor` — touch proxy/middleware CSP — **BLOCKER**
- `ui-auditor` — drawer mobile parity check
- `mobile-ios-auditor` — touch nav, drawer, hydration
- `gdpr-compliance-auditor` — fonts loading impact
- `test-runner` — toute modif code

## Smoke test prod post-merge (DoD step 5)

- @thierry iPhone réel : ouvrir `/`, ouvrir drawer mobile, vérifier liens visibles
- @cowork DevTools Chrome : Console = 0 CSP violation, Network = 0 font 404, 0 RSC prefetch 404

---

**FIN DIAGNOSTIC**
