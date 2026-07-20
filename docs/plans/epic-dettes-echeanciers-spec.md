# Épic « Dettes & échéanciers » — spec à valider

> @cc-ankora (Fable 5) 2026-07-19 · Épic issue des retours @thierry sur son tableau Coda.
> **Statut : SPEC — à valider par @thierry AVANT tout code.** Nouveau modèle de données → aucune ligne de code écrite avant ton GO sur les 4 décisions ci-dessous.

## 1. Le problème (verbatim @thierry, 2026-07-19)

> « mon tableau sur Coda montre bien ce qui est validé etc, mais pas les factures futures, les dettes liées à des crédits, ou un remboursement différé des impôts suite à un arrangement avec le SPF »

Ankora sait modéliser **une seule chose** : une charge récurrente **infinie** (loyer, Netflix, assurance). Trois besoins réels n'entrent pas dans ce moule :

| Besoin                        | Exemple @thierry                          | Pourquoi ça ne rentre pas                                                                                    |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Dette à solde**             | Crédit voiture 250 €/mois                 | Il a un **capital restant dû** qui descend. Ankora ne sait pas dire « il reste 4 200 € sur 12 mensualités ». |
| **Échéancier fini**           | Arrangement SPF : 8 mensualités puis stop | Une charge récurrente ne s'arrête **jamais** toute seule → elle polluerait le budget pour toujours.          |
| **Facture ponctuelle future** | Facture d'entretien attendue en octobre   | Ni récurrente, ni une dépense passée (`expenses`). Aucune place aujourd'hui.                                 |

**Conséquence actuelle** : ces trois cas sont saisis comme des charges mensuelles classiques → l'effort lissé est faux (une dette qui se termine dans 8 mois est comptée à l'infini), et il n'y a aucune visibilité sur « où j'en suis » d'un remboursement.

## 2. Ce que ça n'est PAS (garde-fous)

- ❌ **Pas de conseil** : Ankora affiche « il reste 4 200 € sur 12 mois », **jamais** « tu devrais rembourser plus vite » (FSMA).
- ❌ **Pas d'amortissement bancaire** (taux, intérêts, TAEG) : on suit un **plan de remboursement**, pas un produit de crédit. Si le capital et les intérêts t'intéressent, ils sont dans TON tableau — Ankora suit ce que tu paies.
- ❌ **Pas de synchronisation bancaire** (PSD2 exclu, contrainte projet).
- ❌ Pas de refonte des charges existantes : le modèle actuel reste tel quel pour le récurrent infini.

## 3. Modèle proposé — UNE table, trois usages

Plutôt que trois concepts séparés, un seul objet couvre les trois besoins : un **engagement à échéances finies** (`commitments`).

