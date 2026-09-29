'use client';

import { useId, useState, useTransition } from 'react';
import { Landmark, PiggyBank, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { updateMonthlyIncomeAction, updateVieCouranteTransferAction } from '@/lib/actions/accounts';
import {
  recordBalanceStatementAction,
  correctIncomeAmountAction,
  setMovementCancelledAction,
  setFlowIncludedAction,
  setStatementCancelledAction,
} from '@/lib/actions/operations';
import { AmountSheet } from '@/components/operations/AmountSheet';
import { IncomeButton } from '@/components/operations/IncomeButton';
import { Repli } from '@/components/cockpit/Repli';
import type { IncomeCorrectionEffect } from '@/lib/actions/operations.types';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { ACCOUNT_KIND_I18N_KEY, type AccountKind } from '@/lib/schemas/account';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { formatCurrency, formatMonthInSentence } from '@/lib/i18n/formatters';
import { parseAmountInput } from '@/lib/i18n/parse-amount';
import type { Locale } from '@/i18n/routing';

/** One « argent reçu » of the month on this account, cancelled ones included. */
export type IncomeLineProps = {
  id: string;
  amount: number;
  occurredOn: string;
  description: string | null;
  cancelled: boolean;
  /** ADR-046 — `YYYY-MM` the income counts for, when it is not the month of its date. */
  countsFor?: string | null;
};

/** The lines of an expected balance, as plain numbers (all positive). */
export type ExpectedLinesProps = {
  fromStatedOn: string;
  fromBalance: number;
  fromIsStart: boolean;
  received: number;
  transfersIn: number;
  transfersOut: number;
  bills: number;
  expenses: number;
};

/** One operation since the statement, signed: `+` in, `−` out. */
export type SinceLineProps = {
  id: string;
  occurredOn: string;
  origin: 'income' | 'transfer' | 'bill' | 'expense';
  signedAmount: number;
};

/** Plain values only — computed by the server page, never a Decimal. */
export type AccountBalanceProps = {
  kind: AccountKind;
  accountType: AccountType;
  label: string;
  view: {
    readId: string;
    readBalance: number;
    readStatedOn: string;
    readIsStartingBalance: boolean;
    computed: number | null;
    /**
     * Tour 59 bis — the operations counted since the statement, as the cockpit
     * counts them (`soldeAffiche`). 0 = the statement alone.
     */
    operations: number;
    /**
     * Tour 59 ter — rule 10: the operations since the statement, one by one,
     * as the domain summed them into `computed` (statement + these = computed).
     */
    since?: SinceLineProps[];
    /**
     * `amount` is `read - expected` (ADR-045 D22): negative when the account
     * holds less than expected. `lines` are the domain's decomposition of
     * `expected` — summed there, never here.
     */
    gap: {
      expected: number;
      read: number;
      amount: number;
      lines: ExpectedLinesProps;
    } | null;
    reopenable: { id: string; statedOn: string } | null;
    /**
     * ADR-045 D21 — the same-day operations written after the read balance,
     * one by one (rule 10): a net under a single verb hid a +505 / −110 day.
     * D23 — `flows` are counted after it, `included` were answered « already
     * inside » (not counted again); each keeps its own answer.
     */
    sameDayAfter?: { flows: SameDayFlowProps[]; included?: SameDayFlowProps[] } | null;
  } | null;
  incomes?: IncomeLineProps[];
};

type Props = {
  monthlyIncome: number | null;
  vieCouranteMonthlyTransfer: number | null;
  balances: AccountBalanceProps[];
  today: string;
  /** Tour 42 — months already served by a « mon revenu du mois », for the entry proposal. */
  moisServis?: readonly string[];
  ledgerFailed?: boolean;
  /** Tour 57 — the money received of past budget months, most recent first. */
  pastIncomes?: PastIncomeMonthProps[];
};

const ACCOUNT_ICONS: Record<AccountKind, typeof Landmark> = {
  principal: Landmark,
  vie_courante: Wallet,
  epargne: PiggyBank,
};

const ACCOUNT_ORDER: AccountKind[] = ['principal', 'vie_courante', 'epargne'];

/**
 * The income and the transfer are « 0 or more, or empty to unset »
 * (`monthlyIncomeSchema`, `vieCouranteTransferSchema`). Empty stays `null` —
 * « not configured » — and is valid; something typed that does not read is
 * `invalid`, and never sent: before, a comma-typed « 5,90 » behind a numeric
 * field was blanked and sent as `null`, erasing the configured figure.
 */
function readOptionalAmount(raw: string): { amount: number | null; invalid: boolean } {
  if (raw.trim() === '') return { amount: null, invalid: false };
  const amount = parseAmountInput(raw, { allowZero: true });
  return { amount, invalid: amount === null };
}

export function AccountsClient({
  monthlyIncome,
  vieCouranteMonthlyTransfer,
  balances,
  today,
  moisServis = [],
  ledgerFailed = false,
  pastIncomes = [],
}: Props) {
  const t = useTranslations('app.accounts');
  const tOps = useTranslations('operations');
  const accountByKind = new Map<AccountKind, AccountBalanceProps>(balances.map((a) => [a.kind, a]));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        {ledgerFailed ? null : (
          <div className="flex flex-wrap gap-2">
            <IncomeButton
              today={today}
              moisServis={moisServis}
              statements={Object.fromEntries(
                balances.flatMap((b) =>
                  b.view && !b.view.readIsStartingBalance
                    ? [
                        [
                          b.accountType,
                          { statedOn: b.view.readStatedOn, balance: b.view.readBalance },
                        ],
                      ]
                    : [],
                ),
              )}
              accounts={ACCOUNT_ORDER.flatMap((kind) => {
                const row = accountByKind.get(kind);
                return row ? [{ accountType: row.accountType, label: row.label }] : [];
              })}
            />
          </div>
        )}
      </header>

      <MonthlyIncomeCard initialValue={monthlyIncome} />
      <VieCouranteTransferCard initialValue={vieCouranteMonthlyTransfer} />

      <section aria-labelledby="soldes-heading" className="flex flex-col gap-4">
        <h2 id="soldes-heading" className="text-xl font-semibold">
          {t('balancesHeading')}
        </h2>
        {ledgerFailed ? (
          <p role="alert" className="text-sm">
            {tOps('readFailed')}
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          {ACCOUNT_ORDER.map((kind) => {
            const row = accountByKind.get(kind);
            if (!row) return null;
            return ledgerFailed ? null : <AccountBalanceCard key={kind} row={row} today={today} />;
          })}
        </div>
      </section>

      {ledgerFailed || pastIncomes.length === 0 ? null : <PastIncomes months={pastIncomes} />}
    </div>
  );
}

function MonthlyIncomeCard({ initialValue }: { initialValue: number | null }) {
  const t = useTranslations('app.accounts');
  const tIncome = useTranslations('app.accounts.income');
  const tAmount = useTranslations('ui.amountField');
  const translateError = useActionErrorTranslator();
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();
  const { amount, invalid } = readOptionalAmount(value);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    startTransition(async () => {
      const result = await updateMonthlyIncomeAction({ monthlyIncome: amount });
      if (result.ok) toast.success(tIncome('toastSaved'));
      else toast.error(translateError(result.errorCode));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tIncome('title')}</CardTitle>
        <CardDescription>{tIncome('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            {/*
              Étiquette PROPRE à ce champ, et non le `app.accounts.amountLabel`
              partagé. Les deux cartes de cette page portaient toutes deux
              « Montant (€) » : à l'écran le titre de la carte les distingue, mais
              le nom accessible du champ — le seul que lit une synthèse vocale, et
              le seul sur lequel une sonde peut viser — était identique. Un
              `getByLabelText('Montant (€)')` remonte alors deux éléments, et un
              lecteur d'écran annonce deux fois le même champ.
              Cf. chantier 3 de docs/superpowers/specs/2026-08-08-refonte-app-architecture-cible.md
            */}
            <Label htmlFor="monthly-income">{tIncome('amountLabel')}</Label>
            <Input
              id="monthly-income"
              className="min-h-11"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={tIncome('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'monthly-income-error' : undefined}
            />
            {invalid && (
              <p id="monthly-income-error" className="text-danger text-xs font-medium">
                {tAmount('zeroAllowed')}
              </p>
            )}
          </div>
          <Button type="submit" className="min-h-11" disabled={isPending || invalid}>
            {isPending ? t('saving') : t('saveButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function VieCouranteTransferCard({ initialValue }: { initialValue: number | null }) {
  const t = useTranslations('app.accounts');
  const tTransfer = useTranslations('app.accounts.transfer');
  const tAmount = useTranslations('ui.amountField');
  const translateError = useActionErrorTranslator();
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();
  const { amount, invalid } = readOptionalAmount(value);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    startTransition(async () => {
      const result = await updateVieCouranteTransferAction({ amount });
      if (result.ok) toast.success(tTransfer('toastSaved'));
      else toast.error(translateError(result.errorCode));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tTransfer('title')}</CardTitle>
        <CardDescription>{tTransfer('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            {/* Même raison qu'au champ de revenu ci-dessus. */}
            <Label htmlFor="vie-transfer">{tTransfer('amountLabel')}</Label>
            <Input
              id="vie-transfer"
              className="min-h-11"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={tTransfer('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'vie-transfer-error' : undefined}
            />
            {invalid && (
              <p id="vie-transfer-error" className="text-danger text-xs font-medium">
                {tAmount('zeroAllowed')}
              </p>
            )}
          </div>
          <Button type="submit" className="min-h-11" disabled={isPending || invalid}>
            {isPending ? t('saving') : t('saveButton')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * One account: its READ balance, dated by the day it was read (`stated_on`,
 * never the end of the month), and — only when operations were written since —
 * the balance worked out from them. The two never share a label: a read
 * balance does not say « calculé », a computed one does not say « relevé ».
 *
 * The first statement of an account is its « solde de départ »: seeded by the
 * J2 migration or by sign-up, nobody read it on an extract.
 *
 * A negative balance is shown as it is, in the ordinary text colour: an
 * overdraft is a fact, not a fault.
 */
/**
 * « Attendu d'après tes opérations », opened on what makes it (rule 10): the
 * balance it starts from, then each kind of operation. A zero line says
 * nothing and is not shown; the starting balance always is.
 */
function ExpectedLines({ lines, fmt }: { lines: ExpectedLinesProps; fmt: (n: number) => string }) {
  const tS = useTranslations('operations.statement');
  const locale = useLocale() as Locale;
  const rows: Array<{ key: string; label: string; amount: number }> = [
    { key: 'received', label: tS('gapReceived'), amount: lines.received },
    { key: 'transfersIn', label: tS('gapTransfersIn'), amount: lines.transfersIn },
    { key: 'transfersOut', label: tS('gapTransfersOut'), amount: -lines.transfersOut },
    { key: 'bills', label: tS('gapBills'), amount: -lines.bills },
    { key: 'expenses', label: tS('gapExpenses'), amount: -lines.expenses },
  ].filter((r) => r.amount !== 0);
  const date = formatDay(lines.fromStatedOn, locale);
  return (
    <dd className="col-span-2">
      <ul
        data-testid="attendu-lignes"
        className="text-muted-foreground border-border mb-1 flex flex-col gap-0.5 border-l pl-3 text-xs"
      >
        <li data-line="from" className="flex justify-between gap-3">
          <span>{lines.fromIsStart ? tS('start', { date }) : tS('read', { date })}</span>
          <span className="font-mono tabular-nums">{fmt(lines.fromBalance)}</span>
        </li>
        {rows.map((r) => (
          <li key={r.key} data-line={r.key} className="flex justify-between gap-3">
            <span>{r.label}</span>
            <span className="font-mono tabular-nums">
              {r.amount > 0 ? `+${fmt(r.amount)}` : fmt(r.amount)}
            </span>
          </li>
        ))}
      </ul>
    </dd>
  );
}

/**
 * The name of one operation since the statement: the same words as the lines
 * of an expected balance, so an operation is called the same thing on both.
 */
const SINCE_LABEL: Record<
  SinceLineProps['origin'],
  (
    signed: number,
  ) => 'gapReceived' | 'gapTransfersIn' | 'gapTransfersOut' | 'gapBills' | 'gapExpenses'
> = {
  income: () => 'gapReceived',
  transfer: (signed) => (signed > 0 ? 'gapTransfersIn' : 'gapTransfersOut'),
  bill: () => 'gapBills',
  expense: () => 'gapExpenses',
};

export type SameDayFlowProps = {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  origin: 'income' | 'transfer' | 'bill' | 'expense';
};

/**
 * ADR-045 D23 — the operations of the read balance's day written after it,
 * each with ITS answer: « Déjà dedans » (the balance held it, it is not
 * counted again) or « Fait après » (it counts on top of the balance). Both
 * states stay visible and the other button undoes the answer (rule 11). The
 * answer lives on the server, never on this device.
 *
 * Lines are ordered by id, never by answer: a line must not jump away from
 * the finger that just answered it.
 */
function SameDayList({
  statementId,
  statedOn,
  flows,
  included,
}: {
  statementId: string;
  statedOn: string;
  flows: readonly SameDayFlowProps[];
  included: readonly SameDayFlowProps[];
}) {
  const t = useTranslations('operations.sameDay');
  const locale = useLocale() as Locale;
  // Mounted only when there is something to answer: a card without same-day
  // operations never needs the router.
  const router = useRouter();
  const translateError = useActionErrorTranslator();
  const baseId = useId();
  const [isPending, startTransition] = useTransition();
  const fmt = (n: number) => formatCurrency(n, locale);
  const insideIds = new Set(included.map((f) => f.id));
  const lines = [...flows, ...included].sort((a, b) => a.id.localeCompare(b.id));

  function answer(flowId: string, inside: boolean) {
    startTransition(async () => {
      const r = await setFlowIncludedAction({ statementId, flowId, included: inside });
      if (r.ok) {
        toast.success(t(inside ? 'flowIncludedDone' : 'flowAfterDone', { date: statedOn }));
        router.refresh();
      } else {
        toast.error(translateError(r.errorCode));
      }
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="meme-jour">
      <p className="text-muted-foreground text-xs">{t('cardHead', { date: statedOn })}</p>
      <p className="text-sm">{t('cardQuestion', { date: statedOn })}</p>
      <ul className="flex flex-col gap-3" data-testid="sameday-list">
        {lines.map((f, i) => {
          const inside = insideIds.has(f.id);
          const textId = `${baseId}-${i}`;
          return (
            <li key={f.id} data-sameday-flow={f.id} className="flex flex-col gap-1">
              <span id={textId} className="font-mono text-xs tabular-nums">
                {t(f.direction === 'in' ? 'cardFlowIn' : 'cardFlowOut', {
                  montant: fmt(f.amount),
                  origine: f.origin,
                })}
              </span>
              <div role="group" aria-labelledby={textId} className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={inside ? 'default' : 'outline'}
                  size="sm"
                  className="min-h-11 whitespace-normal"
                  aria-pressed={inside}
                  disabled={isPending}
                  data-testid={`sameday-included-${f.id}`}
                  onClick={() => {
                    if (!inside) answer(f.id, true);
                  }}
                >
                  {t('flowIncluded')}
                </Button>
                <Button
                  type="button"
                  variant={inside ? 'outline' : 'default'}
                  size="sm"
                  className="min-h-11 whitespace-normal"
                  aria-pressed={!inside}
                  disabled={isPending}
                  data-testid={`sameday-after-${f.id}`}
                  onClick={() => {
                    if (inside) answer(f.id, false);
                  }}
                >
                  {t('flowAfter')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccountBalanceCard({ row, today }: { row: AccountBalanceProps; today: string }) {
  const tKind = useTranslations('app.accounts.kind');
  const tBalance = useTranslations('app.accounts.balance');
  const tS = useTranslations('operations.statement');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const Icon = ACCOUNT_ICONS[row.kind];
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fmt = (n: number) => formatCurrency(n, locale);
  // A gap is read with its sign: « + » says the account holds more.
  const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
  const view = row.view;

  function setCancelled(id: string, cancelled: boolean) {
    startTransition(async () => {
      const r = await setStatementCancelledAction({ id, cancelled });
      if (r.ok) toast.success(cancelled ? tS('cancelled') : tS('saved'));
      else toast.error(translateError(r.errorCode));
    });
  }

  return (
    <Card data-account-balance={row.accountType}>
      <CardHeader className="pb-2">
        <div className="text-brand-700 flex items-center gap-2">
          <Icon className="h-5 w-5" aria-hidden />
          <CardTitle className="text-sm font-medium">{row.label}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {tKind(`${ACCOUNT_KIND_I18N_KEY[row.kind]}.description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Tour 59 bis — one big figure per account, the one the cockpit shows
            (`soldeAffiche`): the latest statement plus the operations since.
            The statement is its source, written small underneath. */}
        {view ? (
          <div data-testid="solde-affiche">
            <p className="text-muted-foreground text-xs">
              {view.operations > 0
                ? tS('computed')
                : view.readIsStartingBalance
                  ? tS('start', { date: formatDay(view.readStatedOn, locale) })
                  : tS('read', { date: formatDay(view.readStatedOn, locale) })}
            </p>
            <p
              className="text-foreground font-mono text-xl tabular-nums"
              data-testid="solde-affiche-montant"
            >
              {fmt(view.computed ?? view.readBalance)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{tS('none')}</p>
        )}

        {view && view.operations > 0 ? (
          <div className="flex flex-col gap-1" data-testid="solde-calcule">
            <p className="text-muted-foreground text-xs tabular-nums" data-testid="solde-lu">
              {tBalance(view.readIsStartingBalance ? 'readSinceStart' : 'readSince', {
                date: formatDay(view.readStatedOn, locale),
                montant: fmt(view.readBalance),
                count: view.operations,
              })}
            </p>
            <p className="text-muted-foreground text-xs">{tS('computedHint')}</p>
          </div>
        ) : null}

        {/* Outside the computed block: once every operation of the day is
            answered « Déjà dedans », nothing counts after the balance, and the
            answers must still be reachable to be undone (rule 11). */}
        {view?.sameDayAfter &&
        view.sameDayAfter.flows.length + (view.sameDayAfter.included?.length ?? 0) > 0 ? (
          <SameDayList
            statementId={view.readId}
            statedOn={formatDay(view.readStatedOn, locale)}
            flows={view.sameDayAfter.flows}
            included={view.sameDayAfter.included ?? []}
          />
        ) : null}

        {view && view.since && view.since.length > 0 ? (
          <Repli
            titre={tBalance('sinceTitle', { date: formatDay(view.readStatedOn, locale) })}
            cle={fmt(view.computed ?? view.readBalance)}
            testId={`depuis-releve-${row.accountType}`}
          >
            <ul className="flex flex-col gap-1 text-sm">
              {/* Date order, then id for a stable tie: the ledger hands the
                  movements first and the paid expenses and bills after. */}
              {[...view.since]
                .sort(
                  (a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id),
                )
                .map((line) => (
                  <li
                    key={line.id}
                    data-since-line={line.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 break-words">
                      <span className="text-muted-foreground block text-xs">
                        {formatDay(line.occurredOn, locale)}
                      </span>
                      {tS(SINCE_LABEL[line.origin](line.signedAmount))}
                    </span>
                    <span className="font-mono tabular-nums">{signed(line.signedAmount)}</span>
                  </li>
                ))}
            </ul>
          </Repli>
        ) : null}

        {view?.gap ? (
          <Repli
            titre={tS('gapTitle')}
            cle={signed(view.gap.amount)}
            testId={`ecart-${row.accountType}`}
          >
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt>{tS('gapExpected')}</dt>
              <dd className="font-mono tabular-nums">{fmt(view.gap.expected)}</dd>
              <ExpectedLines lines={view.gap.lines} fmt={fmt} />
              <dt>{tS('gapRead')}</dt>
              <dd className="font-mono tabular-nums">{fmt(view.gap.read)}</dd>
              <dt>{tS('gapAmount')}</dt>
              <dd className="font-mono tabular-nums">{signed(view.gap.amount)}</dd>
            </dl>
            <p className="text-muted-foreground mt-2 text-xs">
              {tS(view.gap.amount < 0 ? 'gapLess' : 'gapMore', {
                montant: fmt(Math.abs(view.gap.amount)),
              })}
            </p>
          </Repli>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            aria-label={tS('openAria', { name: row.label })}
            onClick={() => setOpen(true)}
          >
            {tS('open')}
          </Button>
          {view && !view.readIsStartingBalance ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={isPending}
              onClick={() => setCancelled(view.readId, true)}
            >
              {tS('cancel')}
            </Button>
          ) : null}
          {view?.reopenable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              disabled={isPending}
              onClick={() => setCancelled(view.reopenable!.id, false)}
            >
              {tS('reopen', { date: formatDay(view.reopenable.statedOn, locale) })}
            </Button>
          ) : null}
        </div>

        {row.incomes && row.incomes.length > 0 ? <IncomeLines lines={row.incomes} /> : null}

        <p className="text-muted-foreground text-xs">
          {tBalance('manualNotice')} {tKind(`${ACCOUNT_KIND_I18N_KEY[row.kind]}.usage`)}
        </p>

        {open ? (
          <AmountSheet
            open={open}
            onClose={() => setOpen(false)}
            testId="feuille-releve"
            title={tS('title')}
            question={tS('question')}
            hint={tS('hint')}
            dateLabel={tS('date')}
            initialAmount={null}
            initialDate={today}
            allowNegative
            successMessage={tS('saved')}
            onSubmit={(balance, statedOn) =>
              recordBalanceStatementAction({ accountType: row.accountType, balance, statedOn })
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The month's « argent reçu » on one account, behind a fold (its count in the
 * title): each line says when it was received, and offers « Corriger le
 * montant » and « Annuler » — or, once cancelled, « Rétablir ». Nothing is
 * deleted (rule 11).
 */
function IncomeLines({ lines }: { lines: IncomeLineProps[] }) {
  const t = useTranslations('operations.income');
  return (
    <Repli titre={t('heading')} cle={t('count', { count: lines.length })} testId="argent-recu">
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <IncomeLine key={line.id} line={line} />
        ))}
      </ul>
    </Repli>
  );
}

/**
 * Tour 57 — one line of money received, wherever it is listed (the card of
 * its account, or a past month): its figures, and the same gestures.
 */
function IncomeLine({ line, accountLabel }: { line: IncomeLineProps; accountLabel?: string }) {
  const t = useTranslations('operations.income');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const textId = useId();
  const [isPending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(false);

  function setCancelled(cancelled: boolean) {
    startTransition(async () => {
      const r = await setMovementCancelledAction({ id: line.id, cancelled });
      if (r.ok) toast.success(cancelled ? t('cancelled') : t('saved'));
      else toast.error(translateError(r.errorCode));
    });
  }

  // The confirmation says what the balance on screen did — the server measured
  // it with the function the cards use (never guessed here).
  function correctedMessage(data: unknown): string {
    const effect = data as IncomeCorrectionEffect | undefined;
    if (effect?.effet === 'ancre' && effect.ecart) {
      return t('correctedAnchoredGap', {
        date: formatDay(effect.releveLe, locale),
        avant: formatCurrency(effect.ecart.avant, locale),
        apres: formatCurrency(effect.ecart.apres, locale),
      });
    }
    if (effect?.effet === 'ancre') {
      return t('correctedAnchored', { date: formatDay(effect.releveLe, locale) });
    }
    if (effect?.effet === 'change') {
      return t('correctedChanged', {
        avant: formatCurrency(effect.avant, locale),
        apres: formatCurrency(effect.apres, locale),
      });
    }
    if (effect?.effet === 'identique') return t('correctedSame');
    return t('correctedNoBalance');
  }

  return (
    <li data-income-line={line.id} className="flex flex-col gap-1">
      <div id={textId} className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm break-words">
          {line.description}
          <span className="text-muted-foreground block text-xs">
            {t('receivedOn', { date: formatDay(line.occurredOn, locale) })}
            {accountLabel ? ` · ${t('pastOnAccount', { account: accountLabel })}` : ''}
            {line.countsFor
              ? ` · ${t('countsFor', { month: formatMonthInSentence(Number(line.countsFor.slice(5, 7)), locale) })}`
              : ''}
            {line.cancelled ? ` · ${t('cancelled')}` : ''}
          </span>
        </span>
        <span
          data-testid="argent-recu-montant"
          className={`font-mono text-sm tabular-nums ${line.cancelled ? 'text-muted-foreground line-through' : ''}`}
        >
          {formatCurrency(line.amount, locale)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {line.cancelled ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={isPending}
            aria-describedby={textId}
            data-testid="argent-recu-corriger"
            onClick={() => setCorrecting(true)}
          >
            {t('correct')}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={isPending}
          aria-describedby={textId}
          onClick={() => setCancelled(!line.cancelled)}
        >
          {line.cancelled ? t('reopen') : t('cancel')}
        </Button>
      </div>
      {correcting ? (
        <AmountSheet
          open={correcting}
          onClose={() => setCorrecting(false)}
          testId="feuille-corriger-argent-recu"
          title={t('correctTitle')}
          question={t('correctQuestion')}
          hint={t('correctHint')}
          dateLabel={t('date')}
          dateReadOnly
          initialAmount={line.amount}
          initialDate={line.occurredOn}
          allowNegative={false}
          successMessage={t('correctedNoBalance')}
          successMessageOf={correctedMessage}
          onSubmit={(amount) => correctIncomeAmountAction({ id: line.id, amount })}
        />
      ) : null}
    </li>
  );
}

/** Plain values only — one past budget month of money received. */
export type PastIncomeMonthProps = {
  /** `YYYY-MM`, the budget month. */
  month: string;
  /** Sum of the standing lines, summed by the domain (rule 10). */
  total: number;
  lines: Array<IncomeLineProps & { accountLabel: string }>;
};

/**
 * Tour 57 — « chaque centime doit pouvoir être retrouvé »: the money received
 * of past budget months, one fold per month, its total opening on its lines.
 */
function PastIncomes({ months }: { months: PastIncomeMonthProps[] }) {
  const t = useTranslations('operations.income');
  const locale = useLocale() as Locale;
  const monthName = (m: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${m}-01T00:00:00Z`),
    );
  return (
    <section
      aria-labelledby="argent-recu-passe-titre"
      className="flex flex-col gap-3"
      data-testid="argent-recu-passe"
    >
      <h2 id="argent-recu-passe-titre" className="text-lg font-semibold">
        {t('pastHeading')}
      </h2>
      <p className="text-muted-foreground text-xs">{t('pastTotalNote')}</p>
      {months.map((m) => (
        <Repli
          key={m.month}
          titre={monthName(m.month)}
          cle={t('pastMonthKey', {
            total: formatCurrency(m.total, locale),
            count: m.lines.length,
          })}
          testId={`argent-recu-${m.month}`}
        >
          <ul className="flex flex-col gap-3">
            {m.lines.map((line) => (
              <IncomeLine key={line.id} line={line} accountLabel={line.accountLabel} />
            ))}
          </ul>
        </Repli>
      ))}
    </section>
  );
}
