# Conception — un engagement fait autorité sur sa propre mensualité

- **Date** : 2026-07-31
- **Statut** : **conception, non implémentée.** Touche les données de @thierry ;
  attend sa validation.
- **Décision produit** : @thierry, rapportée par @cowork le 2026-07-31.
- **Origine** : double déduction mesurée sur un profil de test à valeurs contrôlées.

## Le défaut, mesuré

Profil de test local, 19 charges reproduisant les totaux de contrôle de @thierry
(mensuel 1 804,21 · trimestriel 45 → 15 · annuel 528 → 44 · **effort lissé
1 863,21 €/mois**, recalculé en SQL indépendamment de l'application), plus un plan
d'apurement « SPF Impôt » de 220 €/mois désignant la **même dette** que la charge
mensuelle « Impôt 220 € ».

Le cockpit affiche :

```
Revenus              2 637 €
Charges fixes      − 1 804,21 €      ← contient « Impôt 220 € »
Provisions lissées      − 59 €
Engagements            − 220 €      ← le MÊME impôt, une seconde fois
Budget du mois         553,79 €      ← devrait être 773,79 €
```

**Le budget est minoré de 220 €.** Ce n'est pas rattrapable par une saisie plus
soigneuse : `charges` et `commitments` sont deux tables **sans clé étrangère ni
champ de liaison**, et `calculerSituationDuMois` additionne les deux sources sans
jamais les confronter :

```
resteDisponible = revenus − chargesFixes − provisionsLissees − engagementsMensuels
```

Aucune détection de doublon, aucun avertissement. Toute dette saisie aux deux
endroits sera comptée deux fois, **par construction**.

**Second agrégat, incohérent avec le premier, sur le même écran.** « Restant
Principal » du Plan du mois vaut 318,79 € = 2 637 − 500 − 14 − 1 804,21 : il
**ignore complètement** les engagements, là où « Budget du mois » les déduit. Deux
chiffres présentés comme « ce qu'il te reste », deux règles sur la même donnée.

## La cible

**1. `commitments` fait autorité sur sa propre mensualité.** Un plan d'apurement
_est_ une obligation mensuelle. Il ne doit pas exiger une charge jumelle pour être
payé ni pour apparaître dans le budget. L'utilisateur saisit **l'un ou l'autre**,
jamais les deux pour la même dette.

**2. Détection de doublon probable, qui avertit sans bloquer.** On ne présume pas
de l'intention, on la signale. Faisceau d'indices, à confirmer par mesure :

- montant identique (`charges.amount` = `commitments.installment_amount`)
- même jour du mois (`charges.payment_day` = `commitments.payment_day`)
- libellés proches (distance de Levenshtein normalisée, ou inclusion d'un token
  significatif — « Impôt » ⊂ « SPF Impôt — plan d'apurement »)

L'avertissement est **non bloquant** : bandeau ou mention sur les deux fiches,
avec l'écart chiffré (« ces deux lignes déduisent 440 € ; s'il s'agit de la même
dette, tu en comptes 220 € de trop »). Jamais de fusion automatique.

**3. Cohérence des agrégats.** Décider explicitement si « Restant Principal »
doit ou non déduire les engagements, et l'écrire. Deux réponses différentes sur
le même écran est un défaut en soi, indépendamment du doublon.

## Points ouverts, non tranchés ici

- **Migration des données existantes** : que faire des couples déjà saisis en prod ?
  Rien d'automatique — c'est précisément pourquoi cette note ne s'implémente pas
  seule.
- **Seuil de la détection** : trop lâche, elle crie au loup sur deux abonnements à
  9 € ; trop stricte, elle rate « Impôt » vs « SPF Impôt ». À calibrer sur des
  données réelles, pas à deviner.
- **Où vit l'avertissement** : domaine pur (testable, mais il faut le brancher —
  cf. le précédent de `genererNotifications()`, écrit, testé et **jamais rendu**),
  ou couche données.

## Ce qui n'est pas mesuré

- Le comportement avec un engagement **non mensuel** (trimestriel, annuel) en
  doublon d'une charge de même fréquence.
- L'effet sur « Épargne estimée » et « Santé des provisions », qui dérivent du
  même `resteDisponible`.
- La production : tout ceci est mesuré sur la stack locale.
