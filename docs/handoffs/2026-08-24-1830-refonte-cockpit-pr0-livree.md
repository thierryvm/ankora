---
date: 2026-08-24
heure: '18:30'
projet: ankora
agent: cc-ankora
type: handoff
---

# Refonte du cockpit — la grammaire visuelle est en production, le pli est en cours

## 1. Ce qui a été fait

**Trois PR mergées aujourd'hui.**

| PR   | Objet                                                        |
| ---- | ------------------------------------------------------------ |
| #447 | le handoff de la veille, en double                           |
| #448 | **deux specs iPhone qui n'avaient jamais tourné nulle part** |
| #449 | **PR 0 de la refonte : élévation sombre + rampe graphique**  |

**En vol** : branche `feat/cockpit-pli-mobile`, poussée, deux commits, arbre
propre. PR pas encore ouverte.

## 2. #448 — un garde-fou qui n'avait jamais rien gardé

Le sélecteur de specs authentifiées (`scripts/lib/auth-specs.mjs`) reconnaît une
spec par **sous-chaîne** de son source. Deux fichiers nommaient leurs semeurs
autrement et passaient à travers :

- `mobile-ios/dashboard.spec.ts` (`seedUserWithCharges`) — **tout le fichier**,
  chaque cas `test.skip(!admin)`, donc sauté en public et jamais sélectionné en
  authentifié ;
- `mobile-ios/auth-flow.spec.ts` (`seedOnboardedUser`) — **un cas**, la
  régression de persistance de session du 4 mai 2026.

