# ADR-047 — Le mois de budget commence quand le salaire arrive

- **Statut** : Accepté (décision du pilote, tour 49, 28 septembre 2026)
- **Cite** : ADR-035 (les quatre chiffres, « Dépensé ce mois »), ADR-046 (le mois concerné d'un argent reçu)

## Contexte

ADR-046 range l'argent reçu dans le mois qu'il finance : un salaire reçu le 28 septembre
« pour octobre » alimente octobre. Les dépenses, elles, restaient rangées au mois du
calendrier : une dépense du 29 septembre, payée avec ce salaire, comptait dans le
« Dépensé » de septembre. Pour toute personne payée avant le 1er, le mois du calendrier
n'est pas le mois du budget.

## Décision

Le mois de budget se **déduit** de l'argent reçu, sans réglage ni migration.

- Le mois M commence à l'arrivée du premier argent reçu « mon revenu du mois » (regular,
  non annulé) affecté à M, et finit à l'arrivée de celui de M+1.
- Une dépense appartient au mois qui suit son mois du calendrier si l'argent reçu de ce
  mois suivant est arrivé avant elle ; sinon à son mois du calendrier. Sans revenu noté,
  la règle retombe donc sur le calendrier : aucune dépense ne disparaît faute d'un salaire noté.
- Le jour même de l'arrivée : règle des relevés (ADR-045 D21) — une dépense écrite après
  l'argent reçu est dans le nouveau mois (comparaison des instants d'écriture ; une égalité
  n'est pas « après »).
- Un « reçu en plus » (extra) ne déplace rien. Un salaire en retard ne ramène pas les
  dépenses du mois suivant dans le mois passé (la contrainte ±1 mois d'ADR-046 borne le cas).
- C'est un **calcul** : corriger la date d'un argent reçu range à nouveau les dépenses.

Une seule fonction de domaine, `src/lib/domain/budget/mois-de-budget.ts`, est suivie par
tous les lecteurs : « Dépensé » d'« Il te reste », Rythme du mois (jours de la fenêtre du
mois de budget), Catégories, Six mois, page Dépenses, rappel de la feuille de dépense.
Le mois ouvert par défaut du cockpit, de la page Dépenses, de la page Factures et de la
feuille est le mois de budget qui court.

Un mois sans argent reçu noté ne dit plus « Argent reçu » : il dit « Revenu prévu » et
propose de noter ce qui a vraiment été reçu.

## Conséquences

- Les dépenses sont lues du mois du calendrier précédent au mois suivant, puis rangées ;
  chaque lecture reste filtrée par l'espace de travail de la session.
- Un réglage « jour de paie » n'est pas nécessaire ; il reste hors périmètre.
