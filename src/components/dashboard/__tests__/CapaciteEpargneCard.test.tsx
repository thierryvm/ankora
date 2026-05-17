import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Decimal from 'decimal.js';

import messages from '../../../../messages/fr-BE.json';
import type { CockpitCharge } from '@/lib/domain/cockpit/types';

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
    return (key: string) => {
      const value = walk(sub, key.split('.'));
      return typeof value === 'string' ? value : key;
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

  it('renders the positive variant with success token colour and prefix +', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(500),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('true');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').toMatch(/^\+/);
    // PR-D5 (2026-05-17): raw `emerald-*` + `dark:text-emerald-*` hacks
    // replaced by the semantic `text-success` token. Asserts the new
    // contract; raw Tailwind colour names must NOT leak back in.
    expect(value.className).toContain('text-success');
    expect(value.className).not.toContain('emerald');
    expect(screen.getByText(messages.dashboard.capacite.message_positive)).toBeInTheDocument();
  });

  it('renders the negative variant with danger token colour and warning message', async () => {
    await renderCard({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(0),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('false');
    const value = screen.getByTestId('capacite-epargne-value');
    // PR-D5 (2026-05-17): raw `rose-*` + `dark:text-rose-*` hacks replaced
    // by the semantic `text-danger` token.
    expect(value.className).toContain('text-danger');
    expect(value.className).not.toContain('rose');
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

describe('<CapaciteEpargneCard /> — waterfall breakdown (PR-D3-bis)', () => {
  it('renders the 3-row waterfall when plafond > 0 (revenus / effort / plafond)', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(500),
    });
    const breakdown = screen.getByTestId('capacite-epargne-breakdown');
    expect(breakdown).toBeInTheDocument();
    expect(breakdown.textContent ?? '').toContain(messages.dashboard.capacite.breakdown.revenus);
    expect(breakdown.textContent ?? '').toContain(messages.dashboard.capacite.breakdown.effort);
    expect(breakdown.textContent ?? '').toContain(messages.dashboard.capacite.breakdown.plafond);
    // Three rows of dt/dd pairs.
    const rows = breakdown.querySelectorAll('dt');
    expect(rows.length).toBe(3);
  });

  it('omits the plafond row when plafondQuotidien is zero (no noise for unconfigured users)', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1000), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(0),
    });
    const breakdown = screen.getByTestId('capacite-epargne-breakdown');
    expect(breakdown.textContent ?? '').toContain(messages.dashboard.capacite.breakdown.revenus);
    expect(breakdown.textContent ?? '').toContain(messages.dashboard.capacite.breakdown.effort);
    expect(breakdown.textContent ?? '').not.toContain(
      messages.dashboard.capacite.breakdown.plafond,
    );
    const rows = breakdown.querySelectorAll('dt');
    expect(rows.length).toBe(2);
  });

  it('shows the formatted revenus and effort values in the breakdown rows', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1876), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(500),
    });
    const breakdown = screen.getByTestId('capacite-epargne-breakdown');
    // Match the @thierry empirical fixture from the post-PR-D3 handoff:
    // revenus = 2500, effort = 1876, plafond = 500.
    expect(breakdown.textContent ?? '').toMatch(/2\s?500/);
    expect(breakdown.textContent ?? '').toMatch(/1\s?876/);
    expect(breakdown.textContent ?? '').toMatch(/500/);
  });

  it('keeps the big number visible above the message after the breakdown', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1876), frequency: 'monthly' })],
      plafondQuotidien: new Decimal(500),
    });
    // The hero number must remain present and addressable for both visual
    // primacy and the existing E2E selectors that PR-D3 introduced.
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value).toBeInTheDocument();
    expect(value.textContent ?? '').toMatch(/^\+/);
    expect(value.textContent ?? '').toMatch(/124/);
  });
});

describe('dashboard.capacite.breakdown — i18n parity (5 locales)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes breakdown.{revenus,effort,plafond}',
    async (locale) => {
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        dashboard: {
          capacite: {
            breakdown?: { revenus?: string; effort?: string; plafond?: string };
          };
        };
      };
      expect(m.dashboard.capacite.breakdown?.revenus).toBeTypeOf('string');
      expect((m.dashboard.capacite.breakdown?.revenus ?? '').length).toBeGreaterThan(0);
      expect(m.dashboard.capacite.breakdown?.effort).toBeTypeOf('string');
      expect(m.dashboard.capacite.breakdown?.plafond).toBeTypeOf('string');
    },
  );
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
