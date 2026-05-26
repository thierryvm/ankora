import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Decimal from 'decimal.js';

import messages from '../../../../messages/fr-BE.json';
import type { CockpitCharge, PaymentLedger } from '@/lib/domain/cockpit';

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
      // Minimal placeholder substitution to mirror next-intl behaviour for the
      // 2 keys that take values: `ariaLabel` and `deficit`.
      if (!values) return value;
      return value.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
    };
  },
}));

import { ProvisionHealthGaugeCard } from '../ProvisionHealthGaugeCard';

const ANNUAL_CHARGE = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? `c-${Math.random().toString(36).slice(2)}`,
  label: 'Annual',
  amount: new Decimal(1200),
  frequency: 'annual',
  // Due in January (ref month) and not yet paid → epargneRequise = full amount.
  // That gives us a clean `target = amount` baseline so the ratio == soldeActuel / amount.
  paymentMonths: [1],
  paymentDay: 1,
  isActive: true,
  ...over,
});

const emptyPayments: PaymentLedger = new Map();
const JAN = { year: 2026, month: 1 } as const;

const renderCard = async (input: { charges: CockpitCharge[]; soldeEpargneActuel: Decimal }) =>
  render(
    await ProvisionHealthGaugeCard({
      charges: input.charges,
      payments: emptyPayments,
      soldeEpargneActuel: input.soldeEpargneActuel,
      period: JAN,
      locale: 'fr-BE',
    }),
  );

describe('<ProvisionHealthGaugeCard /> (THI-190 cockpit v3 #2)', () => {
  it('renders the FR title from the dashboard.health namespace', async () => {
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(1200),
    });
    expect(screen.getByText(messages.dashboard.health.title)).toBeInTheDocument();
  });

  it('tier=success when ratio ≥ 1.0 (a_jour) — green token + "À jour" status', async () => {
    // amount = 1200, due-in-ref-month → target = 1200 €. soldeActuel = 1200 → ratio = 1.0.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(1200),
    });
    const card = screen.getByTestId('provision-health-gauge-card');
    expect(card.getAttribute('data-tier')).toBe('success');
    const percent = screen.getByTestId('provision-health-gauge-percent');
    expect(percent.className).toContain('text-success');
    expect(percent.textContent ?? '').toMatch(/100%/);
    expect(screen.getByText(messages.dashboard.health.status.a_jour)).toBeInTheDocument();
    // No rattrapage row in the on-track variant.
    expect(screen.queryByTestId('provision-health-gauge-rattrapage')).toBeNull();
  });

  it('tier=warning when 0.75 ≤ ratio < 1.0 (deficit but close) — orange token', async () => {
    // Target = 1200 €. 85% × 1200 = 1020 € → ratio = 0.85.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(1020),
    });
    const card = screen.getByTestId('provision-health-gauge-card');
    expect(card.getAttribute('data-tier')).toBe('warning');
    const percent = screen.getByTestId('provision-health-gauge-percent');
    expect(percent.className).toContain('text-warning');
    expect(percent.textContent ?? '').toMatch(/85%/);
    expect(screen.getByText(messages.dashboard.health.status.deficit)).toBeInTheDocument();
    // Catch-up row visible since statut = deficit.
    expect(screen.getByTestId('provision-health-gauge-rattrapage')).toBeInTheDocument();
  });

  it('tier=danger when ratio < 0.75 (significant deficit) — red token + rattrapage row', async () => {
    // Target = 1200 €. 50% × 1200 = 600 € → ratio = 0.50 → danger.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(600),
    });
    const card = screen.getByTestId('provision-health-gauge-card');
    expect(card.getAttribute('data-tier')).toBe('danger');
    const percent = screen.getByTestId('provision-health-gauge-percent');
    expect(percent.className).toContain('text-danger');
    expect(percent.textContent ?? '').toMatch(/50%/);
    const rattrapage = screen.getByTestId('provision-health-gauge-rattrapage');
    // 3-month catch-up = (1200 - 600) / 3 = 200 €/month
    expect(rattrapage.textContent ?? '').toMatch(/200/);
  });

  it('empty state when no periodic charges (target = 0) — educational hint, no gauge', async () => {
    // Monthly charges only → no provisioning target.
    await renderCard({
      charges: [
        {
          id: 'mensual',
          label: 'Rent',
          amount: new Decimal(1000),
          frequency: 'monthly',
          paymentMonths: [1],
          paymentDay: 1,
          isActive: true,
        },
      ],
      soldeEpargneActuel: new Decimal(0),
    });
    expect(screen.getByTestId('provision-health-gauge-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('provision-health-gauge-percent')).toBeNull();
    expect(screen.queryByTestId('provision-health-gauge-breakdown')).toBeNull();
    // Empty variant still defaults to success tier so the card colour stays calm.
    const card = screen.getByTestId('provision-health-gauge-card');
    expect(card.getAttribute('data-tier')).toBe('success');
  });

  it('exposes role="progressbar" with aria-valuenow=50 + Couverture cible label (a11y contract)', async () => {
    // Target = 1200, soldeActuel = 600 → ratio = 0.50 → aria-valuenow=50.
    // ARIA 1.2 §6.2 forbids aria-label on roleless wrappers — the accessible
    // name is carried by the inner `role="progressbar"` element via ProgressBar's
    // `label` prop, NOT a wrapper div.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(600),
    });
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    expect(bar?.getAttribute('aria-label')).toBe(messages.dashboard.health.ratio);
  });
});

