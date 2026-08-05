# Parcours complet d'un nouvel utilisateur — 5 août 2026

**Méthode** : Supabase local éphémère, persona semé de bout en bout, navigateur réel
(Chromium, viewport 390 × 844, locale `fr-BE`). Chaque écran chargé, chaque menu ouvert, chaque
erreur de console capturée. Tout ce qui suit est **mesuré**, jamais déduit.

Le persona : 16 charges (loyer, énergie, eau, internet, mobile, 3 assurances, 3 taxes, 2 postes
d'entretien prévisible, 2 abonnements), 3 engagements (crédit voiture 36×, cuisine 24×, soins
dentaires 6×), 8 dépenses réparties sur le mois, 3 comptes avec solde, revenu 2 693 €.

---

## 1. Ce qui marche

| Écran                              | HTTP | Navigation présente |
| ---------------------------------- | ---- | ------------------- |
| `/` (visiteur)                     | 200  | burger              |
| `/app`                             | 200  | barre d'onglets     |
| `/app/charges`                     | 200  | barre d'onglets     |
| `/app/expenses`                    | 200  | barre d'onglets     |
| `/app/accounts`                    | 200  | barre d'onglets     |
| `/app/commitments`                 | 200  | barre d'onglets     |
| `/app/simulator`                   | 200  | barre d'onglets     |
| `/app/settings`                    | 200  | barre d'onglets     |
| `/faq` · `/glossaire` · `/legal/*` | 200  | barre d'onglets     |
| `/admin`                           | 200  | barre d'onglets     |

**Aucun débordement horizontal** à 390 px, sur aucun écran. **Aucune requête ≥ 400** en dehors
des deux routes inexistantes ci-dessous.

Balayage complémentaire, 10 surfaces × 5 largeurs (390 → 1600 px) en connecté : **aucun état où
un utilisateur se retrouve sans chemin de navigation vers l'application.**

---

## 2. Deux routes annoncées par la documentation et absentes du code

```
/app/settings/security  → HTTP 404
/app/settings/data      → HTTP 404
```

`CLAUDE.md` situait l'interface MFA à `/app/settings/security`. Le dossier
`src/app/[locale]/app/settings/` ne contient que `page.tsx` et `deletion-status/`. **La 2FA
existe bel et bien** — le bouton « Activer la 2FA » est mesuré sur `/app/settings` — c'est le
chemin documenté qui est faux. Corrigé dans le même lot.

---

## 3. Le modèle de revenus ne peut pas représenter ce persona

Table `incomes` : **absente**. Le revenu est un scalaire unique,
`workspaces.monthly_income`.

Conséquence directe, à voir avant la refonte : un utilisateur dont les rentrées sont **variables
ou multiples** — salaire versé en deux fois, prime annuelle, indemnité d'assurance, revenu
d'appoint — n'a **aucun endroit où les saisir**. Il doit inventer une moyenne, et tous les
chiffres du cockpit héritent de cette invention.

C'est exactement le besoin exprimé par @thierry (« mes rentrées sont aléatoires »), et c'est la
décision **D2 d'ADR-038**, déjà arbitrée : revenus datés, `monthly_income` **supprimée** — pas
réinterprétée. Ce parcours en donne la démonstration concrète.

---

## 4. Cibles tactiles sous le minimum

Relevé sur les contrôles interactifs **visibles**, à 390 px.

| Contrôle                         | Mesure  | Écrans              |
| -------------------------------- | ------- | ------------------- |
| Liens légaux du pied de page     | 16 px   | `/`                 |
| « Voir Juillet »                 | 17 px   | cockpit             |
| « Renommer le compte … » (×3)    | 28 px   | cockpit             |
| « Mois précédent » / « suivant » | 36 × 36 | factures            |
| « Voir toutes les dépenses → »   | 36 px   | cockpit             |
| « Ajuster mes comptes »          | 36 px   | cockpit             |
| « Mettre à jour »                | 36 px   | comptes             |
| « Ajouter une charge »           | 40 px   | factures            |
| « Ajouter un engagement »        | 40 px   | engagements         |
| « Enregistrer »                  | 40 px   | comptes, paramètres |
| « Activer la 2FA »               | 40 px   | paramètres          |

**WCAG 2.2 AA (2.5.8) exige 24 × 24 px.** Les deux premières lignes échouent — 16 px et 17 px.
Les autres passent le critère AA mais restent sous les **44 px** de l'Apple HIG, que ce projet
s'impose ailleurs (`min-h-11` sur la barre d'onglets, sur les disclosures, sur les boutons de
la bannière).

Une seule ligne est donc une **non-conformité**, les autres une **incohérence interne** : le
même dépôt applique deux standards de cible tactile selon l'écran.

---

## 5. Erreurs de console

**Violations CSP `style-src`** sur presque chaque écran, en développement, et **deux occurrences
mesurées en production sur la landing** :

```
Applying inline style violates the following Content Security Policy directive
'style-src 'self' 'nonce-…' 'unsafe-inline''
```

Origine **non établie**. C'est un constat, pas un diagnostic — il faudra remonter à l'émetteur
avant de proposer quoi que ce soit.

**Un avertissement d'hydratation** :

> A tree hydrated but some attributes of the server rendered HTML didn't match the client
> properties.

Également non diagnostiqué.

---

## 6. Le menu « Plus » occupe 85 % de l'écran

Mesuré : **15 entrées interactives**, feuille de **717 px** de haut sur un viewport de 844 px.

| Section     | Entrées                                                     |
| ----------- | ----------------------------------------------------------- |
| Compte      | Se déconnecter                                              |
| Mon cockpit | Simuler · Engagements · Comptes · Paramètres                |
| Ressources  | FAQ · Glossaire · CGU · Confidentialité · Cookies           |
| Préférences | Mode sombre · Français (BE) · English · Préférences cookies |

Les cinq entrées « Ressources » sont consultées une fois par an ; elles occupent un tiers de la
feuille, au-dessus de la ligne de flottaison. C'est ce que @thierry décrit par « un gros bordel
de liens ».

La **barre du bas**, elle, tient : Cockpit · Factures · ⊕ · Dépenses · Plus, cinq créneaux, le
plafond Apple HIG. Rien à y changer — les trois destinations sont celles qu'on visite tous les
jours, et le ⊕ est l'action la plus fréquente de l'application.

---

## 7. Ce que ce parcours ne mesure PAS

**Les temps de chargement ne sont pas exploitables.** Ils viennent d'un serveur de développement
qui compile chaque route à la première visite : `/admin` à 7,5 s ne dit rien de la production.
Une mesure de performance honnête demande un build de production et Lighthouse — à faire
séparément, et à ne pas confondre avec ce relevé.

**La cohérence des chiffres entre écrans** n'est vérifiée que grossièrement (présence de la
décomposition, comptage de symboles). Un contrôle sérieux demande de comparer poste par poste le
cockpit, la page factures et la page comptes — c'est le prochain incrément de ce harnais.

---

## 8. Suites

| Constat                         | Suite                                        |
| ------------------------------- | -------------------------------------------- |
| Routes documentées inexistantes | corrigé dans `CLAUDE.md`, ce lot             |
| Revenus mono-scalaire           | ADR-038 D2, déjà décidé, à exécuter          |
| Cibles tactiles                 | PR dédiée, en commençant par les 16 et 17 px |
| Violations CSP `style-src`      | à diagnostiquer avant de corriger            |
| Avertissement d'hydratation     | idem                                         |
| Feuille « Plus » à 15 entrées   | refonte du menu, avec la refonte globale     |
