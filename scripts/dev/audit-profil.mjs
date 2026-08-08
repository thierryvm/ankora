// Parcours iPhone 390×844 sur le profil de test — captures + relevé des chiffres.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3100';
const OUT = 'C:/Users/Utilisateur/dev/captures-ankora';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 14'],
  locale: 'fr-BE',
  timezoneId: 'Europe/Brussels',
  extraHTTPHeaders: { 'x-forwarded-for': `10.7.${Math.floor(Date.now() / 1000) % 250}.42` },
});
const page = await ctx.newPage();
const notes = [];

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/00-consentement.png`, fullPage: true });
// FRICTION MESURÉE : en 390 px la bannière recouvre le bouton « Se connecter »
// et intercepte les clics (subtree intercepts pointer events). Impossible de se
// connecter sans traiter le consentement d'abord.
const consent = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
if (await consent.count()) {
  await consent.getByRole('button', { name: /essentiels uniquement/i }).click();
  await page.waitForTimeout(400);
}
await page.getByLabel('Email').fill('ankora-test-profil@ankora.test');
await page.getByLabel('Mot de passe').fill('TestProfil!2026');
await page.screenshot({ path: `${OUT}/01-login.png`, fullPage: true });
await page.getByRole('button', { name: /^se connecter$/i }).click();
try {
  await page.waitForURL(/\/app\b/, { timeout: 20000 });
} catch {
  notes.push(
    `LOGIN KO — url=${page.url()} · corps="${(await page.locator('body').innerText()).slice(0, 300)}"`,
  );
}

const shots = [
  ['02-cockpit', '/app'],
  ['03-charges', '/app/charges'],
  ['04-depenses', '/app/expenses'],
  ['05-engagements', '/app/commitments'],
  // `06-simulateur` retiré le 2026-08-08 avec la route `/app/simulator` : le
  // simulateur ne vit plus que dans le tiroir du cockpit. Le conserver aurait
  // produit une capture du cockpit étiquetée « simulateur ».
  ['07-comptes', '/app/accounts'],
  ['08-parametres', '/app/settings'],
];

for (const [name, path] of shots) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  } catch (e) {
    notes.push(`${path} KO : ${e.message.split('\n')[0]}`);
  }
}

// Texte intégral du cockpit — c'est là qu'on lit les chiffres réels.
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const cockpit = await page.locator('main').innerText();

// Recherche d'un mécanisme de notification de reversement.
const REVERSEMENT = /vire|virement|revers|transf|provision.*compte|alimenter/i;
const lignesReversement = cockpit.split('\n').filter((l) => REVERSEMENT.test(l));

console.log('===== TEXTE COCKPIT =====');
console.log(cockpit);
console.log('===== LIGNES « REVERSEMENT » =====');
console.log(lignesReversement.length ? lignesReversement.join('\n') : '(aucune)');
console.log('===== NOTES =====');
console.log(notes.length ? notes.join('\n') : '(aucune)');

await browser.close();
