# Le seul espace qui avait des données est le seul qui n'a jamais été migré

- **Date** : 2026-08-02
- **Gravité** : le sélecteur de dépense n'offre que **2 catégories sur 9** dans
  l'espace de production réellement utilisé. Rien n'est cassé au sens du code —
  c'est la donnée qui date d'une taxonomie antérieure au code.
- **Statut** : **diagnostiqué, non corrigé.** La correction est une migration de
  données sur la production ; elle relève de @thierry, pas d'une session.
- **Mesuré le** : 2026-08-02, en lecture seule sur la base de production
  (`fkscfvoouwufyjwnfvhb`), API Management avec `read_only: true`

## Symptôme

Panneau « Nouvelle dépense » sur `ankora.be` : **deux pastilles**, « Courses » et
« Autres ». Pas de débordement, pas de défilement — il n'y en a réellement que
deux.

## Ce que la base contient vraiment

Six espaces existent. Un seul porte des données réelles, et c'est le seul qui
diffère. Identifié par recoupement avec la capture : **17 charges**, exactement le
« 17 charges · 12 dues ce mois » affiché.

| Espace     | Créé le    | Catégories | dont `variable` | Charges | Dépenses | Lignes portant `color` hex |
| ---------- | ---------- | ---------- | --------------- | ------- | -------- | -------------------------- |
| `56d4a74f` | 2026-04-17 | **9**      | **2**           | **17**  | 5        | **9 / 9**                  |
| `6fa6da64` | 2026-04-17 | 8          | 5               | 0       | 0        | 0                          |
| `cdd38929` | 2026-04-19 | 8          | 5               | 1       | 0        | 0                          |
| `6c406de4` | 2026-04-20 | 8          | 5               | 0       | 0        | 0                          |
| `4367fd96` | 2026-05-03 | 8          | 5               | 3       | 0        | 0                          |
| `2bd90ea0` | 2026-08-01 | 8          | 5               | 0       | 0        | 0                          |

Les 9 catégories de `56d4a74f` sont datées du **2026-04-17 19:12:17** et portent
`color` en hexadécimal (`#4F46E5`, `#22C55E`…) plus `icon` (`home`, `car`,
`shopping-cart`…). Partout ailleurs, `color` et `icon` sont `null` et les lignes
sont datées du 2026-05-03. Deux générations de seed, reconnaissables à l'œil nu.

**Les `kind` ne concordent pas non plus** :

| Catégorie   | `56d4a74f` (avril) | Tous les autres (mai) |
| ----------- | ------------------ | --------------------- |
| Logement    | `fixed`            | `variable`            |
| Famille     | `fixed`            | `variable`            |
| Santé       | `fixed`            | `variable`            |
| Transport   | `fixed`            | `variable`            |
| Taxes       | `fixed`            | `fixed`               |
| Abonnements | `fixed`            | `fixed`               |
| Assurances  | `fixed`            | `fixed`               |
| Autres      | `variable`         | `variable`            |
| **Courses** | **`variable`**     | **absente**           |

## Le mécanisme

`20260503000003` a remplacé la taxonomie d'avril par une autre : 8 catégories,
`color_token` à la place du hex, **sans « Courses »**, et 5 `variable` au lieu de 2. Son backfill appelle `seed_default_categories`, dont la première instruction
est :

```sql
if exists (select 1 from public.categories where workspace_id = ws_id) then
  return;
end if;
```

Vérifié **en production** : la fonction porte toujours ce garde, et ne mentionne
nulle part « Courses ».

Ce garde est correct pour ce qu'il protège — il évite de dupliquer des catégories
existantes. Mais son effet de bord est exactement inverse de l'intention du
backfill : **il exclut du backfill précisément les espaces qui ont déjà des
données**, c'est-à-dire les seuls pour lesquels une migration était nécessaire.

Les trois espaces créés en avril qui ont bien reçu la taxonomie de mai n'y ont eu
droit que parce qu'ils étaient **vides** au moment du backfill — leurs catégories
sont datées du 2026-05-03, pas de leur date de création. `56d4a74f`, lui, avait
déjà ses 9 lignes d'avril : le garde a rendu la main, et il est resté sur la
taxonomie d'avril pour toujours.

## Pourquoi cela donne exactement deux pastilles

ADR-035 §5 exclut `kind = 'fixed'` du sélecteur de dépense, pour ne pas déduire
deux fois une facture déjà lissée. Dans la taxonomie d'avril, Logement, Famille,
Santé et Transport **sont** `fixed`. Il reste Courses et Autres.

**Le sélecteur fait exactement ce pour quoi il a été écrit.** Il l'applique à une
donnée façonnée par une taxonomie qui précède la règle de deux mois et demi.

## Conséquence à anticiper sur `20260729000002`

`INFERRED` — cette migration n'est pas appliquée en production (vérifié : la
colonne `category_group` est absente, et la fonction `seed_expense_categories`
n'existe pas). Lecture du fichier, non mesurée :

`seed_expense_categories` insère sous garde `not exists (workspace_id, name)`, et
ne touche jamais le `kind` d'une ligne existante. Appliquée telle quelle à
`56d4a74f`, elle ajouterait 9 catégories (« Courses » y existe déjà, donc sautée)
mais **laisserait Logement, Famille, Santé et Transport en `fixed`**. Cet espace
continuerait donc d'offrir un sélecteur différent de tous les autres, avec quatre
catégories courantes durablement absentes.

Autrement dit : la migration à écrire n'est pas seulement additive. Il y a une
**réconciliation de `kind`** à faire pour les espaces d'avril, ou une décision
explicite de ne pas la faire.

## Pour l'audit de base

Le seed **appliqué** en production diffère du seed que décrivent les fichiers de
migration, pour un espace sur six — et c'est celui qui compte. Toute conclusion
tirée d'un fichier de migration plutôt que des lignes est suspecte sur cette
table. Cette note existe parce qu'une telle conclusion a été tirée, et qu'elle
était fausse : « Courses » a été déclarée impossible en production sur la foi du
seed de mai, alors qu'elle y est depuis le 17 avril.
