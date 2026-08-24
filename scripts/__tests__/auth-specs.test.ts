import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// @ts-expect-error — plain ESM helper shared with the CI job, no .d.ts.
import { needsRealSupabase, discoverAuthSpecs } from '../lib/auth-specs.mjs';

/**
 * Le sélecteur de specs authentifiées — la règle, pas son résultat du jour.
 *
 * ## Pourquoi ce fichier existe
 *
 * Le sélecteur décide quelles specs le job `e2e-authenticated` exécute. Quand il
 * cesse de reconnaître une spec, celle-ci ne devient pas rouge : elle **disparaît**.
 * Le job reste vert avec moins de couverture, et c'est le pire des deux mondes —
 * une suite qui rétrécit en silence inspire confiance.
 *
 * C'est arrivé **deux fois** avec la même cause. Le prédicat cherchait d'abord
 * `adminClientOrNull` seul et manquait trois specs passant par `seededUser` ; le
 * correctif a élargi une liste de littéraux, et deux specs de plus ont glissé à
 * côté du nouveau littéral parce qu'elles nomment leurs semeurs autrement
 * (`seedUserWithCharges`, `seedOnboardedUser`). Aucun test ne couvrait ce fichier.
 *
 * ## Ce que ce test asserte, et pourquoi pas autre chose
 *
 * Il porte sur `needsRealSupabase(source)`, la RÈGLE. Un test qui se contenterait
 * d'asserter « tel fichier est découvert » passerait pour toujours dès l'instant
 * où ce fichier est listé — il prouverait l'état du dépôt d'aujourd'hui, jamais
 * la propriété qui doit tenir demain.
 */
describe('needsRealSupabase — la famille des semeurs, pas une liste de noms', () => {
  it.each([
    ['seedUser', 'const u = await seedUser(admin);'],
    ['seededUser', 'test(«…», async ({ seededUser }) => {});'],
    ['seedOnboardedUser', "const { seedOnboardedUser } = await import('../helpers/seed');"],
    ['seedUserWithCharges', "import { seedUserWithCharges } from './fixtures/mobile-test';"],
    ['adminClientOrNull', 'const admin = adminClientOrNull();'],
  ])('%s marque la spec comme authentifiée', (_nom, source) => {
    expect(needsRealSupabase(source)).toBe(true);
  });

  it('un nom de semeur encore inexistant est reconnu — c’est tout l’intérêt du motif', () => {
    // Le littéral suivant n'est employé nulle part dans le dépôt. Il représente
    // le semeur que quelqu'un écrira dans six mois : c'est LUI que ce test
    // protège, pas les cinq ci-dessus qui sont déjà connus.
    expect(needsRealSupabase('await seedUserWithSomethingNobodyHasWrittenYet(admin);')).toBe(true);
  });

  it('nettoyer un utilisateur ne suffit pas à déclarer une dépendance Supabase', () => {
    // `deleteSeededUser` seul décrit un nettoyage, pas un besoin de base réelle —
    // et la majuscule de « Seeded » est précisément ce qui défaisait le test par
    // sous-chaîne. La distinction est voulue, pas un effet de bord.
    expect(needsRealSupabase('afterEach(() => deleteSeededUser(admin, id));')).toBe(false);
  });

  it('une spec purement publique n’est pas happée', () => {
    expect(
      needsRealSupabase("await page.goto('/'); await expect(page).toHaveTitle(/Ankora/);"),
    ).toBe(false);
  });
});

describe('discoverAuthSpecs — les deux specs restées dans le noir jusqu’au 24 août 2026', () => {
  // Ces deux-là sont nommées explicitement parce qu'elles sont la RAISON du
  // correctif : elles n'avaient jamais été exécutées nulle part. Le test au-dessus
  // protège la classe ; celui-ci ancre le cas concret, pour qu'un futur
  // rétrécissement du motif se voie sur les deux fichiers qui l'ont motivé.
  it.each(['e2e/mobile-ios/dashboard.spec.ts', 'e2e/mobile-ios/auth-flow.spec.ts'])(
    '%s est découverte',
    (spec) => {
      expect(discoverAuthSpecs()).toContain(spec);
    },
  );

  it('toute spec qui sème est présente dans la liste committée', () => {
    // L'invariant que le job CI vérifie déjà, rejoué ici pour qu'il échoue en
    // quelques millisecondes plutôt qu'après huit minutes de Playwright.
    const listed: string[] = JSON.parse(
      fs.readFileSync(path.join('e2e', 'authenticated-specs.json'), 'utf8'),
    ).specs;
    const manquantes = (discoverAuthSpecs() as string[]).filter((s) => !listed.includes(s));
    expect(
      manquantes,
      `specs découvertes mais absentes de la liste : ${manquantes.join(', ')}`,
    ).toEqual([]);
  });
});
