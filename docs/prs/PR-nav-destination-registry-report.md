# PR — registre unique des destinations de navigation (Phase 1, lot 1)

**Date** : 26 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `feat/nav-destination-registry`
**Revue de plan** : `plan-reviewer` — 🟡 puis ✅ APPROVED (8 corrections + 3 précisions, toutes intégrées)
**Programme** : Phase 1 de la refonte UX, **premier lot**. Le redesign visuel de la nav est le lot suivant.

---

## 1. Le défaut

@thierry a constaté en production que `/app/commitments` (« Engagements ») est inatteignable
depuis la navigation mobile. Vérifié : la route existe, la page fonctionne, mais elle n'était
référencée que par le header desktop (`hidden lg:flex`) et par une carte du cockpit. Hors du
cockpit, la page n'existait plus sur mobile.

**La cause n'est pas le lien manquant, c'est qu'on pouvait l'oublier.** Les destinations
étaient déclarées **trois fois** — un tableau privé dans `BottomTabBar.tsx`, du JSX en dur
dans `MoreSheet.tsx`, du JSX en dur dans `Header.tsx` — sans rien pour les relier. Ajouter
une route et n'en câbler qu'une ou deux surfaces ne déclenchait aucune alerte.

## 2. Le correctif

`src/components/layout/app-destinations.ts` — module **server-safe** (pas de React, pas
d'import Next, même contrat que `bottom-tab-bar.routes.ts` voisin) qui déclare les 7
destinations, leur `href`, leur stratégie de correspondance et leur placement **mobile**.

Les trois surfaces le consomment désormais. Rien d'autre ne change : mêmes classes, mêmes
libellés, même rendu — plus le lien Engagements dans le sheet.

### Ce qui reste volontairement hors du registre

**Les icônes et les clés i18n**, parce que le module est server-safe et que les clés next-intl
sont typées contre `fr-BE.json` (seuls les littéraux compilent). Elles vivent dans chaque
surface sous forme de `Record<AppDestinationId, …>` : ajouter une destination sans icône ni
libellé est une **erreur TypeScript**. Même exhaustivité, sans casser le contrat du module.

**Les libellés sont différents par surface, et c'est voulu.** La barre dit « Cockpit » /
« Factures » / « Simuler » (`layout.bottomTab.*`) là où le header desktop dit « Tableau de
bord » / « Charges » / « Simulateur » (`common.nav.*`). Une clé unique aurait silencieusement
réécrit une copie rédigée pour chaque contexte — `plan-reviewer` l'a relevé avant que je
n'écrive la moindre ligne.

### Le champ s'appelle `mobilePlacement`, pas `surface`

Il gouverne le partage **mobile** (barre vs sheet). Le header desktop rend la liste
**complète** en l'ignorant. Un champ nommé `surface` sur un registre consommé par trois
surfaces se serait mal relu : le prochain lecteur aurait « corrigé » `Header` pour qu'il
filtre dessus, et fait disparaître des destinations du desktop — exactement la classe de bug
que ce module existe pour empêcher. Le nom porte l'invariant.

### Les identifiants ne sont pas des noms de dossier

`bills` pointe `/app/charges`, `simulate` pointe `/app/simulator`. Le décalage est délibéré :
ces ids sont gravés dans `data-testid="bottom-tab-bills"` / `bottom-tab-simulate` et assertés
par les suites unitaire **et** e2e. Les « harmoniser » aurait cassé les deux pour rien — et
comme les specs e2e sont `seededUser`-gated, la CI serait restée verte pendant qu'elles se
skippaient en silence. Documenté dans le module.

## 3. Le test qui rend l'oubli impossible

`src/components/layout/__tests__/app-destinations.test.ts` lit le système de fichiers et
vérifie **les deux sens** :

- **dossier → registre** : chaque route sous `src/app/[locale]/app/` doit avoir une entrée.
  C'est le bug d'Engagements.
- **registre → dossier** : chaque `href` doit pointer vers une route existante, `/app`
  excepté (c'est la racine, pas un sous-dossier). Sans ce sens, une destination survivant à
  la suppression de sa route produirait un lien 404 sur les trois surfaces sans que rien
  n'échoue.

La comparaison porte sur le **segment dérivé du `href`**, jamais sur l'`id` — sinon `bills` et
`simulate` échoueraient et pousseraient à les renommer, c'est-à-dire à provoquer la dérive
qu'on cherche à empêcher.

Garde-fous : profondeur 1 uniquement (sinon `settings/deletion-status` serait exigé à tort),
`page.tsx` requis dans le dossier, exclusion des route groups `(x)`, dossiers privés `_x`,
routes parallèles `@x` et segments dynamiques `[x]`. `// @vitest-environment node` en tête,
le projet étant en jsdom par défaut.

### Falsifiabilité vérifiée

Registre amputé d'Engagements → le test échoue avec
`expected [ 'commitments' ] to deeply equal []`. Restauré → vert. Le test attrape bien le bug
qu'il prétend attraper.

## 4. Ce que la validation e2e a révélé

Un test existant a échoué **à cause de ce changement**, et c'était instructif : « More sheet
opens via tap and closes via backdrop click ».

Le lien ajouté rehausse le sheet. Or Playwright clique le **centre** d'un élément par défaut,
et le backdrop est `fixed inset-0` — son centre est le milieu du viewport, désormais couvert
par le sheet. Le clic atterrissait donc sur le sheet et ne fermait rien.

L'intention du test reste juste (« cliquer en dehors ferme ») ; c'est le point de clic qui
était devenu faux. Il vise maintenant explicitement la bande exposée en haut du backdrop —
ce que fait un utilisateur — et reste correct quelle que soit la hauteur du sheet.

**À retenir pour le lot de redesign** : le sheet grandit avec son contenu. Sur iPhone SE il
occupe déjà une part notable de l'écran. La répartition barre/sheet devra être décidée sur
pièces, pas par accumulation.

## 5. Preuve

| Vérification                        | Résultat                                   |
| ----------------------------------- | ------------------------------------------ |
| `npm run test`                      | **1659 / 1659**                            |
| `npm run typecheck`                 | 0 erreur                                   |
| `npm run lint`                      | 0 erreur (7 warnings préexistants)         |
| `npm run lint:use-server`           | OK                                         |
| e2e `bottom-tab-bar`, **iPhone 14** | **12 / 12**, specs authentifiées comprises |
| e2e `bottom-tab-bar`, **iPhone SE** | **12 / 12**                                |
| Falsifiabilité du test anti-dérive  | rouge sans l'entrée, vert avec             |

### Comment les specs authentifiées ont été jouées, et ce que ça dit

Elles sont `seededUser`-gated et **s'auto-skippent en CI** (pas de `SUPABASE_SERVICE_ROLE_KEY`
— un seul projet Supabase, la clé `service_role` ne doit pas atteindre la CI). Elles ne
peuvent donc pas valider ce lot automatiquement : `plan-reviewer` a exigé une passe locale,
elle a été faite.

Deux frictions rencontrées, utiles à consigner :

1. `playwright.config.ts` ne charge pas `.env.local`, donc un `npx playwright test` direct
   skippe les specs seedées même quand la clé existe. Chargement fait côté terminal.
2. `npm run e2e:auth` construit et sert un build de **production**, où `rateLimit()` échoue en
   fermé sur l'Upstash factice de `.env.local` — la première connexion casse (cf. #256). La
   passe a donc été faite contre le serveur **dev**, où le rate limit échoue en ouvert.
   Écart de fidélité assumé et déclaré : il porte sur le temps de compilation des Server
   Actions, pas sur le rendu de la navigation, qui est l'objet de ce lot.

## 6. Limites assumées, écrites avant merge plutôt que découvertes après

- Sur `/app/commitments`, **aucun onglet ne porte `aria-current`** — même comportement
  qu'`/admin` aujourd'hui. Coût UX assumé, résolu au lot de redesign quand la répartition
  barre/sheet sera arbitrée.
- `AccountButton.tsx` pointe aussi `/app/settings` et **ne consomme délibérément pas** le
  registre (menu desktop). Le registre couvre les destinations de **navigation**, pas tous
  les liens vers `/app/*` de l'application.
- Les CTA contextuels du cockpit (`app/page.tsx`, `SimulatorClient.tsx`,
  `ProchainesFacturesCard.tsx`) codent en dur des `/app/...` : hors périmètre, non touchés.
- `e2e/a11y/drawer-mobile-focus-trap.spec.ts` cible le drawer marketing, **pas** le MoreSheet.
  Il n'est pas cité comme couverture de ce lot.

## 7. i18n

Nouvelle clé `layout.moreSheet.links.commitments`, ajoutée aux **5** fichiers de `messages/`
(une clé manquante déclenche un `MISSING_MESSAGE` à l'exécution sur les locales concernées).
Libellés repris à l'identique de `common.nav.commitments`, déjà traduits : Engagements,
Commitments, Verbintenissen, Verpflichtungen, Compromisos.

## 8. Definition of DONE

| #   | Critère                             | Preuve                                 |
| --- | ----------------------------------- | -------------------------------------- |
| 1   | CI verte                            | cf. checks de la PR                    |
| 2   | Sourcery muet sur le dernier commit | `gh api …/comments` → sortie vide      |
| 3   | Threads de review résolus           | GraphQL `reviewThreads` → 0 non résolu |
| 4   | Pas de conflit avec `main`          | `mergeStateStatus: CLEAN`              |
| 5   | Rapport livré                       | ce fichier                             |
