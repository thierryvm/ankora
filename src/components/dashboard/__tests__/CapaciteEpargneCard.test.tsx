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
    return (key: string, params?: Record<string, string | number>) => {
      const value = walk(sub, key.split('.'));
      if (typeof value !== 'string') return key;
      if (!params) return value;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        value,
      );
    };
  },
}));

// Stub the AjusterResteAVivreDrawer (Client Component using next-intl client,
// useRouter, etc.) so the Card tests stay narrowly focused on the Server
// Component output.
vi.mock('../AjusterResteAVivreDrawer', () => ({
  AjusterResteAVivreDrawer: (props: { triggerLabel?: string }) => (
    <button type="button" data-testid="reste-a-vivre-trigger-stub">
      {props.triggerLabel ?? 'adjust'}
    </button>
  ),
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
  resteAVivre: Decimal;
}) => {
  const ui = await CapaciteEpargneCard({
    ...input,
    currentMonthYYYYMM: '2026-05',
    locale: 'fr-BE',
  });
  return render(ui);
};

describe('<CapaciteEpargneCard /> — hero number (PR-BETA-3 tryptique)', () => {
  it('renders the FR title from the dashboard.capacite namespace', async () => {
    await renderCard({
      revenus: new Decimal(2000),
      charges: [],
      resteAVivre: new Decimal(0),
    });
    expect(screen.getByText(messages.dashboard.capacite.title)).toBeInTheDocument();
  });

  it('renders the positive variant with success token colour and prefix +', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      resteAVivre: new Decimal(500),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('true');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').toMatch(/^\+/);
    expect(value.className).toContain('text-success');
    expect(value.className).not.toContain('emerald');
  });

  it('renders the negative variant with danger token colour', async () => {
    await renderCard({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      resteAVivre: new Decimal(0),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('false');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.className).toContain('text-danger');
    expect(value.className).not.toContain('rose');
  });

  it('treats capacité = 0 as positive (≥ 0 contract)', async () => {
    await renderCard({
      revenus: new Decimal(1000),
      charges: [],
      resteAVivre: new Decimal(1000),
    });
    const card = screen.getByTestId('capacite-epargne-card');
    expect(card.getAttribute('data-positive')).toBe('true');
    const value = screen.getByTestId('capacite-epargne-value');
    expect(value.textContent ?? '').not.toMatch(/^\+/);
  });
});

describe('<CapaciteEpargneCard /> — tryptique sub-stats (PR-BETA-3)', () => {
  it('renders 3 sub-stats with the @thierry canonical fixture (662 / 500 / 162)', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      resteAVivre: new Decimal(500),
    });
    const substats = screen.getByTestId('capacite-epargne-substats');
    expect(substats).toBeInTheDocument();

    const resteDispo = screen.getByTestId('substat-reste-disponible');
    expect(resteDispo.textContent ?? '').toContain(
      messages.dashboard.capacite.subStats.resteDisponible,
    );
    expect(resteDispo.textContent ?? '').toMatch(/662/);

    const resteAVivre = screen.getByTestId('substat-reste-a-vivre');
    expect(resteAVivre.textContent ?? '').toContain(
      messages.dashboard.capacite.subStats.resteAVivre,
    );
    expect(resteAVivre.textContent ?? '').toMatch(/500/);

    const capacite = screen.getByTestId('substat-capacite');
    expect(capacite.textContent ?? '').toContain(
      messages.dashboard.capacite.subStats.capaciteEpargne,
    );
    expect(capacite.textContent ?? '').toMatch(/\+\s?162/);
  });

  it('renders the "Ajuster ce mois" trigger inside the reste-à-vivre sub-stat', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [],
      resteAVivre: new Decimal(500),
    });
    const trigger = screen.getByTestId('reste-a-vivre-trigger-stub');
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent ?? '').toContain(messages.dashboard.capacite.subStats.ajusterCeMois);
  });

  it('renders the pedagogical lede with the formatted amount interpolated', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      resteAVivre: new Decimal(500),
    });
    const lede = screen.getByTestId('capacite-epargne-lede');
    expect(lede.textContent ?? '').toMatch(/162/);
    // Anti-culpabilisation contract — must NEVER use blame language.
    expect(lede.textContent ?? '').not.toMatch(/dépenses trop|tu dois|devrais/i);
  });

  it('renders the negative lede when capacite < 0 (no judgement language)', async () => {
    await renderCard({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      resteAVivre: new Decimal(0),
    });
    const lede = screen.getByTestId('capacite-epargne-lede');
    expect(lede.textContent ?? '').toBe(messages.dashboard.capacite.ledeNegatif);
  });

  it('exposes a tooltip with the explanatory text including resteAVivre', async () => {
    await renderCard({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      resteAVivre: new Decimal(500),
    });
    const tooltip = screen.getByTestId('capacite-epargne-tooltip');
    const text = tooltip.getAttribute('aria-label') ?? '';
    expect(text).toMatch(/500/);
  });
});

