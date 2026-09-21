'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { AmountSheet } from '@/components/operations/AmountSheet';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { recordPlannedTransferAction, setMovementCancelledAction } from '@/lib/actions/operations';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

/** Plain values only: a Decimal never crosses the RSC boundary. */
export type TransferLineState =
  | { state: 'done'; id: string; amount: number; suggested: number; occurredOn: string }
  | { state: 'todo'; cancelledId: string | null };

type Props = {
  lineLabel: string;
  fromAccountType: AccountType;
  toAccountType: AccountType;
  suggested: number;
  plannedProvisions: number;
  planYear: number;
  planMonth: number;
  today: string;
  line: TransferLineState;
};

function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export function TransferDoneControl(props: Props) {
  const t = useTranslations('operations.transfer');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fmt = (n: number) => formatCurrency(n, locale);

  function setCancelled(id: string, cancelled: boolean) {
    startTransition(async () => {
      const r = await setMovementCancelledAction({ id, cancelled });
      if (r.ok) toast.success(cancelled ? t('cancelled') : t('saved'));
      else toast.error(translateError(r.errorCode));
    });
  }

  if (props.line.state === 'done') {
    const { id, amount, suggested, occurredOn } = props.line;
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-2" data-testid="virement-fait">
        <span className="text-muted-foreground text-xs">
          {amount === suggested
            ? t('doneOn', { date: formatDay(occurredOn, locale) })
            : t('doneAmount', { date: formatDay(occurredOn, locale), montant: fmt(amount) })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={isPending}
          onClick={() => setCancelled(id, true)}
        >
          {t('cancel')}
        </Button>
      </div>
    );
  }

  const { cancelledId } = props.line;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2">
      {cancelledId ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={isPending}
          onClick={() => setCancelled(cancelledId, false)}
        >
          {t('reopen')}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        aria-label={t('doneAria', { line: props.lineLabel })}
        onClick={() => setOpen(true)}
      >
        {t('done')}
      </Button>
      {open ? (
        <AmountSheet
          open={open}
          onClose={() => setOpen(false)}
          testId="feuille-virement"
          title={t('done')}
          question={t('question')}
          hint={t('hint')}
          dateLabel={t('date')}
          initialAmount={props.suggested}
          initialDate={props.today}
          allowNegative={false}
          successMessage={t('saved')}
          renderDetail={
            props.toAccountType === 'provisions'
              ? (amount) => {
                  if (amount === null || amount <= 0) return null;
                  const provisions = Math.min(amount, Math.max(0, props.plannedProvisions));
                  return t('split', {
                    provisions: fmt(provisions),
                    libre: fmt(Math.round((amount - provisions) * 100) / 100),
                  });
                }
              : undefined
          }
          onSubmit={(amount, occurredOn) =>
            recordPlannedTransferAction({
              fromAccountType: props.fromAccountType,
              toAccountType: props.toAccountType,
              amount,
              occurredOn,
              planYear: props.planYear,
              planMonth: props.planMonth,
              planSuggestedAmount: props.suggested,
              plannedProvisions: props.plannedProvisions,
            })
          }
        />
      ) : null}
    </div>
  );
}
