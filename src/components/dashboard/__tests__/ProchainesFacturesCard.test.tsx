import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { money, type Charge } from '@/lib/domain/types';
import type { PaymentLedger } from '@/lib/domain/cockpit';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const walk = (root: unknown, path: string[]): unknown =>
      path.reduce<unknown>((acc, key) => {
        if (typeof acc === 'object' && acc !== null && key in acc) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, root);
    const sub = walk(messages, namespace.split('.'));
    return (key: string, values?: Record<string, unknown>) => {
      const value = walk(sub, key.split('.'));
      if (typeof value !== 'string') return key;
      if (!values) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
    };
  },
}));

import { ProchainesFacturesCard } from '../ProchainesFacturesCard';

const NO_PAYMENTS: PaymentLedger = new Map();

function makeCharge(over: Partial<Charge> = {}): Charge {
  return {
    id: over.id ?? `c-${Math.random().toString(36).slice(2)}`,
    label: 'Loyer',
    amount: money('900'),
    frequency: 'monthly',
    dueMonth: 5,
    paymentMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentDay: 15,
    categoryId: null,
    isActive: true,
    paidFrom: 'principal',
    ...over,
  };
}

async function renderCard(input: { charges: Charge[]; todayIso?: string }) {
  return render(
    await ProchainesFacturesCard({
      charges: input.charges,
      payments: NO_PAYMENTS,
      todayIso: input.todayIso ?? '2026-05-10',
      locale: 'fr-BE',
    }),
  );
}

describe('<ProchainesFacturesCard /> (THI-192 cockpit v3 #5)', () => {
  it('renders the FR title from dashboard.upcomingBills', async () => {
    await renderCard({ charges: [] });
    expect(screen.getByTestId('prochaines-factures-card')).toBeInTheDocument();
    // The empty state copy is doctrine-locked to fr-BE for this test.
    expect(screen.getByTestId('prochaines-factures-empty')).toHaveTextContent(/aucune facture/i);
  });

  it('exposes a "Voir toutes" link to /app/charges (a11y-safe header CTA)', async () => {
    await renderCard({ charges: [makeCharge()] });
    const link = screen.getByTestId('prochaines-factures-link-all');
    expect(link).toHaveAttribute('href', '/app/charges');
  });

  it('groups a charge due in 5 days into bucket j7', async () => {
    // today=2026-05-10 + paymentDay=15 → 5d
    await renderCard({ charges: [makeCharge({ id: 'rent', paymentDay: 15 })] });
    expect(screen.getByTestId('prochaines-factures-bucket-j7')).toBeInTheDocument();
    expect(screen.queryByTestId('prochaines-factures-bucket-j14')).not.toBeInTheDocument();
    expect(screen.queryByTestId('prochaines-factures-bucket-j30')).not.toBeInTheDocument();
    expect(screen.getByTestId('prochaines-factures-row-rent')).toHaveTextContent('Loyer');
  });

  it('groups a charge due in 12 days into bucket j14', async () => {
    await renderCard({ charges: [makeCharge({ id: 'water', paymentDay: 22 })] });
    expect(screen.getByTestId('prochaines-factures-bucket-j14')).toBeInTheDocument();
    expect(screen.queryByTestId('prochaines-factures-bucket-j7')).not.toBeInTheDocument();
  });

  it('groups a charge due in 25 days into bucket j30', async () => {
    // 2026-05-10 + 25d → 2026-06-04. paymentDay=4, paymentMonths=[6].
    await renderCard({
      charges: [
        makeCharge({
          id: 'electricity',
          paymentMonths: [6],
          paymentDay: 4,
          frequency: 'annual',
        }),
      ],
    });
    expect(screen.getByTestId('prochaines-factures-bucket-j30')).toBeInTheDocument();
  });

  it('skips charges beyond the 30-day horizon (empty state visible if alone)', async () => {
    // Annual charge in July → 2026-07-15 (66d). Out of horizon.
    await renderCard({
      charges: [
        makeCharge({
          paymentMonths: [7],
          paymentDay: 15,
          frequency: 'annual',
        }),
      ],
    });
    expect(screen.getByTestId('prochaines-factures-empty')).toBeInTheDocument();
  });

  it('sorts charges intra-bucket by ascending urgency', async () => {
    await renderCard({
      charges: [
        makeCharge({ id: 'a', label: 'A', paymentDay: 17 }), // 7d
        makeCharge({ id: 'b', label: 'B', paymentDay: 12 }), // 2d
        makeCharge({ id: 'c', label: 'C', paymentDay: 14 }), // 4d
      ],
    });
    const bucket = screen.getByTestId('prochaines-factures-bucket-j7');
    const rows = bucket.querySelectorAll('li');
    expect(rows).toHaveLength(3);
    // Smallest daysUntilDue first
    expect(rows[0]?.textContent).toContain('B');
    expect(rows[1]?.textContent).toContain('C');
    expect(rows[2]?.textContent).toContain('A');
  });

  it('caps a bucket at 4 visible rows and surfaces a "+N autres" link', async () => {
    // 6 charges all falling in j7 (today=2026-05-10, paymentDay 11..16 → 1..6d).
    const charges = [11, 12, 13, 14, 15, 16].map((day, i) =>
      makeCharge({ id: `j7-${i}`, label: `Bill ${i}`, paymentDay: day }),
    );
    await renderCard({ charges });
    const bucket = screen.getByTestId('prochaines-factures-bucket-j7');
    expect(bucket.querySelectorAll('li')).toHaveLength(4);
    expect(screen.getByTestId('prochaines-factures-more-j7')).toHaveAttribute(
      'href',
      '/app/charges',
    );
  });

  it('renders a per-bucket total amount in EUR', async () => {
    await renderCard({
      charges: [
        makeCharge({ id: 'a', label: 'A', amount: money('100'), paymentDay: 12 }),
        makeCharge({ id: 'b', label: 'B', amount: money('50'), paymentDay: 14 }),
      ],
    });
    const bucket = screen.getByTestId('prochaines-factures-bucket-j7');
    // The Bucket header carries the total; the per-row amount also appears
    // for each charge. We only assert the header amount is present.
    expect(bucket).toHaveTextContent(/150/);
  });
});
