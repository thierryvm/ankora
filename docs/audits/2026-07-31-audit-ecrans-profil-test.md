# Audit écran par écran sur un profil de test à valeurs contrôlées

- **Date** : 2026-07-31
- **Méthode** : stack Supabase **locale** (CLI épinglée 2.84.2), build de
  production, viewport iPhone **390 × 844**. Profil semé par
  `scripts/dev/seed-profil-test.mjs`, écrans relevés par
  `scripts/dev/audit-ecrans.mjs`.
- **Production** : jamais touchée.

## Étalon

19 charges reproduisant les données réelles de @thierry. Totaux **recalculés en
SQL, hors application** :

| Fréquence     |      Somme |  Lissé mensuel |
| ------------- | ---------: | -------------: |
| mensuelles    | 1 804,21 € |     1 804,21 € |
| trimestrielle |       45 € |           15 € |
| annuelles     |      528 € |           44 € |
| **total**     |            | **1 863,21 €** |

Équivalent annuel : **22 358,52 €**.

## Ce qui est juste

- **Écran Charges** : affiche `Effort lissé / mois 1 863,21 €` et
  `Équivalent annuel 22 358,52 €` — l'étalon à l'euro près. Sous-totaux
  conformes, `Reste à payer ce mois 1 849,21 €` = 1 804,21 + 45.
- **Projection des échéances annuelles** : Taxe voiture au 1ᵉʳ mars 2027, Taxe
  égout au 1ᵉʳ juin 2027 — les occurrences 2026 étant passées, correct.
- **Dépenses** : `170,90 €`, `≈ 5,51 €/jour sur 31 jours` (170,90 / 31 = 5,51).
- **Engagements** : `0/12 échéances de 220 €`, reste `2 640 €`.
- **Comptes** : les cinq champs sont peuplés (2637, 500, 1200, 180, 430),
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
présenter cinq champs vides ; ils contenaient 2637, 500, 1200, 180 et 430. Toute
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
