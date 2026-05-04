import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Shared base for the Sprint Mobile Recovery iPhone projects (PR-QA-1b).
// Extracted to a single constant so a future change (timezone, geo, perms)
// happens in one place and cannot drift between the 3 viewports.
// Not `as const` because Playwright's UseOptions expects mutable arrays.
const IOS_SPRINT_BASE = {
  locale: 'fr-BE',
  timezoneId: 'Europe/Brussels',
  geolocation: { longitude: 4.3517, latitude: 50.8503 },
  permissions: ['geolocation'],
};

const IOS_SPRINT_DEVICES = ['iPhone 14', 'iPhone 15 Pro Max', 'iPhone SE'] as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], locale: 'fr-BE' },
      testIgnore: '**/mobile-ios/**',
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'], locale: 'fr-BE' },
      // Focus trap tests use Tab key (keyboard input) — unavailable on native mobile touch.
      // Tested via chromium-desktop with 375×667 viewport to cover mobile use case.
      // Mobile-iOS sprint suite has its own dedicated projects below — exclude here to avoid duplicate runs.
      testIgnore: ['**/a11y/drawer-mobile-focus-trap.spec.ts', '**/mobile-ios/**'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], locale: 'fr-BE' },
      // Focus trap tests use Tab key (keyboard input) — unavailable on native mobile touch.
      // Tested via chromium-desktop with 375×667 viewport to cover mobile use case.
      testIgnore: ['**/a11y/drawer-mobile-focus-trap.spec.ts', '**/mobile-ios/**'],
    },

    // Sprint Mobile Recovery (PR-QA-1b, 4 mai 2026) — three iPhone viewports running
    // exclusively the WebKit-specific suite under `e2e/mobile-ios/`. Shared
    // config (locale, timezone, geo, perms) lives in IOS_SPRINT_BASE above.
    ...IOS_SPRINT_DEVICES.map((name) => ({
      name,
      use: { ...devices[name], ...IOS_SPRINT_BASE },
      testMatch: '**/mobile-ios/**/*.spec.ts',
    })),
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
