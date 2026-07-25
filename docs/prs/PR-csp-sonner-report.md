# PR — CSP `style-src` : violations `inline-style` de sonner

**Date** : 25 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `fix/csp-sonner-inline-style`
**Revue de plan** : `plan-reviewer` — 🔴 REJECTED puis 🟡 APPROVED WITH CHANGES (7 corrections appliquées)
**Audit sécurité** : `security-auditor` — 🔴 NO-GO sur la 1re version, levé par l'option (a) ci-dessous

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

| Fichier                        | Changement                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `src/app/globals.css`          | `@import 'sonner/dist/styles.css' layer(sonner);` + ordre de couches explicite |
| `e2e/security-headers.spec.ts` | assertion verrouillant l'absence de hash tiers dans `style-src`                |

Un seul changement fonctionnel : la feuille de style arrive par une source `'self'`, donc
autorisée, donc les toasts retrouvent leur positionnement.

### Ce que la première version faisait en plus, et pourquoi c'est retiré

La première version épinglait aussi les deux hashes SHA-256 dans `style-src` pour faire
taire les violations console. **`security-auditor` a posé un NO-GO, à raison** : les deux
moitiés du diff se contredisaient.

Autoriser un `<style>`, ce n'est pas seulement le tolérer — c'est **l'appliquer**. Or la
copie injectée par sonner est _non-layered_, et du CSS non-layered l'emporte sur n'importe
quelle couche quelle que soit la spécificité. Les hashes auraient donc annulé exactement la
protection que le `@layer` du même diff venait d'installer. Aggravant mesuré par l'audit :
sonner utilise `theme: 'light'` par défaut et `<Toaster />` ne passe pas de `theme`, donc
`--normal-bg: #fff` aurait gagné sur `bg-card` → **toast à fond blanc en thème sombre**, et
perte du code couleur de sévérité (`border-danger`, `border-success`…).

Bénéfice secondaire, relevé par l'audit : sans épinglage, le CSS runtime d'une future
version compromise de sonner reste **bloqué par la CSP** ; seule la copie vendored, layered
et visible dans un diff de lockfile, s'applique.

**Arbitrage assumé** : deux avertissements console cosmétiques valent mieux qu'une
régression visuelle en thème sombre et qu'un CSS tiers exécuté au sommet de notre cascade.
La décision est documentée à l'endroit où elle sera relue (`src/app/globals.css`) et
verrouillée par une assertion E2E qui échoue si un hash réapparaît dans `style-src`.

### Points de vigilance traités

- **Couche cascade** — `sonner/dist/styles.css` est livré _non-layered_. D'où
  `@layer theme, base, sonner, components, utilities;` déclaré **avant** les imports :
  sonner garde son positionnement, nos utilitaires gardent le dernier mot.
- **`package.json` inchangé** — `sonner` est déjà une dépendance.
- **Pas de `'unsafe-hashes'`, pas de `'unsafe-inline'`** — le repo style exclusivement par
  classes.

## 5. Preuve avant / après

Sonde Playwright : écoute de `securitypolicyviolation` posée via `addInitScript` (donc
active dès l'évaluation du chunk), puis mesure de la `position` calculée du conteneur et de
la couleur de fond d'un toast, **dans les deux thèmes**.

|                                       | violations `style-src` | positionnement | fond du toast (sombre) |
| ------------------------------------- | ---------------------- | -------------- | ---------------------- |
| **Avant** — production actuelle       | 2                      | `static` ✗     | `rgb(17, 26, 46)`      |
| **Après** — build de production local | 2 _(assumées)_         | `fixed` ✓      | `rgb(17, 26, 46)` ✓    |

Le défaut utilisateur est corrigé et nos tokens de thème sont préservés dans les deux modes
— ce qui n'aurait pas été le cas avec les hashes (fond blanc attendu en sombre).

## 6. Verrou anti-régression

`e2e/security-headers.spec.ts` échoue si un hash (`'sha256-…'`, `'sha384-…'`, `'sha512-…'`)
réapparaît dans `style-src`, ou si `'unsafe-hashes'` y est introduit. C'est la seule
protection nécessaire une fois l'option (a) retenue : sans hash épinglé, il n'y a plus de
constante susceptible de dériver lors d'une montée de version de sonner.

Le garde-fou anti-dérive de la première version (ré-extraction + re-hash du littéral depuis
`node_modules`) a été retiré avec les hashes qu'il protégeait. `security-auditor` avait par
ailleurs relevé que son message d'échec — « update SONNER_STYLE_HASH » — invitait à
re-hasher mécaniquement un CSS potentiellement hostile.

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
