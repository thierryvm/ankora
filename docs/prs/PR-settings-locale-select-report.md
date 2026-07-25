# PR — un seul contrôle de langue, un seul écrivain

**Date** : 26 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `fix/settings-locale-select`
**Revue de plan** : `plan-reviewer` — 🟡 ×2 (v1 puis v2), 13 corrections au total, toutes intégrées
**Audits** : `i18n-auditor` ✅ GO · `ui-auditor` (cf. §7)
**Décision produit** : @thierry, 26/07 — « juste FR - EN point, pas de précision spécifique, cela complique trop les choses pour rien »

---

## 1. Le défaut

Le sélecteur de langue de Réglages › Profil était cassé de deux façons cumulées, et
préexistait à tout ce qui a été livré cette semaine.

**Il ne pouvait rien enregistrer d'autre que le français.** Le `<Select>` proposait `fr-BE`,
`fr-FR` et `en-GB`. Le schéma serveur validait `z.enum(LOCALES)` avec
`LOCALES = ['fr-BE','nl-BE','en','es-ES','de-DE']` : `fr-FR` et `en-GB` n'y figurent pas, donc
toute sélection autre que le français belge échouait en validation et affichait un toast
d'erreur générique.

**Et même un `fr-BE` accepté ne changeait rien à l'écran.** `updateProfileAction` écrivait
`users.locale` sans toucher au cookie `NEXT_LOCALE` ni revalider le layout racine. Or depuis
#258 la locale rendue vient **exclusivement du préfixe d'URL** : la colonne changeait, l'app
restait dans la langue précédente.

La cause commune : **deux écrivains divergents** de la même préférence. `setLocaleAction`
faisait le travail complet (cookie + DB + `revalidatePath('/', 'layout')` + navigation),
`updateProfileAction` en faisait un tiers, mal.

## 2. Le correctif

`ProfileCard` rend désormais le **`<LocaleSwitcher />` existant** — segmented control FR | EN
basé sur `LOCALES_VISIBLE`, déjà audité a11y (radiogroup, cibles 44 px, `aria-busy`), déjà
branché sur `setLocaleAction` puis `router.replace`.

`setLocaleAction` devient le **seul** écrivain : `locale` sort de `profileUpdateSchema` et de
`updateProfileAction`, qui ne met plus à jour que `display_name`.

C'est la suggestion que `plan-reviewer` m'a faite et que la décision de @thierry a rendue
évidente : ma v1 prévoyait de réparer le `<Select>` maison, c'est-à-dire d'écrire une
**troisième** implémentation du même contrôle. Réutiliser celui qui existe supprime d'un coup
le double `onSubmit`, les clés `localeOptions`, et la question de la valeur initiale.

### Le contrôle sort du formulaire

Il ne s'agit pas d'un brouillon qu'on soumet : le switcher persiste immédiatement puis navigue
vers l'URL localisée, ce qui remonte la carte. Le laisser dans le `<form>` aurait suggéré que
« Enregistrer » s'y applique — et une saisie de nom en cours aurait disparu au changement de
langue, sans explication. Il est donc sur sa propre ligne, séparée par une bordure, avec la
grammaire libellé-gauche / contrôle-droite du toggle de thème du `MoreSheet`.

### Un `<span>`, et un nom accessible distinct — correction issue de l'audit UI

`LocaleSwitcher` est un `radiogroup` sans contrôle labelable unique : un `htmlFor` pendrait
dans le vide, d'où le `<span>`.

Ma première version laissait le switcher garder son propre `aria-label`. **`ui-auditor` a
relevé que c'était une régression que j'introduisais** : à ≥1024px, `/app/settings` monte
aussi le switcher du `HeaderNav` (son bloc `hidden lg:flex` est bien dans le DOM et
focusable). Deux `radiogroup` annoncés « Changer de langue » deviennent indiscernables dans
la liste des éléments d'un lecteur d'écran. Avant ce diff, un seul exemplaire coexistait par
viewport.

