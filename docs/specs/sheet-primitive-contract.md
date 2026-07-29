# Contrat comportemental de la primitive `<Sheet>`

**Statut** : spécification récoltée, primitive non encore écrite
**Date de récolte** : 2026-07-29
**Source** : `src/components/atoms/__tests__/Drawer.test.tsx` (634 lignes, 35 cas), supprimé par [ADR-034](../adr/ADR-034-suppression-atoms-et-design-playground.md)
**Restitution de la source** : `git show 36680f7:src/components/atoms/__tests__/Drawer.test.tsx`
**Implémentation associée, également supprimée** : `git show 36680f7:src/components/atoms/Drawer.tsx` (615 lignes)

---

## Pourquoi ce document existe

`atoms/Drawer.tsx` n'avait aucun call-site de production. Ses 634 lignes de tests, en revanche, sont une **spécification comportementale écrite** de ce qu'un panneau glissant doit faire — accumulée sur plusieurs mois de corrections.

Ce qui a été jeté, c'est l'implémentation. Ce qui est gardé ici, c'est le contrat. Il devient le cahier des charges de la primitive `<Sheet>` unique qui remplacera les **6 panneaux glissants actuellement en production**, dont aucun ne partage une ligne de code avec un autre.

> ⚠️ **Ce contrat est un point de départ, pas une cible suffisante.** Voir §3 : les quatre exigences d'accessibilité modale les plus importantes n'étaient **pas** couvertes par la source.

---

## 1. Contrat vérifié par la source (35 cas)

### 1.1 États d'ouverture

| Comportement   | Attendu                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `open={false}` | La racine porte `aria-hidden="true"`                                                           |
| `open={true}`  | La racine porte `aria-hidden="false"` **et** une classe d'état ouvert                          |
| Ouverture      | Le **premier champ non-readonly** reçoit le focus, via `requestAnimationFrame` (pas synchrone) |

### 1.2 Fermeture — quatre chemins, tous vers `onCancel`

| Déclencheur                          | Comportement                                  |
| ------------------------------------ | --------------------------------------------- |
| `Escape` (keydown sur `window`)      | `onCancel()`                                  |
| Toute autre touche                   | **Rien** (vérifié explicitement avec `Enter`) |
| Clic sur le voile (backdrop)         | `onCancel()`                                  |
| Bouton « Annuler » du pied           | `onCancel()`                                  |
| Bouton de fermeture (icône, en-tête) | `onCancel()`                                  |

### 1.3 Validation à la sauvegarde

| Cas                               | Comportement                                                         |
| --------------------------------- | -------------------------------------------------------------------- |
| Champ requis vide                 | `onSave` **non appelé**, message « Requis » affiché                  |
| Tous les requis remplis           | `onSave` appelé avec les valeurs exactes                             |
| Saisie dans un champ en erreur    | L'erreur disparaît au `change` (pas au blur, pas à la re-soumission) |
| Fonction `validate` personnalisée | Son message d'erreur est affiché et bloque `onSave`                  |

### 1.4 Champ monétaire (`type="money"`)

- Affiche un suffixe `€`
- **Filtre les caractères non numériques à la saisie**
- Refuse `NaN` → « Montant invalide »
- Refuse les valeurs négatives → « Montant invalide »

### 1.5 Suppression en deux temps

| Étape                   | Comportement                                            |
| ----------------------- | ------------------------------------------------------- |
| 1er clic « Supprimer »  | `onDelete` **non appelé** ; une confirmation s'affiche  |
| Clic « Oui, supprimer » | `onDelete` appelé avec les valeurs                      |
| Clic « Non »            | Retour au bouton initial ; `onDelete` **jamais** appelé |

### 1.6 Les sept types de champs

| Type        | Rendu                                                                                | Interaction vérifiée                                                           |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `text`      | `<input type="text">` ; `inputType` permet `email`                                   | —                                                                              |
| `money`     | `<input>` + suffixe `€`                                                              | filtrage + validation (§1.4)                                                   |
| `date`      | `<input type="date">`                                                                | `onChange` propage la valeur jusqu'à `onSave`                                  |
| `select`    | `<select>` avec option placeholder                                                   | `onChange` propage la valeur                                                   |
| `category`  | Grille de pastilles cliquables                                                       | Clic → valeur ; emoji **optionnel** (rendu sans `<span>` si absent)            |
| `frequency` | Groupe segmenté `role="radiogroup"`, **4 boutons par défaut**, chacun `role="radio"` | Clic → `aria-checked="true"` ; `options` personnalisées remplacent les défauts |
| `notes`     | `<textarea>`                                                                         | `onChange` propage la valeur                                                   |

