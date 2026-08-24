# Cockpit `/app` — refonte direction E · plan d'intégration

> État final du 24 août 2026, après **six tours** de `plan-reviewer` : v1
> rejetée, v2 à v5 approuvées sous réserves, puis une revue ciblée sur les deux
> sections qui bloquaient encore la PR 0. Verdict : **GO**.
> Base `main` = `cc02e1b` (#448 mergée). Branche `feat/cc-design-cockpit`.

## 0. Phase 0

- Modèle actif : **Opus 5**.
- **L'épinglage du modèle n'est PAS en vigueur dans ce worktree.**
  `.claude/settings.local.json` est gitignoré : il ne vit que dans le clone
  principal (`:191` porte `"model": "opus"`), et `git worktree add` ne copie pas
  les fichiers ignorés. Le copier serait une modification silencieuse de
  configuration d'agent, ce que la liste bannie interdit — le fait est donc
  **signalé à @thierry**, à qui la décision revient. Garde-fou effectif en
  attendant : la vérification Phase 0 en tête de session, faite à la main.
- Branche ≠ `main`. `.env.local` absent du worktree, `supabase/.temp/project-ref`
  propre au worktree.

## 1. Prérequis

### 1.1 PR #448 — **fait**

`e2e/mobile-ios/dashboard.spec.ts` et `auth-flow.spec.ts` n'étaient pas
découvertes par le sélecteur de specs authentifiées. À leur première exécution,
trois cas ont rougi ; les trois étaient des défauts de **test**, aucun n'était un
défaut de l'application. Corrigés, mergée.

**Plancher authentifié : 50 → 62** (run `32739812967`). Public inchangé à 268.
**[F8]** Les deux mesures portent désormais leur run : 50 sur `32671263834`, 62
sur `32739812967`.

### 1.2 PR 0 — la grammaire visuelle **[F4]**

**Constat mesuré.** Les jetons existent et sont bons ; le défaut est que **tout
est au même niveau** — `card.tsx:9` rend uniformément le même rayon, la même
bordure et la même ombre. Et le mode sombre a moins de crans que le clair :

| Jeton                   | Clair     | Sombre    |
| ----------------------- | --------- | --------- |
| `--color-background`    | `#faf9f6` | `#0b1120` |
| `--color-card`          | `#ffffff` | `#111a2e` |
| `--color-surface-soft`  | `#fbfaf7` | `#0f172a` |
| `--color-surface-muted` | `#f3f1ea` | `#0f172a` |

Quatre valeurs en clair, **trois en sombre** : `surface-soft` et `surface-muted`
y sont confondues. En sombre l'ombre ne se voit pas — l'élévation ne peut reposer
que sur des surfaces, précisément celles qui se sont effondrées.

#### (a) Élévation — **une seule valeur change**

**Les valeurs claires ne bougent pas** : `contrast-ratios.test.ts:302-303` les
épingle au littéral, et rien dans le constat ci-dessus ne les met en cause.

En sombre, `--color-surface-muted` quitte la valeur qu'il partageait avec
`--color-surface-soft` :

| Jeton                   | Sombre, avant | Sombre, après |
| ----------------------- | ------------- | ------------- |
| `--color-background`    | `#0b1120`     | inchangé      |
| `--color-surface-soft`  | `#0f172a`     | inchangé      |
| `--color-card`          | `#111a2e`     | inchangé      |
| `--color-surface-muted` | `#0f172a`     | **`#070c18`** |

**`surface-muted` est un FOND DE PISTE, pas une teinte de survol** — et c'est ce
qui fixe la direction. Relevé sur les usages : `progress.tsx:95`, `PaceBar.tsx:76`,
`AllocationBar.tsx:48`, `loading.tsx:56` sont des rainures, et
`LocaleSwitcher.tsx:101` en fait la **piste** d'un contrôle segmenté dont le
curseur est `bg-card` (`:128`). Une piste plus claire que son curseur se lit à
l'envers.

Une première version de ce plan proposait `#1c2743`, plus **clair** que la carte,
au motif que « s'écarter d'un fond de nuit, c'est éclaircir ». La métaphore tient
en l'air et pas contre les call-sites : elle aurait inversé quatre barres de
progression et un contrôle segmenté, et l'assertion de test qu'elle exigeait
aurait **verrouillé** l'inversion en disant au prochain lecteur de ne pas la
corriger.

**L'échelle est donc identique dans les deux thèmes**, mesuré :
`surface-muted` < `background` < `surface-soft` < `card`.
Conséquence : l'assertion `:366-376` **se recopie telle quelle** au sombre. Il n'y
a plus de piège à documenter, et le paragraphe qui le défendait disparaît avec.

**Pourquoi `#070c18` plutôt qu'une autre valeur sombre.** Le thème clair porte
déjà la relation juste : curseur `#ffffff` sur piste `#f3f1ea` = **1,130**, et
piste sur fond de page = 1,073. En sombre, `#070c18` donne **1,127** et 1,038 —
le sombre reçoit la relation que le clair a déjà, au lieu d'une valeur choisie au
goût. Aujourd'hui cette séparation vaut **1,030**, et `LocaleSwitcher.tsx:123-127`
documente ce défaut de sa propre main (« la couleur ne peut pas porter l'état
seule »), en compensant par un liseré. La compensation reste ; le défaut qu'elle
compensait diminue.

#### (b) Une rampe graphique — la décision, et ses valeurs mesurées

`AddExpenseSheet.tsx:107-116` (`CHIP_DOT`) révèle que la « palette de
catégories » **n'en est pas une** : c'est la palette **sémantique empruntée** —
`emerald` → `bg-success`, `amber` → `bg-warning`, `rose` → `bg-danger`,
`blue` → `bg-info`. Et `pink` (`:113`) n'est pas un jeton, c'est un `color-mix`
vers `--color-card`.

Trois conséquences, toutes bloquantes pour l'anneau :

1. **Contraste impossible.** Un arc défini comme un mélange **vers la carte** ne
   peut pas atteindre 3:1 **contre cette carte**.
2. **Un anneau peint en success / warning / danger JUGE.** Sur une pastille de
   8 px personne ne le lit ; sur un anneau qui occupe le tiers de l'écran, si.
3. **Le §8 exige des jetons de `globals.css`**, et cette palette n'y est pas.

**La rampe retenue**, cherchée par balayage OKLCH puis mesurée. Sept jetons,
**six teintes partagées entre les deux thèmes** — une catégorie ne change pas
d'identité selon le thème — plus un neutre pour « Autres » :

| Jeton                | Rôle               | Clair     | Sombre    |
| -------------------- | ------------------ | --------- | --------- |
| `--color-graph-1`    | orange             | `#bd4d00` | `#fb864d` |
| `--color-graph-2`    | or                 | `#6d5d14` | `#d6b603` |
| `--color-graph-3`    | vert               | `#138c35` | `#76e085` |
| `--color-graph-4`    | bleu               | `#1880a0` | `#60d4fe` |
| `--color-graph-5`    | violet             | `#6943ab` | `#b595fd` |
| `--color-graph-6`    | framboise          | `#9b2a68` | `#f47cb7` |
| `--color-graph-rest` | « Autres », neutre | `#475569` | `#94a3b8` |

**Ce qui est mesuré, et ce qui ne l'est pas.**

- **Contraste 1.4.11 tenu partout — et le chiffre juste est 3,85, pas 4,13.**
  La mesure annoncée en v5 portait sur **trois** surfaces et oubliait
  `--color-surface-muted`. Contre **les quatre**, dans les deux thèmes :
  **3,85:1** au pire, `graph-3` (`#138c35`) sur `#f3f1ea` en clair ; **6,76:1**
  au pire en sombre (`graph-rest` sur `card`). Le seuil est 3:1, donc c'est tenu —
  mais la marge réelle en clair est de 28 %, pas de 38 %, et une marge annoncée
  trop haute est ce qui fait accepter la retouche de trop.
  Aucun arc n'est censé se poser sur `surface-muted`, qui est un fond de piste
  (§1.2a) : le chiffre est donné quand même, parce qu'un seuil mesuré sur les
  seules surfaces qu'on croit utiliser n'est pas un seuil.
- **Séparation mutuelle : pire paire dE = 13,1 (clair) / 12,8 (sombre)** en
  OKLab ×100. C'est **au-dessus** du plancher de 8 pour la vision des couleurs
  déficiente, et **en dessous** de la cible de 15 pour la vision normale. Le
  chiffre est écrit tel quel plutôt qu'ajusté à un seuil : la compensation est
  structurelle et explicite — les arcs sont **séparés par un écart de fond** donc
  jamais adjacents, six au maximum, et la légende porte l'information en clair
  (§5.2). Si @thierry préfère une séparation plus franche, le levier est de
  descendre à quatre arcs plus « Autres », pas de retoucher les teintes.
- **Pourquoi la rampe ne fuit pas les jetons d'état.** J'avais d'abord exigé une
  distance minimale de 15 avec `success`/`warning`/`danger`/`info`/`accent`/`brand`.
  **Cette contrainte est insatisfiable et elle était de mon invention** : mesurée,
  elle ne laissait que 28 teintes admissibles sur 120, toutes violettes ou
  magenta, **aucun orange** — parce qu'en sombre les jetons d'état sont clairs et
  saturés et occupent la bande dont une rampe catégorielle a besoin. La vraie
  exigence n'est pas la distance, c'est **l'identité** : la rampe a ses propres
  jetons, donc un changement futur de `--color-warning` ne repeint aucune
  catégorie. Un arc et une pastille d'état ne se côtoient jamais dans un même
  objet graphique.
- **Format** : hex `#RRGGBB`, jamais `oklch()` ni `color-mix()` — `tokenIn`
  (`contrast-ratios.test.ts:106-111`) n'accepte que cette forme, et sans elle les
  assertions de contraste sont inécrivables.

#### (d) Les fichiers de la PR 0 — nommés, comme ceux de la PR 1

| Fichier                                     | Ce qui y change                                                    |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `src/app/globals.css`                       | `--color-surface-muted` sombre ; 14 jetons de rampe (7 × 2 thèmes) |
| `src/app/__tests__/contrast-ratios.test.ts` | les quatre familles d'assertions du §1.2(c)                        |
| `src/components/ui/card.tsx`                | l'échelle d'élévation appliquée à la primitive                     |

**Aucun quatrième fichier caché** : `globals-tokens.test.ts` n'épingle ni
`surface-soft` ni `surface-muted`, et ne compte pas les déclarations — les jetons
neufs ne l'obligent à rien.

**Ce qui n'est PAS fait** : migrer `categories.color_token`. La colonne, sa
contrainte et les 18 catégories semées ne bougent pas.

**L'incohérence que cela laisse, nommée plutôt que tue** : dans la feuille ⊕
« Courses » porte le jeton de succès (`AddExpenseSheet.tsx:110`) ; dans l'anneau
elle portera une teinte de la rampe. Même catégorie, deux couleurs, deux écrans.
Ce n'est pas bloquant — la couleur n'est jamais le seul canal et l'information
vit dans la légende — mais c'est une dette, tracée, et non un choix invisible.

#### (c) Preuves — et pourquoi celles de la v4 n'en étaient pas **[F4]**

La v4 affirmait que `contrast-ratios.test.ts` « ne regarde jamais `surface-soft`
ni `surface-muted` ». **C'est faux** : `:342-364` les teste contre
`--color-foreground` et `--color-muted-foreground`, et `:366-376` asserte que
`surface-soft` est plus claire que `surface-muted`. La phrase juste est : **le
trou est en mode sombre**, où aucune paire ne porte sur ces deux jetons — c'est-à-dire
exactement le thème que la PR 0 modifie.

À ajouter au test :

- **l'ordre d'élévation en sombre**, dans le **même** sens que le clair (§1.2a) —
  l'assertion `:366-376` se recopie. Sans elle, séparer les deux valeurs laisse
  passer le défaut « on échange les deux teintes, tous les ratios restent AA » que
  ce test existe pour attraper, dans le seul thème que la PR 0 modifie ;
- `--color-foreground` et `--color-muted-foreground` contre `#070c18`, à 4,5:1.
  Mesuré : **13,16:1** au pire des deux, il n'y a donc pas de surprise à attendre,
  ce qui est une raison d'écrire l'assertion et non de s'en passer ;
- les **sept valeurs de la rampe** contre **les quatre surfaces**, dans les deux
  thèmes, à 3:1 ;
- **une assertion de séparation par paires** — et c'est ce fichier lui-même qui
  l'exige. `contrast-ratios.test.ts:193-206` raconte, mot pour mot, qu'une
  décision de couleur sans test a laissé ADR-035 atteindre AA « sans remarquer
  qu'il avait fait tomber la séparation à 1,03 ». Poser un plancher de séparation
  mesuré à 13,1 / 12,8 et n'asserter que le 3:1 reproduirait exactement ce défaut
  au prochain ajustement de teinte. L'assertion porte sur **toutes les paires**
  de la rampe, dans les deux thèmes, avec le plancher écrit dans le test.

**Correction d'un motif faux de la v5** : j'attribuais à `:327-331` d'interdire
qu'une valeur claire apparaisse dans le bloc sombre _en général_. Ce test itère en
réalité sur les seules six valeurs de `DIRECTION_A` et ne contraint aucun jeton de
rampe. La conclusion reste vraie — la rampe est déclarée dans **les deux** blocs,
jamais héritée — mais elle tient parce qu'un jeton non redéclaré garderait sa
valeur claire sur fond de nuit, pas parce qu'un test l'interdirait aujourd'hui.

Et **`ring-offset-surface-soft`** (`AddExpenseSheet.tsx:812`) porte l'anneau de
focus des pastilles de couleur : changer `--color-surface-soft` en sombre déplace
une surface de **visibilité du focus**. Elle figure dans les captures avant/après.

## 2. Direction visuelle — emprunté, refusé

**Emprunté** : l'élévation à trois crans (PR 0) ; l'anneau à la place de la barre
empilée (§5.2) ; le dégradé sous la courbe, en `linearGradient` SVG ; l'anneau
épais segmenté pour les provisions ; la **pastille en tête de ligne** — voir §5.6
pour ce qu'elle peut réellement porter.

**Refusé** : l'anneau comme forme du héros (il explique une composante, la courbe
reste la réponse) ; les phrases de félicitation ; le sombre exclusif ; l'encodage
par la couleur seule ; les écrans de conseil en placement (FSMA).

