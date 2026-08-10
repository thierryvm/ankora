# PR J1 — l'attribution de compte se fige au paiement (ADR-038 D3)

**Branche** : `feat/j1-attribution-paiements` · **Plan** :
[`docs/plans/J1-attribution-paiements.md`](../plans/J1-attribution-paiements.md), approuvé
en deux tours par `plan-reviewer` avant la première ligne de SQL.

Un paiement enregistre désormais **le compte qui a payé, au moment où il a payé**. Rien ne
lit encore cette colonne — la dérivation des soldes est D6, en J4. **J1 pose le fait, il ne
l'exploite pas.**

---

## ⛔ Cette PR ne se merge pas seule — lire ceci d'abord

La migration part **à la main et AVANT le merge**. Le code part **par merge**. Les deux ne
sont jamais simultanés, donc l'ordre n'est pas une préférence :

1. `npm run preflight` → **GO** exigé (aucun hook git ne couvre `supabase db push`)
2. `supabase db push --linked` — **avec le GO explicite de @thierry**
3. vérifier que la production tourne
4. **ensuite** merger

### Ce que la poussée emportera EN PLUS de cette PR

`supabase db push` n'applique pas « la prochaine » migration : il applique **toutes celles
qui manquent**. Mesuré le 2026-08-10 avec `supabase migration list --linked` :

| Migration                                    | Local | Production            |
| -------------------------------------------- | ----- | --------------------- |
| `20260729000001_deprecate_reste_a_vivre`     | ✅    | ❌ **jamais poussée** |
| `20260729000002_expense_categories_taxonomy` | ✅    | ✅                    |
| `20260810000001_d3_attribution_paiements`    | ✅    | — (celle de cette PR) |

Celle du 29 juillet **partira donc en même temps**, et il n'y a pas de moyen de l'éviter
avec cette commande. Elle est bénigne — elle ne fait que **relâcher** une contrainte
(`drop not null`, `drop default`) sur `workspace_settings.reste_a_vivre_default`, une
colonne qu'aucun code ne lit plus depuis ADR-035 — et elle est en retard de 12 jours. Mais
la dire fait partie du GO : personne ne devrait découvrir après coup qu'une poussée en a
emporté deux.

Corollaire : `src/lib/data/workspace-snapshot.ts:213` affirme aujourd'hui « la migration de
dépréciation est écrite mais pas appliquée ». Cette phrase devient fausse à la poussée. Elle
n'est pas corrigée ici parce qu'elle est vraie tant que le GO n'est pas donné ; à corriger
dans la PR de suivi, en même temps que la migration `contract`.

### Et ce que cette PR ne contient PAS, délibérément

La migration `..._contract.sql` (re-backfill des lignes écrites `NULL` pendant la fenêtre,
puis `set not null`) **n'est pas dans l'arbre**. Tant qu'elle y serait, la poussée
d'avant-merge appliquerait le `NOT NULL` avant le déploiement du code — soit exactement le
`23502` en production que la scission existe pour éviter. Un fichier absent ne peut être
poussé par aucune commande ; c'est la seule forme du dispositif qui ne repose pas sur la
mémoire de l'opérateur, et l'opérateur est seul.

Elle naît dans une PR de suivi, une fois le nouveau code confirmé en production.

---

## Ce que la migration fait

`20260810000001_d3_attribution_paiements_expand.sql` :

1. réparation idempotente des comptes manquants (`seed_default_accounts` sur tous les workspaces) ;
2. **deux garde-fous avant tout DDL**, qui `raise exception` avec un **nombre** et jamais
   une liste d'identifiants — la sortie de `db push` finit régulièrement collée dans un
   rapport de PR, et ce dépôt est public ;
3. `commitments.paid_from` (`not null default 'principal'`, mêmes deux valeurs que
   `charges.paid_from`) ;
4. `paid_from_account_type` **nullable** sur `charge_payments` et `commitment_payments` ;
5. backfill traduit vers le vocabulaire d'`accounts.account_type` ;
6. clés étrangères composites vers `accounts (workspace_id, account_type)` ;
7. trigger de gel **en dernier** — posé avant le backfill, il se déclencherait sur chaque
   ligne de l'`UPDATE` et la migration avorterait.

Aucun `drop`, aucun `alter` sur `kind`/`label`, aucun `accounts.id` : #359 et D0 (dernière
livraison, ADR-040 E1) restent hors du chemin.

Trois choix de la FK méritent d'être vus :

