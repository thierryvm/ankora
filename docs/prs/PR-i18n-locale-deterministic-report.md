# PR — résolution de langue déterministe (fin du bug « ça repasse en anglais »)

**Date** : 25 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `fix/i18n-locale-cookie-deterministic`
**Revue de plan** : `plan-reviewer` — 🟡 APPROVED WITH CHANGES (6 édits, tous intégrés)
**Arbitrage produit** : re-validé par @thierry le 25/07 sur l'énoncé de coût **corrigé**

---

## 1. Le bug

Le sélecteur de langue repassait tout seul en anglais, ~50 % du temps, jamais dans l'autre
sens. Cause racine établie et mergée en #255 (`docs/audits/2026-07-25-locale-cookie-race-diagnostic.md`) :

`syncCookie` de next-intl réécrit `NEXT_LOCALE` dès que le locale résolu par l'URL diffère
du cookie, et le préfixe d'URL gagne toujours. Toute requête `/en…` alors que le cookie
vaut `fr-BE` rebascule la langue en anglais pour un an. C'est une **course** : une requête
`/en…` encore en vol se termine après le `Set-Cookie` de la Server Action. La page reste
affichée en français, seul le cookie bascule, et c'est la navigation _suivante_ qui
redirige en 307.

Asymétrique par construction : le sens FR→EN vise des URLs non préfixées
(`localePrefix: 'as-needed'`), donc le locale résolu égale déjà le cookie et rien n'est
écrit. D'où « ça revient **toujours** à l'anglais ».

## 2. Pourquoi le correctif n'est pas dans le middleware

Trois correctifs y ont été construits et mesurés sur build de production avant d'abandonner
cette couche. Les trois sont **structurellement impossibles** : Next canonise les requêtes
RSC avant l'exécution du middleware — en-têtes `rsc` / `next-router-prefetch` /
`sec-purpose` retirés, **et** paramètre `?_rsc` retiré de l'URL. Un prefetch et une
navigation document sont littéralement indiscernables depuis `proxy.ts`.

Le correctif devait donc **supprimer l'écriture** de next-intl, pas tenter de qualifier la
requête.

## 3. Le correctif

```ts
// src/i18n/routing.ts
localeCookie: false,
localeDetection: false,
```

La résolution se réduit à un seul intrant déterministe : **le préfixe d'URL**, avec repli
sur `defaultLocale`. `syncCookie` retourne immédiatement — la course disparaît par
construction, pas par contournement.

### Pourquoi les deux flags, et pas seulement le premier

C'est le trou que `plan-reviewer` a trouvé dans ma première version, et il aurait transformé
un bug intermittent en bug **déterministe**.

Dans `resolveLocale` de next-intl, le cookie et `Accept-Language` sont deux branches de la
**même** garde `localeDetection`. Retirer le cookie seul promeut `Accept-Language` au rang
de détecteur unique. Or en `as-needed` le français vit sur les URLs **non préfixées** :

- un visiteur au navigateur anglais qui choisit le français serait redirigé en 307 vers
  `/en` sur **toute** URL non préfixée → **français inatteignable**, 100 % du temps, pour
  toute une classe d'utilisateurs ;
- un visiteur néerlandophone serait poussé vers `/nl-BE`, qui n'est **pas traduit** (dette
  i18n connue), sans échappatoire.

`localeDetection: false` supprime les deux. Bénéfice collatéral : l'app ne peut plus servir
automatiquement une locale sans traduction validée (`LOCALES_VISIBLE` = FR + EN pour v1.0).

### Arbitrage assumé, re-validé

@thierry avait validé l'option A sur un énoncé de coût **incomplet** (« on perd la mémoire
de la langue sur `/` nu »). L'énoncé corrigé — « arriver sur `/` affiche **toujours** le
français, quelle que soit la langue du navigateur » — lui a été re-soumis et confirmé.

Ce qui est perdu : l'accueil automatique dans la langue du navigateur à la première visite.
Ce qui est gagné : un comportement déterministe, un sélecteur qui fonctionne pour tout le
monde, et plus aucune exposition accidentelle des locales non traduites.

## 4. Le cookie n'est pas supprimé

`NEXT_LOCALE` reste écrit par `setLocaleAction` et gardé, parce qu'il a encore **deux
lecteurs** vérifiés :

- `src/app/auth/callback/route.ts` — locale de la cible après le rebond OAuth Google
- `src/app/not-found.tsx` — 404 racine, hors segment `[locale]`

Le supprimer casserait le retour de connexion Google. `src/i18n/request.ts` le lit aussi,
mais seulement quand `requestLocale` est absent — ce qui, en `as-needed`, n'arrive
quasiment jamais. Laissé en filet, non touché ici.

**Réserve à connaître** : un cookie `en` résiduel, empoisonné par le bug avant ce
correctif, continuera de piloter ces deux lecteurs jusqu'au premier passage dans le
sélecteur. Impact faible et auto-résolutif. Aucune migration nécessaire pour le routage :
le middleware ne lit plus ce cookie, et `/` rend le français quel que soit son contenu.

## 5. Fichiers

