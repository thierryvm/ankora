import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    let cursor: unknown = messages;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)?.[part];
    }
    return (key: string, params?: Record<string, string | number>) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return value.replace(/\{(\w+)\}/g, (_, k: string) =>
          k in params ? String(params[k]) : `{${k}}`,
        );
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

import { WhatIfDemoClient } from '../WhatIfDemoClient';
import { RESERVE_BASELINE_6M, THRESHOLD_ZONES, WHAT_IF_SCENARIOS } from '../simulator/scenarios';

describe('<WhatIfDemoClient />', () => {
  it('renders one button per scenario', () => {
    render(<WhatIfDemoClient />);
    expect(screen.getByRole('button', { name: /Renégocier mon GSM/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Changer de fournisseur d'électricité/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Couper deux streamings/i })).toBeInTheDocument();
  });

  it('marks the first scenario as active via aria-pressed on initial render', () => {
    render(<WhatIfDemoClient />);
    const gsm = screen.getByRole('button', { name: /Renégocier mon GSM/i });
    const elec = screen.getByRole('button', { name: /Changer de fournisseur d'électricité/i });
    const stream = screen.getByRole('button', { name: /Couper deux streamings/i });
    expect(gsm).toHaveAttribute('aria-pressed', 'true');
    expect(elec).toHaveAttribute('aria-pressed', 'false');
    expect(stream).toHaveAttribute('aria-pressed', 'false');
  });

  it('flips aria-pressed when the user picks a different scenario', () => {
    render(<WhatIfDemoClient />);
    const gsm = screen.getByRole('button', { name: /Renégocier mon GSM/i });
    const stream = screen.getByRole('button', { name: /Couper deux streamings/i });

    fireEvent.click(stream);

    expect(stream).toHaveAttribute('aria-pressed', 'true');
    expect(gsm).toHaveAttribute('aria-pressed', 'false');
  });

  it('snaps the slider to the new scenario default when switching scenarios', () => {
    render(<WhatIfDemoClient />);
    const elec = screen.getByRole('button', { name: /Changer de fournisseur d'électricité/i });
    const elecScenario = WHAT_IF_SCENARIOS.find((s) => s.id === 'elec')!;

    fireEvent.click(elec);

    const slider = screen.getByRole('slider');
    expect((slider as HTMLInputElement).value).toBe(String(elecScenario.default));
  });

  it('updates the monthly + annual figures when the slider value changes', () => {
    const { container } = render(<WhatIfDemoClient />);
    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '20' } });

    // Monthly "+20 €" appears in the savings header
    expect(within(container).getByText(/\+20\s*€/)).toBeInTheDocument();
    // Annual = 20 × 12 = 240 €
    expect(within(container).getByText(/\+240\s*€/)).toBeInTheDocument();
  });

  it('renders the fleche sub-text using Math.round(monthly × 0.7)', () => {
    const { container } = render(<WhatIfDemoClient />);
    const slider = screen.getByRole('slider');

    // 10 × 0.7 = 7 → "Ankora pourrait flécher +7 €/mois ..."
    fireEvent.change(slider, { target: { value: '10' } });
    expect(within(container).getByText(/flécher \+7 €\/mois/)).toBeInTheDocument();
  });

  it('renders one circle per month in the projection (6 points)', () => {
    const { container } = render(<WhatIfDemoClient />);
    // `container.querySelectorAll('svg circle')` would also match Lucide icons
    // (Sparkles, TrendingUp, …) which embed <circle> shapes — so we scope to
    // the chart SVG via its role="img" anchor.
    const chart = container.querySelector('svg[role="img"]');
    expect(chart).not.toBeNull();
    const circles = chart!.querySelectorAll('circle');
    expect(circles).toHaveLength(RESERVE_BASELINE_6M.length);
  });

  it('renders the 3 threshold zones inside an aria-hidden group', () => {
    const { container } = render(<WhatIfDemoClient />);
    const rects = container.querySelectorAll('svg rect[data-threshold]');
    expect(rects).toHaveLength(THRESHOLD_ZONES.length);
    rects.forEach((rect) => {
      expect(rect.closest('[aria-hidden="true"]')).not.toBeNull();
    });
  });

  it('applies motion-reduce:transition-none on the area + scenario paths', () => {
    const { container } = render(<WhatIfDemoClient />);
    const area = container.querySelector('[data-testid="whatif-area"]');
    const line = container.querySelector('[data-testid="whatif-line"]');
    expect(area?.getAttribute('class')).toContain('motion-reduce:transition-none');
    expect(line?.getAttribute('class')).toContain('motion-reduce:transition-none');
  });

  it('drives the slider accent colour from var(--color-brand-400)', () => {
    render(<WhatIfDemoClient />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    // jsdom serialises the inline accent-color as a CSS string
    expect(slider.style.accentColor).toBe('var(--color-brand-400)');
  });

  it('passes the active scenario label into the slider aria-label', () => {
    render(<WhatIfDemoClient />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-label')).toBe('Économie mensuelle pour Renégocier mon GSM');

    fireEvent.click(screen.getByRole('button', { name: /Couper deux streamings/i }));
    expect(slider.getAttribute('aria-label')).toBe(
      'Économie mensuelle pour Couper deux streamings',
    );
  });

  it('exposes the SVG chart as role="img" with a localised aria-label', () => {
    const { container } = render(<WhatIfDemoClient />);
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe(messages.landing.whatif.chart.aria);
  });
});