- **`on delete no action deferrable initially deferred`.** Trois options ont été pesées,
  pas deux. `restrict` est vérifié IMMÉDIATEMENT, y compris quand la ligne référençante part
  dans la même instruction : sur la cascade `auth.users → users → workspaces → {accounts,
charge_payments}`, l'ordre entre les deux branches n'est pas un contrat, donc c'était un
  pari sur l'obligation RGPD art. 17. `cascade` règle ça, mais paie ce confort en rendant
  **destructif** l'effacement d'une ligne d'`accounts` — tout l'historique de paiement
  attribué à ce compte partirait avec elle, en silence et au-dessus de RLS, ce qui contredit
  ADR-038 D7. La troisième voie reporte le contrôle au COMMIT : la cascade de suppression de
  compte passe, **et** une suppression isolée est refusée. **Les deux propriétés ont été
  mesurées** (preuves 8 et 9 ci-dessous), pas déduites.
- **`on update restrict`**, en sachant ce qu'il prouve et ce qu'il ne prouve pas :
  `20260503000001:79-80` affirme « Never user-editable » dans un `comment on column`, et un
  commentaire n'est pas un mécanisme. La contrainte rend l'invariant exécutable **à partir du
  moment où un paiement référence la paire**. Le verrouillage complet de la colonne relève des
  privilèges, pas d'une clé étrangère, et il ne se fait pas ici.
