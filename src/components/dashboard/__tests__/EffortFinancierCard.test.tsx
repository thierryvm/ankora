import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Decimal from 'decimal.js';

import messages from '../../../../messages/fr-BE.json';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns =
      (messages as Record<string, Record<string, unknown>>)[namespace.split('.')[0] ?? ''] ?? {};
    const sub = namespace
      .split('.')
      .slice(1)
      .reduce<unknown>((acc, key) => {
        if (typeof acc === 'object' && acc !== null && key in acc) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, ns);
    return (key: string) => {
      const node = sub;
      if (typeof node === 'object' && node !== null && key in node) {
        const value = (node as Record<string, unknown>)[key];
        return typeof value === 'string' ? value : key;
      }
      return key;
    };
  },
}));

import { EffortFinancierCard } from '../EffortFinancierCard';

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? `c-${Math.random().toString(36).slice(2)}`,
  label: 'Test',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1],
  paymentDay: 1,
  isActive: true,
  ...over,
});

const renderCard = async (charges: CockpitCharge[]) => {
  const ui = await EffortFinancierCard({ charges, locale: 'fr-BE' });
  return render(ui);
};

describe('<EffortFinancierCard /> (PR-D3 Bloc 2 radar #1)', () => {
  it('renders the FR title and an empty-state total of 0', async () => {
    await renderCard([]);
    expect(screen.getByText(messages.dashboard.effort.title)).toBeInTheDocument();
    const total = screen.getByTestId('effort-financier-total');
    expect(total.textContent ?? '').toMatch(/0[,.]00/);
  });

  it('sums monthly charges into the fixed-charges breakdown only', async () => {
    await renderCard([
      charge({ amount: new Decimal(900), frequency: 'monthly' }),
      charge({ amount: new Decimal(60), frequency: 'monthly' }),
    ]);
    const total = screen.getByTestId('effort-financier-total');
    expect(total.textContent ?? '').toMatch(/960/);
  });

  it('lisses an annual charge across 12 months in the provisions row', async () => {
    await renderCard([
      charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
    ]);
    const total = screen.getByTestId('effort-financier-total');
    // 1200 / 12 = 100
    expect(total.textContent ?? '').toMatch(/100/);
  });

  it('combines monthly + provisions into the headline total', async () => {
    await renderCard([
      charge({ amount: new Decimal(1500), frequency: 'monthly' }),
      charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
    ]);
    // 1500 + 100 + 15 = 1615
    const total = screen.getByTestId('effort-financier-total');
    expect(total.textContent ?? '').toMatch(/1\s?615/);
  });

  it('ignores inactive charges (cockpit math contract)', async () => {
    await renderCard([
      charge({ amount: new Decimal(900), frequency: 'monthly' }),
      charge({ amount: new Decimal(800), frequency: 'monthly', isActive: false }),
    ]);
    const total = screen.getByTestId('effort-financier-total');
    expect(total.textContent ?? '').toMatch(/900/);
  });
});

describe('errors.dashboard.effort — i18n parity (5 locales)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes title/charges_fixes/provisions',
    async (locale) => {
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        dashboard: { effort: { title?: string; charges_fixes?: string; provisions?: string } };
      };
      expect(m.dashboard.effort.title).toBeTypeOf('string');
      expect((m.dashboard.effort.title ?? '').length).toBeGreaterThan(0);
      expect(m.dashboard.effort.charges_fixes).toBeTypeOf('string');
      expect(m.dashboard.effort.provisions).toBeTypeOf('string');
    },
  );
});
