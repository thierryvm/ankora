# PR 1 — le pli du mois, une courbe au lieu d'une barre

**PR** : #451 · **fusionnée** le 2026-08-24 · 11 commits
**Plan** : [`docs/plans/cockpit-refonte-e-plan.md`](../plans/cockpit-refonte-e-plan.md)

---

## Ce qui change à l'écran

Le pli du cockpit — ce qu'on voit avant de faire défiler — passe d'une **barre de
rythme** à une **courbe du mois**. La pastille d'état devient une puce dont
l'icône est dérivée du ton, donc jamais absente. Et `statut.vert` cesse de porter
une appréciation.

La barre remplacée avait deux qualités qu'on garde : un dénominateur honnête
(« Budget du mois », dérivé, pas inventé) et un repère qui ne demande aucune
saisie. Elle avait un défaut structurel qu'on corrige : **elle plafonnait son
remplissage à 100 %**, donc un dépassement de 300 % ressemblait à un dépassement
de 1 %. L'échelle de la courbe s'ouvre pour contenir le pire des trois — budget,
cumulé réel, projection — et le dépassement se voit sortir de la référence.

## L'invariant qui a demandé le plus de soin

**La courbe finit sur le chiffre que le hero affiche, jamais sur sa propre
somme.** `month-situation.ts` le dit déjà de sa propre main : deux calculs de la
même somme finissent toujours par diverger. Une courbe figée à côté d'un nombre
qui bouge est cette maladie à l'écran.

Le magasin optimiste publie donc **les deux figures résultantes comme un seul
objet** : un `emit`, un `settleSpend`, et aucun état représentable où l'une
aurait été purgée sans l'autre.

L'invariant est tenu **à deux étages** : dans le domaine, `depensesParJour()`
garantit que le dernier cumulé vaut `depensesDuMois()` au centime, testé contre
la vraie fonction ; dans le composant, le tracé se termine sur le total **reçu**,
prouvé en montrant que deux chemins différents rendent le **même** `d`.

## La projection existait déjà, enfouie

`epargneEstimee` calculait `depensesDuMois × joursDuMois / joursEcoules` dans une
locale avant de la soustraire au budget. La courbe a besoin de ce nombre-là
exactement. Le reconstruire à l'écran par `budgetDuMois − epargneEstimee` aurait
été un second calcul de la même quantité à l'affichage. Il est donc **extrait**
en `depensesProjetees()`, et `epargneEstimee` l'appelle — donc les deux rendent
`null` sous les **mêmes** conditions, par construction.

## Correction FSMA

`statut.vert` disait « Tu gères bien ce mois-ci » : une appréciation sur les
choix de quelqu'un, sur un produit sans licence de conseil. Elle devient **« Tout
est couvert ce mois-ci »** — un fait vérifiable, que l'écran peut démontrer ligne
par ligne. Corrigée dans les cinq locales.

## La porte visuelle

Pile Supabase **locale**, 24 migrations appliquées, profil semé, mesure au
`getBoundingClientRect`, captures 390 × 844 dans les deux thèmes.

Un iPhone 14 fait 844 px physiques mais n'en donne que **664 au document** une
fois la barre de Safari posée. Moins 65 pour l'en-tête collant et 49 pour les
onglets : **550 px** pour répondre à la question du jour.

La courbe à 112 px poussait la carte **115 px trop bas**. Ramenée à **88 px** —
un chiffre mesuré, pas choisi — plus 12 px repris sur les respirations internes.
**La réponse complète se termine à y=510 pour une limite à 615.**

Sur un mois orange, le lien du nudge tombe derrière la barre d'onglets : un coup
de pouce le découvre, la réponse est entière au-dessus.

## Ce que la falsification a rendu

**23 mutations appliquées hors de tout commit, 20 attrapées.** Chaque fichier
restauré et vérifié identique au hachage SHA256. Les trois échecs sont le vrai
rendement :

1. **la couleur de `MonthCurve` n'était testée nulle part** — une implémentation
   peignant les trois états de la même teinte serait passée ;
2. **le raccord pouvait lire le mauvais membre du couple** et passer ses quatre
   cas : `unmount()` ne vide pas le magasin, donc le test comparait la mutation
   à elle-même ;
3. **retirer `aria-hidden` ne cassait rien** — `lucide-react` le pose lui-même.

**Trois assertions incapables d'échouer** ont été trouvées au total : une jetée
(elle assertait sur sa propre fixture), une re-titrée pour dire ce qu'elle garde
réellement, une remplacée.

## Ce que quatre agents QA ont trouvé ensuite

Verdicts : WCAG **BLOCK**, formules financières **FAIL**, qualité des tests
**PASS WITH GAPS**, WebKit **PASS WITH NOTES**.

| Constat                                                                                                            | Traitement                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-brand-500` sur carte blanche = **2,49:1**, sous les 3:1 de WCAG 1.4.11 — et c'était l'état par **défaut** | jeton remplacé par `--color-brand-text` (5,47:1 / 9,31:1), **et** le contrôle de contraste qui manquait aux traits de la courbe est posé |
| le point terminal de la projection était **coupé en deux** par le bord droit                                       | marge horizontale ; le test est ancré sur l'invariant `x + rayon ≤ largeur`, pas sur la constante                                        |
| le seuil à trois états était **écrit deux fois** (teinte / verdict)                                                | `etatDuMois()` devient l'unique source, vérifiée à l'écran                                                                               |
| `joursDuMois` à `NaN` / `Infinity` / `30.5` **lançait** — HTTP 500 depuis un Server Component                      | `Number.isInteger` dans les deux modules                                                                                                 |
| l'invariant du docblock était **plus fort qu'il ne tient** (dépense post-datée)                                    | docblock corrigé, cas qui fige le comportement réel                                                                                      |
| deux champs neufs sans aucune assertion **à l'agrégat**                                                            | recomposition et nullité conjointe testées dans `situation-mois`                                                                         |

**La leçon** : la falsification maison attrape ce qu'on a pensé à muter. Elle ne
remplace pas un regard qui n'a pas écrit le code.

## Portes

`typecheck` ✅ · `lint` 0 erreur ✅ · `lint:use-server` ✅ · **2520 cas** ✅ ·
`build` 161/161 ✅ · **planchers e2e 268 / 62**, tenus au chiffre près ✅

Sourcery était `SKIPPED` — limite hebdomadaire, quatrième PR d'affilée sans
second regard automatique. C'est ce qui a motivé les quatre agents.

## Ce qui reste, nommé

**Deux contrôles iPhone**, non tranchables sans appareil réel : les pointillés
restent-ils des pointillés sous l'étirement, et le dégradé survit-il à une
navigation interne vers le cockpit ?

**Tickets** : la dépense post-datée qui apparaît comme une marche sur aujourd'hui
et amplifie la projection (préexistant) · le montant projeté lisible nulle part,
relevé par deux agents indépendamment · deux grammaires de date entre les deux
lecteurs, latent · `preselectedId` non testé · le point terminal rendu en
ellipse, cosmétique.

**Reporté** : les trois tuiles `cockpit-tile-*`, prévues ici, passent en PR 3 —
elles résument des cartes que la PR 3 reconstruit, et les faire maintenant
demanderait soit de dupliquer trois calculs, soit d'extraire trois résumés qu'il
faudrait refaire.

**`SKILL.md` prescrit encore `PaceBar.tsx`**, supprimé ici. C'est un fichier de
garde-fou : il ne voyage pas dans une PR feature, et le plan le confie à la
PR 3-bis documentaire.