## 3. Périmètre **[F1, F2]**

**Hors périmètre** : la navigation, les cinq autres pages, `.husky/`, les
workflows GHA, les migrations, `SimulatorDrawer`.

**Dans le périmètre, par exception motivée** (§7) — **sept fichiers**, pas cinq :

| Fichier                                                      | Pourquoi                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/expenses/optimistic-spend.ts`                       | le magasin passe d'une figure à un couple                                                                                             |
| `src/components/expenses/AddExpenseSheet.tsx`                | seul appelant de `announceOptimisticValue` (`:370`) — **chemin corrigé**, la v4 le plaçait sous `app/[locale]/app/expenses/`          |
| `src/lib/actions/expense-entry.ts`                           | fichier `'use server'` — construit le contexte (`:47-60`), qui ne rend **pas** « Dépensé ce mois »                                    |
| `src/lib/actions/expense-entry.types.ts`                     | le type du contexte (règle 9)                                                                                                         |
| `src/components/dashboard/HeroAmount.tsx`                    | **omis par la v4.** Changer `pending` change la signature de `useOptimisticValue()` (`optimistic-spend.ts:105`) : `:6`, `:93`, `:106` |
| `src/components/dashboard/__tests__/HeroAmount.test.tsx`     | **omis par la v4.** `:125`, `:150`, `:166`, `:183`, `:197` appellent `announceOptimisticValue` avec un scalaire                       |
| `src/components/expenses/__tests__/AddExpenseSheet.test.tsx` | **existe** ; `:299` asserte `toHaveBeenCalledWith(<scalaire>)`                                                                        |
| `src/lib/expenses/__tests__/optimistic-spend.test.ts`        | **À CRÉER** — voir ci-dessous                                                                                                         |
| `src/lib/actions/__tests__/expense-entry.test.ts`            | **À CRÉER** — voir ci-dessous                                                                                                         |

**Neuf fichiers, comptés un par un.** La v5 annonçait « sept » puis nommait six
lignes et un fourre-tout « les tests des trois premiers » — un décompte qui ne se
vérifie pas ne sert à rien. Et le vérifier a rendu autre chose.

**Aucun des deux n'a de test DÉDIÉ**, vérifié : ni `src/lib/expenses/__tests__/`,
ni une entrée `expense-entry` dans `src/lib/actions/__tests__/` (qui en compte
neuf autres).

**Mais le risque n'est pas le même des deux côtés, et l'écrire trop fort serait
faux.** `HeroAmount.test.tsx` importe le **vrai** magasin — pas un mock — et le
réinitialise à chaque cas : il exerce déjà l'idempotence image par image
(`:147-161`) et le garde `Number.isFinite` (`:178-192`), c'est-à-dire précisément
les deux propriétés que le passage au couple doit conserver. `optimistic-spend.ts`
est donc couvert **de biais**. `expense-entry.ts`, lui, ne l'est pas du tout.

Ces deux tests sont donc **créés d'abord**, contre le comportement actuel, et vus
verts **avant** que la forme change. Un test écrit après la modification prouve
que le nouveau code fait ce que le nouveau code fait ; écrit avant, il prouve que
le comportement a survécu.

`AddExpenseSheetProps` vaut `{ open, onClose }` (`:144-147`) : la feuille ne
reçoit aucune donnée en props, tout vient du contexte.

## 4. Découpage

| PR                                     | Contenu                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — grammaire visuelle**             | élévation, surfaces sombres séparées, rampe graphique, `Card`, paires de contraste neuves                                                            |
| **1 — le pli mobile**                  | `StatusChip`, `MonthCurve`, hero recomposé, 3 tuiles, agrégateur par jour, correction FSMA, couple optimiste                                         |
| **3-bis — documentaire**               | `.claude/skills/ankora-design-system/SKILL.md`, **après** la PR 3                                                                                    |
| **2 — colonne gauche + grille bureau** | `CategoryDonut`, `MonthsAhead`, blocs Dépensé / Comptes / Six mois, grille 7/5, deux lectures neuves                                                 |
| **3 — colonne droite + ménage**        | `DaysStrip`, `Ring`, `Segments`, `RowGlyph`, blocs Ce qui arrive / Provisions / Engagement / Dernières sorties, purge i18n, suppressions e2e écrites |

**PR 3-bis, et pourquoi elle a glissé de la place 1-bis.** `SKILL.md:101`
**prescrit** `PaceBar`, et `:173` liste `PaceBar`, `AllocationBar`,
`ProvisionHealthGaugeCard` et `ProchainesFacturesCard` comme les composants qui
rendent le cockpit. La v5 plaçait la PR documentaire juste après la PR 1, en
n'y voyant que la moitié `PaceBar` — mais **les PR 2 et 3 invalident les trois
autres** (`Ring`, `Segments`, `DaysStrip`, « Ce qui arrive »). Corriger après la
PR 1 aurait donc produit un document faux à nouveau dès la PR 2, et la « fenêtre
de quelques heures » annoncée au risque 7 aurait duré toute la refonte.

Une seule PR documentaire, **après la PR 3**, quand la liste est stable. C'est un
fichier de garde-fou : il ne voyage pas dans une PR feature.

**Recherche de bannissement faite** : hors `src/`, seuls `SKILL.md:101` et `:173`,
plus `docs/prs/PR-chantier2-report.md:102,370` (rapport daté, en prose, aucune
édition due).

## 5. Le domaine

### 5.1 `depensesParJour(expenses, ref, joursDuMois)`

Pure, `src/lib/domain/cockpit/`, aucun import Supabase. La période de référence
est un paramètre : `month-situation.ts:158` refiltre délibérément par
`snapshot.currentPeriod`.

**Invariant testé** : le cumulé au dernier jour écoulé **égale
`situation.depensesDuMois` au centime**.

### 5.2 `depensesParCategorie` et l'anneau **[F5, F6]**

L'anneau est retenu **à la place de la barre empilée que la v2 proposait** —
`CategoryBar` n'a jamais existé dans le dépôt.

**Le motif chiffré** : 8 jetons (`domain/categories/types.ts:42-51`) pour **18
catégories semées**, et `couleur.ts:16` documente que `pink` et `amber` en
portent 3 chacun. Un `color_token` ne peut pas distinguer les postes.

**Les couleurs viennent de la rampe de la PR 0**, jamais de
`categories.color_token`. Un arc est une **surface de données**.

**[F6] La règle d'affectation, et la phrase qui va avec.** La teinte suit le
**rang dans la vue courante** : le 1er poste prend `graph-1`, le 2ᵉ `graph-2`,
etc., « Autres » prend `graph-rest`.

Conséquence assumée et écrite à l'écran comme dans le code : **la couleur d'un
arc ne porte aucune identité — la légende seule identifie.** Une catégorie peut
donc changer de teinte d'un mois à l'autre si son rang change. L'alternative —
une teinte stable par catégorie — est **impossible** : 18 catégories et plus, six
teintes, donc des collisions, donc deux arcs voisins de même couleur. Entre une
couleur qui bouge et deux arcs qu'on ne distingue pas, la première est un
inconfort, la seconde un défaut d'accessibilité.

Cela ne contredit pas `couleur.ts:26-28`, qui promet la stabilité de la **pastille
d'une catégorie** — un objet d'identité. L'arc n'en est pas un, et le plan le dit
au même endroit que la règle.

**Le cas le plus visible n'est pas mensuel, il est immédiat.** L'anneau vit sur
`/app`, et la PR 1 fait revalider le tableau de bord au ⊕ : une saisie qui fait
passer un poste devant un autre **repeint deux arcs sous les yeux du lecteur, sur
le même écran**. C'est plus troublant qu'un changement d'un mois à l'autre, et
c'est assumé — parce que la seule façon de l'éviter serait la teinte par identité,
que six couleurs pour dix-huit catégories rendent impossible. La légende, elle, ne
bouge pas : les libellés et les montants restent lisibles pendant que les teintes
s'échangent, ce qui est exactement la raison pour laquelle l'information vit là et
non dans la couleur.

**[F5] Sept parts, six teintes — comment ça tombe juste.** « Sans catégorie » est
un poste **comme un autre** : il concourt dans le top 5 avec son total réel. S'il
passe sous l'angle minimum, il rejoint « Autres », exactement comme n'importe
quel autre poste — ce qui **ne le rend pas silencieux** : « Autres » est étiqueté,
chiffré, et porte le décompte des postes qu'il agrège. Σ(parts) = « Dépensé ce
mois » tient dans tous les cas, ce qui est la seule chose que la règle 10 exige.
Six teintes suffisent donc : cinq rangs plus le neutre.

**Géométrie — le plafond porte sur le nombre d'arcs, pas sur leur angle.** Le
top 5 plus « Autres » borne le nombre à six, pas la taille : le 5ᵉ peut valoir
0,4 %.
`AllocationBar.tsx:37` n'impose **aucun minimum** aujourd'hui et un segment
minuscule y disparaît déjà ; sur un anneau, un arc plus court que ses deux écarts
s'inverse ou ne rend rien. Donc, écrit et testé :

- **écart entre arcs en degrés**, jamais en pixels — un écart en pixels change
  d'angle avec le rayon ;
- **angle de balayage minimum** ; toute part en dessous est versée dans
  « Autres », qui porte alors le décompte des postes agrégés ;
- **cas dégénérés** : **une seule catégorie à 100 %** — pas d'écart, anneau plein
  (un écart sur un anneau plein le ferait lire 99 %) ; **« Dépensé ce mois » = 0**
  — anneau vide, aucun arc, aucun libellé d'état, aucun jugement.

**Contraste — les deux axes.** L'écart de fond règle arc↔arc ; l'axe arc↔surface
est réglé par la rampe (§1.2b) et **mesuré** dans `contrast-ratios.test.ts`.

**Le reste** : le centre porte « Dépensé ce mois » (nom réservé ADR-035) ; la
légende porte l'information en `<dl>` (§5.6) ; **poste « Sans catégorie »
explicite**, car `categoryId` est `string | null` (`workspace-snapshot.ts:330`) ;
**invariant ADR-022:134-136**, que l'ADR _commande_ : changer la catégorie d'une
dépense ne déplace aucun total.

**Cet invariant n'est asserté nulle part aujourd'hui, et la PR 2 l'écrit.**
`domain/categories/types.ts:8-23` le dit sans détour : le test qui était cité
« n'existe pas, nulle part dans le dépôt… il est tenu par convention ». C'était
supportable tant qu'aucun code n'agrégeait d'argent par `categoryId`. **La PR 2
est ce code** : c'est le moment exact où une convention non testée devient une
convention porteuse. Elle n'est donc pas laissée à ADR-043 — le test part avec
l'agrégateur qui le rend nécessaire.

**ADR-022:138-140** gouverne directement ce composant : « un graphique par
catégorie décrit le passé, il ne doit produire aucune recommandation
d'allocation ». C'est l'appui FSMA le plus direct, et il est déjà écrit.

### 5.3 Deux lectures neuves

`getCategories` (`data/categories.ts:25`) n'a **qu'un appelant** aujourd'hui,
`lib/actions/expense-entry.ts:33` : le cockpit ne lit jamais les catégories. PR 2
ajoute donc **deux** lectures — les catégories du workspace, et les dépenses de la
période précédente bornées au jour courant — toutes deux dans le `Promise.all`
existant de `workspace-snapshot.ts:194-256`, qui lit déjà `previousPeriod`. Le
domaine reçoit les lignes : `comparaisonMoisPrecedent(expensesPrecedentes, jourCourant)`.

### 5.4 Frontière Decimal → number

`page.tsx:48-60` (`partsAffichees`) est le précédent canonique, et `:190`/`:221`
font déjà `.toNumber()`. Les trois agrégateurs calculent en `Decimal` et **rendent
des `number`**. `MonthCurve`, `CategoryDonut`, `MonthsAhead` ne reçoivent jamais
un `Decimal`.

### 5.5 Refusé : les sparklines de comptes

Aucun historique de soldes en base — 24 migrations vérifiées.

### 5.6 Le canal non-couleur : le libellé, pas un glyphe **[F7]**

La v4 promettait une légende « glyphe + libellé + montant + part » et un
`RowGlyph` « portant un glyphe ». **`Category` (`domain/categories/types.ts:54-60`)
porte `id, name, kind, colorToken, isSystem` — aucune icône.** Avec la migration
de schéma hors périmètre, cette promesse était inimplémentable.

**Décision** : le canal non-couleur est le **libellé**, qui existe et est complet.

- **Légende de l'anneau** : `<dl>` — libellé, montant, part. Pas de glyphe.
- **`RowGlyph`** garde la forme empruntée à la référence — un disque teinté en
  tête de ligne — mais porte **l'initiale du libellé**, pas une icône. Inventer
  une table nom → icône serait une décision produit, et elle serait fausse pour
  toute catégorie créée par l'utilisateur, dont le nom est libre.
- Le §8 est amendé en conséquence : une puce d'**état** porte icône + libellé +
  couleur (les états sont un ensemble fermé, leurs icônes existent) ; une puce de
  **donnée** porte libellé + couleur.

## 6. Contrat des testids et des ancres

### 6.1 Les huit ancres `aria-labelledby` de `page.tsx`

| Ancre                      | Ligne     | Sort                                  | PR  |
| -------------------------- | --------- | ------------------------------------- | --- |
| `dashboard-heading`        | 169 / 182 | conservée                             | —   |
| `cascade-heading`          | 211       | conservée                             | 1   |
| `provision-health-heading` | 246-247   | migrée vers « Provisions »            | 3   |
| `commitments-heading`      | 266-267   | migrée vers « Engagement »            | 3   |
| `upcoming-bills-heading`   | 286-287   | migrée vers « Ce qui arrive »         | 3   |
| `accounts-heading`         | 333-334   | conservée, position relative modifiée | 2   |
| `plan-heading`             | 367 / 374 | conservée                             | 2   |
| `expenses-heading`         | 478 / 483 | migrée vers « Dépensé ce mois »       | 2   |

**Assertion d'ordre DOM** : `dashboard-cockpit-bloc2.spec.ts:73-86` (vivante) exige
`accountsBox.y < planBox.y`. La grille 7/5 la rend fausse par construction.
**Réécrite en PR 2**, au même endroit que sa cause — jamais supprimée.

### 6.2 Testids

| Testid                                                                                                                                                                          | Sort                                                                                                                                                               | PR  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| `situation-hero`, `-value`, `-anchor`                                                                                                                                           | conservés                                                                                                                                                          | 1   |
| `situation-cascade-link`                                                                                                                                                        | conservé, déplacé sous la courbe                                                                                                                                   | 1   |
| `situation-setup-cta`, `situation-nudge-link`                                                                                                                                   | conservés                                                                                                                                                          | 1   |
| `situation-par-jour`                                                                                                                                                            | conservé                                                                                                                                                           | 1   |
| `situation-epargne-estimee`                                                                                                                                                     | **reste sur `CascadeDuMois:269`, porteur unique.** Le point terminal de la projection reçoit `month-curve-projection-end`. `CascadeDuMois.test.tsx:112` intouché.  | 1   |
| `pace-bar`, `-spent`, `-tick`, `situation-pace-verdict`                                                                                                                         | **supprimés** avec `PaceBar`                                                                                                                                       | 1   |
| nouveaux : `month-line`, `status-chip`, `month-curve`, `-line`, `-pace`, `-projection`, `-projection-end`, `-bill-*`, `-verdict`, `cockpit-tile-{avenir,provisions,engagement}` | créés                                                                                                                                                              | 1   |
| `cascade-du-mois`, `allocation-bar`, `allocation-segment-*`, `flow-detail-*`                                                                                                    | conservés                                                                                                                                                          | —   |
| `simulator-*` et `whatif-*`                                                                                                                                                     | conservés, **intouchés**                                                                                                                                           | —   |
| `[data-account-type=…]` (`AccountCard.tsx:72`)                                                                                                                                  | **conservé.** PR 2 refait l'enveloppe du bloc Comptes et **ne touche pas `AccountCard`**. Preuve : `dashboard-account-rename.spec.ts` passe **sans modification**. | 2   |
| `provision-health-gauge-*`, `provision-fund-*`                                                                                                                                  | migrés vers `Ring`                                                                                                                                                 | 3   |
| `engagements-*`                                                                                                                                                                 | migrés vers `Segments`                                                                                                                                             | 3   |
| `prochaines-factures-*`                                                                                                                                                         | migrés vers « Ce qui arrive » + `DaysStrip`                                                                                                                        | 3   |
| nouveaux : `category-donut`, `-arc-*`, `-legend-*`, `months-ahead`, `-bar-*`                                                                                                    | créés                                                                                                                                                              | 2   |
| nouveaux : `days-strip`, `-day-*`, `ring-provisions`, `segments-engagement`, `row-glyph-*`                                                                                      | créés                                                                                                                                                              | 3   |

## 7. Cohérence hero ↔ courbe **[F3]**

`HeroAmount` est branché sur `optimistic-spend` : « Il te reste » baisse au tap
sur ⊕, avant l'aller-retour. Une courbe figée à côté d'un nombre qui bouge est la
maladie que `month-situation.ts:33-39` décrit.

Le magasin publie **la figure résultante** et non un delta (`:30-41`) : appliquer
deux fois revient à appliquer une fois, donc aucun ordre d'arrivée ne produit une
image fausse. Ce raisonnement est conservé.

**Trois issues.** (a) recalculer côté client → **refusé**, second calcul de la
même somme à l'affichage, interdit par le corollaire de la règle 10 et par
l'invariant du §5.1. (b) publier une seconde figure → **retenu**. (c) laisser la
courbe figée → refusé.

**La forme retenue** : `pending: number | null` devient
`pending: { ilTeReste: number; depensesDuMois: number } | null`. Une seule valeur
en attente, donc **un seul `emit`, un seul `settleSpend`** — purger l'une en
laissant l'autre devient impossible à représenter. `getSnapshot` (`:67`) continue
de rendre une référence stable, donc pas de boucle `useSyncExternalStore`.
`announceOptimisticValue` garde son garde-fou `Number.isFinite` **sur les deux**
membres.

**[F3] Ce que le couple crée : `projection === null` a TROIS causes, pas une.**
`AddExpenseSheet.tsx:247-248` :

```ts
const projection =
  context && !context.incomplet ? context.ilTeReste - pendingLocal - (parsed ?? 0) : null;
