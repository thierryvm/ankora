import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/fr-BE.json';
import type { SixMoisMois } from '@/lib/actions/six-mois.types';

const getSixMoisAction = vi.fn();
vi.mock('@/lib/actions/six-mois', () => ({
  getSixMoisAction: (...args: unknown[]) => getSixMoisAction(...args),
}));

import { SixMoisRepli } from '../SixMoisRepli';

// Fictitious household (public repo): the 505 € / 705 € family.
function mois(month: number, over: Partial<SixMoisMois> = {}): SixMoisMois {
  return {
    year: 2026,
    month,
    statut: month === 9 ? 'en-cours' : month > 9 ? 'a-venir' : 'passe',
    factures: {
      total: 705,
      paiementsNonEnregistres: false,
      lignes: [
        {
          id: 'c-loyer',
          label: 'Loyer',
          montant: 705,
          jour: 1,
          payee: true,
          payeeLe: `2026-0${month}-02T08:00:00Z`,
          echeance: null,
        },
      ],
    },
    depenses: {
      total: 50.5,
      lignes: [{ id: `e-${month}`, label: 'Courses', montant: 50.5, date: `2026-0${month}-12` }],
    },
    provisions: { net: 42.08, cible: 42.08, facturesDues: 0 },
    total: 797.58,
    auMoins: false,
    ecartMoisPrecedent: month === 4 ? null : 0,
    ...over,
  };
}

const SIX: SixMoisMois[] = [
  mois(4, {
    factures: {
      total: 705,
      paiementsNonEnregistres: true,
      lignes: [
        {
          id: 'c-loyer',
          label: 'Loyer',
          montant: 705,
          jour: 1,
          payee: false,
          payeeLe: null,
          echeance: null,
        },
      ],
    },
  }),
  mois(5),
  mois(6),
  mois(7),
  mois(8),
  mois(9),
];

function renderRepli() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <SixMoisRepli fin={{ year: 2026, month: 9 }} />
    </NextIntlClientProvider>,
  );
}

async function ouvrir() {
  fireEvent.click(screen.getByRole('button', { name: /Six mois/ }));
  await waitFor(() => expect(screen.getAllByTestId('six-mois-rangee')).toHaveLength(6));
}

describe('SixMoisRepli — the « Six mois » fold and its g-mois drawer', () => {
  beforeEach(() => {
    getSixMoisAction.mockReset();
    getSixMoisAction.mockResolvedValue({ ok: true, data: { mois: SIX } });
  });

  it('reads nothing while closed, then renders the six months on opening', async () => {
    renderRepli();
    expect(getSixMoisAction).not.toHaveBeenCalled();
    await ouvrir();
    expect(getSixMoisAction).toHaveBeenCalledWith({ year: 2026, month: 9 });
    const rangees = screen.getAllByTestId('six-mois-rangee');
    // Series stay in the accessible name even where the card hides them (375 px).
    expect(rangees[5]!.getAttribute('aria-label')).toMatch(/Septembre 2026, en cours/);
    expect(rangees[5]!.getAttribute('aria-label')).toMatch(/factures 705 €/);
    expect(rangees[5]!.getAttribute('aria-label')).toMatch(/ouvrir le détail/);
  });

  it('touching a month opens its drawer, to the cent', async () => {
    renderRepli();
    await ouvrir();
    fireEvent.click(screen.getAllByTestId('six-mois-rangee')[4]!);
    const tiroir = await screen.findByTestId('six-mois-tiroir');
    expect(within(tiroir).getByRole('heading', { name: /Août 2026/ })).toBeTruthy();
    expect(within(tiroir).getByTestId('six-mois-total').textContent).toMatch(/797,58 €/);
    expect(within(tiroir).getByText('Courses')).toBeTruthy();
    expect(within(tiroir).getByText(/payée le 2 août/)).toBeTruthy();
  });

  it('a past month without any recorded payment says so, never « non payée »', async () => {
    renderRepli();
    await ouvrir();
    fireEvent.click(screen.getAllByTestId('six-mois-rangee')[0]!);
    const tiroir = await screen.findByTestId('six-mois-tiroir');
    expect(within(tiroir).getByText('Paiements non enregistrés pour ce mois.')).toBeTruthy();
    expect(tiroir.textContent).not.toMatch(/non payée/i);
  });

  it('a failed read is said, not drawn as zeros', async () => {
    getSixMoisAction.mockResolvedValue({ ok: false, errorCode: 'read_failed' });
    renderRepli();
    fireEvent.click(screen.getByRole('button', { name: /Six mois/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryAllByTestId('six-mois-rangee')).toHaveLength(0);
  });
});
