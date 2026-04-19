'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Locale } from '@/i18n/routing';
import { Simulation, money, type Charge, type ChargePaidFrom } from '@/lib/domain';
import { formatCurrency } from '@/lib/i18n/formatters';

type RawCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  dueMonth: number;
  categoryId: string | null;
  isActive: boolean;
  paidFrom: ChargePaidFrom;
};

type Mode = 'cancel' | 'negotiate' | 'add';
type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const FREQUENCIES: readonly Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
const MODES: readonly Mode[] = ['cancel', 'negotiate', 'add'];

export function SimulatorClient({ charges }: { charges: RawCharge[] }) {
  const t = useTranslations('app.simulator');
  const locale = useLocale() as Locale;
  const fmtMoney = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);
  const tScenario = useTranslations('app.simulator.scenario');
  const tModes = useTranslations('app.simulator.scenario.modes');
  const tFields = useTranslations('app.simulator.fields');
  const tImpact = useTranslations('app.simulator.impact');
  const tFreq = useTranslations('common.frequency');
  const tMonths = useTranslations('common.months');

  const [mode, setMode] = useState<Mode>('cancel');
  const [chargeId, setChargeId] = useState<string>(charges[0]?.id ?? '');
  const [newAmount, setNewAmount] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newFrequency, setNewFrequency] = useState<Frequency>('monthly');
  const [newDueMonth, setNewDueMonth] = useState('1');

  const domainCharges = useMemo<Charge[]>(
    () =>
      charges.map((c) => ({
        id: c.id,
        label: c.label,
        amount: money(c.amount),
        frequency: c.frequency as Charge['frequency'],
        dueMonth: c.dueMonth,
        categoryId: c.categoryId,
        isActive: c.isActive,
        paidFrom: c.paidFrom,
      })),
    [charges],
  );

  const result = useMemo(() => {
    if (mode === 'cancel') {
      if (!chargeId) return null;
      return Simulation.simulate(domainCharges, { kind: 'cancel', chargeId });
    }
    if (mode === 'negotiate') {
      if (!chargeId) return null;
      const n = Number(newAmount);
      if (!Number.isFinite(n) || n < 0) return null;
      return Simulation.simulate(domainCharges, {
        kind: 'negotiate',
        chargeId,
        newAmount: money(n),
      });
    }
    const n = Number(newAmount);
    if (!newLabel.trim() || !Number.isFinite(n) || n < 0) return null;
    return Simulation.simulate(domainCharges, {
      kind: 'add',
      charge: {
        label: newLabel.trim(),
        amount: money(n),
        frequency: newFrequency,
        dueMonth: Number(newDueMonth),
        categoryId: null,
        isActive: true,
        paidFrom: newFrequency === 'monthly' ? 'principal' : 'epargne',
      },
    });
  }, [mode, chargeId, newAmount, newLabel, newFrequency, newDueMonth, domainCharges]);

  const deltaPositive = result?.monthlyDelta.gt(0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{tScenario('title')}</CardTitle>
          <CardDescription>{tScenario('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {MODES.map((key) => (
              <Button
                key={key}
                type="button"
                variant={mode === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(key)}
              >
                {tModes(key)}
              </Button>
            ))}
          </div>

          {(mode === 'cancel' || mode === 'negotiate') && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="chargeId">{tFields('charge')}</Label>
              <Select value={chargeId} onValueChange={setChargeId}>
                <SelectTrigger id="chargeId">
                  <SelectValue placeholder={tFields('chargePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {charges.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label} — {fmtMoney(c.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'negotiate' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="newAmount">{tFields('newAmount')}</Label>
              <Input
                id="newAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>
          )}

          {mode === 'add' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="newLabel">{tFields('label')}</Label>
                <Input
                  id="newLabel"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="newAmountAdd">{tFields('amount')}</Label>
                <Input
                  id="newAmountAdd"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="newFrequency">{tFields('frequency')}</Label>
                  <Select
                    value={newFrequency}
                    onValueChange={(v) => setNewFrequency(v as Frequency)}
                  >
                    <SelectTrigger id="newFrequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((key) => (
                        <SelectItem key={key} value={key}>
                          {tFreq(key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="newDueMonth">{tFields('month')}</Label>
                  <Select value={newDueMonth} onValueChange={setNewDueMonth}>
                    <SelectTrigger id="newDueMonth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {tMonths(String(m) as '1')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tImpact('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? (
            <p className="text-muted-foreground text-sm">{tImpact('empty')}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-xs">{tImpact('currentMonthly')}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {fmtMoney(result.currentMonthlyProvision)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{tImpact('projectedMonthly')}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {fmtMoney(result.projectedMonthlyProvision)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{tImpact('annualSavings')}</p>
                <p
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    deltaPositive ? 'text-success' : 'text-danger'
                  }`}
                >
                  {fmtMoney(result.annualDelta)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {tImpact('monthlyChange', {
                    sign: result.changePercent > 0 ? '+' : '',
                    percent: result.changePercent,
                  })}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
