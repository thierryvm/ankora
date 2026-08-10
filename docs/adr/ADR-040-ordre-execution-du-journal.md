# ADR-040 — Le journal d'abord, la fondation ensuite

- **Statut** : Proposed
- **Date** : 2026-08-10
- **Proposé par** : @cc-ankora, sur mesures en base et en code du 2026-08-10, revu par `plan-reviewer` (🟡 APPROVED WITH CHANGES — les 7 corrections exigées sont intégrées)
- **Deciders** : @thierry, @cc-ankora
- **Tags** : `domain`, `schema`, `execution`, `cockpit`
- **Amende** : [ADR-038](ADR-038-journal-des-mouvements.md) — §Découpage d'exécution, D0, D3, et trois ajouts issus de @thierry le 2026-08-10
- **Ne remet en cause aucune décision de fond d'ADR-038.** Le journal, la dérivation des soldes, les rentrées datées, les deux plans comptables : tout reste.

---

## Pourquoi ce document existe

ADR-038 a été accepté le 5 août. Son **ordre d'exécution** place en première position D0 —
une migration de clé primaire sur `accounts` — au motif que c'est un prérequis.

Le 10 août, en vérifiant le schéma réel plutôt que le texte, six faits sont apparus. Trois
corrigent l'ADR, trois le complètent. Aucun ne le contredit sur le fond.

## Ce qui a été mesuré le 2026-08-10

Base locale Ankora (`supabase_db_ankora`), migrations, et `src/`.

| #   | Mesure                                                                                                                                                                                                                                                                                                   | Preuve                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `accounts` porte **quatre** colonnes d'identité de rôle, pas une : `kind`, `label` (marquées `DEPRECATED — will be dropped in PR-D2` le 3 mai) et `account_type`, `display_name` (canoniques, ADR-008). Les quatre sont `NOT NULL`. **PR-D2 n'a jamais eu lieu.**                                        | `20260503000001_pr_d1_accounts_typed.sql:24-28,46-48,83-86`                                              |
| 2   | **Zéro clé étrangère ne pointe vers `accounts`**, nulle part dans le dépôt. La « convention de FK composite » qu'ADR-038 dit renverser n'a jamais été implémentée.                                                                                                                                       | `select count(*) from pg_constraint where contype='f' and confrelid='public.accounts'::regclass` → **0** |
| 3   | `accounts` contient **3 lignes par workspace**. En production : 5 comptes utilisateurs, soit une quinzaine de lignes.                                                                                                                                                                                    | mesure locale : 6 lignes / 2 workspaces                                                                  |
| 4   | Ce qui interdit aujourd'hui un second compte physique dans un même rôle, ce n'est pas une contrainte mais **quatre** : la PK `(workspace_id, kind)`, l'index `accounts_workspace_account_type_unique`, les `CHECK` à trois valeurs sur `kind` et `account_type`, et l'absence de policies INSERT/DELETE. | `pg_indexes` + `20260417000004:20-38`                                                                    |
| 5   | `charges.paid_from` est contraint à **deux** valeurs — `('principal','epargne')` — et non trois. Seul `expenses.paid_from` en a trois.                                                                                                                                                                   | `charges_paid_from_check` en base ; `src/lib/domain/types.ts:23`                                         |
| 6   | `commitments` **n'a aucune colonne `paid_from`**.                                                                                                                                                                                                                                                        | `information_schema.columns` ; `20260719000001_commitments.sql:15-47`                                    |

## Décisions

### E1 — L'ordre d'exécution s'inverse : D0 passe en dernier

**Nouvel ordre** : D3 → D1 → D2 → D6 → D4+D8 → **D0**.

Le motif n'est **pas** le risque de la migration. Mesuré (faits 2 et 3), ce risque est
négligeable : une quinzaine de lignes, aucune clé étrangère entrante, aucun code ne lit un
`accounts.id` puisqu'il n'existe pas. **ADR-038 surévalue ce risque** (`:109` « la décision
la plus lourde de cet ADR », `:299` « risque principal ») ; la qualification est retirée
ici. Un ADR qui gonfle un risque pour justifier un ordre est aussi nocif qu'un ADR qui le
minimise.

Le motif réel tient en une phrase : **on ne pose pas une fondation pour un bâtiment qui n'a
pas de permis.** D0 sert le découplage des rôles de comptes, qu'ADR-038 met lui-même hors
périmètre (`:317` — « la refonte de la page comptes se décide seule »), sans date et sans
ADR. Et D0 seul ne débloque rien : trois des quatre verrous du fait 4 resteraient en place.

Trois vérifications appuient l'inversion :

- **D3 n'a pas besoin de D0.** Le problème que D3 résout est l'immuabilité : figer
  l'attribution au moment du paiement. Copier une valeur la fige, que la valeur soit un
  `uuid` ou un rôle. L'immuabilité vient de la copie, pas du type.
