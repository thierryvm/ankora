import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountCard, type SoldeCarte } from '@/components/features/AccountCard';
import type { SoldeAffiche } from '@/lib/domain/accounts/solde-affiche';
import { CascadeDuMois, type PartAffichee } from '@/components/dashboard/CascadeDuMois';
import { ProvisionHealthGaugeCard } from '@/components/dashboard/ProvisionHealthGaugeCard';
import { EngagementsCard } from '@/components/dashboard/EngagementsCard';
import { SimulatorDrawer } from '@/components/dashboard/SimulatorDrawer';
import { Repli } from '@/components/cockpit/Repli';
import { SixMoisRepli } from '@/components/cockpit/SixMoisRepli';
import { RythmeDuMois } from '@/components/cockpit/RythmeDuMois';
import { readDebutDesDonnees } from '@/lib/data/debut-des-donnees';
import { epargneAffichee, tropTotPourProjeter } from '@/lib/domain/cockpit/trop-tot';
import { IlTeResteCard } from '@/components/cockpit/IlTeResteCard';
import { EncoreAPayerCard, type LigneAPayer } from '@/components/cockpit/EncoreAPayerCard';
import { PrincipalApresFactures } from '@/components/cockpit/PrincipalApresFactures';
import { principalApresFactures } from '@/lib/domain/cockpit/principal-apres-factures';
import { Expenses, Transfer, money } from '@/lib/domain';
import * as Obligations from '@/lib/domain/obligations';
import { currentPeriodDueDate } from '@/lib/domain/charges';
import { depensesParJour, type Poste } from '@/lib/domain/cockpit';
import { facturesBientot } from '@/lib/domain/cockpit/bientot';
import { paymentKey } from '@/lib/domain/cockpit/types';
import type { NamedCommitment } from '@/lib/domain/obligations';
import { loadMonthSituation, todayIsoInBrussels } from '@/lib/data/month-situation';
import { MonthNav } from '@/components/period/MonthNav';
import { commenceParVoyelle, moisDansLaPhrase, moisVuDe } from '@/components/cockpit/mois-vu';
import {
  parseViewedPeriod,
  toPeriodParam,
  transferPlanAllowed,
  viewedPeriodNav,
} from '@/lib/domain/period/viewed-period';
import { commitmentRowToDomain, hasLiveCommitments } from '@/lib/data/commitment-row';
import type { AccountType } from '@/lib/schemas/account';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatMonth } from '@/lib/i18n/formatters';

/**
 * LE COCKPIT — refonte v3, lot B.
 *
 * ## Ce qui change, et pourquoi
 *
 * L'écran d'avant posait douze cartes ouvertes les unes sous les autres :
 * un hero, sa cascade, une jauge de provisions, les engagements, les prochaines
 * factures, trois cartes de comptes, trois cartes de plan de virement, la liste
 * des dépenses, trois boutons. Chacune était défendable ; ensemble, elles
 * donnaient « tout est mélangé » (juillet 2026) puis « le foutoir » (septembre).
 * Le défaut n'était pas dans les cartes, il était dans leur nombre au repos.
 *
 * La v3 ne supprime rien. Elle **replie** : une carte de tête qui répond, une
 * carte qui dit ce qui sort encore, et le reste sous des replis fermés dont le
 * TITRE PORTE SON CHIFFRE. « Mes comptes · 3 » répond déjà ; on ouvre pour le
 * détail, pas pour savoir s'il y a quelque chose.
 *
 * ## Ce qui ne change PAS
 *
 * Aucun calcul, aucune donnée, aucune écriture. `loadMonthSituation()` est lu
 * exactement comme avant, les mêmes fonctions de domaine reçoivent les mêmes
 * entrées, et les six cartes repliées sont les composants d'aujourd'hui, tels
 * quels. La seule lecture qui change est celle de « Bientôt », qui cesse
 * d'attendre un marqueur manuel — cf. `domain/cockpit/bientot.ts`.
 *
 * ## Le budget de page (mesuré par `e2e/cockpit-v3.spec.ts`, jamais à l'œil)
 *
 * À 375 px : douze montants au plus visibles sans geste, deux écrans et demi au
 * plus. Un repli fermé ne montre que la clé de son titre, et c'est ce qui rend
 * le budget tenable sans rien retirer de l'application.
 */
