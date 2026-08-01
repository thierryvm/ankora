// innerText ne montre pas la valeur des <input> ni des <select> : on lit le DOM.
import { chromium, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 14'],
  viewport: { width: 390, height: 844 },
  locale: 'fr-BE',
  extraHTTPHeaders: { 'x-forwarded-for': `10.11.${((Date.now() / 1000) % 250) | 0}.7` },
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
const consent = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
if (await consent.count()) {
  await consent.getByRole('button', { name: /essentiels uniquement/i }).click();
  await page.waitForTimeout(300);
}
await page.getByLabel('Email').fill('ankora-test-profil@ankora.test');
await page.getByLabel('Mot de passe').fill('TestProfil!2026');
await page.getByRole('button', { name: /^se connecter$/i }).click();
await page.waitForURL(/\/app\b/, { timeout: 20000 });

await page.goto(`${BASE}/app/accounts`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log('===== /app/accounts — valeurs des champs =====');
console.log(
  JSON.stringify(
    await page.evaluate(() =>
      [...document.querySelectorAll('input')].map((i) => ({
        id: i.id || null,
        name: i.name || null,
        type: i.type,
        value: i.value,
        placeholder: i.placeholder || null,
      })),
    ),
    null,
    1,
  ),
);

await page.goto(`${BASE}/app/simulator`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log('\n===== /app/simulator — options de charge =====');
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const sels = [...document.querySelectorAll('select')].map((s) => ({
        id: s.id || null,
        nbOptions: s.options.length,
        options: [...s.options].slice(0, 6).map((o) => o.textContent?.trim()),
      }));
      const boutons = [...document.querySelectorAll('button')]
        .map((b) => b.textContent?.trim())
        .filter(Boolean)
        .slice(0, 12);
      return { selects: sels, boutons };
    }),
    null,
    1,
  ),
);

await browser.close();
