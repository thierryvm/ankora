'use client';

import { useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Sheet } from '@/components/primitives/Sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import type { ActionResult } from '@/lib/actions/types';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

/**
 * One short sheet for the operations that ask « how much, and when »: the
 * balance statement and « J'ai fait ce virement ». The question IS the label
 * of the amount field. The sheet carries no name and no role field: what the
 * account is called is not what this gesture writes.
 */
export type AmountSheetProps = {
  open: boolean;
  onClose: () => void;
  testId: string;
  title: string;
  question: string;
  hint?: string;
  dateLabel: string;
  initialAmount: number | null;
  initialDate: string;
  /** Called on every change of the date, for a field that depends on it (tour 42: the month an income counts for). */
  onDateChange?: (isoDay: string) => void;
  /**
   * A balance can be negative; an amount moved cannot. A negative balance is
   * given by an « overdrawn » switch rather than a typed minus: the iOS decimal
   * pad has no minus key, and a full keyboard for a figure is a worse trade.
   */
  allowNegative: boolean;
  /** Fields the gesture needs beyond « how much, and when » (e.g. the account). */
  extraFields?: ReactNode;
  /** Live line under the amount (e.g. the provisions / free savings split). */
  renderDetail?: (amount: number | null) => ReactNode;
  successMessage: string;
  onSubmit: (amount: number, isoDay: string) => Promise<ActionResult<unknown>>;
};

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace('\u2212', '-').replace(',', '.');
  // Digits, one separator, two decimals at most: `Number()` alone accepts
  // 1e3, 0x10 and 0b11.
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function AmountSheet(props: AmountSheetProps) {
  const t = useTranslations('operations');
  const translateError = useActionErrorTranslator();
  const amountRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const [raw, setRaw] = useState(props.initialAmount === null ? '' : String(props.initialAmount));
  const [day, setDay] = useState(props.initialDate);
  const [overdrawn, setOverdrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const typed = parseAmount(raw);
  // A typed minus still works (a keyboard has one); the switch only forces the sign.
  const amount = typed !== null && props.allowNegative && overdrawn ? -Math.abs(typed) : typed;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount === null || (!props.allowNegative && amount <= 0)) {
      setError(translateError('errors.validation.operations.amount.invalid'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await props.onSubmit(amount, day);
      if (result.ok) {
        toast.success(props.successMessage);
        props.onClose();
      } else {
        const field = result.fieldErrors ? Object.values(result.fieldErrors)[0]?.[0] : undefined;
        setError(translateError(field ? `errors.validation.${field}` : result.errorCode));
      }
    });
  }

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      testId={props.testId}
      closeLabel={t('close')}
      initialFocusRef={amountRef}
      desktop="dialog"
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-amount`}>{props.question}</Label>
          <Input
            ref={amountRef}
            id={`${ids}-amount`}
            className="min-h-11"
            inputMode="decimal"
            autoComplete="off"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={
              [props.hint ? `${ids}-hint` : null, error ? `${ids}-error` : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          {props.hint ? (
            <p id={`${ids}-hint`} className="text-muted-foreground text-xs">
              {props.hint}
            </p>
          ) : null}
          {props.allowNegative ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={overdrawn}
                onChange={(e) => setOverdrawn(e.target.checked)}
              />
              {t('statement.overdraft')}
            </label>
          ) : null}
          {props.renderDetail ? (
            <p className="text-sm" aria-live="polite">
              {props.renderDetail(amount)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-date`}>{props.dateLabel}</Label>
          <Input
            id={`${ids}-date`}
            className="min-h-11"
            type="date"
            max={props.initialDate}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              props.onDateChange?.(e.target.value);
            }}
          />
        </div>
        {props.extraFields}
        {error ? (
          <p id={`${ids}-error`} role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="min-h-11" disabled={isPending}>
          {isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </Sheet>
  );
}