**Deuxième occurrence du même angle mort**, que l'en-tête du fichier décrivait
déjà. Le correctif précédent avait élargi une **liste de littéraux** ; le
prédicat est maintenant un **motif** sur le verbe de semis, et il est testé
(11 cas, dont un qui emploie un nom de semeur qui n'existe nulle part).

Détail qui donne la forme du défaut : `deleteSeededUser` ne contient pas
`seededUser` — la majuscule défait la recherche par sous-chaîne.

**À leur première exécution, trois cas ont rougi. Les trois étaient des défauts
de TEST**, aucun n'était un défaut de l'application :

1. un attendu `httpOnly` **faux par construction** — `@supabase/ssr` 0.10.3 pose
   `httpOnly: false` dans ses options par défaut et `createBrowserClient` lit la
   session dans `document.cookie`. Retiré **à voix haute** : son message accusait
   l'application d'une faille qu'elle n'a pas ;
2. une sonde cherchant un menu « Compte » de bureau sur un écran de téléphone —
   `AccountButton` est `hidden xl:flex` depuis le 02/08, la déconnexion mobile
   vit dans la feuille « Plus » ;
3. une course au rechargement, **déjà diagnostiquée côté bureau en juillet**
   (`dashboard-account-rename.spec.ts:48-70`), même remède.

**Plancher authentifié : 50 → 62.** Public inchangé à 268.

## 3. #449 — PR 0, la grammaire visuelle

Née d'une référence graphique fournie par @thierry, dont il a demandé de retenir
**l'aspect visuel, pas le contenu**.

**Le mode sombre avait perdu un cran d'élévation** : `--color-surface-soft` et
`--color-surface-muted` portaient la **même valeur**, alors qu'elles diffèrent en
clair. Trois crans pour quatre jetons, dans le seul thème où l'ombre ne se voit
pas et où la surface est donc le seul moyen d'élever.

**Et j'allais me tromper de sens.** J'avais proposé une valeur plus **claire** que
la carte, au motif que « s'écarter d'un fond de nuit, c'est éclaircir ». La revue
est allée lire les usages : ce jeton est un **fond de piste** — la rainure de
`progress`, `PaceBar`, `AllocationBar`, et le rail sous un curseur `bg-card` dans
`LocaleSwitcher`. Une piste plus claire que son curseur se lit à l'envers. La
valeur retenue reproduit la relation curseur/piste que le thème clair porte déjà
(1,127 contre 1,130, là où elle vaut 1,030 aujourd'hui).

**Une rampe graphique de six teintes plus un neutre** entre dans `globals.css`.
Motif : les huit valeurs de `categories.color_token` **ne sont pas une palette**,
ce sont les jetons sémantiques empruntés, et l'un d'eux est un mélange **vers**
la carte — donc incapable d'atteindre 3:1 contre elle. Un anneau peint là-dedans
serait illisible sur sa propre carte, et il **jugerait**.

Cherchée par balayage OKLCH puis mesurée : pire contraste **3,85:1** (clair) /
**6,76:1** (sombre) contre les **quatre** surfaces ; séparation mutuelle
dE **13,1 / 12,8**, écrite telle quelle bien qu'en dessous de la cible de 15.

**Une contrainte de mon invention s'est révélée insatisfiable** : exiger que
chaque teinte reste loin des jetons d'état ne laissait que 28 teintes sur 120,
toutes violettes, **aucun orange** — parce qu'en sombre les couleurs d'état sont
claires et saturées et occupent la bande utile. La vraie exigence est
l'**identité** (la rampe a ses propres jetons), pas la distance.

`categories.color_token` **n'est pas migré**. Dette assumée et écrite : la
pastille d'une catégorie et son futur arc n'auront pas la même couleur.

## 4. Le plan, et ce que six tours de revue ont changé

`docs/plans/cockpit-refonte-e-plan.md`. **Six tours de `plan-reviewer`** : v1
rejetée, v2 à v5 approuvées sous réserves, puis une revue ciblée. Ce que les
tours ont réellement produit, et qui ne se devine pas à la lecture du résultat :

- le prérequis #448, que je n'avais pas vu ;
- la contrainte de couleur insatisfiable, démontée par la mesure ;
- un contraste annoncé à 4,13 qui vaut **3,85** — ma mesure oubliait une surface ;
- la direction de `surface-muted`, que j'avais inversée ;
- un test qui ne regardait que le seul cas où le défaut **ne peut pas** survenir
  (`projection === null` a **trois** causes, pas une) ;
- ma propre règle « clé déjà traduite ≠ clé neuve » que je m'apprêtais à violer
  sur trois clés `pace.*` bel et bien traduites en nl, de et es.

**Découpage arrêté** : PR 0 (faite) → PR 1 pli mobile → PR 2 colonne gauche +
grille bureau → PR 3 colonne droite + ménage → PR 3-bis documentaire (`SKILL.md`,
**après** la PR 3, parce que les PR 2 et 3 invalident aussi les trois autres
composants qu'il nomme).

## 5. Où en est la PR 1

Branche `feat/cockpit-pli-mobile`, deux commits poussés :

1. **les deux filets** — `optimistic-spend` et `expense-entry` n'avaient aucun
   test dédié, et ce sont les deux fichiers dont la PR change la **forme**.
   21 cas verts contre le comportement **actuel**. (Nuance : `optimistic-spend`
   était couvert **de biais** par `HeroAmount.test`, qui importe le vrai module.)
2. **`depensesParJour`** + 20 cas, dont l'**invariant de réconciliation** testé
   contre la vraie fonction du domaine.

**Ce que l'invariant a attrapé** : ma première version **écartait** un jour hors
bornes ; `depensesDuMois` filtre sur le préfixe `YYYY-MM-` et **compte** ce
jour-là. La courbe aurait donc pu diverger du chiffre qu'elle décompose, en
silence. Le jour hors bornes est désormais **rattaché** au bord.

**Reste à faire dans la PR 1** : `MonthCurve` scindé tracé/états (5 états + le cas
des jours 1-6 sans projection), `StatusChip`, le couple optimiste sur **sept**
fichiers, la recomposition du pli et les trois tuiles, la correction FSMA de
`statut.vert`, les clés dans les cinq locales + `LEAF_KEYS`.

## 6. Points ouverts pour @thierry

- **Une question de configuration d'environnement local** posée la veille, sans
  réponse à ce jour. Détail dans la copie hors dépôt.
- **L'épinglage du modèle n'est pas en vigueur dans un worktree** : le fichier
  qui le porte est gitignoré, et `git worktree add` ne copie pas les fichiers
  ignorés. Le copier serait une modification silencieuse de configuration
  d'agent — décision à @thierry.
- **Sourcery a atteint sa limite hebdomadaire** et n'a relu **ni #446, ni #448,
  ni #449**. Trois PR sans second regard automatique.
- **`npm run build` régénère `public/llms-full.txt`** en y estampillant la date :
  chaque build salit l'arbre d'un diff qui ne dit rien.
- **Une alerte de dépendance ouverte**, de portée développement uniquement.

## 7. Pièges d'instrument de la session

Cinq, tous auto-infligés, tous auraient produit un constat de défaut contre du
code sain :

1. **Les crochets de `[locale]` sont un motif pour PowerShell** — `Get-Content` et
   `Select-String` sans `-LiteralPath` ne lisent **rien** et rendent une liste
   vide, qui se lit « rien ne correspond ». **Rencontré trois fois.**
2. **`Replace` est sensible à la casse** : deux graphies d'un même chemin ont fait
   rendre « vingt fichiers manquants » là où il y en avait deux.
3. **Ma sonde d'ordre d'élévation** comparait le mesuré à un tableau écrit dans
   l'ordre de **déclaration**. Elle criait au défaut sur un CSS correct.
4. **`getPropertyValue` rend `#fff`** là où le CSS écrit `#ffffff` — luminance
   calculée sur trois chiffres, la carte blanche passait pour la plus sombre.
5. **Une sonde de 3,5 s** avait conclu « ça ne marche pas » sur une action serveur
   qui compile en mode dev (piège hérité de la veille, reconfirmé).

Un sixième relève de l'outillage de la machine et non du projet : il est décrit
dans la copie hors dépôt.

## 8. Planchers e2e

**268** public · **62** authentifié, mesurés puis tenus au chiffre près sur #449.

```bash
gh run view <run-id> --log | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)"
```
