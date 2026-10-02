import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import type { AdminMetrics } from '@/lib/admin/metrics';

import messages from '../../../../../../messages/fr-BE.json';
import { AdminDashboard } from '../AdminDashboard';

// Fictional figures only: this repository is public.
const WEEKS = [
  '2026-07-13',
  '2026-07-20',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
];

function metrics(overrides: Partial<AdminMetrics> = {}): AdminMetrics {
  return {
    users: {
      total: 40,
      onboarded: 25,
      weekly: WEEKS.map((week, i) => ({
        week,
        signups: i === 11 ? '< 5' : i === 10 ? 10 : 0,
      })),
    },
    activity: { day1: '< 5', days7: 10, days30: 15 },
    security: [
      { event: 'auth.mfa_challenge_failed', count: 0 },
      { event: 'auth.rate_limited', count: '< 5' },
      { event: 'admin.access.denied', count: 5 },
      { event: 'admin.access.rate_limited', count: 0 },
    ],
    gdpr: {
      deletions: { stuck: 0, nearBreach: 1 },
      analyticsConsent: { granted: 20, refused: '< 5', neverChosen: 'hidden' },
    },
    build: 'abc1234',
    ...overrides,
  };
}

function renderDashboard(m: AdminMetrics) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <AdminDashboard metrics={m} />
    </NextIntlClientProvider>,
  );
}

const TABS = ['Utilisateurs', 'Activité', 'Sécurité', 'RGPD et santé'];

describe('AdminDashboard', () => {
  it('renders four tabs, the first one selected', () => {
    renderDashboard(metrics());
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(TABS);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs.slice(1).every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
    // Exactly one panel is visible.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('switches panel on click and with the arrow keys', () => {
    renderDashboard(metrics());
    fireEvent.click(screen.getByRole('tab', { name: 'Sécurité' }));
    expect(screen.getByRole('tab', { name: 'Sécurité' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Sécurité' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sécurité' }), { key: 'ArrowRight' });
    const last = screen.getByRole('tab', { name: 'RGPD et santé' });
    expect(last).toHaveAttribute('aria-selected', 'true');
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Utilisateurs' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows « < 5 » as is, in the tiles and in the accessible table of the chart', () => {
    renderDashboard(metrics());
    const table = screen.getByRole('table', { name: /Inscriptions par semaine/ });
    const rows = within(table).getAllByRole('row');
    // Header + 12 weeks.
    expect(rows).toHaveLength(13);
    expect(within(rows[12]!).getByText('< 5')).toBeInTheDocument();
    expect(within(rows[11]!).getByText('10')).toBeInTheDocument();
  });

  it('says where every block takes its figures from', () => {
    renderDashboard(metrics());
    expect(screen.getByText(/depuis la date de création des comptes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Sécurité' }));
    expect(screen.getByText(/depuis le journal d’audit, 7 derniers jours/i)).toBeInTheDocument();
  });

  it('renders « — » for a block that could not be read, never a zero', () => {
    renderDashboard(
      metrics({
        users: null,
        activity: null,
        security: null,
        gdpr: { deletions: null, analyticsConsent: null },
      }),
    );
    const panel = () => screen.getByRole('tabpanel');
    expect(within(panel()).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(within(panel()).queryByText('0')).not.toBeInTheDocument();
    expect(within(panel()).queryByRole('table')).not.toBeInTheDocument();

    for (const name of ['Activité', 'Sécurité', 'RGPD et santé']) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(within(panel()).getAllByText('—').length).toBeGreaterThanOrEqual(2);
      expect(within(panel()).queryByText('0')).not.toBeInTheDocument();
    }
  });

  it('moves with ArrowLeft, Home and End, one tab in the tab order', () => {
    renderDashboard(metrics());
    const tab = (name: string) => screen.getByRole('tab', { name });
    fireEvent.keyDown(tab('Utilisateurs'), { key: 'ArrowLeft' });
    expect(tab('RGPD et santé')).toHaveAttribute('aria-selected', 'true');
    expect(tab('RGPD et santé')).toHaveFocus();
    fireEvent.keyDown(tab('RGPD et santé'), { key: 'Home' });
    expect(tab('Utilisateurs')).toHaveFocus();
    fireEvent.keyDown(tab('Utilisateurs'), { key: 'End' });
    expect(tab('RGPD et santé')).toHaveFocus();
    expect(TABS.map((name) => tab(name).getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0']);
    // A browser shortcut is not a tab move.
    fireEvent.keyDown(tab('RGPD et santé'), { key: 'ArrowLeft', altKey: true });
    expect(tab('RGPD et santé')).toHaveAttribute('aria-selected', 'true');
  });

  it('says an alert in words, only where a count is not zero', () => {
    renderDashboard(metrics());
    fireEvent.click(screen.getByRole('tab', { name: 'Sécurité' }));
    const figure = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;
    expect(within(figure('Codes 2FA refusés')).queryByText('alerte')).not.toBeInTheDocument();
    expect(
      within(figure('Connexions freinées (trop d’essais)')).getByText('alerte'),
    ).toBeInTheDocument();
    expect(within(figure('Accès admin refusés')).getByText('alerte')).toBeInTheDocument();
    expect(within(figure('Accès admin freinés')).queryByText('alerte')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'RGPD et santé' }));
    expect(within(figure('Demandes en quarantaine')).queryByText('alerte')).not.toBeInTheDocument();
    expect(
      within(figure('À moins de 5 jours du manquement')).getByText('alerte'),
    ).toBeInTheDocument();
  });

  it('keeps « — » to the block that failed when its neighbour was read', () => {
    renderDashboard(
      metrics({
        gdpr: {
          deletions: null,
          analyticsConsent: { granted: 20, refused: 15, neverChosen: 5 },
        },
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'RGPD et santé' }));
    const figure = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement;
    expect(figure('Demandes en quarantaine')).toHaveTextContent('—');
    expect(figure('À moins de 5 jours du manquement')).toHaveTextContent('—');
    expect(figure('Acceptées')).toHaveTextContent('20');
    expect(figure('Jamais choisi')).toHaveTextContent('5');
  });

  it('shows the hidden cell of a partition as masked, and the build', () => {
    renderDashboard(metrics());
    fireEvent.click(screen.getByRole('tab', { name: 'RGPD et santé' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('masqué')).toBeInTheDocument();
    expect(within(panel).getByText('< 5')).toBeInTheDocument();
    expect(within(panel).getByText('abc1234')).toBeInTheDocument();
  });
});
