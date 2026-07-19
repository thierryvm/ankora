/**
 * ProchainesFacturesCard — THI-329 PR-C contract.
 *
 * Two sections replace the former J-7/J-14/J-30 buckets:
 *  - « Ce mois-ci »: unpaid bills due this month (anchored, overdue surfaced),
 *    sorted by date, capped at 5, headed by the live "reste à payer".
 *  - « À surveiller »: flagged (`isWatched`) bills not due this month, with
 *    their real next unpaid occurrence.
 *
 * Server Component testing pattern: render `await Component(props)` with a
 * minimal getTranslations mock walking the real fr-BE messages (ICU plurals
 * render raw — tests assert on testids/amounts, not on plural chips).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { money, type Charge } from '@/lib/domain/types';
import { paymentKey, type PaymentLedger } from '@/lib/domain/cockpit';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => {
    // Serialize object hrefs ({pathname, query}) like next-intl would.
    const url =
      typeof href === 'string'
        ? href
        : `${href.pathname}?${new URLSearchParams(href.query).toString()}`;
    return (
      <a href={url} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock('next-intl/server', () => ({
  // Real ICU engine (plurals, nested args) instead of a naive regex mock —
  // lets tests assert the actual user-facing copy ('2 factures de juin…').
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl');
    return createTranslator({
      locale: 'fr-BE',
      messages: messages as never,
      namespace: namespace as never,
    });
  },
}));

import { ProchainesFacturesCard } from '../ProchainesFacturesCard';

/** Reference "today": 18 July 2026 (Europe/Brussels anchoring is upstream). */
const TODAY = '2026-07-18';
const NO_PAYMENTS: PaymentLedger = new Map();

const paid = (ids: string[]): PaymentLedger =>
  new Map(ids.map((id) => [paymentKey(id, 2026, 7), true]));

function makeCharge(over: Partial<Charge> = {}): Charge {
  return {
    id: over.id ?? `c-${Math.random().toString(36).slice(2)}`,
    label: 'Loyer',
    amount: money('900'),
    frequency: 'monthly',
    dueMonth: 7,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentDay: 20,
    categoryId: null,
    isActive: true,
    isWatched: false,
    paidFrom: 'principal',
    ...over,
  };
}

async function renderCard(input: {
  charges: Charge[];
  payments?: PaymentLedger;
  todayIso?: string;
  forgotten?: { labels: readonly string[]; monthLabel: string; periodParam: string };
}) {
  return render(
    await ProchainesFacturesCard({
      charges: input.charges,
      payments: input.payments ?? NO_PAYMENTS,
      todayIso: input.todayIso ?? TODAY,
      locale: 'fr-BE',
      forgotten: input.forgotten,
    }),
  );
}