```

Donc `null` quand (1) le revenu n'est pas configuré, (2) **le contexte n'est pas
encore chargé**, (3) **son chargement a échoué**. Et `:234` pose
`canSubmit = parsed !== null && !isSubmitting` : **la soumission n'attend pas le
contexte** — `expense-entry.ts:20-25` revendique ce choix, « un utilisateur qui
tape immédiatement n'attend jamais ». Il existe donc bien un chemin où une dépense
part **pendant qu'une courbe est à l'écran**, sur un workspace parfaitement
configuré.

**Deux décisions, une par famille de cause.**

**Cause (1) — `incomplet` : `MonthCurve` n'est pas rendu.** Ce n'est pas un
contournement, c'est ce que l'écran fait déjà : `SituationDuMoisHero.tsx:111-116`
rend dans cette branche un appel à configurer le revenu, pas un chiffre. Une
courbe de « ce qu'il reste » sans budget connu n'a pas d'ordonnée — elle
n'afficherait pas une information incomplète, elle en inventerait une. Rien à
contredire, donc rien à publier.

**Causes (2) et (3) — contexte non résolu : rien n'est publié, et c'est correct.**
Le couple fait geler le hero **et** la courbe ensemble, sur la vérité serveur.
L'écran ne se contredit pas : il est simplement en retard d'un instant, et
l'arrivée du RSC le rattrape. C'est précisément ce que le §7 protège — la
divergence, pas le retard. Publier une figure dérivée d'un contexte absent
reviendrait à l'inventer.

**Trois tests nommés**, un par cause :

1. état `incomplet` → `month-curve` absent du document, et une dépense saisie ne
   provoque aucune publication ;
2. **contexte non résolu** → une dépense saisie ne publie rien, et hero **et**
   courbe restent tous deux sur la valeur serveur ;
3. contexte en échec → même comportement que (2).

Le test (2) est celui que la v5 n'avait pas : elle ne couvrait que le cas où la
courbe **n'est pas là**, c'est-à-dire le seul où rien ne pouvait diverger. Une
sonde qui regarde le seul endroit où le défaut ne peut pas se produire.

**Ce que le contexte gagne, dit explicitement.** `ExpenseEntryContext` reçoit un
champ **`depensesDuMois: number`**. C'est le pivot de l'option (b) et la v5 ne
faisait que le laisser entendre. Le coût est d'une ligne :
`expense-entry.ts:32` tient déjà `situation`, et `month-situation.ts:170` produit
déjà `depensesDuMois` — il ne reste qu'à le convertir à la frontière, du même
geste que ses voisins.

**Où atterrit la dépense optimiste** : sur **aujourd'hui**, dernier jour écoulé de
la série cumulée — jamais répartie, jamais sur un jour futur.

**Test nommé** : le dernier point cumulé vaut le « Dépensé ce mois » **reçu**,
jamais une valeur re-dérivée de « Il te reste ».

## 8. Contrat des composants SVG **[F7]**

`PaceBar.tsx` est le patron :

- **Géométrie par attributs** (`x`, `width`, `d`, `fill`, `fillOpacity`,
  `linearGradient`), **jamais** de `style` inline : `style-src` ne porte pas
  `'unsafe-inline'` en production, l'attribut y est supprimé et la forme
  disparaît.
- **États par classes et `data-*`.** Une puce d'**état** porte icône + libellé +
  couleur ; une puce de **donnée** porte libellé + couleur (§5.6).
- **Tokens de `globals.css` uniquement**, y compris les couleurs de données, qui
  viennent de la rampe de la PR 0.
- `role="img"` + `aria-label` en **phrase complète**.
- `height` en attribut, pas en chaîne Tailwind (quirk WebKit < 17.4 documenté sur
  `PaceBar` et `AllocationBar`).

## 9. `PaceBar` — les treize cas

13 déclarations `it`, 14 exécutés (`:86` est un `it.each` à deux entrées).

| Cas                                  | Ce qui est protégé                        | Repris par `MonthCurve` |
| ------------------------------------ | ----------------------------------------- | ----------------------- |
| `:29` remplissage proportionnel      | la géométrie suit les chiffres            | ✅                      |
| `:34` repère à la fraction écoulée   | la référence de rythme                    | ✅                      |
| `:39` remplissage plafonné           | dépassement de budget                     | ✅                      |
| `:44` repère ≤ 99,2 le dernier jour  | sinon il sort de la piste                 | ✅                      |
| `:51` ordre de tracé                 | lisibilité                                | ✅                      |
| `:61` / `:70` / `:77` trois états    | « la couleur jamais seule »               | ✅                      |
| `:86` budget 0 **et** négatif        | piste vide, jamais une barre rouge pleine | ✅                      |
| `:94` mois à zéro jour               | division par zéro                         | ✅                      |
| `:99` dépense négative               | géométrie négative                        | ✅                      |
| `:106` aucun attribut `style`        | CSP                                       | ✅                      |
| `:113` `role="img"` + nom accessible | le lecteur d'écran obtient l'information  | ✅                      |

**Cas supplémentaires** : `epargneEstimee` vaut `null` tant que
`joursEcoules < 7` (ADR-035 ; `CascadeDuMois:270` rend `—`) — jours 1 à 6, pas de
point terminal, et l'`aria-label` ne l'annonce pas. Et l'état `incomplet` (§7).

**`MonthCurve` sera scindé, pas rogné** : **tracé** (géométrie pure) / **états**
(couleur, libellé, projection conditionnelle, `aria-label`), deux fichiers, deux
suites.

## 10. Produit et i18n

- **Règle 10** : tout total descend avec ses composantes.
- **Règle 11** : toute coche porte sa date et son Annuler au même endroit (PR 3).
- **ADR-035** : noms réservés ; la projection est `epargneEstimee`.
- **FSMA** : `dashboard.situation.statut.vert` vaut « Tu gères bien ce mois-ci » —
  une appréciation. La puce d'état la remplace par un constat. **PR 1.**
- **Clé neuve ≠ clé déjà traduite.** `statut.vert` est déjà traduit dans les cinq
  locales (`:1210`) : y écrire du français ferait **régresser** nl, de et es.

**Les cinq clés `pace.*` (`fr-BE.json:1240-1245`) :**

| Clé                                              | Sort                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pace.perDay`                                    | **CONSERVÉE** — porte le texte de `situation-par-jour` (`SituationDuMoisHero.tsx:160`, `:1242`) |
| `pace.barAria`                                   | supprimée ; remplacée par l'`aria-label` de `MonthCurve`                                        |
| `pace.onTrack` / `pace.faster` / `pace.exceeded` | **traductions REPORTÉES sur les clés neuves**, voir ci-dessous                                  |

