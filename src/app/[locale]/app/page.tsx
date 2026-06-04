import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Landmark } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountCard } from '@/components/features/AccountCard';
import { SituationDuMoisHero } from '@/components/dashboard/SituationDuMoisHero';
import { ProvisionHealthGaugeCard } from '@/components/dashboard/ProvisionHealthGaugeCard';
import { ProchainesFacturesCard } from '@/components/dashboard/ProchainesFacturesCard';
import { SimulatorDrawer } from '@/components/dashboard/SimulatorDrawer';
import { Expenses, Transfer, money } from '@/lib/domain';
import { calculerSituationDuMois, paymentKey, type PaymentLedger } from '@/lib/domain/cockpit';
import { getWorkspaceSnapshot, toCockpitCharges } from '@/lib/data/workspace-snapshot';
import type { AccountType } from '@/lib/schemas/account';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatDate, formatMonth } from '@/lib/i18n/formatters';

/**
 * Render order for the typed account cards in the cockpit Bloc 1.
 * Matches the canonical spec dashboard-cockpit-vraie-vision-2026-05-03.md:
 *   1. income_bills (where salary lands)
 *   2. provisions (savings buffer)
 *   3. daily_card (daily-spending pot)
 */
const ACCOUNT_TYPE_ORDER: readonly AccountType[] = ['income_bills', 'provisions', 'daily_card'];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.dashboard');
  return { title: t('metaTitle') };
}

