'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/routing';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { formatCurrency } from '@/lib/i18n/formatters';

export type StatementAnswer = 'included' | 'notYet';

/**
 * Per account, the latest standing statement that is NOT the starting
 * balance — the only one an operation of its day can be counted twice against
 * (ADR-045 D21). Plain values: a Decimal never crosses the RSC boundary.
 */
export type RewritableStatements = Partial<
  Record<AccountType, { statedOn: string; balance: number }>
>;

/** The accounts, among those an operation touches, whose statement was read on `day`. */
export function accountsAsked(
  statements: RewritableStatements,
  accounts: readonly AccountType[],
  day: string,
): AccountType[] {
  return [...new Set(accounts)].filter((a) => statements[a]?.statedOn === day);
}

/** Only the answers the server will ask for — never an answer to a question not shown. */
export function answersToSend(
  asked: readonly AccountType[],
  answers: Partial<Record<AccountType, StatementAnswer>>,
): { statementAnswers?: Partial<Record<AccountType, StatementAnswer>> } {
  if (asked.length === 0) return {};
  return { statementAnswers: Object.fromEntries(asked.map((a) => [a, answers[a]])) };
}

function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * « Ton solde du {date} ({montant}) contient-il déjà cet argent ? » — asked
 * when the operation is dated on the day of the account's statement, because
 * the order of writing says nothing of what the balance held. No answer by
 * default: the sheet refuses to save until one is chosen.
 */
export function SameDayStatementQuestion({
  asked,
  statements,
  answers,
  onAnswer,
}: {
  asked: readonly AccountType[];
  statements: RewritableStatements;
  answers: Partial<Record<AccountType, StatementAnswer>>;
  onAnswer: (account: AccountType, answer: StatementAnswer) => void;
}) {
  const t = useTranslations('operations.sameDay');
  const locale = useLocale() as Locale;
  const ids = useId();

  return (
    <>
      {asked.map((account) => {
        const statement = statements[account];
        if (!statement) return null;
        return (
          <fieldset
            key={account}
            className="flex flex-col gap-1.5"
            data-testid={`question-solde-${account}`}
          >
            <legend className="mb-1.5 text-sm font-medium">
              {t('question', {
                date: formatDay(statement.statedOn, locale),
                montant: formatCurrency(statement.balance, locale),
              })}
            </legend>
            <div className="flex flex-wrap gap-x-5">
              {(['included', 'notYet'] as const).map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name={`${ids}-${account}`}
                    className="h-5 w-5"
                    value={value}
                    checked={answers[account] === value}
                    onChange={() => onAnswer(account, value)}
                  />
                  {t(value)}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}
