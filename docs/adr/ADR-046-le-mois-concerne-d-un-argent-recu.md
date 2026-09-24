# ADR-046 — Le mois concerné d'un argent reçu

- **Statut** : proposé (tour 42, 24 septembre 2026), à accepter par @thierry à la fusion
- **Contexte** : ADR-038 (comptes), ADR-045 (journal des opérations), issue #483 (revenu de base)

## Contexte

Le salaire arrive vers la fin du mois et paie les factures du mois suivant. Le
journal (ADR-045) rangeait tout argent reçu au mois de sa **date** : un salaire
du 28 septembre gonflait le budget de septembre, et octobre n'en recevait rien.

Mesuré avant la décision : « Il te reste » lit déjà l'argent reçu du mois
(`month-situation.ts` → `operationsDuMois`), en retenant le plus grand du
revenu écrit et de la somme des « mon revenu du mois » (#483). Le mois
d'affectation change donc ce chiffre dès qu'il existe.

## Décision

1. **Deux colonnes nullables** sur `movements` : `budget_year`, `budget_month`,
   posées seulement sur un argent reçu (CHECK `movements_mois_concerne`). Sans
   valeur, la ligne vaut le mois de sa date : aucune donnée réécrite, aucun
   chiffre existant ne bouge.
2. **Deux lectures d'une ligne, jamais mélangées** : le **solde** d'un compte
   bouge à la DATE (c'est de l'argent réellement reçu) ; le **budget** du mois
   lit l'affectation.
3. **Le préréglage à la saisie** ne lit jamais un jour fixe. « En plus de mon
   revenu » : le mois de la date. « Mon revenu du mois » : le mois qui suit le
   dernier mois déjà servi, s'il tombe à un mois de la date au plus ; sinon, ou
   sans historique, le mois de la date.
4. **Jamais un choix caché** : quand la proposition diffère du mois de la date,
   la feuille le dit avant l'enregistrement, avec le retour au mois de la date
   à un geste. L'affectation est bornée à un mois de la date par la validation
   serveur ; la base n'impose qu'un mois valide.

## Écarté

- **`workspaces.fiscal_month_start`** (mois budgétaire qui commence le 28) :
  il déplacerait tout — dépenses, factures, relevés — sur un mois glissant,
  alors que le besoin ne porte que sur l'argent reçu ; et un salaire du 26 ou
  du 2 tomberait du mauvais côté d'une borne fixe.

## Conséquences

- Le cockpit ne montre encore que le mois courant : un salaire affecté au mois
  suivant quitte le budget du mois en cours, et ne se voit compté dans le
  suivant qu'avec le sélecteur de mois du cockpit (lot suivant).
- Aucun geste « Modifier » n'existe encore pour une opération ; l'affectation
  se corrige aujourd'hui en annulant puis en réécrivant.
