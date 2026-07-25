# PR — CSP `style-src` : violations `inline-style` de sonner

**Date** : 25 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `fix/csp-sonner-inline-style`
**Revue de plan** : `plan-reviewer` — 🔴 REJECTED puis 🟡 APPROVED WITH CHANGES (7 corrections, toutes appliquées)

---

## 1. Symptôme

Console de production (relevé @thierry) : deux violations CSP `inline-style` par page,
émises depuis notre propre bundle.

```
sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=
```

## 2. Diagnostic — première hypothèse réfutée

Ma première analyse désignait `@radix-ui/react-dialog` → `react-remove-scroll` →
`react-style-singleton` → `get-nonce`, ce dernier retournant `undefined` faute de
`setNonce()`.

`plan-reviewer` l'a **rejetée**, preuve à l'appui : `react-style-singleton` remplit son
`<style>` **avant** de l'insérer, il ne peut donc jamais produire un hash de chaîne vide.
Il a désigné `sonner`, qui fait exactement l'inverse.

## 3. Cause racine (mesurée)

`node_modules/sonner/dist/index.mjs` :

```js
head.appendChild(style); // inséré VIDE           → check CSP #1
style.appendChild(document.createTextNode(code)); // rempli APRÈS → check CSP #2
```

Un seul élément, deux évaluations CSP, donc exactement deux violations. `__insertCSS(...)`
est appelé au **scope module**, à l'évaluation du chunk — aucun rendu n'a encore eu lieu.
`<Toaster />` étant monté sans condition dans `src/app/[locale]/layout.tsx`, les violations
tombent sur **chaque page**.

Confirmation par re-calcul des hashes depuis le paquet installé :

```
littéral __insertCSS  (14 859 car.) → sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=   ← MATCH
chaîne vide                          → sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=   ← MATCH
```

`sonner` n'expose aucune API de nonce (zéro occurrence de « nonce » dans le paquet).

### Conséquence non anticipée : un bug utilisateur réel

Le CSS de sonner étant bloqué, `[data-sonner-toaster]{position:fixed}` ne s'appliquait pas.
**Les toasts étaient mal positionnés en production**, pas seulement bruyants en console.
Les `classNames` Tailwind de `src/components/ui/toast.tsx` ne stylent que la surface du
toast, jamais son conteneur.

## 4. Correctif

| Fichier                                | Changement                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `src/app/globals.css`                  | `@import 'sonner/dist/styles.css' layer(sonner);` + ordre de couches explicite |
| `src/lib/security/csp-style-hashes.ts` | nouveau — les deux hashes, sans aucun import                                   |
| `src/proxy.ts`                         | hashes interpolés dans `style-src`, dans **tous** les environnements           |
| `tests/csp-style-hashes.test.ts`       | nouveau — garde anti-dérive                                                    |
| `e2e/security-headers.spec.ts`         | assertion de câblage sur la directive émise                                    |

**Ceinture + bretelles, deux rôles distincts** : la feuille `'self'` est ce qui rend l'UI
correcte (et le reste le jour où le hash dérive) ; les hashes ne font que rendre la console
propre.

### Points de vigilance traités

- **Couche cascade** — `sonner/dist/styles.css` est livré _non-layered_, et du CSS
  non-layered l'emporte **toujours** sur du CSS layered, quelle que soit la spécificité. Un
  import naïf aurait écrasé `bg-card`, `border-border`, `border-danger`… de
  `toast.tsx`, en clair comme en sombre. D'où `@layer theme, base, sonner, components,
utilities;` déclaré **avant** les imports : sonner garde son positionnement, nos
  utilitaires gardent le dernier mot.
- **Pas de gating production** — mesuré : la violation se reproduit aussi en dev, car CSP3
  fait ignorer `'unsafe-inline'` dès qu'un nonce est présent, et `'nonce-…'` est toujours
  émis. Le `devStyleExtras` est un no-op pour cette directive.
- **Module de constantes sans import** — importer `src/proxy.ts` depuis Vitest est
  impossible : il tire `src/lib/supabase/middleware.ts` → `src/lib/env.ts`, qui _throw_ au
  chargement sans les variables d'environnement.
- **Pas de `'unsafe-hashes'`** — ce sont des éléments `<style>`, pas des attributs `style=`.
- **`package.json` inchangé** — `sonner` est déjà une dépendance.

## 5. Preuve avant / après

Sonde Playwright : écoute de `securitypolicyviolation` posée via `addInitScript` (donc
active dès l'évaluation du chunk), puis mesure de la `position` calculée d'un
`[data-sonner-toaster]`.

|                                                           | violations `style-src` | `[data-sonner-toaster]` |
| --------------------------------------------------------- | ---------------------- | ----------------------- |
| **Avant** — production actuelle (`ankora-chi.vercel.app`) | **2**                  | `static` ✗ CSS absent   |
| **Après** — build de production local                     | **0**                  | `fixed` ✓ CSS appliqué  |

## 6. Garde anti-dérive

Une montée de version de `sonner` change le littéral CSS et ferait silencieusement
réapparaître la violation. `tests/csp-style-hashes.test.ts` ré-extrait le littéral depuis
`node_modules` à chaque run et échoue bruyamment. Il refuse aussi de passer au vert si
l'extraction casse : nombre d'appels `__insertCSS(` attendu, et longueur extraite

> 1 000 caractères — une regex qui ne matche plus rien ne peut pas produire un test vert.

Le test unitaire prouve que la constante est **juste** ; le spec E2E prouve qu'elle est
**branchée**. Une constante définie mais jamais interpolée passerait le premier et laisserait
la violation vivante.

## 7. Hors scope, à replanifier

`react-style-singleton` (Radix Dialog/Sheet) n'a toujours pas de nonce : c'est un bug réel
mais **non mesuré**, distinct de celui-ci. Il nécessite `get-nonce` en dépendance explicite
(donc `package.json`, voie lourde) et un `setNonce()` appelé en corps de render — jamais
dans un `useEffect`, les effects remontant des enfants vers les parents. À planifier après
mesure, pas avant.

## 8. Definition of DONE

| #   | Critère                             | Preuve                                 |
| --- | ----------------------------------- | -------------------------------------- |
| 1   | CI verte                            | cf. checks de la PR                    |
| 2   | Sourcery muet sur le dernier commit | `gh api …/comments` → sortie vide      |
| 3   | Threads de review résolus           | GraphQL `reviewThreads` → 0 non résolu |
| 4   | Pas de conflit avec `main`          | `mergeStateStatus: CLEAN`              |
| 5   | Rapport livré                       | ce fichier                             |
