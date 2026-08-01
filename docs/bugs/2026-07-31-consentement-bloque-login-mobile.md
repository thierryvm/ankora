# La bannière de consentement empêche la connexion sur téléphone

- **Date** : 2026-07-31
- **Gravité** : bloquant en production, sur tous les iPhone testés
- **Statut** : **corrigé le 2026-07-31**, avec le test de première visite qui
  manquait. Voir « Correctif » en fin de note.
- **Mesuré sur** : build de production (`npm run start`), stack Supabase locale,
  Playwright 1.59.1, `chromium.launch()` avec les presets d'appareils officiels

## Symptôme

Sur la page `/login`, en première visite, la bannière de consentement recouvre le
bouton « Se connecter » et **intercepte les clics**. L'utilisateur ne peut pas se
connecter tant qu'il n'a pas traité la bannière. Playwright le formule ainsi :

```
locator.click: Timeout 30000ms exceeded.
  - element is visible, enabled and stable
  - scrolling into view if needed → done scrolling
  - <p id="consent-body"> from <div role="dialog" aria-labelledby="consent-title">
    subtree intercepts pointer events
  - retrying click action (57 ×)
```

## Reproduction

1. Vider `localStorage` pour l'origine (ou naviguer en fenêtre privée).
2. Ouvrir `/login` dans un viewport de téléphone (voir tableau).
3. Tenter de cliquer « Se connecter ».

Le bouton est **visible, activé et stable** — il n'est simplement pas atteignable.
Rien n'indique à l'utilisateur que la bannière est la cause.

## Mesure

Élément réellement sous le centre du bouton (`document.elementFromPoint`) :

| Appareil (preset Playwright) | Viewport | Reçoit le clic     | Verdict    |
| ---------------------------- | -------- | ------------------ | ---------- |
| iPhone SE                    | 320×568  | `button` recouvert | **BLOQUÉ** |
| iPhone 12                    | 390×664  | `p#consent-body`   | **BLOQUÉ** |
| iPhone 14                    | 390×664  | `p#consent-body`   | **BLOQUÉ** |
| iPhone 15 Pro Max            | 430×739  | `h2#consent-title` | **BLOQUÉ** |
| Galaxy S9+                   | 320×658  | `div`              | **BLOQUÉ** |
| Pixel 7                      | 412×839  | `button`           | cliquable  |

**Le facteur déterminant est la hauteur du viewport, pas la largeur.** Balayage à
390 px de large, par pas de 10 px : bloqué jusqu'à **780 px**, cliquable à partir
de **790 px**.

Géométrie : le bouton se termine à `y = 498` dans le flux ; la bannière est
`fixed bottom-4`, donc son haut vaut `hauteurViewport − 16 − hauteurBannière`.
La bannière mesure 272 à 378 px selon le retour à la ligne du texte (elle est
d'autant plus haute que l'écran est étroit — le pire cas est le plus petit écran).

`src/components/gdpr/ConsentBanner.tsx:206` :

```
fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-xl border p-5 shadow-lg
md:inset-x-auto md:left-1/2 md:-translate-x-1/2
```

Aucune de ces classes ne réserve d'espace dans le flux : la bannière flotte
au-dessus du contenu, et sur un écran court elle atteint le formulaire.

## Pourquoi la CI ne l'a jamais vu

`e2e/helpers/test.ts:50-52`, en commentaire de la fixture partagée :

> « Pre-seeds the consent banner as dismissed so tests can click through
> **without the fixed-position dialog intercepting pointer events**. »

La fixture écrit `localStorage['ankora.consent.v1']` avant chaque test. Le
symptôme était donc **connu et contourné** — mais le contournement s'applique à
100 % de la suite, y compris aux trois projets iPhone. **Aucun test n'exerce le
parcours de première visite**, qui est précisément celui de tout nouvel
utilisateur. Le garde-fou ne ment pas sur ce qu'il exécute ; il exécute
seulement un monde où la bannière a déjà été traitée.