describe('<ProchainesFacturesCard /> — THI-329 PR-C', () => {
  it('renders the FR title and the view-all link', async () => {
    await renderCard({ charges: [makeCharge()] });
    expect(screen.getByText('Prochaines factures')).toBeInTheDocument();
    expect(screen.getByTestId('prochaines-factures-link-all')).toHaveAttribute(
      'href',
      '/app/charges',
    );
  });

  it('lists an unpaid due-this-month bill in « Ce mois-ci » with the live remaining amount', async () => {
    await renderCard({ charges: [makeCharge({ id: 'c1', paymentDay: 25 })] });
    const section = screen.getByTestId('prochaines-factures-this-month');
    expect(within(section).getByTestId('prochaines-factures-row-c1')).toBeInTheDocument();
    expect(screen.getByTestId('prochaines-factures-remaining')).toHaveTextContent(/900/);
    // Not overdue (day 25 > today 18) → no badge.
    expect(screen.queryByTestId('prochaines-factures-overdue-c1')).toBeNull();
  });

  it('surfaces a passed-but-unpaid bill as overdue, sorted first, with a dark-safe solid badge (THI-348)', async () => {
    await renderCard({
      charges: [
        makeCharge({ id: 'later', paymentDay: 25 }),
        makeCharge({ id: 'late', paymentDay: 3 }),
      ],
    });
    const badge = screen.getByTestId('prochaines-factures-overdue-late');
    expect(badge).toHaveTextContent('En retard');
    // a11y lock: white on SOLID danger (4.84:1 both themes), never
    // text-danger on a translucent tint (fails AA on the dark card).
    expect(badge.className).toMatch(/bg-danger/);
    expect(badge.className).toMatch(/text-white/);
    expect(badge.className).not.toMatch(/bg-danger\//);
    // Overdue (day 3) sorts before upcoming (day 25).
    const rows = within(screen.getByTestId('prochaines-factures-this-month'))
      .getAllByRole('listitem')
      .map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['prochaines-factures-row-late', 'prochaines-factures-row-later']);
  });

  it('drops a paid bill from « Ce mois-ci » and shows the success state when all are paid', async () => {
    await renderCard({
      charges: [makeCharge({ id: 'c1', paymentDay: 3 })],
      payments: paid(['c1']),
    });
    expect(screen.queryByTestId('prochaines-factures-row-c1')).toBeNull();
    expect(screen.getByTestId('prochaines-factures-all-paid')).toHaveTextContent(
      'Tout est payé ce mois',
    );
    expect(screen.queryByTestId('prochaines-factures-remaining')).toBeNull();
  });

  it('caps « Ce mois-ci » at 5 rows while the remaining amount covers ALL unpaid bills', async () => {
    const charges = Array.from({ length: 7 }, (_, i) =>
      makeCharge({ id: `c${i}`, paymentDay: 20 + i, amount: money('100') }),
    );
    await renderCard({ charges });
    const rows = within(screen.getByTestId('prochaines-factures-this-month')).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(5);
    // 7 × 100 € — the headline is the full month, not just the 5 visible.
    expect(screen.getByTestId('prochaines-factures-remaining')).toHaveTextContent(/700/);
  });

  it('lists a flagged bill NOT due this month in « À surveiller » with its real next occurrence', async () => {
    await renderCard({
      charges: [
        makeCharge({ id: 'quarterly', isWatched: true, paymentMonths: [1, 4, 10], paymentDay: 5 }),
      ],
    });
    const watched = screen.getByTestId('prochaines-factures-watched');
    expect(within(watched).getByTestId('prochaines-factures-row-quarterly')).toBeInTheDocument();
    // Next occurrence after July = 5 Oct 2026.
    expect(within(watched).getByText(/5 oct\. 2026/i)).toBeInTheDocument();
  });

  it('does NOT duplicate a flagged bill already listed in « Ce mois-ci »', async () => {
    await renderCard({
      charges: [makeCharge({ id: 'both', isWatched: true, paymentDay: 25 })],
    });
    expect(
      within(screen.getByTestId('prochaines-factures-this-month')).getByTestId(
        'prochaines-factures-row-both',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('prochaines-factures-watched')).toBeNull();
  });

  it('shows the educational hint when nothing is flagged', async () => {
    await renderCard({ charges: [makeCharge({ id: 'c1' })] });
    expect(screen.getByTestId('prochaines-factures-watched-hint')).toBeInTheDocument();
  });

  it('names the forgotten bills in the alert (plural form)', async () => {
    await renderCard({
      charges: [makeCharge()],
      forgotten: {
        labels: ['Taxe voiture', 'S.W.D.E'],
        monthLabel: 'juin',
        periodParam: '2026-06',
      },
    });
    expect(screen.getByTestId('prochaines-factures-forgotten')).toHaveTextContent(
      /Jamais cochées en juin : Taxe voiture, S\.W\.D\.E/,
    );
  });

  it('links the forgotten alert to the month-history view of the concerned month', async () => {
    await renderCard({
      charges: [makeCharge()],
      forgotten: { labels: ['Taxe voiture'], monthLabel: 'juin', periodParam: '2026-06' },
    });
    const link = screen.getByTestId('prochaines-factures-forgotten-link');
    expect(link).toHaveTextContent('Voir juin');
    expect(link.getAttribute('href')).toContain('period=2026-06');
  });

  it('uses the singular form for a single forgotten bill', async () => {
    await renderCard({
      charges: [makeCharge()],
      forgotten: { labels: ['Taxe voiture'], monthLabel: 'juin', periodParam: '2026-06' },
    });
    expect(screen.getByTestId('prochaines-factures-forgotten')).toHaveTextContent(
      /Jamais cochée en juin : Taxe voiture — vérifie qu'elle a bien été payée/,
    );
  });

  it('renders no forgotten alert when nothing was left unticked', async () => {
    await renderCard({ charges: [makeCharge()] });
    expect(screen.queryByTestId('prochaines-factures-forgotten')).toBeNull();
  });

  it('renders the global empty state when there is no active charge', async () => {
    await renderCard({ charges: [makeCharge({ id: 'off', isActive: false })] });
    expect(screen.getByTestId('prochaines-factures-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('prochaines-factures-this-month')).toBeNull();
  });
});
