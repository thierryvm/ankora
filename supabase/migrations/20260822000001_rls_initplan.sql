-- =========================================================================
-- RLS : évaluer `auth.uid()` une fois par requête, et non une fois par ligne
--
-- CE QUE FAIT CE FICHIER, ET RIEN D'AUTRE. Les vingt policies ci-dessous
-- comparent l'utilisateur courant à une colonne. Écrit `auth.uid()` nu,
-- PostgreSQL traite l'appel comme une expression à évaluer POUR CHAQUE LIGNE
-- examinée. Enveloppé en `(select auth.uid())`, il devient un InitPlan :
-- évalué une seule fois, puis comparé.
--
-- C'est une transformation de PLAN, pas de RÉSULTAT. `auth.uid()` est déclarée
-- STABLE, ne prend aucun argument et ne lit aucune colonne de la ligne courante
-- — sa valeur ne peut pas varier d'une ligne à l'autre dans une même requête.
-- Les lignes visibles avant et après sont donc exactement les mêmes.
--
-- AUCUN GAIN N'EST ANNONCÉ ICI, et c'est délibéré. La base porte cinq comptes :
-- rien de mesurable ne changera aujourd'hui. La valeur de ce fichier est que le
-- motif soit correct AVANT que le volume arrive, pas qu'il accélère quoi que ce
-- soit maintenant. Une affirmation de performance sans mesure n'a pas sa place
-- dans ce dépôt.
--
-- POURQUOI `alter policy` PLUTÔT QUE `drop` + `create`. La documentation
-- PostgreSQL est explicite : `ALTER POLICY` ne peut modifier QUE la liste de
-- rôles et les expressions `USING` / `WITH CHECK`. Changer la commande visée
-- (`FOR ALL` → `FOR UPDATE`) ou basculer permissive/restrictive **exige** un
-- drop-recreate. Autrement dit, ce fichier ne PEUT PAS altérer la matrice des
-- permissions — ce n'est pas une promesse de rigueur, c'est une impossibilité
-- structurelle. C'est le premier `alter policy` du dépôt ; les neuf migrations
-- qui définissent des policies n'ont simplement jamais eu à en modifier une.
--
-- ET SURTOUT : chaque `alter policy` ci-dessous ne fournit QUE la ou les
-- clauses qui contenaient `auth.uid()`. Une clause omise est laissée
-- **inchangée** par PostgreSQL. Cela vaut garantie sur le point le plus
-- dangereux du fichier : les six policies `*_editor_write` portent
-- `using (is_workspace_editor(...))`, et `is_workspace_member` existe juste à
-- côté avec un nom très proche et des droits plus larges. Retaper ce `USING`
-- pour ne rien y changer aurait ouvert la porte à une confusion qui aurait
-- donné le droit d'ÉCRIRE aux membres en lecture seule — et qu'aucune de nos
-- portes ne détecte. On ne le retape donc pas. Zéro caractère saisi, zéro
-- risque. Aucune clause `TO` non plus, pour la même raison.
--
-- RETOUR ARRIÈRE : rejouer les mêmes `alter policy` en retirant `select` de
-- chaque `(select auth.uid())`. Les expressions d'origine sont reproduites en
-- commentaire au-dessus de chaque bloc, relevées dans `pg_policies` AVANT
-- modification — jamais ressaisies de mémoire.
--
-- POUR LA SUITE : la correction des policies permissives multiples
-- (`<table>_editor_write` couvre aussi SELECT, en plus de
-- `<table>_member_select`) **exigera un drop-recreate** de ces six policies,
-- puisqu'elle change la commande visée. Quiconque les recrée doit y écrire
-- `(select auth.uid())`, sans quoi le contenu de ce fichier disparaît en
-- silence.
--
-- Pas de `begin;` / `commit;` : le contrôle transactionnel appartient à la CLI.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Les six `*_editor_write` — WITH CHECK seul, USING jamais touché
-- -------------------------------------------------------------------------
-- Forme d'origine, identique sur les six :
--   using       : is_workspace_editor(workspace_id)            <- NON MODIFIÉ
--   with check  : (is_workspace_editor(workspace_id) AND (created_by = auth.uid()))

