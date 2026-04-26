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
  ]),
]);

export default eslintConfig;
