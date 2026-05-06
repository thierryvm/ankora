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

import { CapaciteEpargneCard } from '../CapaciteEpargneCard';

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

const renderCard = async (input: {
  revenus: Decimal;
  charges: CockpitCharge[];
  plafondQuotidien: Decimal;
}) => {
  const ui = await CapaciteEpargneCard({ ...input, locale: 'fr-BE' });
  return render(ui);
};

describe('<CapaciteEpargneCard /> (PR-D3 Bloc 2 radar #2 — KPI hero)', () => {
  it('renders the FR title from the dashboard.capacite namespace', async () => {
    await renderCard({
      revenus: new Decimal(2000),
      charges: [],
      plafondQuotidien: new Decimal(0),
    });
    expect(screen.getByText(messages.dashboard.capacite.title)).toBeInTheDocument();
  });

  it('renders the positive variant with emerald colour and prefix +', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(500),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('true');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').toMatch(/^\+/);
    expect(value.className).toContain('emerald');
    expect(screen.getByText(messages.dashboard.capacite.message_positive)).toBeInTheDocument();
  });

  it('renders the negative variant with rose colour and warning message', async () => {
    await renderCard({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(0),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('false');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.className).toContain('rose');
    expect(screen.getByText(messages.dashboard.capacite.message_negative)).toBeInTheDocument();
  });

  it('treats capacité = 0 as positive (≥ 0 contract)', async () => {
    await renderCard({
      revenus: new Decimal(1000),
      charges: [],
      plafondQuotidien: new Decimal(1000),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('true');
    // Zero stays unsigned (no leading "+")
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').not.toMatch(/^\+/);
  });

  it('handles revenus = 0 with massive negative output', async () => {
    await renderCard({
      revenus: new Decimal(0),
      charges: [charge({ amount: new Decimal(100), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(50),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('false');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').toMatch(/-150/);
  });

  it('keeps decimal precision across many lissed charges', async () => {
    // 12 × Dashlane (53 € annual) = 12 × 4.4166… = 53 exactly.
    const charges = Array.from({ length: 12 }, () =>
      charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
    );
    await renderCard({
      revenus: new Decimal(0),
      charges,
      plafondQuotidien: new Decimal(0),
    });
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').toMatch(/-53[,.]00/);
  });

  it('handles the @thierry mixed-frequency fixture (negative case)', async () => {
    const charges = [
      charge({ amount: new Decimal(1500), frequency: 'monthly' }),
      charge({ amount: new Decimal(53), frequency: 'annual', paymentMonths: [4] }),
      charge({ amount: new Decimal(45), frequency: 'quarterly', paymentMonths: [1, 4, 7, 10] }),
      charge({ amount: new Decimal(300), frequency: 'annual', paymentMonths: [6] }),
      charge({ amount: new Decimal(120), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(55), frequency: 'annual', paymentMonths: [3] }),
      charge({ amount: new Decimal(600), frequency: 'semiannual', paymentMonths: [2, 8] }),
    ];
    await renderCard({
      revenus: new Decimal(2000),
      charges,
      plafondQuotidien: new Decimal(500),
    });
    // capacité = 2000 - 1659 - 500 = -159
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('false');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').toMatch(/-159/);
  });
});

describe('dashboard.capacite — i18n parity (5 locales)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes title + message_positive + message_negative',
    async (locale) => {
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        dashboard: {
          capacite: {
            title?: string;
            message_positive?: string;
            message_negative?: string;
          };
        };
      };
      expect(m.dashboard.capacite.title).toBeTypeOf('string');
      expect((m.dashboard.capacite.title ?? '').length).toBeGreaterThan(0);
      expect(m.dashboard.capacite.message_positive).toBeTypeOf('string');
      expect(m.dashboard.capacite.message_negative).toBeTypeOf('string');
    },
  );
});
