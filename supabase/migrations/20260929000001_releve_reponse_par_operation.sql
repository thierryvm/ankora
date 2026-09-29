-- ============================================================================
-- ADR-045 D23 — le jour d'un relevé, une réponse PAR OPÉRATION
-- ============================================================================
-- Migration ADDITIVE : une table neuve, rien d'autre. Le code d'avant ne la
-- lit pas et continue de fonctionner (règle de l'heure D16 seule).
--
-- Une ligne = « le solde relevé `statement_id` contenait déjà l'opération
-- `flow_id` ». `flow_id` est l'identifiant de flux que construit le domaine
-- (`<uuid>:in|out` pour le journal, `expense:<uuid>`, `charge_payment:<uuid>`,
-- `commitment_payment:<uuid>`) : du texte, donc c'est l'ACTION serveur qui
-- garantit qu'il désigne un flux du même compte, du même jour, écrit après le
-- relevé. La base garantit la forme, l'appartenance au workspace, et l'unicité.
--
-- Se défait d'un clic : DELETE (une réponse, pas une opération). Jamais d'UPDATE.
-- ============================================================================

create table if not exists public.statement_included_flows (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  statement_id  uuid not null references public.account_balance_statements(id) on delete cascade,
  flow_id       text not null,
  created_by    uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),

  constraint statement_included_flows_flow_id_forme check (
    flow_id ~ '^((expense|charge_payment|commitment_payment):[0-9a-f-]{36}|[0-9a-f-]{36}:(in|out))$'
  ),
  constraint statement_included_flows_unique unique (statement_id, flow_id)
);

comment on table public.statement_included_flows is
  'ADR-045 D23 — per operation: the read balance of statement_id already contained flow_id.';

create index if not exists statement_included_flows_workspace_idx
  on public.statement_included_flows (workspace_id);
create index if not exists statement_included_flows_created_by_idx
  on public.statement_included_flows (created_by);

alter table public.statement_included_flows enable row level security;
alter table public.statement_included_flows force  row level security;

create policy "statement_included_flows_member_select" on public.statement_included_flows
  for select using (public.is_workspace_member(workspace_id));

-- Le relevé visé doit appartenir au MÊME workspace que la ligne : sans cette
-- clause, un éditeur pourrait rattacher une réponse au relevé d'un autre.
create policy "statement_included_flows_editor_insert" on public.statement_included_flows
  for insert with check (
    public.is_workspace_editor(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.account_balance_statements s
      where s.id = statement_id
        and s.workspace_id = statement_included_flows.workspace_id
        and s.cancelled_at is null
    )
  );

create policy "statement_included_flows_editor_delete" on public.statement_included_flows
  for delete using (public.is_workspace_editor(workspace_id));

-- Aucun UPDATE : une réponse se retire et se redonne, elle ne se réécrit pas.
revoke all on public.statement_included_flows from anon;
revoke all on public.statement_included_flows from authenticated;
grant select, insert, delete on public.statement_included_flows to authenticated;
grant select, insert, update, delete on public.statement_included_flows to service_role;
