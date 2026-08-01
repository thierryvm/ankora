'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/primitives/Sheet';
import { toast } from '@/components/ui/toast';
import { convertChargeToCommitmentAction } from '@/lib/actions/charge-conversion';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { todayInAnkoraTz } from '@/lib/date/tz';
import { nextDueDateForCharge } from '@/lib/domain/charges';
import {
  confronterPortes,
  totalDivergeSuffisamment,
  type CommitmentFrequency,
  type PorteHorizon,
  type PorteKind,
} from '@/lib/domain/commitments';
import { formatCurrency, formatMonth, formatMonthInSentence } from '@/lib/i18n/formatters';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import type { Locale } from '@/i18n/routing';

export type ConvertibleCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  paymentDay: number;
  paymentMonths: readonly number[];
};

type Props = {
  charge: ConvertibleCharge | null;
  onClose: () => void;
  locale: Locale;
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const parseNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * « Convertir cette charge en engagement » — the flow, designed on the degraded
 * case (§1.7).
 *
 * ## Three doors, and the preview is the same code as the write
 *
 * The user answers whichever of « date de fin », « échéances restantes » or
 * « solde restant dû » they can. The live preview calls `confronterPortes`,
 * the very function the server action calls: the number shown before the tap
 * and the number recorded after it come from one implementation, so they cannot
 * drift. Nothing here asks for the rate, the original capital or the original
 * term — the model stores none of them (ADR-021 §Q5).
 *
 * ## Confront, name, never correct
 *
 * Two doors that disagree are BOTH displayed with their origin, and the
 * retained one is named. The remembered total (@thierry's « ~14 500 € » against
 * 60 × 250 = 15 000 €) is compared past 1 %, shown as a sentence, and stored
 * nowhere: it is not a column of the model, so no cockpit figure can inherit
 * the approximation. That confinement is what makes tolerating it safe.
 */
export function ConvertChargeSheet({ charge, onClose, locale }: Props) {
  const t = useTranslations('app.charges.convert');
  const translateError = useActionErrorTranslator();
  const [isPending, startTransition] = useTransition();

  const [endMonth, setEndMonth] = useState('');
  const [endYear, setEndYear] = useState('');
  const [remainingCount, setRemainingCount] = useState('');
  const [remainingBalance, setRemainingBalance] = useState('');
  const [remembered, setRemembered] = useState('');

  const fmt = (v: number) => formatCurrency(v, locale);
  /** Explicit branches, not a lookup: `next-intl` types message keys literally. */
  const doorLabel = (porte: PorteKind): string =>
    porte === 'echeancesRestantes'
      ? t('doorEcheancesRestantes')
      : porte === 'dateDeFin'
        ? t('doorDateDeFin')
        : t('doorSoldeRestantDu');

  function reset() {
    setEndMonth('');
    setEndYear('');
    setRemainingCount('');
    setRemainingBalance('');
    setRemembered('');
  }

  function close() {
    reset();
    onClose();
  }

  /** Anchor = the charge's NEXT due date (locked decision D3). */
  const anchor = useMemo(() => {
    if (!charge) return null;
    const iso = nextDueDateForCharge(
      {
        isActive: true,
        paymentMonths: charge.paymentMonths,
        paymentDay: charge.paymentDay,
      },
      todayInAnkoraTz(),
    );
    if (!iso) return null;
    const [y, m] = iso.split('-').map(Number) as [number, number, number];
    return { year: y, month: m };
  }, [charge]);

  const portes = useMemo<PorteHorizon[]>(() => {
    const out: PorteHorizon[] = [];
    const count = parseNumber(remainingCount);
    if (count !== null && Number.isInteger(count)) {
      out.push({ kind: 'echeancesRestantes', count });
    }
    const ey = parseNumber(endYear);
    const em = parseNumber(endMonth);
    if (ey !== null && em !== null) out.push({ kind: 'dateDeFin', year: ey, month: em });
    const balance = parseNumber(remainingBalance);
    if (balance !== null) out.push({ kind: 'soldeRestantDu', balance });
    return out;
  }, [remainingCount, endYear, endMonth, remainingBalance]);

  const confrontation = useMemo(() => {
    if (!charge || !anchor) return null;
    return confronterPortes(portes, {
      anchor,
      installmentAmount: charge.amount,
      frequency: charge.frequency as CommitmentFrequency,
    });
  }, [charge, anchor, portes]);

  const preview = useMemo(() => {
    if (!charge || !anchor || !confrontation) return null;
    const step = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[
      charge.frequency as CommitmentFrequency
    ];
    const endOrdinal =
      anchor.year * 12 + (anchor.month - 1) + (confrontation.installmentsTotal - 1) * step;
    return {
      count: confrontation.installmentsTotal,
      total: confrontation.installmentsTotal * charge.amount,
      endYear: Math.floor(endOrdinal / 12),
      endMonth: (endOrdinal % 12) + 1,
    };
  }, [charge, anchor, confrontation]);

  const rememberedTotal = parseNumber(remembered);
  const rememberedDiverges =
    preview !== null &&
    rememberedTotal !== null &&
    totalDivergeSuffisamment(rememberedTotal, preview.total);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!charge) return;
    if (!confrontation) {
      toast.error(t('needOneDoor'));
      return;
    }
    const count = parseNumber(remainingCount);
    const ey = parseNumber(endYear);
    const em = parseNumber(endMonth);
    const balance = parseNumber(remainingBalance);

    startTransition(async () => {
      try {
        const result = await convertChargeToCommitmentAction({
          chargeId: charge.id,
          ...(count !== null && Number.isInteger(count) ? { echeancesRestantes: count } : {}),
          ...(ey !== null && em !== null ? { dateDeFin: { year: ey, month: em } } : {}),
          ...(balance !== null ? { soldeRestantDu: balance } : {}),
        });
        if (result.ok) {
          toast.success(
            t('toastConverted', {
              label: charge.label,
              end: `${formatMonthInSentence(result.data.endMonth, locale)} ${result.data.endYear}`,
            }),
          );
          close();
        } else {
          toast.error(translateError(result.errorCode));
        }
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        // eslint-disable-next-line no-console
        console.error('convertChargeToCommitmentAction threw', err);
        toast.error(translateError('errors.conversion.failed'));
      }
    });
  }

  return (
    <Sheet
      open={charge !== null}
      onClose={close}
      title={t('title')}
      testId="convert-charge-sheet"
      closeLabel={t('cancel')}
      footer={
        <Button
          type="submit"
          form="convert-charge-form"
          className="w-full"
          disabled={isPending || confrontation === null}
          data-testid="convert-charge-submit"
        >
          {isPending ? t('submitting') : t('submit')}
        </Button>
      }
    >
      {charge && (
        <form id="convert-charge-form" onSubmit={onSubmit} className="flex flex-col gap-4 pb-2">
          <p className="text-muted-foreground text-sm" data-testid="convert-charge-intro">
            {t('intro', { label: charge.label, amount: fmt(charge.amount) })}
          </p>
          <p className="text-muted-foreground text-xs">{t('doorsHint')}</p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="convert-count">{t('remainingCountLabel')}</Label>
            <Input
              id="convert-count"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              max={600}
              value={remainingCount}
              onChange={(e) => setRemainingCount(e.target.value)}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">{t('endDateLabel')}</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="convert-end-month" className="text-xs">
                  {t('endMonthLabel')}
                </Label>
                <select
                  id="convert-end-month"
                  data-testid="convert-end-month"
                  className="ankora-form-control-16 border-border bg-card text-foreground focus-visible:border-brand-600 h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors focus-visible:outline-none"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                >
                  <option value="">—</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m, locale, 'long')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="convert-end-year" className="text-xs">
                  {t('endYearLabel')}
                </Label>
                <Input
                  id="convert-end-year"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  min={2000}
                  max={2100}
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="convert-balance">{t('remainingBalanceLabel')}</Label>
            <Input
              id="convert-balance"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              min={0}
              step="0.01"
              value={remainingBalance}
              onChange={(e) => setRemainingBalance(e.target.value)}
            />
          </div>

          {/* Live consequence — the same « Il te restera X € » discipline as the
              expense sheet: the outcome is on screen before the decision. */}
          {preview ? (
            <p
              className="bg-surface-muted text-foreground rounded-lg px-3 py-2 text-sm tabular-nums"
              data-testid="convert-charge-preview"
              aria-live="polite"
            >
              {t('preview', {
                count: preview.count,
                amount: fmt(charge.amount),
                end: `${formatMonthInSentence(preview.endMonth, locale)} ${preview.endYear}`,
                total: fmt(preview.total),
              })}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs" data-testid="convert-charge-no-horizon">
              {t('noHorizon')}
            </p>
          )}

          {/* Doors that disagree: both numbers, both origins, no arbitration. */}
          {confrontation && confrontation.ecarts.length > 0 && (
            <p
              className="text-warning text-sm"
              data-testid="convert-charge-divergence"
              aria-live="polite"
            >
              {t('divergence', { kept: confrontation.installmentsTotal })}{' '}
              {confrontation.ecarts
                .map((e) =>
                  t('divergenceItem', {
                    door: doorLabel(e.porte),
                    count: e.installmentsTotal,
                  }),
                )
                .join(' · ')}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="convert-remembered">{t('rememberedLabel')}</Label>
            <Input
              id="convert-remembered"
              type="number"
              inputMode="decimal"
              autoComplete="off"
              min={0}
              step="0.01"
              value={remembered}
              onChange={(e) => setRemembered(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t('rememberedHint')}</p>
          </div>

          {rememberedDiverges && preview && rememberedTotal !== null && (
            <p
              className="text-warning text-sm"
              data-testid="convert-charge-remembered-divergence"
              aria-live="polite"
            >
              {t('rememberedDivergence', {
                count: preview.count,
                amount: fmt(charge.amount),
                derived: fmt(preview.total),
                remembered: fmt(rememberedTotal),
              })}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}
