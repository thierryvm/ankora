'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/primitives/Sheet';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

export type MarkPaidTarget = {
  id: string;
  label: string;
  amount: number;
  /** Pre-filled day: the due date of the period, or today if it is ahead. */
  defaultDay: string;
  /** Earliest day the server accepts for this period. */
  minDay: string;
  /** Latest day: today (Brussels), or the period window's end if earlier. */
  maxDay: string;
};

type Props = {
  target: MarkPaidTarget | null;
  locale: Locale;
  pending: boolean;
  onClose: () => void;
  onConfirm: (target: MarkPaidTarget, day: string) => void;
};

/**
 * « Marquer payée » — asks for the day the bill was paid. The bank debited it
 * on that day, not on the day of the tick; a statement read in between already
 * contains it. The day is pre-filled, so the usual path stays one more press.
 */
export function MarkPaidSheet({ target, locale, pending, onClose, onConfirm }: Props) {
  const t = useTranslations('app.charges.paySheet');
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={t('title')}
      testId="charge-pay-sheet"
      closeLabel={t('cancel')}
      footer={
        <Button
          type="submit"
          form="charge-pay-form"
          className="min-h-11 w-full"
          disabled={pending}
          data-testid="charge-pay-submit"
        >
          {t('submit')}
        </Button>
      }
    >
      {target ? (
        // Keyed on the charge so the day resets to its own due date.
        <MarkPaidForm key={target.id} target={target} locale={locale} onConfirm={onConfirm} />
      ) : null}
    </Sheet>
  );
}

function MarkPaidForm({
  target,
  locale,
  onConfirm,
}: {
  target: MarkPaidTarget;
  locale: Locale;
  onConfirm: (target: MarkPaidTarget, day: string) => void;
}) {
  const t = useTranslations('app.charges.paySheet');
  const ids = useId();
  const [day, setDay] = useState(target.defaultDay);
  return (
    <form
      id="charge-pay-form"
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(target, day);
      }}
    >
      <p className="text-foreground text-sm" data-testid="charge-pay-intro">
        {t('intro', { label: target.label, amount: formatCurrency(target.amount, locale) })}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-day`}>{t('dateLabel')}</Label>
        <Input
          id={`${ids}-day`}
          type="date"
          className="min-h-11"
          required
          min={target.minDay}
          max={target.maxDay}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-describedby={`${ids}-hint`}
          data-testid="charge-pay-date"
        />
        <p id={`${ids}-hint`} className="text-muted-foreground text-xs">
          {t('dateHint')}
        </p>
      </div>
    </form>
  );
}
