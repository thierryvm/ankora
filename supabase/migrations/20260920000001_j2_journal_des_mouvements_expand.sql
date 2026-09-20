-- =========================================================================
-- J2 / ADR-038 D1 + ADR-045 — le journal des opérations et le relevé de solde
-- =========================================================================
-- PUREMENT ADDITIVE. Aucune colonne existante n'est modifiée, renommée ou
-- retirée ; aucune donnée existante n'est réécrite. `accounts.balance` est LU
-- une fois pour semer le premier relevé, et jamais touché.
--
-- Elle ne porte donc PAS de fichier `_contract` : il n'y a aucun NOT NULL
-- différé à poser plus tard, aucune fenêtre à refermer. Le suffixe `_expand`
-- dit la nature du changement, pas l'existence d'un second temps.
--
-- Ce que cette migration NE fait pas, volontairement :
--   · aucun `accounts.id` — ADR-040 E1 le renvoie en fin de programme ; le
--     journal se clé sur (workspace_id, account_type), ADR-040 E2. Ce que
--     cette clé interdit, et ce que coûtera d'en sortir : ADR-045 §clé.
--   · aucune suppression de `workspaces.monthly_income` (ADR-038 D2) ni de
--     `workspace_settings.savings_balance` (D6) : ce serait destructif.
--   · aucune lecture de ces tables par l'application. J2 pose le fait, il ne
--     l'exploite pas — les écrans et la dérivation sont les lots suivants.
--
-- Pas de `begin;` / `commit;` : le contrôle transactionnel appartient à la CLI
-- Supabase, et en poser un second produirait l'état à moitié migré que les
-- garde-fous ci-dessous existent pour empêcher. Rien ici ne relève du DDL non
-- transactionnel (CREATE INDEX CONCURRENTLY, ALTER TYPE ... ADD VALUE).
--
-- CE QU'ELLE CHANGE QUAND MÊME, et qu'« additive » ne prépare pas : à partir
-- de son COMMIT, chaque ligne de `accounts` est référencée par un relevé. Via
-- les clés étrangères posées à l'étape 4, cela rend, pour 100 % des comptes et
-- non plus seulement pour ceux déjà pointés par un paiement :
--   · `accounts.account_type` IMMUABLE (`on update restrict`) ;
--   · `delete from public.accounts` REFUSÉ (`on delete no action`).
-- Mesuré sans conséquence aujourd'hui — les trois écritures de
-- `src/lib/actions/accounts.ts` ne touchent que `balance`, `label` et
-- `display_name`, et aucun `delete` sur `accounts` n'existe dans `src/`,
-- `e2e/` ou `scripts/`. C'est néanmoins le sujet direct de « Ajouter un
-- compte » : ADR-045 §clé en chiffre le coût.
--
-- RETOUR ARRIÈRE : `docs/runbooks/j2-retour-arriere.sql` — à jouer à la main,
-- jamais par la CLI. Il ne détruit que ce que ce fichier a créé.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Le privilège, mesuré — avant tout le reste
-- -------------------------------------------------------------------------
-- TOUS les garde-fous de ce fichier comptent des lignes lues dans `accounts`
-- et `workspaces`, qui sont en `force row level security`. Sans BYPASSRLS,
-- ces lectures rendent ZÉRO LIGNE : la boucle de réparation ne tourne pas, le
-- semis n'insère rien, et les deux blocs de vérification — qui comparent des
-- zéros — se déclarent satisfaits. La migration réussirait en livrant deux
-- tables vides.
--
-- C'est le mode de panne que 20260810000001:51-59 décrivait déjà, avec une
-- cause inexacte : un INSERT refusé par RLS est BRUYANT (42501). Le silence
-- vient de la LECTURE, jamais de l'écriture — et c'est ce qui rend un
-- garde-fou par comptage aveugle à ce qu'il prétend surveiller.
--
-- On mesure donc le privilège lui-même. `rolbypassrls` ne s'hérite pas par
-- appartenance à un rôle : c'est bien `current_user` qu'il faut tester.
do $$
begin
  if not coalesce(
       (select rolbypassrls or rolsuper from pg_roles where rolname = current_user),
       false) then
    raise exception
      'J2 : le role de migration (%) ne porte ni BYPASSRLS ni SUPERUSER. accounts et workspaces sont en FORCE ROW LEVEL SECURITY : toute lecture de ce fichier rendrait zero ligne, et tous les garde-fous par comptage passeraient a vide. Migration interrompue AVANT tout DDL.',
      current_user;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. Réparation préalable, idempotente
-- -------------------------------------------------------------------------
-- Un workspace dont un compte manque ferait échouer le semis des relevés à
-- mi-parcours. Même forme que 20260417000004:119-126 et 20260810000001:41-49.
do $$
declare
  ws record;
