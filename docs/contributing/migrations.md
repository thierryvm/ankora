# Migrations Supabase — qui les applique, et dans quel ordre

> Décision @thierry, 29 septembre 2026. Remplace la procédure « le pilote pousse la
> migration à la main après la fusion » de `docs/runbooks/supabase-migrations.md`.

## En une phrase

**La CI applique les migrations en production à la fusion sur `main`, et seulement si
elles sont additives.** Tout ce qui détruit, réécrit ou élargit un accès est refusé par la
CI et poussé à la main par Thierry.

- Contrôle sur la PR : job « Additive migrations » de `.github/workflows/ci.yml` (sans
  secret).
- Application : `.github/workflows/migrations-production.yml`, déclenché par un push sur
  `main` qui touche `supabase/migrations/`. Rien d'autre ne le déclenche : ni bouton, ni PR,
  ni fork.
- La garde : `scripts/ci/migrations-additives.mjs`, testée par
  `scripts/ci/__tests__/migrations-additives.test.ts`.

## Ce que la garde refuse

Liste fermée. Une migration ajoutée est refusée si elle contient :

| Refusé                                                                    | Pourquoi                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| tout `drop` (table, colonne, contrainte, policy, fonction, type, défaut…) | détruit                                             |
| `truncate`, `delete from`                                                 | efface des données                                  |
| `update … set`, `on conflict do update set`                               | réécrit des données                                 |
| `alter column … type`                                                     | réécrit une colonne                                 |
| `rename`                                                                  | casse l'ancien code, qui lit l'ancien nom           |
| `set not null` sur une colonne existante                                  | l'ancien code peut encore écrire `null`             |
| `revoke` sur un objet existant                                            | retire un droit dont l'ancien code se sert          |
| `alter policy`, `disable` / `no force row level security`                 | réécrit ou affaiblit une règle d'accès              |
| `grant … to anon` ou `to public`, `alter default privileges`              | élargit l'accès                                     |
| `create or replace` d'une fonction, vue ou trigger **déjà créé**          | réécrit l'objet — une fonction lue par la RLS aussi |

Et hors du SQL : un fichier de migration **modifié, supprimé ou renommé** (la base ne
rejoue jamais une migration déjà appliquée : la modifier crée une dérive silencieuse), ou
une migration datée **avant** la dernière de l'historique.

Sont acceptés parce que le même fichier crée l'objet visé : `drop policy if exists` /
`drop trigger if exists` sur une table créée dans ce fichier (le motif idempotent),
`set not null` sur une colonne ajoutée dans ce fichier, `revoke` sur une table ou une
fonction créée dans ce fichier, `create or replace` d'une fonction neuve.

**Choix délibérés, tous du côté du refus :**

- Les commentaires (`--` et `/* */`) sont retirés avant l'analyse : un `drop` commenté ne
  compte pas.
- Les **chaînes** et les corps `$…$` sont analysés : un `drop` dans une chaîne compte,
  parce que `execute 'drop table …'` dans un bloc `do` passerait sinon. Même chose pour
  le corps d'une fonction qui contient `delete from`. Le prix est un faux positif, qui se
  règle par le chemin manuel.
- Mesuré le 29 septembre 2026 sur les 27 migrations de l'historique, chacune rejouée comme
  si elle arrivait seule : 18 auraient été refusées. La plupart pour de vraies réécritures
  (réécriture de 20 policies, `update` de rattrapage, `drop` de colonnes) ; quelques-unes
  pour un `drop … if exists` sur une table existante. C'est voulu : ces migrations-là
  méritaient un humain.

**Ce que la liste ne voit pas** : une policy **neuve** sur une table existante, ou une
policy `to anon`, n'est pas refusée — elle ajoute. La relecture de la PR reste le filet
pour ce qui élargit l'accès en ajoutant.

## L'ordre avec Vercel — la règle qui le rend sans danger

À la fusion, deux choses partent **en même temps** et sans ordre garanti : le code (Vercel)
et la migration (le workflow). Pendant quelques minutes, l'ancien code tourne sur la
nouvelle base, ou le nouveau code sur l'ancienne. D'où la règle :

1. **Une migration additive est compatible avec l'ancien code ET le nouveau.** Une table,
   une colonne nullable, un index, une fonction neuve : l'ancien code ne les voit pas.
   C'est ce que la garde impose.
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
(`npx supabase@2.84.2`), vers un dossier **hors du dépôt** (jamais dans `docs/`, jamais
committé) :

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
Thierry l'ait poussée. Même règle si un run a échoué pour une autre raison (réseau) :
**relancer ce run-là** (« Re-run jobs »), qui compare le même avant/après.

## Mise en place — une fois, par Thierry

Le workflow ne peut rien faire avant ces trois gestes.

1. **Environnement** : Settings → Environments → `production`. Les noms d'environnement
   GitHub ne distinguent pas les majuscules : si l'intégration Vercel a déjà créé
   « Production », c'est **le même** environnement — le vérifier avant d'y toucher.
   Deployment branches : **`main` seulement**. Pas de relecteur obligatoire (il
   ramènerait l'attente que cette décision supprime).
2. **Secret d'environnement** (pas un secret de dépôt) `SUPABASE_DB_URL` : la chaîne de
   connexion du **session pooler** du projet de production (Dashboard → Connect). Pas la
   connexion directe — les runners GitHub n'ont que l'IPv4 — ni le transaction pooler. Mot
   de passe encodé pour une URL. Aucun jeton personnel Supabase : il ouvrirait tout le
   compte, cette chaîne n'ouvre que cette base.
3. Fusionner une première migration additive et lire le run.

Le secret n'est jamais affiché : GitHub masque sa valeur entière, et le workflow déclare
en plus comme masques le mot de passe, l'utilisateur, l'identifiant de projet et l'hôte,
que la CLI cite dans ses erreurs de connexion (mesuré avec la 2.84.2 : hôte et utilisateur
cités, mot de passe jamais).
