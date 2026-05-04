import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

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
    // exclusively the WebKit-specific suite under `e2e/mobile-ios/`. Locale fr-BE,
    // timezone Europe/Brussels, geolocation Bruxelles for FSMA coherence.
    {
      name: 'iPhone 14',
      use: {
        ...devices['iPhone 14'],
        locale: 'fr-BE',
        timezoneId: 'Europe/Brussels',
        geolocation: { longitude: 4.3517, latitude: 50.8503 },
        permissions: ['geolocation'],
      },
      testMatch: '**/mobile-ios/**/*.spec.ts',
    },
    {
      name: 'iPhone 15 Pro Max',
      use: {
        ...devices['iPhone 15 Pro Max'],
        locale: 'fr-BE',
        timezoneId: 'Europe/Brussels',
        geolocation: { longitude: 4.3517, latitude: 50.8503 },
        permissions: ['geolocation'],
      },
      testMatch: '**/mobile-ios/**/*.spec.ts',
    },
    {
      name: 'iPhone SE',
      use: {
        ...devices['iPhone SE'],
        locale: 'fr-BE',
        timezoneId: 'Europe/Brussels',
        geolocation: { longitude: 4.3517, latitude: 50.8503 },
        permissions: ['geolocation'],
      },
      testMatch: '**/mobile-ios/**/*.spec.ts',
    },
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
