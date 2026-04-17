'use client';

import { useState, useTransition } from 'react';

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
import { completeOnboardingAction } from '@/lib/actions/onboarding';

type FirstCharge = {
  label: string;
  amount: string;
  frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  dueMonth: string;
};

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

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState('Mon espace');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [skipCharge, setSkipCharge] = useState(false);
  const [firstCharge, setFirstCharge] = useState<FirstCharge>({
    label: '',
    amount: '',
    frequency: 'monthly',
    dueMonth: '1',
  });

  function next() {
    setError(null);
    if (step === 1 && !workspaceName.trim()) {
      setError('Donne un nom à ton espace.');
      return;
    }
    if (step === 2) {
      const n = Number(monthlyIncome);
      if (!Number.isFinite(n) || n < 0) {
        setError('Renseigne un revenu valide (≥ 0).');
        return;
      }
    }
    setStep((s) => s + 1);
  }

  function submit() {
    setError(null);
    const payload = {
      workspaceName: workspaceName.trim(),
      monthlyIncome: Number(monthlyIncome),
      firstCharge: skipCharge
        ? null
        : firstCharge.label.trim() && Number(firstCharge.amount) >= 0
          ? {
              label: firstCharge.label.trim(),
              amount: Number(firstCharge.amount),
              frequency: firstCharge.frequency,
              dueMonth: Number(firstCharge.dueMonth),
            }
          : null,
    };

    startTransition(async () => {
      const result = await completeOnboardingAction(payload);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-2 w-10 rounded-full ${i <= step ? 'bg-(--color-brand-700)' : 'bg-(--color-border)'}`}
              aria-hidden
            />
          ))}
        </div>
        <CardTitle>
          {step === 1 && 'Nomme ton espace'}
          {step === 2 && 'Ton revenu mensuel net'}
          {step === 3 && 'Ta première charge (optionnel)'}
        </CardTitle>
        <CardDescription>
          {step === 1 && 'Tu pourras le modifier plus tard dans les paramètres.'}
          {step === 2 && 'Sert de base pour te suggérer les virements mensuels.'}
          {step === 3 && 'Ajoute un loyer, une assurance, un abonnement…'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === 1 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspaceName">Nom de l&apos;espace</Label>
            <Input
              id="workspaceName"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="monthlyIncome">Revenu mensuel net (€)</Label>
            <Input
              id="monthlyIncome"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={monthlyIncome}
              onChange={(e) => setMonthlyIncome(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {step === 3 && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chargeLabel">Libellé</Label>
              <Input
                id="chargeLabel"
                value={firstCharge.label}
                onChange={(e) => setFirstCharge({ ...firstCharge, label: e.target.value })}
                placeholder="Loyer, assurance auto…"
                disabled={skipCharge}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chargeAmount">Montant (€)</Label>
              <Input
                id="chargeAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={firstCharge.amount}
                onChange={(e) => setFirstCharge({ ...firstCharge, amount: e.target.value })}
                disabled={skipCharge}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="chargeFreq">Fréquence</Label>
                <Select
                  value={firstCharge.frequency}
                  onValueChange={(v) =>
                    setFirstCharge({ ...firstCharge, frequency: v as FirstCharge['frequency'] })
                  }
                  disabled={skipCharge}
                >
                  <SelectTrigger id="chargeFreq">
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
                <Label htmlFor="chargeMonth">Mois de référence</Label>
                <Select
                  value={firstCharge.dueMonth}
                  onValueChange={(v) => setFirstCharge({ ...firstCharge, dueMonth: v })}
                  disabled={skipCharge}
                >
                  <SelectTrigger id="chargeMonth">
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
            </div>
            <label className="flex items-center gap-2 text-sm text-(--color-muted-foreground)">
              <input
                type="checkbox"
                checked={skipCharge}
                onChange={(e) => setSkipCharge(e.target.checked)}
                className="h-4 w-4 rounded border-(--color-border)"
              />
              Je renseignerai mes charges plus tard
            </label>
          </>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-(--color-danger) bg-(--color-danger)/10 px-3 py-2 text-sm text-(--color-danger)"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || isPending}
          >
            Retour
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={next} disabled={isPending}>
              Continuer
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? 'Enregistrement…' : 'Terminer'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
