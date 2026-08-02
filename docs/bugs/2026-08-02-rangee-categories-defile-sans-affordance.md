# La rangée de catégories défile, et rien ne le dit

- **Date** : 2026-08-02
- **Gravité** : non bloquant — toutes les catégories restent atteignables d'un
  balayage. Mais le défaut fait **sous-déclarer ce que l'app propose**, et il a
  produit un rapport de bug erroné (voir « Origine »).
- **Statut** : **non corrigé, volontairement.** Rien n'est fonctionnellement
  cassé et la refonte du design system reprend cette surface. Cette note existe
  pour que le chantier hérite de la mesure plutôt que de la redécouvrir.
- **Surface** : `src/components/expenses/AddExpenseSheet.tsx`, section 2
  (« Categories. One row, horizontal scroll. »)
- **Mesuré sur** : `npm run dev`, stack Supabase locale, profil de test à
  8 catégories (le seed du 2026-05-03), Playwright, presets d'appareils officiels

## Symptôme

Dans le panneau « Nouvelle dépense », la rangée de chips de catégorie déborde
horizontalement. Sur les iPhone courants, **trois chips sur cinq sont visibles**,
la quatrième est coupée en plein mot au bord droit, la cinquième est entièrement
hors écran. Aucune barre de défilement, aucun dégradé de bord, aucune ombre,
aucun bouton : **rien n'indique qu'il y a autre chose à droite.**

Un utilisateur qui compte ce qu'il voit conclut que l'app lui propose trois
catégories. Elle lui en propose cinq.

## Origine

Rapport du 2026-08-01 : « seules deux catégories sont proposées ». Le panneau en
offrait le nombre normal ; c'est le nombre **vu** qui différait du nombre
**offert**. La mesure ci-dessous a été prise pour trancher, et c'est elle qui a
requalifié le rapport.

## Mesure

`getBoundingClientRect()` de chaque chip contre la largeur du viewport, plus
`scrollWidth` / `clientWidth` de la piste. Espace de travail à 8 catégories,
dont 5 `variable` — donc 5 chips offertes, la limite exacte de `CHIP_COUNT`.

| Appareil (preset) | Viewport | Offertes | Visibles en entier | Coupée      | Hors écran | Débordement |
| ----------------- | -------- | -------- | ------------------ | ----------- | ---------- | ----------- |
| iPhone SE         | 320      | 5        | **3**              | `Transport` | `Autres`   | 230 px      |
| iPhone 12         | 390      | 5        | **3**              | `Transport` | `Autres`   | 160 px      |
| iPhone 14         | 390      | 5        | **3**              | `Transport` | `Autres`   | 160 px      |
| iPhone 15 Pro Max | 430      | 5        | **4**              | `Autres`    | —          | 120 px      |
| Pixel 7           | 412      | 5        | **3**              | `Transport` | `Autres`   | 138 px      |

Largeur totale de la piste : **550 px**, constante. Aucun appareil testé ne
l'affiche en entier. `scrollbarVisible: false` partout — la barre de défilement
n'occupe aucune hauteur, donc elle n'est pas rendue.

## Ce qui rend le défaut structurel plutôt qu'accidentel

Le `flex-nowrap` + défilement est un choix **délibéré et justifié**, documenté
dans le composant : passer à deux lignes pousse le bouton « Ajouter » sous le
clavier, ce qui casse la promesse des 2 taps. Le défilement n'est pas l'erreur.

L'erreur est que la seule affordance prévue — le bouton « + » d'overflow — est
gouvernée par `overflow.length > 0`, c'est-à-dire par le nombre de catégories
**au-delà de la cinquième**. Or le débordement visuel commence bien avant : dès
**trois** chips à 390 px. Il existe donc une plage — de 3 à 5 catégories, celle
où se trouvent aujourd'hui tous les espaces de production — où des chips sont
cachées **et** où l'indice de leur existence est masqué par construction.
L'affordance n'apparaît que quand elle n'est plus la seule chose qui manque.

Détail aggravant : sur les trois iPhone les plus courants, la chip entièrement
hors écran est `Autres` — précisément la catégorie de repli, celle que le
placeholder du champ libellé annonce comme valeur qui sera enregistrée.
L'utilisateur lit « Autres » en gris sous LIBELLÉ, ne trouve « Autres » nulle
part dans la rangée, et n'a aucune raison de deviner qu'elle est à droite.

## Ce qui n'est PAS en cause

Vérifié et écarté, pour que le chantier ne reparte pas dessus :

- **Le champ LIBELLÉ n'est pas inerte.** Mesuré : `disabled: false`,
  `readOnly: false` ; on y tape, `.value` reçoit la frappe. Le « Autres » gris
  est le placeholder, qui affiche le libellé de repli. Contraste mesuré
  **5,69:1** sur 14 px — au-dessus du seuil WCAG AA de 4,5:1.
- **Le filtre `kind = 'fixed'` fait son travail.** ADR-035 §5 exclut les
  catégories de factures pour empêcher le double comptage. Les 5 chips offertes
  sont exactement les 5 `variable` du seed. Le compte est juste.
- **Il n'existe aucun chemin de création de catégorie**, nulle part dans l'app
  (une seule lecture dans `src/lib/data/categories.ts`, plus l'export GDPR ;
  aucune écriture). ADR-022 diffère explicitement les catégories utilisateur.
  Lacune assumée, pas un défaut.

## Piste pour le chantier design system

Ne pas supprimer le défilement — il protège les 2 taps. Rendre le débordement
**visible** : dégradé ou ombre de bord sur le côté qui déborde, ou une chip
volontairement coupée à un tiers plutôt qu'aux neuf dixièmes (une chip coupée
à 90 % se lit comme un bord d'écran, pas comme une promesse de suite).

Le critère mesurable pour la recette : à 320 px comme à 430 px, un utilisateur
doit pouvoir dire combien de catégories existent **sans balayer**.
