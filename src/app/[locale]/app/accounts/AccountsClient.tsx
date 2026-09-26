'use client';

import { useId, useState, useTransition } from 'react';
import { Landmark, PiggyBank, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { updateMonthlyIncomeAction, updateVieCouranteTransferAction } from '@/lib/actions/accounts';
import {
  recordBalanceStatementAction,
  setMovementCancelledAction,
  setStatementCancelledAction,
} from '@/lib/actions/operations';
import { AmountSheet } from '@/components/operations/AmountSheet';
import { IncomeButton } from '@/components/operations/IncomeButton';
import { Repli } from '@/components/cockpit/Repli';
import type { AccountType } from '@/lib/domain/cockpit/types';
import { ACCOUNT_KIND_I18N_KEY, type AccountKind } from '@/lib/schemas/account';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { formatCurrency, formatMonthInSentence } from '@/lib/i18n/formatters';
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
    gap: { expected: number; read: number; amount: number } | null;
    reopenable: { id: string; statedOn: string } | null;
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
};

const ACCOUNT_ICONS: Record<AccountKind, typeof Landmark> = {
  principal: Landmark,
  vie_courante: Wallet,
  epargne: PiggyBank,
};

const ACCOUNT_ORDER: AccountKind[] = ['principal', 'vie_courante', 'epargne'];

function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function AccountsClient({
  monthlyIncome,
  vieCouranteMonthlyTransfer,
  balances,
  today,
  moisServis = [],
  ledgerFailed = false,
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
    </div>
  );
}

function MonthlyIncomeCard({ initialValue }: { initialValue: number | null }) {
  const t = useTranslations('app.accounts');
  const tIncome = useTranslations('app.accounts.income');
  const translateError = useActionErrorTranslator();
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
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
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={tIncome('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" className="min-h-11" disabled={isPending}>
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
  const translateError = useActionErrorTranslator();
  const [value, setValue] = useState(initialValue === null ? '' : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(value);
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
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={tTransfer('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <Button type="submit" className="min-h-11" disabled={isPending}>
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
        {view ? (
          <div data-testid="solde-lu">
            <p className="text-muted-foreground text-xs">
              {view.readIsStartingBalance
                ? tS('start', { date: formatDay(view.readStatedOn, locale) })
                : tS('read', { date: formatDay(view.readStatedOn, locale) })}
            </p>
            <p className="text-foreground font-mono text-xl tabular-nums">
              {fmt(view.readBalance)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{tS('none')}</p>
        )}

        {view?.computed !== null && view?.computed !== undefined ? (
          <div data-testid="solde-calcule">
            <p className="text-muted-foreground text-xs">{tS('computed')}</p>
            <p className="text-foreground font-mono tabular-nums">{fmt(view.computed)}</p>
            <p className="text-muted-foreground text-xs">{tS('computedHint')}</p>
          </div>
        ) : null}

        {view?.gap ? (
          <Repli
            titre={tS('gapTitle')}
            cle={fmt(view.gap.amount)}
            testId={`ecart-${row.accountType}`}
          >
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              <dt>{tS('gapExpected')}</dt>
              <dd className="font-mono tabular-nums">{fmt(view.gap.expected)}</dd>
              <dt>{tS('gapRead')}</dt>
              <dd className="font-mono tabular-nums">{fmt(view.gap.read)}</dd>
              <dt>{tS('gapAmount')}</dt>
              <dd className="font-mono tabular-nums">{fmt(view.gap.amount)}</dd>
            </dl>
            <p className="text-muted-foreground mt-2 text-xs">{tS('gapExplain')}</p>
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
 * title): each line says when it was received, and offers « Annuler » — or,
 * once cancelled, « Rétablir ». Nothing is deleted (rule 11).
 */
function IncomeLines({ lines }: { lines: IncomeLineProps[] }) {
  const t = useTranslations('operations.income');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const ids = useId();
  const [isPending, startTransition] = useTransition();

  function setCancelled(id: string, cancelled: boolean) {
    startTransition(async () => {
      const r = await setMovementCancelledAction({ id, cancelled });
      if (r.ok) toast.success(cancelled ? t('cancelled') : t('saved'));
      else toast.error(translateError(r.errorCode));
    });
  }

  return (
    <Repli titre={t('heading')} cle={t('count', { count: lines.length })} testId="argent-recu">
      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const textId = `${ids}-${line.id}`;
          return (
            <li key={line.id} data-income-line={line.id} className="flex flex-col gap-1">
              <div id={textId} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm break-words">
                  {line.description}
                  <span className="text-muted-foreground block text-xs">
                    {t('receivedOn', { date: formatDay(line.occurredOn, locale) })}
                    {line.countsFor
                      ? ` · ${t('countsFor', { month: formatMonthInSentence(Number(line.countsFor.slice(5, 7)), locale) })}`
                      : ''}
                    {line.cancelled ? ` · ${t('cancelled')}` : ''}
                  </span>
                </span>
                <span
                  className={`font-mono text-sm tabular-nums ${line.cancelled ? 'text-muted-foreground line-through' : ''}`}
                >
                  {formatCurrency(line.amount, locale)}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 self-start"
                disabled={isPending}
                aria-describedby={textId}
                onClick={() => setCancelled(line.id, !line.cancelled)}
              >
                {line.cancelled ? t('reopen') : t('cancel')}
              </Button>
            </li>
          );
        })}
      </ul>
    </Repli>
  );
}
