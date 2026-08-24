# PR cockpit 0 — la grammaire visuelle

> Première des quatre PR de la refonte du cockpit (direction E). Elle ne change
> aucune mise en page et n'ajoute aucun composant : elle pose les **jetons** dont
> les trois suivantes ont besoin.

## Ce qui change, et pourquoi

### 1. Le mode sombre avait trois crans d'élévation pour quatre jetons

`--color-surface-soft` et `--color-surface-muted` portaient **la même valeur**
(`#0f172a`), alors qu'elles diffèrent en mode clair. Or en sombre une ombre ne se
voit pas : l'élévation y repose **entièrement** sur l'écart entre surfaces. Un
cran perdu là où c'est le seul moyen disponible, c'est la cause mesurable de la
platitude du cockpit dans ce thème.

`--color-surface-muted` prend `#070c18`. **Elle descend, elle ne monte pas** — et
c'est le point où la première version de ce chantier s'est trompée. Le raisonnement
« s'écarter d'un fond de nuit, c'est éclaircir » tient en l'air et pas contre les
usages : ce jeton est un **fond de piste**, la rainure de `progress`, `PaceBar`,
`AllocationBar`, et le rail sous un curseur `bg-card` dans `LocaleSwitcher`. Une
piste plus claire que son curseur se lit à l'envers.

La valeur n'est pas choisie à l'œil : elle reproduit la relation curseur/piste que
le thème clair porte déjà — **1,127** contre 1,130. Cette séparation vaut **1,030**
aujourd'hui, un défaut que `LocaleSwitcher` compense déjà par un liseré. La
compensation reste ; ce qu'elle compense diminue.

Conséquence : l'échelle est **identique dans les deux thèmes**,
`muted < background < soft < card`, donc l'assertion d'ordre existante se recopie
au lieu de s'inverser.

### 2. La « palette de catégories » n'en était pas une

Les huit valeurs de `categories.color_token` sont les **jetons sémantiques
empruntés** : `emerald` → succès, `amber` → avertissement, `rose` → danger,
`blue` → information. Et l'un d'eux est un mélange **vers** `--color-card`, qui ne
peut donc jamais atteindre 3:1 **contre** cette carte.

Deux conséquences pour la suite : un anneau de répartition peint dans ces jetons
serait illisible sur sa propre carte, et il **jugerait** — « Courses » en vert,
« Loyer » en rouge, une appréciation par pigment sans étiquette pour la démentir.

D'où une **rampe graphique** dédiée : six teintes partagées entre les deux thèmes
(une catégorie garde son identité, seule la clarté change) plus un neutre pour
« Autres », qui est un résidu et non une catégorie.

Elle a été cherchée par balayage OKLCH puis **mesurée**, pas composée à l'œil :

- **Contraste 1.4.11** contre les **quatre** surfaces, dans les deux thèmes :
  **3,85:1** au pire en clair, **6,76:1** en sombre. Seuil 3:1.
- **Séparation mutuelle** : dE **13,1** (clair) / **12,8** (sombre) en OKLab ×100.

Le second chiffre est **sous** la cible de 15 souvent citée pour la vision
normale, et c'est écrit tel quel plutôt qu'ajusté jusqu'à ce qu'un seuil
s'allume : la lisibilité de l'anneau ne reposera pas sur la couleur seule — arcs
séparés par un écart de fond, six au maximum, et une légende qui porte libellé,
montant et part.

**Ce qui a été abandonné en chemin, et pourquoi c'est utile de le dire** : une
première contrainte exigeait que chaque teinte reste loin des jetons d'état.
Mesurée, elle ne laissait que **28 teintes admissibles sur 120**, toutes violettes
ou magenta, **aucun orange** — parce qu'en sombre les couleurs d'état sont claires
et saturées et occupent la bande utile. La vraie exigence n'est pas la distance,
c'est l'**identité** : la rampe a ses propres jetons, donc retoucher
`--color-warning` demain ne repeindra aucune catégorie. C'est ce que le test
asserte.

### 3. La primitive `Card`

`shadow-sm` → `shadow-md`. Aucun changement de géométrie : ni rayon, ni bordure,
ni espacement. En clair la carte se décolle vraiment du papier ; en sombre l'ombre
reste invisible et le travail est fait par le point 1.

## Ce qui n'est PAS fait

`categories.color_token` n'est pas migré. La colonne, sa contrainte en base et les
18 catégories semées ne bougent pas. La rampe sert les **surfaces de données**, pas
l'identité d'une catégorie.

**Dette assumée et nommée** : la pastille d'une catégorie dans la feuille ⊕ et son
futur arc dans l'anneau n'auront pas la même couleur. Ce n'est pas bloquant — la
couleur n'est jamais le seul canal — mais ce n'est pas invisible non plus, et il
vaut mieux l'écrire que le laisser découvrir.

## Preuves

| Porte                        | Résultat                                                   |
| ---------------------------- | ---------------------------------------------------------- |
| `lint`                       | 0 erreur                                                   |
| `lint:use-server`            | ✅                                                         |
| `typecheck`                  | 0 erreur                                                   |
| `test`                       | 2373 passés, dont **26 neufs** sur la rampe et l'élévation |
| `build`                      | succès                                                     |
| `npm run dev` + page chargée | **HTTP 200**, **0 erreur de compilation**                  |

**Mesure au DOM plutôt qu'à l'œil**, dans un navigateur réel, aux deux thèmes :

- quatre luminances **distinctes** et dans l'ordre `muted < background < soft < card` ;
- les **sept** jetons de rampe rendus ;
- ombre calculée de la carte = `--shadow-md` (`0 4px 12px`, `0 2px 4px`), rayon
  inchangé à 16 px.

Captures 390 × 844 en clair et en sombre.

**Erreurs console : aucune de l'application.** Les seize violations CSP relevées
proviennent de `<nextjs-portal>` et du script de l'overlay de développement —
outillage Next.js, absent d'un build de production. Vérifié en listant les
éléments porteurs d'un attribut `style` : il y en a deux, les deux appartiennent à
l'outillage. Le WebSocket HMR en échec est du même ordre.

## Pièges d'instrument rencontrés

Trois, et tous trois auraient produit un rapport de défaut contre un code sain :

1. **Ma sonde comparait l'ordre mesuré à un tableau écrit dans l'ordre de
   déclaration**, pas dans l'ordre attendu. Elle rendait « NON » sur un CSS
   correct, dans les deux thèmes.
2. **`getPropertyValue` rend `#fff` là où le CSS écrit `#ffffff`.** Une luminance
   calculée sur trois chiffres donne 0,0756 au lieu de 1,0 — la carte blanche
   passait pour la surface la plus sombre.
3. **Les crochets de `[locale]` sont un motif pour PowerShell.** `Get-Content`
   sans `-LiteralPath` ne lit aucun fichier et rend une liste vide, qui se lit
   « rien ne correspond » au lieu de « je n'ai rien lu ».

## Planchers e2e

Inchangés : **268** public, **62** authentifié. Aucune spec ajoutée ni retirée,
aucun testid touché.
