# Plan J1 — D3 : l'attribution de compte se fige au paiement

**Révision 2**, après verdict `🟡 APPROVED WITH CHANGES` de `plan-reviewer`. Les 11
corrections exigées sont intégrées ; le §Historique en bas les liste. Zéro ligne de code
écrite.

**Décidé en amont, pas rediscuté ici** : ADR-038 D3 et ADR-040 E2/E3. Ce plan exécute.

## Objectif

Un paiement enregistre **le compte qui a payé, au moment où il a payé**. Aujourd'hui
l'attribution ne peut être qu'héritée de `charges.paid_from`, un champ **mutable** : éditer
une charge réécrirait rétroactivement les soldes dérivés, en silence. Côté engagements, il
n'y a rien du tout à hériter.

Rien ne dérive encore de cette colonne — D6 arrive en J4. **J1 pose le fait, il ne
l'exploite pas.**

## Phase 0 — au démarrage de la session d'exécution

1. **Modèle actif = Opus.** Sinon STOP (migration + Server Actions : jamais un downgrade).
2. **Branche dédiée créée AVANT la première édition** : `feat/j1-attribution-paiements`,
   depuis un `main` fraîchement `fetch`é. Mesuré le 2026-08-10 après le merge de #360 :
   `git log -1 origin/main --oneline` → `138c644 docs(adr): le journal d'abord, la
fondation ensuite — ADR-040 amende ADR-038 (#360)`. **Re-mesurer** plutôt que de croire
   ce SHA : une référence de checklist qui a vieilli vaut moins que pas de référence.
3. **`work perso -NoCd; npm run preflight` → GO exigé avant `supabase db push`.** Aucun
   hook git ne couvre `db push` : c'est le seul garde-fou (Phase 0bis de `CLAUDE.md`).
4. **`git add` par chemins explicites.** Jamais `-A`, jamais `.`.

## État mesuré (2026-08-10, base locale + migrations + `src/`)

| Objet                              | État                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `charge_payments`                  | `id, charge_id, workspace_id, period_year, period_month, paid_at, paid_amount, bucket_id, note, created_by, created_at` — aucune colonne de compte                                                                        |
| `commitment_payments`              | même forme **moins `bucket_id`** — les deux tables ne sont **pas** jumelles (`20260719000001:55-68`)                                                                                                                      |
| `commitments`                      | aucune colonne `paid_from`                                                                                                                                                                                                |
| `charges.paid_from`                | `text not null default 'principal'`, `check in ('principal','epargne')` — **deux** valeurs (`20260417000004:72-74`)                                                                                                       |
| `expenses.paid_from`               | `check in ('principal','vie_courante','epargne')` — trois valeurs                                                                                                                                                         |
| `accounts`                         | index unique sur `(workspace_id, account_type)` → supporte une FK composite                                                                                                                                               |
| FK existantes vers `accounts`      | **zéro**, dans tout le dépôt                                                                                                                                                                                              |
| Répartition de `charges.paid_from` | **base de dév** : 14 `principal`, 5 `epargne`. **La production n'a pas été mesurée** et n'a pas besoin de l'être : la migration se défend seule (§Garde-fous).                                                            |
| UI qui expose `charges.paid_from`  | aucune — mais la colonne **est écrite** par `charges.ts:80,141`, `onboarding.ts:120`, `import-coda-charges.ts:338`. Elle n'est pas figée, elle est **invisible** → [#362](https://github.com/thierryvm/ankora/issues/362) |

## La migration se fait en DEUX temps — sinon elle casse la production

**C'est la correction la plus importante de cette révision.** Les migrations sont poussées
**à la main** (`supabase db push --linked`), le code part par **merge sur main**. Les deux
ne sont jamais simultanés, et il n'existe **aucun ordre** qui marche avec une migration
monolithique :

- migration d'abord → l'ancien code déployé insère sans la colonne → `NOT NULL` violé
  (`23502`) → **cocher une facture échoue en production** jusqu'au déploiement.
- code d'abord → la colonne n'existe pas encore → `42703` → même symptôme, autre code.

Motif **expand / contract** :

| Fichier                                                | Contenu                                                                       | Quand                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| `20260810000001_d3_attribution_paiements_expand.sql`   | garde-fous, colonnes **nullables**, backfill, FK, trigger                     | poussée **avant** le merge                              |
| `20260810000002_d3_attribution_paiements_contract.sql` | re-backfill des lignes écrites `NULL` pendant la fenêtre, puis `set not null` | **PR de suivi — ce fichier n'existe PAS dans celle-ci** |

