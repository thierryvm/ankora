import { CreditCard, PiggyBank, Wallet, type LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';
import { money } from '@/lib/domain/types';
import type { AccountType } from '@/lib/schemas/account';

import { AccountCardEditableTitle } from './AccountCardEditableTitle';

type AccountCardProps = {
  accountType: AccountType;
  displayName: string;
  balance: number;
  locale: Locale;
};

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
export async function AccountCard({ accountType, displayName, balance, locale }: AccountCardProps) {
  const t = await getTranslations('app.accounts');
  const visual = TYPE_VISUAL[accountType];
  const Icon = visual.icon;
  const subLabel = t(`types.${accountType}`);
  const balanceLabel = formatCurrency(money(balance), locale);

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
        <p
          className="text-2xl font-semibold tracking-tight tabular-nums"
          aria-label={t('balance.srLabel', { label: displayName })}
        >
          {balanceLabel}
        </p>
      </CardContent>
    </Card>
  );
}
