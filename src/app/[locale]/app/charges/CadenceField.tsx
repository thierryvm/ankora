'use client';

import { useTranslations } from 'next-intl';

import { paymentMonthsFromFrequency } from '@/lib/domain/charges';
import { CHARGE_FREQUENCIES, type ChargeFrequency } from '@/lib/domain/types';

export interface CadenceValue {
  frequency: ChargeFrequency;
  /** 1-12 anchor month. Ignored (and hidden) when frequency is monthly. */
  dueMonth: number;
  /** 1-31. The value 31 is presented as "Dernier jour du mois". */
  paymentDay: number;
}

interface CadenceFieldProps {
  /** Required: prefixes both the a11y ids and the data-testids. MUST be unique
   *  per instance on a page (create vs edit) to avoid duplicate DOM ids. */
  idPrefix: string;
  value: CadenceValue;
  onChange: (next: CadenceValue) => void;
  disabled?: boolean;
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const NUMERIC_DAYS = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
const LAST_DAY = 31;

// Native <select> mirroring the Ankora form-control contract 1:1.
// `ankora-form-control-16` is the iOS auto-zoom guard (16px !important) —
// MANDATORY: native <select> on iOS Safari auto-zooms < 16px exactly like
// inputs, which is the whole reason we go native (THI-301 locked decision).
// Focus = single brand-600 border, no ring (DS "un signal pas deux").
const selectClass =
  'ankora-form-control-16 border-border bg-card text-foreground h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors hover:border-brand-500/40 focus-visible:border-brand-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Unified cadence picker for a recurring charge (THI-301): frequency +
 * (anchor month when non-monthly) + day-of-month, with a human summary line.
 * Controlled component — emits `{frequency, dueMonth, paymentDay}`, exactly
 * what the Server Actions already consume. Computes NO dates: the year-aware
 * leap clamp lives exclusively in the domain (`next-due-date.ts`).
 */
export function CadenceField({ idPrefix, value, onChange, disabled }: CadenceFieldProps) {
  const t = useTranslations('app.charges.cadence');
  const tFreq = useTranslations('common.frequency');
  const tMonths = useTranslations('common.months');
  const tMonthsShort = useTranslations('common.monthsShort');

  const isMonthly = value.frequency === 'monthly';
  const freqId = `${idPrefix}-frequency`;
  const dayId = `${idPrefix}-day`;
  const monthId = `${idPrefix}-month`;

  const daySummary = value.paymentDay === LAST_DAY ? t('daySummaryLast') : String(value.paymentDay);

  const summary = isMonthly
    ? t('summaryMonthly', { day: daySummary })
    : t('summaryRecurring', {
        day: daySummary,
        months: paymentMonthsFromFrequency(value.frequency, value.dueMonth)
          .map((m) => tMonthsShort(String(m) as '1'))
          .join(', '),
      });

  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-field`}>
      <div className="flex flex-col gap-2">
        <label htmlFor={freqId} className="text-sm font-medium">
          {t('frequencyLabel')}
        </label>
        <select
          id={freqId}
          data-testid={`${idPrefix}-frequency`}
          className={selectClass}
          value={value.frequency}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, frequency: e.target.value as ChargeFrequency })}
        >
          {CHARGE_FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {tFreq(f)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-2">
          <label htmlFor={dayId} className="text-sm font-medium">
            {t('dayLabel')}
          </label>
          <select
            id={dayId}
            data-testid={`${idPrefix}-day`}
            className={selectClass}
            value={value.paymentDay}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, paymentDay: Number(e.target.value) })}
          >
            {NUMERIC_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value={LAST_DAY}>{t('lastDayOption')}</option>
          </select>
        </div>

        {!isMonthly && (
          <div
            className="flex min-w-32 flex-1 flex-col gap-2"
            data-testid={`${idPrefix}-month-wrap`}
          >
            <label htmlFor={monthId} className="text-sm font-medium">
              {t('anchorMonthLabel')}
            </label>
            <select
              id={monthId}
              data-testid={`${idPrefix}-month`}
              className={selectClass}
              value={value.dueMonth}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, dueMonth: Number(e.target.value) })}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {tMonths(String(m) as '1')}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs" data-testid={`${idPrefix}-summary`}>
        {summary}
      </p>
    </div>
  );
}
