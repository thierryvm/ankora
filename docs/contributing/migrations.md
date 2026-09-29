# Migrations Supabase — qui les applique, et dans quel ordre

> Décision @thierry, 29 septembre 2026. Remplace la procédure « le pilote pousse la
> migration à la main après la fusion » de `docs/runbooks/supabase-migrations.md`.

## En une phrase

**La CI applique les migrations en production à la fusion sur `main`, et seulement si
elles sont additives et se ferment elles-mêmes.** Tout ce qui détruit, réécrit ou ouvre un
accès est refusé par la CI et poussé à la main par Thierry.

- Contrôle sur la PR : job « Additive migrations » de `.github/workflows/ci.yml` (sans
  secret).
- Application : `.github/workflows/migrations-production.yml`, déclenché par un push sur
  `main` qui touche `supabase/migrations/`. Rien d'autre ne le déclenche : ni bouton, ni PR,
  ni fork.
- La garde : `scripts/ci/migrations-additives.mjs`, testée par
  `scripts/ci/__tests__/migrations-additives.test.ts`. En production, c'est la garde **telle
  qu'elle était avant le push** qui juge : une PR qui assouplit la garde et ajoute une
  migration destructive est jugée par l'ancienne. Une modification de la garde prend donc
  effet un push plus tard.

## Ce que la garde refuse

Liste fermée. Une migration ajoutée est refusée si elle :

| Refusé                                                                                      | Pourquoi                                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| contient tout `drop` (table, colonne, contrainte, policy, fonction, type, défaut…)          | détruit                                                   |
| `truncate`, `delete from`                                                                   | efface des données                                        |
| `update … set`, `on conflict do update set`, `merge into`                                   | réécrit des données                                       |
| `alter column … type`, `rename`                                                             | casse l'ancien code                                       |
| `set not null` ou `revoke` sur un objet existant                                            | l'ancien code en dépend                                   |
| `alter policy`, RLS désactivée ou non forcée, `disable trigger`, `session_replication_role` | réécrit ou affaiblit une protection                       |
| `grant … to anon/public`, `grant <rôle> to …`, `alter default privileges`                   | ouvre un accès                                            |
| crée une table **sans** `enable row level security` dans le même fichier                    | les droits par défaut du schéma l'ouvrent à `anon`        |
| crée une vue sans `security_invoker = true`, ou une vue matérialisée                        | elle contournerait la RLS                                 |
| `security definer`                                                                          | s'exécute avec les droits du propriétaire                 |
| `create policy` sur une table existante                                                     | ouvre un accès en ajoutant                                |
| `create rule`, `create extension`, `owner to`, `alter function/view`                        | change un objet sensible                                  |
| `execute` (SQL dynamique), `do`, `select`, `call` en tête d'instruction                     | détruit sans écrire le mot (concaténation, purge appelée) |
| `create or replace` d'une fonction, vue ou trigger **déjà créé**                            | réécrit l'objet — une fonction lue par la RLS aussi       |

Et hors du SQL : un fichier de migration **modifié, supprimé ou renommé** (la base ne
rejoue jamais une migration appliquée : la modifier crée une dérive silencieuse), une
migration datée **avant** la dernière de l'historique, ou un nom de fichier qui n'est pas
`AAAAMMJJhhmmss_nom.sql`.

