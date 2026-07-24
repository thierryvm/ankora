import { Minus, Plus } from 'lucide-react';

type Props = {
  /** Number of scheduled instalments ticked (schedule-filtered count). */
  paid: number;
  /** Total scheduled instalments. */
  total: number;
  /** Mark the earliest not-yet-paid scheduled instalment as paid. */
  onTickNext: () => void;
  /** Un-mark the latest paid scheduled instalment. */
  onUntickLast: () => void;
  /** True while a mutation is in flight — serializes ticks (one round-trip). */
  disabled?: boolean;
  /** Group label, e.g. "6 sur 11 échéances payées". */
  countAriaLabel: string;
  markOneAriaLabel: string;
  unmarkOneAriaLabel: string;
};

const BTN =
  'focus-visible:ring-brand-600 border-border hover:border-brand-600 flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 md:size-9';

/**
 * Payment stepper for a finite commitment — « X / N payées » with − / +.
 * Each + ticks the earliest unpaid scheduled instalment, each − un-ticks the
 * latest paid one (the parent computes the target period from the schedule and
 * calls the single-period toggle action). Buttons are disabled at the bounds
 * and while a mutation is pending, so ticks are serialized (no double-tick race).
 *
 * Presentational: no state, no data fetching — Server Component compatible,
 * but rendered inside the client `CommitmentsClient`.
 */
export function InstallmentStepper({
  paid,
  total,
  onTickNext,
  onUntickLast,
  disabled = false,
  countAriaLabel,
  markOneAriaLabel,
  unmarkOneAriaLabel,
}: Props) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={countAriaLabel}>
      <button
        type="button"
        onClick={onUntickLast}
        disabled={disabled || paid <= 0}
        aria-label={unmarkOneAriaLabel}
        data-testid="stepper-dec"
        className={BTN}
      >
        <Minus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
      <span
        aria-live="polite"
        data-testid="stepper-count"
        className="text-foreground min-w-14 text-center text-sm font-semibold tabular-nums"
      >
        {paid} / {total}
      </span>
      <button
        type="button"
        onClick={onTickNext}
        disabled={disabled || paid >= total}
        aria-label={markOneAriaLabel}
        data-testid="stepper-inc"
        className={BTN}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