**Le §10 ne s'appliquait pas sa propre règle.** Ces trois clés sont **réellement
traduites** dans les cinq locales — `nl-BE.json:1243` « op schema »,
`de-DE.json:1244` « über dem Rhythmus », `es-ES.json:1243` « al ritmo ». Les
remplacer par des clés neuves écrites en français ferait régresser nl, de et es de
trois chaînes chacune : exactement le défaut que ce paragraphe signale pour
`statut.vert`, et qu'il ne se voyait pas commettre trois lignes plus bas.

Les libellés d'état de la courbe disent la même chose que ceux de la barre — dans
le rythme, au-dessus, dépassé. Les cinq traductions sont donc **reportées**, pas
réécrites. Une clé qui change de nom sans changer de sens n'est pas une clé neuve.

**Registre de parité.** `situation-i18n.test.ts:5-47` ne contient aucune clé
`pace.*` ni `cascade.*` : rien à en sortir. Toute clé neuve de `MonthCurve`,
`StatusChip`, `CategoryDonut` y **entre dans le même commit**.

## 11. Tests, quarantaine et planchers

| Suite unitaire                      | Mouvement                                                                                                                                                                                                                                    | PR  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `PaceBar.test.tsx`                  | remplacée par les deux suites de `MonthCurve` (§9)                                                                                                                                                                                           | 1   |
| `SituationDuMoisHero.test.tsx`      | migrée. Il asserte la classe de taille en valeur arbitraire du hero **et**, en `:168`, `toHaveLength(1)` — l'**unicité** du montant dominant. C'est cette seconde assertion qui tombe si une tuile porte un grand nombre dans la même carte. | 1   |
| `HeroAmount.test.tsx`               | migrée — cinq appels à adapter au couple (§3)                                                                                                                                                                                                | 1   |
| `ProvisionHealthGaugeCard.test.tsx` | migrée vers `Ring`                                                                                                                                                                                                                           | 3   |
| `EngagementsCard.test.tsx`          | migrée vers `Segments`                                                                                                                                                                                                                       | 3   |
| `ProchainesFacturesCard.test.tsx`   | migrée vers « Ce qui arrive » + `DaysStrip`                                                                                                                                                                                                  | 3   |

