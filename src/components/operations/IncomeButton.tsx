'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { AmountSheet } from '@/components/operations/AmountSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/routing';
import { recordIncomeAction } from '@/lib/actions/operations';
import {
  choixDeMois,
  decalerMois,
  moisDeLaDate,
  moisProposePourArgentRecu,
  type MoisIso,
} from '@/lib/domain/accounts/mois-concerne';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { formatMonthInSentence } from '@/lib/i18n/formatters';

type Nature = 'regular' | 'extra';

export type IncomeButtonProps = {
  /** The accounts money can be received on, in screen order, with their names. */
  accounts: ReadonlyArray<{ accountType: AccountType; label: string }>;
  /** ISO day in Brussels — the default date, and the latest one allowed. */
  today: string;
  /**
   * Tour 42 — the months already served by a live « mon revenu du mois »
   * (`moisServisParRevenu`), `YYYY-MM`. The month proposed at entry is read
   * from them, never from a fixed day of the month.
   */
  moisServis?: readonly MoisIso[];
};

/**
 * « Argent reçu »: one button, one short sheet — how much, when (today by
 * default), as what (the month's income or on top of it), for which month's
 * budget, on which account, and an optional description. The written line
 * then shows on its account, with « Annuler » and, once cancelled, « Rétablir ».
 *
 * The month (ADR-046) is proposed, never hidden: when it is not the month of
 * the date, a sentence says so above the choice, with the way back one tap
 * away. The balance of the account still moves at the DATE.
 *
 * It never touches `accounts.balance` (voie A, 2026-09-21).
 */
export function IncomeButton({ accounts, today, moisServis = [] }: IncomeButtonProps) {
  const t = useTranslations('operations.income');
  const locale = useLocale() as Locale;
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>(
    accounts[0]?.accountType ?? 'income_bills',
  );
  const [nature, setNature] = useState<Nature>('regular');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState(today);
  // null = follow the proposal; a month = the person's own choice.
  const [choix, setChoix] = useState<MoisIso | null>(null);

  const moisDate = moisDeLaDate(day || today);
  const propose = moisProposePourArgentRecu({ dateIso: day || today, nature, moisServis });
  const options = choixDeMois({ dateIso: day || today, propose });
  const mois = choix !== null && options.includes(choix) ? choix : propose;

  const nomMois = (m: MoisIso) => {
    const [y, mm] = m.split('-').map(Number) as [number, number];
    const nom = formatMonthInSentence(mm, locale);
    return m.slice(0, 4) === moisDate.slice(0, 4) ? nom : `${nom} ${y}`;
  };

  const avertissement =
    mois === moisDate
      ? null
      : nature === 'extra'
        ? t('month.warnOther', { month: nomMois(mois) })
        : mois === decalerMois(moisDate, 1)
          ? t('month.warnNext', { month: nomMois(mois) })
          : t('month.warnPrevious', { month: nomMois(mois) });

  function close() {
    setOpen(false);
    setAccountType(accounts[0]?.accountType ?? 'income_bills');
    setNature('regular');
    setDescription('');
    setDay(today);
    setChoix(null);
  }

  return (
    <>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        {t('open')}
      </Button>
      {open ? (
        <AmountSheet
          open={open}
          onClose={close}
          testId="feuille-argent-recu"
          title={t('title')}
          question={t('amount')}
          dateLabel={t('date')}
          initialAmount={null}
          initialDate={today}
          onDateChange={(d) => {
            setDay(d);
            // A choice made for another date is stale: follow the new proposal.
            setChoix(null);
          }}
          allowNegative={false}
          successMessage={t('saved')}
          extraFields={
            <>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">{t('nature')}</legend>
                {(['regular', 'extra'] as const).map((n) => (
                  <label key={n} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name={`${ids}-nature`}
                      className="h-5 w-5"
                      value={n}
                      checked={nature === n}
                      onChange={() => setNature(n)}
                    />
                    {t(n === 'regular' ? 'natureRegular' : 'natureExtra')}
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col gap-1.5" data-testid="mois-concerne">
                <legend className="mb-1.5 text-sm font-medium">{t('month.legend')}</legend>
                {avertissement ? (
                  <div
                    role="status"
                    data-testid="mois-concerne-avertissement"
                    className="border-brand-600 bg-surface-muted mb-1 flex flex-col gap-1 rounded-md border-l-4 px-3 py-2"
                  >
                    <p className="text-sm font-medium">{avertissement}</p>
                    <button
                      type="button"
                      className="text-brand-text min-h-11 self-start text-sm underline underline-offset-2"
                      onClick={() => setChoix(moisDate)}
                    >
                      {t('month.undo', { month: nomMois(moisDate) })}
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-5">
                  {options.map((m) => (
                    <label key={m} className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name={`${ids}-month`}
                        className="h-5 w-5"
                        value={m}
                        checked={mois === m}
                        onChange={() => setChoix(m)}
                      />
                      {t('month.option', { month: nomMois(m) })}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-account`}>{t('account')}</Label>
                <select
                  id={`${ids}-account`}
                  className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                >
                  {accounts.map((a) => (
                    <option key={a.accountType} value={a.accountType}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-description`}>{t('description')}</Label>
                <Input
                  id={`${ids}-description`}
                  className="min-h-11"
                  maxLength={120}
                  placeholder={t('descriptionHint')}
                  autoComplete="off"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          }
          onSubmit={(amount, occurredOn) =>
            recordIncomeAction({
              toAccountType: accountType,
              amount,
              occurredOn,
              nature,
              // Sent only when it says something the date does not (ADR-046).
              ...(occurredOn && mois !== moisDeLaDate(occurredOn) ? { budgetMonth: mois } : {}),
              ...(description.trim() ? { description: description.trim() } : {}),
            })
          }
        />
      ) : null}
    </>
  );
}
