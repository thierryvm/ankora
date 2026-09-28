'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { AmountSheet } from '@/components/operations/AmountSheet';
import {
  accountsAsked,
  answersToSend,
  SameDayStatementQuestion,
  type RewritableStatements,
  type StatementAnswer,
} from '@/components/operations/SameDayStatementQuestion';
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
  /**
   * The provisions share of the month (`provisionPartOfMonth`), for DISPLAY:
   * the server recomputes it from the charges and never takes this copy.
   */
  plannedProvisions: number;
  planYear: number;
  planMonth: number;
  today: string;
  line: TransferLineState;
  /** ADR-045 D21 — per account, the statement a same-day transfer could double. */
  statements?: RewritableStatements;
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
  const tSameDay = useTranslations('operations.sameDay');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [day, setDay] = useState(props.today);
  const [answers, setAnswers] = useState<Partial<Record<AccountType, StatementAnswer>>>({});
  const statements = props.statements ?? {};
  const touched = [props.fromAccountType, props.toAccountType];
  const asked = accountsAsked(statements, touched, day || props.today);
  const unanswered = asked.some((a) => answers[a] === undefined);

  function closeSheet() {
    setOpen(false);
    setDay(props.today);
    setAnswers({});
  }
  const fmt = (n: number) => formatCurrency(n, locale);
  // The cent is the smallest unit (ADR-045 D19): a plan figure such as
  // 280/12 + 70/3 would prefill 46.666… and be refused by the sheet itself.
  const suggested = Math.round(props.suggested * 100) / 100;

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
          onClose={closeSheet}
          testId="feuille-virement"
          title={t('done')}
          question={t('question')}
          hint={t('hintPrevu', { montant: fmt(suggested) })}
          dateLabel={t('date')}
          // Tour 55 — empty on purpose: a prefilled target was saved as it
          // stood by someone who had transferred much more.
          initialAmount={null}
          requireTypedAmount
          initialDate={props.today}
          onDateChange={setDay}
          allowNegative={false}
          successMessage={t('saved')}
          blockedReason={unanswered ? tSameDay('missing') : null}
          extraFields={
            asked.length > 0 ? (
              <SameDayStatementQuestion
                asked={asked}
                statements={statements}
                answers={answers}
                onAnswer={(a, v) => setAnswers((prev) => ({ ...prev, [a]: v }))}
              />
            ) : undefined
          }
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
              planSuggestedAmount: suggested,
              ...answersToSend(accountsAsked(statements, touched, occurredOn), answers),
            })
          }
        />
      ) : null}
    </div>
  );
}