begin
  for ws in select id from public.workspaces loop
    perform public.seed_default_accounts(ws.id);
  end loop;
end $$;

-- Et on VÉRIFIE que la réparation a réparé, au lieu de le supposer.
--
-- `seed_default_accounts` est `security definer` et écrit dans `accounts`, une
-- table en `force row level security` SANS policy INSERT : cette écriture ne
-- passe que si le rôle propriétaire porte BYPASSRLS. Vrai en local
-- (superutilisateur) ; sur l'instance hébergée, ce n'est pas quelque chose que
-- cette migration peut lire — donc pas quelque chose qu'elle a le droit de
-- croire. Sans ce bloc, la boucle ci-dessus sèmerait ZÉRO ligne sans lever la
-- moindre erreur (20260810000001:51-59).
do $$
declare
  incomplets integer;
begin
  select count(*)
    into incomplets
    from public.workspaces w
   cross join (values ('income_bills'), ('provisions'), ('daily_card')) as t(cible)
   where not exists (
     select 1 from public.accounts a
      where a.workspace_id = w.id and a.account_type = t.cible
   );

  if incomplets > 0 then
    raise exception
      'J2 : % compte(s) manquant(s) apres la reparation. seed_default_accounts n''a pas ecrit — verifier BYPASSRLS du role proprietaire. Migration interrompue AVANT tout DDL.',
      incomplets;
  end if;
end $$;

-- Les messages de cette migration portent des NOMBRES, jamais des
-- identifiants : la sortie de `db push` finit régulièrement collée dans un
-- rapport de PR, et ce dépôt est public (20260810000001:91-94).

