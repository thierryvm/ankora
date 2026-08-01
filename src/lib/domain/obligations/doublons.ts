import { installmentAmountOf, isDueInPeriod } from '@/lib/domain/commitments';
import type { CockpitCharge, ReferencePeriod } from '@/lib/domain/cockpit/types';
import type { NamedCommitment } from './types';

/** Which signals matched. The UI names them; no total ever reads them. */
export type SignalDoublon = 'montant' | 'jour' | 'libelle';

export type DoublonProbable = Readonly<{
  chargeId: string;
  chargeLabel: string;
  commitmentId: string;
  commitmentLabel: string;
  /** The monthly amount both rows carry — shown, never subtracted. */
  montant: number;
  signaux: readonly SignalDoublon[];
}>;

export type DetecterDoublonsInput = Readonly<{
  charges: readonly CockpitCharge[];
  commitments: readonly NamedCommitment[];
  ref: ReferencePeriod;
}>;

/** Minimum token length worth treating as a label signal — drops « de », « la ». */
const SIGNIFICANT_TOKEN = 4;

/**
 * Lowercase, unaccented, punctuation-free. `NFD` + combining-mark strip is the
 * portable way to fold « Impôt » onto « impot » without a locale table. The
 * mark class is written as a Unicode property rather than a literal codepoint
 * range so the rule survives any re-encoding of this file.
 */
function normalise(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function labelsAreClose(a: string, b: string): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  if (na.length === 0 || nb.length === 0) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const tokensB = new Set(nb.split(' ').filter((t) => t.length >= SIGNIFICANT_TOKEN));
  return na.split(' ').some((t) => t.length >= SIGNIFICANT_TOKEN && tokensB.has(t));
}

/**
 * Flag charge / commitment pairs that look like the SAME obligation entered
 * twice.
 *
 * ## The rule this function is not allowed to be
 *
 * > **The heuristic warns. It never calculates.**
 *
 * « Same amount, same day, close labels » is a good alert and a terrible
 * subtraction rule. A heuristic that decides an amount produces silent errors —
 * precisely the disease this chantier treats. The amount is decided by the
 * STRUCTURE (which table holds the obligation), never by a resemblance. So the
 * return value is a list of warnings with no total in it, and no cockpit figure
 * takes this module as an input. `une-obligation-une-table.test.ts` locks that.
 *
 * ## Why the amount is required and the rest is not
 *
 * The amount is the discriminating signal: two obligations of exactly the same
 * monthly amount that both fall due this month are already suspicious. Day and
 * label are corroborating — one of them must also match, otherwise a household
 * with two 50 € subscriptions gets a permanent false alarm.
 *
 * Both sides must be due in `ref`: an annual charge anchored in March and a
 * monthly commitment are not the same obligation, and comparing them in July
 * would compare a 1/12th against a full instalment.
 */
export function detecterDoublonsProbables(
  input: DetecterDoublonsInput,
): readonly DoublonProbable[] {
  const { ref } = input;
  const dueCharges = input.charges.filter(
    (c) => c.isActive && c.paymentMonths.includes(ref.month),
  );
  const dueCommitments = input.commitments.filter((c) => isDueInPeriod(c, ref));

  const out: DoublonProbable[] = [];
  for (const charge of dueCharges) {
    for (const commitment of dueCommitments) {
      const installment = installmentAmountOf(commitment);
      if (!charge.amount.equals(installment)) continue;

      const signaux: SignalDoublon[] = ['montant'];
      if (charge.paymentDay === commitment.paymentDay) signaux.push('jour');
      if (labelsAreClose(charge.label, commitment.label)) signaux.push('libelle');
      if (signaux.length < 2) continue;

      out.push({
        chargeId: charge.id,
        chargeLabel: charge.label,
        commitmentId: commitment.id,
        commitmentLabel: commitment.label,
        montant: charge.amount.toNumber(),
        signaux,
      });
    }
  }
  return out;
}
