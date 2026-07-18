-- Epic « Factures cohérentes » / THI-329 — manual "à surveiller" marker.
--
-- @thierry flags the bills he wants to keep an eye on; the dashboard's
-- "À surveiller" section lists ONLY flagged bills (replacing the noisy
-- automatic "Mois prochain" bucket he rejected). Toggled from the charges
-- page via `toggleWatchAction` (workspace-authorized, audited).
--
-- Plain additive column: no backfill needed (default false), table-level
-- RLS policies on `charges` are unchanged and cover the new column.

alter table public.charges
  add column is_watched boolean not null default false;