const ACCOUNT_TYPE_ORDER: readonly AccountType[] = ['income_bills', 'provisions', 'daily_card'];

/**
 * La frontière RSC, franchie une fois et explicitement.
 *
 * Un `Decimal` ne traverse jamais vers un composant : il est sérialisé en objet
 * nu côté client et toute méthode appelée dessus lève. La conversion se fait
 * donc ICI, au passage, et jamais dans le composant — qui n'aurait alors plus
 * de raison de recevoir des nombres plutôt que des objets.
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

import {
  accountBalanceView,
  plannedTransferLine,
  rewritableStatements,
} from '@/lib/domain/accounts/operations-view';
import { splitDiffersFromRule } from '@/lib/domain/accounts/split-rule';
import {
  TransferDoneControl,
  type TransferLineState,
} from '@/components/operations/TransferDoneControl';
import type { AccountType as LedgerAccountType } from '@/lib/domain/cockpit/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.dashboard');
  return { title: t('metaTitle') };
}

/** Tour 59 — the card receives plain values: a Decimal never crosses into it. */
function soldeCarte(solde: SoldeAffiche | undefined): SoldeCarte | null {
  if (solde === undefined || solde.etat === 'aucun') return null;
  return {
    montant: solde.montant.toNumber(),
    luLe: solde.luLe.toISOString().slice(0, 10),
    depart: solde.depart,
    operations: solde.operations,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const t = await getTranslations('app.dashboard');
  // ADR-046, lot 2 — the cockpit follows `?period=YYYY-MM`, with the window
  // and the parser of Bills. Absent or out of the window: the current month.
  const [todayYear, todayMonth] = todayIsoInBrussels().split('-').map(Number) as [number, number];
  // ADR-047 — WITHOUT `?period`, the month shown is the budget month running
  // (`null` here; `loadMonthSituation` resolves it from the journal): on
  // 28 September with October's salary written, the cockpit opens October.
  const rawPeriod = (await searchParams).period;
  const parsedPeriod = parseViewedPeriod(rawPeriod, { year: todayYear, month: todayMonth });
  const viewedPeriod = rawPeriod === toPeriodParam(parsedPeriod) ? parsedPeriod : null;
  const tc = await getTranslations('cockpit');
  const tNav = await getTranslations('app.charges.periodNav');
  const locale = (await getLocale()) as Locale;

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
    provisionsSansReleve,
    soldesComptes,
    soldeQuotidien,
    ledger,
    joursEcoules,
    joursDuMois: daysInMonth,
    todayIso,
    ref,
    isCurrentMonth,
    monthlyExpenses,
    fenetre,
  } = await loadMonthSituation('/app', viewedPeriod);
  // The month the cockpit calls « current »: the budget month running now.
  const moisEnCours = snapshot.moisDeBudget;
  // Issue #504 — the base income is called what it is: « Revenu prévu » while
  // the written income is the figure (nothing received, or less than planned),
  // « Argent reçu » only when the figure is the money received.
  // Tour 56 — the word comes WITH the amount, from `revenuDeBase`. A finished
  // month with nothing received keeps the written income: never « reçu ».
  const revenuPrevu = situation.termeRevenu !== 'recu';

  // G-31 — « Trop tôt pour projeter »: days of data count from the FIRST
  // operation ever recorded. Movements are already loaded (`ledger`, sorted by
  // date); the expenses' side is one bounded read. Only the current month has
  // a projection, so only it pays for the read — and not while the situation
  // is incomplete: the pace card is not shown then, and a failed read would
  // take the whole cockpit down for a card that is absent.
  const tropTot =
    isCurrentMonth && situation.statut !== 'incomplet'
      ? tropTotPourProjeter({
          ...(await readDebutDesDonnees(
            snapshot.workspaceId,
            todayIso,
            ledger.movements
              .map((m) => m.occurredOn.toISOString().slice(0, 10))
              .find((d) => d <= todayIso) ?? null,
          )),
          aujourdhui: todayIso,
        })
      : false;
  // One savings figure for the whole cockpit (G-31): the cascade and the pace
  // card read the same value, never one « too early » beside one amount.
  const epargne = epargneAffichee(situation.epargneEstimee?.toNumber() ?? null, tropTot);

  const namedCommitments: NamedCommitment[] = commitments.map((c) => ({
    ...commitmentRowToDomain(c),
    label: c.label,
  }));
  const commitmentLedger = new Map(
    Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)] as const),
  );
  const period = ref;
  // Le mois vient de la PÉRIODE du domaine (Europe/Brussels), jamais du fuseau
  // du serveur : sur Vercel (UTC), le 1er du mois entre 00 h et 02 h heure
  // belge, `new Date().getMonth()` rend encore le mois précédent — le titre et
  // « hors de <mois> » auraient nommé septembre au-dessus de chiffres
  // d'octobre. Relevé à la relecture du 20 sept. 2026.
  const currentMonth = period.month;
  // The plan's « I made this transfer » writes a movement for `period`. Allowed
  // for the current month and the NEXT one only (@thierry, 24 Sept. 2026: the
  // salary lands around the 28th and the next month's transfers are made
  // then). UI-only restriction: the action accepts any valid plan month and
  // validates it; the date written is today. Further ahead or in the past:
  // no button.
  const transferActionable = transferPlanAllowed(period, moisEnCours);
  const monthLabel = formatMonth(currentMonth, locale);
  // The cards speak of the month inside sentences (« sur ton budget d’octobre »,
  // « hors d’octobre »): never the capitalised title form (26 Sept. 2026).
  const moisPhrase = moisDansLaPhrase(currentMonth, locale);
  // Mid-sentence, the month keeps the case its language gives it (« d'octobre »,
  // « for October »), unlike `formatMonth`, which capitalises for titles.
  // ADR-046, lot 2 bis — the tense and the mid-sentence name of another month,
  // decided HERE once from the two periods (`null` = the current month).
  const moisVu = moisVuDe(period, moisEnCours, locale);
  const fmtMoney = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, locale);

  const hasCharges = snapshot.charges.length > 0;

  // ADR-047 — a budget month that opened before the 1st draws from its first
  // day: the series and the Rythme card count the days of the budget month.
  const [debutY, debutM, debutJ] = fenetre.debut.split('-').map(Number) as [number, number, number];
  const decalage = fenetre.calendaire ? 0 : debutJ - 1;
  const serieDuMois = depensesParJour(
    monthlyExpenses,
    period,
    daysInMonth,
    fenetre.calendaire ? undefined : fenetre.debut,
  );
  const monthlyExpenseTotal = Expenses.totalAmount(monthlyExpenses);
  const latestMonthlyExpenses = Expenses.latestExpenses(monthlyExpenses, 5);
  const monthlyExpenseCount = monthlyExpenses.length;

  const monthlyIncome = money(snapshot.monthlyIncome ?? 0);
  const vieCouranteTransferAmount = money(snapshot.vieCouranteMonthlyTransfer ?? 0);

  // UNE liste d'obligations, gardée entière : le total et les lignes viennent
  // de la même source, donc les deux chiffres ne peuvent pas diverger (#349).
  const obligationsDuMoisToutes = Obligations.obligationsDuMois({
    charges: cockpitCharges,
    chargePayments: paymentsLedger,
    commitments: namedCommitments,
    paidKeysByCommitment: commitmentLedger,
    ref: period,
  });
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

  // PR C bis — « J'ai fait ce virement ». The plan divides annual bills by
  // 12, 6 or 3 without rounding; every figure handed to the gesture is rounded
  // to the cent here, or the write would refuse a third decimal (ADR-045 D19).
  // PR D — the journal is read ONCE, by `loadMonthSituation`, which feeds
  // « Il te reste » with it and throws when it cannot be read: the gestures
  // below and the figure above can no longer disagree on what was done.
  // ADR-045 D21 — the statement a same-day transfer could be counted twice against.
  const transferStatements = Object.fromEntries(
    Object.entries(
      rewritableStatements(ledger.statements, ['income_bills', 'provisions', 'daily_card']),
    ).map(([a, st]) => [
      a,
      { statedOn: st.statedOn.toISOString().slice(0, 10), balance: st.balance.toNumber() },
    ]),
  );
  const lineState = (from: LedgerAccountType, to: LedgerAccountType): TransferLineState => {
    const l = plannedTransferLine({
      movements: ledger.movements,
      fromAccountType: from,
      toAccountType: to,
      planYear: period.year,
      planMonth: period.month,
    });
    if (l.state === 'todo') return { state: 'todo', cancelledId: l.cancelled?.id ?? null };
    return {
      state: 'done',
      id: l.movement.id,
      amount: l.movement.amount.toNumber(),
      suggested: l.movement.planSuggestedAmount?.toNumber() ?? l.movement.amount.toNumber(),
      occurredOn: l.movement.occurredOn.toISOString().slice(0, 10),
    };
  };
  const epargneFrom: LedgerAccountType = epargneGoesToEpargne ? 'income_bills' : 'provisions';
  const epargneTo: LedgerAccountType = epargneGoesToEpargne ? 'provisions' : 'income_bills';
  // Tour 56 — a transfer to the provisions written before the domain rule
  // (#505) keeps its old split; the line then offers to recompute it in place.
  const epargneLine = plannedTransferLine({
    movements: ledger.movements,
    fromAccountType: epargneFrom,
    toAccountType: epargneTo,
    planYear: period.year,
    planMonth: period.month,
  });
  const epargneSplitOutdated =
    epargneLine.state === 'done' && splitDiffersFromRule(epargneLine.movement, snapshot.charges);
  const missingSetup =
    snapshot.monthlyIncome === null || snapshot.vieCouranteMonthlyTransfer === null;
  const accountByType = new Map(snapshot.accounts.map((a) => [a.accountType, a]));

  // « Sur ton compte principal après tes factures de <mois> ». The main
  // account's balance comes from the function and the day the Accounts page
  // uses — the same call `loadMonthSituation` makes for the daily account —
  // and already went down with every bill ticked paid (ADR-045 D22). Only the
  // bills still unticked are subtracted, by the domain, with their lines.
  // Today's balance belongs to today: another month gets no figure.
  const vuePrincipal =
    isCurrentMonth && accountByType.has('income_bills')
      ? accountBalanceView({
          accountType: 'income_bills',
          statements: ledger.statements,
          movements: ledger.movements,
          debits: ledger.debits,
          today: new Date(`${todayIso}T00:00:00Z`),
        })
      : null;
  const principalApres = isCurrentMonth
    ? principalApresFactures({
        soldePrincipal: vuePrincipal
          ? (vuePrincipal.computed?.balance ?? vuePrincipal.read.balance)
          : null,
        obligations: obligationsDuMoisToutes,
        ref: period,
      })
    : null;

  const dailyPlafondMissing =
    snapshot.vieCouranteMonthlyTransfer === null || snapshot.vieCouranteMonthlyTransfer === 0;
  const tDaily = await getTranslations('dashboard.daily');
  const showCommitments = hasLiveCommitments(commitments, paidKeysByCommitment);

  // ---------------------------------------------------------------------------
  // « Encore à payer » — les échéances du mois encore ouvertes, et « Bientôt ».
  // ---------------------------------------------------------------------------
  const resteAPayer = Obligations.resteAPayerCeMois(obligationsDuMoisToutes);
  const obligationsPayees = obligationsDuMoisToutes.filter((o) => o.isPaid).length;

  const isPaidThisPeriod = (id: string) =>
    paymentsLedger.get(paymentKey(id, period.year, period.month)) === true;

  const lignesAPayer: LigneAPayer[] = snapshot.charges
    .filter((c) => c.isActive && c.paymentMonths.includes(period.month) && !isPaidThisPeriod(c.id))
    .flatMap((charge) => {
      const due = currentPeriodDueDate(charge, period, todayIso, false);
      if (!due) return [];
      return [
        {
          id: charge.id,
          label: charge.label,
          montant: charge.amount.toNumber(),
          dueDateIso: due.dueDateIso,
          isOverdue: due.status === 'overdue',
        },
      ];
    })
    .sort((a, b) => (a.dueDateIso < b.dueDateIso ? -1 : a.dueDateIso > b.dueDateIso ? 1 : 0));

  // « Bientôt » : calculé à la lecture sur 60 jours, en union avec la coche
  // « à surveiller » tant que /app/charges permet de la poser.
  // « Bientôt » is read from TODAY: another month shows a link to that
  // month's bills instead (EncoreAPayerCard, `moisVu`).
  const bientot = !isCurrentMonth
    ? []
    : facturesBientot({
        charges: snapshot.charges.map((c) => ({
          id: c.id,
          label: c.label,
          amount: c.amount,
          frequency: c.frequency,
          paymentMonths: c.paymentMonths,
          paymentDay: c.paymentDay,
          isActive: c.isActive,
          isWatched: c.isWatched,
        })),
        payments: paymentsLedger,
        todayIso,
        period,
      });

  // ---------------------------------------------------------------------------
  // Les clés des replis — chaque titre répond AVANT qu'on l'ouvre.
  // ---------------------------------------------------------------------------
  const comptesVisibles = ACCOUNT_TYPE_ORDER.filter((tp) => accountByType.has(tp));
  const cleComptes = String(comptesVisibles.length);
  const cleDepenses = tc('replis.cleDepenses', { count: monthlyExpenseCount });
  // Tour 55 — the key says what is LEFT to transfer, not the plan: once every
  // line is done it says so, instead of still asking for the daily transfer.
  const lignesVirement = [
    {
      amount: plan.vieCouranteTransfer,
      done: lineState('income_bills', 'daily_card').state === 'done',
    },
    { amount: epargneNetAbs, done: lineState(epargneFrom, epargneTo).state === 'done' },
  ];
  const virementsAFaire = Transfer.virementsRestants(lignesVirement);
  // « Tout est fait » only once something WAS done: with nothing to transfer
  // at all, it would announce an action nobody took.
  const cleVirements = missingSetup
    ? tc('replis.cleVirementsIncomplet')
    : virementsAFaire.isZero() && lignesVirement.some((l) => l.done)
      ? tc('replis.cleVirementsFaits')
      : tc('replis.cleVirements', { montant: fmtMoney(virementsAFaire) });
  const cleEngagements = String(commitments.length);

  const cascade =
    situation.statut === 'incomplet' ? null : (
      <CascadeDuMois
        revenus={situation.revenus.toNumber()}
        revenuRecu={situation.revenuRecu?.toNumber() ?? null}
        revenuPrevu={revenuPrevu}
        revenuEcrit={situation.revenuEcrit?.toNumber() ?? null}
        recuEnPlus={situation.recuEnPlus.toNumber()}
        misDeCote={situation.misDeCote.toNumber()}
        auDelaDuRevenu={situation.auDelaDuRevenu.toNumber()}
        chargesFixes={situation.chargesFixes.toNumber()}
        provisionsLissees={situation.provisionsLissees.toNumber()}
        engagementsMensuels={situation.engagementsMensuels.toNumber()}
        chargesFixesParts={partsAffichees(decomposition.chargesFixes)}
        lissageParts={partsAffichees(decomposition.lissage)}
        engagementsParts={partsAffichees(decomposition.engagements)}
        retenu={situation.retenu.toNumber()}
        resteDisponible={situation.resteDisponible.toNumber()}
        depensesDuMois={situation.depensesDuMois.toNumber()}
        ilTeReste={situation.ilTeReste.toNumber()}
        epargneEstimee={epargne}
        moisVu={moisVu}
        locale={locale}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="cockpit-title">
          {moisVu ? (
            <>
              {`${monthLabel} ${period.year}`}
              {/* The pause the old « — » gave, for a screen reader only. */}
              <span className="sr-only">, </span>
              {/* One title template for another month (@thierry, 24 Sept.
                  2026): the month, then what it is — the selector below no
                  longer repeats it. */}
              <span
                data-testid="cockpit-title-etiquette"
                className="bg-surface-muted text-muted-foreground ml-1 inline-flex items-center rounded-full px-2.5 py-0.5 align-middle text-xs font-medium tracking-normal"
              >
                {t(moisVu.temps === 'aVenir' ? 'etiquetteAVenir' : 'etiquettePasse')}
              </span>
            </>
          ) : (
            t('headerTitle', { month: monthLabel })
          )}
        </h1>
        <div className="mt-2">
          <MonthNav
            pathname="/app"
            testIdPrefix="cockpit-period"
            landmark={false}
            {...viewedPeriodNav(period, moisEnCours)}
            labels={{
              navAria: tNav('navAria'),
              prevAria: tNav('prevAria'),
              nextAria: tNav('nextAria'),
              backToCurrent: tNav('backToCurrent', {
                month: moisDansLaPhrase(moisEnCours.month, locale),
              }),
            }}
          />
        </div>
      </header>

      {/* La carte de tête : une question, un chiffre, sa formule, une action. */}
      <section aria-labelledby="cockpit-heading">
        <IlTeResteCard
          revenuPrevu={revenuPrevu}
          revenuRienNote={situation.termeRevenu === 'rienNote'}
          ilTeReste={situation.ilTeReste.toNumber()}
          resteDisponible={situation.resteDisponible.toNumber()}
          moisVu={moisVu}
          revenus={situation.revenus.toNumber()}
          depensesDuMois={situation.depensesDuMois.toNumber()}
          retenu={situation.retenu.toNumber()}
          misDeCote={situation.misDeCote.toNumber()}
          soldeQuotidien={soldeQuotidien?.toNumber() ?? null}
          chargesFixes={situation.chargesFixes.toNumber()}
          provisionsLissees={situation.provisionsLissees.toNumber()}
          engagementsMensuels={situation.engagementsMensuels.toNumber()}
          monthLabel={moisPhrase}
          incomplet={situation.statut === 'incomplet'}
          locale={locale}
          cascade={cascade}
        />
      </section>

      {/* Ce qui sort encore ce mois-ci, et ce qui arrive juste après. */}
      {hasCharges ? (
        <section aria-labelledby="cockpit-encore-a-payer-heading">
          <EncoreAPayerCard
            resteAPayer={resteAPayer.toNumber()}
            payees={obligationsPayees}
            total={obligationsDuMoisToutes.length}
            lignes={lignesAPayer}
            bientot={bientot}
            monthLabel={moisPhrase}
            locale={locale}
            moisVu={moisVu}
          />
        </section>
      ) : (
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

      {/* ---------------------------------------------------------------------
          Les replis. Fermés au chargement, sans exception : c'est ce qui tient
          le budget de page. Chaque titre porte son chiffre, donc aucun ne se
          ouvre « pour voir ».
          --------------------------------------------------------------------- */}

      {comptesVisibles.length > 0 && (
        <Repli
          titre={tc('replis.comptes')}
          cle={moisVu ? tc('replis.soldesAujourdhui') : cleComptes}
          testId="repli-comptes"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {comptesVisibles.map((accountType) => {
              const account = accountByType.get(accountType);
              if (!account) return null;
              const extraHint =
                accountType === 'daily_card' && dailyPlafondMissing ? (
                  <Link
                    href="/app/accounts"
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
                  solde={soldeCarte(soldesComptes[accountType])}
                  locale={locale}
                  extraHint={extraHint}
                />
              );
            })}
          </div>
        </Repli>
      )}

      {hasCharges && (
        <Repli titre={tc('replis.depenses')} cle={cleDepenses} testId="repli-depenses">
          {monthlyExpenseCount === 0 ? (
            <p className="text-muted-foreground text-sm">{t('expensesEmpty')}</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-muted-foreground text-sm">
                  {t('expensesCount', { count: monthlyExpenseCount })}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {fmtMoney(monthlyExpenseTotal)}
                </p>
              </div>
              <ul className="divide-border mt-2 divide-y">
                {latestMonthlyExpenses.map((expense) => (
                  <li key={expense.id} className="flex items-center justify-between gap-4 py-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{expense.label}</p>
                    <p className="text-muted-foreground shrink-0 font-mono text-sm tabular-nums">
                      {fmtMoney(expense.amount)}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/app/expenses">{t('expensesViewAll')}</Link>
                </Button>
              </div>
            </>
          )}
        </Repli>
      )}

      {/* « Six mois » (G-six) — the six months ending on the viewed month. Closed by
          default; it reads its months when it opens, never at this render. */}
      <SixMoisRepli
        key={`${period.year}-${period.month}`}
        fin={{ year: period.year, month: period.month }}
      />

      {/* The rhythm counts days left from TODAY: it has nothing to say about another month. */}
      {isCurrentMonth && situation.statut !== 'incomplet' && (
        <RythmeDuMois
          year={fenetre.calendaire ? period.year : debutY}
          month={fenetre.calendaire ? period.month : debutM}
          decalage={decalage}
          moisDeBudget={period.month}
          joursDuMois={daysInMonth}
          joursEcoules={joursEcoules}
          serie={serieDuMois}
          depenses={monthlyExpenses.map((e) => ({
            id: e.id,
            label: e.label,
            montant: e.amount.toNumber(),
            date: e.occurredOn.slice(0, 10),
          }))}
          depensesDuMois={situation.depensesDuMois.toNumber()}
          projection={situation.depensesProjetees?.toNumber() ?? null}
          epargne={epargne}
          tropTot={tropTot}
          budget={{
            montant: situation.resteDisponible.toNumber(),
            revenus: situation.revenus.toNumber(),
            revenuPrevu,
            retenu: situation.retenu.toNumber(),
            chargesFixes: situation.chargesFixes.toNumber(),
            provisionsLissees: situation.provisionsLissees.toNumber(),
            engagementsMensuels: situation.engagementsMensuels.toNumber(),
            misDeCote: situation.misDeCote.toNumber(),
          }}
        />
      )}

      {hasCharges && (
        <Repli titre={tc('replis.virements')} cle={cleVirements} testId="repli-virements">
          {missingSetup ? (
            <div>
              <p className="font-medium">{t('missingSetupTitle')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{t('missingSetupDescription')}</p>
              <Button asChild className="mt-3">
                <Link href="/app/accounts">{t('missingSetupCta')}</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              <li className="flex items-center justify-between gap-4 py-2">
                <p className="min-w-0 text-sm font-medium">
                  {tc('virements.versQuotidien')}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {t('transferVieCouranteHint')}
                  </span>
                </p>
                <div className="flex shrink-0 flex-col items-end">
                  <p className="font-mono text-sm tabular-nums">
                    {fmtMoney(plan.vieCouranteTransfer)}
                  </p>
                  {transferActionable && plan.vieCouranteTransfer.gt(0) && (
                    <TransferDoneControl
                      lineLabel={tc('virements.versQuotidien')}
                      fromAccountType="income_bills"
                      toAccountType="daily_card"
                      suggested={plan.vieCouranteTransfer.toDecimalPlaces(2).toNumber()}
                      plannedProvisions={0}
                      planYear={period.year}
                      planMonth={period.month}
                      today={todayIso}
                      statements={transferStatements}
                      line={lineState('income_bills', 'daily_card')}
                    />
                  )}
                </div>
              </li>
              <li className="flex items-center justify-between gap-4 py-2">
                <p className="min-w-0 text-sm font-medium">
                  {epargneGoesToEpargne
                    ? tc('virements.versProvisions')
                    : tc('virements.depuisProvisions')}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {t('transferEpargneHint', {
                      provision: fmtMoney(plan.epargneProvisionTarget),
                      bills: fmtMoney(plan.epargneBillsDue),
                    })}
                  </span>
                </p>
                <div className="flex shrink-0 flex-col items-end">
                  <p className="font-mono text-sm tabular-nums">{fmtMoney(epargneNetAbs)}</p>
                  {transferActionable && epargneNetAbs.gt(0) && (
                    <TransferDoneControl
                      lineLabel={
                        epargneGoesToEpargne
                          ? tc('virements.versProvisions')
                          : tc('virements.depuisProvisions')
                      }
                      fromAccountType={epargneFrom}
                      toAccountType={epargneTo}
                      suggested={epargneNetAbs.toDecimalPlaces(2).toNumber()}
                      plannedProvisions={plan.epargneProvisionPart.toNumber()}
                      planYear={period.year}
                      planMonth={period.month}
                      today={todayIso}
                      statements={transferStatements}
                      line={lineState(epargneFrom, epargneTo)}
                      splitOutdated={epargneSplitOutdated}
                    />
                  )}
                </div>
              </li>
              <li>
                <PrincipalApresFactures
                  detail={
                    principalApres && {
                      solde: principalApres.solde.toNumber(),
                      montant: principalApres.montant.toNumber(),
                      lignes: principalApres.lignes.map((l) => ({
                        id: `${l.source}:${l.id}`,
                        label: l.label,
                        montant: l.montant.toNumber(),
                        quand: l.rang
                          ? t('principalApresFacturesEcheance', {
                              jour: l.jour,
                              index: l.rang.index,
                              total: l.rang.total,
                            })
                          : t('principalApresFacturesJour', { jour: l.jour }),
                      })),
                    }
                  }
                  labels={{
                    titre: t('principalApresFactures', {
                      month: moisPhrase,
                      voyelle: commenceParVoyelle(moisPhrase) ? 'oui' : 'non',
                    }),
                    toggle: t('principalApresFacturesToggle'),
                    solde: t('principalApresFacturesSolde'),
                    resultat: t('principalApresFacturesResultat'),
                    absence: isCurrentMonth
                      ? t('principalApresFacturesSansSolde')
                      : t('principalApresFacturesAutreMois'),
                  }}
                  locale={locale}
                />
              </li>
            </ul>
          )}
        </Repli>
      )}

      {/* Mes comptes and Provisions read today's balances, whatever the month
          shown (@thierry, 24 Sept. 2026: October is prepared looking at what is
          there now) — so on another month, their key says so. */}
      <Repli
        titre={tc('replis.reserve')}
        cle={moisVu ? tc('replis.soldesAujourdhui') : tc('replis.cleReserve')}
        testId="repli-reserve"
      >
        <ProvisionHealthGaugeCard
          charges={cockpitCharges}
          payments={paymentsLedger}
          soldeEpargneActuel={soldeEpargneActuel}
          sansReleve={provisionsSansReleve}
          period={period}
          locale={locale}
        />
      </Repli>

      {showCommitments && (
        <Repli titre={tc('replis.engagements')} cle={cleEngagements} testId="repli-engagements">
          <EngagementsCard
            commitments={commitments}
            paidKeysByCommitment={paidKeysByCommitment}
            currentPeriod={period}
            locale={locale}
          />
        </Repli>
      )}

      {/* Le seul geste principal de la page, et il est en bas : ouvrir le
          simulateur ne répond pas à « où en est l'argent », il prolonge la
          réponse. */}
      <div className="grid gap-3 md:grid-cols-2">
        <Button asChild variant="outline" size="lg">
          <Link href="/app/charges">{t('ctaCharges')}</Link>
        </Button>
        <SimulatorDrawer
          charges={snapshot.rawCharges}
          revenus={snapshot.monthlyIncome ?? 0}
          engagementsMensuels={engagementsMensuels.toNumber()}
        />
      </div>
    </div>
  );
}
