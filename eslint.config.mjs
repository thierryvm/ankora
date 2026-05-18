import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Purely cosmetic HTML-entity rule — noisy on French copy with apostrophes/quotes
      // in user-facing text. Modern React handles unescaped entities fine.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-console': 'warn',
      // ADR-020 — canonical frontier atoms/ (Ankora CD#3) vs ui/ (Radix infra).
      // Force AnkButton/AnkCard usage from the barrel to prevent doublons regressions.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/components/atoms/Button', '@/components/atoms/Card'],
              message: 'Use AnkButton or AnkCard from @/components/atoms instead (cf. ADR-020).',
            },
          ],
        },
      ],
    },
  },
  {
    // Allow console in bootstrap and logging modules
    files: ['src/lib/env.ts', 'src/lib/log.ts', 'src/lib/log-types.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated artefacts (gitignored too — defensive double-guard for ESLint):
    '.tmp/**', // Playwright traces / temp Storybook / scratch
    'coverage/**', // Vitest coverage reports
    'playwright-report/**',
    'test-results/**',
    'blob-report/**',
    '.lighthouseci/**',
    // Design handoff input docs (Claude Design Session bundles, prototypes JSX
    // not meant to ship — gitignored, but ESLint scans the filesystem so we
    // exclude them explicitly to keep `npm run lint` clean):
    'design_handoff_ankora_v1/**',
  ]),
]);

export default eslintConfig;
