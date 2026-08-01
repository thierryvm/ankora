import { describe, it, expect } from 'vitest';

const LOCALES = ['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const;

const LEAF_KEYS = [
  'heroLabel',
  // ADR-035 replaced `heroSubtitle` with `heroAnchor`, which carries the two
  // ICU placeholders of the anchor line under the hero figure. It is a
  // replacement, not an addition: leaving the old key would be exactly the
  // orphan synonym the glossary exists to remove.
  'heroAnchor',
  'voirPlan',
  'statut.vert',
  // ADR-035 — `orangeCapacite` described a user-invented envelope being
  // exceeded. `orangeDepasse` describes « Il te reste » going below zero.
  'statut.orangeDepasse',
  'statut.orangeProvisions',
  'statut.rouge',
  'nudge.orangeDepasse',
  'nudge.orangeProvisions',
  'nudge.rouge',
  'incomplet.title',
  'incomplet.body',
  'incomplet.cta',
  'flow.revenus',
  'flow.chargesFixes',
  'flow.provisions',
  'flow.resteDisponible',
  'flow.depense',
  'flow.ilTeReste',
  'flow.epargneEstimee',
  'flow.parJour',
  'barAria',
] as const;

/**
 * Words banned from the whole UI by ADR-035, checked against the namespace
 * this chantier owns.
 *
 * Scoped to `dashboard.situation` on purpose. A repo-wide grep would also flag
 * « Vie Courante » as an ACCOUNT name — that is ADR-008's naming, a different
 * subject from the envelope removed here — and would turn this guard into
 * either a permanent failure or a licence to rename things out of scope.
 */
const BANNED_IN_SITUATION = [
  'reste à vivre',
  'reste disponible',
  'vie courante',
  "disponible aujourd'hui",
  "capacité d'épargne",
  'reste du mois',
] as const;

/**
 * The four figures of the glossary (ADR-035) and the label each locale must
 * show for them. Guards the property that gave the chantier its name: one
 * word, one number. A fifth name for an existing figure fails here.
 */
const GLOSSARY_KEYS = [
  'heroLabel', // 1. « Il te reste »   — hero, real-time
  'flow.resteDisponible', // 2. « Budget du mois »  — anchor
  'flow.depense', // 3. « Dépensé ce mois »
  'flow.epargneEstimee', // 4. « Épargne estimée »
] as const;

function leaf(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (typeof acc === 'object' && acc !== null && k in acc) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe('dashboard.situation — i18n parity (5 locales)', () => {
  it.each(LOCALES)(
    'locale %s exposes every situation key as a non-empty string',
    async (locale) => {
      const m = (await import(`../../../../../messages/${locale}.json`)).default as {
        dashboard: { situation: unknown };
      };
      for (const key of LEAF_KEYS) {
        const value = leaf(m.dashboard.situation, key);
        expect(value, `${locale} → dashboard.situation.${key}`).toBeTypeOf('string');
        expect((value as string).length, `${locale} → dashboard.situation.${key}`).toBeGreaterThan(
          0,
        );
      }
    },
  );

  /**
   * One word, one number (ADR-035).
   *
   * The defect this chantier fixes is that « reste à vivre » named four
   * different figures at once, so one screen contradicted the next. The mirror
   * failure is just as bad and easier to reintroduce: two figures ending up
   * under the same label. This asserts the four glossary figures carry four
   * distinct labels in every locale.
   */
  it.each(LOCALES)('locale %s gives the four figures four distinct labels', async (locale) => {
    const m = (await import(`../../../../../messages/${locale}.json`)).default as {
      dashboard: { situation: unknown };
    };
    const labels = GLOSSARY_KEYS.map((key) => leaf(m.dashboard.situation, key) as string);
    const unique = new Set(labels.map((l) => l.toLocaleLowerCase()));
    expect(
      unique.size,
      `${locale} reuses a label across the glossary: ${JSON.stringify(labels)}`,
    ).toBe(GLOSSARY_KEYS.length);
  });

  /**
   * The hero anchor line must keep both ICU placeholders. Dropping one is a
   * silent failure: next-intl renders the sentence without the number, so the
   * user sees "sur de budget · dépensés" and nothing throws.
   */
  it('fr-BE carries none of the banned words in dashboard.situation', async () => {
    const m = (await import('../../../../../messages/fr-BE.json')).default as {
      dashboard: { situation: unknown };
    };
    const blob = JSON.stringify(m.dashboard.situation).toLocaleLowerCase();
    const found = BANNED_IN_SITUATION.filter((word) => blob.includes(word));
    expect(found, `banned wording still present: ${found.join(', ')}`).toEqual([]);
  });

  it.each(LOCALES)('locale %s keeps both placeholders in heroAnchor', async (locale) => {
    const m = (await import(`../../../../../messages/${locale}.json`)).default as {
      dashboard: { situation: unknown };
    };
    const anchor = leaf(m.dashboard.situation, 'heroAnchor') as string;
    expect(anchor, `${locale} → heroAnchor missing {budget}`).toContain('{budget}');
    expect(anchor, `${locale} → heroAnchor missing {depense}`).toContain('{depense}');
  });
});
