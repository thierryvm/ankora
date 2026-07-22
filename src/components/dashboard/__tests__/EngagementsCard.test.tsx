/**
 * EngagementsCard — dashboard surface of the commitments epic (PR-3).
 * Answers at a glance: how much do I still owe, and what falls due this month?
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import type { CommitmentRow } from '@/lib/data/commitment-row';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href.pathname} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const { createTranslator } = await import('next-intl');
    return createTranslator({
      locale: 'fr-BE',
      messages: messages as never,
      namespace: namespace as never,
    });
  },
}));

import { EngagementsCard } from '../EngagementsCard';

/** Car loan: 4 200 € over 17 monthly instalments of 250 €, anchored Jan 2026. */
const carLoan: CommitmentRow = {
  id: 'car',
  label: 'Crédit voiture',
  kind: 'debt',
  totalAmount: 4200,
  installmentAmount: 250,
  installmentsTotal: 17,
  startYear: 2026,
  startMonth: 1,
  paymentDay: 15,
  frequency: 'monthly',
  notes: null,
  isActive: true,
};

async function renderCard(input: {
  commitments: CommitmentRow[];
  paidKeysByCommitment?: Record<string, string[]>;
  currentPeriod?: { year: number; month: number };
}) {
  return render(
    await EngagementsCard({
      commitments: input.commitments,
      paidKeysByCommitment: input.paidKeysByCommitment ?? {},
      currentPeriod: input.currentPeriod ?? { year: 2026, month: 3 },
      locale: 'fr-BE',
    }),
  );
}

describe('<EngagementsCard />', () => {
  it('renders nothing at all when there is no commitment', async () => {
    const { container } = await renderCard({ commitments: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the total still owed and links to the page', async () => {
    await renderCard({ commitments: [carLoan] });
    expect(screen.getByTestId('engagements-total-remaining')).toHaveTextContent(/4[  ]200/);
    expect(screen.getByTestId('engagements-card-link')).toHaveAttribute('href', '/app/commitments');
  });

  it('nets the ticked instalments out of the total', async () => {
    await renderCard({
      commitments: [carLoan],
      paidKeysByCommitment: { car: ['2026-1', '2026-2'] },
    });
    expect(screen.getByTestId('engagements-total-remaining')).toHaveTextContent(/3[  ]700/);
  });

  it('surfaces what is due this month, and hides it once ticked', async () => {
    const { unmount } = await renderCard({
      commitments: [carLoan],
      currentPeriod: { year: 2026, month: 3 },
    });
    expect(screen.getByTestId('engagements-due-this-month')).toHaveTextContent(/250/);
    unmount();
    await renderCard({
      commitments: [carLoan],
      paidKeysByCommitment: { car: ['2026-3'] },
      currentPeriod: { year: 2026, month: 3 },
    });
    expect(screen.queryByTestId('engagements-due-this-month')).toBeNull();
  });

  it('drops a fully settled commitment — it no longer weighs on the cockpit', async () => {
    const all = Array.from(
      { length: 17 },
      (_, i) => `${2026 + Math.floor(i / 12)}-${(i % 12) + 1}`,
    );
    const { container } = await renderCard({
      commitments: [carLoan],
      paidKeysByCommitment: { car: all },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the instalments left and the end month per row', async () => {
    await renderCard({
      commitments: [carLoan],
      paidKeysByCommitment: { car: ['2026-1', '2026-2'] },
    });
    const row = screen.getByTestId('engagements-row-car');
    // 17 − 2 = 15 left; last instalment lands in May 2027.
    expect(row).toHaveTextContent(/15 échéances restantes/);
    expect(row).toHaveTextContent(/mai 2027/i);
  });

  it('renders a one-off as a single dated amount', async () => {
    const oneOff: CommitmentRow = {
      ...carLoan,
      id: 'boiler',
      label: 'Entretien chaudière',
      kind: 'one_off',
      totalAmount: 340,
      installmentAmount: null,
      installmentsTotal: 1,
      startMonth: 10,
    };
    await renderCard({ commitments: [oneOff], currentPeriod: { year: 2026, month: 3 } });
    const row = screen.getByTestId('engagements-row-boiler');
    expect(row).toHaveTextContent(/octobre 2026/i);
    expect(row).not.toHaveTextContent(/échéances restantes/);
  });

  it('aggregates the total across several commitments', async () => {
    const spf: CommitmentRow = {
      ...carLoan,
      id: 'spf',
      label: 'Arrangement SPF',
      kind: 'installment_plan',
      totalAmount: 1600,
      installmentAmount: 200,
      installmentsTotal: 8,
    };
    await renderCard({
      commitments: [carLoan, spf],
      // Car: 1 ticked → 3 950 €. SPF: 2 ticked → 1 200 €. Total 5 150 €.
      paidKeysByCommitment: { car: ['2026-1'], spf: ['2026-1', '2026-2'] },
    });
    expect(screen.getByTestId('engagements-total-remaining')).toHaveTextContent(/5[  ]150/);
    expect(screen.getByTestId('engagements-row-car')).toBeInTheDocument();
    expect(screen.getByTestId('engagements-row-spf')).toBeInTheDocument();
  });

  it('sums this month only over the commitments NOT yet ticked (mixed state)', async () => {
    const spf: CommitmentRow = {
      ...carLoan,
      id: 'spf',
      label: 'Arrangement SPF',
      kind: 'installment_plan',
      totalAmount: 1600,
      installmentAmount: 200,
      installmentsTotal: 8,
    };
    await renderCard({
      commitments: [carLoan, spf],
      // Both fall due in March; only the car is ticked → only the SPF's 200 €
      // may still be counted as due this month.
      paidKeysByCommitment: { car: ['2026-3'] },
      currentPeriod: { year: 2026, month: 3 },
    });
    const due = screen.getByTestId('engagements-due-this-month');
    expect(due).toHaveTextContent(/200/);
    expect(due).not.toHaveTextContent(/450/);
  });

  it('hides the due-this-month figure once every commitment is ticked', async () => {
    const spf: CommitmentRow = {
      ...carLoan,
      id: 'spf',
      totalAmount: 1600,
      installmentAmount: 200,
      installmentsTotal: 8,
    };
    await renderCard({
      commitments: [carLoan, spf],
      paidKeysByCommitment: { car: ['2026-3'], spf: ['2026-3'] },
      currentPeriod: { year: 2026, month: 3 },
    });
    expect(screen.queryByTestId('engagements-due-this-month')).toBeNull();
    // The card itself stays: both still carry a balance.
    expect(screen.getByTestId('engagements-card')).toBeInTheDocument();
  });

  it('keeps the card when one commitment is settled and another is not', async () => {
    const settled: CommitmentRow = {
      ...carLoan,
      id: 'done',
      label: 'Petit crédit',
      totalAmount: 500,
      installmentAmount: 250,
      installmentsTotal: 2,
    };
    await renderCard({
      commitments: [settled, carLoan],
      paidKeysByCommitment: { done: ['2026-1', '2026-2'] },
    });
    expect(screen.queryByTestId('engagements-row-done')).toBeNull();
    expect(screen.getByTestId('engagements-row-car')).toBeInTheDocument();
    // Only the live commitment counts toward the total.
    expect(screen.getByTestId('engagements-total-remaining')).toHaveTextContent(/4[  ]200/);
  });

  it('ignores an inactive commitment', async () => {
    const { container } = await renderCard({
      commitments: [{ ...carLoan, isActive: false }],
    });
    expect(container).toBeEmptyDOMElement();
  });
});
