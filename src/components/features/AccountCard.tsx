import { CreditCard, PiggyBank, Wallet, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { money } from '@/lib/domain/types';
import type { AccountType } from '@/lib/schemas/account';

import { AccountCardEditableTitle } from './AccountCardEditableTitle';

type AccountCardProps = {
  accountType: AccountType;
  displayName: string;
  /**
   * Today's balance as the Accounts page shows it (tour 59): the latest
   * statement plus the operations since. `null`: no statement, so no figure.
   * Plain values only — this crosses into a Server Component tree.
   */
  solde: SoldeCarte | null;
  locale: Locale;
  /**
   * Optional inline hint rendered below the balance — used by the dashboard
   * to surface the "Set my daily allowance" CTA on the `daily_card` row when
   * `vie_courante_monthly_transfer` is unset (PR-D3 mini-CTA).
   */
  extraHint?: React.ReactNode;
};

export type SoldeCarte = {
  montant: number;
  /** YYYY-MM-DD, the day the statement was read. */
  luLe: string;
  depart: boolean;
  /** Operations counted on top of the statement (0 = the statement alone). */
  operations: number;
};

function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

const TYPE_VISUAL: Record<
  AccountType,
  Readonly<{ icon: LucideIcon; iconColor: string; ringColor: string }>
> = {
  income_bills: {
    icon: Wallet,
    iconColor: 'text-blue-500',
    ringColor: 'ring-blue-500/15',
  },
  provisions: {
    icon: PiggyBank,
    iconColor: 'text-emerald-500',
    ringColor: 'ring-emerald-500/15',
  },
  daily_card: {
    icon: CreditCard,
    iconColor: 'text-purple-500',
    ringColor: 'ring-purple-500/15',
  },
};

/**
 * Cockpit account card (3 are rendered side-by-side on the dashboard).
 *
 * - Server Component: drives the static visual + reads i18n.
 * - Delegates the title to <AccountCardEditableTitle/>, the only Client
 *   Component slice (so we keep optimistic-update wiring narrow).
 *
 * Visual semantics per account_type are locked by the canonical spec
 * `dashboard-cockpit-vraie-vision-2026-05-03.md` (Bloc 1).
 */
export async function AccountCard({
  accountType,
  displayName,
  solde,
  locale,
  extraHint,
}: AccountCardProps) {
  const t = await getTranslations('app.accounts');
  const visual = TYPE_VISUAL[accountType];
  const Icon = visual.icon;
  const subLabel = t(`types.${accountType}`);
  // Rule 10 — the figure says where it comes from, and opens on the Accounts
  // page, which carries its breakdown.
  const source =
    solde === null
      ? t('balance.none')
      : solde.operations > 0
        ? t(solde.depart ? 'balance.sourceSinceStart' : 'balance.sourceSince', {
            date: formatDay(solde.luLe, locale),
            count: solde.operations,
          })
        : t(solde.depart ? 'balance.sourceStart' : 'balance.sourceRead', {
            date: formatDay(solde.luLe, locale),
          });

  return (
    <Card
      className={`group ring-1 ring-inset ${visual.ringColor} transition-shadow hover:shadow-md`}
      data-account-type={accountType}
    >
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Icon className={`h-6 w-6 shrink-0 ${visual.iconColor}`} aria-hidden strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <AccountCardEditableTitle
            accountType={accountType}
            displayName={displayName}
            subLabel={subLabel}
          />
        </div>
      </CardHeader>
      <CardContent>
        {solde !== null ? (
          <p
            className="text-2xl font-semibold tracking-tight tabular-nums"
            aria-label={t('balance.srLabel', { label: displayName })}
          >
            {formatCurrency(money(solde.montant), locale)}
          </p>
        ) : null}
        <p className="text-muted-foreground mt-1 text-xs" data-testid="solde-source">
          {source}
        </p>
        <Link
          href="/app/accounts"
          aria-label={t('balance.detailAria', { name: displayName })}
          className="text-muted-foreground hover:text-brand-700 -my-1.5 inline-flex min-h-11 items-center text-xs underline underline-offset-2"
        >
          {t('balance.detail')}
        </Link>
        {extraHint ? <div className="mt-2">{extraHint}</div> : null}
      </CardContent>
    </Card>
  );
}
