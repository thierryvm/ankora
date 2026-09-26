-- Tour 42 — ADR-046 : le mois concerné d'un argent reçu.
--
-- Un salaire reçu le 28 septembre paie les factures d'octobre. La ligne garde
-- DEUX lectures, jamais mélangées :
--   · `occurred_on` fait bouger le solde du compte qui reçoit, à sa date ;
--   · `budget_year` / `budget_month` disent le budget qu'elle nourrit.
--
-- ADDITIVE, et rien d'autre :
--   · deux colonnes nullables, aucune valeur par défaut, aucune ligne réécrite ;
--   · une ligne sans affectation vaut le mois de sa date (lecture applicative,
--     `src/lib/domain/accounts/mois-concerne.ts`) : les chiffres d'hier ne
--     bougent pas ;
--   · aucune policy ni aucun GRANT touchés : les colonnes héritent des policies
--     de `movements` (lecture membre, insertion éditeur, mise à jour auteur) ;
--   · le trigger `j2_protege_operation` n'est pas modifié : l'affectation se
--     corrige comme la date, elle n'identifie pas la ligne.

alter table public.movements
  add column if not exists budget_year  smallint,
  add column if not exists budget_month smallint;

-- Les deux ensemble ou aucun ; seulement sur un argent reçu ; un mois valide,
-- à un mois au plus du mois de la date (la même fenêtre que la validation
-- serveur : une écriture directe ne peut pas faire mieux que l'écran, et une
-- date corrigée ne peut pas laisser l'affectation dériver loin d'elle).
-- Le CASE garde l'ordre d'évaluation : `make_date` n'est appelé que sur un
-- mois déjà reconnu valide, sinon il lèverait au lieu de refuser.
-- NOT VALID puis VALIDATE : la table existante n'a que des NULL, la validation
-- ne réécrit rien et ne tient qu'un verrou léger.
alter table public.movements
  add constraint movements_mois_concerne
    check (
      (budget_year is null and budget_month is null)
      or (
        kind = 'income'
        and budget_year between 2000 and 2100
        and case
          when budget_year between 2000 and 2100 and budget_month between 1 and 12 then
            make_date(budget_year, budget_month, 1)
              between (date_trunc('month', occurred_on) - interval '1 month')::date
                  and (date_trunc('month', occurred_on) + interval '1 month')::date
          else false
        end
      )
    ) not valid;

alter table public.movements validate constraint movements_mois_concerne;

comment on column public.movements.budget_year is
  'ADR-046 : annee du budget que cet argent recu nourrit. NULL = le mois de occurred_on. Le solde du compte, lui, bouge toujours a occurred_on.';
comment on column public.movements.budget_month is
  'ADR-046 : mois (1-12) du budget que cet argent recu nourrit. NULL = le mois de occurred_on.';
