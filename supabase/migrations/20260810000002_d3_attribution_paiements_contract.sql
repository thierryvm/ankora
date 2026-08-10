-- =========================================================================
-- J1b / ADR-038 D3 — l'attribution de compte devient obligatoire  (CONTRACT 2/2)
-- =========================================================================
-- Seconde moitié du motif expand / contract ouvert par
-- 20260810000001_d3_attribution_paiements_expand.sql. Lire son en-tête d'abord :
-- il explique pourquoi ce fichier n'existait délibérément dans aucun arbre
-- jusqu'ici.
--
-- CONDITION D'ENTRÉE — c'est une MESURE, pas un délai.
--
--   Le code qui remplit la colonne doit être DÉPLOYÉ et VÉRIFIÉ avant que cette
--   migration parte. La preuve attendue est un pointage récent, postérieur au
--   déploiement, dont la ligne porte une valeur :
--
--     select count(*) filter (where paid_from_account_type is null) as a_reprendre,
--            count(*)                                               as total,
--            max(paid_at)                                           as dernier_pointage
--       from public.charge_payments;
--
--   Tant qu'un pointage postérieur au déploiement laisse NULL, cette migration
--   ne doit PAS partir : le `set not null` de l'étape 3 rendrait 23502 au
--   premier pointage suivant, en production.
--
-- RETOUR ARRIÈRE — `alter table ... alter column ... drop not null`.
-- JAMAIS `drop column` : la colonne porte des données que plus rien ne saurait
-- reconstruire une fois la fenêtre refermée.
--
-- Ce que cette migration NE fait pas, volontairement :
--   · elle ne touche NI aux clés étrangères, NI aux triggers, NI aux policies
--     posés par l'expand — ils sont déjà dans l'état voulu ;
--   · elle ne corrige PAS la sémantique des valeurs. Cf. étape 4 et ADR-041.
-- =========================================================================

-- Pas de `begin;` / `commit;` — le contrôle transactionnel appartient à la CLI
-- Supabase. Même raison que dans l'expand.

-- -------------------------------------------------------------------------
-- 1. Reprise des lignes écrites pendant la fenêtre
-- -------------------------------------------------------------------------
-- Entre l'application de l'expand et le déploiement du code, l'ancien code a pu
-- insérer des paiements sans la colonne. Ces lignes-là sont NULL et le
-- resteraient : rien ne les rattrape ailleurs.
--
-- Instructions identiques à celles de l'expand (§6) — même bijection, mêmes
-- jointures contrôlant l'égalité des workspace_id. Répétées mot pour mot plutôt
-- que factorisées dans une fonction : une migration doit se lire seule, des mois
-- plus tard, sans dépendre d'un objet qu'une autre migration pourrait avoir
-- redéfini entre-temps.
--
-- Le CASE reste EXHAUSTIF SANS `else` : `charges.paid_from` et
-- `commitments.paid_from` sont tous deux contraints à ('principal','epargne')
-- — 20260417000004:73-74 et 20260810000001:177-178. Une valeur inattendue
-- produirait NULL, et l'étape 2 refuserait la migration au lieu de la laisser
-- écrire un compte faux.
--
-- LE TRIGGER DE GEL NE SE DÉCLENCHE PAS ICI, et ce n'est pas un hasard : son
-- garde est `old.paid_from_account_type is not null` (20260810000001:367-370),
-- or le `where ... is null` ci-dessous garantit que `old` EST nul. C'est
-- exactement le trou laissé ouvert pour cette migration.
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
-- 2. Garde-fou — refuser plutôt que laisser `set not null` s'expliquer mal
-- -------------------------------------------------------------------------
-- `alter column set not null` échoue seul si une valeur manque, avec
-- « column "paid_from_account_type" of relation "charge_payments" contains null
-- values ». C'est vrai et parfaitement inutile : ça ne dit ni combien, ni quoi
-- faire.
--
-- Ce bloc dit les deux. Il attrape le seul scénario qui reste après l'étape 1 :
-- une ligne dont le parent est introuvable par la jointure — workspace_id
-- incohérent entre parent et enfant (le garde-fou A de l'expand traitait
-- exactement ce cas), ou `paid_from` hors des deux valeurs attendues.
--
-- Le message porte le NOMBRE, jamais les identifiants : la sortie de `db push`
-- finit régulièrement collée dans un rapport de PR, et ce dépôt est public.
do $$
declare
  factures     bigint;
  echeances    bigint;
