// Audit écran par écran sur le profil de test, viewport iPhone 390×844.
// Capture + dump du texte de chaque écran, pour comparer les chiffres affichés
// aux totaux de contrôle recalculés hors application.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const OUT = 'C:/Users/Utilisateur/dev/captures-ankora';
mkdirSync(OUT, { recursive: true });

const ECRANS = [
  ['10-charges', '/app/charges'],
  ['11-depenses', '/app/expenses'],
  ['12-engagements', '/app/commitments'],
  // `13-simulateur` retiré le 2026-08-08 : la route `/app/simulator` a été
  // supprimée, le simulateur n'existe plus que dans le tiroir du cockpit. Le
  // laisser aurait capturé le cockpit sous le nom « simulateur » — un artefact
  // faux, plus trompeur qu'une capture manquante.
  ['14-comptes', '/app/accounts'],
  ['15-parametres', '/app/settings'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 14'],
  viewport: { width: 390, height: 844 },
  locale: 'fr-BE',
  timezoneId: 'Europe/Brussels',
  extraHTTPHeaders: { 'x-forwarded-for': `10.9.${((Date.now() / 1000) % 250) | 0}.11` },
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

for (const [nom, chemin] of ECRANS) {
  try {
    await page.goto(`${BASE}${chemin}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${nom}.png`, fullPage: true });
    const txt = await page.locator('main').innerText();
    console.log(`\n===== ${chemin} =====`);
    console.log(txt.replace(/\n{3,}/g, '\n\n'));
  } catch (e) {
    console.log(`\n===== ${chemin} — ÉCHEC : ${e.message.split('\n')[0]} =====`);
  }
}

await browser.close();
