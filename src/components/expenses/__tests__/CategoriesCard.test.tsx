import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import messages from '../../../../messages/fr-BE.json';
import { CategoriesCard, type CategoriesCardProps } from '../CategoriesCard';

// Fictitious household (public repo), September 2026, day 10.
const GROUPES: CategoriesCardProps['groupes'] = [
  {
    id: 'c-loisirs',
    nom: 'Loisirs',
    couleur: 'blue',
    total: 75,
    lignes: [{ id: 'd', label: 'Cinéma', montant: 75, date: '2026-09-06' }],
  },
  {
    id: 'c-courses',
    nom: 'Courses',
    couleur: 'amber',
    total: 62.65,
    lignes: [
      { id: 'a', label: 'Marché', montant: 50.55, date: '2026-09-02' },
      { id: 'b', label: 'Boulangerie', montant: 12.1, date: '2026-09-09' },
    ],
  },
  {
    id: null,
    nom: null,
    couleur: null,
    total: 7.35,
    lignes: [{ id: 'c', label: 'Journal', montant: 7.35, date: '2026-09-04' }],
  },
  {
    id: 'c-sante',
    nom: 'Santé',
    couleur: 'emerald',
    total: 3.03,
    lignes: [{ id: 'e', label: 'Pharmacie', montant: 3.03, date: '2026-09-07' }],
  },
];
const BASE: CategoriesCardProps = {
  total: 148.03,
  parJour: 14.803,
  joursEcoules: 10,
  month: 9,
  groupes: GROUPES,
};

function monter(props: Partial<CategoriesCardProps> = {}) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <CategoriesCard {...BASE} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('CategoriesCard (G-cat)', () => {
  it('renders its groups, and their subtotals add up to the total, to the cent', () => {
    monter();
    const card = screen.getByTestId('categories-card');
    expect(within(card).getByText('Catégories')).toBeInTheDocument();
    const lignes = screen.getAllByTestId('g-cat-ligne');
    expect(lignes).toHaveLength(4);
    const centimes = lignes.reduce((s, l) => s + Math.round(Number(l.dataset.total) * 100), 0);
    expect(centimes).toBe(
      Math.round(Number(screen.getByTestId('depense-mois-total').dataset.total) * 100),
    );
    expect(screen.getByTestId('depense-mois-total')).toHaveTextContent(/^148,03\s€$/);
    // « ≈ X / day » stays under the total.
    expect(screen.getByTestId('depense-mois-perday')).toHaveTextContent('10 jours');
  });

  it('keeps the expenses without a category as a named group', () => {
    monter();
    expect(screen.getAllByTestId('g-cat-ligne')[2]).toHaveTextContent(/Sans catégorie/);
  });

  it('a category opens g-cat with its lines to the cent', () => {
    monter();
    fireEvent.click(screen.getAllByTestId('g-cat-ligne')[1]!);
    const tiroir = screen.getByTestId('g-cat-tiroir');
    expect(within(tiroir).getByText('Courses · septembre')).toBeInTheDocument();
    expect(within(tiroir).getByTestId('g-cat-total')).toHaveTextContent(/62,65\s€/);
    const ops = within(tiroir).getAllByTestId('g-cat-operation');
    expect(ops.map((o) => o.textContent)).toEqual([
      expect.stringMatching(/50,55\s€$/),
      expect.stringMatching(/12,10\s€$/),
    ]);
  });

  it('below lg, folds after three categories and opens the rest on the spot', () => {
    monter();
    const replier = screen.getByTestId('g-cat-replier');
    expect(replier).toHaveTextContent('1 autre catégorie');
    expect(
      screen.getAllByTestId('g-cat-ligne')[3]!.closest('li')!.classList.contains('max-lg:hidden'),
    ).toBe(true);
    fireEvent.click(replier);
    expect(replier).toHaveTextContent('Réduire');
    expect(
      screen.getAllByTestId('g-cat-ligne')[3]!.closest('li')!.classList.contains('max-lg:hidden'),
    ).toBe(false);
  });

  it('an empty month says so, without a zero', () => {
    monter({ total: 0, parJour: 0, groupes: [] });
    expect(screen.getByTestId('categories-card')).toHaveTextContent(
      'Aucune dépense en septembre : rien à classer.',
    );
    expect(screen.queryByTestId('g-cat-ligne')).toBeNull();
  });
});
