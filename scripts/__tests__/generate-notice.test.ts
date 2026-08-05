import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Le générateur est en `.mjs` (il tourne aussi hors de la chaîne TypeScript,
// via `npm run notice`). Son typage vit dans `generate-notice.d.mts`, à côté de
// lui — pas dans ce fichier : une copie des types dans la spec finirait par
// décrire un module que le générateur n'est plus.
import {
  BEGIN_MARKER,
  END_MARKER,
  corpsGenere,
  remplacerRegion,
  atteignablesEnProduction,
  type Lock,
  type LockPackage,
} from '../generate-notice.mjs';

const ROOT = join(__dirname, '..', '..');
const lire = (nom: string) => readFileSync(join(ROOT, nom), 'utf8');
const lireJson = (nom: string) => JSON.parse(lire(nom));

/** Un lockfile minimal : uniquement les champs que le générateur consulte. */
const lockDe = (packages: Record<string, LockPackage>): Lock => ({ packages });

describe('generate-notice — le NOTICE committé', () => {
  it("est identique à ce que le générateur produit aujourd'hui", () => {
    const attendu = remplacerRegion(
      lire('NOTICE'),
      corpsGenere(lireJson('package-lock.json'), lireJson('package.json')),
    );
    expect(
      lire('NOTICE'),
      'Le NOTICE a dérivé de package-lock.json. Lance `npm run notice` et committe le résultat.',
    ).toBe(attendu);
  });

  it('porte ses deux marqueurs, une seule fois chacun', () => {
    const notice = lire('NOTICE');
    expect(notice.split(BEGIN_MARKER).length - 1).toBe(1);
    expect(notice.split(END_MARKER).length - 1).toBe(1);
  });
});

describe('generate-notice — les portes', () => {
  it('échoue sur une licence à déclencheur réseau atteignable en production', () => {
    const lock = lockDe({
      'node_modules/a': { version: '1.0.0', license: 'MIT', dependencies: { b: '^1' } },
      'node_modules/b': { version: '2.0.0', license: 'AGPL-3.0-only' },
    });
    expect(() => corpsGenere(lock, { dependencies: { a: '^1' } })).toThrowError(
      /node_modules\/b.*AGPL-3\.0-only/s,
    );
  });

  it("n'échoue PAS sur une licence à déclencheur de distribution — elle est déclarée", () => {
    // Le cas réel : LGPL sur les binaires natifs de `sharp`. Une porte qui
    // bloquerait là refuserait de générer le fichier tous les jours, pour un
    // déclencheur qu'un service hébergé ne franchit pas.
    const lock = lockDe({
      'node_modules/a': { version: '1.0.0', license: 'MIT', optionalDependencies: { b: '^1' } },
      'node_modules/b': { version: '2.0.0', license: 'LGPL-3.0-or-later' },
    });
    const corps = corpsGenere(lock, { dependencies: { a: '^1' } });
    expect(corps).toContain('LGPL-3.0-or-later');
    expect(corps).toContain('déclencheur de distribution');
  });

  it('échoue sur une entrée de production sans champ de licence', () => {
    const lock = lockDe({
      'node_modules/a': { version: '1.0.0', license: 'MIT', dependencies: { b: '^1' } },
      'node_modules/b': { version: '2.0.0' },
    });
    expect(() => corpsGenere(lock, { dependencies: { a: '^1' } })).toThrowError(
      /node_modules\/b.*license/s,
    );
  });

  it('refuse un fichier dont les marqueurs ne sont pas uniques', () => {
    const double = `${BEGIN_MARKER}\nx\n${END_MARKER}\n${BEGIN_MARKER}\ny\n${END_MARKER}`;
    expect(() => remplacerRegion(double, 'CORPS')).toThrowError(/marqueurs/);
    expect(() => remplacerRegion('aucun marqueur ici', 'CORPS')).toThrowError(/marqueurs/);
  });
});

describe('generate-notice — ce qui est atteignable en production', () => {
  it('suit les arêtes OPTIONNELLES, que les drapeaux du lockfile classent en dev', () => {
    // Reproduction exacte du cas `next` → `sharp` → `@img/sharp-*` : npm marque
    // le binaire `dev: true` alors qu'il est atteignable depuis la production.
    // Se fier au drapeau ferait disparaître une LGPL du document.
    const lock = lockDe({
      'node_modules/cadre': {
        version: '1.0.0',
        license: 'MIT',
        optionalDependencies: { image: '^1' },
      },
      'node_modules/image': {
        version: '1.0.0',
        license: 'Apache-2.0',
        devOptional: true,
        dependencies: { binaire: '^1' },
      },
      'node_modules/binaire': {
        version: '1.0.0',
        license: 'LGPL-3.0-or-later',
        dev: true,
        optional: true,
      },
    });
    const vus = atteignablesEnProduction(lock, { dependencies: { cadre: '^1' } });
    expect([...vus].sort()).toEqual([
      'node_modules/binaire',
      'node_modules/cadre',
      'node_modules/image',
    ]);
  });

  it('distingue deux copies du même paquet par leur CHEMIN', () => {
    // Le cas `intl-messageformat` : la copie hissée est de développement, la
    // copie de production vit sous `node_modules/use-intl/node_modules/`. Un
    // index par NOM lit la mauvaise — c'est la faute qui a motivé ce script.
    const lock = lockDe({
      'node_modules/hote': { version: '1.0.0', license: 'MIT', dependencies: { commun: '^2' } },
      'node_modules/hote/node_modules/commun': { version: '2.0.0', license: 'BSD-3-Clause' },
      'node_modules/commun': { version: '1.0.0', license: 'MIT', dev: true },
    });
    const vus = atteignablesEnProduction(lock, { dependencies: { hote: '^1' } });
    expect(vus.has('node_modules/hote/node_modules/commun')).toBe(true);
    expect(vus.has('node_modules/commun')).toBe(false);
  });

  it("n'inclut pas ce qui n'est joignable que par les dépendances de développement", () => {
    const lock = lockDe({
      'node_modules/prod': { version: '1.0.0', license: 'MIT' },
      'node_modules/outil': { version: '1.0.0', license: 'MPL-2.0', dev: true },
    });
    const vus = atteignablesEnProduction(lock, { dependencies: { prod: '^1' } });
    expect(vus.has('node_modules/outil')).toBe(false);
  });
});

describe('generate-notice — ce qui est écrit à la main', () => {
  it('survit octet pour octet à une régénération', () => {
    const notice = lire('NOTICE');
    const avant = notice.slice(0, notice.indexOf(BEGIN_MARKER));
    const apresFin = notice.slice(notice.indexOf(END_MARKER) + END_MARKER.length);

    const regenere = remplacerRegion(notice, `${BEGIN_MARKER}\nTOUT AUTRE\n${END_MARKER}`);

    expect(regenere.slice(0, regenere.indexOf(BEGIN_MARKER))).toBe(avant);
    expect(regenere.slice(regenere.indexOf(END_MARKER) + END_MARKER.length)).toBe(apresFin);
    // Cas de contrôle : la région, elle, a bien changé — sinon les deux
    // assertions ci-dessus passeraient sur une fonction qui ne fait rien.
    expect(regenere).toContain('TOUT AUTRE');
    expect(regenere).not.toBe(notice);
  });
});
