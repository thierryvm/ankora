'use client';

import { useState, useTransition } from 'react';
import { Landmark, PiggyBank, Wallet } from 'lucide-react';

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
import { ACCOUNT_KIND_DESCRIPTIONS, type AccountKind } from '@/lib/schemas/account';
import { formatMoney } from '@/lib/format';

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
  const accountByKind = new Map<AccountKind, AccountRow>(accounts.map((a) => [a.kind, a]));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Mes comptes</h1>
        <p className="mt-1 text-(--color-muted-foreground)">
          Saisis tes soldes réels pour qu&apos;Ankora calcule précisément ton virement intelligent
          chaque mois.
        </p>
      </header>

      <MonthlyIncomeCard initialValue={monthlyIncome} />
      <VieCouranteTransferCard initialValue={vieCouranteMonthlyTransfer} />

      <section aria-labelledby="soldes-heading" className="flex flex-col gap-4">
        <h2 id="soldes-heading" className="text-xl font-semibold">
          Soldes actuels
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
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
    startTransition(async () => {
      const result = await updateMonthlyIncomeAction({ monthlyIncome: amount });
      if (result.ok) toast.success('Revenu mensuel mis à jour');
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenu mensuel net</CardTitle>
        <CardDescription>
          Le salaire qui arrive chaque mois sur ton compte Principal. Sert à calculer ce qu&apos;il
          te reste après les charges et le virement vers Vie Courante.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="monthly-income">Montant (€)</Label>
            <Input
              id="monthly-income"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Ex. 2500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function VieCouranteTransferCard({ initialValue }: { initialValue: number | null }) {
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
    startTransition(async () => {
      const result = await updateVieCouranteTransferAction({ amount });
      if (result.ok) toast.success('Virement mensuel mis à jour');
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virement mensuel vers Vie Courante</CardTitle>
        <CardDescription>
          Somme fixe transférée chaque mois du Principal vers ton compte Vie Courante. C&apos;est ce
          qui servira aux courses, à l&apos;essence et aux restos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="vie-transfer">Montant (€)</Label>
            <Input
              id="vie-transfer"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="Ex. 500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountBalanceCard({ row }: { row: AccountRow }) {
  const Icon = ACCOUNT_ICONS[row.kind];
  const [value, setValue] = useState(String(row.balance));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
    if (amount === null) {
      toast.error('Entre un montant valide.');
      return;
    }
    startTransition(async () => {
      const result = await updateAccountBalanceAction({ kind: row.kind, balance: amount });
      if (result.ok) toast.success(`${row.label} mis à jour`);
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-(--color-brand-700)">
          <Icon className="h-5 w-5" aria-hidden />
          <CardTitle className="text-sm font-medium">{row.label}</CardTitle>
        </div>
        <CardDescription className="text-xs">{ACCOUNT_KIND_DESCRIPTIONS[row.kind]}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-2xl font-bold tabular-nums">{formatMoney(row.balance)}</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Label htmlFor={`balance-${row.kind}`} className="sr-only">
            Solde actuel de {row.label}
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
            {isPending ? 'Enregistrement…' : 'Mettre à jour'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
