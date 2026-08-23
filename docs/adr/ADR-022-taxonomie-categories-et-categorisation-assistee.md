# ADR-022 — Taxonomie des catégories et catégorisation assistée

- **Statut** : Accepted
- **Date** : 26 juillet 2026
- **Décideurs** : @thierry (carte blanche donnée le 26/07), @cc-ankora
- **Contexte technique** : table `categories` existante, 8 catégories semées à chaque
  inscription, `expenses.category_id` déjà écrit par le Server Action mais débranché côté UI

---

## Contexte

@thierry : « il manque encore la partie catégories pour pouvoir définir le type précis de la
dépense, exemple courses, essence, vêtements… avoir une sous-catégorie permettrait de générer
des graphiques par catégorie. À voir si on peut automatiser tout ça, si d'autres banques le
font pourquoi pas nous. »

L'audit a établi trois faits qui cadrent la décision :

1. La table `categories` existe depuis le schéma initial, avec `name`, `color_token`
   (contraint à 8 jetons du design system), `kind` (`fixed` | `variable`) et `is_system`.
2. **8 catégories sont semées à chaque inscription** : Logement, Famille, Taxes, Santé,
   Abonnements, Assurances, Transport, Autres. Elles constituent une taxonomie de **charges
   fixes**, pas de dépenses courantes.
3. `createExpenseAction` écrit déjà `category_id`. Ce sont **deux lignes d'UI** qui
   débranchent la chaîne : `categoryId: null` codé en dur, et un mapping RSC qui perd le
   champ avant qu'il n'atteigne le composant.

Autrement dit : rien à construire côté modèle, tout à brancher côté interface — plus une
taxonomie à compléter.

## Décision 1 — Deux niveaux pour la lecture, un seul pour la saisie

**Ce n'est pas exactement ce qui était demandé, et voici pourquoi.**

La demande portait sur des sous-catégories « pour générer des graphiques ». L'objectif est
juste ; le moyen coûterait cher. Une hiérarchie à deux niveaux **à la saisie** double le coût
de chaque dépense enregistrée : choisir un groupe, puis une feuille. Or l'étude de marché est
sans ambiguïté sur la cause de mort des applications à saisie manuelle — Goodbudget, le
comparable le plus direct d'Ankora : « si vous passez trois jours sans ouvrir l'app, vous avez
un arriéré de transactions à retrouver et à saisir ». La friction de saisie tue le produit
avant que le graphique n'ait servi.

**Décision** : une **liste plate** à la saisie, un **groupe** porté par la catégorie pour
l'agrégation. Un seul geste pour l'utilisateur, deux niveaux dans les graphiques —
« Vie courante 640 € » se déplie en Courses, Restaurant, Carburant.

Le groupe est une colonne de la catégorie, jamais une étape de sélection.

## Décision 2 — La taxonomie

18 catégories, 5 groupes. Les 8 existantes sont **conservées telles quelles** : elles sont
référencées par des lignes en production, et un renommage casserait l'historique.

| Groupe           | Catégories                                                                         |
| ---------------- | ---------------------------------------------------------------------------------- |
| **Vie courante** | Courses · Restaurant & café · Carburant · Shopping & vêtements · Loisirs & sorties |
| **Logement**     | Logement ᴱ · Énergie · Internet & télécom                                          |
| **Obligations**  | Assurances ᴱ · Taxes ᴱ · Santé ᴱ · Crédits                                         |
| **Famille**      | Famille ᴱ · Animaux                                                                |
| **Divers**       | Abonnements ᴱ · Cadeaux · Autres ᴱ ˢ                                               |

ᴱ existante, conservée · ˢ système (`is_system = true`, non supprimable)

**Pourquoi 18 et pas 60.** Monarch en livre ~60, mais la recommandation de praticien qui
l'accompagne est de 3 à 6 groupes et 3 à 12 catégories par groupe. bunq en livre 13 à plat.
Au-delà, l'utilisateur ne choisit plus : il prend la première qui ressemble, ou « Autres ».

**Pourquoi Carburant existe séparément de Transport.** Pour un ménage belge motorisé, le
carburant est une ligne récurrente lourde qui mérite sa propre lecture. Transport reste pour
le reste — transports en commun, entretien, parking.

**Ce qui n'est PAS livré ici** : les tags (second axe transverse, type `#vacances`), les
catégories personnalisées par l'utilisateur, les plafonds par catégorie. Chacun est une
couche ultérieure. Livrer les tags en même temps que les catégories, c'est demander à
l'utilisateur de comprendre deux systèmes d'un coup.

## Décision 3 — Catégorisation assistée, 100 % locale

Oui, c'est faisable sans accès bancaire — et c'est un **avantage**, pas un rattrapage.

Les banques belges (BNP Fortis, KBC, Beobank) catégorisent automatiquement parce qu'elles
voient tes transactions. KBC range d'ailleurs cette fonction sous **« Privacy »**, présentée
comme un confort que l'utilisateur _accorde_. Ankora ne voit pas tes transactions et n'en veut
pas : la catégorisation s'appuie sur le **libellé que tu tapes**, et rien ne quitte le serveur.

