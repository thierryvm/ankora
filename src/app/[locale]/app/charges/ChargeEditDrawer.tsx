'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { updateChargeAction } from '@/lib/actions/charges';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { paymentMonthsFromFrequency } from '@/lib/domain/charges';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { CadenceField } from './CadenceField';

type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

// Still needed by `normalizeFrequency` (guards legacy/foreign values when
// seeding the form from a row) even though the Select UI moved to CadenceField.
const FREQUENCIES: readonly Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

export type ChargeEditDrawerCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  dueMonth: number;
  paymentDay: number;
};

type Props = {
  charge: ChargeEditDrawerCharge | null;
  onClose: () => void;
};

/**
 * "Modifier une charge" drawer — PR-BETA-CLEANUP-2 (THI-281).
 *
 * Edit affordance for `/app/charges` rows. Mirrors the create form
 * 1:1 (label, amount, frequency, dueMonth, paymentDay) so the user has
 * the same mental model whether they're adding or editing.
 *
 * Error handling follows the PR-BETA-3 fail-loud pattern:
 *   - `{ ok: true }` → toast success + close + router.refresh
 *   - `{ ok: false, errorCode }` → toast translated, drawer STAYS OPEN
 *   - JS throw → toast generic, drawer STAYS OPEN
 *   - NEXT_REDIRECT / NEXT_NOT_FOUND → re-thrown so Next.js can navigate
 *
 * Slide-from-right on desktop, full-screen on mobile (h-dvh + sm:max-w-md).
 */
export function ChargeEditDrawer({ charge, onClose }: Props) {
  const t = useTranslations('app.charges');
  const translateError = useActionErrorTranslator();
  const router = useRouter();

  const labelId = useId();
  const amountId = useId();
  const titleId = useId();

  // Seed the form state from the charge BEFORE first render via a `key`-like
  // technique: derive initial values from the charge.id so that opening a
  // new charge swaps the entire state in one synchronous batch (no
  // `setState`-in-effect cascading render). Tracks the last-seeded id to
  // detect when a different charge is opened and re-seed accordingly.
  const [seedId, setSeedId] = useState<string | null>(charge?.id ?? null);
  const [label, setLabel] = useState(charge?.label ?? '');
  const [amount, setAmount] = useState(charge?.amount.toString() ?? '');
  const [frequency, setFrequency] = useState<Frequency>(
    charge ? normalizeFrequency(charge.frequency) : 'monthly',
  );
  const [dueMonth, setDueMonth] = useState(charge ? String(charge.dueMonth) : '1');
  const [paymentDay, setPaymentDay] = useState(charge ? String(charge.paymentDay) : '1');
  const [isPending, startTransition] = useTransition();

  // When the parent swaps to a different charge while the component is
  // still mounted, re-seed all fields. Running this during render (rather
  // than in an effect) avoids the `react-hooks/set-state-in-effect`
  // anti-pattern: React 19 reconciles the cascading setState batch in the
  // same render pass.
  if (charge && charge.id !== seedId) {
    setSeedId(charge.id);
    setLabel(charge.label);
    setAmount(charge.amount.toString());
    setFrequency(normalizeFrequency(charge.frequency));
    setDueMonth(String(charge.dueMonth));
    setPaymentDay(String(charge.paymentDay));
  }

  // ESC closes; body scroll-locked while open.
  useEffect(() => {
    if (!charge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [charge, onClose]);

  if (!charge) return null;

  function submit() {
    if (!charge) return;
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error(translateError('errors.validation.generic'));
      return;
    }
    const parsedDueMonth = Number(dueMonth);
    const parsedPaymentDay = Number(paymentDay);
    const computedPaymentMonths = paymentMonthsFromFrequency(frequency, parsedDueMonth);

    startTransition(async () => {
      try {
        const result = await updateChargeAction(charge.id, {
          label: label.trim(),
          amount: parsedAmount,
          frequency,
          dueMonth: parsedDueMonth,
          paymentDay: parsedPaymentDay,
          paymentMonths: computedPaymentMonths,
        });
        if (result.ok) {
          toast.success(t('toastUpdated'));
          onClose();
          router.refresh();
        } else {
          toast.error(translateError(result.errorCode) || t('drawer.errorGeneric'));
        }
      } catch (err) {
        // Doctrine PR-BETA-3 hotfix #3 — never swallow Next.js control flow.
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('updateChargeAction threw', err);
        toast.error(t('drawer.errorGeneric'));
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="charge-edit-drawer"
    >
      <button
        type="button"
        aria-label={t('drawer.cancel')}
        className="bg-foreground/40 absolute inset-0 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className={cn(
          'bg-card text-foreground border-border relative flex w-full flex-col border shadow-xl',
          'h-dvh max-h-dvh',
          'sm:h-full sm:max-w-md sm:border-l',
        )}
      >
        <header className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {t('drawer.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-700 -mr-1 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
            aria-label={t('drawer.cancel')}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor={labelId}>{t('labelLabel')}</Label>
            <Input
              id={labelId}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              data-testid="charge-edit-label"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={amountId}>{t('amountLabel')}</Label>
            <Input
              id={amountId}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="charge-edit-amount"
            />
          </div>
          {/* THI-301: unified cadence cluster replaces the 3 separate fields.
              submit() still reads Number(dueMonth) / Number(paymentDay) +
              paymentMonthsFromFrequency — unchanged. */}
          <CadenceField
            idPrefix="edit-charge"
            value={{
              frequency,
              dueMonth: Number(dueMonth),
              paymentDay: Number(paymentDay) || 1,
            }}
            disabled={isPending}
            onChange={(next) => {
              setFrequency(next.frequency);
              setDueMonth(String(next.dueMonth));
              setPaymentDay(String(next.paymentDay));
            }}
          />
        </div>

        <footer className="border-border bg-card flex items-center justify-end gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            data-testid="charge-edit-cancel"
          >
            {t('drawer.cancel')}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || label.trim().length === 0}
            data-testid="charge-edit-save"
          >
            {isPending ? t('drawer.saving') : t('drawer.save')}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

function normalizeFrequency(value: string): Frequency {
  return (FREQUENCIES as readonly string[]).includes(value) ? (value as Frequency) : 'monthly';
}
