/**
 * ADR-046, lot 2 bis — the cockpit of ANOTHER month speaks in that month's
 * tense (decisions of @thierry, 24 Sept. 2026, tour 42 ter):
 *
 * - a month ahead is in the future: « Il te restera », « À payer en octobre »,
 *   « Reçu pour octobre »; its estimated savings are « — » with « Se calcule
 *   une fois le mois commencé. », never the whole budget;
 * - a past month is in the past: « Il t'est resté »;
 * - the month inside a sentence is lower-case where its language says so, and
 *   French elides before a vowel (« d'octobre », never « de Octobre »);
 * - the current month keeps today's wording, unchanged.
 *
 * Fictitious amounts only (dépôt public): the 505 € / 705 € family.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';

import frBE from '../../../../messages/fr-BE.json';
import nlBE from '../../../../messages/nl-BE.json';
import en from '../../../../messages/en.json';
import deDE from '../../../../messages/de-DE.json';
import esES from '../../../../messages/es-ES.json';

vi.mock('@/i18n/navigation', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : href.pathname} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const { createTranslator: make } = await import('next-intl');
    return make({ locale: 'fr-BE', messages: frBE as never, namespace: namespace as never });
  },
}));

import { moisDansLaPhrase, moisVuDe, type MoisVu } from '../mois-vu';
import { IlTeResteCard } from '../IlTeResteCard';
import { EncoreAPayerCard } from '../EncoreAPayerCard';
import { CascadeDuMois } from '@/components/dashboard/CascadeDuMois';
import { MonthNav } from '@/components/period/MonthNav';

/** The translator, loosely typed: the keys are checked at run time by the assertions. */
type Tr = (key: string, values?: Record<string, string>) => string;

const september = { year: 2026, month: 9 };

describe('moisVuDe — the tense of the viewed month is decided once, from the periods', () => {
  it('the current month has no « mois vu »: today’s wording stays', () => {
    expect(moisVuDe(september, september, 'fr-BE')).toBeNull();
  });

  it('October seen in September is ahead, August is past', () => {
    expect(moisVuDe({ year: 2026, month: 10 }, september, 'fr-BE')).toEqual({
      temps: 'aVenir',
      month: 'octobre',
      voyelle: true,
      param: '2026-10',
    });
    expect(moisVuDe({ year: 2026, month: 8 }, september, 'fr-BE')?.temps).toBe('passe');
    // A year boundary is not a month boundary.
    expect(moisVuDe({ year: 2027, month: 1 }, { year: 2026, month: 12 }, 'fr-BE')?.temps).toBe(
      'aVenir',
    );
  });
});

/**
 * One test per language, on the three months that start with a vowel in
 * French (avril, août, octobre): the elision is where « de Octobre » came from.
 */
const LOCALES = [
  { locale: 'fr-BE', messages: frBE, months: ['avril', 'août', 'octobre'] },
  { locale: 'nl-BE', messages: nlBE, months: ['april', 'augustus', 'oktober'] },
  { locale: 'en', messages: en, months: ['April', 'August', 'October'] },
  { locale: 'de-DE', messages: deDE, months: ['April', 'August', 'Oktober'] },
  { locale: 'es-ES', messages: esES, months: ['abril', 'agosto', 'octubre'] },
] as const;

describe.each(LOCALES)('$locale — the month inside a sentence', ({ locale, messages, months }) => {
  const t = createTranslator({ locale, messages: messages as never }) as unknown as Tr;

  it.each([
    [4, 0],
    [8, 1],
    [10, 2],
  ] as const)('month %i is written as its language writes it mid-sentence', (m, i) => {
    const vu = moisVuDe({ year: 2026, month: m }, { year: 2026, month: 6 }, locale) as MoisVu;
    expect(vu.month).toBe(months[i]);
    expect(moisDansLaPhrase(m, locale)).toBe(months[i]);

    const phrases = [
      t('cockpit.encoreAPayer.etiquetteMois', { month: vu.month }),
      t('cockpit.ilTeReste.termeRevenusMois', { month: vu.month }),
      t('cockpit.ilTeReste.baseMois', { month: vu.month, voyelle: vu.voyelle ? 'oui' : 'non' }),
      t('dashboard.situation.flow.depenseMois', { month: vu.month }),
      t('cockpit.encoreAPayer.resteEngagementsMois', {
        month: vu.month,
        voyelle: vu.voyelle ? 'oui' : 'non',
      }),
      t('dashboard.situation.flow.auDelaMois', { month: vu.month, montant: '10 €' }),
    ];
    for (const phrase of phrases) {
      expect(phrase).toContain(months[i]);
      // Never « de Octobre » / « en Août »: no preposition before a capital.
      if (locale === 'fr-BE' || locale === 'es-ES') {
        const capitalised = months[i].charAt(0).toUpperCase() + months[i].slice(1);
        expect(phrase).not.toContain('de ' + capitalised);
        expect(phrase).not.toContain('en ' + capitalised);
        // French elides: never « de octobre ».
        if (locale === 'fr-BE') expect(phrase).not.toContain('de ' + months[i]);
      }
    }
  });
});

