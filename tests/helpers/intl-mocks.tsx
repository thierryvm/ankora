/**
 * Shared test helpers for mocking `next-intl/server` and `@/i18n/navigation`
 * in component tests that render Server Components or use the locale-aware Link.
 *
 * Usage in a `*.test.tsx` file:
 *
 * ```ts
 * import { vi } from 'vitest';
 * import { createIntlServerMock, createNavigationMock } from '../../../../tests/helpers/intl-mocks';
 *
 * vi.mock('next-intl/server', () => createIntlServerMock());
 * vi.mock('@/i18n/navigation', () => createNavigationMock());
 * ```
 *
 * The `getTranslations` mock walks the imported `fr-BE.json` messages
 * by namespace + dot-separated key, and supports `{var}` placeholder
 * interpolation when called with a `params` object.
 */
import * as React from 'react';

import messages from '../../messages/fr-BE.json';

/**
 * Creates the module mock object expected by `vi.mock('next-intl/server', ...)`.
 * Returns a `getTranslations(namespace)` resolver that uses the real
 * `messages/fr-BE.json` so tests assert against actual app copy without
 * hardcoding strings.
 */
export function createIntlServerMock() {
  return {
    getTranslations: async (namespace: string) => {
      const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
      return (key: string, params?: Record<string, unknown>): string => {
        const parts = key.split('.');
        let value: unknown = ns;
        for (const part of parts) {
          if (typeof value === 'object' && value !== null && part in value) {
            value = (value as Record<string, unknown>)[part];
          } else {
            return key; // graceful fallback for missing entries
          }
        }
        if (typeof value === 'string' && params) {
          return Object.entries(params).reduce(
            (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
            value,
          );
        }
        return typeof value === 'string' ? value : key;
      };
    },
  };
}

/**
 * Creates the module mock object expected by `vi.mock('@/i18n/navigation', ...)`.
 * Replaces the locale-aware `Link` with a plain `<a>` element so tests
 * can assert on `href` attributes directly.
 */
export function createNavigationMock() {
  return {
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
    } & Record<string, unknown>) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
}

// Note: tests should import `messages` directly from `messages/fr-BE.json`
// rather than re-exporting it here. Re-exporting through this helper has
// caused undefined import-cycle issues with vi.mock hoisting in some
// configurations. The helper focuses on the mock factories only.