### 1.7 Divers

- `subtitle` est rendu dans l'en-tête
- Le texte d'aide (`help`) s'affiche **en l'absence d'erreur**
- Un champ `disabled` a `disabled` **et** `readOnly` à `true`

---

## 2. Ce que la source ne couvrait PAS — et qui doit être ajouté

Ces quatre points sont **absents des 35 cas**, alors que trois d'entre eux étaient présents dans l'implémentation et que le quatrième était un bug ouvert. Ce sont les exigences les plus importantes d'une primitive modale, et ce sont précisément celles qui manquaient.

| Exigence                                                                                    | Statut dans la source                                                                                                        | Exigence pour `<Sheet>`  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Piège de focus** (cyclage `Tab` / `Shift+Tab` entre premier et dernier élément focusable) | **Aucun test.** Le commentaire du composant qualifiait lui-même son piège de « minimal »                                     | **Obligatoire et testé** |
| **`aria-modal="true"`**                                                                     | Présent dans le JSX, **aucune assertion**                                                                                    | **Obligatoire et testé** |
| **Verrou de défilement du corps**                                                           | **Aucun test** (ni `document.body.style.overflow`, ni équivalent)                                                            | **Obligatoire et testé** |
| **`env(safe-area-inset-bottom)`**                                                           | **Aucun test** — et l'issue #152 signalait que le pied du panneau collidait avec l'indicateur d'accueil des iPhone à encoche | **Obligatoire et testé** |

À ajouter également, absent de la source comme des 6 panneaux actuels :

- **Restitution du focus à la fermeture** (retour à l'élément déclencheur)
- **Fermeture par glissement vers le bas** (mobile)
- **Ancrage** : bas sur mobile, droite à partir de `md`
- **Poignée** (`grab handle`) 36 × 5 px

---

## 3. État des 6 panneaux en production au 29/07/2026

Mesuré lors de l'audit. C'est la dette que la primitive doit effacer.

| Fichier                        | Lignes | `Escape` | Piège de focus | Verrou de scroll | `safe-area` | `aria-modal` |
| ------------------------------ | -----: | :------: | :------------: | :--------------: | :---------: | :----------: |
| `ChargeEditDrawer.tsx`         |    254 |    ✅    |       ❌       |        ✅        |     ❌      |      ✅      |
| `ExpenseEditDrawer.tsx`        |    311 |    ✅    |       ❌       |        ✅        |     ❌      |      ✅      |
| `AjusterResteAVivreDrawer.tsx` |    306 |    ✅    |       ❌       |        ✅        |     ❌      |      ✅      |
| `SimulatorDrawer.tsx`          |    211 |    ✅    |       ✅       |        ✅        |     ✅      |      ✅      |
| `MoreSheet.tsx`                |    370 |    ✅    |       ✅       |        ✅        |     ✅      |      ✅      |
| `HeaderNav.tsx`                |    420 |    ✅    |       ✅       |        ✅        |     ✅      |      ✅      |

**Les trois panneaux d'édition — ceux qu'on ouvre tous les jours — n'ont ni piège de focus ni gestion du safe-area iOS.** Les trois qui les ont sont ceux écrits en dernier : chaque nouveau panneau réapprenait le métier. C'est exactement ce que produit l'absence de primitive — la qualité dépend de la date d'écriture du fichier, pas d'un contrat.

> Note : `AjusterResteAVivreDrawer.tsx` est **supprimé** par [ADR-035](../adr/ADR-035-vocabulaire-des-quatre-chiffres.md) (l'enveloppe budgétaire disparaît). La primitive aura donc **5** panneaux à absorber, pas 6.

---

## 4. Garde-fou attendu

Sur le patron d'`app-destinations.test.ts`, qui a déjà fait ses preuves dans ce dépôt : un test qui parcourt `src/**/*{Drawer,Sheet}*.tsx` et **échoue si un fichier réimplémente son propre `keydown` sur `Escape`** ou son propre verrou de défilement.

La régression devient alors impossible, pas seulement corrigée.