describe('fr-BE — the exact sentences decided by the pilot', () => {
  const t = createTranslator({ locale: 'fr-BE', messages: frBE as never }) as unknown as Tr;

  it('elides before a vowel: « d’avril », « d’août », « d’octobre »', () => {
    for (const m of [4, 8, 10]) {
      const vu = moisVuDe({ year: 2026, month: m }, { year: 2026, month: 6 }, 'fr-BE') as MoisVu;
      expect(vu.voyelle).toBe(true);
      expect(t('cockpit.ilTeReste.baseMois', { month: vu.month, voyelle: 'oui' })).toBe(
        `sur ton budget d’${vu.month}`,
      );
    }
    expect(t('cockpit.ilTeReste.baseMois', { month: 'novembre', voyelle: 'non' })).toBe(
      'sur ton budget de novembre',
    );
  });
});

const october: MoisVu = { temps: 'aVenir', month: 'octobre', voyelle: true, param: '2026-10' };
const august: MoisVu = { temps: 'passe', month: 'août', voyelle: true, param: '2026-08' };

const carteProps = {
  ilTeReste: 1291,
  resteDisponible: 1291,
  revenus: 2505,
  depensesDuMois: 0,
  retenu: 1214,
  misDeCote: 0,
  soldeQuotidien: null,
  chargesFixes: 505,
  provisionsLissees: 609,
  engagementsMensuels: 100,
  monthLabel: 'Octobre',
  incomplet: false,
  locale: 'fr-BE' as const,
  cascade: null,
};

describe('IlTeResteCard — the tense of the viewed month', () => {
  it('a month ahead: « Il te restera », « Reçu pour octobre », « sur ton budget d’octobre »', async () => {
    render(await IlTeResteCard({ ...carteProps, moisVu: october }));
    expect(screen.getByText('Il te restera')).toBeInTheDocument();
    expect(screen.getByText(/Reçu pour octobre/)).toBeInTheDocument();
    expect(screen.getByText(/sur ton budget d’octobre/)).toBeInTheDocument();
    expect(screen.queryByText('Il te reste')).toBeNull();
    expect(screen.queryByText(/de Octobre/)).toBeNull();
  });

  it('a past month: « Il t’est resté »', async () => {
    render(await IlTeResteCard({ ...carteProps, monthLabel: 'Août', moisVu: august }));
    expect(screen.getByText('Il t’est resté')).toBeInTheDocument();
    expect(screen.getByText(/Reçu pour août/)).toBeInTheDocument();
  });

  it('the current month keeps today’s wording', async () => {
    render(await IlTeResteCard({ ...carteProps, monthLabel: 'Septembre', moisVu: null }));
    expect(screen.getByText('Il te reste')).toBeInTheDocument();
    expect(screen.getByText(/Argent reçu/)).toBeInTheDocument();
    expect(screen.getByText(/sur ton budget de Septembre/)).toBeInTheDocument();
  });
});

const encoreProps = {
  resteAPayer: 705,
  payees: 1,
  total: 2,
  lignes: [
    {
      id: 'c-assurance',
      label: 'Assurance fictive',
      montant: 705,
      dueDateIso: '2026-10-15',
      isOverdue: false,
    },
  ],
  bientot: [],
  monthLabel: 'Octobre',
  locale: 'fr-BE' as const,
};

