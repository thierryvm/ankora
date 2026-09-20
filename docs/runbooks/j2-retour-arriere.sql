-- =========================================================================
-- J2 — retour arrière de 20260920000001_j2_journal_des_mouvements_expand.sql
-- =========================================================================
-- À JOUER À LA MAIN, jamais par la CLI Supabase : ce fichier ne vit pas dans
-- `supabase/migrations/`, précisément pour que `db push` ne l'applique jamais.
--
-- QUAND s'en servir : la migration a été appliquée, et on veut revenir à
-- l'état d'avant. Tant qu'aucun écran n'écrit dans ces tables (c'est le cas au
-- 2026-09-20), le retour arrière ne perd RIEN : les seules lignes présentes
-- sont les relevés semés depuis `accounts.balance`, qui est intact.
--
-- ⚠️ CE QUE CE FICHIER DÉTRUIT, et il faut le lire avant de le lancer : à
-- partir du moment où une personne a saisi une opération, `drop table` emporte
-- son journal. Le `raise exception` ci-dessous refuse donc de s'exécuter si
-- une ligne écrite par un humain existe. Pour passer outre — décision, pas
-- réflexe — commenter le bloc 0 ET avoir une sauvegarde fraîche.
--
-- CE QU'IL NE TOUCHE PAS : `accounts` (ni `balance`, ni `account_type`), et
-- aucune autre table. La migration n'a modifié aucune colonne existante ;
-- défaire ses ajouts suffit à revenir à l'état d'avant.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. Refus si des données humaines existent
-- -------------------------------------------------------------------------
-- Les relevés semés par la migration portent `derived_balance = balance` et
-- `stated_on` = le jour de l'application. Tout le reste vient de quelqu'un.
do $$
declare
  humaines integer;
begin
  select (select count(*) from public.movements)
       + (select count(*) from public.account_balance_statements
           where derived_balance is distinct from balance)
    into humaines;

  if humaines > 0 then
    raise exception
      'J2 retour arriere : % ligne(s) saisie(s) seraient DETRUITES. Sauvegarder d''abord, puis commenter ce bloc en connaissance de cause.',
      humaines;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. Triggers, puis fonctions
-- -------------------------------------------------------------------------
drop trigger if exists movements_protege                  on public.movements;
drop trigger if exists movements_impose_ecriture          on public.movements;
drop trigger if exists movements_touch                    on public.movements;
drop trigger if exists account_balance_statements_protege         on public.account_balance_statements;
drop trigger if exists account_balance_statements_impose_ecriture on public.account_balance_statements;
drop trigger if exists account_balance_statements_touch           on public.account_balance_statements;

drop function if exists public.j2_protege_operation();
drop function if exists public.j2_impose_ecriture();

-- -------------------------------------------------------------------------
-- 2. Les deux tables
-- -------------------------------------------------------------------------
-- `drop table` emporte ses propres policies, index et contraintes, y compris
-- les clés étrangères composites vers `accounts` — c'est ce qui rend à
-- `accounts.account_type` sa mutabilité et à `accounts` sa suppressibilité.
drop table if exists public.movements;
drop table if exists public.account_balance_statements;

-- -------------------------------------------------------------------------
-- 3. La ligne de l'historique des migrations
-- -------------------------------------------------------------------------
-- Sans elle, `supabase db push` considère la migration comme appliquée et ne
-- la rejouerait jamais.
delete from supabase_migrations.schema_migrations where version = '20260920000001';

-- -------------------------------------------------------------------------
-- 4. Vérifier que le retour arrière a eu lieu (0 attendu)
-- -------------------------------------------------------------------------
select count(*) as tables_restantes
  from pg_class
 where relname in ('movements', 'account_balance_statements');
