# La bannière de consentement empêche la connexion sur téléphone

- **Date** : 2026-07-31
- **Gravité** : bloquant en production, sur tous les iPhone testés
- **Statut** : **documenté, non corrigé** — mérite son propre correctif prioritaire
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

## Pistes, non tranchées

1. Réserver l'espace dans le flux (padding bas sur le `main` tant que la bannière
   est affichée) plutôt que de superposer.
2. Rendre la bannière non bloquante tant qu'elle n'a pas le focus, ou la réduire
   à un bandeau compact sous le seuil `md`.
3. Ajouter **un** test de première visite sans pré-remplissage du consentement,
   sur un projet iPhone — sinon la régression reviendra sans bruit.

## Ce qui n'est pas mesuré

- Safari iOS réel (mesuré sous Chromium avec émulation d'appareil ; les hauteurs
  utiles réelles varient avec la barre d'URL, ce qui peut aggraver le cas mais
  pas le corriger).
- Les autres pages que `/login`.
- Le comportement après rotation en paysage.