describe('EncoreAPayerCard — the tense of the viewed month', () => {
  it('a month ahead: « À payer en octobre », taken out of what you WILL have left', async () => {
    render(await EncoreAPayerCard({ ...encoreProps, moisVu: october }));
    expect(screen.getByText('À payer en octobre')).toBeInTheDocument();
    expect(screen.getByText('Déjà retiré de ce qu’il te restera.')).toBeInTheDocument();
    expect(screen.queryByText('À payer ce mois')).toBeNull();
  });

  it('a past month: taken out of what you HAD left, « Tout est payé pour août »', async () => {
    render(
      await EncoreAPayerCard({
        ...encoreProps,
        resteAPayer: 0,
        lignes: [],
        payees: 2,
        monthLabel: 'Août',
        moisVu: august,
      }),
    );
    expect(screen.getByText('À payer en août')).toBeInTheDocument();
    expect(screen.getByText('✓ Tout est payé pour août.')).toBeInTheDocument();
  });

  it('the current month keeps « À payer ce mois »', async () => {
    render(await EncoreAPayerCard({ ...encoreProps, monthLabel: 'Septembre', moisVu: null }));
    expect(screen.getByText('À payer ce mois')).toBeInTheDocument();
    expect(screen.getByText('Déjà retiré de ce qu’il te reste.')).toBeInTheDocument();
  });
});

const cascadeProps = {
  revenus: 2505,
  revenuRecu: 1800,
  revenuEcrit: 2505,
  recuEnPlus: 0,
  misDeCote: 0,
  auDelaDuRevenu: 0,
  chargesFixes: 505,
  provisionsLissees: 609,
  engagementsMensuels: 100,
  chargesFixesParts: [],
  lissageParts: [],
  engagementsParts: [],
  resteDisponible: 1291,
  depensesDuMois: 0,
  ilTeReste: 1291,
  // What the domain returns for a month not begun: the whole budget. The
  // screen must not show it (decision 1).
  epargneEstimee: 1291,
  locale: 'fr-BE' as const,
};

describe('CascadeDuMois — the tense of the viewed month', () => {
  it('a month ahead: estimated savings « — » with its sentence, never the whole budget', async () => {
    render(await CascadeDuMois({ ...cascadeProps, moisVu: october }));
    expect(screen.getByTestId('situation-epargne-estimee')).toHaveTextContent('—');
    expect(screen.getByText('Se calcule une fois le mois commencé.')).toBeInTheDocument();
    expect(screen.getByText('Il te restera')).toBeInTheDocument();
    expect(screen.getByText('Dépensé en octobre')).toBeInTheDocument();
    expect(screen.getByText(/^Reçu pour octobre : /)).toBeInTheDocument();
  });

  it('a past month keeps its estimate, in the past tense', async () => {
    render(await CascadeDuMois({ ...cascadeProps, moisVu: august }));
    expect(screen.getByTestId('situation-epargne-estimee')).not.toHaveTextContent('—');
    expect(screen.getByText('Il t’est resté')).toBeInTheDocument();
    expect(screen.queryByText('Se calcule une fois le mois commencé.')).toBeNull();
  });

  it('the current month keeps today’s wording', async () => {
    render(await CascadeDuMois({ ...cascadeProps }));
    expect(screen.getByText('Il te reste')).toBeInTheDocument();
    expect(screen.getByText('Dépensé ce mois')).toBeInTheDocument();
    expect(screen.getByText(/^Reçu ce mois-ci /)).toBeInTheDocument();
  });
});

describe('MonthNav — one title, one target of 44 px', () => {
  const base = {
    pathname: '/app' as const,
    testIdPrefix: 'cockpit-period',
    prevParam: '2026-09',
    nextParam: '2026-11',
    isCurrent: false,
    labels: {
      navAria: 'Mois',
      prevAria: 'Mois précédent',
      nextAria: 'Mois suivant',
      backToCurrent: 'Revenir à Septembre',
    },
  };

  it('« Revenir à … » is a target of at least 44 px (min-h-11)', () => {
    render(<MonthNav {...base} label="Octobre 2026" />);
    const back = screen.getByTestId('cockpit-period-back');
    expect(back.className).toMatch(/\bmin-h-11\b/);
    expect(back.className).toMatch(/\binline-flex\b/);
  });

  it('without a label, the month is not repeated next to the title', () => {
    render(<MonthNav {...base} />);
    expect(screen.queryByTestId('cockpit-period-label')).toBeNull();
    expect(screen.getByLabelText('Mois suivant')).toBeInTheDocument();
  });
});
