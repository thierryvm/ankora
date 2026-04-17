'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { createChargeAction, deleteChargeAction } from '@/lib/actions/charges';
import { formatFrequency, formatMoney, formatMonth } from '@/lib/format';

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

type RawCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: string;
  dueMonth: number;
  categoryId: string | null;
  isActive: boolean;
  notes: string | null;
};

export function ChargesClient({ charges }: { charges: RawCharge[] }) {
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'semiannual' | 'annual'>(
    'monthly',
  );
  const [dueMonth, setDueMonth] = useState('1');

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createChargeAction({
        label: label.trim(),
        amount: Number(amount),
        frequency,
        dueMonth: Number(dueMonth),
        categoryId: null,
        isActive: true,
        notes: null,
      });
      if (result.ok) {
        toast.success('Charge ajoutée');
        setLabel('');
        setAmount('');
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const result = await deleteChargeAction(id);
      if (result.ok) {
        toast.success('Charge supprimée');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Mes charges</h1>
        <p className="mt-1 text-(--color-muted-foreground)">
          Chaque charge est lissée automatiquement sur 12 mois.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter une charge</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="label">Libellé</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">Montant (€)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="frequency">Fréquence</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                <SelectTrigger id="frequency">
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
              <Label htmlFor="dueMonth">Mois de référence</Label>
              <Select value={dueMonth} onValueChange={setDueMonth}>
                <SelectTrigger id="dueMonth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((name, idx) => (
                    <SelectItem key={name} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={isPending}>
                <Plus className="h-4 w-4" />
                {isPending ? 'Ajout…' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {charges.length} charge{charges.length > 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <p className="text-sm text-(--color-muted-foreground)">
              Aucune charge pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y divide-(--color-border)">
              {charges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.label}</p>
                    <p className="text-xs text-(--color-muted-foreground)">
                      {formatFrequency(c.frequency)} · ref. {formatMonth(c.dueMonth)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm tabular-nums">{formatMoney(c.amount)}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(c.id)}
                    disabled={isPending}
                    aria-label={`Supprimer ${c.label}`}
                  >
                    <Trash2 className="h-4 w-4 text-(--color-danger)" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
