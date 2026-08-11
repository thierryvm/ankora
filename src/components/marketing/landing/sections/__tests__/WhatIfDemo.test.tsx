import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr-BE',
  getTranslations: async (namespace: string) => {
    let cursor: unknown = messages;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)?.[part];
    }
    return (key: string) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

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

import { WhatIfDemo } from '../WhatIfDemo';

async function renderWhatIfDemo() {
  return render(await WhatIfDemo());
}

describe('<WhatIfDemo />', () => {
  it('exposes the section anchor #simulator (referenced by MktNav + Hero CTA)', async () => {
    const { container } = await renderWhatIfDemo();
    const section = container.querySelector('section#simulator');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('aria-labelledby')).toBe('whatif-heading');
  });

  it('renders the localised badge + title + subtitle in the header', async () => {
    await renderWhatIfDemo();
    expect(screen.getByText(messages.landing.whatif.badge)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: messages.landing.whatif.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.landing.whatif.subtitle)).toBeInTheDocument();
  });

  it('hands off to <WhatIfDemoClient /> (3 scenario buttons appear)', async () => {
    await renderWhatIfDemo();
    expect(screen.getAllByRole('button', { name: /Renégocier|Changer|Couper/i })).toHaveLength(3);
  });

  /**
   * Le sous-titre promet « 6 mois à partir d'aujourd'hui ». L'axe portait six
   * mois FIGÉS (« mai … oct ») : faux dix mois sur douze, et entièrement dans
   * le passé à partir de novembre. Ce cas est le témoin que la promesse et
   * l'axe parlent du même calendrier.
   */
  it("l'axe part du mois courant et couvre six mois", async () => {
    const { container } = await renderWhatIfDemo();
    const libelles = [...container.querySelectorAll('svg text')]
      .map((n) => n.textContent ?? '')
      .filter((s) => s.length > 0 && !/[€\d]/.test(s));

    const format = new Intl.DateTimeFormat('fr-BE', { month: 'short' });
    const aujourdhui = new Date();
    const attendus = Array.from({ length: 6 }, (_, i) =>
      format.format(new Date(aujourdhui.getFullYear(), aujourdhui.getMonth() + i, 1)),
    );

    expect(libelles).toEqual(attendus);
  });

  /**
   * Contre-épreuve : le cas ci-dessus doit pouvoir ÉCHOUER. Un axe figé sur
   * « mai … oct » ne coïncide avec le mois courant qu'en mai — donc onze mois
   * sur douze, l'ancien code aurait rougi. On vérifie ici que la liste
   * attendue bouge bien avec la date, sinon le témoin ne prouve rien.
   */
  it('les mois attendus dépendent réellement de la date', () => {
    const format = new Intl.DateTimeFormat('fr-BE', { month: 'short' });
    const enJanvier = format.format(new Date(2026, 0, 1));
    const enJuillet = format.format(new Date(2026, 6, 1));
    expect(enJanvier).not.toBe(enJuillet);
  });
});