export default async function DashboardPage() {
  const t = await getTranslations('app.dashboard');
  const locale = (await getLocale()) as Locale;
  const snapshot = await getWorkspaceSnapshot();
  const currentMonth = new Date().getMonth() + 1;
  const monthLabel = formatMonth(currentMonth, locale);
  const fmtMoney = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const hasCharges = snapshot.charges.length > 0;

  const monthlyExpenseTotal = Expenses.totalAmount(snapshot.monthlyExpenses);
  const latestMonthlyExpenses = Expenses.latestExpenses(snapshot.monthlyExpenses, 5);
  const monthlyExpenseCount = snapshot.monthlyExpenses.length;

  const monthlyIncome = money(snapshot.monthlyIncome ?? 0);
  const vieCouranteTransferAmount = money(snapshot.vieCouranteMonthlyTransfer ?? 0);
  const plan = Transfer.computeMonthlyTransferPlan({
    charges: snapshot.charges,
    month: currentMonth,
    monthlyIncome,
    vieCouranteMonthlyTransfer: vieCouranteTransferAmount,
  });
  const epargneNetAbs = plan.epargneTransferNet.abs();
  const epargneGoesToEpargne = plan.epargneTransferNet.gte(0);
  const missingSetup =
    snapshot.monthlyIncome === null || snapshot.vieCouranteMonthlyTransfer === null;
  const accountByType = new Map(snapshot.accounts.map((a) => [a.accountType, a]));

  // PR-D3 — Bloc 2 hero radar inputs.
  const cockpitCharges = toCockpitCharges(snapshot.charges);

  // THI-192 — "Today" anchored to the canonical Europe/Brussels timezone so
  // J-7/J-14/J-30 bucketing matches the user's wall-clock perception (rather
  // than UTC, which drifts one day around midnight). `en-CA` formatter
  // outputs ISO `YYYY-MM-DD`.
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // THI-190 — Santé Provisions inputs (ADR-011). The PaymentLedger maps
  // `(chargeId, year, month) → true` for charges already settled this
  // period, so `calculerSanteProvisions()` knows which entries to skip in
  // its cycle math.
  const provisionsAccount = snapshot.accounts.find((a) => a.accountType === 'provisions');
  const soldeEpargneActuel = money(provisionsAccount?.balance ?? 0);
  const paymentsLedger: PaymentLedger = new Map(
    snapshot.currentMonthPayments.map((p) => [
      paymentKey(p.chargeId, p.periodYear, p.periodMonth),
      true,
    ]),
  );
  // Daily allowance not yet configured: surface the inline CTA on the
  // daily_card row so the user can complete the cockpit setup without
  // hunting through Settings.
  const dailyPlafondMissing =
    snapshot.vieCouranteMonthlyTransfer === null || snapshot.vieCouranteMonthlyTransfer === 0;
  const tDaily = await getTranslations('dashboard.daily');

  // THI-327 Phase 0 — unified "Situation du mois" hero. Reuses the same
  // cockpit primitives as the (now removed) Effort + Capacité cards.
  const situation = calculerSituationDuMois({
    // Distinct from `monthlyIncome` above (the Transfer plan coerces null→0).
    // The situation needs the genuine null to drive the THI-335 incomplet state.
    revenus: snapshot.monthlyIncome === null ? null : money(snapshot.monthlyIncome),
    charges: cockpitCharges,
    budgetVieCourante: money(snapshot.resteAVivre),
    soldeEpargneActuel,
    payments: paymentsLedger,
    ref: snapshot.currentPeriod,
  });

  // Days remaining in the current month (Europe/Brussels) for the "≈ X/jour"
  // living-budget hint. `currentPeriod` is, by the snapshot invariant
  // (workspace-snapshot derives it from `new Date()` in this same TZ), always
  // the current calendar month. We still guard defensively: if it ever
  // diverged, `joursRestants = 0` suppresses the per-day hint (the Hero treats
  // joursRestants <= 0 as "no per-day").
  const brusselsNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // "YYYY-MM-DD"
  const [bYear, bMonth, bDay] = brusselsNow.split('-').map(Number);
  const isCurrentPeriod =
    bYear === snapshot.currentPeriod.year && bMonth === snapshot.currentPeriod.month;
  const daysInMonth = new Date(
    snapshot.currentPeriod.year,
    snapshot.currentPeriod.month,
    0,
  ).getDate();
  const joursRestants = isCurrentPeriod ? Math.max(1, daysInMonth - (bDay ?? 1) + 1) : 0;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-muted-foreground text-sm">{snapshot.workspaceName}</p>
        <h1 id="dashboard-heading" className="text-3xl font-bold tracking-tight md:text-4xl">
          {t('headerTitle', { month: monthLabel })}
        </h1>
      </header>

      {/*
        THI-327 Phase 0 — unified "Situation du mois" hero (NORTH_STAR #1
        cashflow waterfall). Subsumes the former Effort + Capacité card pair
        into one calm narration: status + "Reste disponible" headline +
        allocation bar + waterfall flow + FSMA-safe nudge. The incomplet state
        guards the no-income case (THI-335).
      */}
      <section aria-labelledby="dashboard-heading">
        <SituationDuMoisHero
          statut={situation.statut}
          revenus={situation.revenus.toNumber()}
          chargesFixes={situation.chargesFixes.toNumber()}
          provisionsLissees={situation.provisionsLissees.toNumber()}
          resteDisponible={situation.resteDisponible.toNumber()}
          budgetVieCourante={situation.budgetVieCourante.toNumber()}
          capacite={situation.capacite.toNumber()}
          deficitEpargne={situation.deficitEpargne.toNumber()}
          rattrapageMensuel={situation.rattrapageMensuel.toNumber()}
          provisionsAJour={situation.provisionsAJour}
          joursRestants={joursRestants}
          currentMonthYYYYMM={`${snapshot.currentPeriod.year}-${String(snapshot.currentPeriod.month).padStart(2, '0')}`}
          locale={locale}
        />
      </section>

      {/*
        THI-190 — Santé des Provisions (cockpit v3 section #2 of 8).
        Answers "am I saving the right amount each month so periodic
        bills never catch me short?" — complements the hero radar which
        answers "what is my real monthly burden?". Always visible (even
        on an empty workspace) so the user sees the canonical narrative.
        Layout grid-cols-1 lg:grid-cols-3 mirrors the bloc 1 account row
        and keeps the card at ~1/3 width on desktop (the gauge is dense,
        not wide).
      */}
      <section aria-labelledby="provision-health-heading" className="grid grid-cols-1 gap-4">
        <h2 id="provision-health-heading" className="sr-only">
          {t('provisionHealthSectionHeading')}
        </h2>
        <ProvisionHealthGaugeCard
          charges={cockpitCharges}
          payments={paymentsLedger}
          soldeEpargneActuel={soldeEpargneActuel}
          period={snapshot.currentPeriod}
          locale={locale}
        />
      </section>

      {/*
        THI-192 — Prochaines factures (cockpit v3 section #5 of 8).
        Surfaces a 30-day horizon split into J-7 / J-14 / J-30 windows + a
        separate overdue bucket. Reuses `snapshot.charges` (now carrying the
        canonical `payment_months[]` + `payment_day` post-THI-192 debt fix)
        and the same `paymentsLedger` Map as section #2 so a settled bill
        for the current cycle never appears as overdue.
      */}
      <section aria-labelledby="upcoming-bills-heading" className="grid grid-cols-1 gap-4">
        <h2 id="upcoming-bills-heading" className="sr-only">
          {t('upcomingBillsSectionHeading')}
        </h2>
        <ProchainesFacturesCard
          charges={snapshot.charges}
          payments={paymentsLedger}
          todayIso={todayIso}
          locale={locale}
        />
      </section>

      {!hasCharges && (
        <Card>
          <CardHeader>
            <CardTitle>{t('emptyTitle')}</CardTitle>
            <CardDescription>{t('emptyDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/app/charges">{t('emptyCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/*
        PR-D3-bis layout — RÉALITÉ d'abord ("combien j'ai sur chaque compte"),
        plan ensuite ("combien je dois déplacer"). The 4 legacy KPI cards
        (provisions/health/suggestedTransfer/bills) shipped before Voie D
        are removed: they duplicate the Bloc 2 hero radar (Effort = same
        provisionsMonthly + billsMonth, Capacité = same suggestedTransfer
        intent) and Santé Provisions will be re-introduced enriched in
        PR-D5 (déficit + plan rattrapage 3 mois). Cf. handoff
        Athenaeum/.../2026-05-06-2230-feedback-post-pr-d3-dette-ux.md.
      */}
      {hasCharges && (
        <section aria-labelledby="accounts-heading" className="flex flex-col gap-4">
          <h2 id="accounts-heading" className="sr-only">
            {t('accountsHeading')}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {ACCOUNT_TYPE_ORDER.map((accountType) => {
              const account = accountByType.get(accountType);
              if (!account) return null;
              const extraHint =
                accountType === 'daily_card' && dailyPlafondMissing ? (
                  <Link
                    href="/app/accounts"
                    // PR-D5 a11y: underline permanent (was hover-only — invisible on iOS touch).
                    className="text-muted-foreground hover:text-brand-700 text-xs underline underline-offset-2"
                  >
                    {tDaily('cta_set_plafond')}
                  </Link>
                ) : undefined;
              return (
                <AccountCard
                  key={accountType}
                  accountType={accountType}
                  displayName={account.displayName}
                  balance={account.balance}
                  locale={locale}
                  extraHint={extraHint}
                />
              );
            })}
          </div>
        </section>
      )}

      {hasCharges && (
        <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 id="plan-heading" className="text-xl font-semibold">
                {t('planTitle', { month: monthLabel })}
              </h2>
              <p className="text-muted-foreground text-sm">{t('planDescription')}</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/accounts">{t('planAdjustAccounts')}</Link>
            </Button>
          </div>

          {missingSetup ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('missingSetupTitle')}</CardTitle>
                <CardDescription>{t('missingSetupDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/app/accounts">{t('missingSetupCta')}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <div className="text-brand-700 flex items-center gap-2">
                    <ArrowRightLeft className="h-5 w-5" aria-hidden />
                    <CardTitle className="text-sm font-medium">
                      {t('transferPrincipalToVieCourante')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">
                    {fmtMoney(plan.vieCouranteTransfer)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('transferVieCouranteHint')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="text-brand-700 flex items-center gap-2">
                    {epargneGoesToEpargne ? (
                      <ArrowUpRight className="h-5 w-5" aria-hidden />
                    ) : (
                      <ArrowDownLeft className="h-5 w-5" aria-hidden />
                    )}
                    <CardTitle className="text-sm font-medium">
                      {epargneGoesToEpargne
                        ? t('transferPrincipalToEpargne')
                        : t('transferEpargneToPrincipal')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{fmtMoney(epargneNetAbs)}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('transferEpargneHint', {
                      provision: fmtMoney(plan.epargneProvisionTarget),
                      bills: fmtMoney(plan.epargneBillsDue),
                    })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div
                    className={`flex items-center gap-2 ${
                      plan.netPrincipalAfterPlan.gte(0) ? 'text-success' : 'text-danger'
                    }`}
                  >
                    <Landmark className="h-5 w-5" aria-hidden />
                    <CardTitle className="text-sm font-medium">
                      {t('transferPrincipalRemaining')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      plan.netPrincipalAfterPlan.gte(0) ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {fmtMoney(plan.netPrincipalAfterPlan)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('transferPrincipalRemainingHint', {
                      bills: fmtMoney(plan.principalBillsDue),
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      )}

      {hasCharges && (
        <section aria-labelledby="expenses-heading" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle id="expenses-heading" className="text-xl">
                    {t('expensesTitle', { month: monthLabel })}
                  </CardTitle>
                  <CardDescription>
                    {t('expensesCount', { count: monthlyExpenseCount })}
                  </CardDescription>
                </div>
                <p className="shrink-0 text-2xl font-bold tabular-nums">
                  {fmtMoney(monthlyExpenseTotal)}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyExpenseCount === 0 ? (
                <p className="text-muted-foreground text-sm">{t('expensesEmpty')}</p>
              ) : (
                <>
                  <ul className="divide-border divide-y">
                    {latestMonthlyExpenses.map((expense) => (
                      <li key={expense.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{expense.label}</p>
                          <p className="text-muted-foreground text-xs">
                            {formatDate(expense.occurredOn, locale, 'short')}
                          </p>
                        </div>
                        <p className="text-muted-foreground shrink-0 font-mono text-sm tabular-nums">
                          {fmtMoney(expense.amount)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/app/expenses">{t('expensesViewAll')}</Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Button asChild variant="outline" size="lg">
          <Link href="/app/charges">{t('ctaCharges')}</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/app/expenses">{t('ctaExpenses')}</Link>
        </Button>
        {/* THI-195: opens the what-if simulator in a drawer in-page.
            The /app/simulator route is preserved as a fallback. */}
        {/* Pass income as a raw number — a Decimal can't cross the RSC
            boundary into the client drawer (it loses its prototype). */}
        <SimulatorDrawer charges={snapshot.rawCharges} revenus={snapshot.monthlyIncome ?? 0} />
      </div>
    </div>
  );
}
