-- =========================================================================
-- J1 / ADR-038 D3 — l'attribution de compte se fige au paiement  (EXPAND 1/2)
-- =========================================================================
-- ORDRE OBLIGATOIRE — lire avant de toucher à ce fichier.
--
--   1. CETTE migration (expand) est poussée AVANT le merge du code.
--      Colonnes NULLABLES : l'ancien code déployé, qui insère sans elles,
--      continue de fonctionner. La FK est en MATCH SIMPLE (le défaut) : une
--      référence dont une colonne est NULL n'est pas vérifiée du tout.
--   2. Le code part par merge. Il remplit les colonnes.
--   3. SEULEMENT ENSUITE, une migration `..._contract.sql` re-remplit les
--      lignes écrites NULL pendant la fenêtre, puis pose le NOT NULL.
--
-- Ce second fichier N'EXISTE PAS dans cette PR, et c'est délibéré :
-- `supabase db push` n'applique pas « la prochaine » migration, il applique
-- TOUTES celles qui manquent. Tant qu'il serait dans l'arbre, la poussée
-- d'avant-merge appliquerait le NOT NULL avant le déploiement du code — soit
-- exactement le 23502 en production que la scission existe pour éviter.
--
-- Ne JAMAIS fusionner les deux fichiers.
--
-- Ce que cette migration NE fait pas, volontairement :
--   · aucun `accounts.id` (D0 est la DERNIÈRE livraison — ADR-040 E1)
--   · aucun `drop`/`alter` sur `accounts.kind` / `accounts.label` (issue #359)
--   · rien ne LIT encore ces colonnes : la dérivation des soldes est D6 (J4).
--     J1 pose le fait, il ne l'exploite pas.
-- =========================================================================

-- Pas de `begin;` / `commit;` ici : le contrôle transactionnel appartient à la
-- CLI Supabase, et en poser un second produirait exactement l'état à moitié
-- migré que les garde-fous ci-dessous cherchent à empêcher. Rien dans ce
-- fichier ne relève du DDL non transactionnel de PostgreSQL (CREATE INDEX
-- CONCURRENTLY, ALTER TYPE ... ADD VALUE, VACUUM).

-- -------------------------------------------------------------------------
-- 1. Réparation préalable, idempotente
-- -------------------------------------------------------------------------
-- Un workspace dont un compte manque ferait échouer le backfill à mi-parcours.
-- Même forme que 20260417000004:119-126 — `on conflict do nothing`, donc sans
-- effet sur les workspaces déjà complets.
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
-- table en `force row level security` SANS aucune policy INSERT. Cette écriture
-- ne passe que si le rôle propriétaire porte BYPASSRLS. C'est le cas en local
-- (superutilisateur) ; sur l'instance hébergée, ce n'est pas quelque chose que
-- cette migration peut lire — donc pas quelque chose qu'elle a le droit de
-- croire. Si l'hypothèse est fausse, la boucle ci-dessus sème ZÉRO ligne sans
-- lever la moindre erreur, et la panne n'apparaîtrait qu'au premier pointage
-- d'une facture, en 23503, des jours plus tard.
--
-- Ce bloc transforme donc un échec muet en échec bruyant, ici, avant tout DDL.
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
      'D3 : % compte(s) manquant(s) apres la reparation. seed_default_accounts n''a pas ecrit — verifier BYPASSRLS du role proprietaire. Migration interrompue AVANT tout DDL.',
      incomplets;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 2. Garde-fou A — cohérence des workspace_id parent/enfant
-- -------------------------------------------------------------------------
-- `charge_payments.charge_id` et `charge_payments.workspace_id` sont DEUX
-- clés étrangères indépendantes (20260503000004:26-27) : rien au niveau du
-- schéma ne garantit qu'elles désignent le même workspace. Le backfill joint
-- donc sur les deux, et une ligne incohérente en sortirait silencieusement
-- NULL — pour n'exploser qu'à la migration `contract`, des jours plus tard.
-- On la révèle ici, avant tout DDL.
--
-- Le message porte le NOMBRE, jamais les identifiants : la sortie de
-- `db push` finit régulièrement collée dans un rapport de PR, et ce dépôt est
-- public.
do $$
declare
  incoherentes integer;
begin
  select
      (select count(*)
         from public.charge_payments cp
         join public.charges c on c.id = cp.charge_id
        where c.workspace_id is distinct from cp.workspace_id)
    + (select count(*)
         from public.commitment_payments cmp
         join public.commitments cm on cm.id = cmp.commitment_id
        where cm.workspace_id is distinct from cmp.workspace_id)
    into incoherentes;

  if incoherentes > 0 then
    raise exception
      'D3 : % ligne(s) de paiement portent un workspace_id different de leur ligne parente. Migration interrompue AVANT tout DDL — corriger les donnees, puis rejouer.',
      incoherentes;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 3. Garde-fou B — le compte cible existe pour chaque paiement à reprendre
-- -------------------------------------------------------------------------
-- Un échec en première ligne se rejoue sans état à nettoyer. Un échec entre le
-- backfill et la FK laisserait une base à moitié migrée.
--
-- Les engagements n'ont pas encore de colonne `paid_from` (elle est créée à
-- l'étape 4, avec `default 'principal'`) : leur cible est donc toujours
-- `income_bills` à ce stade.
--
-- Le CASE est EXHAUSTIF SANS `else` : une valeur inattendue de `paid_from`
-- rend NULL, ne satisfait aucun `exists`, et se compte donc comme manquante.
-- Un `else 'income_bills'` l'aurait avalée en silence.
do $$
declare
  manquants integer;
begin
  select count(*)
    into manquants
    from (
      select cp.workspace_id as ws_id,
             case c.paid_from
               when 'principal' then 'income_bills'
               when 'epargne'   then 'provisions'
             end as cible
        from public.charge_payments cp
        join public.charges c
          on c.id = cp.charge_id
         and c.workspace_id = cp.workspace_id
      union
      select cmp.workspace_id, 'income_bills'
        from public.commitment_payments cmp
    ) besoins
   where not exists (
     select 1
       from public.accounts a
      where a.workspace_id = besoins.ws_id
        and a.account_type = besoins.cible
   );

  if manquants > 0 then
    raise exception
      'D3 : % paire(s) (workspace, account_type) introuvable(s) dans public.accounts. Migration interrompue AVANT tout DDL.',
      manquants;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 4. commitments.paid_from — le pendant de charges.paid_from
-- -------------------------------------------------------------------------
-- Mêmes deux valeurs que `charges.paid_from` (20260417000004:72-74) : la vie
-- courante est une carte de dépenses quotidiennes, elle ne règle pas une
-- obligation datée.
--
-- Le défaut `principal` n'est pas « le défaut de l'autre table » : une
-- mensualité de crédit sort du compte qui reçoit le salaire. C'est la nature
-- de l'objet. Il remplit aussi les lignes existantes — hypothèse écrite noir
-- sur blanc dans le commentaire de colonne, avec l'issue qui porte sa mise à
-- l'écran.
alter table public.commitments
  add column if not exists paid_from text not null default 'principal'
    check (paid_from in ('principal', 'epargne'));

-- -------------------------------------------------------------------------
-- 5. paid_from_account_type — NULLABLE pendant toute la fenêtre expand
-- -------------------------------------------------------------------------
alter table public.charge_payments
  add column if not exists paid_from_account_type text;

alter table public.commitment_payments
  add column if not exists paid_from_account_type text;

-- -------------------------------------------------------------------------
-- 6. Backfill
-- -------------------------------------------------------------------------
-- Vocabulaire cible : celui de `accounts.account_type` (ADR-008), jamais celui
-- de `paid_from`. La bijection est la même que celle qu'applique le code —
-- `src/lib/domain/accounts/account-type.ts`.
--
-- La jointure contrôle l'égalité des workspace_id (cf. garde-fou A). Elle est
-- redondante avec lui par construction : c'est voulu, le garde-fou peut être
-- retiré un jour, la jointure non.
update public.charge_payments cp
   set paid_from_account_type = case c.paid_from
                                  when 'principal' then 'income_bills'
                                  when 'epargne'   then 'provisions'
                                end
  from public.charges c
 where c.id = cp.charge_id
   and c.workspace_id = cp.workspace_id
   and cp.paid_from_account_type is null;

update public.commitment_payments cmp
   set paid_from_account_type = case cm.paid_from
                                  when 'principal' then 'income_bills'
                                  when 'epargne'   then 'provisions'
                                end
  from public.commitments cm
 where cm.id = cmp.commitment_id
   and cm.workspace_id = cmp.workspace_id
   and cmp.paid_from_account_type is null;

-- -------------------------------------------------------------------------
-- 7. Clés étrangères composites
-- -------------------------------------------------------------------------
-- Cible : l'index unique `accounts_workspace_account_type_unique`
-- (20260503000001:56-57). PostgreSQL accepte un index unique immédiat et non
-- partiel comme cible de FK — vérifié à l'application locale, pas supposé.
--
-- MATCH SIMPLE (le défaut, écrit ici parce qu'il PORTE une décision) : si au
-- moins une colonne référençante est NULL, la ligne n'est pas vérifiée. C'est
-- ce qui rend la fenêtre expand sûre aujourd'hui, et ce qui portera la
-- sémantique « entrée/sortie externe » de la table de mouvements en J2.
--
-- `on delete no action deferrable initially deferred` — TROIS options ont été
-- pesées, pas deux, et la troisième gagne :
--
--   · `restrict` : vérifié IMMÉDIATEMENT, y compris quand la ligne référençante
--     part dans la même instruction. La suppression d'un compte Ankora est un
--     unique `delete` sur `auth.users` qui cascade en chaîne (users → workspaces
--     → accounts ET → charge_payments) ; l'ordre de déclenchement des triggers
--     d'intégrité entre ces deux branches n'est pas un contrat. RESTRICT aurait
--     donc été un pari sur l'obligation RGPD art. 17. Écarté.
--   · `cascade` : sûr pour la suppression de compte, mais il paie ce confort en
--     rendant DESTRUCTIF l'effacement d'une ligne de `accounts` — tout
--     l'historique de paiement attribué à ce compte partirait avec elle, en
--     silence et au-dessus de RLS. Un registre financier qui cascade depuis une
--     table de référence contredit ADR-038 D7. Écarté à son tour.
--   · `no action deferrable initially deferred` : le contrôle est reporté au
--     COMMIT. À ce moment, la cascade depuis `workspaces` a déjà emporté les
--     paiements, donc la suppression de compte passe ; et une suppression isolée
--     d'une ligne `accounts` est REFUSÉE au lieu d'emporter le registre.
--     La propriété RGPD sans la propriété destructrice. Retenu.
--
-- `on update restrict` : `accounts.account_type` ne doit jamais changer sous des
-- paiements qui le référencent. Attention à ce que cette ligne prouve — et à ce
-- qu'elle NE prouve PAS : le `comment on column` de 20260503000001:79-80 dit
-- « Never user-editable », mais un commentaire n'est pas un mécanisme. Cette
-- contrainte rend l'invariant exécutable UNIQUEMENT à partir du moment où un
-- paiement référence la paire. Le verrouillage complet de la colonne est une
-- affaire de privilèges, pas de clé étrangère, et il ne se fait pas ici.
--
-- MATCH SIMPLE (le défaut, écrit ici parce qu'il PORTE une décision) : si au
-- moins une colonne référençante est NULL, la ligne n'est pas vérifiée. C'est
-- ce qui rend la fenêtre expand sûre aujourd'hui, et ce qui portera la
-- sémantique « entrée/sortie externe » de la table de mouvements en J2.
--
-- `accounts` est en `force row level security` — SANS EFFET ici : PostgreSQL
-- fait passer les vérifications d'intégrité référentielle au-dessus de RLS, par
-- conception (`CREATE POLICY`, §Notes). Écrit pour qu'un audit RLS ne
-- « découvre » pas un faux problème.
--
-- ⚠️ MINE POSÉE POUR D0 — à lire avant de toucher à `accounts`. La même page de
-- documentation prévient qu'une vérification d'intégrité peut servir de CANAL
-- CACHÉ pour sonder des lignes qu'on n'a pas le droit de lire. Ce n'en est pas
-- un ici, et la raison est structurelle : `workspace_id` est DANS la clé, donc
-- les seules paires sondables sont celles de son propre workspace, et y écrire
-- exige de passer le `with check` de la policy. Cette garantie DISPARAÎT le jour
-- où D0 fera pointer cette FK sur `accounts.id` seul. La reprise devra être
-- `(workspace_id, id)` avec l'index unique correspondant — jamais `id` seul.
--
-- Pas d'index dédié sur (workspace_id, paid_from_account_type) : les index
-- existants `*_period_idx` portent déjà `workspace_id` en tête.
alter table public.charge_payments
  add constraint charge_payments_paid_from_account_fkey
  foreign key (workspace_id, paid_from_account_type)
  references public.accounts (workspace_id, account_type)
  match simple
  on update restrict
  on delete no action
  deferrable initially deferred;

alter table public.commitment_payments
  add constraint commitment_payments_paid_from_account_fkey
  foreign key (workspace_id, paid_from_account_type)
  references public.accounts (workspace_id, account_type)
  match simple
  on update restrict
  on delete no action
  deferrable initially deferred;

-- -------------------------------------------------------------------------
-- 8. Gel de l'attribution — EN DERNIER, et l'ordre est le sujet
-- -------------------------------------------------------------------------
-- Posé avant l'étape 6, ce trigger se déclencherait sur chaque ligne de
-- l'UPDATE du backfill et la migration avorterait. C'est pour ça qu'il est ici
-- et pas plus haut.
--
-- Le garde `old.paid_from_account_type is not null` est INDISPENSABLE : sans
-- lui, la migration `contract` ne pourrait pas remplir les lignes restées NULL
-- pendant la fenêtre.
--
-- Ce que ce trigger garantit, exactement : un UPDATE ne peut pas ré-attribuer
-- un paiement DÉJÀ attribué. Trois limites, et les trois sont écrites ici parce
-- que la prochaine session lira « figé » et le croira :
--
--   1. Ce n'est PAS une immuabilité. Dépointer supprime physiquement la ligne
--      (issue #361), donc décocher puis recocher ré-attribue librement.
--   2. La transition `NULL → valeur` reste OUVERTE pendant toute la fenêtre
--      expand, et pas seulement à la migration `contract` : un utilisateur peut
--      renseigner lui-même une de ses lignes encore nulle. Ni fuite ni écriture
--      hors workspace (RLS et FK tiennent), mais c'est bien la ré-attribution
--      que D3 prétend fermer, laissée entrouverte le temps de la fenêtre. Elle
--      se referme avec le `set not null`.
--   3. Le sens `valeur → NULL` est bloqué (`is distinct from` est vrai contre
--      NULL) — c'est voulu.
--
-- Il protège donc contre un `update` oublié dans une future Server Action, et
-- rien de plus. Ne pas le vendre pour plus.
--
-- `security invoker` est le BON choix, pas un défaut : le corps ne lit ni
-- n'écrit aucun objet, donc `security definer` n'ajouterait qu'une surface
-- d'escalade et un `search_path` à défendre, pour zéro bénéfice. Corollaire :
-- ce corps ne doit JAMAIS référencer d'objet — `check_function_bodies` ne
-- résout pas les noms d'un corps PL/pgSQL à la création, donc une lecture
-- ajoutée ici échouerait à l'exécution, pas au déploiement.
--
-- `set search_path = ''` : sans lui, les advisors Supabase lèvent
-- `function_search_path_mutable`.
create or replace function public.d3_fige_attribution_paiement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'ADR-038 D3 : paid_from_account_type est fige au paiement (% -> % refuse). Corriger passe par une contre-passation, pas par un UPDATE.',
    old.paid_from_account_type, new.paid_from_account_type;
end $$;

comment on function public.d3_fige_attribution_paiement() is
  'ADR-038 D3 — refuse toute re-attribution par UPDATE d''un paiement deja attribue. Ne s''applique pas aux lignes encore NULL (fenetre expand + migration contract).';

-- Une fonction neuve naît avec `proacl IS NULL`, c'est-à-dire les privilèges par
-- défaut de la plateforme — soit EXECUTE pour anon, authenticated et
-- service_role. L'impact réel est nul (un appel direct rend `0A000 trigger
-- functions can only be called as triggers`, et PostgREST n'expose pas les
-- fonctions retournant `trigger`), mais un privilège qu'on n'utilise pas est un
-- privilège qu'on ferme. Même geste que 20260729000002:158-159.
--
-- Sans risque pour le trigger : PostgreSQL vérifie EXECUTE au `create trigger`,
-- jamais au déclenchement.
revoke execute on function public.d3_fige_attribution_paiement()
  from public, anon, authenticated, service_role;

drop trigger if exists charge_payments_fige_attribution on public.charge_payments;
create trigger charge_payments_fige_attribution
  before update on public.charge_payments
  for each row
  when (
    old.paid_from_account_type is not null
    and new.paid_from_account_type is distinct from old.paid_from_account_type
  )
  execute function public.d3_fige_attribution_paiement();

drop trigger if exists commitment_payments_fige_attribution on public.commitment_payments;
create trigger commitment_payments_fige_attribution
  before update on public.commitment_payments
  for each row
  when (
    old.paid_from_account_type is not null
    and new.paid_from_account_type is distinct from old.paid_from_account_type
  )
  execute function public.d3_fige_attribution_paiement();

-- -------------------------------------------------------------------------
-- 9. Documentation
-- -------------------------------------------------------------------------
comment on column public.commitments.paid_from is
  'Compte qui regle les echeances de cet engagement. Memes valeurs que charges.paid_from. Les lignes anterieures au 2026-08-10 valent ''principal'' par defaut de colonne — hypothese assumee, non mesuree ligne a ligne. Aucun ecran ne l''expose encore : issue #362.';

comment on column public.charge_payments.paid_from_account_type is
  'ADR-038 D3 — compte qui a paye, AU MOMENT ou il a paye. Vocabulaire de accounts.account_type (income_bills / provisions / daily_card), jamais celui de charges.paid_from. NULLABLE pendant la fenetre expand uniquement ; la migration contract pose le NOT NULL. Rien ne le lit avant D6 (J4).';

comment on column public.commitment_payments.paid_from_account_type is
  'ADR-038 D3 — compte qui a paye, AU MOMENT ou il a paye. Vocabulaire de accounts.account_type. NULLABLE pendant la fenetre expand uniquement ; la migration contract pose le NOT NULL. Rien ne le lit avant D6 (J4).';
