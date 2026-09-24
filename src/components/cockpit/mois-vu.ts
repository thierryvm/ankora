import { periodOrdinal, toPeriodParam, type Period } from '@/lib/domain/period/viewed-period';

/**
 * The month the cockpit shows when it is NOT the current one, as its
 * sentences need it (ADR-046, lot 2 bis — decisions of @thierry, 24 Sept. 2026).
 *
 * Decided once, by the page, from the two periods: no component reads the
 * clock. `null` means the current month, whose wording stays today's.
 */
export type MoisVu = Readonly<{
  /** A month ahead speaks in the future (« Il te restera »), a past one in the past. */
  temps: 'aVenir' | 'passe';
  /** The month as its language writes it mid-sentence (« octobre », « October »). */
  month: string;
  /** French elides before a vowel or a mute h: « d’octobre », never « de octobre ». */
  voyelle: boolean;
  /** `?period=` of that month, for links that stay on it. */
  param: string;
}>;

/**
 * The month mid-sentence keeps the case its language gives it (« d’octobre »,
 * « for October »), unlike `formatMonth`, which capitalises for titles.
 */
export function moisDansLaPhrase(month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}

export function moisVuDe(viewed: Period, current: Period, locale: string): MoisVu | null {
  const ecart = periodOrdinal(viewed) - periodOrdinal(current);
  if (ecart === 0) return null;
  const month = moisDansLaPhrase(viewed.month, locale);
  return {
    temps: ecart > 0 ? 'aVenir' : 'passe',
    month,
    voyelle: /^[aeiouyâàéèêîôûh]/i.test(month),
    param: toPeriodParam(viewed),
  };
}