// PR-BETA-CLEANUP-2 (THI-281) — Option C visual cap.
// Before this PR the headline KPI showed e.g. "546% — À jour" when the
// user had stashed well past the 12-month provisions target. Math was
// correct but UX was confusing. We now cap the headline at 100% and
// surface the surplus as "+ X € au-delà de la cible" — factual, R-06
// anti-culpabilisation-safe wording.
describe('<ProvisionHealthGaugeCard /> — Option C 100% cap (PR-BETA-CLEANUP-2)', () => {
  it('caps the headline percent at 100% when soldeActuel > target', async () => {
    // amount = 1200 € target, soldeActuel = 1766 € → raw ratio ≈ 1.47
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(1766),
    });
    const percent = screen.getByTestId('provision-health-gauge-percent');
    // Must show 100%, never the raw ~147%.
    expect(percent.textContent ?? '').toBe('100%');
    // Tier stays 'success' (math says we are at or beyond target).
    const card = screen.getByTestId('provision-health-gauge-card');
    expect(card.getAttribute('data-tier')).toBe('success');
  });

  it('renders the "+ X € au-delà de la cible" surplus sub-text when overachieving', async () => {
    // soldeActuel - target = 1766 - 1200 = 566 €.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(1766),
    });
    const surplus = screen.getByTestId('provision-health-gauge-surplus');
    expect(surplus).toBeInTheDocument();
    expect(surplus.textContent ?? '').toMatch(/566/);
    expect(surplus.className).toContain('text-success');
    // Anti-culpabilisation contract — no judgement language.
    expect(surplus.textContent ?? '').not.toMatch(/trop|économise|devrais/i);
  });

  it('does NOT render the surplus sub-text when ratio = 100% exactly', async () => {
    // soldeActuel = target = 1200 → ratio = 1.0 exact, no overflow.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(1200),
    });
    expect(screen.getByTestId('provision-health-gauge-percent').textContent ?? '').toBe('100%');
    expect(screen.queryByTestId('provision-health-gauge-surplus')).toBeNull();
  });

  it('does NOT render the surplus sub-text when ratio < 100%', async () => {
    // soldeActuel = 600, target = 1200 → ratio = 0.5, no overflow.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(600),
    });
    expect(screen.getByTestId('provision-health-gauge-percent').textContent ?? '').toBe('50%');
    expect(screen.queryByTestId('provision-health-gauge-surplus')).toBeNull();
  });

  it('reproduces the @thierry incident fixture (1766 / 323.58 → "100%" + "+ 1 442,42 €")', async () => {
    // Smoke 2026-05-26 — the user saw "546%". Target reverse-engineered
    // from the screenshot to 323.58 €.
    await renderCard({
      charges: [
        ANNUAL_CHARGE({
          amount: new Decimal('323.58'),
          paymentMonths: [1],
        }),
      ],
      soldeEpargneActuel: new Decimal('1766.00'),
    });
    expect(screen.getByTestId('provision-health-gauge-percent').textContent ?? '').toBe('100%');
    const surplus = screen.getByTestId('provision-health-gauge-surplus');
    // 1766.00 - 323.58 = 1442.42. The fr-BE formatter uses comma + NBSP for
    // thousand separators, so accept the rendered shape "1 442,42 €".
    expect(surplus.textContent ?? '').toMatch(/1[\s ]?442[,.]42/);
  });

  it('clamps the ProgressBar at value=1 when overachieving (visual safety)', async () => {
    // ProgressBar's `value` prop is consumed as a [0..max] range. We must
    // pass `Math.min(ratio, 1)` so the gauge fills exactly the bar — no
    // overflow even though the raw ratio is >1.
    await renderCard({
      charges: [ANNUAL_CHARGE({})],
      soldeEpargneActuel: new Decimal(2400),
    });
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
  });
});

describe('dashboard.health — i18n parity (5 locales)', () => {
  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes title + ratio + target + current + empty + ariaLabel + deficit + status.{a_jour,deficit}',
    async (locale) => {
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        dashboard: {
          health: {
            title?: string;
            ratio?: string;
            target?: string;
            current?: string;
            empty?: string;
            ariaLabel?: string;
            deficit?: string;
            objectifDepasse?: string;
            status?: { a_jour?: string; deficit?: string };
          };
        };
      };
      const h = m.dashboard.health;
      expect(h.title).toBeTypeOf('string');
      expect((h.title ?? '').length).toBeGreaterThan(0);
      expect(h.ratio).toBeTypeOf('string');
      expect(h.target).toBeTypeOf('string');
      expect(h.current).toBeTypeOf('string');
      expect(h.empty).toBeTypeOf('string');
      expect(h.ariaLabel).toBeTypeOf('string');
      expect((h.ariaLabel ?? '').includes('{percent}')).toBe(true);
      expect(h.deficit).toBeTypeOf('string');
      expect((h.deficit ?? '').includes('{amount}')).toBe(true);
      // PR-BETA-CLEANUP-2 (THI-281) — Option C overflow sub-text.
      expect(h.objectifDepasse).toBeTypeOf('string');
      expect((h.objectifDepasse ?? '').includes('{amount}')).toBe(true);
      expect(h.status?.a_jour).toBeTypeOf('string');
      expect(h.status?.deficit).toBeTypeOf('string');
    },
  );

  it.each(['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const)(
    'locale %s exposes app.dashboard.provisionHealthSectionHeading',
    async (locale) => {
      const m = (await import(`../../../../messages/${locale}.json`)).default as {
        app: { dashboard: { provisionHealthSectionHeading?: string } };
      };
      expect(m.app.dashboard.provisionHealthSectionHeading).toBeTypeOf('string');
      expect((m.app.dashboard.provisionHealthSectionHeading ?? '').length).toBeGreaterThan(0);
    },
  );
});