**Les quatre entrées de quarantaine (`authenticated-specs.json:51-56`) :**

| Entrée                                 | Sort                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `accounts.spec.ts`                     | réécrite en PR 2                                                                  |
| `dashboard-expenses.spec.ts`           | réécrite en PR 2 — sa cible est « Dépensé ce mois »                               |
| `dashboard-data-flow.spec.ts`          | réécrite en PR 3 — sa surface de remplacement n'existe qu'après la colonne droite |
| `dashboard-capacite-tryptique.spec.ts` | supprimée par écrit en PR 3 : ADR-035 a retiré les concepts assertés              |

À la fin des trois PR, la quarantaine est **vide**.

**Planchers, et la commande qui les mesure** :

```bash
gh run view <run-id> --log | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)"
```

**268** public · **50** authentifié sur `main` avant #448 (run `32671263834`) ;
**268** · **62** après (run `32739812967`). Re-mesurés après chaque PR, tout
delta justifié par écrit.

## 12. Portes et DONE — par PR

**Portes locales** : `lint` · `lint:use-server` · `typecheck` · `test` · `build` ·
**`npm run dev` + une page en HTTP 200 + zéro erreur de compilation**. Puis
captures 390 × 844 **clair et sombre** et **mesure DOM du pli**
(`getBoundingClientRect`) : réponse complète dans les **550 px utiles**.

