import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { SituationDuMoisHero } from '../SituationDuMoisHero';

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
    return (key: string, vars?: Record<string, unknown>) => {
      // next-intl resolves dotted keys (e.g. `statut.vert`) against the nested
      // namespace — walk the path, don't do a flat lookup.
      const value = key.split('.').reduce<unknown>((acc, k) => {
        if (typeof acc === 'object' && acc !== null && k in acc) {
          return (acc as Record<string, unknown>)[k];
        }
        return undefined;
      }, sub);
      if (typeof value !== 'string') return key;
      return vars ? value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : value;
    };
  },
}));

// AjusterResteAVivreDrawer is a client component with its own Server Action +
// next-intl client hooks; stub it so the server-rendered Hero test stays pure.
vi.mock('../AjusterResteAVivreDrawer', () => ({
  AjusterResteAVivreDrawer: () => <button data-testid="reste-a-vivre-trigger">Ajuster</button>,
}));

// The Hero uses the locale-aware `Link` (plan + setup CTAs). next-intl's real
// `createNavigation` imports `next/navigation`, unresolvable under jsdom —
// mock it to a plain anchor, same pattern as the sibling card tests.
vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const BASE = {
  revenus: 2500,
  chargesFixes: 1500,
  provisionsLissees: 338,
  resteDisponible: 662,
  budgetVieCourante: 500,
  capacite: 162,
  deficitEpargne: 0,
  rattrapageMensuel: 0,
  provisionsAJour: true,
  joursRestants: 18,
  currentMonthYYYYMM: '2026-06',
  locale: 'fr-BE' as const,
};

const renderHero = async (over: Partial<typeof BASE> & { statut: string }) =>
  render(await SituationDuMoisHero({ ...BASE, ...over } as never));

describe('<SituationDuMoisHero />', () => {
  it('vert: shows hero label + reassuring status, AllocationBar + Adjust trigger, no plan link', async () => {
    await renderHero({ statut: 'vert' });
    expect(screen.getByTestId('situation-hero-value')).toBeInTheDocument();
    // "Reste disponible" is the hero eyebrow AND the flow total row (same number) → appears twice.
    expect(screen.getAllByText(messages.dashboard.situation.heroLabel).length).toBeGreaterThan(0);
    expect(screen.getByText(messages.dashboard.situation.statut.vert)).toBeInTheDocument();
    expect(screen.getByTestId('allocation-bar')).toBeInTheDocument();
    expect(screen.getByTestId('reste-a-vivre-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('situation-nudge-link')).toBeNull();
  });

  it('orange (capacité < 0): shows the capacité nudge + a plan link', async () => {
    await renderHero({ statut: 'orange', capacite: -60, resteDisponible: 440 });
    expect(
      screen.getByText(messages.dashboard.situation.statut.orangeCapacite),
    ).toBeInTheDocument();
    expect(screen.getByTestId('situation-nudge-link')).toBeInTheDocument();
  });

  it('orange (provisions déficit, capacité ≥ 0): shows the provisions nudge', async () => {
    await renderHero({
      statut: 'orange',
      capacite: 200,
      provisionsAJour: false,
      deficitEpargne: 300,
      rattrapageMensuel: 100,
    });
    expect(
      screen.getByText(messages.dashboard.situation.statut.orangeProvisions),
    ).toBeInTheDocument();
  });

  it('rouge: shows the rouge status + plan link', async () => {
    await renderHero({ statut: 'rouge', resteDisponible: -180 });
    expect(screen.getByText(messages.dashboard.situation.statut.rouge)).toBeInTheDocument();
    expect(screen.getByTestId('situation-nudge-link')).toBeInTheDocument();
  });

  it('incomplet (THI-335): shows setup CTA, no AllocationBar, no negative amount', async () => {
    const { container } = await renderHero({ statut: 'incomplet', revenus: 0 });
    expect(screen.getByText(messages.dashboard.situation.incomplet.title)).toBeInTheDocument();
    expect(screen.getByTestId('situation-setup-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('allocation-bar')).toBeNull();
    expect(container.textContent ?? '').not.toContain('−');
    expect(container.textContent ?? '').not.toMatch(/-\d/);
  });
});
