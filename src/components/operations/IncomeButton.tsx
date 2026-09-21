'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { AmountSheet } from '@/components/operations/AmountSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recordIncomeAction } from '@/lib/actions/operations';
import type { AccountType } from '@/lib/domain/cockpit/types';

type Nature = 'regular' | 'extra';

export type IncomeButtonProps = {
  /** The accounts money can be received on, in screen order, with their names. */
  accounts: ReadonlyArray<{ accountType: AccountType; label: string }>;
  /** ISO day in Brussels — the default date, and the latest one allowed. */
  today: string;
};

/**
 * « Argent reçu »: one button, one short sheet — how much, when (today by
 * default), on which account, as what (the month's income or on top of it),
 * and an optional description. The written line then shows on its account,
 * with « Annuler » and, once cancelled, « Rétablir ».
 *
 * It never touches `accounts.balance` (voie A, 2026-09-21): the cockpit's
 * « Il te reste » must read the same before and after.
 */
export function IncomeButton({ accounts, today }: IncomeButtonProps) {
  const t = useTranslations('operations.income');
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>(
    accounts[0]?.accountType ?? 'income_bills',
  );
  const [nature, setNature] = useState<Nature>('regular');
  const [description, setDescription] = useState('');

  function close() {
    setOpen(false);
    setAccountType(accounts[0]?.accountType ?? 'income_bills');
    setNature('regular');
    setDescription('');
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
          allowNegative={false}
          successMessage={t('saved')}
          extraFields={
            <>
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
              ...(description.trim() ? { description: description.trim() } : {}),
            })
          }
        />
      ) : null}
    </>
  );
}