- **D1 non plus.** Une nouvelle table peut porter une clé étrangère composite vers
  `accounts` : rien ne s'y oppose (fait 2), RLS n'intervient pas dans la vérification d'une
  FK, et `seed_default_accounts` continue de fonctionner. Deux FK composites partageant
  `workspace_id` sont légales, et le côté nul — entrée ou sortie externe — est ignoré par
  `MATCH SIMPLE`, qui est le défaut. **C'est la sémantique voulue, et elle doit être écrite
  dans la migration** : un relecteur qui suppose `MATCH FULL` croira la contrainte appliquée
  alors qu'elle ne l'est pas.
- **D0 en premier n'évite aucun mapping.** ADR-038 D1 (`:122-125`) laisse explicitement
  `expenses.paid_from` et `charges.paid_from` en `text`. La dérivation D6 devra donc
  traduire des rôles **dans tous les cas**. D0-d'abord n'enlève rien ; il ajoute une
  troisième convention par-dessus deux déjà vivantes.

**Bénéfice** : la valeur visible par l'utilisateur passe de la 5ᵉ PR à la 1ʳᵉ.

**Coût, assumé et déclaré** : le report n'est pas gratuit. Le jour où `accounts.id` arrive,
il faut migrer ~10 à 14 fichiers — migration + backfill, types générés, schéma Zod du
mouvement, Server Actions d'écriture, `workspace-snapshot.ts`, entrée de la fonction de
dérivation, composants, `src/lib/gdpr/export.ts`, seeds e2e, tests. Tous mécaniques sauf la
migration. Sur le plan ingénierie pur, le report est **légèrement négatif**. Il se justifie
par l'ordre de livraison, pas par l'économie.

### E2 — Le journal se clé sur `account_type`, la convention canonique

Trois candidats, et le silence sur ce choix est exactement ce qui a produit la situation du
fait 1.

`kind` serait le choix paresseux : il est la clé primaire, et `expenses.paid_from` /
`charges.paid_from` l'utilisent déjà, donc zéro traduction immédiate. Il est **écarté** :
clé une table de production neuve sur une colonne officiellement condamnée depuis trois
mois, et on ne reporte pas une dette — on la scelle.

**Décision : `(workspace_id, account_type)`**, qui porte son propre index unique
(`20260503000001:56-57`) et supporte donc une FK composite aussi bien que la PK.

Prix : une bijection `kind ↔ account_type` dans la dérivation D6, puisque `expenses` et
`charges` restent en `kind`. C'est une table de correspondance de trois entrées, dans le
domaine pur, testée — cinq lignes. Le fait 4 rappelle que ce mapping serait de toute façon
nécessaire avec D0 en premier.

**Corollaire de rédaction** : les commentaires `DEPRECATED — will be dropped in PR-D2` de
`20260503000001:83-86` désignent une PR qui n'a jamais existé et n'est planifiée nulle part.
Ils sont corrigés pour pointer vers [#359](https://github.com/thierryvm/ankora/issues/359),
qui porte réellement l'unification des deux conventions. Un commentaire qui promet une
migration fantôme est un mensonge de plus dans le schéma — et celui-ci désigne la colonne
qui sert de clé primaire.

### E3 — `commitments.paid_from` migre de D0 vers D3

ADR-038 place cette colonne dans D0 (`:106-107`, `:308`). Elle n'a **aucun lien** avec la
clé de substitution : elle y est par accident de rédaction.

La conséquence si on ne la déplace pas est bloquante : D3 fige l'attribution des paiements
en **copiant** la valeur amont, or il n'existe rien en amont à copier pour un engagement
(fait 6). D3 livrerait le figeage pour les charges et **rien du tout** pour les
engagements — et la moitié des flux de D6 resterait inattribuable.

Elle est donc créée dans D3, avec son `CHECK`. Et le `CHECK` de `charge_payments.paid_from`
copie **deux** valeurs, pas trois (fait 5) : un plan qui cite de travers la contrainte qu'il
copie produit une contrainte fausse.

### E4 — Deux réserves écrites sur le backfill de D0

Le jour où D0 arrive, le remplissage de `movements.from_account_id` depuis
`(workspace_id, account_type)` est une **jointure sans perte** — la paire est unique. Ce
n'est pas une réécriture d'historique. Deux conditions, qui doivent figurer dans la
migration :

1. Le backfill tourne **dans la même migration que l'ajout d'`id`, et avant tout
   relâchement de l'unicité**. Après, la jointure devient ambiguë.
2. L'historique est attribué au **détenteur courant du rôle**. Aucune granularité n'est
   perdue — elle n'a jamais existé — mais c'est la version honnête de l'objection
   d'ADR-038 `:279-282`, et elle se dit.

### D10 — Le reliquat de fin de mois existe, et il n'est pas du budget

Relevé auprès de @thierry le 2026-08-10 :

> « chaque fin de mois, si mes comptes ne sont pas à zéro € […] mon solde Belfius principal
> ne sera pas à 0 € une fois tout payé »

Absent d'ADR-038, et absent du §7 du modèle source qui liste pourtant ce qui manque.

**Décision** : le reliquat n'est **ni une rentrée, ni du budget**. C'est le solde de clôture
d'une période, qui devient le solde d'ouverture de la suivante. Avec le journal il ne
demande aucune structure nouvelle : il **est** le solde dérivé au dernier jour de la période.

Il n'entre **jamais** dans « Budget du mois » (chiffre nº 2 d'ADR-035) — le compter y
ferait apparaître comme disponible de l'argent déjà reçu et déjà compté le mois précédent.
Il s'affiche pour ce qu'il est : ce qui reste sur le compte, hérité.

