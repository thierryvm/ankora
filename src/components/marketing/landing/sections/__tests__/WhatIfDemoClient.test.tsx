import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl', () => ({
  useLocale: () => 'fr-BE',
  useTranslations: (namespace: string) => {
    let cursor: unknown = messages;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)?.[part];
    }
    return (key: string, params?: Record<string, string | number>) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return value.replace(/\{(\w+)\}/g, (_, k: string) =>
          k in params ? String(params[k]) : `{${k}}`,
        );
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

import { WhatIfDemoClient } from '../WhatIfDemoClient';
import { PROJECTION_MONTHS, WHAT_IF_SCENARIOS } from '../simulator/scenarios';

/**
 * Les libellés d'axe viennent du serveur, calculés depuis la date du jour. Une
 * liste fixe ici est délibérée : ces cas testent le TRACÉ, pas le calendrier —
 * c'est `WhatIfDemo.test.tsx` qui vérifie que les six mois partent du mois
 * courant.
 */
const MOIS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin'] as const;

const GSM = WHAT_IF_SCENARIOS.find((s) => s.id === 'gsm')!;
const ELEC = WHAT_IF_SCENARIOS.find((s) => s.id === 'elec')!;

describe('<WhatIfDemoClient />', () => {
  it('rend un bouton par scénario', () => {
    render(<WhatIfDemoClient mois={MOIS} />);
    expect(screen.getByRole('button', { name: /Renégocier mon GSM/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Changer de fournisseur d'électricité/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Couper deux streamings/i })).toBeInTheDocument();
  });

  it('bascule aria-pressed quand on change de scénario', () => {
    render(<WhatIfDemoClient mois={MOIS} />);
    const gsm = screen.getByRole('button', { name: /Renégocier mon GSM/i });
    const stream = screen.getByRole('button', { name: /Couper deux streamings/i });

    expect(gsm).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(stream);
    expect(stream).toHaveAttribute('aria-pressed', 'true');
    expect(gsm).toHaveAttribute('aria-pressed', 'false');
  });

  // ─── Ce que le curseur porte ────────────────────────────────────────────
  // Le cœur de la refonte du 22 août. Il portait l'ÉCART — une donnée que
  // personne ne possède : on connaît ce qu'on paie et ce qu'on paierait, pas
  // leur différence. Il porte maintenant le prix futur, borné par le plancher
  // marché et le prix actuel.

  it('borne le curseur entre le plancher marché et le prix actuel', () => {
    render(<WhatIfDemoClient mois={MOIS} />);
    const curseur = screen.getByRole('slider') as HTMLInputElement;
    expect(curseur.min).toBe(String(GSM.floor));
    expect(curseur.max).toBe(String(GSM.current));
    expect(curseur.value).toBe(String(GSM.default));
  });

  it('ramène le curseur au repos du nouveau scénario', () => {
    render(<WhatIfDemoClient mois={MOIS} />);
    fireEvent.click(screen.getByRole('button', { name: /Changer de fournisseur/i }));
    const curseur = screen.getByRole('slider') as HTMLInputElement;
    expect(curseur.value).toBe(String(ELEC.default));
    expect(curseur.min).toBe(String(ELEC.floor));
  });

  it('DÉDUIT l économie du prix choisi, au lieu de la demander', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    // 42 € payés aujourd'hui, curseur amené à 30 € → 12 € par mois.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '30' } });
    expect(within(container).getByText(/Tu économises 12\s*€ par mois/)).toBeInTheDocument();
  });

  // ─── Ce que le graphique montre ─────────────────────────────────────────

  it('affiche un total qui vaut exactement économie × mois, et rien d autre', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '30' } });
    // 12 €/mois × 6 mois = 72 €. Aucune réserve fictive ne s'y ajoute : avant le
    // 22/08 le graphique montait de 698 € dont 628 € (90 %) venaient d'une
    // trajectoire codée en dur que le visiteur ne pouvait pas décomposer.
    //
    // La valeur paraît TROIS fois, et chacune a un rôle distinct : le chiffre
    // héros l'annonce, le libellé du dernier point l'ancre sur la courbe, et la
    // ligne de tableau la rend lisible sans souris. Au survol d'un autre mois le
    // libellé suit le curseur tandis que le héros reste sur le total — c'est ce
    // qui fait du libellé une lecture et non une répétition.
    //
    // Le compte est asserté plutôt que la simple présence : si le tableau
    // cessait un jour de porter les mêmes valeurs que la courbe, la vue
    // accessible mentirait sans que rien ne rougisse.
    const occurrences = within(container).getAllByText(/\+72\s*€/);
    expect(occurrences).toHaveLength(3);
  });

  it('ne trace qu UNE série — la baseline fictive a disparu', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    const chart = container.querySelector('svg[role="img"]')!;
    // Un `querySelectorAll('svg path')` global attraperait les icônes Lucide ;
    // on reste ancré sur le graphique par son role="img".
    expect(chart.querySelectorAll('path[data-testid="whatif-line"]')).toHaveLength(1);
    expect(chart.querySelectorAll('path[data-testid="whatif-area"]')).toHaveLength(1);
    // Aucun tracé en pointillés : ni seconde série, ni grille pointillée.
    expect(chart.querySelectorAll('[stroke-dasharray]')).toHaveLength(0);
  });

  it('ne rend plus de zones de seuil — elles qualifiaient un niveau, pas un écart', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    expect(container.querySelectorAll('rect[data-threshold]')).toHaveLength(0);
  });

  it('n affiche aucune légende, puisqu il n y a qu une série', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    expect(within(container).queryByText(/Sans changement/i)).toBeNull();
    expect(within(container).queryByText(/Avec ton choix/i)).toBeNull();
  });

  it('n étiquette qu UN point, pas les six', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    const chart = container.querySelector('svg[role="img"]')!;
    const montants = [...chart.querySelectorAll('text')].filter((n) =>
      /€/.test(n.textContent ?? ''),
    );
    expect(montants).toHaveLength(1);
  });

  // ─── Accessibilité ──────────────────────────────────────────────────────

  it('double le graphique d une vue tableau lisible sans souris', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    // Le survol ENRICHIT la lecture, il ne la conditionne jamais : sans ce
    // tableau, les valeurs intermédiaires ne seraient atteignables qu'à la
    // souris.
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(PROJECTION_MONTHS);
    // `sr-only` masque à l'œil sans retirer de l'arbre d'accessibilité —
    // `hidden` ou `aria-hidden` le retireraient des deux.
    expect(table!.className).toContain('sr-only');
    expect(table!.getAttribute('aria-hidden')).toBeNull();
  });

  it('donne au curseur un texte de valeur qui dit le prix ET l économie', () => {
    render(<WhatIfDemoClient mois={MOIS} />);
    const curseur = screen.getByRole('slider');
    expect(curseur.getAttribute('aria-valuetext')).toMatch(/28\s*€.*14\s*€/);
  });

  // ─── CSP — la classe de défaut la plus documentée du dépôt ──────────────

  it('ne pose AUCUN attribut style, ni sur le curseur ni dans le graphique', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    // La CSP de production n'autorise pas `'unsafe-hashes'` : tout `style=`
    // inline est retiré en production alors qu'il reste vert ici et en
    // développement. Cinq précédents dans ce dépôt, dont un qui affichait
    // « soldé » sur tous les plans en production. Le repère de survol est donc
    // positionné par `transform`, qui est un attribut SVG.
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
    const repere = container.querySelector('[data-testid="whatif-marker"]')!;
    expect(repere.getAttribute('transform')).toMatch(/^translate\(/);
  });

  it('pilote la couleur du curseur par une classe utilitaire, jamais en inline', () => {
    render(<WhatIfDemoClient mois={MOIS} />);
    const curseur = screen.getByRole('slider') as HTMLInputElement;
    expect(curseur.className).toContain('accent-brand-400');
    expect(curseur.style.accentColor).toBe('');
  });

  it('neutralise les transitions sous prefers-reduced-motion', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    for (const id of ['whatif-area', 'whatif-line', 'whatif-marker']) {
      const noeud = container.querySelector(`[data-testid="${id}"]`);
      expect(noeud?.getAttribute('class')).toContain('motion-reduce:transition-none');
    }
  });

  it('expose le graphique en role="img" avec un libellé traduit', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    const svg = container.querySelector('svg[role="img"]');
    expect(svg?.getAttribute('aria-label')).toBe(
      messages.landing.whatif.chart.aria.replace('{months}', String(PROJECTION_MONTHS)),
    );
  });

  // ─── Le cas limite ──────────────────────────────────────────────────────

  it('n affiche pas « +0 € » quand il n y a rien à gagner', () => {
    const { container } = render(<WhatIfDemoClient mois={MOIS} />);
    // Curseur au prix actuel : aucun changement, donc aucun gain. « +0 € » se
    // lirait comme un gain acquis mais nul ; « 0 € » dit qu'il ne se passe rien.
    fireEvent.change(screen.getByRole('slider'), { target: { value: String(GSM.current) } });
    expect(within(container).queryByText(/\+0\s*€/)).toBeNull();
    expect(within(container).getAllByText(/\b0\s*€/).length).toBeGreaterThan(0);
  });
});
