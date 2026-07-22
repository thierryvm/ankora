'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Minus, TrendingDown, TrendingUp } from 'lucide-react';

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
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { Simulation, money, type Charge, type ChargePaidFrom } from '@/lib/domain';
import { formatCurrency } from '@/lib/i18n/formatters';

import { SimulatorProjection } from './SimulatorProjection';

export type RawCharge = {
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

/**
 * @param hideHeader  Suppress the page `<header>` (h1 + subtitle) when the
 *   simulator is rendered inside the dashboard drawer (THI-195). The drawer
 *   supplies its own `<h2>` header, so rendering the `<h1>` here would create
 *   a duplicate top-level heading. Defaults to `false` so the standalone
 *   `/app/simulator` route keeps its full header untouched.
 */
export function SimulatorClient({
  charges,
  revenus,
  engagementsMensuels = 0,
  hideHeader = false,
}: {
  charges: RawCharge[];
  /**
   * Monthly income as a raw `number` — drives the "Reste disponible" (réserve
   * libre) framing. MUST stay a plain number: a `Decimal` loses its prototype
   * crossing the RSC server→client boundary (`.lte`/`.minus` become undefined →
   * runtime crash). It is re-wrapped with `money()` inside the client, exactly
   * like `domainCharges` does with `money(c.amount)`.
   */
  revenus: number;
  /**
   * Smoothed monthly burden of the active commitments (ADR-021), as a raw
   * `number` (same RSC-boundary rule as `revenus`). Subtracted from the "Reste
   * disponible" baseline so the simulator matches the dashboard hero instead of
   * drifting by this amount whenever a debt is running. Defaults to 0.
   */
  engagementsMensuels?: number;
  hideHeader?: boolean;
}) {
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
  // THI-195 (Q3): no auto-selection. A guided empty placeholder ("Choisis une
  // charge…") avoids defaulting onto rent/tax (the audit's broken default) and
  // stays FSMA-neutral — we never pre-pick what the user should cut.
  const [chargeId, setChargeId] = useState<string>('');
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
        // The simulator client receives the trimmed `SimulatorCharge` shape
        // from the server boundary (no schedule fields). For simulation
        // arithmetic only `frequency`, `dueMonth` and `amount` matter, so
        // we project a best-effort default for `paymentMonths` / `paymentDay`
        // here. THI-192 will revisit the boundary if the simulator ever
        // surfaces J-X bucketing.
        paymentMonths: [c.dueMonth],
        paymentDay: 1,
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
        // Same projection as the existing-charges branch above — the
        // simulator UI does not yet capture per-charge schedule precision.
        paymentMonths: [Number(newDueMonth)],
        paymentDay: 1,
        categoryId: null,
        isActive: true,
        paidFrom: newFrequency === 'monthly' ? 'principal' : 'epargne',
      },
    });
  }, [mode, chargeId, newAmount, newLabel, newFrequency, newDueMonth, domainCharges]);

  // THI-195: reframe the impact on "Reste disponible" (réserve libre =
  // revenus − effort lissé), the cockpit hero metric — not on raw effort.
  // Re-wrap `revenus` (a raw number across the RSC boundary) into a Decimal
  // here, mirroring `domainCharges`. Never let a Decimal cross the boundary.
  const revenusMoney = money(revenus);
  // ADR-021: deduct the smoothed commitments burden so the simulator's "Actuel"
  // reste disponible matches the hero's (which already deducts it).
  const engagementsMoney = money(engagementsMensuels);
  const reserveView = result
    ? Simulation.resteDisponibleView(revenusMoney, result, engagementsMoney)
    : null;
  const deltaPositive = result?.monthlyDelta.gt(0);
  // Income not configured (e.g. the standalone /app/simulator route has no
  // `missingSetup` guard): a "Reste disponible" computed from revenus = 0 is
  // misleading, so we surface a setup hint instead.
  const incomeMissing = revenusMoney.lte(0);

  // Adaptive impact tone (gain / loss / neutral) driving the header icon +
  // pedagogical takeaway. `result` is null until a scenario is picked.
  const impactTone: 'gain' | 'loss' | 'neutral' = !result
    ? 'neutral'
    : result.monthlyDelta.gt(0)
      ? 'gain'
      : result.monthlyDelta.lt(0)
        ? 'loss'
        : 'neutral';
  const ImpactIcon =
    impactTone === 'gain' ? TrendingUp : impactTone === 'loss' ? TrendingDown : Minus;
  const impactIconClass =
    impactTone === 'gain'
      ? 'text-success'
      : impactTone === 'loss'
        ? 'text-danger'
        : 'text-muted-foreground';
  const impactIconBg =
    impactTone === 'gain'
      ? 'bg-success/10'
      : impactTone === 'loss'
        ? 'bg-danger/10'
        : 'bg-surface-muted';

  return (
    <div className="flex flex-col gap-6">
      {!hideHeader && (
        <header>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </header>
      )}

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
                className="min-h-11"
                onClick={() => setMode(key)}
                // PR-D5 a11y: announce active state to AT (visual cue is
                // variant-only otherwise — silent for VoiceOver/NVDA).
                aria-pressed={mode === key}
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
              <p className="text-muted-foreground text-xs">{tFields('chargeExample')}</p>
            </div>
          )}

          {mode === 'negotiate' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="newAmount">{tFields('newAmount')}</Label>
              <Input
                id="newAmount"
                type="number"
                autoComplete="off"
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
                  autoComplete="off"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="newAmountAdd">{tFields('amount')}</Label>
                <Input
                  id="newAmountAdd"
                  type="number"
                  autoComplete="off"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                />
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-3">
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
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${impactIconBg}`}
            >
              <ImpactIcon aria-hidden strokeWidth={1.75} className={`h-4 w-4 ${impactIconClass}`} />
            </span>
            <CardTitle>{tImpact('title')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* `!reserveView` also narrows the type for the else branch; it is
              null iff `!result`, so this never adds a reachable extra path. */}
          {!result || !reserveView ? (
            <p className="text-muted-foreground text-sm">{tImpact('empty')}</p>
          ) : incomeMissing ? (
            // Income not configured → "Reste disponible" would be misleading.
            // Show the annual saving only + a setup CTA.
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-muted-foreground text-xs">{tImpact('annualSavings')}</p>
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    deltaPositive ? 'text-success' : 'text-danger'
                  }`}
                  data-testid="simulator-annual-savings"
                >
                  {fmtMoney(result.annualDelta)}
                </p>
              </div>
              <p className="text-muted-foreground text-sm">{tImpact('incomeHint')}</p>
              {/* min-h-11 lifts the tap target to 44px (WCAG 2.5.8) — `sm` is 36px. */}
              <Button asChild variant="outline" size="sm" className="min-h-11 self-start px-4">
                <Link href="/app/accounts">{tImpact('incomeHintCta')}</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Hero — Reste disponible (réserve libre) actuel → projeté.
                  Same metric + wording as the dashboard SituationDuMoisHero
                  "Reste disponible" line (anchoring, audit §2). */}
              <div>
                <p className="text-muted-foreground text-xs">{tImpact('resteDisponible')}</p>
                <p
                  className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-bold tabular-nums"
                  data-testid="simulator-reserve"
                >
                  {/* Screen readers get one clean "de X à Y par mois" utterance;
                      the visual "X → Y" sequence is aria-hidden (the bare arrow
                      would otherwise be read as "flèche"). */}
                  <span className="sr-only">
                    {tImpact('resteDisponibleRange', {
                      from: fmtMoney(reserveView.current),
                      to: fmtMoney(reserveView.projected),
                    })}
                  </span>
                  <span aria-hidden>{fmtMoney(reserveView.current)}</span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span aria-hidden className={deltaPositive ? 'text-success' : 'text-danger'}>
                    {fmtMoney(reserveView.projected)}
                  </span>
                  <span aria-hidden className="text-muted-foreground text-xs font-normal">
                    {tImpact('perMonth')}
                  </span>
                </p>
              </div>

              {/* Secondary — annual saving. */}
              <div>
                <p className="text-muted-foreground text-xs">{tImpact('annualSavings')}</p>
                <p
                  className={`mt-1 text-lg font-semibold tabular-nums ${
                    deltaPositive ? 'text-success' : 'text-danger'
                  }`}
                  data-testid="simulator-annual-savings"
                >
                  {fmtMoney(result.annualDelta)}
                </p>
              </div>

              {/* 6-month comparative projection (baseline vs scenario) + human
                  cumul sentence. Self-suppresses when monthlyDelta == 0. */}
              <SimulatorProjection
                monthlyDelta={result.monthlyDelta}
                baseline={reserveView.current}
                fmtMoney={fmtMoney}
              />

              {/* Adaptive pedagogical takeaway (R-06: never culpabilising). */}
              {impactTone !== 'neutral' && (
                <div
                  className={`flex items-start gap-2.5 rounded-lg p-3 ${impactTone === 'gain' ? 'bg-success/10' : 'bg-danger/10'}`}
                  data-testid="simulator-pedago"
                >
                  {impactTone === 'gain' ? (
                    <CheckCircle2
                      aria-hidden
                      strokeWidth={1.75}
                      className="text-success mt-0.5 h-5 w-5 shrink-0"
                    />
                  ) : (
                    <AlertCircle
                      aria-hidden
                      strokeWidth={1.75}
                      className="text-danger mt-0.5 h-5 w-5 shrink-0"
                    />
                  )}
                  <p className="text-foreground text-sm leading-relaxed">
                    <span className="font-semibold">
                      {impactTone === 'gain'
                        ? tImpact('pedago.gainTitle')
                        : tImpact('pedago.lossTitle')}
                    </span>{' '}
                    {impactTone === 'gain'
                      ? tImpact('pedago.gainBody')
                      : tImpact('pedago.lossBody')}
                  </p>
                </div>
              )}

              {/* Anchor — demoted effort-lissé sub-text (== dashboard "Effort lissé"). */}
              <p className="text-muted-foreground border-border border-t pt-3 text-xs">
                {tImpact('effortAnchor', {
                  current: fmtMoney(result.currentMonthlyProvision),
                  projected: fmtMoney(result.projectedMonthlyProvision),
                })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
