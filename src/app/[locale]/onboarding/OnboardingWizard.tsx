'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

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
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
type FirstCharge = {
  label: string;
  amount: string;
  frequency: Frequency;
  dueMonth: string;
};

const FREQUENCIES: readonly Frequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function OnboardingWizard() {
  const t = useTranslations('onboarding');
  const tStep1 = useTranslations('onboarding.step1');
  const tStep2 = useTranslations('onboarding.step2');
  const tStep3 = useTranslations('onboarding.step3');
  const tValidation = useTranslations('onboarding.validation');
  const tFreq = useTranslations('common.frequency');
  const tMonths = useTranslations('common.months');
  const translateError = useActionErrorTranslator();

  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState(t('defaultWorkspaceName'));
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
      setError(tValidation('workspaceNameRequired'));
      return;
    }
    if (step === 2) {
      const n = Number(monthlyIncome);
      if (!Number.isFinite(n) || n < 0) {
        setError(tValidation('incomeInvalid'));
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
      if (!result.ok) setError(translateError(result.errorCode));
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-2 w-10 rounded-full ${i <= step ? 'bg-brand-700' : 'bg-border'}`}
              aria-hidden
            />
          ))}
        </div>
        <CardTitle>
          {step === 1 && tStep1('title')}
          {step === 2 && tStep2('title')}
          {step === 3 && tStep3('title')}
        </CardTitle>
        <CardDescription>
          {step === 1 && tStep1('description')}
          {step === 2 && tStep2('description')}
          {step === 3 && tStep3('description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === 1 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspaceName">{tStep1('nameLabel')}</Label>
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
            <Label htmlFor="monthlyIncome">{tStep2('incomeLabel')}</Label>
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
              <Label htmlFor="chargeLabel">{tStep3('labelLabel')}</Label>
              <Input
                id="chargeLabel"
                value={firstCharge.label}
                onChange={(e) => setFirstCharge({ ...firstCharge, label: e.target.value })}
                placeholder={tStep3('labelPlaceholder')}
                disabled={skipCharge}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="chargeAmount">{tStep3('amountLabel')}</Label>
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
                <Label htmlFor="chargeFreq">{tStep3('frequencyLabel')}</Label>
                <Select
                  value={firstCharge.frequency}
                  onValueChange={(v) =>
                    setFirstCharge({ ...firstCharge, frequency: v as Frequency })
                  }
                  disabled={skipCharge}
                >
                  <SelectTrigger id="chargeFreq">
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
                <Label htmlFor="chargeMonth">{tStep3('dueMonthLabel')}</Label>
                <Select
                  value={firstCharge.dueMonth}
                  onValueChange={(v) => setFirstCharge({ ...firstCharge, dueMonth: v })}
                  disabled={skipCharge}
                >
                  <SelectTrigger id="chargeMonth">
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
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipCharge}
                onChange={(e) => setSkipCharge(e.target.checked)}
                className="border-border h-4 w-4 rounded"
              />
              {tStep3('skipLater')}
            </label>
          </>
        )}

        {error && (
          <div
            role="alert"
            className="border-danger bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
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
            {t('previous')}
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={next} disabled={isPending}>
              {t('next')}
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? t('finishing') : t('finish')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