Deux sources de règles, dans cet ordre de priorité :

1. **Règles apprises** — quand tu catégorises « Intermarché » en Courses, la règle est
   mémorisée. C'est le mécanisme d'Actual Budget, verbatim : « si vous catégorisez le
   bénéficiaire "Kroger" en "Food" deux fois, une règle est créée automatiquement ».
2. **Dictionnaire de départ** — enseignes belges courantes (Delhaize, Colruyt, Aldi, Lidl,
   Carrefour, Intermarché → Courses ; Q8, Total, Shell, Esso → Carburant ; Proximus, Telenet,
   Orange → Internet & télécom…). Il évite l'écran vide du premier mois.

Une règle plus spécifique l'emporte sur une règle plus générale (`is` avant `contains`).

**À la correction**, le choix est proposé dans le flux, pas dans un écran de règles séparé —
c'est le pattern Revolut : « cette fois seulement » ou « toujours pour ce libellé ».

**Réversible et désactivable** : un réglage nommé, avec la liste des règles apprises,
supprimables une par une. La suggestion est toujours modifiable en un geste et n'est jamais
appliquée en silence sans que le champ soit visible.

## Décision 4 — L'icône et la couleur appartiennent à la catégorie

`color_token` existe déjà et est contraint à 8 jetons du design system. **Cette contrainte est
maintenue** : pas de sélecteur de couleur libre. Un hex arbitraire fait exploser le contraste
WCAG AA et casse le contrat visuel. C'est une décision de design, pas une limitation.

Une colonne `icon` est ajoutée, portant la **clé** d'un jeu d'icônes local — jamais une URL
distante (CSP stricte, budget 0 €).

## Décision 5 — Amendement de NORTH_STAR

Les « 8 sections obligatoires du dashboard » figées le 23 avril entrent en collision frontale
avec le retour de juillet : « les utilisateurs sont perdus ». Une liste de sections
obligatoires est une contrainte de _contenu_ là où le problème est une question de
_hiérarchie_.

**Remplacement** : « aucune question importante sans réponse » se substitue à « 8 sections
obligatoires ». Les questions restent à trancher explicitement ; leur nombre, leur ordre et
leur forme deviennent des décisions de design, pas un quota.

## Conséquences

**Schéma** — deux colonnes ajoutées à `categories` : `group` (enum) et `icon` (texte). Aucune
colonne supprimée, aucun renommage, donc aucune perte. Les 10 nouvelles catégories sont
semées pour les workspaces existants comme pour les nouveaux.

**Une table de règles** `category_rules` (`workspace_id`, `pattern`, `match_type`,
`category_id`, `source`) avec RLS par workspace, comme toutes les autres.

**Formules** — la catégorie n'entre dans **aucun** calcul de reste-à-vivre ni de provision.
C'est un axe de lecture, pas un axe de calcul. Cet invariant doit être testé : changer la
catégorie d'une dépense ne doit modifier aucun montant agrégé.

**FSMA** — un graphique par catégorie décrit le passé. Il ne doit produire aucune
recommandation d'allocation. « Tu as dépensé 340 € en Courses » est un constat ;
« tu devrais réduire tes Courses » serait du conseil.

**Ce que ça coûte si on se trompe** — une taxonomie trop fine se corrige en fusionnant des
catégories ; trop grossière, en en ajoutant. Les deux sont réversibles tant que la catégorie
n'entre pas dans les calculs, ce que la décision garantit.

## Alternatives écartées

**Hiérarchie à deux niveaux à la saisie** — rejetée : double le coût de saisie, sur un produit
dont la friction de saisie est le premier risque d'abandon identifié par l'étude de marché.
L'objectif visé (graphiques agrégés) est atteint par la colonne `group`.

**Catégorisation par appel à un service tiers** — rejetée : budget 0 €, et surtout elle
détruirait l'argument différenciant. Envoyer les libellés de dépenses à un tiers, c'est
exactement ce qu'Ankora reproche implicitement aux banques.

**Catégories libres saisies par l'utilisateur** — reportée. Elles produisent des doublons
(« courses », « Courses », « supermarché ») qui rendent tout graphique inexploitable. À
rouvrir une fois la taxonomie fixe éprouvée.

> **Rouvert le 23 août 2026 par [ADR-043](ADR-043-categories-creees-par-l-utilisateur.md).**
> La condition posée ici est remplie : la taxonomie fixe a été éprouvée en production, et le
> manque a été reformulé par @thierry un mois après l'ajout des 10 catégories du 29 juillet.
> L'objection « doublons » n'est pas écartée par ADR-043 — elle y est acceptée et pesée contre
> le fait qu'une catégorie qu'on ne peut pas créer envoie la dépense dans « Autres », ce qui ne
> rend pas le graphique plus juste, seulement faux plus discrètement.
