import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightLeft, PiggyBank, Receipt, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Budget, Provision, money } from '@/lib/domain';
import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { formatMoney, formatMonth } from '@/lib/format';

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
