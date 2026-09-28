import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { Expenses } from '@/lib/domain';
import { todayIsoInBrussels } from '@/lib/data/month-situation';
import { fenetreDuMoisDeBudget } from '@/lib/domain/budget/mois-de-budget';
import { getCategories } from '@/lib/data/categories';
import { getExpenses, getSnapshotWith } from '@/lib/data/workspace-snapshot';
import { categoriesDuMois } from '@/lib/domain/expenses/categories-du-mois';
import type { AccountKind } from '@/lib/domain/types';

import { ExpensesClient } from './ExpensesClient';

// PR-D5 i18n: was a hardcoded FR string. See `charges/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.expenses');
  return { title: t('title') };
}

/** The order of the « Depuis » chips — the order of the accounts screen. */
const ACCOUNT_ORDER: readonly AccountKind[] = ['principal', 'vie_courante', 'epargne'];

export default async function ExpensesPage() {
  const [snapshot, [expenses, categories]] = await getSnapshotWith('/app/expenses', (workspaceId) =>
    Promise.all([getExpenses(workspaceId), getCategories(workspaceId)]),
  );
  const locale = await getLocale();
  const toRaw = (e: (typeof expenses)[number]) => ({
    id: e.id,
    label: e.label,
    amount: e.amount.toNumber(),
    occurredOn: e.occurredOn,
    note: e.note,
    paidFrom: e.paidFrom,
    categoryName: categories.find((c) => c.id === e.categoryId)?.name ?? null,
  });
  // The current month comes COMPLETE from `monthlyExpenses` — the same source
  // as `spentThisMonth` below — because the list groups it by description and
  // those groups decompose that total (rule 10). The capped `getExpenses` read
  // (50 rows) only supplies the OTHER months: see `currentMonthWithEarlier`.
  //
  // ADR-047 — « the current month » is the BUDGET month running now: its rows
  // are known by id (a 29 September expense can belong to October), so the
  // earlier rows are the capped ones that are not among them.
  const duMois = new Set(snapshot.monthlyExpenses.map((e) => e.id));
  const rawExpenses = [
    ...snapshot.monthlyExpenses,
    ...expenses.filter((e) => !duMois.has(e.id)),
  ].map(toRaw);

  // Days elapsed in the budget month (Europe/Brussels), today included.
  const { year, month } = snapshot.moisDeBudget;
  const todayIso = todayIsoInBrussels();
  const fenetre = fenetreDuMoisDeBudget(snapshot.moisDeBudget, snapshot.revenus);
  const ecoules =
    Math.round(
      (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${fenetre.debut}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const joursEcoules = Math.min(fenetre.jours, Math.max(1, ecoules));
  // Said on the page only when the budget month is not the calendar month.
  const jour = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const periodeBudget = fenetre.calendaire
    ? null
    : {
        debut: jour.format(new Date(`${fenetre.debut}T00:00:00Z`)),
        fin: jour.format(new Date(`${fenetre.fin}T00:00:00Z`)),
      };

  // Authoritative current-month spend: summed from `monthlyExpenses` (complete,
  // no 50-row cap) so the figure never under-reports (Sourcery #242).
  const spentThisMonth = Expenses.totalAmount(snapshot.monthlyExpenses).toNumber();
  // « Catégories » (G-cat): the SAME complete source, grouped by the domain's
  // `summarizeExpenses` — the card's total is the sum of its groups (rule 10).
  const categoryGroups = categoriesDuMois(snapshot.monthlyExpenses, categories).map((g) => ({
    id: g.id,
    nom: g.nom,
    couleur: g.couleur,
    total: g.total.toNumber(),
    lignes: g.lignes.map((e) => ({
      id: e.id,
      label: e.label,
      montant: e.amount.toNumber(),
      date: e.occurredOn.slice(0, 10),
    })),
  }));

  return (
    <ExpensesClient
      expenses={rawExpenses}
      spentThisMonth={spentThisMonth}
      currentYear={year}
      currentMonth={month}
      joursEcoules={joursEcoules}
      periodeBudget={periodeBudget}
      monthIds={[...duMois]}
      categoryGroups={categoryGroups}
      accounts={ACCOUNT_ORDER.flatMap((kind) => {
        const account = snapshot.accounts.find((a) => a.kind === kind);
        return account ? [{ kind, label: account.displayName }] : [];
      })}
    />
  );
}
