import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';
import { SimulatorDrawer } from '../SimulatorDrawer';
import type { RawCharge } from '@/app/[locale]/app/simulator/SimulatorClient';

// SimulatorClient pulls in the locale-aware `Link` (income-hint CTA). next-intl's
// real `createNavigation` imports `next/navigation`, unresolvable under jsdom —
// mock it to a plain anchor, same pattern as the sibling card tests.
vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {ui}
    </NextIntlClientProvider>,
  );
}

const charges: RawCharge[] = [
  {
    id: 'charge-1',
    label: 'Assurance auto',
    amount: 120,
    frequency: 'monthly',
    dueMonth: 1,
    categoryId: null,
    isActive: true,
    paidFrom: 'principal',
  },
];

const sim = messages.app.simulator;
// Raw number, NOT money(2466): mirrors the real RSC boundary. A Decimal loses
// its prototype when serialized into the client drawer, so production passes a
// plain number — passing a Decimal here would mask the `.lte is not a function`
// crash (regression guard for the revenus RSC-boundary hotfix).
const revenus = 2466;

describe('<SimulatorDrawer /> — closed state', () => {
  it('renders the trigger labelled "Simuler"', () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    const trigger = screen.getByTestId('simulator-drawer-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent ?? '').toContain(messages.app.dashboard.ctaSimulator);
  });

  it('does not render the dialog until the trigger is clicked', () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    expect(screen.queryByTestId('simulator-drawer')).toBeNull();
  });
});

describe('<SimulatorDrawer /> — open state', () => {
  it('opens the dialog on trigger click', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    expect(await screen.findByTestId('simulator-drawer')).toBeInTheDocument();
  });

  it('exposes role="dialog" and aria-modal on the open drawer', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    const dialog = await screen.findByTestId('simulator-drawer');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders the drawer title from i18n (app.simulator.title)', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    const heading = await screen.findByRole('heading', { name: sim.title });
    expect(heading.tagName).toBe('H2');
  });

  it('hides the SimulatorClient page header (hideHeader): subtitle is not rendered', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    // The standalone page renders a <p> subtitle; inside the drawer the
    // header is suppressed so it must be absent.
    expect(screen.queryByText(sim.subtitle)).toBeNull();
  });

  it('mounts the calculator with a guided empty default (Q3: no charge auto-selected)', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    // Mode pills come from SimulatorClient → proves the calculator mounted.
    expect(screen.getByRole('button', { name: sim.scenario.modes.cancel })).toBeInTheDocument();
    // THI-195 (Q3): no charge is pre-selected (the audit's broken "Annuler le
    // Loyer" default is gone) — the guided placeholder shows and the impact
    // stays empty until the user picks their own charge.
    expect(screen.getByText(sim.fields.chargePlaceholder)).toBeInTheDocument();
    expect(screen.getByText(sim.impact.empty)).toBeInTheDocument();
  });

  it('renders without crashing when revenus arrives as a raw number (RSC boundary)', async () => {
    // Regression: `revenus` crosses server→client as a plain number; the client
    // re-wraps it with money(). Passing a Decimal used to reach the client as a
    // prototype-less object and crash at `revenus.lte(0)`. Opening the drawer
    // forces that code path; the empty impact state proves a full render.
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={2466} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    expect(screen.getByText(sim.impact.empty)).toBeInTheDocument();
  });
});

describe('<SimulatorDrawer /> — dismiss + focus management', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('closes the drawer when the backdrop is clicked', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    fireEvent.click(screen.getByTestId('simulator-drawer-backdrop'));
    await waitFor(() => expect(screen.queryByTestId('simulator-drawer')).toBeNull());
  });

  it('closes the drawer when the X button is clicked', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    fireEvent.click(screen.getByTestId('simulator-drawer-close'));
    await waitFor(() => expect(screen.queryByTestId('simulator-drawer')).toBeNull());
  });

  it('closes the drawer on Escape', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('simulator-drawer')).toBeNull());
  });

  it('returns focus to the trigger after closing (WCAG 2.4.3)', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    const trigger = screen.getByTestId('simulator-drawer-trigger');
    fireEvent.click(trigger);
    await screen.findByTestId('simulator-drawer');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('simulator-drawer')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('pins the body (iOS-safe scroll lock) while open and restores it on close', async () => {
    renderWithIntl(<SimulatorDrawer charges={charges} revenus={revenus} />);
    fireEvent.click(screen.getByTestId('simulator-drawer-trigger'));
    await screen.findByTestId('simulator-drawer');
    // iOS-safe lock: body is pinned with position:fixed (rubber-band proof),
    // not just overflow:hidden.
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('simulator-drawer')).toBeNull());
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.position).toBe('');
  });
});
