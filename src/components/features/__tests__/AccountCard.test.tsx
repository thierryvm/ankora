import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

/**
 * Tour 59 — the cockpit card shows the balance of the Accounts page, and says
 * where it comes from (rule 10). Fictitious amounts.
 */

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'fr-BE', messages, namespace: namespace as never }),
}));
vi.mock('@/components/features/AccountCardEditableTitle', () => ({
  AccountCardEditableTitle: ({ displayName }: { displayName: string }) => <p>{displayName}</p>,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AccountCard } from '@/components/features/AccountCard';

async function renderCard(solde: Parameters<typeof AccountCard>[0]['solde']) {
  const ui = await AccountCard({
    accountType: 'provisions',
    displayName: 'Épargne fictive',
    solde,
    locale: 'fr-BE',
  });
  return render(ui);
}

describe('<AccountCard /> — one balance, with its source', () => {
  it('shows the computed balance and the operations it counts since the statement', async () => {
    const { container } = await renderCard({
      montant: 755.4,
      luLe: '2026-09-01',
      depart: false,
      operations: 2,
    });
    expect(container.textContent).toMatch(/755,40/);
    expect(container.textContent).toMatch(/plus 2 opérations depuis/);
    const link = screen.getByRole('link', { name: /^Voir le détail du solde de Épargne fictive$/ });
    expect(link.getAttribute('href')).toBe('/app/accounts');
  });

  it('with nothing since the statement, names the statement alone', async () => {
    const { container } = await renderCard({
      montant: 705.1,
      luLe: '2026-09-01',
      depart: false,
      operations: 0,
    });
    expect(container.textContent).toMatch(/705,10/);
    expect(container.textContent).toMatch(/Solde lu le/);
    expect(container.textContent).not.toMatch(/opération/);
  });

  it('a starting balance with operations since is named as the starting balance', async () => {
    const { container } = await renderCard({
      montant: 50.4,
      luLe: '2026-09-28',
      depart: true,
      operations: 1,
    });
    expect(container.textContent).toMatch(
      /Solde de départ du 28 septembre, plus 1 opération depuis/,
    );
  });

  it('without any statement: no amount, the sentence of the Accounts page', async () => {
    const { container } = await renderCard(null);
    expect(container.textContent).toMatch(/Aucun solde pour ce compte\./);
    expect(container.textContent).not.toMatch(/€/);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/app/accounts');
  });
});
