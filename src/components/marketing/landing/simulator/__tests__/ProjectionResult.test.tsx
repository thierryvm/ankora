import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProjectionResult } from '../ProjectionResult';

const COPY = {
  title: 'En 12 mois, vous auriez :',
  amountAria: 'Montant projeté à 12 mois : {amount}',
  caveat: 'Projection à titre informatif. Ankora ne fournit pas de conseil en placement.',
} as const;

describe('<ProjectionResult />', () => {
  it('computes 12 × monthlyAmount and formats it in EUR for fr-BE', () => {
    render(<ProjectionResult monthlyAmount={100} locale="fr-BE" copy={COPY} />);
    // 100 × 12 = 1200 → "1.200 €" in fr-BE Intl.NumberFormat (NBSP between number and €)
    const amount = screen.getByLabelText(/montant projeté à 12 mois/i);
    expect(amount.textContent).toMatch(/1[.\s  ]200/);
    expect(amount.textContent).toContain('€');
  });

  it('computes 12 × monthlyAmount and formats it in EUR for en', () => {
    render(<ProjectionResult monthlyAmount={50} locale="en" copy={COPY} />);
    // 50 × 12 = 600
    const amount = screen.getByLabelText(/projeté/i);
    expect(amount.textContent).toMatch(/600/);
    expect(amount.textContent).toContain('€');
  });

  it('renders the title and the FSMA caveat', () => {
    render(<ProjectionResult monthlyAmount={100} locale="fr-BE" copy={COPY} />);
    expect(screen.getByText(COPY.title)).toBeInTheDocument();
    expect(screen.getByText(COPY.caveat)).toBeInTheDocument();
  });

  it('substitutes {amount} placeholder in the aria-label with the formatted value', () => {
    render(<ProjectionResult monthlyAmount={200} locale="fr-BE" copy={COPY} />);
    // 200 × 12 = 2400
    const amount = screen.getByLabelText(/2[.\s  ]400/);
    expect(amount).toBeInTheDocument();
  });
});
