# ADR-043 — Les catégories que l'utilisateur crée lui-même

- **Statut** : Accepted
- **Date** : 2026-08-23
- **Accepté le** : 2026-08-23 par @thierry, arbitrage direct et non délégué — _« Pour la partie
  dépenses, c'est souvent lié à la vie courante, donc pas d'assurances, crédits, etc. Ne pas
  mélanger les catégories liées aux factures. Une solution serait de pouvoir créer nous-mêmes
  nos catégories pour les réutiliser facilement ensuite. »_
- **Proposé par** : @cc-ankora, sur constat d'usage de @thierry sur la feuille de saisie ⊕
- **Deciders** : @thierry, @cc-ankora
- **Amende** : [ADR-022](ADR-022-taxonomie-categories-et-categorisation-assistee.md), alternative
  écartée « Catégories libres saisies par l'utilisateur »
- **S'appuie sur** : [ADR-035](ADR-035-vocabulaire-des-quatre-chiffres.md) §5 (une occurrence de
  facture n'est jamais une dépense — les deux univers sont disjoints)
- **À lire avant** : la PR d'implémentation, qui n'est **pas** dans cette session

---

## Contexte & problème

ADR-022 a figé, le 26 juillet 2026, une taxonomie de 18 catégories réparties en 5 groupes. Au
passage, il a écarté une alternative en une phrase :

> **Catégories libres saisies par l'utilisateur** — reportée. Elles produisent des doublons
> (« courses », « Courses », « supermarché ») qui rendent tout graphique inexploitable. À rouvrir
> une fois la taxonomie fixe éprouvée.

Un mois plus tard, la taxonomie fixe **a été éprouvée** — par la seule personne qui utilise
l'application en production — et le verdict est venu sans qu'on le demande, en marge d'une
remarque sur la feuille de saisie :

> « Les catégories ne sont pas facilement accessibles, **on ne peut même pas créer les nôtres
> facilement et les gérer**. »

La condition de réouverture posée par ADR-022 est donc remplie. Elle l'est par l'usage, pas par
une échéance.

### Ce que l'usage a aussi tranché, et qui n'était pas la question posée

@thierry a répondu à une question sur les 18 catégories par une distinction que le code faisait
déjà **pour une autre raison que la sienne** :

- **Sa raison** : une dépense, c'est la vie courante. Une assurance, un crédit, une taxe, ce n'est
  pas une dépense qu'on note — c'est une facture qui tombe.
- **La raison du code** (ADR-035 §5) : `resteDisponible` déduit déjà chaque facture sous forme
  d'effort mensuel lissé. Une dépense classée « Assurances » déduirait une seconde fois le même
  argent, et « Il te reste » serait faux exactement du montant que l'utilisateur croyait bien
  noter.

Les deux raisons tombent au même endroit. C'est le meilleur signe qu'un invariant technique est
au bon endroit : la personne qui saisit l'aurait posé toute seule.

---

## Décisions

### D1 — Les catégories créées par l'utilisateur sont autorisées, et uniquement en `variable`

Une catégorie créée depuis la feuille de saisie de **dépense** est nécessairement une catégorie
de dépense : `kind = 'variable'`, sans sélecteur, sans choix possible.

**Pourquoi aucun sélecteur de type.** Offrir le choix entre « dépense » et « facture » à ce
moment-là, c'est demander à quelqu'un qui note 12 € de courses de comprendre l'invariant de
non-double-comptage. Un sélecteur qui n'a qu'une bonne réponse n'est pas un choix, c'est un
piège avec une case à cocher.

**Conséquence sur `is_system`.** Les catégories créées valent `is_system = false`. Le drapeau
existe depuis le 3 mai 2026 et n'a **jamais été lu par du code** : la seule ligne à `true` est
`'Autres'`, semée par
[`20260503000003_pr_d1_categories_enrichments.sql:52`](../../supabase/migrations/20260503000003_pr_d1_categories_enrichments.sql).
Il devient lisible au moment où une catégorie devient supprimable — donc pas ici.

### D2 — L'objection « doublons » d'ADR-022 est acceptée, pas écartée

ADR-022 avait raison : « courses », « Courses » et « supermarché » sont trois lignes pour une
seule idée, et un graphique qui les sépare est un graphique faux.

Ce qui change, ce n'est pas l'objection, c'est son poids relatif. **Une catégorie qu'on ne peut
pas créer est une catégorie qui n'existe pas** : l'utilisateur classe alors sa dépense sous
« Autres », ou renonce à la classer. Le graphique n'est pas plus juste — il est simplement faux
plus discrètement, dans une catégorie fourre-tout que personne ne suspecte.

