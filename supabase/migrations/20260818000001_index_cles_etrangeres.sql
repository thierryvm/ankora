-- =========================================================================
-- Index de couverture pour les clés étrangères non indexées
--
-- POURQUOI, et pourquoi ce n'est pas de la performance décorative.
--
-- PostgreSQL n'indexe PAS automatiquement le côté référençant d'une clé
-- étrangère. Il n'indexe que la clé primaire du côté référencé. Conséquence :
-- pour chaque ligne supprimée dans une table parente, il doit trouver les
-- lignes enfants qui la référencent — et sans index, cela se fait par un
-- parcours séquentiel de la table enfant ENTIÈRE, une fois par ligne parente.
--
-- Le chemin qui rend cela concret ici est la SUPPRESSION DE COMPTE (RGPD
-- art. 17, 30 jours). La chaîne est : `auth.users` -> `public.users`
-- (`users_id_fkey ... on delete cascade`) -> les enfants ci-dessous. Le cron
-- `src/app/api/cron/gdpr/` la déclenche. Aujourd'hui la base est minuscule et
-- rien ne se voit ; le jour où les dépenses s'accumulent, une suppression peut
-- dépasser le temps imparti — donc échouer sur une obligation à DÉLAI LÉGAL.
--
-- Le plus gros gain n'est PAS un `created_by`. Une suppression d'utilisateur
-- ne détruit qu'UNE ligne parente, donc un parcours par table. En revanche
-- `audit_log.workspace_id` porte `on delete set null` et `audit_log` est la
-- table qui grossit le plus : supprimer un workspace y déclenche une écriture
-- par ligne concernée. C'est là que l'absence d'index coûte le plus cher.
--
-- RETOUR ARRIÈRE : `drop index if exists public.<nom>;` pour chacun des 14.
-- Aucune donnée n'est touchée, aucune contrainte n'est modifiée : un index se
-- retire sans effet de bord.
--
-- PAS DE `create index concurrently` ICI, et la raison est contraignante plutôt
-- que préférentielle : `concurrently` ne peut PAS s'exécuter dans un bloc
-- transactionnel, or `supabase db push` enveloppe chaque fichier de migration
-- dans une transaction — c'est ce que rappelle
-- `20260810000001_d3_attribution_paiements_expand.sql:29-33`. Un `concurrently`
-- ici rendrait `25001 active sql transaction` au push, pas un verrou long.
-- Sur des tables de cette taille, la prise de verrou se compte en
-- millisecondes ; et `concurrently` peut laisser un index `INVALID` à nettoyer
-- à la main lorsqu'il échoue, ce qui est un coût sans contrepartie ici.
--
-- Pas de `begin;` / `commit;` : le contrôle transactionnel appartient à la CLI.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Clés étrangères mono-colonne
-- -------------------------------------------------------------------------
-- Nommage conforme à l'existant, qui RETIRE le suffixe `_id` de la colonne
-- (`audit_log_user_idx` pour `user_id`, `workspaces_owner_idx` pour
-- `owner_id`). `created_by` n'a pas de suffixe à retirer.

-- `on delete set null`, et audit_log est la table la plus volumineuse : c'est
-- le candidat au gain le plus élevé de tout ce fichier.
create index if not exists audit_log_workspace_idx
  on public.audit_log (workspace_id);

-- Les six `created_by` ci-dessous référencent tous `public.users(id)` en
-- `on delete cascade` — le chemin de la suppression de compte.
create index if not exists categories_created_by_idx
  on public.categories (created_by);

create index if not exists charge_payments_created_by_idx
  on public.charge_payments (created_by);

create index if not exists charges_created_by_idx
  on public.charges (created_by);

create index if not exists commitment_payments_created_by_idx
  on public.commitment_payments (created_by);

create index if not exists commitments_created_by_idx
  on public.commitments (created_by);

create index if not exists expenses_created_by_idx
  on public.expenses (created_by);

-- Les trois `category_id` portent `on delete set null` : supprimer une
-- catégorie réécrit ses lignes filles plutôt que de les détruire.
create index if not exists charges_category_idx
  on public.charges (category_id);

create index if not exists commitments_category_idx
  on public.commitments (category_id);

create index if not exists expenses_category_idx
  on public.expenses (category_id);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

-- -------------------------------------------------------------------------
-- 2. Clés étrangères COMPOSITES — l'ordre des colonnes est imposé
-- -------------------------------------------------------------------------
-- `charge_payments_paid_from_account_fkey` et son jumeau portent
-- `(workspace_id, paid_from_account_type)` vers `accounts(workspace_id,
-- account_type)`. Un index couvre une vérification de clé étrangère seulement
-- si les colonnes de la clé forment un PRÉFIXE de l'index, dans le même ordre —
-- d'où `(workspace_id, paid_from_account_type)` et non l'une des deux seule.
--
-- CECI RENVERSE UNE DÉCISION ÉCRITE le 10 août
-- (`20260810000001_d3_attribution_paiements_expand.sql:278-279`), qui disait :
-- « Pas d'index dédié sur (workspace_id, paid_from_account_type) : les index
-- existants `*_period_idx` portent déjà `workspace_id` en tête. »
--
-- Cette phrase est vraie sur `workspace_id` et fausse sur ce qui suit :
-- `charge_payments_period_idx` est `(workspace_id, period_year, period_month)`.
-- Sa deuxième colonne n'est pas celle de la clé, donc l'index ne peut servir
-- qu'à restreindre au workspace, puis PostgreSQL filtre les lignes restantes.
-- Ce n'est pas une couverture, c'est un dégrossissage. Les advisors Supabase
-- signalent d'ailleurs ces deux clés comme non indexées.
--
-- À noter, et c'est ce qui rend le sujet moins urgent que les cascades : ces
-- deux clés sont `on update restrict` / `on delete no action`. Elles ne
-- participent donc à AUCUNE suppression en cascade ; le gain porte sur les
-- écritures dans `accounts`, pas sur le chemin RGPD.
create index if not exists charge_payments_paid_from_account_idx
  on public.charge_payments (workspace_id, paid_from_account_type);

create index if not exists commitment_payments_paid_from_account_idx
  on public.commitment_payments (workspace_id, paid_from_account_type);

-- -------------------------------------------------------------------------
-- 3. `deletion_requests.user_id` — que les advisors NE signalent pas
-- -------------------------------------------------------------------------
-- C'est le quatorzième, et il n'était dans aucune liste. La table porte deux
-- index, et aucun ne couvre la clé :
--
--   deletion_requests_status_idx      (status, scheduled_for)     -- autre colonne
--   deletion_requests_one_active_idx  (user_id) WHERE status IN … -- PARTIEL
--
-- Un index PARTIEL ne peut pas servir à une vérification d'intégrité
-- référentielle : il ne contient qu'un sous-ensemble des lignes, donc il ne
-- permet pas de prouver l'absence de ligne référençante. La sonde de l'advisor
-- voit un index sur `user_id` et s'arrête là, sans regarder son prédicat.
--
-- L'ironie est que c'est la table du cron de suppression RGPD — celle-là même
-- que l'argumentaire de ce fichier invoque. S'en tenir au verdict de l'outil
-- aurait laissé découverte la clé la plus proche du sujet, tout en affichant
-- « unindexed_foreign_keys : 0 ». Un critère de succès qui se satisfait sans
-- que le problème soit réglé est pire que pas de critère du tout.
create index if not exists deletion_requests_user_idx
  on public.deletion_requests (user_id);