| Fichier                                                                   | Changement                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/i18n/routing.ts`                                                     | les deux flags + la note longue expliquant pourquoi ils sont indissociables |
| `e2e/i18n/locale-detection-off.spec.ts`                                   | **nouveau** — la classe de régression que la suite ne pouvait pas voir      |
| `e2e/i18n/locale-switcher.spec.ts`                                        | specs 2 et 3 réécrites vers les chemins préfixés ; non-régression réactivée |
| `tests/i18n/routing.test.ts`                                              | verrou de config sur les deux flags                                         |
| `src/proxy.ts`, `src/app/auth/callback/route.ts`, `src/app/not-found.tsx` | commentaires devenus faux                                                   |

### La spec qui manquait

Les 5 projets Playwright épinglent tous `locale: 'fr-BE'`. **Aucune spec existante ne
pouvait observer** ce que reçoit un navigateur non francophone — la suite était
structurellement aveugle à la régression décrite en §3. `locale-detection-off.spec.ts`
utilise `test.use({ locale: 'en-US' })` et vérifie qu'un navigateur anglais qui choisit le
français **garde** le français, sur navigation douce comme sur navigation dure.

### Les deux specs qu'il fallait réécrire

Les specs 2 et 3 passaient par `/faq` et `/glossaire` **non préfixés** en assertant
`lang="en"`, en s'appuyant explicitement sur « the cookie-based locale resolution path » —
le contrat que cette PR supprime. Réécrites vers `/en/faq` et `/en/glossaire`, ce que les
`<Link>` de l'app émettent réellement une fois l'utilisateur en anglais. La spec 2 assert
en plus la contrepartie : l'URL non préfixée est française pour tout le monde.

## 6. Preuve

### Rouge sans le correctif, vert avec

Le test `French stays French after an /en prefetch` émet un GET `/en?_rsc=…` avec
`credentials: 'include'` alors que le cookie vaut `fr-BE`, puis assert que le cookie vaut
**toujours** `fr-BE`.

| Config                           | Résultat                                  | Quand                                                                                                                    |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `localeCookie: { … }` (avant)    | ❌ `Expected: "fr-BE"` / `Received: "en"` | mesuré à plusieurs reprises pendant l'investigation du 25/07 — c'est ce qui a motivé son passage en `test.fixme` en #255 |
| `localeCookie: false` (cette PR) | ✅                                        | build de production local, suite `e2e/i18n/` complète                                                                    |

Suite `e2e/i18n/` avec le correctif, build de production, `chromium-desktop` : **7 passés,
1 skippé, 0 échec** — les 3 specs du switcher, les 3 nouvelles specs `en-US`, et le test de
non-régression.

### Quality gates

- `npm run typecheck` : 0 erreur
- `npm run lint` : 0 erreur (7 warnings préexistants)
- `npm run test` : **1646 / 1646**, dont le verrou de config `routing.test.ts` (5/5)

### Parcours joué en direct dans un navigateur

Demandé par @thierry. Build de production local, navigateur piloté pas à pas :

| Étape                                               | Résultat                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Arrivée sur `/`                                     | `lang="fr-BE"`, aucun cookie — pas de redirection `Accept-Language`            |
| Clic **EN**                                         | `/en`, titre « Your financial anchor »                                         |
| Clic **FR**, puis 5 s d'attente                     | `/`, `lang="fr-BE"`, `NEXT_LOCALE=fr-BE` — la fenêtre de course est passée     |
| Prefetch `/en?_rsc=…` rejoué avec le cookie `fr-BE` | HTTP 200, **cookie inchangé** — c'est exactement la requête qui le réécrivait  |
| Navigation vers `/faq`                              | `lang="fr-BE"`, H1 « Questions fréquentes », **aucun 307 vers `/en`**          |
| `/en` puis `/en/faq`                                | `lang="en"`, H1 « Frequently asked questions », **et le cookie reste `fr-BE`** |

La dernière ligne est la démonstration la plus directe : consulter des pages anglaises ne
touche plus à la langue enregistrée.

Console : 2 violations CSP `style-src` (celles de `sonner`, conservées délibérément en
#257) et 4 erreurs Vercel Insights (scripts absents en local). Aucune erreur nouvelle.

### Ce que la preuve ne couvre pas

Le rejeu rouge/vert n'a pas pu être refait en aller-retour immédiat en fin de session (le
serveur local n'a pas pu être relancé). Le rouge documenté ci-dessus a été mesuré plus tôt
dans la même session, sur le même test et le même chemin de code, avec la configuration
d'avant. La CI rejoue la suite complète contre un build de production.

## 7. Definition of DONE

| #   | Critère                             | Preuve                                 |
| --- | ----------------------------------- | -------------------------------------- |
| 1   | CI verte                            | cf. checks de la PR                    |
| 2   | Sourcery muet sur le dernier commit | `gh api …/comments` → sortie vide      |
| 3   | Threads de review résolus           | GraphQL `reviewThreads` → 0 non résolu |
| 4   | Pas de conflit avec `main`          | `mergeStateStatus: CLEAN`              |
| 5   | Rapport livré                       | ce fichier                             |
