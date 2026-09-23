'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { updateChargeAction } from '@/lib/actions/charges';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { paymentMonthsFromFrequency } from '@/lib/domain/charges';
import { CHARGE_FREQUENCIES, type ChargeFrequency } from '@/lib/domain/types';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/primitives/Sheet';

import { CadenceField } from './CadenceField';

type Frequency = ChargeFrequency;

export type ChargeEditDrawerCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  dueMonth: number;
  paymentDay: number;
  /** Full schedule — the conversion flow derives the anchor from it. */
  paymentMonths: readonly number[];
};

type Props = {
  charge: ChargeEditDrawerCharge | null;
  onClose: () => void;
  /**
   * Opens the conversion flow for this charge. Optional: when absent the
   * affordance is not rendered at all, so a caller that has no conversion
   * sheet mounted cannot offer a dead button.
   */
  onConvert?: (charge: ChargeEditDrawerCharge) => void;
  /** « À surveiller » state of this charge (optimistic, owned by the list). */
  watched?: boolean;
  onToggleWatch?: () => void;
  /** Deletes the charge — only reached through the in-drawer confirmation. */
  onDelete?: (id: string) => void;
  /** A list-level action (watch, delete) is in flight: freeze the gestures. */
  pendingOutside?: boolean;
};

/**
 * "Modifier une facture" drawer — PR-BETA-CLEANUP-2 (THI-281), rebuilt on the
 * shared `Sheet` primitive for the v3 mockup (F15): a sheet rising from the
 * bottom on mobile, a centred dialog from `md`. It also owns the gestures that
 * left the row (F11) — « À surveiller » and a confirmed delete.
 *
 * Error handling follows the PR-BETA-3 fail-loud pattern:
 *   - `{ ok: true }` → toast success + close + router.refresh
 *   - `{ ok: false, errorCode }` → toast translated, drawer STAYS OPEN
 *   - JS throw → toast generic, drawer STAYS OPEN
 *   - NEXT_REDIRECT / NEXT_NOT_FOUND → re-thrown so Next.js can navigate
 */
export function ChargeEditDrawer({
  charge,
  onClose,
  onConvert,
  watched = false,
  onToggleWatch,
  onDelete,
  pendingOutside = false,
}: Props) {
  const t = useTranslations('app.charges');
  const translateError = useActionErrorTranslator();
  const router = useRouter();

  const labelId = useId();
  const amountId = useId();

  // Seed the form from the charge during render, keyed on its id: opening a
  // different charge swaps the whole state in one batch, with no
  // setState-in-effect cascade.
  const [seedId, setSeedId] = useState<string | null>(charge?.id ?? null);
  const [label, setLabel] = useState(charge?.label ?? '');
  const [amount, setAmount] = useState(charge?.amount.toString() ?? '');
  const [frequency, setFrequency] = useState<Frequency>(
    charge ? normalizeFrequency(charge.frequency) : 'monthly',
  );
  const [dueMonth, setDueMonth] = useState(charge ? String(charge.dueMonth) : '1');
  const [paymentDay, setPaymentDay] = useState(charge ? String(charge.paymentDay) : '1');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (charge && charge.id !== seedId) {
    setSeedId(charge.id);
    setLabel(charge.label);
    setAmount(charge.amount.toString());
    setFrequency(normalizeFrequency(charge.frequency));
    setDueMonth(String(charge.dueMonth));
    setPaymentDay(String(charge.paymentDay));
    setConfirmingDelete(false);
  }

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

  const busy = isPending || pendingOutside;

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('drawer.title')}
      testId="charge-edit-drawer"
      closeLabel={t('drawer.cancel')}
      desktop="dialog"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
            data-testid="charge-edit-cancel"
          >
            {t('drawer.cancel')}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={busy || label.trim().length === 0}
            data-testid="charge-edit-save"
          >
            {isPending ? t('drawer.saving') : t('drawer.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
        {/* THI-301: unified cadence cluster replaces the 3 separate fields. */}
        <CadenceField
          idPrefix="edit-charge"
          value={{
            frequency,
            dueMonth: Number(dueMonth),
            paymentDay: Number(paymentDay) || 1,
          }}
          disabled={busy}
          onChange={(next) => {
            setFrequency(next.frequency);
            setDueMonth(String(next.dueMonth));
            setPaymentDay(String(next.paymentDay));
          }}
        />

        {/* « À surveiller » moved here from the row (mockup F11: one action per
            row). The gesture and what the cockpit reads from it are unchanged;
            only its place is. */}
        {onToggleWatch && (
          <div className="border-border/60 flex items-start justify-between gap-3 border-t pt-4">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">{t('drawerWatch')}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{t('drawerWatchHint')}</p>
            </div>
            <button
              type="button"
              onClick={onToggleWatch}
              disabled={busy}
              aria-pressed={watched}
              aria-label={
                watched
                  ? t('unwatchAria', { label: charge.label })
                  : t('watchAria', { label: charge.label })
              }
              data-testid="charge-drawer-watch"
              className="hover:bg-surface-muted focus-visible:ring-brand-600 flex size-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              <Bookmark
                aria-hidden
                className={`h-4 w-4 ${watched ? 'text-brand-text' : 'text-muted-foreground'}`}
                fill={watched ? 'currentColor' : 'none'}
              />
            </button>
          </div>
        )}

        {/* « Convertir en engagement » — a rare, once-per-debt move. The drawer
            closes before the conversion sheet opens: sequential, never nested. */}
        {onConvert && (
          <div className="border-border/60 border-t pt-4">
            <button
              type="button"
              onClick={() => onConvert(charge)}
              disabled={busy}
              data-testid="charge-edit-convert"
              className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 min-h-11 rounded text-sm font-medium underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              {t('convert.title')}
            </button>
            <p className="text-muted-foreground mt-0.5 text-xs">{t('convert.drawerHint')}</p>
          </div>
        )}

        {/* Delete left the row for the drawer, and asks first (mockup F11): it
            is the one gesture here that cannot be taken back. */}
        {onDelete && (
          <div className="border-border/60 border-t pt-4">
            {confirmingDelete ? (
              <div role="group" aria-label={t('drawerDelete')} className="flex flex-col gap-2">
                <p className="text-foreground text-sm">
                  {t('drawerDeleteQuestion', { label: charge.label })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy}
                  >
                    {t('drawerDeleteKeep')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => onDelete(charge.id)}
                    disabled={busy}
                    data-testid="charge-drawer-delete-confirm"
                  >
                    {t('drawerDeleteConfirm')}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                data-testid="charge-drawer-delete"
                className="text-danger focus-visible:ring-brand-600 inline-flex min-h-11 items-center gap-2 rounded text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                {t('drawerDelete')}
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function normalizeFrequency(value: string): Frequency {
  return (CHARGE_FREQUENCIES as readonly string[]).includes(value)
    ? (value as Frequency)
    : 'monthly';
}