**Ce qui est retenu contre les doublons** : un contrôle applicatif insensible à la casse et aux
espaces de bordure, avant l'écriture, qui refuse un nom déjà porté dans l'espace de travail.

**Ce qui n'est pas retenu, et pourquoi c'est écrit ici** : aucun index unique sur
`(workspace_id, name)`. Un index unique est une décision de schéma sur une table qui porte des
données de production ; il transformerait aussi une collision en erreur de base de données là où
un contrôle applicatif rend un message lisible. Le contrôle applicatif ne couvre donc **pas** deux
requêtes simultanées. Le pire cas — deux puces homonymes créées en double-tapant — est gênant,
réparable, et sans effet sur un montant.

Ce que le contrôle applicatif **ne peut pas** attraper non plus : « supermarché » à côté de
« Courses ». Aucun mécanisme automatique ne le peut sans deviner l'intention. C'est le prix
assumé de D1.

### D3 — Une catégorie créée n'a pas de groupe

`category_group` reste **NULL** pour toute catégorie créée par l'utilisateur.

La tentation était d'écrire `'vie_courante'`, puisque c'est ce que @thierry décrit. Elle est
refusée, et la raison est déjà dans le dépôt — la migration qui a créé la colonne l'écrit
elle-même à propos du rattrapage :

> `Rows a user has since renamed simply keep a null group — harmless, and better than guessing.`

Et la règle 10 du `CLAUDE.md` penche du même côté, à l'inverse de ce qu'on pourrait croire :
elle dit que chaque euro d'un total **a un nom**. Écrire un groupe que personne n'a choisi met de
l'argent dans un total que l'utilisateur n'a jamais autorisé, sous un nom fabriqué. Une ligne
sans groupe produit une ligne « non classée », qui est vraie.

Le fait qui tranche : `src/lib/data/categories.ts` **ne lit pas** `category_group`, et son
commentaire dit pourquoi. On écrirait une valeur devinée dans une colonne que rien ne consomme,
pour un lecteur qui n'existe pas encore.

### D4 — Créer, oui. Supprimer, pas dans cette décision

Cet ADR autorise la **création**. Le renommage, le changement de couleur et le retrait sont une
seconde décision, et elle bute sur une contrainte réelle :
`expenses/charges/commitments.category_id` porte `ON DELETE SET NULL`. Supprimer une catégorie ne
supprime pas les lignes — elle **déclasse silencieusement l'historique**. C'est un archivage
(`archived_at`) qu'il faut, donc une colonne, donc un ADR à part.

Deux faits mesurés le 23 août à verser à cette future décision :

- **La policy `categories_editor_write` est asymétrique.** `for all` avec
  `with check (… and created_by = auth.uid())` : sur un DELETE, seul `USING` s'applique, donc un
  éditeur peut **supprimer** la catégorie d'un autre membre ; sur un UPDATE, `WITH CHECK`
  s'applique aussi, donc il ne peut pas la **renommer**. Supprimer est plus permis que corriger.
  Sans effet aujourd'hui — un espace, un membre — et à trancher avant le premier partage.
- **Les 4 catégories `fixed`** (Taxes, Abonnements, Assurances, Crédits) n'apparaissent jamais
  dans le sélecteur de dépense. Un écran de gestion les listera forcément. Elles y seront
  présentées **séparément et avec leur raison**, jamais mélangées aux catégories de dépense —
  c'est la demande explicite de @thierry, et c'est aussi ce qui empêche quelqu'un de « ranger »
  une dépense dedans.

### D5 — Une catégorie créée est visible immédiatement, et ça se règle côté écran

Le classement des puces (`expense-categories.ts`) trie par nombre d'usages sur 30 jours. Une
catégorie neuve a **zéro usage** : elle sort donc dernière, derrière le bouton de débordement.
Livrer « crée ta catégorie » sans traiter ça, c'est livrer une catégorie qui disparaît à
l'instant de sa création.

**Le correctif est local à l'écran** : au retour de l'action, la catégorie est ajoutée à la
rangée de puces et sélectionnée. Rien n'est évincé — les puces passent à la ligne depuis
[`AddExpenseSheet.tsx`](../../src/components/expenses/AddExpenseSheet.tsx) (rangée `flex-wrap`),
donc le plafond de 5 n'est plus une contrainte de rangée mais de volume.