-- -------------------------------------------------------------------------
-- 2. public.movements — une opération datée
-- -------------------------------------------------------------------------
-- UNE table, pas deux : ADR-038 D1 (`:114-120`) décide une ligne portant
-- `from` et `to`, l'un des deux nul pour une entrée externe. Le découpage en
-- deux tables spécialisées a été écarté par @thierry le 2026-09-20 (ADR-045
-- D13) : il aurait amendé un ADR `Accepted` dans la session qui l'implémente.
--
-- Prix assumé : quatre CHECK conditionnels. Chacun a son test qui le fait
-- ÉCHOUER (`e2e/journal-mouvements.spec.ts`) — un CHECK jamais vu refuser
-- n'est pas un garde-fou, c'est une intention.
--
-- `numeric(12,2)` : c'est la précision de TOUS les montants de flux du dépôt
-- (`charges.amount` 20260416000001:68, `expenses.amount` :88,
-- `charge_payments.paid_amount` 20260503000004:31). `numeric(14,2)` est celle
-- des SOLDES (`accounts.balance` 20260417000004:24) — voir la table suivante.
-- Pas de centimes entiers : le dépôt n'en utilise nulle part, et une troisième
-- convention monétaire se paierait à chaque conversion.
create table if not exists public.movements (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,

  -- 'transfer' : d'un compte à un autre. 'income' : de l'extérieur vers un
  -- compte. La sortie externe n'existe pas encore — les dépenses vivent dans
  -- `expenses` — mais la forme de la table la porte déjà (ADR-038 D1).
  kind          text not null check (kind in ('transfer', 'income')),

  from_account_type text,
  to_account_type   text,

  amount        numeric(12, 2) not null check (amount > 0 and amount <= 1e8),

  -- La date de l'opération telle que la personne la connaît, et l'instant où
  -- la ligne a été écrite. Les deux sont nécessaires et ne se déduisent pas
  -- l'une de l'autre : on saisit le 20 un virement fait le 17. `recorded_at`
  -- porte toute la règle de l'heure d'ADR-045 D16, et un trigger le fige.
  occurred_on   date not null,
  recorded_at   timestamptz not null default now(),

  -- Ventilation d'un versement vers les provisions (ADR-038 D4).
  provision_part    numeric(12, 2),
  free_savings_part numeric(12, 2),

  -- Les chiffres du plan du mois, COPIÉS au moment du geste — jamais une
  -- référence. `computeMonthlyTransferPlan` (src/lib/domain/transfer.ts:39-75)
  -- prend un mois sans année et ses quatre entrées sont mutables : pointer une
  -- « ligne de plan » désignerait un recalcul qui change quand une charge est
  -- éditée, soit la rétroactivité silencieuse que D3 existe pour fermer.
  plan_year             smallint check (plan_year between 2000 and 2100),
  plan_month            smallint check (plan_month between 1 and 12),
  plan_suggested_amount numeric(12, 2) check (plan_suggested_amount >= 0),

  -- Ce que la personne a reçu, et à quel titre. Vocabulaire délibérément
  -- neutre : 'regular' n'emprunte pas le nom de `workspaces.monthly_income`,
  -- que D2 supprimera — un lecteur futur y verrait un lien qui n'existe pas.
  -- L'interface dit « mon revenu du mois » et « en plus de mon revenu ».
  income_nature text check (income_nature in ('regular', 'extra')),

  description   text check (description is null or char_length(description) between 1 and 120),
  note          text check (note is null or char_length(note) <= 500),

  -- Annulation (ADR-045 D15) : une opération se défait, elle ne s'efface pas.
  -- `cancelled_by` est `on delete set null` — SURTOUT PAS `cascade` : la ligne
  -- appartient à son auteur, pas à qui l'a annulée, et une cascade ici
  -- effacerait l'opération de quelqu'un d'autre le jour où un co-membre part.
  -- Le CHECK est donc asymétrique, et c'est voulu : un annulateur sans
  -- annulation est impossible, une annulation dont l'annulateur a été effacé
  -- est un état normal.
  cancelled_at  timestamptz,
  cancelled_by  uuid references public.users(id) on delete set null,

  -- `on delete cascade`, hérité du motif du dépôt (20260416000001:51,66,86).
  -- Conséquence connue, écrite plutôt que laissée à découvrir : le départ d'un
  -- co-éditeur RETIRE ses opérations d'un workspace qui, lui, survit — et les
  -- soldes dérivés changent sans que rien ne le signale, contre ADR-038 D7 sur
  -- ce chemin précis. Sans effet tant qu'un workspace n'a qu'un membre, ce qui
  -- est le cas aujourd'hui côté écrans ; la base, elle, permet déjà l'inverse
  -- (20260417000001:17-24).
  created_by    uuid not null references public.users(id) on delete cascade,

  -- Règle 11 de CLAUDE.md : « une date se vérifie, une coche se croit ». Sans
  -- cette colonne, une ligne ré-ouverte, modifiée puis ré-annulée est
  -- indiscernable d'une ligne jamais touchée.
  updated_at    timestamptz not null default now(),

  -- CHECK 1 — au moins un compte. Redondant aujourd'hui avec les CHECK de
  -- `kind` ci-dessous ; gardé nommé parce qu'il porte la règle qui survivra à
  -- l'arrivée de la sortie externe, et parce qu'un test le vise par son nom.
  constraint movements_compte_present
    check (from_account_type is not null or to_account_type is not null),

  -- CHECK 2 — un virement ne va pas d'un compte à lui-même.
  constraint movements_comptes_distincts
    check (
      from_account_type is null
      or to_account_type is null
      or from_account_type <> to_account_type
    ),

  -- CHECK 3 — la forme dépend de la nature, exhaustivement et sans `else`
  -- fourre-tout : un `kind` inattendu est déjà refusé par son propre CHECK.
  constraint movements_forme_selon_nature
    check (
      case kind
        when 'transfer' then
          from_account_type is not null
          and to_account_type is not null
          and income_nature is null
        when 'income' then
          from_account_type is null
          and to_account_type is not null
          and income_nature is not null
          and description is not null
      end
    ),

  -- CHECK 4 — la ventilation (ADR-038 D4). Elle est OBLIGATOIRE vers les
  -- provisions et INTERDITE ailleurs. L'écart est refusé, jamais arrondi :
  -- seule la part libre réduit ce qui reste à virer vers la vie courante, le
  -- lissage étant déjà sorti du budget au poste de provision.
  constraint movements_ventilation
    check (
      case
        when kind = 'transfer' and to_account_type = 'provisions' then
          provision_part is not null
          and free_savings_part is not null
          and provision_part >= 0
          and free_savings_part >= 0
          and provision_part + free_savings_part = amount
        else
          provision_part is null and free_savings_part is null
      end
    ),

  -- CHECK 5 — les trois chiffres du plan vont ensemble ou pas du tout.
  constraint movements_plan_complet
    check (
      (plan_year is null and plan_month is null and plan_suggested_amount is null)
      or (plan_year is not null and plan_month is not null and plan_suggested_amount is not null)
    ),

  -- CHECK 6 — cf. le commentaire de `cancelled_by`.
  constraint movements_annulation_coherente
    check (cancelled_by is null or cancelled_at is not null)
);