Corrigé plutôt que laissé en arbitrage : `LocaleSwitcher` accepte désormais un
`labelledById` optionnel, et le champ des Réglages nomme le groupe par son libellé visible
« Langue ». Les instances du header et du `MoreSheet` sont inchangées — sans la prop, le
comportement d'origine est conservé. Bénéfice secondaire : le nom accessible **égale**
désormais le texte visible au lieu de simplement le contenir (WCAG 2.5.3), ce que l'audit
signalait comme conforme mais fragile et non testé.

### Le piège des deux clés d'erreur quasi identiques

`settings.locale.invalid` (émise par le champ retiré du schéma) devenait orpheline et a été
supprimée des 5 fichiers. `errors.locale.invalid`, elle, est émise par `setLocaleAction` et a
été **préservée** — les confondre aurait cassé le chemin d'erreur du switcher.
`i18n-auditor` a vérifié les deux : orpheline absente partout, celle du switcher intacte et
toujours atteignable, parité des 5 locales conservée.

Le groupe `app.settings.profile.localeOptions` a été supprimé : c'était un doublon de
`ui.localeSwitcher.options.*`, et ce doublon est exactement ce qui avait permis à `fr-FR` et
`en-GB` de diverger de l'enum serveur.

## 3. Ce qui n'a délibérément pas bougé

- **`users.locale` reste écrit** par `setLocaleAction` et **reste lu** par `src/i18n/request.ts`
  quand `requestLocale` est absent. Je m'étais trompé en écrivant que la colonne ne pilotait
  plus grand-chose : c'est le filet cross-device / cookie perdu.
- **`profileUpdateSchema` reste un `z.object` nu, jamais `.strict()`.** Pendant un déploiement,
  les onglets sur l'ancien bundle continuent d'envoyer `{ displayName, locale }` ; Zod strippe
  les clés inconnues, donc ils dégradent proprement. `.strict()` les rejetterait sèchement,
  pour une propreté que personne ne demande. Un test verrouille ce comportement.
- **Les trois éditions tiennent dans un seul commit.** Le schéma portait `.default('fr-BE')` :
  si le client avait cessé d'envoyer `locale` avant que le schéma et l'action ne changent,
  chaque sauvegarde de profil aurait silencieusement réinitialisé la langue de l'utilisateur.

## 4. Preuve

### Smoke en direct, session connectée

Joué sur la page Réglages réelle avec le fixture seedé :

```
label   : Langue
options : ["FR","EN"]
ancien <Select> : 0 occurrence
```

Il a aussi **confirmé une prédiction de la revue** : la page porte **2 instances** du
`LocaleSwitcher` (le `Header variant="app"` en rend une dans un bloc `hidden lg:flex`, présent
dans le DOM à tout viewport ; le `MoreSheet` en rend une autre sur mobile). Les
`data-testid` internes du switcher sont donc ambigus sur cette page. D'où le conteneur
`data-testid="settings-locale-field"` : tout locator doit passer par lui, sinon il déclenche
une strict-mode violation. Les testids internes du switcher n'ont **pas** été touchés — ils
sont consommés par `e2e/i18n/locale-switcher.spec.ts` et `locale-detection-off.spec.ts`.

### Tests