- **`match simple`**, écrit explicitement parce qu'il PORTE une décision : c'est ce qui rend
  la fenêtre expand sûre (une référence dont une colonne est `NULL` n'est pas vérifiée), et
  ce qui portera la sémantique « entrée/sortie externe » de la table de mouvements en J2.

**Une mine est désamorcée par écrit dans le SQL, pour D0.** PostgreSQL documente qu'une
vérification d'intégrité peut servir de canal caché pour sonder des lignes qu'on n'a pas le
droit de lire. Ce n'en est pas un ici, et la raison est structurelle : `workspace_id` est
**dans** la clé. Cette garantie disparaît le jour où D0 fera pointer la FK sur `accounts.id`
seul ; la reprise devra être `(workspace_id, id)`.

## Ce que la PR prouve, et avec quel instrument

| #   | Preuve                                                                                  | Instrument                          | Résultat                                                                                                                   |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Un `UPDATE` de l'attribution est refusé                                                 | spec e2e authentifiée + psql local  | ✅ `ADR-038 D3 : paid_from_account_type est figé au paiement (provisions -> income_bills refusé)`                          |
| 1b  | Un `UPDATE` qui ne touche PAS l'attribution passe                                       | psql local                          | ✅ la clause `when` ne verrouille pas la ligne entière                                                                     |
| 2   | Modifier `charges.paid_from` après paiement ne change aucune ligne de `charge_payments` | spec e2e authentifiée + psql local  | ✅ `epargne → principal` sur la charge, le paiement reste `provisions`                                                     |
| 3   | La FK mord sur un `account_type` inexistant pour ce workspace                           | spec e2e authentifiée + psql local  | ✅ `23503`                                                                                                                 |
| 4   | Backfill exact sur un jeu mêlant `principal` et `epargne`, **ligne à ligne**            | migration appliquée en local        | ✅ 2 `epargne`→`provisions`, 3 `principal`→`income_bills`, 26 échéances→`income_bills`, **0 `NULL`**                       |
| 5   | L'ancien code (insert **sans** la colonne) réussit contre la migration A                | insert `service_role` local         | ✅ ligne créée, colonne `NULL`. **Cette preuve disparaîtra après la migration `contract`** — le dire.                      |
| 6   | RLS dans les deux sens                                                                  | `rls-flow-tester`                   | ✅ aucune fuite introduite ; le chemin d'écriture légitime n'est pas refusé. Détail ci-dessous.                            |
| 7   | Une migration qui échoue ne laisse ni DDL partiel ni ligne dans `schema_migrations`     | fichier jetable, mesuré puis effacé | ✅ colonne témoin absente, `schema_migrations` vide des deux versions, **et la chaîne s'arrête**                           |
| 8   | **La suppression de compte (RGPD art. 17) traverse la nouvelle FK**                     | `psql`, transaction annulée         | ✅ `delete from auth.users` → **5 paiements → 0, 6 comptes → 3**, aucune erreur, `set constraints all immediate` satisfait |
| 9   | La suppression ISOLÉE d'une ligne `accounts` référencée est **refusée**                 | `psql`, transaction annulée         | ✅ `still referenced from table charge_payments` — c'est ce que `on delete cascade` n'aurait PAS donné                     |
| 10  | Le retour arrière fonctionne                                                            | joué pour de vrai en local          | ✅ `drop` du trigger, des 2 FK et des 3 colonnes, puis migration rejouée — aucune donnée perdue                            |
| 11  | La fonction de gel ne laisse pas de privilège inutile                                   | `pg_proc.proacl`                    | ✅ `{postgres=X/postgres}`                                                                                                 |

La preuve nº 7 méritait d'être mesurée plutôt que supposée : c'est une hypothèse sur un
outil tiers, donc la classe d'hypothèse qui se révèle fausse le jour où elle compte. Un
fichier jetable ajoutait une colonne puis levait une exception ; ni la colonne ni
l'enregistrement de version n'ont survécu, et la migration suivante n'a pas tourné.

**Caveat d'instrument sur la preuve nº 9**, parce qu'un instrument qui regarde au mauvais
endroit rend un faux résultat plutôt qu'un résultat vide : le script portait un `\echo`
« si cette ligne s'affiche, la contrainte n'a pas mordu ». Ce n'était pas un signal valide —
`psql` imprime ses `\echo` côté client quoi qu'il arrive côté serveur. La preuve est
l'`ERROR` levée sur `set constraints all immediate`, pas l'absence de l'écho.

## Ce que les deux agents QA ont trouvé, et ce qui a changé après eux

Aucun des deux n'a rendu un blanc-seing, et les deux ont trouvé du vrai.

**`test-quality-auditor` — le trou qui comptait le plus.** `charge-conversion.ts:198` (la
copie de `paid_from`, c'est-à-dire le correctif le plus sournois de cette PR) n'était couvert
**nulle part** : pas de `charge-conversion.test.ts`, l'action entièrement mockée dans
`ChargesClient.test.tsx`, zéro occurrence de « conversion » sous `e2e/`. Si la ligne
disparaissait, l'insert omettait la colonne, le `default 'principal'` s'appliquait, **rien ne
rougissait**. Un correctif sans test qui échouerait sans lui est une hypothèse, pas un
correctif.

→ `src/lib/actions/__tests__/charge-conversion.test.ts` (3 cas). **Sa sensibilité est
mesurée** : ligne retirée → 2 cas sur 3 échouent ; ligne remise → vert.

Deux autres corrections du même audit :

- Le cas e2e du geste groupé ne semait que des obligations `epargne` : une constante
  `'provisions'` codée en dur dans `obligations.ts` l'aurait passé. Il sème désormais **les
  deux** comptes et attend `['income_bills', 'provisions']`.
- `account-type.test.ts` promettait d'attraper « un quatrième compte ajouté d'un seul côté »
  avec deux listes recopiées à la main — qui seraient restées à trois entrées, cohérentes
  entre elles, en annonçant vert. Les listes sont maintenant **dérivées** des tables
  (`ACCOUNT_KINDS` / `ACCOUNT_TYPES`), donc la promesse est tenue.

**`rls-flow-tester` — un défaut de harnais, et une meilleure troisième voie.**

- `e2e/helpers/seed.ts` avalait l'erreur de `deleteSeededUser`. Or **c'est le seul endroit du
  dépôt qui exécute la chaîne complète de suppression de compte**, et depuis J1 elle traverse
  une FK composite de plus. Si la cascade cassait, GoTrue rendait une erreur, le helper
  l'avalait, la spec passait au vert et un utilisateur de test fuitait à chaque exécution. Le
  helper échoue désormais bruyamment — et **le plancher authentifié n'a pas bougé (45)**, ce
  qui prouve au passage que la cascade fonctionne pour toutes les specs, pas seulement les
  miennes.
- La FK est passée de `on delete cascade` à `on delete no action deferrable initially
deferred` (cf. §ci-dessus) : mon raisonnement contre `restrict` était juste, mais il
  présentait le choix comme binaire alors qu'il ne l'était pas.
- Un garde-fou de plus, avant tout DDL : la réparation des comptes est désormais **vérifiée**
  au lieu d'être supposée. `seed_default_accounts` est `security definer` et écrit dans une
  table en `force row level security` sans policy INSERT ; si le rôle propriétaire de
  l'instance hébergée ne portait pas `BYPASSRLS`, la boucle sèmerait zéro ligne **sans lever
  d'erreur**, et la panne n'apparaîtrait qu'au premier pointage, en 23503. Le nouveau bloc
  transforme cet échec muet en échec bruyant.
- `revoke execute` sur la fonction de gel créée ici : une fonction neuve naît avec les
  privilèges par défaut de la plateforme. Impact réel nul (un appel direct rend `0A000`), mais
  un privilège qu'on n'utilise pas est un privilège qu'on ferme.

**Trois remarques des deux audits ne sont PAS traitées ici**, délibérément : elles portent sur
du préexistant, elles relèvent d'une PR dédiée, et deux d'entre elles ne s'écrivent pas dans
un dépôt public avant correction. Elles ont été remontées à @thierry hors dépôt.

**Sur la valeur de ces audits, et leur limite** : l'outil Bash était cassé pour les deux
agents (`expo: command not found` dans le préambule du shell, sur toute commande). Leurs
constats sont donc des lectures de code, jamais des mesures — `rls-flow-tester` l'a écrit
lui-même et a refusé de rendre PASS sur ce qu'il n'avait pas exécuté. **Les mesures des
preuves 8 à 11 ont été prises ici, après coup**, précisément parce qu'il ne pouvait pas les
prendre.

## Les 7 sites d'écriture

| Fichier                                | Ce qui change                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/actions/charge-payments.ts`   | `paid_from` ajouté au `select`, attribution posée sur l'insert                                                                            |
| `src/lib/actions/commitments.ts`       | idem                                                                                                                                      |
| `src/lib/actions/obligations.ts` ×2    | inserts par lot, via deux `Map<id, paidFrom>` reconstruites                                                                               |
| `src/lib/actions/charge-conversion.ts` | **le plus sournois** : la conversion copie dix champs ; sans ça une charge `epargne` serait devenue un engagement `principal`, en silence |
| `scripts/dev/seed-vie-complete.mjs` ×2 | 26 échéances + 3 paiements                                                                                                                |

La valeur est **lue côté serveur** depuis la ligne parente, jamais reçue du client
(règle 3), et n'entre dans aucun schéma Zod d'entrée.

**Vérifié comme absence, pas supposé** : `seed-profil-test.mjs` n'écrit dans aucune des deux
tables, et `src/lib/gdpr/export.ts` ne les exporte pas non plus — son propre en-tête le dit
(« SEVEN of the fourteen tables »). Aucun changement RGPD ne découle de J1.

## Le choix de conception : `CommitmentRow.paidFrom` est REQUIS

Les inserts par lot mappent depuis un `MonthObligation`, qui ne porte pas `paidFrom` et ne
doit pas le porter : le domaine n'en a aucun usage. La valeur est donc reprise des lignes
déjà lues, via un lookup qui **refuse de deviner** — un miss est impossible par
construction, et si la construction change un jour, un `throw` bruyant vaut mieux qu'un
`NULL` écrit dans la colonne dont D6 dérivera des soldes.

Rendre le champ requis force TypeScript à pointer chaque producteur, fixtures comprises.
**Cette friction est le but.**

### L'attendu de `tsc` était faux, et c'est consigné

Le plan déclarait **10 erreurs** attendues. Il y en a eu **4**. La règle du plan est
explicite : en obtenir moins signifie qu'un producteur échappe au compilateur, donc **on
cherche, on n'ajuste pas l'attendu**.

Cause trouvée : les six littéraux « manquants » sont tous des `{ ...carLoan, … }`, qui
héritent du champ. L'attendu avait été dérivé de premières lignes de `grep` au lieu des
corps. Le compilateur avait raison ; l'erreur était dans l'instrument, et aucun producteur
n'échappe. Les 4 sites réels : `src/lib/data/commitments.ts:51` (production) et trois
fixtures de base.

## Types générés — édités à la main, et vérifiés

`npm run supabase:types` utilise `--linked`, c'est-à-dire la **production**, qui n'a pas
encore la migration : la commande aurait retiré les nouvelles colonnes. Générer depuis
`--local` produit 753 insertions / 691 suppressions pour trois colonnes — le fichier
committé est formaté Prettier et généré avec `--linked` (il porte `__InternalSupabase`, pas
`graphql_public`). Importer cette dérive de version de CLI dans une PR sur l'attribution
serait du bruit pur.

Les trois colonnes et les deux relations ont donc été posées à la main, **puis vérifiées** :
la génération locale formatée avec la config Prettier du dépôt ne montre **aucune** de mes
additions dans son diff. Elles correspondent au caractère près. Après la poussée en
production, `npm run supabase:types` doit être un no-op — c'est le contrôle qui reste à
faire.

## Planchers e2e

| Job                              | Avant | Après              |
| -------------------------------- | ----- | ------------------ |
| `Playwright E2E`                 | 241   | **241** (inchangé) |
| `Playwright E2E (authenticated)` | 41    | **45**             |

**Mesuré dans les deux sens**, même machine, même serveur, même build : la sélection
authentifiée complète rend `41 passed / 5 skipped` sans la spec et `45 passed / 5 skipped`
avec. Delta **+4**, sans reste. Le plancher public ne bouge pas : la spec y est découverte
par les trois projets non-iPhone et y **saute** — vérifié sans clé `service_role`,
`12 skipped`, zéro passé, zéro échec.

Trois des quatre cas vérifient des garanties de base de données qu'aucun Vitest ne peut
rendre. Le quatrième passe par l'interface et couvre le geste groupé d'`obligations.ts`,
**qui n'a aucun test Vitest** — ni le fichier, ni ses deux insertions par lot.

Quarantaine : **inchangée**, aucune entrée ajoutée.

### Ce que la mesure a coûté en réparation de harnais

`.env.local` porte une URL Upstash **factice**, et en build de production `rateLimit()`
échoue FERMÉ : la toute première connexion renvoie « Service temporairement indisponible »,
ce qui se lit comme un bug applicatif. La CI ne rencontre pas ça parce qu'elle monte
`serverless-redis-http` devant un Redis nu. Il a fallu reproduire ces deux conteneurs en
local pour qu'un cas authentifié qui se connecte prouve quoi que ce soit.

## Hors périmètre, et nommé

- **L'UI et l'i18n de « payé depuis »** → [#362](https://github.com/thierryvm/ankora/issues/362).
  Rien ne lit la colonne avant J4 : demander à @thierry d'arbitrer une valeur sans effet à
  l'écran est aussi mauvais que de ne pas la lui demander. Et l'exposer sur les engagements
  sans l'exposer sur les charges créerait une asymétrie entre deux écrans voisins. Les deux
  arrivent ensemble, avant J4.
- **Le dépointage qui supprime la ligne** → [#361](https://github.com/thierryvm/ankora/issues/361).
  Contredit ADR-038 D7 et videra l'historique dont D6 dépend. **Conséquence directe sur ce
  que J1 promet** : l'attribution n'est pas immuable, puisque décocher/recocher la ré-écrit.
  Le trigger protège contre un `update` oublié dans une future Server Action, rien de plus,
  et il ne faut pas le vendre pour plus. C'est écrit dans le SQL et dans la spec.
- **Les deux conventions de rôle vivantes sur `accounts`** → [#359](https://github.com/thierryvm/ankora/issues/359).

## Portes qualité

| Porte                   | Résultat                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `lint`                  | ✅ 0 erreur (10 warnings préexistants, aucun dans les fichiers touchés)                                               |
| `lint:use-server`       | ✅                                                                                                                    |
| `typecheck`             | ✅                                                                                                                    |
| `test`                  | ✅ **2226 passed / 165 fichiers**                                                                                     |
| `build`                 | ✅                                                                                                                    |
| `npm run dev` + page    | ✅ HTTP 200 sur `/`, `/login`, `/app`, `/app/charges`, `/app/commitments` — **0 erreur de compilation**               |
| e2e authentifié (local) | ✅ 45 passed / 5 skipped                                                                                              |
| Prettier                | ✅ sur les fichiers touchés (le dépôt porte une dérive préexistante de 60 fichiers, hors périmètre, non lancée en CI) |

**Instabilité observée, signalée plutôt que tue** : au premier passage complet,
`src/lib/actions/__tests__/settings-mfa.test.ts` a rendu 2 échecs (un timeout à 5 s, un
ordre d'invocation). Ils ne se sont pas reproduits aux passages suivants et ne touchent
aucun fichier de ce diff. Préexistants, à regarder pour eux-mêmes.

## Retour arrière

- **Après la migration A seule** : `drop` du trigger, des deux FK et des trois colonnes.
  Aucune donnée perdue — l'ancien code n'a jamais cessé de fonctionner (preuve nº 5).
  **Ce plan n'est pas théorique : il a été joué pour de vrai en local** (preuve nº 10), pour
  rejouer la migration après la correction de la FK. Les mêmes six lignes s'appliquent en
  production.
- **Après la migration B** : un rollback Vercel vers l'ancien code **recasse les inserts**
  (`NOT NULL` sans défaut). B ne part donc qu'après confirmation de stabilité, et son retour
  arrière est `alter column drop not null` — **jamais** `drop column`.
