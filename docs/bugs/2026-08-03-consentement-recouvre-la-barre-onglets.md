# La bannière de consentement recouvre la barre d'onglets en PWA installée

**Rapporté** : @thierry, 2026-08-03 — « je ne peux toujours pas naviguer dans
Ankora depuis la PWA installée sur mon iPhone : aucun menu ne s'affiche une fois
connecté ».

**Famille** : identique à
[`2026-07-31-consentement-bloque-login-mobile.md`](2026-07-31-consentement-bloque-login-mobile.md).
Même bannière, même mécanisme d'interception, **deuxième surface**. Le correctif
du 31 juillet a protégé le contenu dans le flux ; il ne pouvait rien pour ce qui
n'y est pas.

---

## Symptôme

PWA installée sur iPhone, utilisateur connecté : aucune navigation. La barre
d'onglets basse n'apparaît pas, et rien ne répond au bas de l'écran.

## Ce que ce n'était PAS

Quatre pistes ont été instruites avant de trouver, et **les quatre sont écartées
par la mesure**, pas par le raisonnement :

| Piste                                        | Verdict                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service worker servant du code périmé        | **Écartée.** `public/sw.js` traite toute navigation en réseau d'abord (`request.mode === 'navigate'` → `fetch` sans repli en cache sauf `/offline`), et `PROTECTED_LOCALED` place `/app` hors du cache. Le seul cache est une liste blanche d'actifs au contenu haché. `skipWaiting()` + `clients.claim()` appliquent toute mise à jour immédiatement. |
| Traitement conditionnel du mode `standalone` | **Écartée.** `display-mode` n'apparaît **nulle part** dans `src/` — 0 occurrence. Aucune règle CSS, aucune branche JS ne distingue la PWA installée du navigateur.                                                                                                                                                                                     |
| `100vh` au lieu de `100dvh`                  | **Écartée.** Aucun `100vh` dans `src/` ; toutes les hauteurs pleines utilisent `dvh`.                                                                                                                                                                                                                                                                  |
| Zones sûres poussant la barre hors champ     | **Écartée par la mesure.** Insets forcés à 34 px via `Emulation.setSafeAreaInsetsOverride` : la barre passe de 49 à 83 px de haut et reste **collée au bord bas** (`top: 761, bottom: 844` pour `vh = 844`). Elle n'est jamais hors champ.                                                                                                             |

## Mesuré

390 × 844, utilisateur connecté, consentement non décidé. Visibilité lue au DOM,
et surtout **atteignabilité** lue par `document.elementFromPoint` au centre de
chaque contrôle — ce que reçoit réellement un doigt, et non ce que dit une boîte
englobante.

| État                        | Barre dans le DOM | Rect                   | Onglets atteignables |
| --------------------------- | ----------------- | ---------------------- | -------------------- |
| Consentement **non décidé** | ✅                | `top 795 → bottom 844` | **0 / 5**            |
| Après décision              | ✅                | identique              | **5 / 5**            |

Les cinq `elementFromPoint` renvoyaient la bannière. **Sur WebKit comme sur
Chromium** — ce n'est pas un défaut de moteur.

La barre était donc présente, visible, correctement positionnée, entièrement dans
le viewport — et intégralement recouverte.

## Cause

- `ConsentBanner` : `fixed inset-x-4 bottom-4 **z-50**`
- `BottomTabBar` : `fixed bottom-0 **z-40**`

La bannière se peint par-dessus la barre et intercepte ses cinq slots.

Le correctif du 31 juillet réserve la hauteur de la bannière par
`body { padding-bottom: var(--consent-height) }`. **Un élément `position: fixed`
est hors flux : il ignore le padding de son conteneur.** La réserve protégeait le
contenu de page ; elle n'a jamais déplacé la barre, ni pu le faire.

## Pourquoi c'est la PWA, et pas le navigateur

`INFÉRÉ`, non mesuré depuis cette machine : une application installée sur iOS
dispose de son propre bac à sable de stockage. Le consentement accepté dans
Safari n'a jamais été vu par l'application installée, qui affiche donc la
bannière à chaque lancement — et seulement là. Le défaut est présent partout ;
c'est l'état de stockage qui décide qui le rencontre.

