'use client';

import { useMemo, useState } from 'react';

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
import { Simulation, money, type Charge, type ChargePaidFrom } from '@/lib/domain';
import { formatMoney } from '@/lib/format';

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

export function SimulatorClient({ charges }: { charges: RawCharge[] }) {
  const [mode, setMode] = useState<Mode>('cancel');
  const [chargeId, setChargeId] = useState<string>(charges[0]?.id ?? '');
  const [newAmount, setNewAmount] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newFrequency, setNewFrequency] = useState<
    'monthly' | 'quarterly' | 'semiannual' | 'annual'
  >('monthly');
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
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Simulateur</h1>
        <p className="mt-1 text-(--color-muted-foreground)">
          Mesure l&apos;impact d&apos;un changement sans toucher à tes données réelles.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Scénario</CardTitle>
          <CardDescription>Choisis une action à simuler.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'cancel', label: 'Annuler une charge' },
                { key: 'negotiate', label: 'Renégocier' },
                { key: 'add', label: 'Ajouter une charge' },
              ] as const
            ).map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant={mode === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {(mode === 'cancel' || mode === 'negotiate') && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="chargeId">Charge</Label>
              <Select value={chargeId} onValueChange={setChargeId}>
                <SelectTrigger id="chargeId">
                  <SelectValue placeholder="Sélectionne…" />
                </SelectTrigger>
                <SelectContent>
                  {charges.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label} — {formatMoney(c.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'negotiate' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="newAmount">Nouveau montant (€)</Label>
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
                <Label htmlFor="newLabel">Libellé</Label>
                <Input
                  id="newLabel"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="newAmountAdd">Montant (€)</Label>
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
                  <Label htmlFor="newFrequency">Fréquence</Label>
                  <Select
                    value={newFrequency}
                    onValueChange={(v) => setNewFrequency(v as typeof newFrequency)}
                  >
                    <SelectTrigger id="newFrequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensuelle</SelectItem>
                      <SelectItem value="quarterly">Trimestrielle</SelectItem>
                      <SelectItem value="semiannual">Semestrielle</SelectItem>
                      <SelectItem value="annual">Annuelle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="newDueMonth">Mois</Label>
                  <Select value={newDueMonth} onValueChange={setNewDueMonth}>
                    <SelectTrigger id="newDueMonth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m}
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
          <CardTitle>Impact</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? (
            <p className="text-sm text-(--color-muted-foreground)">
              Complète le scénario pour voir l&apos;impact.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-(--color-muted-foreground)">Actuel / mois</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatMoney(result.currentMonthlyProvision)}
                </p>
              </div>
              <div>
                <p className="text-xs text-(--color-muted-foreground)">Projeté / mois</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatMoney(result.projectedMonthlyProvision)}
                </p>
              </div>
              <div>
                <p className="text-xs text-(--color-muted-foreground)">Économie annuelle</p>
                <p
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    deltaPositive ? 'text-(--color-success)' : 'text-(--color-danger)'
                  }`}
                >
                  {formatMoney(result.annualDelta)}
                </p>
                <p className="mt-1 text-xs text-(--color-muted-foreground)">
                  {result.changePercent > 0 ? '+' : ''}
                  {result.changePercent}% / mois
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
