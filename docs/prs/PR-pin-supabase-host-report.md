# PR — CSP au nom exact de notre projet Supabase, optimiseur d'images fermé

**Date** : 31 octobre 2026
**Branche** : `fix/pin-supabase-host-csp-images`
**Type** : `security(csp)` — durcissement de configuration, aucun changement fonctionnel visible
**Origine** : revue `security-auditor` du 31 octobre 2026 sur la PR #537, qui a demandé une PR dédiée
**Auteurs** : @cc-ankora (plan, code, tests), @thierry (revue, merge)

---

## 1. Ce qui est durci

1. **`next.config.ts` — `images`.** La configuration autorisait comme source distante
   n'importe quel projet `*.supabase.co`, alors qu'aucun composant n'utilise
   `next/image`. L'optimiseur (`/_next/image`) restait donc joignable sans rien servir
   d'utile, tout en consommant le quota d'optimisation (budget 0 €), et c'est la surface
   qui a porté les derniers avis de sécurité critiques de Next.js.
   → `images.unoptimized: true`, `remotePatterns` retiré. `/_next/image` répond 404.
   `formats: ['image/webp']` et son commentaire AVIF restent, en garde-fou si
   l'optimiseur est un jour rallumé.
2. **`src/proxy.ts` — CSP.** `img-src` et `connect-src` autorisaient tous les hôtes
   `*.supabase.co`.
   - `connect-src` nomme désormais l'hôte exact, lu dans `env.NEXT_PUBLIC_SUPABASE_URL`
     (jamais codé en dur), en HTTP(S) et dans son schéma WebSocket. Une pile locale
     (`http://127.0.0.1:54421` → `ws://`) ou un domaine personnalisé suivent seuls.
   - `img-src` ne porte plus aucune source Supabase : aucune image n'est servie depuis
     Storage.

Invariants du proxy inchangés : nonce, CSP et `x-pathname` posés sur la requête
**avant** le routage i18n, CSP recopiée sur la réponse, puis `updateSession`. Matcher
intact.

## 2. Faits mesurés avant d'écrire le code

