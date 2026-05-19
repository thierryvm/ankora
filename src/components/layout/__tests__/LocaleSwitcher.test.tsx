import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import frMessages from '../../../../messages/fr-BE.json';

/**
 * LocaleSwitcher is the `<select>` rendered inside the marketing + cockpit
 * headers. Doctrine (CLAUDE.md "Cap v1.0 publique") restricts the visible
 * locales to FR-BE + EN; the wider LOCALES set stays the source of truth for
 * the next-intl middleware so deep-link URLs to /nl-BE etc. keep working.
 *
 * These tests enforce the doctrine at the UI surface: the `<select>` must
 * only render FR + EN, never the partial NL/ES/DE locales currently shipped
 * in `messages/*.json`.
 */

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/actions/locale', () => ({
  setLocaleAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr-BE',
  useTranslations: (namespace: string) => {
    return (key: string) => {
      const ns = (frMessages as Record<string, Record<string, unknown>>)[namespace.split('.')[0]!];
      const parts = namespace.split('.').slice(1);
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        }
      }
      const keyParts = key.split('.');
      for (const part of keyParts) {
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

import { LocaleSwitcher } from '../LocaleSwitcher';

beforeEach(() => {
  cleanup();
});

describe('<LocaleSwitcher /> — v1.0 doctrine FR + EN only', () => {
  it('renders exactly two options in the select', () => {
    render(<LocaleSwitcher />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
  });

  it('exposes fr-BE and en as the only option values', () => {
    render(<LocaleSwitcher />);
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const values = options.map((o) => o.value);
    expect(values).toEqual(['fr-BE', 'en']);
  });

  it('does NOT expose nl-BE, es-ES or de-DE (partial translations not yet doctrine-approved)', () => {
    render(<LocaleSwitcher />);
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const values = options.map((o) => o.value);
    expect(values).not.toContain('nl-BE');
    expect(values).not.toContain('es-ES');
    expect(values).not.toContain('de-DE');
  });
});
