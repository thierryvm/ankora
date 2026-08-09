# Les trois en-têtes « collants » du site ne collaient nulle part

**Signalé** le 9 août 2026 par @thierry, sur iPhone réel, en PWA installée.
**Présent depuis** le 4 mai 2026 (`cf67a18`, PR #111). **Trois mois.**
**Corrigé** le 10 août 2026.

## Le symptôme, dans les mots de qui l'a vu

> « toute la page sur pwa remonte avec le menu burger, donc le menu de la page
> d'accueil n'est pas sticky »

Et, quelques minutes plus tard, la précision qui a tout résolu :

> « si j'ouvre l'application et que la page est à son niveau haut max, l'heure et
> le reste est lisible ; si je scrolle normalement, tout le contenu passe en
> dessous des icônes, heures etc de la zone safe »

## Deux symptômes, un seul défaut

Le second semblait indépendant : du contenu passant sous la barre de statut iOS,
rendant l'heure illisible. Une hypothèse de contraste s'imposait — la landing
venait de passer au papier clair avec L2, et la barre de statut est déclarée
`black-translucent`, donc en glyphes blancs. Blanc sur papier : crédible.

**Elle a été écartée par la mesure, pas par l'avis.** @thierry était en thème
**sombre**, où la portée papier ne s'applique pas
(`html:not([data-theme='dark'])`), et il observait le défaut **dans les deux
thèmes**. Un défaut de contraste dépend du thème ; celui-ci n'en dépendait pas.

Une prédiction a alors été posée : _si l'en-tête inerte est la cause, la barre de
statut doit être lisible tant qu'on n'a pas défilé_ — puisqu'en haut de page
c'est encore l'en-tête, avec son fond et sa réserve `env(safe-area-inset-top)`,
qui occupe la zone. La contre-épreuve sur l'appareil l'a confirmée mot pour mot.
Un seul correctif ferme les deux.

## La cause

`src/app/globals.css` déclarait `overflow-x: hidden` sur `html` et sur `body`.

CSS Overflow 3 : quand un axe n'est ni `visible` ni `clip` et que l'autre est
`visible`, ce dernier calcule à `auto`. Donc `overflow-x: hidden` promouvait
silencieusement `overflow-y` à `auto`, et faisait de `html` **et** `body` des
conteneurs de défilement. Un descendant `position: sticky` résout alors son
_scrollport_ sur `body` — qui ne défile pas lui-même, c'est la fenêtre qui
défile. Il n'a plus rien à quoi se coller.

Mesuré au harnais Playwright **WebKit** (le moteur d'iPhone), A/B dans le même
chargement de page, défilement programmatique de 900 px :

| Variante  | `body` overflow       | `header` top après 900 px | Débordement horizontal |
| --------- | --------------------- | ------------------------- | ---------------------- |
| `hidden`  | `hidden` / `auto`     | **−900 px**               | 0 px                   |
| `clip`    | `clip` / `visible`    | **0 px**                  | 0 px                   |
| `visible` | `visible` / `visible` | 0 px                      | 0 px                   |

Identique sur iPhone 14 (390 px) et iPhone SE (320 px), sur `/` (`MktNav`) et
`/faq` (`Header`).

## Portée

Trois en-têtes déclarent `sticky top-0`. Aucun ne tenait :

- `MktNav.tsx:46` — la landing
- `Header.tsx:95` — toutes les autres pages publiques
- `AdminTopbar.tsx:30` — l'admin

Le menu du bas de l'app est `fixed`, pas `sticky` : immunisé. C'est pourquoi
@thierry le voyait tenir pendant que l'autre lâchait — une observation qui
pointait déjà la bonne famille de causes.

## Le correctif

`overflow-x: clip` sur `html` et `body`. `clip` ne crée pas de conteneur de
défilement, donc pas de promotion, donc la chaîne `sticky` est rétablie. Et il
clippe au moins aussi fermement que `hidden` : il interdit jusqu'au défilement
programmatique. La garde anti-débordement de mai est **conservée**, pas levée.

Plancher de support : Safari 16+, Chrome 90+, Firefox 81+. En dessous, la
déclaration est ignorée et la garde ne s'affaiblit pas — elle **disparaît**.
Risque résiduel assumé : le débordement mesuré est de 0 px sur les trois presets
iPhone, et la régression `sticky` était certaine là où ce repli est hypothétique.

## Pourquoi rien n'a rougi pendant trois mois

`sticky` était **déclaré** dans le balisage. Toute vérification qui lit la source
— relecture humaine, agent QA, test sur `className`, `getComputedStyle().position`
— voyait `sticky` et donnait son accord. La propriété calculée valait bien
`sticky` : elle n'a jamais menti. Ce qui manquait, c'est que **personne ne
défilait**.

Un mécanisme déclaré n'est pas un mécanisme qui marche. La seule preuve possible
était de la géométrie **après mouvement**, dans un vrai moteur.

Et une phrase non vérifiée a fait deux dégâts d'un coup. Le 4 mai, un commentaire
affirmait que « Playwright WebKit renvoie toujours `overflowX === 'visible'`,
quelle que soit la règle ». Cette phrase a (1) endormi le test qui surveillait
cette propriété et (2) fait écarter `clip` au profit de `hidden` dans le CSS.
Re-mesurée le 9 août : elle est fausse — WebKit renvoie `hidden`, puis `clip`.

## Ce que la correction embarque

- `globals.css` — `hidden` → `clip` sur `html` et `body`, commentaire réécrit
  avec la mesure, sa date et son moteur.
- `e2e/mobile-ios/sticky-header.spec.ts` — **nouvelle**, défile puis mesure la
  géométrie. Elle porte un garde-fou d'instrument : si la page n'a pas défilé,
  elle échoue en le disant, plutôt que de rendre vert par accident.
- `e2e/mobile-ios/landing.spec.ts` — les **deux** `test.fixme` levés, avec la
  mesure qui contredit leur motif.
- `src/app/[locale]/layout.tsx` — commentaire réécrit ; il justifiait `hidden`
  par la fausse prémisse, et contenait « `overflow-x-clip` (rather than
  `overflow-x-clip`) ».
- `.claude/agents/mobile-ios-auditor.md` — il exigeait « `overflow-x: hidden`
  (or `overflow-x-clip`) », donc il aurait validé l'état cassé.
- Planchers : **231 → 241**, mesuré dans les deux sens.

## Correctif adjacent, trouvé au passage

Sur demande de @thierry de relever le panneau Problèmes de l'éditeur : `.glass`
annulait `backdrop-filter` sous `prefers-reduced-transparency` **sans** annuler
`-webkit-backdrop-filter`, déclaré trois lignes plus haut. Sur Safari et iOS, le
flou restait donc actif pour les personnes qui avaient explicitement demandé de
le retirer. `.surface-overlay` annulait bien les deux ; `.glass` était le seul
écart. Même famille que le défaut principal : un garde-fou déclaré qui ne fait
rien.

## Reste ouvert

- **Contre-épreuve @thierry** après déploiement : l'heure reste-t-elle lisible au
  défilement ? Si non, `statusBarStyle: 'black-translucent'` redevient suspect et
  se mesure à part. Il n'est pas touché ici : la barre est lisible en haut de
  page, donc le réglage n'est pas en cause.
- **`e2e/mobile-ios/dashboard.spec.ts` ne s'exécute nulle part** — ni dans le job
  public (il saute), ni dans l'authentifié (aucun marqueur de découverte, donc
  absent de `authenticated-specs.json`). Son assertion de débordement sur `/app`
  ne prouve rien. Trou préexistant, hors périmètre, → ticket.
- **`documentElement.scrollWidth` est une sonde aveugle** : falsifiée avec un
  élément 200 px trop large, elle ne bouge ni sous `hidden` ni sous `clip`
  (`body.scrollWidth`, elle, détecte). Trois assertions du dépôt reposent
  dessus. Préexistant, à ré-ancrer sur le signal UX. → ticket.