-- -------------------------------------------------------------------------
-- 3. public.account_balance_statements — un solde relevé à une date
-- -------------------------------------------------------------------------
-- ADR-045 D14 : une SÉRIE, pas un ancre unique. ADR-038 D6 (`:208-215`)
-- décidait « une seule ligne d'ouverture par compte. Une seconde fausse tout,
-- silencieusement » — le danger est réel : un second relevé absorbe l'écart
-- entre ce qui est dérivé et ce qui est déclaré, le solde redevient juste, et
-- ce qui manquait disparaît.
--
-- `derived_balance` est ce qui retourne ce danger en mesure (ADR-040 D11 : le
-- rapprochement ne vérifie pas la justesse, il mesure ce qui MANQUE). Elle est
-- nullable parce que ce lot n'a aucun écran : une migration qui ne sait pas
-- dériver ne doit pas prétendre l'avoir fait. Les relevés du semis ci-dessous
-- font exception, et la raison est écrite là-bas.
--
-- `numeric(14,2)` et les bornes de `accounts.balance` (20260417000004:24) :
-- un solde est NÉGATIF quand on est à découvert, et cette table le permet.
create table if not exists public.account_balance_statements (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  account_type  text not null,

  balance       numeric(14, 2) not null check (balance >= -1e12 and balance <= 1e12),

  -- Le jour que la personne relève, et l'instant où elle l'a écrit. Deux
  -- relevés du même compte le même jour sont permis — c'est ainsi qu'on
  -- corrige une saisie sans effacer (règle 11) —, et l'ordre total qui
  -- départage est (stated_on desc, recorded_at desc, id desc).
  stated_on     date not null,
  recorded_at   timestamptz not null default now(),

  derived_balance numeric(14, 2) check (derived_balance >= -1e12 and derived_balance <= 1e12),

  cancelled_at  timestamptz,
  cancelled_by  uuid references public.users(id) on delete set null,
  created_by    uuid not null references public.users(id) on delete cascade,
  updated_at    timestamptz not null default now(),

  constraint account_balance_statements_annulation_coherente
    check (cancelled_by is null or cancelled_at is not null)
);

