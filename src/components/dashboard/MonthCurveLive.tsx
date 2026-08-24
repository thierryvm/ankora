'use client';

import { useOptimisticSpend } from '@/lib/expenses/optimistic-spend';

import { MonthCurve, type MonthCurveProps } from './MonthCurve';

/**
 * `MonthCurve` branchée sur le magasin optimiste.
 *
 * ## Pourquoi un fichier de plus plutôt qu'un `'use client'` sur la courbe
 *
 * `MonthCurve` ne sait dessiner qu'à partir de nombres qu'on lui donne : elle se
 * teste sans magasin, sans fournisseur, sans DOM pour sa géométrie. Lui ajouter
 * un abonnement lui ferait perdre ça, et la rendrait inutilisable partout où il
 * n'y a rien d'optimiste à suivre — une page d'historique, une capture.
 *
 * Ce fichier-ci ne fait qu'une chose, et c'est le seul endroit du cockpit qui
 * la fait : substituer la figure en attente à la vérité serveur.
 *
 * ## Le hero et la courbe bougent du MÊME nombre
 *
 * `HeroAmount` prend `ilTeReste` du couple, celle-ci prend `depensesDuMois`.
 * Ce sont les deux membres d'un objet unique, publié et purgé d'un seul geste :
 * il n'existe aucun instant où l'un aurait été mis à jour sans l'autre. C'est
 * toute la raison pour laquelle le magasin porte un couple plutôt que deux
 * valeurs.
 *
 * ## Le nom accessible décrit la vérité SERVEUR, délibérément
 *
 * `labels.aria` est composé côté serveur et n'est pas recalculé ici. Deux
 * raisons, et la seconde est la vraie : la phrase demanderait de re-traduire
 * côté client, et surtout la courbe est **supplémentaire, pas la source** — le
 * chiffre du hero porte déjà un `aria-live` qui annonce le changement. Faire
 * annoncer la même dépense deux fois serait une régression d'accessibilité, pas
 * une amélioration.
 *
 * **Ce que ce choix coûte, et qu'il faut nommer.** Pendant la fenêtre optimiste,
 * le TRACÉ bouge déjà pendant que la description du SVG énonce encore les
 * montants d'avant. Ce n'est donc pas seulement « une annonce évitée » : c'est
 * une description momentanément fausse, pour qui atterrit sur le graphique au
 * rotor juste après la saisie. La fenêtre vaut un aller-retour et la charge RSC
 * la referme.
 *
 * Le correctif propre existe — reconstruire la phrase ici avec
 * `useTranslations` — et il a un prix : ce composant deviendrait dépendant du
 * fournisseur i18n, donc intestable sans lui, là où il n'est aujourd'hui qu'un
 * aiguillage de trois lignes. Arbitrage assumé, à rouvrir si la fenêtre
 * s'allonge.
 */
export type MonthCurveLiveProps = MonthCurveProps;

export function MonthCurveLive(props: MonthCurveLiveProps) {
  const optimistic = useOptimisticSpend();
  return (
    <MonthCurve {...props} depensesDuMois={optimistic?.depensesDuMois ?? props.depensesDuMois} />
  );
}
