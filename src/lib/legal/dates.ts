/**
 * Dates of the legal pages, written once as ISO dates and formatted in the
 * reader's language.
 *
 * They used to be French strings (« 19 septembre 2026 ») rendered as is on the
 * English, Dutch, German and Spanish pages: "last updated: 19 septembre 2026".
 * A date is part of what a legal page commits to; it should read in the page's
 * language like the rest of it.
 */
export const LEGAL_UPDATED = {
  privacy: '2026-09-19',
  cgu: '2026-09-19',
  cookies: '2026-09-19',
} as const;

export function formatLegalDate(isoDate: string, locale: string): string {
  // UTC on both sides: a calendar date must not shift by a day with the
  // server's time zone.
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
