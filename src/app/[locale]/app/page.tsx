import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Landmark } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountCard } from '@/components/features/AccountCard';
import { SituationDuMoisHero, type PartAffichee } from '@/components/dashboard/SituationDuMoisHero';
import { ProvisionHealthGaugeCard } from '@/components/dashboard/ProvisionHealthGaugeCard';
import { ProchainesFacturesCard } from '@/components/dashboard/ProchainesFacturesCard';
import { EngagementsCard } from '@/components/dashboard/EngagementsCard';
import { SimulatorDrawer } from '@/components/dashboard/SimulatorDrawer';
import { Expenses, Transfer, money } from '@/lib/domain';
import { unpaidChargesForPeriod } from '@/lib/domain/charges';
import * as Obligations from '@/lib/domain/obligations';
import type { Poste } from '@/lib/domain/cockpit';
import type { NamedCommitment } from '@/lib/domain/obligations';
import { loadMonthSituation } from '@/lib/data/month-situation';
import { commitmentRowToDomain, hasLiveCommitments } from '@/lib/data/commitment-row';
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

/**
 * La frontière RSC, franchie une fois et explicitement.
 *
 * Un `Decimal` ne traverse jamais vers un composant : il est sérialisé en objet
 * nu côté client et toute méthode appelée dessus lève. La conversion se fait
 * donc ICI, au passage, et jamais dans le composant — qui n'aurait alors plus
 * de raison de recevoir des nombres plutôt que des objets.
 *
 * `toNumber()` perd la précision arbitraire de `Decimal`. C'est sans effet :
 * ces valeurs ne servent qu'à être formatées en euros, et le total affiché vient
 * du même `Poste`, calculé en `Decimal` de bout en bout. On n'additionne jamais
 * ces `number` entre eux.
 */