begin
  select count(*) into factures
    from public.charge_payments
   where paid_from_account_type is null;

  select count(*) into echeances
    from public.commitment_payments
   where paid_from_account_type is null;

  if factures > 0 or echeances > 0 then
    raise exception
      'J1b : % paiement(s) de facture et % d''echeance sans compte attribue. Le NOT NULL est refuse. Causes possibles, dans cet ordre : (a) le code qui remplit la colonne n''est pas deploye — verifier la condition d''entree en tete de fichier ; (b) workspace_id incoherent entre un paiement et son parent ; (c) paid_from hors de (principal, epargne). Ne PAS contourner en mettant une valeur par defaut : une attribution inventee produit deux soldes faux en sens inverse des D6 (J4).',
      factures, echeances;
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 3. Le NOT NULL
-- -------------------------------------------------------------------------
-- Prend un ACCESS EXCLUSIVE et scanne la table entière. Sans objet à l'échelle
-- actuelle (quelques dizaines de lignes) ; à re-peser le jour où ces tables se
-- comptent en millions, où le motif serait plutôt un CHECK NOT VALID suivi d'un
-- VALIDATE.
--
-- Effet de bord voulu, et c'est le vrai gain de cette migration : les clés
-- étrangères composites posées par l'expand sont en MATCH SIMPLE, donc une ligne
-- dont une colonne est NULL n'était PAS vérifiée du tout. Plus aucune ligne
-- n'est nulle, donc toutes sont désormais vérifiées. La FK cesse d'être une
-- promesse pour devenir une contrainte.
--
-- Second effet, sur le trigger de gel : sa limite nº 2 (20260810000001:315-320)
-- se referme ici. La transition `NULL → valeur`, qui restait ouverte pendant
-- toute la fenêtre, n'a plus de ligne sur laquelle s'appliquer.
alter table public.charge_payments
  alter column paid_from_account_type set not null;

alter table public.commitment_payments
  alter column paid_from_account_type set not null;

-- -------------------------------------------------------------------------
-- 4. Documentation — dont ce que ces valeurs ne prouvent PAS
-- -------------------------------------------------------------------------
-- Les commentaires posés par l'expand annonçaient « NULLABLE pendant la fenetre
-- expand uniquement ». C'est fait, ils sont donc faux à partir de maintenant.
--
-- Et ils affirmaient « compte qui a paye ». ADR-041 (accepte le 2026-08-10)
-- etablit que ce n'est PAS vrai pour toute ligne remplie par backfill : la
-- valeur y vient de `paid_from`, qui designe le compte de PROVISIONNEMENT. Pour
-- une enveloppe qui ne regle pas elle-meme — cas general en Europe : epargne
-- reglementee belge, Livret A, Tagesgeld, Revolut Savings — le compte payeur est
-- un autre. J2 re-attribue ces lignes. Ecrit ici pour que personne ne lise
-- « compte qui a paye » et le croie avant J2.
comment on column public.charge_payments.paid_from_account_type is
  'ADR-038 D3 — compte attribue au paiement, fige a l''ecriture. Vocabulaire de accounts.account_type (income_bills / provisions / daily_card). NOT NULL depuis J1b (2026-08-10). ATTENTION : pour les lignes issues du backfill, la valeur vient de charges.paid_from, qui designe le compte de PROVISIONNEMENT et non le compte payeur — ADR-041. J2 re-attribue. Rien ne le lit avant D6 (J4).';

comment on column public.commitment_payments.paid_from_account_type is
  'ADR-038 D3 — compte attribue au paiement, fige a l''ecriture. Vocabulaire de accounts.account_type. NOT NULL depuis J1b (2026-08-10). ATTENTION : pour les lignes issues du backfill, la valeur vient de commitments.paid_from, qui designe le compte de PROVISIONNEMENT et non le compte payeur — ADR-041. J2 re-attribue. Rien ne le lit avant D6 (J4).';