**DONE**, prouvé, pour chaque PR : CI verte (six checks) ; Sourcery silencieux sur
le dernier commit — fils ancrés **et** remarques générales du corps de review ;
tous les fils résolus, Codex compris ; `mergeStateStatus` **CLEAN** ; rapport dans
`docs/prs/PR-cockpit-{0,1,2,3}-report.md` et `docs/ROADMAP.md` à jour.

**Agents QA** : `ui-auditor` + `mobile-ios-auditor` partout ;
`dashboard-ux-auditor` sur 1, 2, 3 ; `financial-formula-validator` sur 1 et 2 ;
`test-quality-auditor` sur les quatre ; `mobile-liquid-glass-auditor` sur la PR 0.

## 13. État de l'écran entre les PR

Après la **PR 1**, le nouveau pli surmonte les surfaces d'aujourd'hui. Deux
vocabulaires visuels cohabitent le temps de la PR 2. **Acceptable** : la frontière
est horizontale et nette, le haut répond, le bas détaille, et les deux moitiés
lisent les mêmes chiffres du même domaine — ce que le §5.1 impose.

**Retour arrière** : la PR 1 se révoque seule — aucune lecture neuve, aucune
migration, `AccountCard` intouché.

## 14. Risques

1. **`MonthCurve` est le composant le plus lourd.** Écrit en premier, en TDD,
   **scindé tracé / états** plutôt que rogné.
2. **Le pli à 550 px est serré.** La **mesure DOM tranche**, pas la maquette.
3. **La grille bureau casse une assertion vivante** (§6.1). Traitée en PR 2.
4. **PR 2 ajoute deux lectures en base**, dans le `Promise.all` existant.
5. **PR 0 touche des jetons utilisés partout** et y ajoute une rampe. Aucun
   changement de mise en page dans cette PR, et les paires de contraste neuves
   comme filet.
6. **Le magasin optimiste change de forme** et sert le hero, la feuille ⊕ et la
   courbe. Sept fichiers, tous nommés au §3.
7. **`SKILL.md` prescrit un composant supprimé** entre PR 1 et PR 1-bis. Fenêtre
   de quelques heures, nommée plutôt que subie.
