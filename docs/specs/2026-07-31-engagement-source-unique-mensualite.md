# Conception — un engagement fait autorité sur sa propre mensualité

- **Date** : 2026-07-31
- **Statut** : **conception, non implémentée.** Touche les données de @thierry ;
  attend sa validation.
- **Décision produit** : @thierry, rapportée par @cowork le 2026-07-31.
- **Origine** : double déduction mesurée sur un profil de test à valeurs contrôlées.

## Le défaut, mesuré

Profil de test local, 19 charges d'un profil fictif (valeurs remplacées le 2 octobre 2026, dépôt public)
(mensuel 1 455,37 · trimestriel 60 → 20 · annuel 456 → 38 · **effort lissé
1 513,37 €/mois**, recalculé en SQL indépendamment de l'application), plus un plan
d'apurement « SPF Impôt » de 190 €/mois désignant la **même dette** que la charge
mensuelle « Impôt 190 € ».

Le cockpit affiche :

```
Revenus              2 500 €
Charges fixes      − 1 455,37 €      ← contient « Impôt 190 € »
Provisions lissées      − 58 €
Engagements            − 190 €      ← le MÊME impôt, une seconde fois
Budget du mois         796,63 €      ← devrait être 986,63 €
```

**Le budget est minoré de 190 €.** Ce n'est pas rattrapable par une saisie plus
soigneuse : `charges` et `commitments` sont deux tables **sans clé étrangère ni
champ de liaison**, et `calculerSituationDuMois` additionne les deux sources sans
jamais les confronter :

```
resteDisponible = revenus − chargesFixes − provisionsLissees − engagementsMensuels
```

Aucune détection de doublon, aucun avertissement. Toute dette saisie aux deux
endroits sera comptée deux fois, **par construction**.

**Second agrégat, incohérent avec le premier, sur le même écran.** « Restant
Principal » du Plan du mois vaut 530,63 € = 2 500 − 500 − 14 − 1 455,37 : il
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
avec l'écart chiffré (« ces deux lignes déduisent 380 € ; s'il s'agit de la même
dette, tu en comptes 190 € de trop »). Jamais de fusion automatique.

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
