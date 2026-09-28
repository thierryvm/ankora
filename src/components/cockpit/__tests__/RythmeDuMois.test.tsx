import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/fr-BE.json';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href.pathname} {...rest}>
      {children}
    </a>
  ),
}));

import Decimal from 'decimal.js';

import { epargneEstimee } from '@/lib/domain/cockpit/epargne-estimee';

import { RythmeDuMois, type RythmeDuMoisProps } from '../RythmeDuMois';

// Fictitious household (public repo): the 505 € budget family. September 2026,
// day 10 of 30. Income 1 705 − bills 705 − monthly share 300 − instalments 195 = 505.
const DEPENSES = [
  { id: 'e1', label: 'Courses', montant: 50.5, date: '2026-09-02' },
  { id: 'e2', label: 'Boulangerie', montant: 4.2, date: '2026-09-03' },
  { id: 'e3', label: 'Pharmacie', montant: 12.3, date: '2026-09-07' },
  { id: 'e4', label: 'Marché', montant: 45, date: '2026-09-09' },
];

function serie(depenses: typeof DEPENSES, jours = 30) {
  let cumule = 0;
  return Array.from({ length: jours }, (_, i) => {
    const jour = i + 1;
    const duJour = depenses
      .filter((d) => Number(d.date.slice(8)) === jour)
      .reduce((s, d) => s + d.montant, 0);
    cumule = Math.round((cumule + duJour) * 100) / 100;
    return { jour, duJour, cumule };
  });
}

const BASE: RythmeDuMoisProps = {
  year: 2026,
  month: 9,
  joursDuMois: 30,
  joursEcoules: 10,
  serie: serie(DEPENSES),
  depenses: DEPENSES,
  depensesDuMois: 112,
  projection: 336,
  epargne: 169,
  tropTot: false,
  budget: {
    montant: 505,
    revenus: 1705,
    retenu: 1200,
    chargesFixes: 705,
    provisionsLissees: 300,
    engagementsMensuels: 195,
    misDeCote: 0,
  },
};

function monter(props: Partial<RythmeDuMoisProps> = {}) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <RythmeDuMois {...BASE} {...props} />
    </NextIntlClientProvider>,
  );
}

// Money is formatted with narrow / regular no-break spaces: \s matches both.
const eur = (s: string) => new RegExp(s.replace(/ /g, '\\s').replace(',', ','));

describe('RythmeDuMois', () => {
  it('renders the month: the gap in words in the fold key, the spent figure, the projection', () => {
    monter();
    const repli = screen.getByTestId('repli-rythme');
    expect(repli.querySelector('[data-repli-cle]')?.textContent).toMatch(/^56\s€ de marge$/);
    // Folded below lg, whole on desktop: the classes must be whole tokens (a
    // formatter once glued them to their neighbour, and the body showed at 375).
    const tetes = repli.querySelector('[data-repli-tete]')!;
    expect(tetes.classList.contains('lg:hidden')).toBe(true);
    const corps = document.getElementById(tetes.getAttribute('aria-controls')!)!;
    expect(corps.classList.contains('hidden')).toBe(true);
    expect(corps.classList.contains('lg:block')).toBe(true);
    fireEvent.click(tetes);
    expect(corps.classList.contains('hidden')).toBe(false);

    const tete = screen.getByRole('button', { name: /112\s€ dépensés au 10 septembre/ });
    expect(tete.getAttribute('aria-label')).toMatch(eur('56 € de marge sur le rythme'));
    expect(within(tete).getByText(eur('à ce rythme, 336 € sur 505 € au 30'))).toBeTruthy();
    expect(screen.getByRole('img', { name: /Dépensé cumulé/ })).toBeTruthy();
    // Two slices of five elapsed days, each a target.
    expect(screen.getAllByTestId('rythme-tranche')).toHaveLength(2);
  });

  it('opens g-jour on a slice: its total is the sum of its lines, with the gap to the rhythm', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /Du 6 au 10 septembre/ }));
    const tiroir = screen.getByTestId('rythme-tiroir-jour');
    expect(within(tiroir).getByRole('heading', { name: 'Du 6 au 10 septembre' })).toBeTruthy();
    const total = within(tiroir).getByTestId('rythme-total');
    expect(total.textContent).toMatch(/= Dépensé du 6 au 10 septembre/);
    expect(total.textContent).toMatch(eur('57,30 €'));
    expect(within(tiroir).getByText('Pharmacie')).toBeTruthy();
    expect(within(tiroir).getByText('Marché')).toBeTruthy();
    expect(within(tiroir).queryByText('Courses')).toBeNull();
    const ecart = within(tiroir).getByTestId('rythme-ecart');
    expect(ecart.textContent).toMatch(/Marge sur le rythme/);
    expect(ecart.textContent).toMatch(eur('rythme 168,33 € − dépensé 112 € = 56,33 €'));
  });

  it('opens g-rythme on the header: total, rhythm, projection, budget and its source', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: /112\s€ dépensés au 10 septembre/ }));
    const tiroir = screen.getByTestId('rythme-tiroir-mois');
    expect(within(tiroir).getByTestId('rythme-total').textContent).toMatch(eur('112 €'));
    expect(within(tiroir).getByTestId('rythme-rythme').textContent).toMatch(
      eur('budget du mois 505 € × 10 ÷ 30 jours'),
    );
    const projection = within(tiroir).getByTestId('rythme-projection');
    expect(projection.textContent).toMatch(/= Projection au 30 septembre/);
    expect(projection.textContent).toMatch(eur('336 €'));
    const budget = within(tiroir).getByTestId('rythme-budget');
    expect(budget.textContent).toMatch(eur('1 705 €'));
    expect(budget.textContent).toMatch(eur('−705 €'));
    expect(budget.textContent).toMatch(eur('−300 €'));
    expect(budget.textContent).toMatch(eur('−195 €'));
    expect(budget.textContent).toMatch(/= Budget du mois/);
    expect(budget.textContent).toMatch(eur('505 €'));
    // No set-aside line when nothing was set aside.
    expect(budget.textContent).not.toMatch(/Mis de côté/);
  });

  it('says what to do on a month without spending', () => {
    monter({ depenses: [], serie: serie([]), depensesDuMois: 0, projection: 0 });
    expect(screen.getByText(/Aucune dépense en septembre jusqu’ici/)).toBeTruthy();
    const lien = screen.getByRole('link', { name: 'Ajouter une dépense' });
    expect(lien.getAttribute('href')).toMatch(/\/app\/expenses$/);
    expect(screen.queryAllByTestId('rythme-tranche')).toHaveLength(0);
  });
});