Cohérent avec le symptôme rapporté, et avec le fait que la barre fonctionne dans
le navigateur du même téléphone.

## Pourquoi la CI ne l'a jamais vu

`e2e/helpers/test.ts:50` pré-remplit `localStorage['ankora.consent.v1']` comme
décidé, pour toute spec qui importe la fixture partagée. `navigation-reachable.spec.ts`
(PR #293) l'importe. Elle ne pouvait donc pas voir la bannière — exactement le
mécanisme documenté dans `CLAUDE.md` § « Un harnais ment aussi par l'état qu'il
installe ».

Deux angles morts supplémentaires du même test :

1. **Bornes verticales absentes.** Il ne vérifie que `left` et `right` ; une barre
   sous le bord bas y aurait compté comme visible.
2. **Présence ≠ atteignabilité.** Aucune vérification par `elementFromPoint`. Un
   contrôle recouvert par un élément `fixed` plus haut dans la pile passait.

## Correctif

`ConsentBanner` reçoit `liftedForBottomBar`, exactement comme `ScrollToTop` depuis
le 2026-05-25 et pour le même motif. Quand la barre est montée, la bannière se
relève de `calc(env(safe-area-inset-bottom) + 4rem)` et retrouve `bottom-4` à
`xl:`, **en même temps** que la barre disparaît (`xl:hidden`). La valeur est
passée depuis `[locale]/layout.tsx`, qui calcule déjà `showBottomTabBar`.

La réserve `--consent-height` est en outre mesurée autrement : la distance du bas
du viewport au haut de la bannière, au lieu de `offsetHeight + 16`. L'ancienne
forme codait en dur le décalage `bottom-4` et serait devenue fausse dès le
relèvement. Elle dépend maintenant de `window.innerHeight`, d'où l'écoute de
`resize` / `orientationchange` que le `ResizeObserver` de la bannière ne couvre
pas.

## Le test qui manquait

`e2e/navigation-usable-first-visit.spec.ts` — importe le `test` de base de
`@playwright/test`, **jamais** la fixture partagée, et le dit en tête de fichier.

Il reproduit l'état d'une PWA fraîchement installée sans rien émuler : session
authentifiée (cookies), puis `localStorage.clear()` — c'est littéralement le bac à
sable vierge. Zones sûres forcées à celles d'un iPhone 14 sous Chromium. Six
largeurs, de 320 à 1280.

Il vérifie l'**atteignabilité** de chaque destination, nomme ce qui la masque, et
porte un garde-fou anti-vacuité : si la bannière ne s'affiche sur aucun écran, il
échoue au lieu de passer au vert en ne démontrant rien.

Vérifié dans les deux sens : correctif retiré, il échoue sur les cinq largeurs où
la barre est montée en nommant `consent-banner` ; correctif remis, il passe.

## Ce qui n'est pas mesuré

- **`display-mode: standalone` n'est pas émulable** dans cette version :
  `Emulation.setEmulatedMedia` avec `features: [{name:'display-mode'}]` est accepté
  par CDP puis ignoré (`matchMedia(…).matches` reste `false` — vérifié). Sans
  conséquence ici puisque rien dans `src/` ne s'en sert, mais si une règle CSS
  venait un jour à s'appuyer dessus, ce test ne la couvrirait pas.
- **Aucune mesure sur matériel iOS réel.** Les zones sûres sont forcées, pas
  natives. Cf. `docs/runbooks/dev-on-iphone.md` pour la validation manuelle.
- **La partition du stockage en PWA installée est inférée**, pas vérifiée depuis
  cette machine.

## Restant à faire, non couvert par ce correctif

- `MoreSheet` est également `z-50`, comme la bannière. Les deux ne peuvent pas
  être ouverts en même temps aujourd'hui (la bannière masque le déclencheur), mais
  la pile n'a pas d'ordre déclaré entre eux — à trancher si l'un des deux bouge.