- **Aucun consommateur de l'optimiseur.** Recherches faites avec des orthographes
  différentes : `next/image`, `next/legacy/image`, `getImageProps`, `import Image`,
  `<Image`, `unoptimized`, `_next/image`, dans `src/`, `e2e/` et `public/`. La seule
  occurrence est l'exclusion du matcher du proxy. `plan-reviewer` a refait la recherche
  de son côté : `opengraph-image.tsx` passe par `next/og` (route handler, pas
  l'optimiseur), les icônes sont des fichiers statiques, `public/sw.js` ne référence ni
  `_next/image` ni Supabase.
- **Le navigateur ne parle pas directement à Supabase.** `createBrowserClient` n'apparaît
  que dans `src/lib/supabase/client.ts`, que rien n'importe. `connect-src` garde
  l'hôte exact pour ce client dormant ; le retirer le casserait en silence le jour où
  quelqu'un s'en servirait.
- **Next 16.3.8, `next-server.js:198`** : `unoptimized` → `render404` sur `/_next/image`.

## 3. Mesures avant / après (build de prod local, `next start`)

| Requête                                       | Avant (`main`)            | Après                       |
| --------------------------------------------- | ------------------------- | --------------------------- |
| `/_next/image` sur un PNG de `public/`        | 200 (image transformée)   | 404                         |
| `/_next/image` sur une source Supabase tierce | tentative de récupération | 404                         |
| `/icons/apple-touch-icon.png` (statique)      | 200                       | 200                         |
| `img-src`                                     | joker Supabase            | `'self' data: blob:`        |
| `connect-src`                                 | joker Supabase            | hôte exact, `https` + `wss` |

## 4. Tests

- `src/__tests__/proxy-csp.test.ts` (nouveau, environnement node) :
  - `connect-src` contient exactement l'origine et sa variante `wss`, et aucune autre
    source Supabase (comparaison source par source, égalité stricte) ;
  - `img-src` vaut exactement `'self' data: blob:` ;
  - aucune `*` dans la CSP de production ;
  - pile locale en `http` → `ws://` ; URL avec chemin → origine seule ;
  - **invariant d'ordre** : le routeur i18n simulé enregistre les en-têtes de la requête
    **au moment où il est appelé** ; nonce, CSP et chemin doivent y être.
  - **Preuve qu'ils peuvent échouer** : contre le code de `main`, 6 tests sur 7 rougissent.
    Le 7e (l'ordre) rougit quand on déplace les trois `request.headers.set` sous
    l'appel au routeur (mutation temporaire, fichier restauré).
- `src/__tests__/next-config-images.test.ts` (nouveau) : `unoptimized === true`, ni
  `remotePatterns` ni `domains`.
- `e2e/security-headers.spec.ts` :
  - le test CSP existant vérifie en plus l'absence de `*` (aucun cas ajouté) ;
  - nouveau cas `image optimizer is closed` : `/_next/image` sur un fichier réel de
    `public/` → 404, après avoir vérifié que ce fichier répond 200. Il garde le
    serveur Next ; le comportement sur Vercel se mesure à part (section 8, P2-1).

## 5. Planchers e2e

Le job public exécute la spec dans trois projets Playwright (chromium-desktop,
mobile-chrome, mobile-safari). Delta **mesuré en local** sur le build de prod
(`E2E_BASE_URL` vers `next start`), spec seule :

- sans le nouveau cas : `15 passed` ; avec : `18 passed` → **+3**.

Planchers attendus : `Playwright E2E` **294 → 297**, `Playwright E2E (authenticated)`
**81** inchangé (la spec n'est pas dans `e2e/authenticated-specs.json`). Relevés CI :
section 7.

## 6. Gates locales

| Gate                                                                           | Résultat                                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                            | 0 erreur                                                                                                   |
| `npm run lint`                                                                 | 0 erreur (26 avertissements préexistants, aucun dans les fichiers touchés : `eslint` sur ces fichiers → 0) |
| `npm run lint:use-server`                                                      | OK                                                                                                         |
| `npm run test`                                                                 | 270 fichiers, 3804 tests verts                                                                             |
| `npm run build`                                                                | succès                                                                                                     |
| `npm run dev`                                                                  | `/` 200, `/login` 200, `/app` 307 → `/login` ; 0 erreur de compilation                                     |
| Console, build de prod (Chromium Playwright, `/`, `/login`, `/signup`, `/app`) | **0 erreur, 0 avertissement**, service worker enregistré                                                   |

**Console en dev — constat préexistant, hors périmètre.** `npm run dev` affiche des
violations `style-src-elem`. Elles existent à l'identique avec le `proxy.ts` de `main`
(vérifié). Toutes viennent du bundle `next-devtools` de Next, qui injecte ses `<style>`
sans nonce ; aucune ne vient du code d'Ankora. Les corriger demande d'assouplir
`style-src` en dev, ce qui est un compromis de sécurité distinct : PR séparée.

## 7. Définition de DONE

À compléter après le push (CI, Sourcery, Codex, revue humaine, état de merge).

## 8. Revue sécurité

`plan-reviewer` (Opus) : REJECTED (DoD absente, test d'ordre incapable d'échouer),
puis APPROVED après révision. `security-auditor` (Opus) sur le diff :
**PASS_WITH_NOTES**, traité ainsi :

- **P2-1, à mesurer après le déploiement.** Sur Vercel, `/_next/image` est servi par le
  service d'images de la plateforme, pas par `next start`. Le 404 n'a été mesuré qu'en
  local, et le cas e2e ne garde que le serveur Next. Après le merge : `curl` sur
  `https://ankora.be/_next/image?url=%2Ficons%2Fapple-touch-icon.png&w=64&q=75` →
  404 attendu, et l'usage « Image Optimization » du tableau de bord Vercel ne doit
  plus monter.
- **P3-1, corrigé.** `supabaseSources()` échoue fermé sur un schéma autre que http(s)
  ou un hôte contenant autre chose que `[a-z0-9.-]` et un port. Deux tests ajoutés.
- **P3-2, corrigé.** Commentaire reformulé : `connect-src` garde l'hôte exact pour le
  client navigateur dormant.
- **P3-3, hors périmètre.** Une spec e2e existante cite l'identifiant réel du projet
  dans un commentaire. PR séparée.
- **P3-4, corrigé.** Le cas e2e vérifie d'abord que le fichier source répond 200.