C'est la même famille que les incidents recensés dans `CLAUDE.md` : un mécanisme
vert qui ne teste pas la chose qui casse.

## Portée

`ConsentBanner` est monté sur le layout, donc le recouvrement ne concerne pas que
`/login` : tout bouton situé bas dans le flux sur un écran court est concerné.
Seul `/login` a été mesuré ici — le reste est **à vérifier, non mesuré**.

## Correctif appliqué

**Réserver dans le flux la hauteur que la bannière occupe en `fixed`.**
`ConsentBanner` mesure sa propre hauteur (ResizeObserver) et publie
`--consent-height` sur `documentElement` ; `globals.css` la consomme en
`padding-bottom` sur `body`. Zéro quand la bannière est absente — aucun effet sur
les pages ordinaires.

La hauteur est **mesurée, pas devinée** : la bannière va de 272 à 378 px selon le
retour à la ligne, et elle est d'autant plus haute que l'écran est étroit.

**Pourquoi réserver plutôt que déplacer.** À 320×568, la bannière fait 378 px : il
n'existe aucune disposition où le formulaire (qui se termine à `y = 498`) et une
bannière de bas d'écran tiennent ensemble sans recouvrement. Le défilement est la
seule réponse possible — et c'est précisément ce qui manquait, les conteneurs
d'auth étant `min-h-dvh` sans un pixel de marge.

**Vérification du correctif** — `scripts/dev/diag-consent-reserve.mjs` :

| Viewport | Sans réserve (`SANS_RESERVE=1`)                       | Avec réserve                             |
| -------- | ----------------------------------------------------- | ---------------------------------------- |
| 320×568  | `scrollMax=95`, reçoit `p#consent-body` → **BLOQUÉ**  | `scrollY=458`, bouton `0→40` → **OK**    |
| 390×664  | `scrollMax=0`, reçoit `p#consent-body` → **BLOQUÉ**   | `scrollY=310`, bouton `148→188` → **OK** |
| 430×739  | `scrollMax=0`, reçoit `h2#consent-title` → **BLOQUÉ** | `scrollY=288`, bouton `170→210` → **OK** |
| 390×780  | `scrollMax=0`, reçoit `div` → **BLOQUÉ**              | `scrollY=310` → **OK**                   |
| 412×839  | déjà OK                                               | **OK**                                   |

`scrollMax=0` sans le correctif : la page n'avait **aucune** marge de défilement.
C'est la mesure qui explique pourquoi le bouton était visible, activé, stable —
et hors d'atteinte.

## Le test qui manquait

`e2e/consent-first-visit.spec.ts`, 2 cas, importés du `test` de base de
`@playwright/test` — **jamais** de la fixture partagée. Vérifié sur les trois
projets qui l'exécuteront (`chromium-desktop`, `mobile-safari`, `mobile-chrome`) :
**`6 passed`**.

Il discrimine : neutraliser la réserve à l'exécution ramène 4 viewports sur 5 à
l'état bloqué. Un test qui ne sait pas échouer ne prouve rien.

La doctrine générale qu'il en sort est consignée dans `CLAUDE.md`, section
« Un harnais ment aussi par l'état qu'il installe ».

## Restant à faire, non couvert par ce correctif

1. Réduire la bannière à un bandeau compact sous le seuil `md` — le défilement
   fonctionne, mais 378 px sur un écran de 568 reste beaucoup.
2. Vérifier les autres pages : `ConsentBanner` est monté sur le layout racine,
   seul `/login` a été mesuré.

## Ce qui n'est pas mesuré

- Safari iOS réel (mesuré sous Chromium avec émulation d'appareil ; les hauteurs
  utiles réelles varient avec la barre d'URL, ce qui peut aggraver le cas mais
  pas le corriger).
- Les autres pages que `/login`.
- Le comportement après rotation en paysage.
