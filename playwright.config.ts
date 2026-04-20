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
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      // Focus trap tests use Tab key (keyboard input) — unavailable on native mobile touch.
      // Tested via chromium-desktop with 375×667 viewport to cover mobile use case.
      testIgnore: '**/a11y/drawer-mobile-focus-trap.spec.ts',
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      // Focus trap tests use Tab key (keyboard input) — unavailable on native mobile touch.
      // Tested via chromium-desktop with 375×667 viewport to cover mobile use case.
      testIgnore: '**/a11y/drawer-mobile-focus-trap.spec.ts',
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
