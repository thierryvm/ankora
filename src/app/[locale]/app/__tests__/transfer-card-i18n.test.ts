import { describe, it, expect } from 'vitest';

const LOCALES = ['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const;

/**
 * The transfer card's three visible strings (`src/app/[locale]/app/page.tsx`).
 *
 * Nothing guarded them until 2026-08-06. `situation-i18n.test.ts` covers the
 * hero, but it is scoped to the `dashboard.situation` namespace on purpose —
 * the card lives in `app.dashboard`, so it sat outside every existing guard.
 * That is how it stayed on « Principal → Épargne » for a full day after
 * ADR-035's amendment decided otherwise, with a green CI throughout.
 */
const CARD_KEYS = [
  'transferPrincipalToEpargne',
  'transferEpargneToPrincipal',
  'transferEpargneHint',
] as const;

/**
 * ICU placeholders are code identifiers, not displayed words.
 *
 * `transferEpargneHint` interpolates `{provision}` — the name of the domain
 * field `epargneProvisionTarget`, which ADR-035 §2 deliberately does NOT
 * rename (« on lui retire un libellé, pas son identité »). Checking banned
 * vocabulary against the raw string would therefore flag a name the ADR
 * protects. Strip the placeholders first, then look at what the user reads.
 */
function displayedText(value: string): string {
  return value.replace(/\{[^}]*\}/g, ' ');
}

type CardKey = (typeof CARD_KEYS)[number];
type CardStrings = Record<CardKey, string | undefined>;

/**
 * Deliberately typed with `| undefined`: a JSON file carries no type guarantee,
 * and a missing key is precisely one of the failures this file exists to catch.
 * Narrowing it away with `as string` would let a locale lose a key and still
 * satisfy `tsc` — the guard would then assert on `undefined` and read as green
 * in three of the four cases below.
 */
async function cardStrings(locale: string): Promise<CardStrings> {
  const m = (await import(`../../../../../messages/${locale}.json`)).default as {
    app: { dashboard: Record<string, unknown> };
  };
  const entries = CARD_KEYS.map((key) => {
    const value = m.app.dashboard[key];
    return [key, typeof value === 'string' ? value : undefined] as const;
  });
  return Object.fromEntries(entries) as CardStrings;
}

/** Fails loudly rather than asserting on `undefined`, which always looks green. */
function requis(strings: CardStrings, key: CardKey, locale: string): string {
  const value = strings[key];
  if (value === undefined) throw new Error(`${locale} → app.dashboard.${key} is missing`);
  return value;
}

describe('app.dashboard transfer card — i18n (5 locales)', () => {
  it.each(LOCALES)('locale %s exposes the three card strings, non-empty', async (locale) => {
    const strings = await cardStrings(locale);
    for (const key of CARD_KEYS) {
      expect(strings[key], `${locale} → app.dashboard.${key}`).toBeTypeOf('string');
      expect(strings[key]?.length ?? 0, `${locale} → app.dashboard.${key}`).toBeGreaterThan(0);
    }
  });

  /**
   * The card renders ONE of the two titles, chosen by the sign of
   * `epargneTransferNet`. Identical titles would make the sign carry no
   * information at all — the user would read the same sentence whether the
   * month feeds savings or draws on them.
   */
  it.each(LOCALES)('locale %s tells the two directions apart', async (locale) => {
    const strings = await cardStrings(locale);
    expect(
      requis(strings, 'transferPrincipalToEpargne', locale).toLocaleLowerCase(),
      `${locale} gives both transfer directions the same title`,
    ).not.toBe(requis(strings, 'transferEpargneToPrincipal', locale).toLocaleLowerCase());
  });

  /**
   * ADR-035, amendment of 2026-08-05 — the card states an INSTRUCTION.
   *
   * The titles used to read « Principal → Épargne » / « Épargne → Principal »:
   * a route between two accounts, which says where the money travels but never
   * what the user is being asked to do. The amendment replaced them with
   * « À virer vers l'épargne » / « À reprendre sur l'épargne ».
   *
   * Asserting the exact decided sentence would freeze the copy and break on any
   * legitimate rewording. What must not come back is the FORM: an account-to-
   * account arrow. That property survives rewording, and it was false in all
   * five locales before this change.
   */
  it.each(LOCALES)('locale %s states an instruction, not an account route', async (locale) => {
    const strings = await cardStrings(locale);
    for (const key of ['transferPrincipalToEpargne', 'transferEpargneToPrincipal'] as const) {
      const title = requis(strings, key, locale);
      expect(title, `${locale} → ${key} is an account-to-account arrow`).not.toContain('→');
    }
  });

  /**
   * Same silent-failure class as `heroAnchor`: next-intl renders a sentence
   * with a missing placeholder without throwing, so the hint would explain the
   * subtraction while showing neither of its two terms.
   */
  it.each(LOCALES)('locale %s keeps both placeholders in the hint', async (locale) => {
    const hint = requis(await cardStrings(locale), 'transferEpargneHint', locale);
    expect(hint, `${locale} → hint missing {provision}`).toContain('{provision}');
    expect(hint, `${locale} → hint missing {bills}`).toContain('{bills}');
  });

  /**
   * ADR-035, amendment of 2026-08-05 — a flux, a movement, a stock.
   *
   * « Provision » names the STOCK sitting on the savings account, shown by
   * `ProvisionHealthGaugeCard`. This card shows a MOVEMENT. Using the same word
   * for both is the defect the amendment closes, one layer below the one
   * ADR-035 closed for « reste à vivre ».
   *
   * French-only, and stated as such — exactly like `BANNED_IN_SITUATION` in
   * `situation-i18n.test.ts`. A multilingual banned list would mean inventing a
   * translation dictionary for a decision taken in French; the four other
   * locales are covered by the parity and placeholder guards above.
   */
  it('fr-BE keeps « provision » out of the card, where it would name a movement', async () => {
    const strings = await cardStrings('fr-BE');
    const offenders = CARD_KEYS.filter((key) =>
      displayedText(requis(strings, key, 'fr-BE'))
        .toLocaleLowerCase()
        .includes('provision'),
    );
    expect(offenders, `« provision » denotes the stock, not this movement: ${offenders}`).toEqual(
      [],
    );
  });
});