describe('dashboard.capacite — i18n parity (5 locales, tryptique keys)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes the PR-BETA-3 keys (subStats + ledePositif + ledeNegatif + tooltip + drawer.*)',
    async (locale) => {
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        dashboard: {
          capacite: {
            title?: string;
            message_positive?: string;
            message_negative?: string;
            subStats?: {
              resteDisponible?: string;
              resteAVivre?: string;
              capaciteEpargne?: string;
              ajusterCeMois?: string;
            };
            ledePositif?: string;
            ledeNegatif?: string;
            tooltip?: string;
            drawer?: {
              title?: string;
              inputLabel?: string;
              inputHint?: string;
              helperCoherent?: string;
              helperBas?: string;
              helperHaut?: string;
              save?: string;
              cancel?: string;
              success?: string;
              errorGeneric?: string;
            };
          };
        };
        // PR-BETA-3 hotfix — `errors.settings.resteAVivreUpdateFailed` is
        // surfaced via the drawer toast when the Server Action returns
        // ok:false. Tracked here so a missing locale fails the parity test
        // rather than silently shipping a raw "errors.settings.…" string.
        errors?: {
          settings?: {
            resteAVivreUpdateFailed?: string;
          };
        };
      };
      // Pre-existing keys still present.
      expect(m.dashboard.capacite.title).toBeTypeOf('string');
      expect(m.dashboard.capacite.message_positive).toBeTypeOf('string');
      expect(m.dashboard.capacite.message_negative).toBeTypeOf('string');
      // PR-BETA-3 sub-stats.
      expect(m.dashboard.capacite.subStats?.resteDisponible).toBeTypeOf('string');
      expect(m.dashboard.capacite.subStats?.resteAVivre).toBeTypeOf('string');
      expect(m.dashboard.capacite.subStats?.capaciteEpargne).toBeTypeOf('string');
      expect(m.dashboard.capacite.subStats?.ajusterCeMois).toBeTypeOf('string');
      // Pedagogical lede must include the {amount} placeholder.
      expect(m.dashboard.capacite.ledePositif ?? '').toContain('{amount}');
      expect(m.dashboard.capacite.ledeNegatif).toBeTypeOf('string');
      // Tooltip must include the {resteAVivre} placeholder.
      expect(m.dashboard.capacite.tooltip ?? '').toContain('{resteAVivre}');
      // Drawer namespace complete.
      expect(m.dashboard.capacite.drawer?.title).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.inputLabel).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.helperCoherent).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.helperBas).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.helperHaut).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.save).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.cancel).toBeTypeOf('string');
      expect(m.dashboard.capacite.drawer?.errorGeneric).toBeTypeOf('string');
      // PR-BETA-3 hotfix — success copy + dedicated error code.
      expect(m.dashboard.capacite.drawer?.success).toBeTypeOf('string');
      expect((m.dashboard.capacite.drawer?.success ?? '').length).toBeGreaterThan(0);
      expect(m.errors?.settings?.resteAVivreUpdateFailed).toBeTypeOf('string');
      expect((m.errors?.settings?.resteAVivreUpdateFailed ?? '').length).toBeGreaterThan(0);
    },
  );
});
