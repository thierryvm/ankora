import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Landmark,
  PiggyBank,
  Receipt,
  Shield,
} from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountCard } from '@/components/features/AccountCard';
import { Budget, Expenses, Provision, Transfer, money } from '@/lib/domain';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
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

  const provisionTarget = Budget.monthlyProvisionTotal(snapshot.charges);
  const billsDue = Budget.billsDueInMonth(snapshot.charges, currentMonth);
  const suggestedTransfer = Budget.suggestedTransfer(snapshot.charges, currentMonth);
  const annualTotal = Budget.annualTotal(snapshot.charges);

  const health = Provision.assessHealth(
    snapshot.charges,
    money(snapshot.savingsBalance),
    snapshot.monthsTracked,
  );

  const healthColor =
    health.status === 'healthy'
      ? 'text-success'
      : health.status === 'warning'
        ? 'text-warning'
        : 'text-danger';

  const healthLabel =
    health.status === 'healthy'
      ? t('healthHealthy')
      : health.status === 'warning'
        ? t('healthWarning')
        : t('healthCritical');

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

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-muted-foreground text-sm">{snapshot.workspaceName}</p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t('headerTitle', { month: monthLabel })}
        </h1>
      </header>

      {!hasCharges ? (
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="text-brand-700 flex items-center gap-2">
                <PiggyBank className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">{t('kpiProvisionsMonthly')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{fmtMoney(provisionTarget)}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('kpiProvisionsAnnualHint', { amount: fmtMoney(annualTotal) })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className={`flex items-center gap-2 ${healthColor}`}>
                <Shield className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">{t('kpiHealth')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${healthColor}`}>{healthLabel}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('kpiHealthTargetHint', { amount: fmtMoney(health.target) })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="text-brand-700 flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">{t('kpiSuggestedTransfer')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{fmtMoney(suggestedTransfer)}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {suggestedTransfer.gte(0)
                  ? t('kpiSuggestedTransferToSavings')
                  : t('kpiSuggestedTransferFromSavings')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="text-accent-600 flex items-center gap-2">
                <Receipt className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">
                  {t('kpiBillsMonth', { month: monthLabel })}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{fmtMoney(billsDue)}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t('kpiBillsHint')}</p>
            </CardContent>
          </Card>
        </div>
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

          <div className="grid gap-4 md:grid-cols-3">
            {ACCOUNT_TYPE_ORDER.map((accountType) => {
              const account = accountByType.get(accountType);
              if (!account) return null;
              return (
                <AccountCard
                  key={accountType}
                  accountType={accountType}
                  displayName={account.displayName}
                  balance={account.balance}
                  locale={locale}
                />
              );
            })}
          </div>
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
        <Button asChild variant="outline" size="lg">
          <Link href="/app/simulator">{t('ctaSimulator')}</Link>
        </Button>
      </div>
    </div>
  );
}