alter policy categories_editor_write on public.categories
  with check (public.is_workspace_editor(workspace_id) and created_by = (select auth.uid()));

alter policy charge_payments_editor_write on public.charge_payments
  with check (public.is_workspace_editor(workspace_id) and created_by = (select auth.uid()));

alter policy charges_editor_write on public.charges
  with check (public.is_workspace_editor(workspace_id) and created_by = (select auth.uid()));

alter policy commitment_payments_editor_write on public.commitment_payments
  with check (public.is_workspace_editor(workspace_id) and created_by = (select auth.uid()));

alter policy commitments_editor_write on public.commitments
  with check (public.is_workspace_editor(workspace_id) and created_by = (select auth.uid()));

alter policy expenses_editor_write on public.expenses
  with check (public.is_workspace_editor(workspace_id) and created_by = (select auth.uid()));

-- -------------------------------------------------------------------------
-- 2. Comparaisons directes « c'est bien moi »
-- -------------------------------------------------------------------------

-- users : (auth.uid() = id)
alter policy users_self_select on public.users
  using ((select auth.uid()) = id);

alter policy users_self_insert on public.users
  with check ((select auth.uid()) = id);

alter policy users_self_update on public.users
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- workspaces : (auth.uid() = owner_id)
alter policy workspaces_owner_insert on public.workspaces
  with check ((select auth.uid()) = owner_id);

alter policy workspaces_owner_update on public.workspaces
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

alter policy workspaces_owner_delete on public.workspaces
  using ((select auth.uid()) = owner_id);

-- workspace_members : (auth.uid() = user_id)
alter policy members_self_select on public.workspace_members
  using ((select auth.uid()) = user_id);

-- user_consents : (auth.uid() = user_id)
alter policy consents_self_select on public.user_consents
  using ((select auth.uid()) = user_id);

alter policy consents_self_upsert on public.user_consents
  with check ((select auth.uid()) = user_id);

alter policy consents_self_update on public.user_consents
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -------------------------------------------------------------------------
-- 3. deletion_requests — les conditions sur `status` sont REPRODUITES
-- -------------------------------------------------------------------------
-- Ici `auth.uid()` partage sa clause avec une condition d'état, donc la clause
-- entière est ressaisie. Elle est recopiée depuis `pg_policies`, pas de
-- mémoire. Ce que ces deux policies garantissent, et qui doit survivre intact :
-- on ne peut annuler QUE sa propre demande, QUE si elle est encore
-- `pending`/`failed`, et QUE vers l'état `cancelled` — jamais vers un autre.

alter policy deletion_self_select on public.deletion_requests
  using ((select auth.uid()) = user_id);

alter policy deletion_self_update on public.deletion_requests
  using ((select auth.uid()) = user_id and status = any (array['pending'::text, 'failed'::text]))
  with check ((select auth.uid()) = user_id and status = 'cancelled'::text);

-- -------------------------------------------------------------------------
-- 4. Les deux sous-requêtes corrélées — l'enveloppement y reste neutre
-- -------------------------------------------------------------------------
-- `auth.uid()` vit ici dans un `exists` corrélé à la ligne courante par
-- `w.id = workspace_members.workspace_id`. L'enveloppement ne touche PAS cette
-- corrélation : `(select auth.uid())` ne référence aucune colonne, la
-- sous-requête reste non corrélée et devient un InitPlan.
--
-- À noter pour qui viendrait chercher un gain ici : le `exists` corrélé, lui,
-- reste ré-exécuté ligne à ligne. Ce fichier ne le change pas.

alter policy members_owner_insert on public.workspace_members
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = (select auth.uid())
  ));

alter policy members_owner_delete on public.workspace_members
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = (select auth.uid())
  ));
