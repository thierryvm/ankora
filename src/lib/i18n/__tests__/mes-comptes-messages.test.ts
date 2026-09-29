import { describe, it, expect } from 'vitest';

import fr from '../../../../messages/fr-BE.json';
import en from '../../../../messages/en.json';
import nl from '../../../../messages/nl-BE.json';
import de from '../../../../messages/de-DE.json';
import es from '../../../../messages/es-ES.json';

/*
 * Tour 59 ter — the Accounts page and the cockpit's « Il te reste » block, in
 * the five languages. A key missing in one locale, or left in English outside
 * `en`, is a screen that speaks two languages at once.
 */
const LOCALES = { 'fr-BE': fr, en, 'nl-BE': nl, 'de-DE': de, 'es-ES': es } as const;
type Messages = typeof fr;

describe('Mes comptes — clés neuves à parité', () => {
  it.each(Object.entries(LOCALES))('%s porte « sinceTitle » avec son {date}', (_locale, m) => {
    const v = (m as Messages).app.accounts.balance.sinceTitle;
    expect(typeof v).toBe('string');
    expect(v).toContain('{date}');
  });

  it('en dit « as of » pour le solde de départ, jamais « Starting balance of »', () => {
    expect(en.app.accounts.balance.readSinceStart).toMatch(/^Starting balance as of \{date\}/);
  });

  it('de titre la section « Deine Kontostände »', () => {
    expect(de.app.accounts.balancesHeading).toBe('Deine Kontostände');
  });
});

describe('« Il te reste » au cockpit — traduit en nl, de, es', () => {
  const keys = Object.keys(fr.cockpit.ilTeReste) as Array<keyof Messages['cockpit']['ilTeReste']>;

  it.each([
    ['nl-BE', nl],
    ['de-DE', de],
    ['es-ES', es],
  ] as const)('%s : aucune clé du bloc laissée en anglais', (_locale, m) => {
    const block = (m as Messages).cockpit.ilTeReste;
    const english = keys.filter((k) => k !== 'etiquette' && block[k] === en.cockpit.ilTeReste[k]);
    expect(english).toEqual([]);
    expect(block.titre).not.toBe(en.cockpit.ilTeReste.titre);
  });

  it.each([
    ['nl-BE', nl],
    ['de-DE', de],
    ['es-ES', es],
  ] as const)(
    '%s : mêmes {variables} que en (fr ajoute les siennes, pour l’élision)',
    (_locale, m) => {
      const block = (m as Messages).cockpit.ilTeReste;
      for (const k of keys) {
        const vars = (s: string) =>
          [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((x) => x[1]))].sort();
        expect(vars(block[k]), k).toEqual(vars(en.cockpit.ilTeReste[k]));
      }
    },
  );
});