Sont acceptés parce que le même fichier crée l'objet visé : `drop policy if exists` /
`drop trigger if exists` sur une table créée dans ce fichier, `set not null` sur une
colonne ajoutée dans ce fichier (sans `if not exists`, qui ne prouve pas qu'elle est
neuve), `revoke` sur une table ou une fonction créée ici, `create policy` sur une table
créée ici, `create or replace` d'une fonction neuve. Une table `create table if not
exists` ne compte comme neuve que si l'historique ne la connaît pas.

**Choix délibérés, tous du côté du refus :**

- Les commentaires (`--` et `/* */`) sont retirés avant l'analyse, hors des corps `$…$`
  dont les bornes sont lues comme Postgres les lit (seul le tag fermant compte).
- Les **chaînes** et les corps `$…$` sont analysés : un `drop` dans une chaîne compte. Le
  prix est un faux positif, qui se règle par le chemin manuel.
- Un bloc `do` est toujours manuel, même le motif idempotent « créer une policy si elle
  n'existe pas ».

**Ce que la garde ne garantit pas** : la compatibilité avec l'ancien code. Elle attrape la
destruction et l'ouverture d'accès, pas un `add column … not null` sans défaut, une
contrainte ou un index unique ajoutés à une table existante. **La relecture de la PR reste
le filet** pour ce qui casse l'ancien code en ajoutant.

## L'ordre avec Vercel — la règle qui le rend sans danger

À la fusion, deux choses partent **en même temps** et sans ordre garanti : le code (Vercel)
et la migration (le workflow). Pendant quelques minutes, l'ancien code tourne sur la
nouvelle base, ou le nouveau code sur l'ancienne. D'où la règle :

1. **Une migration additive est compatible avec l'ancien code ET le nouveau.** Une table,
   une colonne nullable, un index non unique, une fonction neuve : l'ancien code ne les
   voit pas. La garde refuse ce qui détruit ; la relecture vérifie le reste.
2. **Un code qui dépend d'un objet neuf doit tolérer quelques minutes où il manque** — une
   lecture qui échoue proprement, pas une page qui tombe. Sinon **la PR se découpe en
   deux** : la PR de migration seule, fusionnée et vérifiée (`migration list`), **puis** la
   PR du code.
3. **Une suppression se fait en deux temps** (expand / contract) : le code cesse d'utiliser
   l'objet et part en production, **puis** une migration destructive le retire — par le
   chemin manuel ci-dessous.

## Les deux gestes du pilote

Le pilote n'écrit jamais en production. Il garde deux gestes, tous deux en lecture :

**Avant la fusion d'une PR qui porte une migration — la sauvegarde.** Avec la CLI du dépôt
(`npx supabase@2.84.2`), vers un dossier **hors du dépôt** (jamais committé) :

```bash
npx supabase@2.84.2 db dump --linked -f <dossier-hors-depot>/<date>-schema.sql
npx supabase@2.84.2 db dump --linked --data-only -f <dossier-hors-depot>/<date>-donnees.sql
```

**Après la fusion — la vérification.** Une fois le workflow « Migrations — production »
vert :

```bash
npx supabase@2.84.2 migration list --linked
```

Local = Remote sur chaque ligne. Le workflow fait déjà cette comparaison et échoue sinon ;
le pilote la refait parce qu'un contrôle qu'on ne relit jamais finit par ne plus rien
contrôler.

## Migration destructive — Thierry la pousse lui-même

1. La PR porte la migration ; le job « Additive migrations » est **rouge**, c'est attendu.
   La PR le dit dans sa description.
2. Sauvegarde (les deux commandes ci-dessus).
3. Fusion. Le workflow de production **refuse** et n'applique rien.
4. Depuis sa session, Thierry applique et vérifie :

   ```bash
   npm run preflight
   npx supabase@2.84.2 db push --linked
   npx supabase@2.84.2 migration list --linked
   ```

**Tant qu'elle n'est pas poussée, elle bloque les suivantes.** `db push` applique toutes
les migrations en attente, pas seulement celles du dernier push. Le workflow vérifie donc
que les migrations en attente en base sont exactement celles ajoutées par le push en
cours ; une migration refusée plus tôt fait refuser toutes les suivantes, jusqu'à ce que
Thierry l'ait poussée.

**Run en échec ou annulé.** Relancer **ce run-là** (« Re-run jobs »), qui compare le même
avant/après. Attention : quand trois fusions à migration se suivent, GitHub annule le run
du milieu encore en attente ; le run suivant refuse alors sa migration comme « en
attente » — relancer le run annulé, puis celui qui a refusé.

## Mise en place — une fois, par Thierry

Le workflow ne peut rien faire avant ces gestes.

1. **Environnement** : Settings → Environments → **New environment** → `supabase-production`
   (un environnement dédié, **pas** `production` : les noms ignorent la casse, et
   « Production » est celui où Vercel déploie). Deployment branches and tags : **Selected
   branches** → `main` seulement. Pas de relecteur obligatoire (il ramènerait l'attente que
   cette décision supprime).
2. **Secret d'environnement** (pas un secret de dépôt) `SUPABASE_DB_URL` : la chaîne de
   connexion du **session pooler** du projet de production (Dashboard → Connect). Pas la
   connexion directe — les runners GitHub n'ont que l'IPv4 — ni le transaction pooler. Mot
   de passe encodé pour une URL. Aucun jeton personnel Supabase : il ouvrirait tout le
   compte, cette chaîne n'ouvre que cette base.
3. Fusionner une première migration additive et lire le run.

Le secret n'est jamais affiché : GitHub masque sa valeur entière, et le workflow déclare
en plus comme masques le mot de passe, l'utilisateur, l'identifiant de projet et l'hôte,
que la CLI cite dans ses erreurs de connexion (mesuré avec la 2.84.2 : hôte et utilisateur
cités, mot de passe jamais). Ne jamais ajouter `--debug` à ces étapes.
