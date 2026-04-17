import type { Metadata } from 'next';
import Link from 'next/link';
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

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Budget, Provision, Transfer, money } from '@/lib/domain';
import type { AccountKind } from '@/lib/domain/types';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { formatMoney, formatMonth } from '@/lib/format';

const ACCOUNT_ICONS: Record<AccountKind, typeof Landmark> = {
  principal: Landmark,
  vie_courante: Wallet,
  epargne: PiggyBank,
};

const ACCOUNT_ORDER: AccountKind[] = ['principal', 'vie_courante', 'epargne'];

export const metadata: Metadata = { title: 'Tableau de bord' };

export default async function DashboardPage() {
  const snapshot = await getWorkspaceSnapshot();
  const currentMonth = new Date().getMonth() + 1;

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
      ? 'Sain'
      : health.status === 'warning'
        ? 'À surveiller'
        : 'Critique';

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
          {formatMonth(currentMonth)} — ton cockpit
        </h1>
      </header>

      {!hasCharges ? (
        <Card>
          <CardHeader>
            <CardTitle>Commence par ajouter tes charges</CardTitle>
            <CardDescription>
              Loyer, assurances, abonnements — Ankora les lisse sur 12 mois pour toi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/app/charges">Ajouter une charge</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-(--color-brand-700)">
                <PiggyBank className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">Provisions / mois</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(provisionTarget)}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">
                Annuel : {formatMoney(annualTotal)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className={`flex items-center gap-2 ${healthColor}`}>
                <Shield className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">Santé provisions</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${healthColor}`}>{healthLabel}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">
                Cible : {formatMoney(health.target)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-(--color-brand-700)">
                <ArrowRightLeft className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">Virement suggéré</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(suggestedTransfer)}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">
                {suggestedTransfer.gte(0) ? 'À mettre de côté' : 'À retirer de l’épargne'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-(--color-accent-600)">
                <Receipt className="h-5 w-5" aria-hidden />
                <CardTitle className="text-sm font-medium">
                  Factures {formatMonth(currentMonth)}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(billsDue)}</p>
              <p className="mt-1 text-xs text-(--color-muted-foreground)">Sortie de cash ce mois</p>
            </CardContent>
          </Card>
        </div>
      )}

      {hasCharges && (
        <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 id="plan-heading" className="text-xl font-semibold">
                Plan du mois — {formatMonth(currentMonth)}
              </h2>
              <p className="text-sm text-(--color-muted-foreground)">
                Les virements à exécuter en début de mois sur tes trois comptes.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/accounts">Ajuster mes comptes</Link>
            </Button>
          </div>

          {missingSetup ? (
            <Card>
              <CardHeader>
                <CardTitle>Renseigne d&apos;abord tes comptes</CardTitle>
                <CardDescription>
                  Pour calculer ton Virement Intelligent, Ankora a besoin de ton revenu mensuel et
                  du montant fixe que tu envoies sur Vie Courante.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/app/accounts">Configurer mes comptes</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-(--color-brand-700)">
                    <ArrowRightLeft className="h-5 w-5" aria-hidden />
                    <CardTitle className="text-sm font-medium">Principal → Vie Courante</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatMoney(plan.vieCouranteTransfer)}
                  </p>
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
                    Enveloppe courses, essence, restos.
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
                      {epargneGoesToEpargne ? 'Principal → Épargne' : 'Épargne → Principal'}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{formatMoney(epargneNetAbs)}</p>
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
                    Provision {formatMoney(plan.epargneProvisionTarget)} − factures{' '}
                    {formatMoney(plan.epargneBillsDue)}
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
                    <CardTitle className="text-sm font-medium">Restant Principal</CardTitle>
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
                    {formatMoney(plan.netPrincipalAfterPlan)}
                  </p>
                  <p className="mt-1 text-xs text-(--color-muted-foreground)">
                    Après salaire, virements et factures Principal (
                    {formatMoney(plan.principalBillsDue)}
                    ).
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
                      {formatMoney(money(account?.balance ?? 0))}
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
          <Link href="/app/charges">Mes charges</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/app/expenses">Mes dépenses</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/app/simulator">Simuler</Link>
        </Button>
      </div>
    </div>
  );
}