describe('RythmeDuMois — ÉPARGNE block and « Trop tôt pour projeter » (G-12, G-31)', () => {
  it('writes the domain savings figure, source « calculé », and its operation in one line', () => {
    const domaine = epargneEstimee({
      budgetDuMois: new Decimal(BASE.budget.montant),
      depensesDuMois: new Decimal(BASE.depensesDuMois),
      joursEcoules: BASE.joursEcoules,
      joursDuMois: BASE.joursDuMois,
    });
    expect(domaine?.toNumber()).toBe(169);
    monter({ epargne: domaine!.toNumber() });
    const bloc = screen.getByTestId('rythme-epargne');
    expect(bloc).toHaveTextContent(/^Épargne · calculé/);
    expect(bloc).toHaveTextContent(
      /Fin septembre : 169\s€, le budget moins le dépensé projeté au 30\./,
    );
    expect(bloc).not.toHaveTextContent(/estim/i);
  });

  it('before the 7th day of the month, says when the figure appears, without an amount', () => {
    monter({ joursEcoules: 5, projection: null, epargne: null });
    expect(screen.getByTestId('rythme-epargne')).toHaveTextContent(
      'Fin septembre : se calcule dès le 7.',
    );
  });

  it('too early: says so, and writes neither the projection nor a savings amount', () => {
    monter({ tropTot: true });
    const bloc = screen.getByTestId('rythme-epargne');
    expect(bloc).toHaveTextContent(/^Épargne/);
    expect(bloc).not.toHaveTextContent('calculé');
    expect(bloc).toHaveTextContent(
      'Trop tôt pour projeter. La projection paraît au 7e jour de données, ou à la 5e dépense.',
    );
    expect(bloc).not.toHaveTextContent('169');
    // The projection (336 €) is written nowhere on the card, key and header included.
    expect(screen.getByTestId('repli-rythme')).not.toHaveTextContent(/336/);
    expect(document.querySelector('[data-rythme="projection"]')).toBeNull();
  });
});

// ADR-047 — October's budget month opened on 28 September (fictitious payday):
// index 1 is 28 September, index 30 is 27 October.
describe('RythmeDuMois — budget month that opened before the 1st (ADR-047)', () => {
  const OCTOBRE = { year: 2026, month: 9, decalage: 27, joursDuMois: 30, joursEcoules: 10 };

  it('the axis names dates of the budget window, never raw day indexes', () => {
    monter(OCTOBRE);
    const axe = screen.getByTestId('rythme-axe');
    const reperes = Array.from(axe.querySelectorAll('span')).map((s) => s.textContent);
    expect(reperes[0]).toBe('28 sept.');
    expect(reperes).toContain('5 oct.');
    expect(reperes[reperes.length - 1]).toBe('27 oct.');
    // No bare number: « 1 », « 5 », « 10 » would read as days of September.
    for (const r of reperes) expect(r).toMatch(/\D/);
  });

  it('the savings line calls the end by the budget month, not the calendar one', () => {
    monter(OCTOBRE);
    const epargne = screen.getByTestId('rythme-epargne');
    expect(epargne).toHaveTextContent('Fin octobre');
    expect(epargne).not.toHaveTextContent('septembre');
    expect(epargne).toHaveTextContent('27 oct.');
  });

  it('a calendar month keeps its numbered axis', () => {
    monter();
    const reperes = Array.from(screen.getByTestId('rythme-axe').querySelectorAll('span')).map(
      (s) => s.textContent,
    );
    expect(reperes).toEqual(['1', '5', '10', '15', '20', '25', '30']);
  });
});