**Le tri du domaine n'est PAS modifié**, et c'est une décision, pas un oubli. Le réflexe était de
trier les catégories sans usage de la plus récente à la plus ancienne. Une mesure l'a tué :

> `categories.created_at` vaut `default now()`, et `now()` est `transaction_timestamp()` —
> constant sur toute une transaction. Or `handle_new_user()` appelle `seed_default_categories`
> puis `seed_expense_categories` **dans la même transaction de trigger**. Pour tout compte créé
> depuis l'application de `20260729000002`, **les 18 catégories portent un `created_at`
> strictement identique.**

Un tri par date de création ne trierait donc rien pour les nouveaux inscrits, et trierait
autrement pour les anciens — rattrapés, eux, par deux blocs de migration distincts. Deux
utilisateurs verraient deux ordres, sans que rien dans le code ne l'explique.

**Corollaire à ne pas perdre** : le commentaire de `src/lib/data/categories.ts` qui justifie
`.order('created_at')` par « le semis insère dans un ordre délibéré » est **déjà faux** pour les
nouveaux comptes — 18 lignes ex æquo rendent un ordre que PostgreSQL ne garantit pas. Dette
préexistante, tracée ici, à traiter à part.

---

## Conséquences

**Ce que ça coûte.** Aucune migration : la table porte déjà toutes ses colonnes, la policy
d'insertion existante suffit (`WITH CHECK` seul s'applique à un INSERT, et il exige
`created_by = auth.uid()`), et `audit_log.event_type` est du texte libre. Un Server Action, un
schéma Zod, une ligne de création dans la feuille, des clés de traduction.

**Ce que ça ouvre.** Un nom saisi librement est une donnée de l'utilisateur. Deux vérifications
faites plutôt que supposées : l'export RGPD sélectionne déjà `categories` filtrées sur
`created_by`, et la suppression de compte les emporte par la clé étrangère
`created_by … on delete cascade`. Rien à ajouter — et surtout rien à inventer.

**Ce que ça ferme.** La question « pourquoi je ne peux pas noter mes courses sous un nom qui me
parle » ne se repose plus.

**Ce qui reste ouvert**, et qui ne se décide pas ici :

| Question                                                                                     | Où                                               |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Archivage plutôt que suppression (`archived_at`)                                             | ADR dédié                                        |
| Index unique `(workspace_id, name)`                                                          | avec l'ADR d'archivage — même table, même moment |
| Asymétrie RLS supprimer/renommer                                                             | avant le premier espace à plusieurs membres      |
| `created_at` identique sur les 18 semées                                                     | dette tracée, PR à part                          |
| `.order('created_at')` dont le commentaire est faux                                          | même PR que la ligne ci-dessus                   |
| L'invariant « changer une catégorie ne bouge aucun agrégat » **n'est prouvé par aucun test** | PR à part — cf. ci-dessous                       |

**Sur ce dernier point.** `src/lib/domain/categories/types.ts` affirmait cet invariant en citant
`__tests__/category-is-not-a-calculation-axis.test.ts`. **Ce fichier n'existe nulle part.**
Ce qui est réellement prouvé, dans `cockpit/__tests__/pas-de-double-comptage.test.ts`, est
l'invariant voisin et plus étroit : une catégorie `fixed` n'est jamais offerte au sélecteur de
dépense. Le commentaire a été corrigé pour dire ce qui est vrai plutôt que repointé vers un test
qui prouve autre chose — un test qui prouve autre chose rend l'apparence de la preuve sans la
preuve. Le test manquant reste à écrire, et il devient plus utile avec ADR-043 : à partir du
moment où l'utilisateur crée ses propres catégories, il en changera aussi plus souvent.

---

## Alternatives écartées

**Laisser la taxonomie fermée et enrichir le semis.** Rejetée : c'est ce qui a été fait le
29 juillet (10 catégories ajoutées), et un mois plus tard le manque est reformulé par la même
personne. Une taxonomie décidée ailleurs ne peut pas couvrir les habitudes de quelqu'un
d'autre — il y aura toujours un « Coiffeur » ou un « Club de foot des enfants » que personne
n'avait prévu.

**Autoriser aussi la création de catégories de factures.** Rejetée : elle ouvre exactement le
chemin qu'ADR-035 §5 ferme, et @thierry l'a refusée avant qu'on la propose (« ne pas mélanger »).

**Un sélecteur de groupe à la création.** Rejetée : ADR-022 décision 1 pose deux niveaux pour la
**lecture**, un seul pour la **saisie**. Un second niveau à la création rétablit par la fenêtre
le coût de saisie que cet ADR avait sorti par la porte.