-- -------------------------------------------------------------------------
-- 4. Clés étrangères composites vers (workspace_id, account_type)
-- -------------------------------------------------------------------------
-- Cible : l'index unique `accounts_workspace_account_type_unique`
-- (20260503000001:56-57). Mêmes options que 20260810000001:282-297, et pour
-- les mêmes raisons — elles sont pesées là-bas, pas recopiées à l'aveugle :
--
--   · `match simple` (le défaut, écrit parce qu'il PORTE une décision) : une
--     référence dont une colonne est NULL n'est pas vérifiée. C'est ce qui
--     rend `from_account_type is null` possible pour une entrée externe.
--   · `on update restrict` : `account_type` ne change pas sous une opération
--     qui le référence.
--   · `on delete no action deferrable initially deferred` : le contrôle est
--     reporté au COMMIT, donc la suppression de compte (qui cascade depuis
--     `workspaces` vers `accounts` ET vers ces tables) passe, tandis qu'une
--     suppression isolée d'une ligne `accounts` est REFUSÉE au lieu d'emporter
--     le journal. `cascade` aurait donné la propriété RGPD au prix d'un
--     effacement destructif et silencieux ; `restrict` aurait parié sur
--     l'ordre de déclenchement des triggers d'intégrité entre deux branches de
--     cascade, ce qui n'est pas un contrat.
--
-- ⚠️ CE QUE CETTE PROPRIÉTÉ SUPPOSE, et qui n'est écrit nulle part ailleurs :
-- le contrôle différé s'exécute au COMMIT de CHAQUE transaction, pas à la fin
-- du traitement. L'effacement art. 17 passe aujourd'hui par UNE transaction —
-- `client.auth.admin.deleteUser(userId)`, `src/lib/gdpr/deletion-core.ts:142`,
-- sans aucun `delete` applicatif à côté. Le jour où cet effacement serait
-- découpé en plusieurs requêtes PostgREST (chacune sa transaction), le
-- `delete` sur `accounts` committrait alors que le journal existe encore, et
-- lèverait 23503 : suppression de compte REFUSÉE, c'est-à-dire une violation
-- légale, pas un défaut d'affichage. Ne pas découper.
--
-- ⚠️ MINE POSÉE POUR D0, identique à 20260810000001:270-279 : le jour où
-- `accounts.id` arrive, la reprise doit être `(workspace_id, id)`, JAMAIS `id`
-- seul — sinon la vérification d'intégrité devient un canal de sondage de
-- lignes qu'on n'a pas le droit de lire. ADR-045 en chiffre le coût.
alter table public.movements
  add constraint movements_from_account_fkey
  foreign key (workspace_id, from_account_type)
  references public.accounts (workspace_id, account_type)
  match simple on update restrict on delete no action
  deferrable initially deferred;

alter table public.movements
  add constraint movements_to_account_fkey
  foreign key (workspace_id, to_account_type)
  references public.accounts (workspace_id, account_type)
  match simple on update restrict on delete no action
  deferrable initially deferred;

alter table public.account_balance_statements
  add constraint account_balance_statements_account_fkey
  foreign key (workspace_id, account_type)
  references public.accounts (workspace_id, account_type)
  match simple on update restrict on delete no action
  deferrable initially deferred;

-- -------------------------------------------------------------------------
-- 5. Index
-- -------------------------------------------------------------------------
-- Règle de préfixe (20260818000001:90-95) : un index ne couvre une clé
-- étrangère que si les colonnes de la clé en forment un préfixe, DANS L'ORDRE.
-- Les advisors Supabase signalent toute FK non couverte, et `created_by` /
-- `cancelled_by` en sont : ce sont les chemins de la suppression de compte.
--
-- `account_balance_statements_lookup_idx` couvre à la fois la FK composite (en
-- préfixe) et la question « quel est le dernier relevé de ce compte » en un
-- seul parcours — d'où l'ordre de tri inscrit dans l'index.
create index if not exists movements_from_account_idx
  on public.movements (workspace_id, from_account_type);
create index if not exists movements_to_account_idx
  on public.movements (workspace_id, to_account_type);
create index if not exists movements_created_by_idx
  on public.movements (created_by);
create index if not exists movements_cancelled_by_idx
  on public.movements (cancelled_by);
create index if not exists movements_occurred_idx
  on public.movements (workspace_id, occurred_on desc, recorded_at desc);

create index if not exists account_balance_statements_lookup_idx
  on public.account_balance_statements
     (workspace_id, account_type, stated_on desc, recorded_at desc, id desc);
create index if not exists account_balance_statements_created_by_idx
  on public.account_balance_statements (created_by);
create index if not exists account_balance_statements_cancelled_by_idx
  on public.account_balance_statements (cancelled_by);

-- -------------------------------------------------------------------------
-- 6. RLS — et la rupture avec le patron voisin est DÉLIBÉRÉE
-- -------------------------------------------------------------------------
-- Les cinq tables voisines portent `<table>_editor_write ... FOR ALL`
-- (20260416000002:62-78, 20260503000004:54-59, 20260719000001:82-97).
-- **FOR ALL INCLUT DELETE.** Copier ce patron ici livrerait la policy DELETE
-- qu'ADR-038 D9 (`:255-258`) interdit, sans que personne ne la lise. D'où deux
-- policies d'écriture explicites, `for insert` et `for update`, et aucune
-- troisième. Précédent dans le dépôt : `accounts` n'a ni INSERT ni DELETE
-- depuis le 17 avril (20260417000004:38-39).
--
-- `(select auth.uid())` et non `auth.uid()` : 20260822000001:43-51 — « quiconque
-- les recrée doit y écrire `(select auth.uid())`, sans quoi le contenu de ce
-- fichier disparaît en silence » (initplan, un appel par requête et non un par
-- ligne).
--
-- L'UPDATE est réservé à l'AUTEUR de la ligne, pas à tout éditeur du
-- workspace : c'est lui qui a écrit, c'est lui qui défait (règle 11).
--
-- Ce que l'absence de policy DELETE ne fait PAS, et qui s'assume à l'écrit :
-- elle ne contraint pas le `service_role`, qui contourne RLS (même statut que
-- `audit_log`). D7 « rien ne se supprime » vaut contre le client.
alter table public.movements                  enable row level security;
alter table public.movements                  force  row level security;
alter table public.account_balance_statements enable row level security;
alter table public.account_balance_statements force  row level security;

create policy "movements_member_select" on public.movements
  for select using (public.is_workspace_member(workspace_id));

-- `cancelled_by` est contrôlé au même titre que `created_by` : sans ce
-- prédicat, la colonne que la documentation appelle « qui l'a annulée »
-- n'est pas une attribution, c'est une déclaration — on pourrait y inscrire
-- n'importe quel utilisateur de la base, y compris hors de son workspace.
create policy "movements_editor_insert" on public.movements
  for insert with check (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
    and (cancelled_by is null or cancelled_by = (select auth.uid()))
  );

create policy "movements_author_update" on public.movements
  for update
  using (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
  )
  with check (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
    and (cancelled_by is null or cancelled_by = (select auth.uid()))
  );

create policy "account_balance_statements_member_select" on public.account_balance_statements
  for select using (public.is_workspace_member(workspace_id));

create policy "account_balance_statements_editor_insert" on public.account_balance_statements
  for insert with check (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
    and (cancelled_by is null or cancelled_by = (select auth.uid()))
  );

create policy "account_balance_statements_author_update" on public.account_balance_statements
  for update
  using (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
  )
  with check (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
    and (cancelled_by is null or cancelled_by = (select auth.uid()))
  );

-- -------------------------------------------------------------------------
-- 7. Ce qu'un UPDATE ne peut pas toucher
-- -------------------------------------------------------------------------
-- Une policy `with check` ne suffit pas : elle laisse passer un déplacement
-- vers un autre workspace dont on est aussi éditeur, et elle ne dit rien de
-- `recorded_at`, sur lequel repose TOUTE la règle de l'heure (ADR-045 D16).
-- Un instant d'écriture qu'on peut réécrire fait mentir chaque solde dérivé
-- après coup, sans rien signaler.
--
-- Second rôle : sur une ligne ANNULÉE, seules les colonnes d'annulation
-- peuvent bouger. La ré-ouverture (`cancelled_at` repassé à NULL) reste
-- permise — annuler par erreur doit se réparer, sinon le « défaire » devient
-- lui-même le piège à un clic que la règle 11 combat —, mais le contenu d'une
-- ligne annulée ne dérive pas en silence.
--
-- La comparaison passe par `to_jsonb(...) - 'cancelled_at' - 'cancelled_by'`
-- plutôt que par une liste de colonnes : une colonne ajoutée demain est
-- protégée sans qu'on ait à y penser. Une liste, elle, se périme en silence.
--
-- `security invoker` : le corps ne lit ni n'écrit aucun objet, donc
-- `security definer` n'ajouterait qu'une surface d'escalade. Corollaire — ce
-- corps ne doit JAMAIS référencer d'objet : `check_function_bodies` ne résout
-- pas les noms d'un corps PL/pgSQL à la création, une lecture ajoutée ici
-- échouerait à l'exécution, pas au déploiement.
-- `set search_path = ''` : sans lui, advisor `function_search_path_mutable`.
create or replace function public.j2_protege_operation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.created_by is distinct from old.created_by
     or new.recorded_at is distinct from old.recorded_at then
    raise exception
      'J2 : id, workspace_id, created_by et recorded_at sont figes a l''ecriture (ADR-045 D15). Corriger passe par une annulation, pas par un UPDATE.';
  end if;

  if old.cancelled_at is not null
     and (to_jsonb(new) - 'cancelled_at' - 'cancelled_by' - 'updated_at')
         is distinct from (to_jsonb(old) - 'cancelled_at' - 'cancelled_by' - 'updated_at') then
    raise exception
      'J2 : une operation annulee ne se modifie plus (ADR-045 D15). Seule la reouverture est permise.';
  end if;

  return new;
end $$;

comment on function public.j2_protege_operation() is
  'ADR-045 D15 — fige workspace_id / created_by / recorded_at, et gele le contenu d''une ligne annulee (la reouverture reste permise).';

-- Une fonction neuve naît avec `proacl IS NULL`, donc EXECUTE pour anon,
-- authenticated et service_role. L'impact réel est nul (un appel direct rend
-- `0A000 trigger functions can only be called as triggers`, et PostgREST
-- n'expose pas les fonctions retournant `trigger`), mais un privilège qu'on
-- n'utilise pas est un privilège qu'on ferme (20260810000001:361-370).
-- Sans risque pour les triggers : PostgreSQL vérifie EXECUTE au
-- `create trigger`, jamais au déclenchement.
revoke execute on function public.j2_protege_operation()
  from public, anon, authenticated, service_role;

drop trigger if exists movements_protege on public.movements;
create trigger movements_protege
  before update on public.movements
  for each row execute function public.j2_protege_operation();

drop trigger if exists account_balance_statements_protege on public.account_balance_statements;
create trigger account_balance_statements_protege
  before update on public.account_balance_statements
  for each row execute function public.j2_protege_operation();

-- Et la même chose à l'INSERT, parce qu'un `default now()` N'EST PAS une
-- contrainte : il ne s'applique que si le client se tait. Or l'anon key est
-- publique (NEXT_PUBLIC_*), donc PostgREST est joignable directement avec le
-- JWT de la personne — une Server Action ne sera jamais un passage obligé.
-- Sans ce trigger, un `recorded_at` antérieur à tous les relevés rendrait une
-- opération RÉELLE invisible de chaque solde dérivé (ADR-045 D16), et une
-- ligne pourrait naître déjà annulée, donc ignorée du domaine dès l'écriture.
--
-- `derived_balance` n'est délibérément PAS forcé ici : c'est une mesure que la
-- PR des écrans devra écrire, et la forcer à NULL empêcherait le semis
-- ci-dessous de poser l'écart nul qu'ADR-045 D14 lui demande de porter.
create or replace function public.j2_impose_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.recorded_at  := now();
  new.updated_at   := now();
  new.cancelled_at := null;
  new.cancelled_by := null;
  return new;
end $$;

comment on function public.j2_impose_ecriture() is
  'ADR-045 D15/D16 — impose l''instant d''ecriture et interdit qu''une ligne naisse annulee. Un default ne s''applique que si le client se tait ; PostgREST est joignable directement.';

revoke execute on function public.j2_impose_ecriture()
  from public, anon, authenticated, service_role;

drop trigger if exists movements_impose_ecriture on public.movements;
create trigger movements_impose_ecriture
  before insert on public.movements
  for each row execute function public.j2_impose_ecriture();

drop trigger if exists account_balance_statements_impose_ecriture on public.account_balance_statements;
create trigger account_balance_statements_impose_ecriture
  before insert on public.account_balance_statements
  for each row execute function public.j2_impose_ecriture();

-- `touch_updated_at` (20260416000001) est déjà le mécanisme du dépôt. Les noms
-- des triggers comptent : PostgreSQL les déclenche par ordre alphabétique, et
-- `..._protege` passe avant `..._touch` — donc la protection compare bien
-- l'état soumis par le client, pas l'horodatage que le second vient d'écrire.
drop trigger if exists movements_touch on public.movements;
create trigger movements_touch
  before update on public.movements
  for each row execute function public.touch_updated_at();

drop trigger if exists account_balance_statements_touch on public.account_balance_statements;
create trigger account_balance_statements_touch
  before update on public.account_balance_statements
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------------------
-- 8. Le premier relevé de chaque compte existant
-- -------------------------------------------------------------------------
-- Les comptes existants ne sont JAMAIS recalculés en silence : leur solde
-- actuel DEVIENT leur premier relevé, daté d'aujourd'hui. `accounts.balance`
-- n'est ni réécrit, ni supprimé, ni déprécié par ce fichier.
--
-- `derived_balance = balance`, donc un écart NUL — par définition, pas par
-- commodité : les deux tables naissent vides, il n'existe donc AUCUN flux
-- enregistré antérieur à ce relevé, et le solde dérivé ne peut être que le
-- solde déclaré. @thierry, 2026-09-20.
--
-- `created_by` reçoit le PROPRIÉTAIRE du workspace : la colonne est
-- `not null` et c'est par elle que l'export art. 20 retrouve la ligne. La
-- personne n'a pas écrit ce relevé, la migration l'a écrit pour elle — d'où la
-- trace dans le commentaire de colonne plutôt qu'un auteur inventé.
--
-- Idempotent par le `not exists` : rejouer ce fichier ne crée pas un second
-- relevé, ce qui compte parce qu'un second relevé daté du même jour
-- décalerait l'ordre total sans rien apporter.
insert into public.account_balance_statements
  (workspace_id, account_type, balance, stated_on, derived_balance, created_by)
select a.workspace_id, a.account_type, a.balance, current_date, a.balance, w.owner_id
  from public.accounts a
  join public.workspaces w on w.id = a.workspace_id
 where not exists (
   select 1 from public.account_balance_statements s
    where s.workspace_id = a.workspace_id
      and s.account_type = a.account_type
 );

-- Et on vérifie que le semis a semé. Même mine que l'étape 1 : cette table est
-- en `force row level security` SANS policy INSERT, donc l'écriture ci-dessus
-- ne passe que par BYPASSRLS du rôle propriétaire. Un échec silencieux ici
-- livrerait une table VIDE sur l'instance hébergée, et ça ne se verrait qu'au
-- premier écran de soldes, des jours plus tard.
do $$
declare
  comptes  integer;
  releves  integer;
begin
  select count(*) into comptes from public.accounts;
  select count(*) into releves  from public.account_balance_statements;

  -- Le message ne porte QUE le delta. `comptes` vaut trois fois le nombre de
  -- workspaces (seed_default_accounts en pose exactement 3, handle_new_user
  -- exactement 1 par inscription) : le publier reviendrait à publier la taille
  -- du parc utilisateurs dans un dépôt public. La règle d'agrégation de
  -- CLAUDE.md §« Ce dépôt est PUBLIC » couvre une métrique autant qu'un
  -- identifiant.
  if releves < comptes then
    raise exception
      'J2 : % compte(s) sans releve initial apres le semis. L''insertion a ete refusee sans erreur — verifier BYPASSRLS du role proprietaire.',
      comptes - releves;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 8 bis. Et le premier relevé des comptes À VENIR
-- -------------------------------------------------------------------------
-- Le semis ci-dessus ne tourne QU'UNE FOIS. Sans ce trigger, tout compte créé
-- après cette migration — c'est-à-dire celui de chaque nouvel inscrit — naît
-- SANS ancre : `selectLatestStatement` rend null, et il n'existe aucune date à
-- partir de laquelle dériver son solde. Le défaut ne se verrait pas sur les
-- comptes d'aujourd'hui, seulement sur ceux de demain, ce qui est la pire
-- façon de le découvrir.
--
-- Le relevé vaut le solde du compte à sa création (zéro, `accounts.balance`
-- ayant `default 0`), et son écart est nul pour la même raison qu'au semis :
-- aucun flux n'existe avant lui.
--
-- `security definer` est ici NÉCESSAIRE, et c'est le seul endroit du fichier
-- où il l'est : `handle_new_user` appelle `seed_default_accounts` pendant
-- l'inscription, avant que la personne n'ait de session — `auth.uid()` est
-- NULL, et la table est en `force row level security` sans policy INSERT.
-- `search_path = ''` impose de qualifier chaque objet, ce que fait le corps.
create or replace function public.j2_ancre_nouveau_compte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_balance_statements
    (workspace_id, account_type, balance, stated_on, derived_balance, created_by)
  select new.workspace_id, new.account_type, new.balance, current_date, new.balance, w.owner_id
    from public.workspaces w
   where w.id = new.workspace_id
     and not exists (
       select 1 from public.account_balance_statements s
        where s.workspace_id = new.workspace_id
          and s.account_type = new.account_type
     );
  return null;
end $$;

comment on function public.j2_ancre_nouveau_compte() is
  'ADR-045 D14.1 — tout compte naît avec son premier releve (son ancre). Le semis de la migration ne couvrait que les comptes existants ; sans ce trigger, chaque nouvel inscrit naitrait sans date de depart.';

revoke execute on function public.j2_ancre_nouveau_compte()
  from public, anon, authenticated, service_role;

drop trigger if exists accounts_ancre_releve on public.accounts;
create trigger accounts_ancre_releve
  after insert on public.accounts
  for each row execute function public.j2_ancre_nouveau_compte();

-- -------------------------------------------------------------------------
-- 9. Documentation
-- -------------------------------------------------------------------------
comment on table public.movements is
  'ADR-038 D1 + ADR-045 D13 — le journal des operations : un virement fait entre deux comptes, ou de l''argent recu. Rien ne le LIT avant le lot suivant. L''interface dit « operation », jamais « mouvement » (@thierry, 2026-09-20).';

comment on column public.movements.kind is
  'transfer = d''un compte a un autre ; income = de l''exterieur vers un compte. La sortie externe (to nul) n''existe pas encore : les depenses vivent dans expenses.';
comment on column public.movements.from_account_type is
  'Compte debite, vocabulaire de accounts.account_type. NULL pour une entree externe (match simple ne verifie alors pas la cle).';
comment on column public.movements.to_account_type is
  'Compte credite, vocabulaire de accounts.account_type.';
comment on column public.movements.occurred_on is
  'Date de l''operation telle que la personne la connait — pas la date de saisie.';
comment on column public.movements.recorded_at is
  'Instant d''ecriture. FIGE par trigger : toute la regle de l''heure (ADR-045 D16) en depend — une operation du jour du releve ne compte que si elle a ete ecrite APRES lui.';
comment on column public.movements.provision_part is
  'Part de lissage d''un versement vers les provisions (ADR-038 D4). Obligatoire vers provisions, interdite ailleurs ; provision_part + free_savings_part = amount, l''ecart est refuse et jamais arrondi.';
comment on column public.movements.free_savings_part is
  'Part d''epargne libre. Seule elle reduit ce qui reste a virer vers la vie courante : le lissage est deja sorti du budget au poste de provision.';
comment on column public.movements.plan_suggested_amount is
  'Ce que le plan du mois proposait, COPIE au moment du geste. Jamais une reference : les entrees de computeMonthlyTransferPlan sont mutables, pointer une « ligne de plan » rendrait l''historique retroactif.';
comment on column public.movements.income_nature is
  'regular = « mon revenu du mois » ; extra = « en plus de mon revenu ». N''emprunte PAS le nom de workspaces.monthly_income, que D2 supprimera.';
comment on column public.movements.cancelled_at is
  'ADR-045 D15 — une operation se defait, elle ne s''efface pas (regle 11). Le domaine ignore une ligne annulee ; l''export art. 20 la contient, une operation annulee reste une donnee de la personne.';
comment on column public.movements.cancelled_by is
  'on delete set null, JAMAIS cascade : la ligne appartient a son auteur, pas a qui l''a annulee.';

comment on table public.account_balance_statements is
  'ADR-045 D14 — un solde releve a une date, et l''historique se garde. Le dernier releve d''un compte se lit sous l''ordre total (stated_on desc, recorded_at desc, id desc).';
comment on column public.account_balance_statements.balance is
  'Le solde DECLARE par la personne ce jour-la. Negatif autorise (decouvert).';
comment on column public.account_balance_statements.derived_balance is
  'Le solde DERIVE a l''instant du releve, donc l''ecart que ce releve absorbe (ADR-040 D11 : mesurer ce qui MANQUE). NULL tant qu''aucun ecran n''ecrit. Les releves semes par la migration du 2026-09-20 valent balance : aucun flux n''existait avant eux, l''ecart est nul par definition.';
comment on column public.account_balance_statements.created_by is
  'Auteur du releve, et chemin de l''export art. 20. Les releves semes par la migration portent le PROPRIETAIRE du workspace : la personne ne les a pas ecrits, la migration les a ecrits pour elle.';
comment on column public.account_balance_statements.recorded_at is
  'Instant d''ecriture, FIGE par trigger. Depart la regle de l''heure d''ADR-045 D16.';
