'use client';

import { useState, useTransition } from 'react';
import { Landmark, PiggyBank, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  updateAccountBalanceAction,
  updateMonthlyIncomeAction,
  updateVieCouranteTransferAction,
} from '@/lib/actions/accounts';
import { ACCOUNT_KIND_I18N_KEY, type AccountKind } from '@/lib/schemas/account';
import { formatMoney } from '@/lib/format';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

type AccountRow = { kind: AccountKind; label: string; balance: number };

type Props = {
  monthlyIncome: number | null;
  vieCouranteMonthlyTransfer: number | null;
  accounts: AccountRow[];
};

const ACCOUNT_ICONS: Record<AccountKind, typeof Landmark> = {
  principal: Landmark,
  vie_courante: Wallet,
  epargne: PiggyBank,
};

const ACCOUNT_ORDER: AccountKind[] = ['principal', 'vie_courante', 'epargne'];

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function AccountsClient({ monthlyIncome, vieCouranteMonthlyTransfer, accounts }: Props) {
  const t = useTranslations('app.accounts');
  const accountByKind = new Map<AccountKind, AccountRow>(accounts.map((a) => [a.kind, a]));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="mt-1 text-(--color-muted-foreground)">{t('subtitle')}</p>
      </header>

      <MonthlyIncomeCard initialValue={monthlyIncome} />
      <VieCouranteTransferCard initialValue={vieCouranteMonthlyTransfer} />

      <section aria-labelledby="soldes-heading" className="flex flex-col gap-4">
        <h2 id="soldes-heading" className="text-xl font-semibold">
          {t('balancesHeading')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {ACCOUNT_ORDER.map((kind) => {
            const row = accountByKind.get(kind);
            if (!row) return null;
            return <AccountBalanceCard key={kind} row={row} />;
          })}
        </div>
      </section>
    </div>
  );
}

function MonthlyIncomeCard({ initialValue }: { initialValue: number | null }) {
  const t = useTranslations('app.accounts');
  const tIncome = useTranslations('app.accounts.income');
  const translateError = useActionErrorTranslator();
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
    startTransition(async () => {
      const result = await updateMonthlyIncomeAction({ monthlyIncome: amount });
      if (result.ok) toast.success(tIncome('toastSaved'));
      else toast.error(translateError(result.errorCode));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tIncome('title')}</CardTitle>
        <CardDescription>{tIncome('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="monthly-income">{t('amountLabel')}</Label>
            <Input
              id="monthly-income"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={tIncome('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('saving') : t('saveButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function VieCouranteTransferCard({ initialValue }: { initialValue: number | null }) {
  const t = useTranslations('app.accounts');
  const tTransfer = useTranslations('app.accounts.transfer');
  const translateError = useActionErrorTranslator();
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
    startTransition(async () => {
      const result = await updateVieCouranteTransferAction({ amount });
      if (result.ok) toast.success(tTransfer('toastSaved'));
      else toast.error(translateError(result.errorCode));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tTransfer('title')}</CardTitle>
        <CardDescription>{tTransfer('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="vie-transfer">{t('amountLabel')}</Label>
            <Input
              id="vie-transfer"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={tTransfer('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('saving') : t('saveButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountBalanceCard({ row }: { row: AccountRow }) {
  const t = useTranslations('app.accounts');
  const tBalance = useTranslations('app.accounts.balance');
  const tKind = useTranslations('app.accounts.kind');
  const translateError = useActionErrorTranslator();
  const Icon = ACCOUNT_ICONS[row.kind];
  const [value, setValue] = useState(String(row.balance));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
    if (amount === null) {
      toast.error(tBalance('invalidAmount'));
      return;
    }
    startTransition(async () => {
      const result = await updateAccountBalanceAction({ kind: row.kind, balance: amount });
      if (result.ok) toast.success(tBalance('toastSaved', { name: row.label }));
      else toast.error(translateError(result.errorCode));
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-(--color-brand-700)">
          <Icon className="h-5 w-5" aria-hidden />
          <CardTitle className="text-sm font-medium">{row.label}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {tKind(`${ACCOUNT_KIND_I18N_KEY[row.kind]}.description`)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-2xl font-bold tabular-nums">{formatMoney(row.balance)}</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Label htmlFor={`balance-${row.kind}`} className="sr-only">
            {tBalance('srLabel', { label: row.label })}
          </Label>
          <Input
            id={`balance-${row.kind}`}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {isPending ? t('saving') : tBalance('saveLabel')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