**Pourquoi B est absent de cette PR, et pas seulement « poussé plus tard ».**
`supabase db push` n'applique pas « la prochaine » migration : il applique **toutes celles
qui manquent**. Tant que B existe dans `supabase/migrations/`, la poussée d'avant-merge
appliquerait A **puis** B — le `set not null` arriverait avant le déploiement du nouveau
code, et on retomberait exactement dans le `23502` que la scission existe pour éviter.

Un fichier absent de l'arbre ne peut être poussé par aucune commande. C'est la seule forme
du dispositif qui ne repose pas sur la mémoire de l'opérateur à 23 h — et l'opérateur est
seul.

Pendant la fenêtre, l'ancien code insère `NULL` : la FK composite est en `MATCH SIMPLE`
(le défaut) et **une référence dont une colonne est nulle est satisfaite**. Zéro casse.

Cet ordre est écrit **en tête de chaque fichier SQL**, sinon quelqu'un les fusionnera.

## Migration A — `20260810000001_..._expand.sql`

1. **Réparation préalable, idempotente** : boucle `perform public.seed_default_accounts(ws.id)`
   sur tous les workspaces (même forme qu'`20260417000004:119-126`, `on conflict do nothing`).
2. **Garde-fou, avant tout DDL** : bloc `DO` qui compte les paires
   `(workspace_id, account_type cible)` encore introuvables et `raise exception` avec le
   **nombre**. Un échec en première ligne se rejoue ; un échec entre backfill et FK laisse
   une base à moitié migrée.
   - **Aucun `BEGIN;` / `COMMIT;` dans le fichier** — le contrôle transactionnel appartient
     à la CLI ; en poser un second produit exactement l'état partiel que le garde-fou
     cherche à empêcher. Rien dans cette migration ne relève du DDL non transactionnel de
     PostgreSQL (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`, `VACUUM`).
   - **Le message porte le nombre, jamais la liste des `workspace_id`.** La sortie de
     `db push` finit régulièrement collée dans un rapport de PR, et le dépôt est public.
   - Le comportement de rollback **se mesure** (preuve nº 7), il ne se suppose pas : c'est
     une hypothèse sur un outil tiers, donc la classe d'hypothèse qui se révèle fausse le
     jour où elle compte.
3. **`commitments.paid_from text not null default 'principal'`**,
   `check in ('principal','epargne')`.
   - Justification de `principal` : une mensualité de crédit sort du compte qui reçoit le
     salaire. Ce n'est pas « le défaut de l'autre table », c'est la nature de l'objet.
   - Le `default` remplit les lignes existantes : **hypothèse écrite en commentaire de
     colonne**, avec le numéro [#362](https://github.com/thierryvm/ankora/issues/362) qui
     porte sa mise à l'écran.
4. **`paid_from_account_type text`**, **nullable**, sur `charge_payments` et
   `commitment_payments`.
5. **Backfill** :
   - `charge_payments` ← `charges.paid_from` traduit (`principal→income_bills`,
     `epargne→provisions`). **Jointure sur `charge_id` ET contrôle d'égalité des
     `workspace_id`** — les deux FK sont indépendantes (`20260503000004:26-27`), rien ne
     garantit qu'elles concordent, et propager une incohérence préexistante en silence
     serait pire que la révéler.
   - `commitment_payments` ← `commitments.paid_from` traduit, même contrôle.
6. **FK composite** sur chacune : `(workspace_id, paid_from_account_type) references
public.accounts (workspace_id, account_type)`.
   - `MATCH SIMPLE` est **écrit en commentaire** : ici il autorise le `NULL` de la fenêtre,
     et il portera la sémantique « entrée/sortie externe » de la table de mouvements en J2.
   - `accounts` est en `force row level security` — **sans effet** : PostgreSQL fait passer
     les vérifications d'intégrité référentielle au-dessus de RLS, par conception. Écrit
     dans le SQL pour qu'`rls-flow-tester` ne « découvre » pas un faux problème.
7. **Trigger de gel, en DERNIER.**
   - `before update ... for each row when (old.paid_from_account_type is not null and
new.paid_from_account_type is distinct from old.paid_from_account_type)` → `raise exception`.
   - Le garde `old is not null` est **indispensable** : sans lui, la migration B ne peut pas
     remplir les lignes `NULL` de la fenêtre.
   - Fonction `security invoker set search_path = ''` — sinon alerte
     `function_search_path_mutable` chez les advisors Supabase.
   - **Le motif de l'ordre est écrit dans le SQL** : posé avant le backfill, l'`UPDATE` du
     backfill le déclencherait sur chaque ligne et la migration avorterait.
8. Commentaires de colonne sur les trois objets ajoutés. Celui de
   `paid_from_account_type` **nomme le vocabulaire** : valeurs de `accounts.account_type`,
   jamais celles de `charges.paid_from`.

**Aucun `drop`, aucun `alter` sur `kind`/`label`, aucun `accounts.id`.** #359 et D0 restent
hors du chemin.

## Migration B — décrite ici, PAS écrite dans cette PR

Contenu prévu : re-backfill des lignes restées `NULL` pendant la fenêtre, puis
`set not null` sur les deux colonnes.

Elle est créée dans une **PR de suivi**, ouverte une fois confirmé que le nouveau code
tourne en production. Le fichier n'entre pas dans l'arbre avant ce moment — cf. le §
ci-dessus sur `supabase db push`.

Note sur la FK : `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` valide toutes les lignes
existantes et prend un `SHARE ROW EXCLUSIVE` sur **les deux** tables, donc aussi sur
`accounts` que l'application écrit. Sur une quinzaine de lignes c'est des millisecondes —
ce n'est pas un risque ici. Écrit quand même : la table de mouvements de J2 grossira, et
mieux vaut avoir déjà croisé la question que la découvrir sous charge.

## Domaine

`src/lib/domain/accounts/account-type.ts` — bijection pure `AccountKind ↔ AccountType`,
exhaustive, `throw` sur l'inattendu (jamais de `default` silencieux). Tests : aller-retour
sur les trois valeurs + rejet d'une valeur inconnue.

## Écriture — six sites, pas deux

| Fichier:ligne                                  | Ce qu'il faut faire                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/actions/charge-payments.ts:115`       | renseigner la colonne — **et** ajouter `paid_from` au `select` de `:78` qui ne le lit pas                                                                                                                                                                                                                                                                                      |
| `src/lib/actions/commitments.ts:240`           | idem — **et** au `select` de `:205`                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/actions/obligations.ts:192`           | insert **par lot** des charges                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/actions/obligations.ts:206`           | insert **par lot** des engagements                                                                                                                                                                                                                                                                                                                                             |
| `scripts/dev/seed-vie-complete.mjs:123`        | 26 échéances                                                                                                                                                                                                                                                                                                                                                                   |
| `scripts/dev/seed-vie-complete.mjs:146`        | 3 paiements de charges                                                                                                                                                                                                                                                                                                                                                         |
| `src/lib/actions/charge-conversion.ts:177-194` | **7ᵉ site, et le plus sournois** — la conversion charge → engagement copie **dix** champs de la charge. Après J1, `paid_from` existe des deux côtés et ne serait **pas** copié : une charge `epargne` deviendrait un engagement `principal`, en silence. C'est exactement la classe de défaut que D3 existe pour fermer. Vérifier aussi que le `select` amont lit `paid_from`. |

**Non concernés, nommés pour qu'un relecteur ne les cherche pas** :
`src/lib/actions/commitments.ts:66` (création manuelle — le défaut `principal` s'applique,
la mise à l'écran est en #362) et `scripts/dev/seed-profil-test.mjs:142`.

La valeur est **lue côté serveur** depuis la ligne parente, jamais reçue du client
(règle 3). Elle n'entre dans aucun schéma Zod d'entrée.

`e2e/helpers/seed.ts` **n'insère aucun paiement** — vérifié, à dire explicitement pour
qu'un relecteur ne le cherche pas. `src/lib/gdpr/export.ts` n'exporte pas ces tables :
dette connue, rangée par ADR-038 D9 dans J2, hors périmètre ici.

### Le choix de conception que porte `obligations.ts`

Les inserts par lot mappent depuis un `MonthObligation`, qui ne porte **pas** `paidFrom` —
et ne doit pas le porter : le domaine n'en a aucun usage, ce serait du poids mort dans
`src/lib/domain/obligations/du-mois.ts`.

- **Charges** : facile. `chargesRes` fait `select('*')`, la valeur est là et jetée au
  mapping.
- **Engagements** : elle n'existe nulle part. `getCommitmentsWithLedger` la perd
  (`src/lib/data/commitments.ts:51-64`), borné par le type `CommitmentRow`
  (`src/lib/data/commitment-row.ts:13-26`).

**Décision** : `paidFrom` devient un champ **requis** de `CommitmentRow` et de son mapper,
et l'action reconstruit deux `Map<id, paidFrom>`. TypeScript pointera alors chaque
producteur, fixtures de tests comprises. **Cette friction est le but.**

Sur `CommitmentRow`, **jamais sur `Commitment`** (`commitment-row.ts:33-44`) : c'est la même
tentation qu'avec `MonthObligation`, et le domaine n'en a pas plus l'usage.

Coût mesuré — 1 site de production (`src/lib/data/commitments.ts:51-64`) et ~7 littéraux de
test (`commitment-row.test.ts:6`, `EngagementsCard.test.tsx` ×6 dont un spread qui passera
seul, `CommitmentsClient.test.tsx` ×2).

**Garde-fou de méthode** : le nombre d'erreurs attendu se déclare **avant** de lancer
`npx tsc --noEmit`, puis se compare. En obtenir **moins** signifie qu'un producteur n'est
pas annoté et échappe au compilateur — dans ce cas on le cherche, on n'ajuste pas
l'attendu. Ajuster l'attendu au résultat obtenu est un interdit explicite du `CLAUDE.md`
global.

## Types générés

`src/lib/supabase/types.ts` est committé. Sans régénération, `npm run typecheck` refuse les
nouvelles clés. Le fichier entre dans le diff, et la commande de régénération est nommée
dans le rapport de PR.

## Hors périmètre, explicitement

- **L'UI et l'i18n** → [#362](https://github.com/thierryvm/ankora/issues/362). Rien ne lit
  cette colonne avant J4 : demander à @thierry d'arbitrer une valeur sans effet à l'écran
  est aussi mauvais que de ne pas la lui demander. Et exposer « payé depuis » sur les
  engagements sans l'exposer sur les charges créerait une asymétrie visible entre deux
  écrans voisins. Les deux arrivent ensemble, avant J4.
- **Le dépointage qui supprime la ligne** → [#361](https://github.com/thierryvm/ankora/issues/361).
  Contredit D7, et videra l'historique dont D6 dépend. Cité dans le rapport de PR, pas
  corrigé ici.

## Ce que la PR devra prouver — et AVEC QUOI

Quatre de ces preuves sont des garanties **de base de données**. Aucune ne peut être un test
Vitest : les tests d'action du dépôt travaillent sur un faux client
(`src/lib/actions/__tests__/charge-payments.test.ts:290` vérifie `table: 'charge_payments'`,
pas la base). Le seul instrument qui touche une vraie base est `adminClientOrNull()`
(`e2e/helpers/seed.ts:38-62`) — donc le **job Playwright authentifié**.

Une preuve manuelle n'est pas régressive : un trigger que rien n'exerce en CI peut
disparaître dans une future migration sans qu'aucune ligne ne rougisse. C'est le mandat de
`silent-failure-auditor`.

| #   | Preuve                                                                                                                                                                                                                                                                                                                                                              | Instrument                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Un `UPDATE` direct sur `paid_from_account_type` est **refusé**. Formulation exacte : ce n'est **pas** « l'attribution est immuable » — décocher supprime la ligne, donc décocher/recocher ré-attribue librement ([#361](https://github.com/thierryvm/ankora/issues/361)). Le trigger protège contre un `update` oublié dans une future Server Action, rien de plus. | **spec e2e authentifiée**                                                        |
| 2   | Modifier `charges.paid_from` après paiement ne change aucune ligne de `charge_payments`. Idem engagements.                                                                                                                                                                                                                                                          | **spec e2e authentifiée**                                                        |
| 3   | La FK mord : un `account_type` inexistant pour ce workspace est refusé.                                                                                                                                                                                                                                                                                             | **spec e2e authentifiée**                                                        |
| 4   | Le backfill est exact sur un jeu mêlant `principal` et `epargne` — vérifié **ligne à ligne**, pas en comptage.                                                                                                                                                                                                                                                      | Vitest sur la fonction de bijection + vérification locale du SQL                 |
| 5   | L'ancien code (insert **sans** la colonne) réussit contre la migration A. **Cette preuve disparaîtra après B** — le dire, sinon quelqu'un la « réparera » en la cassant.                                                                                                                                                                                            | insert `service_role` local, A appliquée, B absente                              |
| 6   | RLS dans les deux sens : aucune fuite inter-workspace, et le chemin d'écriture légitime n'est pas refusé en silence.                                                                                                                                                                                                                                                | `rls-flow-tester`                                                                |
| 7   | La migration avorte **proprement** si un compte cible manque : ni la colonne dans `information_schema.columns`, **ni** la ligne dans `supabase_migrations.schema_migrations`.                                                                                                                                                                                       | mesure locale — supprimer une ligne d'`accounts`, pousser, vérifier **les deux** |

**Planchers e2e.** Le job public reste à **241** : la nouvelle spec porte
`test.skip(!admin, …)` et doit y **sauter**, jamais échouer. Le job authentifié **monte**
de 41 à 41 + N — mouvement **sain**, un trou trouvé, pas une régression. N se mesure **en
local avant le premier push, dans les deux sens** (avec et sans la spec) : c'est le
**delta** qui se compare d'une machine à l'autre, jamais la valeur absolue. Le chiffre
obtenu va dans `docs/reference/planchers-e2e-historique.md` et dans `CLAUDE.md`.

## Retour arrière

- Après migration A seule : `drop` du trigger, de la FK et des colonnes. Aucune donnée
  perdue, l'ancien code n'a jamais cessé de fonctionner.
- Après migration B : un rollback Vercel vers l'ancien code **recasse les inserts**
  (`NOT NULL` sans default). B ne part donc qu'après confirmation de stabilité, et son
  retour arrière est `alter column drop not null` — **jamais** `drop column`.

## Definition of Done

1. CI verte : Lint, Typecheck, Tests, E2E, E2E authenticated, Security, Build.
2. Sourcery muet sur le **dernier** commit — `gh api .../pulls/<N>/comments` **et**
   `.../reviews` (les remarques générales n'apparaissent pas dans le premier). Si le quota
   hebdomadaire est épuisé, le dire : un silence par absence de lecture n'est pas un
   silence.
3. Revues humaines résolues.
4. Pas de conflit avec `main`.
5. Rapport dans `docs/prs/`, citant #361 et #362.

## Historique de révision

**v1 → v2**, après `plan-reviewer` :

| Correction                                                                     | Origine                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| Migration scindée en expand/contract                                           | v1 cassait le pointage en production        |
| 4 sites d'écriture ajoutés (6 au total)                                        | v1 en citait 2                              |
| Bifurcation `CommitmentRow.paidFrom` tranchée                                  | trou de conception non vu                   |
| Garde-fous de backfill : réparation + `raise exception` compté                 | v1 n'en avait aucun                         |
| Jointure du backfill contrôlant l'égalité des `workspace_id`                   | cas non listé                               |
| Garde `old is not null` sur le trigger                                         | v1 aurait bloqué la migration B             |
| `security invoker set search_path = ''`                                        | alerte advisors                             |
| Preuve nº 1 reformulée + #361 ouvert                                           | v1 promettait une immuabilité inexistante   |
| UI et i18n sortis du périmètre → #362                                          | PR trop grosse pour une revue humaine seule |
| Phase 0, Phase 0bis, DoD, retour arrière                                       | absents                                     |
| `commitment_payments` n'a pas `bucket_id` ; `charges.paid_from` n'est pas figé | deux mesures fausses                        |

**v2 → v3**, second passage `plan-reviewer` :

| Correction                                                               | Origine                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Migration B retirée de la PR**, pas seulement « poussée plus tard »    | `db push` applique TOUT ce qui manque : la scission ne protégeait rien              |
| Instrument nommé preuve par preuve, plancher authentifié relevé à 41 + N | 4 preuves étaient des garanties de base qu'aucun Vitest ne peut rendre              |
| 7ᵉ site : `charge-conversion.ts:177-194`                                 | une charge `epargne` convertie serait devenue un engagement `principal`, en silence |
| Pas de `BEGIN;`/`COMMIT;` ; rollback mesuré, pas supposé (preuve nº 7)   | hypothèse sur un outil tiers                                                        |
| Compte d'erreurs `tsc` déclaré **avant** de lancer                       | un producteur non annoté échapperait sans qu'on le voie                             |
| SHA de `main` re-mesuré plutôt que cité                                  | référence de checklist périssable                                                   |
