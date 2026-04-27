import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SimulatorClient, type SimulatorCopy } from '../SimulatorClient';
import { SCENARIO_DELTAS, DEFAULT_SCENARIO } from '../constants';

// Recharts renders SVG via a measuring container that depends on `ResizeObserver`.
// jsdom doesn't ship one, so we stub it for the duration of the test file.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const COPY: SimulatorCopy = {
  scenarioGroupLabel: 'Choisissez un scénario',
  scenarios: {
    steady: { name: 'Économe', tagline: 'Petit', description: '50 €' },
    balanced: { name: 'Standard', tagline: 'Conf', description: '100 €' },
    ambitious: { name: 'Ambitieux', tagline: 'Solide', description: '200 €' },
  },
  slider: {
    label: 'Montant',
    valueText: '{amount} euros par mois',
    unit: '€/mois',
  },
  chart: {
    ariaLabel: 'Projection 12 mois',
    xAxis: 'Mois',
    yAxis: 'Cumul',
    tooltip: 'Mois {month} : {amount}',
    fallbackTableCaption: 'Données mensuelles',
  },
  result: {
    title: 'En 12 mois :',
    amountAria: 'Montant : {amount}',
    caveat: 'Projection informative.',
  },
  cta: { label: 'Créer mon plan', href: '/signup' },
};

describe('<SimulatorClient />', () => {
  it('initialises with the default scenario and its delta on the slider', () => {
    render(<SimulatorClient locale="fr-BE" copy={COPY} />);
    const defaultRadio = screen.getByRole('radio', {
      name: new RegExp(COPY.scenarios[DEFAULT_SCENARIO].name, 'i'),
    });
    expect(defaultRadio).toHaveAttribute('aria-checked', 'true');

    const slider = screen.getByRole('slider', { name: COPY.slider.label });
    expect(slider).toHaveValue(String(SCENARIO_DELTAS[DEFAULT_SCENARIO]));
  });

  it('switching scenarios resets the slider to that scenarios delta', () => {
    render(<SimulatorClient locale="fr-BE" copy={COPY} />);
    fireEvent.click(screen.getByRole('radio', { name: /ambitieux/i }));

    const slider = screen.getByRole('slider', { name: COPY.slider.label });
    expect(slider).toHaveValue(String(SCENARIO_DELTAS.ambitious));
  });

  it('moving the slider updates the slider value (scenario card stays selected)', () => {
    render(<SimulatorClient locale="fr-BE" copy={COPY} />);
    const slider = screen.getByRole('slider', { name: COPY.slider.label });

    fireEvent.change(slider, { target: { value: '350' } });

    expect(slider).toHaveValue('350');
    // default scenario card is still visually selected
    const defaultRadio = screen.getByRole('radio', {
      name: new RegExp(COPY.scenarios[DEFAULT_SCENARIO].name, 'i'),
    });
    expect(defaultRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the CTA with the configured href', () => {
    render(<SimulatorClient locale="fr-BE" copy={COPY} />);
    const cta = screen.getByRole('link', { name: COPY.cta.label });
    expect(cta).toHaveAttribute('href', COPY.cta.href);
  });
});
