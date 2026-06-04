import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';
import { money } from '@/lib/domain';
import { formatCurrency } from '@/lib/i18n/formatters';
import { SimulatorProjection } from '../SimulatorProjection';

function renderProj(delta: number) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <SimulatorProjection
        monthlyDelta={money(delta)}
        baseline={money(624)}
        fmtMoney={(v) => formatCurrency(v, 'fr-BE')}
      />
    </NextIntlClientProvider>,
  );
}

describe('<SimulatorProjection /> (area-chart redesign)', () => {
  it('renders a CSP-safe area chart for a positive delta (no inline style)', () => {
    const { container } = renderProj(19);
    expect(screen.getByTestId('simulator-projection')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
    // Gradient def + area + line + endpoint dot/halo.
    expect(container.querySelector('linearGradient')).not.toBeNull();
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
    // Strict CSP: geometry via SVG attributes only, never an inline style attr.
    expect(container.querySelector('[style]')).toBeNull();
    // Human cumul sentence present.
    expect(screen.getByTestId('simulator-cumul6m').textContent ?? '').toMatch(/réserve libre/i);
  });

  it('suppresses the chart and shows a neutral line when delta is zero', () => {
    renderProj(0);
    expect(screen.queryByTestId('simulator-projection')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByTestId('simulator-cumul6m')).toBeInTheDocument();
  });
});
