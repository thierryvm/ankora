'use server';

import { z } from 'zod';

import { commitmentRowToDomain } from '@/lib/data/commitment-row';
import { getCommitmentsWithLedger } from '@/lib/data/commitments';
import {
  getSnapshotWith,
  readMonthActivity,
  toCockpitCharges,
} from '@/lib/data/workspace-snapshot';
import { moisDeLaFenetre, sixMois, type MonthActivity } from '@/lib/domain/cockpit/six-mois';
import { paymentKey } from '@/lib/domain/cockpit/types';
import { money } from '@/lib/domain/types';
import { DataReadUnavailableError } from '@/lib/data/read-failure';
import type { ActionResult } from '@/lib/actions/types';
import type { SixMoisMois } from '@/lib/actions/six-mois.types';

/**
 * « Six mois » — read when the fold OPENS, never when the cockpit renders.
 *
 * The fold is closed by default, so most visits never pay the five extra
 * month reads (@thierry, 26 Sept. 2026). Same pattern as
 * `getExpenseEntryContextAction`: read-only, the SESSION client (RLS applies),
 * the workspace resolved from the session by the snapshot — never taken from
 * the caller. The only input is the viewed month, parsed before anything else.
 *
 * No rate limit, for the reason `getExpenseEntryContextAction` gives: a read
 * of the caller's own workspace behind the same session as the page.
 *
 * A failed read is NOT turned into zeros: `readMonthActivity` throws, and the
 * caller gets `ok: false` — the fold says the months could not be read. No
 * amount and no description is ever logged here.
 */
const periodSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function getSixMoisAction(
  input: unknown,
): Promise<ActionResult<{ mois: SixMoisMois[] }>> {
  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errorCode: 'invalid_input' };
  const fin = parsed.data;

  try {
    const [snapshot, { commitments, paidKeysByCommitment }] = await getSnapshotWith(
      null,
      getCommitmentsWithLedger,
    );
    const courant = snapshot.currentPeriod;
    const fenetre = moisDeLaFenetre(fin);
    const cle = (p: { year: number; month: number }) => `${p.year}-${p.month}`;
    // The current month is already in the snapshot: only the five others are read.
    const lues = await Promise.all(
      fenetre.map(async (ref): Promise<[string, MonthActivity]> => {
        if (ref.year === courant.year && ref.month === courant.month) {
          return [
            cle(ref),
            { payments: snapshot.currentMonthPayments, expenses: snapshot.monthlyExpenses },
          ];
        }
        return [cle(ref), await readMonthActivity(snapshot.workspaceId, ref)];
      }),
    );
    const activites = new Map(lues);
    const payeLe = new Map(
      lues.flatMap(([, a]) =>
        a.payments.map((p) => [paymentKey(p.chargeId, p.periodYear, p.periodMonth), p] as const),
      ),
    );

    const serie = sixMois({
      fin,
      moisCourant: courant,
      charges: snapshot.charges,
      cockpitCharges: toCockpitCharges(snapshot.charges),
      commitments: commitments.map((c) => ({ ...commitmentRowToDomain(c), label: c.label })),
      paidKeysByCommitment: new Map(
        Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
      ),
      monthlyIncome: money(snapshot.monthlyIncome ?? 0),
      vieCouranteMonthlyTransfer: money(snapshot.vieCouranteMonthlyTransfer ?? 0),
      activite: (ref) => activites.get(cle(ref)) ?? { payments: [], expenses: [] },
    });

    const mois: SixMoisMois[] = serie.map((m) => ({
      year: m.ref.year,
      month: m.ref.month,
      statut: m.statut,
      factures: {
        total: m.factures.total.toNumber(),
        paiementsNonEnregistres: m.factures.paiementsNonEnregistres,
        lignes: m.factures.lignes.map((o) => {
          const paiement =
            o.source === 'charge'
              ? payeLe.get(paymentKey(o.id, m.ref.year, m.ref.month))
              : undefined;
          return {
            id: o.id,
            label: o.label,
            montant: o.amountDue.toNumber(),
            jour: o.paymentDay,
            payee: o.isPaid,
            payeeLe:
              paiement && 'paidAt' in paiement && typeof paiement.paidAt === 'string'
                ? paiement.paidAt
                : null,
            echeance:
              o.installmentIndex !== null && o.installmentsTotal !== null
                ? { index: o.installmentIndex, total: o.installmentsTotal }
                : null,
          };
        }),
      },
      depenses: m.depenses
        ? {
            total: m.depenses.total.toNumber(),
            lignes: [...m.depenses.lignes]
              .sort(
                (a, b) =>
                  a.occurredOn.localeCompare(b.occurredOn) || a.label.localeCompare(b.label),
              )
              .map((e) => ({
                id: e.id,
                label: e.label,
                montant: e.amount.toNumber(),
                date: e.occurredOn,
              })),
          }
        : null,
      provisions: {
        net: m.provisions.net.toNumber(),
        cible: m.provisions.cible.toNumber(),
        facturesDues: m.provisions.facturesDues.toNumber(),
      },
      total: m.total.toNumber(),
      auMoins: m.auMoins,
      ecartMoisPrecedent: m.ecartMoisPrecedent?.toNumber() ?? null,
    }));
    return { ok: true, data: { mois } };
  } catch (error) {
    // Only a failed READ becomes a message; anything else (a redirect to the
    // login page, a bug) keeps propagating as it would from any action.
    if (error instanceof DataReadUnavailableError) return { ok: false, errorCode: 'read_failed' };
    throw error;
  }
}
