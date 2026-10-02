'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { deleteExpenseAction, updateExpenseAction } from '@/lib/actions/expenses';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { formatCurrency } from '@/lib/i18n/formatters';
import { parseAmountInput } from '@/lib/i18n/parse-amount';
import type { Locale } from '@/i18n/routing';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaidFromChips } from '@/components/expenses/PaidFromChips';
import type { ExpenseUpdate } from '@/lib/schemas/expense';
import type { AccountKind } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

export type ExpenseEditDrawerExpense = {
  id: string;
  label: string;
  amount: number;
  occurredOn: string;
  note: string | null;
  paidFrom: AccountKind;
};

type Props = {
  expense: ExpenseEditDrawerExpense | null;
  /** The « Depuis » chips (rule 25), in screen order, under the person's names. */
  accounts: readonly { kind: AccountKind; label: string }[];
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
 * Slide-from-right on desktop, full-screen on mobile (h-svh + sm:max-w-md).
 */
export function ExpenseEditDrawer({ expense, accounts, onClose }: Props) {
  const t = useTranslations('app.expenses');
  const tAmount = useTranslations('ui.amountField');
  const tDate = useTranslations('errors.validation.operations.date');
  const translateError = useActionErrorTranslator();
  const router = useRouter();

  const labelId = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const occurredOnId = useId();
  const dateErrorId = useId();
  const titleId = useId();

  // Seed synchronously so we don't trip `react-hooks/set-state-in-effect`
  // (React 19 lint rule). Re-seed during render when the parent swaps to a
  // different expense — same trick as ChargeEditDrawer.
  const [seedId, setSeedId] = useState<string | null>(expense?.id ?? null);
  const [label, setLabel] = useState(expense?.label ?? '');
  const [amount, setAmount] = useState(expense?.amount.toString() ?? '');
  const [occurredOn, setOccurredOn] = useState(expense?.occurredOn ?? '');
  const [paidFrom, setPaidFrom] = useState<AccountKind>(expense?.paidFrom ?? 'vie_courante');
  const [dateError, setDateError] = useState<string | null>(null);
  const locale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Closing forgets the seed: reopening the SAME expense must start from what
  // it holds, never from choices made and then cancelled — an account ticked
  // then abandoned would otherwise travel with the next unrelated save.
  if (!expense && seedId !== null) setSeedId(null);
  if (expense && expense.id !== seedId) {
    setSeedId(expense.id);
    setLabel(expense.label);
    setAmount(expense.amount.toString());
    setOccurredOn(expense.occurredOn);
    setPaidFrom(expense.paidFrom);
    setDateError(null);
    // Reset the confirmation too: reopening on another expense must never
    // inherit an armed delete from the previous one.
    setConfirmingDelete(false);
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

  // An expense is never 0 €: an amount that does not read — empty, letters,
  // zero — keeps « Enregistrer » waiting, and the field says why. The field is
  // pre-filled, so an unreadable value is always something typed over it.
  const parsedAmount = parseAmountInput(amount);
  const amountInvalid = parsedAmount === null;

  function submit() {
    if (!expense || parsedAmount === null) return;

    // Only what changed travels (#494): an untouched field stays undefined and
    // the partial update schema leaves its column alone. Nothing changed, nothing
    // written — the drawer just closes.
    const trimmedLabel = label.trim();
    const changes: ExpenseUpdate = {
      ...(trimmedLabel !== expense.label && { label: trimmedLabel }),
      ...(parsedAmount !== expense.amount && { amount: parsedAmount }),
      ...(occurredOn !== expense.occurredOn && { occurredOn }),
      ...(paidFrom !== expense.paidFrom && { paidFrom }),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateExpenseAction(expense.id, changes);
        if (result.ok) {
          toast.success(t('toastUpdated'));
          onClose();
          router.refresh();
        } else {
          // Say WHICH field is refused, as the add sheet does: a generic toast
          // leaves the person hunting for what to change.
          if (result.fieldErrors?.occurredOn?.includes('operations.date.future')) {
            setDateError(tDate('future'));
          }
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

  /**
   * Deleting lives here rather than in the list.
   *
   * It used to be a red bin next to every row: one stray tap on a scrolling
   * list and an expense was gone, irreversibly, with no confirmation. Moving it
   * behind the drawer means you have to open the expense — and read it — before
   * you can destroy it, and the confirmation names what is about to disappear
   * rather than asking "are you sure?" about nothing in particular.
   *
   * Soft delete with an undo window is a later step; until then, naming the
   * expense and its amount is the whole safety net.
   */
  function remove() {
    if (!expense) return;
    startTransition(async () => {
      try {
        const result = await deleteExpenseAction(expense.id);
        if (result.ok) {
          toast.success(t('toastDeleted'));
          onClose();
          router.refresh();
        } else {
          toast.error(translateError(result.errorCode) || t('drawer.errorGeneric'));
        }
      } catch (err) {
        // Doctrine PR-BETA-3 hotfix #3 — never swallow Next.js control flow.
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('deleteExpenseAction threw', err);
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
          // `svh`, jamais `dvh`. Mesuré le 2026-08-23 : avec `h-dvh`, la hauteur
          // du tiroir suivait le viewport AU PIXEL — 664 → 664, 560 → 560,
          // 420 → 420. Sur iPhone, la barre d'URL de Safari fait varier ce
          // viewport à chaque défilement, donc le tiroir se redimensionnait sans
          // arrêt sous le doigt. `svh` est calculé barre déployée et ne bouge
          // pas quand elle se rétracte.
          'h-svh max-h-svh',
          // `sm:max-h-none` est OBLIGATOIRE à côté de `sm:h-full`. Le parent est
          // `fixed inset-0`, donc sa hauteur EST le viewport courant ; sans cette
          // surcharge, `max-h-svh` continuerait de plafonner le panneau au PETIT
          // viewport au point d'arrêt bureau, et sur un iPad dont la barre d'URL
          // s'est rétractée le panneau laisserait un vide que le fond, lui,
          // couvre. `Sheet.tsx` portait déjà `md:max-h-none` pour cette raison.
          'sm:h-full sm:max-h-none sm:max-w-md sm:border-l',
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6 [--rangee-gouttiere:1.25rem]">
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
            {/* Text with a decimal keypad, never `type="number"`: the browser
                blanks a comma-typed « 5,90 », and the expense went in at 0 €. */}
            <Input
              id={amountId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? amountErrorId : undefined}
              data-testid="expense-edit-amount"
            />
            {amountInvalid && (
              <p id={amountErrorId} className="text-danger text-xs font-medium">
                {tAmount('positive')}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={occurredOnId}>{t('dateLabel')}</Label>
            <Input
              id={occurredOnId}
              type="date"
              value={occurredOn}
              onChange={(e) => {
                setOccurredOn(e.target.value);
                setDateError(null);
              }}
              aria-invalid={dateError !== null || undefined}
              aria-describedby={dateError ? dateErrorId : undefined}
              data-testid="expense-edit-occurred-on"
            />
            {dateError && (
              <p
                id={dateErrorId}
                role="alert"
                data-testid="expense-edit-date-error"
                className="text-danger text-xs font-medium"
              >
                {dateError}
              </p>
            )}
          </div>
          {accounts.length > 1 && (
            <PaidFromChips
              name="expense-edit-paid-from"
              legend={t('addSheet.paidFromLabel')}
              accounts={accounts}
              value={paidFrom}
              onChange={setPaidFrom}
              disabled={isPending}
            />
          )}
        </div>

        {/*
          The destructive action is visually separated from the form and sits
          before the footer, so "Enregistrer" is never the neighbour of
          "Supprimer". Two steps: arming shows what will be destroyed, by name
          and amount — a confirmation that says nothing is a confirmation
          nobody reads.
        */}
        <div className="border-border border-t px-5 py-4">
          {confirmingDelete ? (
            <div className="space-y-3" data-testid="expense-delete-confirm">
              <p className="text-sm">
                {t('drawer.confirmDelete', {
                  label: expense.label,
                  amount: formatCurrency(expense.amount, locale),
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isPending}
                  data-testid="expense-delete-abort"
                >
                  {t('drawer.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={remove}
                  disabled={isPending}
                  data-testid="expense-delete-confirmed"
                >
                  {isPending ? t('drawer.deleting') : t('drawer.confirmDeleteAction')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              aria-label={t('deleteAria', { label: expense.label })}
              data-testid="expense-delete-arm"
              className="text-danger hover:text-danger min-h-11 gap-2 px-2"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('drawer.delete')}
            </Button>
          )}
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
            disabled={isPending || label.trim().length === 0 || amountInvalid}
            data-testid="expense-edit-save"
          >
            {isPending ? t('drawer.saving') : t('drawer.save')}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
