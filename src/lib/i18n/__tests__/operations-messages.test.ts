import { describe, expect, it } from 'vitest';

import fr from '../../../../messages/fr-BE.json';
import nl from '../../../../messages/nl-BE.json';
import en from '../../../../messages/en.json';
import de from '../../../../messages/de-DE.json';
import es from '../../../../messages/es-ES.json';

/* PR C bis — vocabulary and parity of the keys this tour writes. */

function leaves(tree: unknown, prefix = ''): Record<string, string> {
  if (typeof tree === 'string') return { [prefix]: tree };
  return Object.entries(tree as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [k, v]) => ({ ...acc, ...leaves(v, prefix ? `${prefix}.${k}` : k) }),
    {},
  );
}

const touched = (m: typeof fr) => ({
  ...leaves(m.operations, 'operations'),
  ...leaves(m.errors.operations, 'errors.operations'),
  'cockpit.replis.cleVirements': m.cockpit.replis.cleVirements,
  'app.accounts.balance.manualNotice': m.app.accounts.balance.manualNotice,
});

describe('messages of the account operations', () => {
  it('have the same keys in the five languages', () => {
    const keys = Object.keys(touched(fr)).sort();
    for (const m of [nl, en, de, es]) {
      expect(Object.keys(touched(m as typeof fr)).sort()).toEqual(keys);
    }
  });

  it('say « reçu » (masculine), never « reçue » nor « revenu écrit »', () => {
    const text = Object.values(touched(fr)).join('\n');
    expect(text).toMatch(/Argent reçu/);
    expect(text).not.toMatch(/reçue|revenu écrit/i);
  });

  it('use none of the retired words', () => {
    const text = Object.values(touched(fr)).join('\n');
    expect(text).not.toMatch(/mouvement|rentrée|libellé|retenu|saisi/i);
  });

  it('name the transfer to make, as the mock-up does', () => {
    expect(fr.cockpit.replis.cleVirements).toBe('{montant} de virement à faire');
  });
});