|                     |                                                                         |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run test`      | **1669 / 1669**                                                         |
| `npm run typecheck` | 0 erreur                                                                |
| `npm run lint`      | 0 erreur, 8 warnings — **niveau préexistant**, aucun ajouté par ce diff |

`tests/actions/settings-profile.test.ts` — **nouveau**. Il épingle le payload réellement envoyé
à Supabase, seul endroit où la régression pourrait revenir sans bruit : le schéma ne type même
plus `locale`, donc un simple typecheck n'attraperait pas un `update()` écrit à la main.

**Falsifiabilité vérifiée** : en réintroduisant `locale: 'fr-BE'` dans l'`update()`, deux specs
passent au rouge avec `+ "locale": "fr-BE"`. Restauré → vert.

`e2e/mobile-ios/settings-locale-field.spec.ts` — **nouveau**, 3 specs : options exactement
FR|EN et ancien `<Select>` disparu ; nom accessible du groupe distinct de celui du header ;
et sauvegarder le nom ne touche pas à la langue (la séparation d'avec le formulaire). Joué en
local : **3/3 sur iPhone 14**. Il s'auto-skippe en CI, c'est écrit en tête du fichier.

`tests/schemas/settings.test.ts` — les deux specs qui asservissaient l'acceptation de `locale`
et le défaut `fr-BE` ont été **réécrites**, pas supprimées : elles asserent désormais le
contrat inverse. Les effacer aurait fait disparaître la seule trace que ce contrat a changé
volontairement.

### Ce que la CI ne prouvera pas

Aucun spec Playwright ne couvre ce contrôle : `e2e/smoke.spec.ts` ne teste que la redirection
vers `/login`, et les parcours authentifiés s'auto-skippent en CI faute de
`SUPABASE_SERVICE_ROLE_KEY` (un seul projet Supabase, la clé `service_role` ne doit pas y
atteindre). **Une CI verte ne vaut donc pas validation de ce correctif** — d'où le smoke seedé
local ci-dessus, exigé par la revue.

À consigner aussi : `setLocaleAction` n'a **aucun rate limit** là où `updateProfileAction`
consomme un jeton `rateLimit('mutation')`. Inchangé par rapport au `LocaleSwitcher` du header,
donc pas une régression de cette PR, mais le déplacer dans les Réglages en fait un chemin de
plus vers une action non limitée.

## 5. Note d'i18n consignée pour ne pas être re-débattue

Le libellé **visible** est « FR » / « EN », conforme à la décision de @thierry. Le **nom
accessible** des options vient de `ui.localeSwitcher.options.*`, où `fr-BE` vaut
« Français (BE) » — la mention régionale subsiste donc pour les technologies d'assistance.
`i18n-auditor` le qualifie de conforme : un sélecteur de langue affiche l'endonyme, et le code
`fr-BE` est précisément la valeur envoyée à `setLocaleAction`.

## 6. Definition of DONE

| #   | Critère                                        | Preuve                            |
| --- | ---------------------------------------------- | --------------------------------- |
| 1   | CI verte                                       | cf. checks de la PR               |
| 2   | Sourcery muet sur le dernier commit            | `gh api …/comments` → sortie vide |
| 3   | Approbation humaine @thierry + threads résolus | à la revue                        |
| 4   | Pas de conflit avec `main`                     | `mergeStateStatus: CLEAN`         |
| 5   | Rapport livré                                  | ce fichier                        |

## 7. Audits

- **`i18n-auditor`** : ✅ **GO**. Parité vérifiée sur les 5 fichiers, clés supprimées sans
  consommateur résiduel, `errors.locale.invalid` intacte et distincte de l'orpheline, aucun
  résidu `fr-FR` / `en-GB`, aucun lecteur de `users.locale` cassé.
- **`ui-auditor`** : ✅ **GO conditionnel**, avec un P1 réel — la duplication du contrôle sur
  desktop, corrigée dans cette PR (cf. §2), et un P1 « aucun test de non-régression sur le
  nouveau champ », corrigé par `e2e/mobile-ios/settings-locale-field.spec.ts`.
  Contraste, cible tactile, ordre de tabulation et parité i18n : conformes.

  **Restent en P2, non traités ici et volontairement** :
  - Pas d'`aria-describedby` « s'applique immédiatement » sur le switcher. Le signal est
    visuel (bordure de séparation). Risque faible — convention établie pour les sélecteurs de
    langue — mais réel pour un utilisateur non-voyant, dans ce nouveau contexte de carte de
    formulaire.
  - La relation « libellé visible ⊂ nom accessible » n'est verrouillée par aucun test unitaire
    sur les 5 locales. Sans objet pour le champ des Réglages depuis la correction ci-dessus
    (les deux sont désormais la même chaîne), mais toujours vrai pour les autres instances.
  - `CardTitle` rend un `<div>` et jamais un vrai titre : ça concerne la hiérarchie de titres
    de toute l'app, pas cette carte. À tracer séparément, hors périmètre.
