import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules', '.next', 'e2e', 'playwright-report', 'test-results'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/lib/domain/**/*.ts',
        'src/lib/schemas/**/*.ts',
        'src/lib/i18n/formatters.ts',
        'src/lib/actions/expenses.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts', '**/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
        // Server Actions sit below the global bar on purpose. They are mostly
        // guard clauses and one Supabase call, so the last few percent are the
        // error branches of the client itself — expensive to fake, worth little.
        // Without this per-glob entry, adding the file to `include` would fail
        // CI against the 90 % global bar rather than raise the floor.
        'src/lib/actions/expenses.ts': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws on import outside React's `react-server`
      // condition — by design, that is how it fails a client bundle at build
      // time. Under Vitest that would break every suite touching a module which
      // carries the marker, with an error naming the wrong cause. Aliased
      // globally rather than mocked per file so the next module to adopt the
      // marker does not lay a trap for the next test.
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
});
