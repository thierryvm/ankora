'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { updateExpenseAction } from '@/lib/actions/expenses';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type ExpenseEditDrawerExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
};

type Props = {
  expense: ExpenseEditDrawerExpense | null;
  onClose: () => void;
};

/**
 * "Modifier une dépense" drawer — PR-BETA-CLEANUP-3 (2026-05-27).
 *
 * Parity with `ChargeEditDrawer` (PR-BETA-CLEANUP-2). Edits label, amount,
 * occurredOn through the already-existing `updateExpenseAction(id, input)`.
 * Reuses the same fail-loud doctrine as the charges + reste-à-vivre drawers:
 *
 *   - `{ ok: true }` → toast success + close + router.refresh
 *   - `{ ok: false, errorCode }` → toast translated, drawer STAYS OPEN
 *   - JS throw → toast generic, drawer STAYS OPEN
 *   - NEXT_REDIRECT / NEXT_NOT_FOUND → re-thrown so Next.js can navigate
 *
 * Slide-from-right on desktop, full-screen on mobile (h-dvh + sm:max-w-md).
 */
export function ExpenseEditDrawer({ expense, onClose }: Props) {
  const t = useTranslations('app.expenses');
  const translateError = useActionErrorTranslator();
  const router = useRouter();

  const labelId = useId();
  const amountId = useId();
  const occurredOnId = useId();
  const titleId = useId();

  // Seed synchronously so we don't trip `react-hooks/set-state-in-effect`
  // (React 19 lint rule). Re-seed during render when the parent swaps to a
  // different expense — same trick as ChargeEditDrawer.
  const [seedId, setSeedId] = useState<string | null>(expense?.id ?? null);
  const [label, setLabel] = useState(expense?.label ?? '');
  const [amount, setAmount] = useState(expense?.amount.toString() ?? '');
  const [occurredOn, setOccurredOn] = useState(expense?.occurredOn ?? '');
  const [isPending, startTransition] = useTransition();

  if (expense && expense.id !== seedId) {
    setSeedId(expense.id);
    setLabel(expense.label);
    setAmount(expense.amount.toString());
    setOccurredOn(expense.occurredOn);
  }

  // ESC closes; body scroll-locked while open.
  useEffect(() => {
    if (!expense) return;
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
  }, [expense, onClose]);

  if (!expense) return null;

  function submit() {
    if (!expense) return;
    const parsedAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error(translateError('errors.validation.generic'));
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateExpenseAction(expense.id, {
          label: label.trim(),
          amount: parsedAmount,
          occurredOn,
          // Untouched fields stay undefined → the partial update schema
          // skips them in the SQL UPDATE statement.
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
        console.error('updateExpenseAction threw', err);
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
      data-testid="expense-edit-drawer"
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
            className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-500/30 -mr-1 rounded-md p-2 focus-visible:ring-2 focus-visible:outline-none"
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
              data-testid="expense-edit-label"
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
              data-testid="expense-edit-amount"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={occurredOnId}>{t('dateLabel')}</Label>
            <Input
              id={occurredOnId}
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              data-testid="expense-edit-occurred-on"
            />
          </div>
        </div>

        <footer className="border-border bg-card flex items-center justify-end gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            data-testid="expense-edit-cancel"
          >
            {t('drawer.cancel')}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || label.trim().length === 0}
            data-testid="expense-edit-save"
          >
            {isPending ? t('drawer.saving') : t('drawer.save')}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