### D11 — Cohérence garantie, exhaustivité non garantie

Correction de @thierry le 2026-08-10, qui reformule D6 : celui-ci qualifiait la dérivation
d'« approximative » là où le calcul est **exact**. C'est l'écart au monde réel qui est
incertain, pas l'arithmétique.

**Décision, et c'est une frontière produit autant que technique :**

- Ankora **garantit la cohérence** — la somme de ce qui a été déclaré est exacte, vérifiée
  en permanence, chaque euro rattaché à son origine et à sa destination. C'est un invariant,
  pas une promesse.
- Ankora **ne garantit pas l'exhaustivité** — ce qui ne lui a pas été dit lui est invisible.

Le rapprochement interne ne sert donc pas à vérifier la justesse (elle l'est par
construction) : il sert à **mesurer ce qui manque**. Un versement déclaré de 360 € dont les
parts n'en couvrent que 340 signale un trou de 20 €, sans rien savoir de la banque.

**Conséquence de rédaction, y compris sur la vitrine** (cf. #357) : ne jamais écrire
« Ankora vérifie tes comptes » ni « tes chiffres sont toujours justes ». Le premier est
faux — aucune connexion bancaire, PSD2 exclu par ADR-001. Le second est invérifiable. Une
application qui dit ce qu'elle ne sait pas est plus crédible qu'une qui prétend tout savoir.

### D12 — Les invariants sont un contrat de domaine testé, pas un garde-fou d'affichage

Cinq propriétés, écrites comme fonctions pures dans `src/lib/domain/`, chacune avec son test
qui échoue si on la casse :

1. **Conservation** — un mouvement interne ne change pas la somme des soldes. Déplacer de
   l'argent n'en crée pas (reprise d'ADR-018 `:298`).
2. **Dérivation** — `solde(compte, t) = ouverture + Σ flux ≤ t`, et rejouer le journal rend
   le même nombre.
3. **Ventilation** — part de lissage + part d'épargne libre = montant versé, à l'euro.
   L'écart est refusé, pas arrondi (ADR-038 D4).
4. **Étanchéité des plans** — aucun total ne somme une valeur lissée et une valeur de
   caisse (ADR-038 D5).
5. **Décomposabilité** — tout total affiché égale la somme des composantes qu'il expose.
   C'est la règle 10 de `CLAUDE.md`, et sa violation a été mesurée en production le 10 août :
   le cockpit annonçait 969,21 € quand 1 369,21 € devaient sortir (#356).

## Ce que ce document ne décide pas

- **L'unification de `kind` et `account_type`.** Elle a son ticket
  ([#359](https://github.com/thierryvm/ankora/issues/359)). Le journal ne l'attend pas et ne
  la contrarie pas.
- **Le découplage des rôles et le nombre de comptes physiques.** Toujours hors périmètre, et
  c'est précisément ce qui justifie E1.
- **Le découvert**, les provisions libres, la valorisation d'un patrimoine — ADR-038
  §Hors périmètre, inchangé.

## Conséquence sur un conflit documentaire apparent

Le plan de refonte du 26 juillet écrit, à propos d'un futur ADR-027 :
`docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md:160` — « Les soldes de comptes
ne dérivent jamais des dépenses. » ADR-038 D6 décide l'inverse.

**Il n'y a pas d'arbitrage à rendre** : ADR-027 n'a jamais été écrit. Cette ligne est une
proposition non ratifiée du 26 juillet ; ADR-038, accepté le 5 août, la supersede par date.
La ligne du plan est annotée en conséquence, pas supprimée — elle documente une intention
antérieure et son abandon.

## Vérification

En plus des sept preuves exigées par ADR-038 §Vérification, l'exécution devra montrer :

1. Qu'une FK composite vers `(workspace_id, account_type)` accepte bien une ligne dont un
   côté est nul, et refuse un `account_type` inexistant pour le workspace.
2. Que le figeage de D3 tient pour les **engagements** autant que pour les charges :
   modifier `commitments.paid_from` après paiement ne bouge aucun solde historique.
3. Que les cinq invariants de D12 existent comme tests, et que **chacun échoue** quand on
   casse délibérément la propriété qu'il garde.
4. Que le reliquat d'une période apparaît en ouverture de la suivante **sans** être compté
   dans « Budget du mois ».
