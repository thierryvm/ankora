# Audit écran par écran sur un profil de test à valeurs contrôlées

- **Date** : 2026-07-31
- **Méthode** : stack Supabase **locale** (CLI épinglée 2.84.2), build de
  production, viewport iPhone **390 × 844**. Profil semé par
  `scripts/dev/seed-profil-test.mjs`, écrans relevés par
  `scripts/dev/audit-ecrans.mjs`.
- **Production** : jamais touchée.

## Étalon

19 charges d'un profil de test fictif (valeurs remplacées le 2 octobre 2026, dépôt public : les égalités ci-dessous sont recalculées sur ce profil, la mesure d'origine portait sur l'ancien). Totaux **recalculés en
SQL, hors application** :

| Fréquence     |      Somme |  Lissé mensuel |
| ------------- | ---------: | -------------: |
| mensuelles    | 1 455,37 € |     1 455,37 € |
| trimestrielle |       60 € |           20 € |
| annuelles     |      456 € |           38 € |
| **total**     |            | **1 513,37 €** |

Équivalent annuel : **18 160,44 €**.

## Ce qui est juste

- **Écran Charges** : affiche `Effort lissé / mois 1 513,37 €` et
  `Équivalent annuel 18 160,44 €` — l'étalon à l'euro près. Sous-totaux
  conformes, `Reste à payer ce mois 1 515,37 €` = 1 455,37 + 60.
- **Projection des échéances annuelles** : Taxe de circulation au 1ᵉʳ mars 2027, Taxe
  égouts au 1ᵉʳ juin 2027 — les occurrences 2026 étant passées, correct.
- **Dépenses** : `170,90 €`, `≈ 5,51 €/jour sur 31 jours` (170,90 / 31 = 5,51).
- **Engagements** : `0/12 échéances de 190 €`, reste `2 280 €`.
- **Comptes** : les cinq champs sont peuplés (2500, 500, 1200, 180, 430),
  vérifié **au DOM**.
- **Simulateur** : le sélecteur expose bien les **19 charges**.
- **« Épargne estimée » n'est pas un doublon de « Il te reste ».** Cf. plus bas.

## « Épargne estimée » — la question posée, et sa réponse

Le cockpit affichait **382,89 € pour les deux chiffres**. Sur un écran portant
déjà un double comptage avéré, l'hypothèse d'un second agrégat mal câblé
méritait une mesure.

```
ilTeReste      = budgetDuMois − depensesDuMois
epargneEstimee = budgetDuMois − depensesDuMois × joursDuMois / joursEcoules
```

Le **dernier jour du mois**, `joursEcoules === joursDuMois` : le facteur de
projection vaut 1 et la seconde formule dégénère littéralement en la première.
L'égalité était donc la bonne réponse un 31, pas une duplication.

Vérifié par exécution du domaine, pas par lecture — à J15 sur le même profil :

```
J15 → ilTeReste = 441,89 €   epargneEstimee = 259,60 €
J6  → epargneEstimee = null   (« — », pas zéro : moins de 7 jours écoulés)
```

Figé par `src/lib/domain/cockpit/__tests__/epargne-estimee-vs-il-te-reste.test.ts`,
pour que personne ne reclasse ce cas en défaut ni ne « corrige » l'égalité du
dernier jour.

## Défauts, non corrigés

1. **Double comptage** (majeur) — une charge mensuelle et un plan d'apurement
   désignant la même dette sont déduits deux fois. `Budget du mois 553,79 €` où
   773,79 € est dû. Conception arbitrée :
   [`docs/specs/2026-07-31-engagement-source-unique-mensualite.md`](../specs/2026-07-31-engagement-source-unique-mensualite.md).
2. **Agrégats incohérents sur le même écran** — « Restant Principal » ignore les
   engagements que « Budget du mois » déduit.
3. **Reproche sur un mois antérieur aux données** — « Jamais cochées en Juin :
   … » énumère 15 charges créées le jour même. L'application demande des comptes
   sur une période où l'utilisateur n'existait pas.
4. **Message de blocage désignant le mauvais prérequis** — le Plan du mois
   affiche « Renseigne d'abord tes comptes » puis réclame le **revenu mensuel**,
   qui est renseigné et affiché juste au-dessus. Le champ réellement manquant
   est le virement Vie Courante (`workspaces.vie_courante_monthly_transfer`).

## Deux leçons d'instrument

Elles n'ont rien coûté ici parce qu'elles ont été rattrapées — elles auraient
produit deux faux rapports de bug.

**`innerText` n'expose pas la valeur des champs.** L'écran Comptes semblait
présenter cinq champs vides ; ils contenaient 2500, 500, 1200, 180 et 430. Toute
vérification portant sur un `<input>`, `<select>` ou `<textarea>` doit lire le
DOM (`element.value`), jamais le texte rendu.

**Chercher le mauvais rôle échoue en silence et se lit comme un défaut
applicatif.** Le sélecteur de charge du simulateur porte `role="combobox"` ;
`getByRole('button', { name: /choisis une charge/i })` ne le trouve donc jamais,
alors que son texte visible est exactement celui-là. Le timeout ressemble à « le
sélecteur est cassé » alors qu'il dit « ma sonde regarde ailleurs ». Vérifier le
rôle réel avant de conclure — c'est la même famille que le reste :
l'instrument qui ment.

## Non mesuré

- Le comportement de l'`Épargne estimée` **dans l'application** en milieu de
  mois : mesuré au niveau du domaine, pas rendu à l'écran à une date antérieure.
- Les écrans Admin.
- Safari iOS réel (émulation Chromium).