function partsAffichees(poste: Poste): PartAffichee[] {
  return poste.parts.map((part) => ({
    id: part.id,
    libelle: part.libelle,
    montantMensuel: part.montantMensuel.toNumber(),
    origine: part.origine
      ? {
          montantFacture: part.origine.montantFacture.toNumber(),
          cycleMois: part.origine.cycleMois,
        }
      : null,
  }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.dashboard');
  return { title: t('metaTitle') };
}

export default async function DashboardPage() {
  const t = await getTranslations('app.dashboard');
  const locale = (await getLocale()) as Locale;
  // One assembly of the month's four figures, shared with the ⊕ sheet's context
  // action so the cockpit and the entry sheet can never quote different
  // amounts. Also carries the same commitment read as /app/commitments.
  const {
    snapshot,
    commitments,
    paidKeysByCommitment,
    situation,
    engagementsMensuels,
    decomposition,
    paymentsLedger,
    cockpitCharges,
    soldeEpargneActuel,
    joursEcoules,
    joursRestants,
    joursDuMois: daysInMonth,
    todayIso,
  } = await loadMonthSituation();
  const namedCommitments: NamedCommitment[] = commitments.map((c) => ({
    ...commitmentRowToDomain(c),
    label: c.label,
  }));
  const commitmentLedger = new Map(
    Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );
  const currentMonth = new Date().getMonth() + 1;
  const monthLabel = formatMonth(currentMonth, locale);
  const fmtMoney = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const hasCharges = snapshot.charges.length > 0;

  const monthlyExpenseTotal = Expenses.totalAmount(snapshot.monthlyExpenses);
  const latestMonthlyExpenses = Expenses.latestExpenses(snapshot.monthlyExpenses, 5);
  const monthlyExpenseCount = snapshot.monthlyExpenses.length;

  const monthlyIncome = money(snapshot.monthlyIncome ?? 0);
  const vieCouranteTransferAmount = money(snapshot.vieCouranteMonthlyTransfer ?? 0);
  // « Restant Principal » used to ignore the commitment instalments that
  // « Budget du mois » deducts — two "remainings" on one screen, two
  // perimeters, and no label saying so. Both now belong to the CASH view, and
  // the block is named « Après tes sorties de <mois> » to say which one it is.
  // Built ONCE and kept whole: the cockpit needs both halves. The filtered
  // total below feeds the transfer plan; the full list feeds the bills card,
  // which used to sum charges on its own and so could never see an instalment
  // (#349). One list, so the two figures cannot drift.
  const obligationsDuMoisToutes = Obligations.obligationsDuMois({
    charges: cockpitCharges,
    chargePayments: paymentsLedger,
    commitments: namedCommitments,
    paidKeysByCommitment: commitmentLedger,
    ref: snapshot.currentPeriod,
  });
  // `aPayerCeMois` (GROSS — ticked instalments included), never
  // `resteAPayerCeMois` (net): the transfer plan provisions the month's whole
  // commitment load, not the part still unticked. Swapping them would silently
  // change what « Budget du mois » means.
  const commitmentsDueThisMonth = Obligations.aPayerCeMois(
    obligationsDuMoisToutes.filter((o) => o.source === 'commitment'),
  );
  const plan = Transfer.computeMonthlyTransferPlan({
    charges: snapshot.charges,
    month: currentMonth,
    monthlyIncome,
    vieCouranteMonthlyTransfer: vieCouranteTransferAmount,
    commitmentsDue: commitmentsDueThisMonth,
  });
  const epargneNetAbs = plan.epargneTransferNet.abs();
  const epargneGoesToEpargne = plan.epargneTransferNet.gte(0);
  const missingSetup =
    snapshot.monthlyIncome === null || snapshot.vieCouranteMonthlyTransfer === null;
  const accountByType = new Map(snapshot.accounts.map((a) => [a.accountType, a]));

  // Daily allowance not yet configured: surface the inline CTA on the
  // daily_card row so the user can complete the cockpit setup without
  // hunting through Settings.
  const dailyPlafondMissing =
    snapshot.vieCouranteMonthlyTransfer === null || snapshot.vieCouranteMonthlyTransfer === 0;
  const tDaily = await getTranslations('dashboard.daily');

  // Does « Mes engagements » have anything to show? Drives the desktop layout:
  // Gauge + Engagements share a 2-col row only when the card renders, otherwise
  // the Gauge takes the full width (no empty half-column). Same predicate the
  // card self-hides on, so layout and card never disagree.
  const showCommitments = hasLiveCommitments(commitments, paidKeysByCommitment);

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
          engagementsMensuels={situation.engagementsMensuels.toNumber()}
          chargesFixesParts={partsAffichees(decomposition.chargesFixes)}
          lissageParts={partsAffichees(decomposition.lissage)}
          engagementsParts={partsAffichees(decomposition.engagements)}
          resteDisponible={situation.resteDisponible.toNumber()}
          depensesDuMois={situation.depensesDuMois.toNumber()}
          ilTeReste={situation.ilTeReste.toNumber()}
          epargneEstimee={situation.epargneEstimee?.toNumber() ?? null}
          deficitEpargne={situation.deficitEpargne.toNumber()}
          rattrapageMensuel={situation.rattrapageMensuel.toNumber()}
          provisionsAJour={situation.provisionsAJour}
          joursRestants={joursRestants}
          joursEcoules={joursEcoules}
          joursDuMois={daysInMonth}
          locale={locale}
        />
      </section>

      {/*
        THI-190 — Santé des Provisions (cockpit v3 section #2 of 8).
        Answers "am I saving the right amount each month so periodic
        bills never catch me short?" — complements the hero radar which
        answers "what is my real monthly burden?". Always visible (even
        on an empty workspace) so the user sees the canonical narrative.
        On desktop it shares a 2-col row with « Mes engagements » when that
        card has content (see `showCommitments`), else it spans full width.
      */}
      {/*
        Provisions health + « Mes engagements » share a 2-col row on desktop
        (both dense but narrow). `lg:items-start` keeps each card at its natural
        height. When there is nothing to show, the whole grid collapses to the
        gauge at full width — `showCommitments` gates the 2nd column so it never
        leaves an empty half.
      */}
      <div className={showCommitments ? 'grid gap-4 lg:grid-cols-2 lg:items-start' : ''}>
        <section aria-labelledby="provision-health-heading" className="flex flex-col gap-4">
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
          Épic « Dettes & échéanciers » PR-3 — « Mes engagements ». Paired with
          the provisions gauge on desktop. `EngagementsCard` self-hides when
          empty; `showCommitments` (same predicate) gates the section so the
          grid reserves the 2nd column only when the card actually renders.
        */}
        {showCommitments && (
          <section aria-labelledby="commitments-heading" className="flex flex-col gap-4">
            <h2 id="commitments-heading" className="sr-only">
              {t('commitmentsSectionHeading')}
            </h2>
            <EngagementsCard
              commitments={commitments}
              paidKeysByCommitment={paidKeysByCommitment}
              currentPeriod={snapshot.currentPeriod}
              locale={locale}
            />
          </section>
        )}
      </div>

      {/*
        THI-192 — Prochaines factures (cockpit v3 section #5 of 8). Full width
        (row-heavy: J-7 / J-14 / J-30 windows + a separate overdue bucket).
        Reuses `snapshot.charges` + the same `paymentsLedger` Map as the gauge
        so a settled bill for the current cycle never appears as overdue.
      */}
      <section aria-labelledby="upcoming-bills-heading" className="flex flex-col gap-4">
        <h2 id="upcoming-bills-heading" className="sr-only">
          {t('upcomingBillsSectionHeading')}
        </h2>
        <ProchainesFacturesCard
          charges={snapshot.charges}
          payments={paymentsLedger}
          obligations={obligationsDuMoisToutes}
          todayIso={todayIso}
          locale={locale}
          forgotten={{
            labels: unpaidChargesForPeriod(
              snapshot.charges,
              new Set(snapshot.previousMonthPaidChargeIds),
              snapshot.previousPeriod,
            ).map((c) => c.label),
            monthLabel: formatMonth(snapshot.previousPeriod.month, locale),
            periodParam: `${snapshot.previousPeriod.year}-${String(snapshot.previousPeriod.month).padStart(2, '0')}`,
          }}
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
                    className="text-muted-foreground hover:text-brand-700 -my-1.5 inline-flex min-h-11 items-center text-xs underline underline-offset-2"
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
                      {t('transferPrincipalRemaining', { month: monthLabel })}
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
                      commitments: fmtMoney(plan.commitmentsDue),
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
        {/* THI-195 : ouvre le simulateur en place, dans un tiroir.
            La route `/app/simulator` a été supprimée le 2026-08-08 — le tiroir
            est désormais le seul accès, et l'ancienne URL redirige ici. */}
        {/* Pass income as a raw number — a Decimal can't cross the RSC
            boundary into the client drawer (it loses its prototype). */}
        <SimulatorDrawer
          charges={snapshot.rawCharges}
          revenus={snapshot.monthlyIncome ?? 0}
          engagementsMensuels={engagementsMensuels.toNumber()}
        />
      </div>
    </div>
  );
}