```sql
create table public.commitments (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references public.users(id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 120),
  kind          text not null check (kind in ('debt','installment_plan','one_off')),
  -- Montant total engagé (dette : capital ; échéancier : total dû ; ponctuel : le montant)
  total_amount  numeric(12,2) not null check (total_amount >= 0),
  -- Montant d'une échéance (null pour 'one_off' → = total_amount)
  installment_amount numeric(12,2) check (installment_amount is null or installment_amount >= 0),
  -- Nombre total d'échéances (1 pour 'one_off')
  installments_total smallint not null check (installments_total between 1 and 600),
  -- Première échéance (ancre) : YYYY-MM + jour
  start_year    smallint not null check (start_year between 2000 and 2100),
  start_month   smallint not null check (start_month between 1 and 12),
  payment_day   smallint not null default 1 check (payment_day between 1 and 31),
  -- Cadence des échéances (mensuel dans 99% des cas, mais SPF peut être trimestriel)
  frequency     text not null default 'monthly'
                check (frequency in ('monthly','quarterly','semiannual','annual')),
  category_id   uuid references public.categories(id) on delete set null,
  notes         text check (char_length(notes) <= 500),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

Les paiements réutilisent **le mécanisme existant** (`charge_payments`) via une table jumelle `commitment_payments` (même forme : `unique (commitment_id, period_year, period_month)`, mêmes policies RLS `is_workspace_member` / `is_workspace_editor`). **Zéro nouveau concept de paiement** : cocher une échéance = exactement le geste que tu connais déjà.

### Ce que le domaine calcule (fonctions pures, testées)

- `remainingBalance(commitment, payments)` → **capital restant dû** (`total_amount − Σ payés`).
- `installmentsPaid / installmentsTotal` → « 4/12 échéances ».
- `endPeriod(commitment)` → mois de la **dernière** échéance (dérivé, jamais stocké → toujours juste).
- `isFinished(commitment, payments)` → l'engagement disparaît naturellement du budget après la dernière échéance.
- `dueInPeriod(commitment, period)` → intégration dans le cockpit existant (« Ce mois-ci », alerte oubli, reste-à-payer).

### Les trois usages avec le même objet

|                    | `debt` (crédit voiture)                                   | `installment_plan` (SPF)       | `one_off` (facture future) |
| ------------------ | --------------------------------------------------------- | ------------------------------ | -------------------------- |
| total_amount       | 4 200 € (capital restant)                                 | 1 600 €                        | 340 €                      |
| installment_amount | 250 €                                                     | 200 €                          | — (= total)                |
| installments_total | 17                                                        | 8                              | 1                          |
| Affichage          | « reste 4 200 € · 17 mensualités » + barre de progression | « 3/8 payées · reste 1 000 € » | « 340 € le 12 oct. »       |

## 4. Où ça apparaît dans l'app

1. **Nouvelle page `/app/engagements`** (nom à trancher — cf. décision D1) : liste des engagements avec **barre de progression** et solde restant, mêmes coches Payé + navigation par mois que les charges.
2. **Page charges** : inchangée (le récurrent infini reste chez lui). Un lien croisé « Voir mes engagements ».
3. **Dashboard** : les échéances du mois rejoignent « Ce mois-ci » (même liste, même reste-à-payer) + une **carte « Mes engagements »** compacte : total restant dû, prochaine échéance, engagements qui se terminent bientôt.
4. **Effort lissé** : une échéance finie n'est plus comptée à l'infini → le chiffre devient **juste**. ⚠️ Ton « Effort lissé » va probablement **baisser** après migration de tes crédits — c'est la correction d'un biais actuel, pas une régression.

## 5. Découpage en 3 PRs (chacune mergeable seule)

- **PR-1 — Fondations** : migration `commitments` + `commitment_payments` (RLS calquée), schémas Zod, domaine pur (`remainingBalance`, `endPeriod`, `isFinished`, `dueInPeriod`) + tests. **Aucune UI** → risque nul, invisible en prod.
- **PR-2 — Page engagements** : CRUD complet (créer/éditer/supprimer), liste avec progression + solde, coches Payé, navigation par mois (réutilise tout le pattern charges).
- **PR-3 — Intégration cockpit** : dashboard (échéances dans « Ce mois-ci », carte « Mes engagements »), effort lissé corrigé, alerte oubli étendue.

## 6. Décisions VERROUILLÉES (@thierry, 2026-07-19)

**D1 — Nom visible : « Engagements ».** Menu : Charges · Engagements · Dépenses. Couvre les 3 cas sans jargon ni connotation.

**D2 — La facture ponctuelle future (`one_off`) : INCLUSE** dans l'épic (1 échéance, quasi gratuit dans le modèle).

**D3 — Saisie : solde restant + échéances restantes.** Tu tapes « il reste 4 200 € sur 17 mensualités de 250 € » — les chiffres de ton extrait. `total_amount` = capital restant à la création ; `start_year/month` = la **prochaine** échéance.

**D4 — Migration : bouton « convertir en engagement »** sur la ligne de charge (PR-2). Pré-remplit label/montant/jour depuis la charge, tu complètes le solde restant ; la charge d'origine est désactivée après conversion (jamais supprimée sans confirmation).

## 7. Ce qui reste hors épic (tracé, pas oublié)

Intérêts/TAEG · échéances irrégulières (montants différents par échéance — le SPF classique est régulier) · rappels/notifications d'échéance · export du plan de remboursement.
