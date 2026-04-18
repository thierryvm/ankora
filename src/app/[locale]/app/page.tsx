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
  Wallet,
} from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Budget, Provision, Transfer, money } from '@/lib/domain';
import type { AccountKind } from '@/lib/domain/types';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';

const ACCOUNT_ICONS: Record<AccountKind, typeof Landmark> = {
  principal: Landmark,
  vie_courante: Wallet,
  epargne: PiggyBank,
};

const ACCOUNT_ORDER: AccountKind[] = ['principal', 'vie_courante', 'epargne'];

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
      ? 'text-(--color-success)'
      : health.status === 'warning'
        ? 'text-(--color-warning)'
        : 'text-(--color-danger)';

  const healthLabel =
    health.status === 'healthy'
      ? t('healthHealthy')
      : health.status === 'warning'
        ? t('healthWarning')
        : t('healthCritical');

  const hasCharges = snapshot.charges.length > 0;

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
  const accountByKind = new Map(snapshot.accounts.map((a) => [a.kind, a]));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-(--color-muted-foreground)">{snapshot.workspaceName}</p>
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
              <div className="flex items-center gap-2 text-(--color-brand-700)">
                <PiggyBank className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">{t('kpiProvisionsMonthly')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{fmtMoney(provisionTarget)}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">
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
              <p className="mt-1 text-xs text-(--color-muted-foreground)">
                {t('kpiHealthTargetHint', { amount: fmtMoney(health.target) })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-(--color-brand-700)">
                <ArrowRightLeft className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">{t('kpiSuggestedTransfer')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{fmtMoney(suggestedTransfer)}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">
                {suggestedTransfer.gte(0)
                  ? t('kpiSuggestedTransferToSavings')
                  : t('kpiSuggestedTransferFromSavings')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-(--color-accent-600)">
                <Receipt className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">
                  {t('kpiBillsMonth', { month: monthLabel })}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{fmtMoney(billsDue)}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">{t('kpiBillsHint')}</p>
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
              <p className="text-sm text-(--color-muted-foreground)">{t('planDescription')}</p>
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
                  <div className="flex items-center gap-2 text-(--color-brand-700)">
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
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
                    {t('transferVieCouranteHint')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-(--color-brand-700)">
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
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
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
                      plan.netPrincipalAfterPlan.gte(0)
                        ? 'text-(--color-success)'
                        : 'text-(--color-danger)'
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
                      plan.netPrincipalAfterPlan.gte(0)
                        ? 'text-(--color-success)'
                        : 'text-(--color-danger)'
                    }`}
                  >
                    {fmtMoney(plan.netPrincipalAfterPlan)}
                  </p>
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
                    {t('transferPrincipalRemainingHint', {
                      bills: fmtMoney(plan.principalBillsDue),
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {ACCOUNT_ORDER.map((kind) => {
              const account = accountByKind.get(kind);
              const Icon = ACCOUNT_ICONS[kind];
              return (
                <Card key={kind}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2 text-(--color-muted-foreground)">
                      <Icon className="h-4 w-4" aria-hidden />
                      <CardTitle className="text-xs font-medium tracking-wide uppercase">
                        {account?.label ?? kind}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-semibold tabular-nums">
                      {fmtMoney(money(account?.balance ?? 0))}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
