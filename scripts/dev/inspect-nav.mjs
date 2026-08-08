// Relève la structure RÉELLE de la navigation mobile du cockpit : rôles,
// noms accessibles, position. Écrit pour ne rien deviner — un `getByRole`
// posé sur le mauvais rôle échoue en silence et se lit « le contrôle est
// cassé » alors qu'il dit « ma sonde regarde ailleurs ».
import { chromium, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3150';
const browser = await chromium.launch();
const page = await (
  await browser.newContext({ ...devices['iPhone 14'], locale: 'fr-BE' })
).newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
const banniere = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
if (await banniere.isVisible().catch(() => false)) {
  await banniere.getByRole('button').first().click();
  await banniere.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}
await page.getByLabel(/e-?mail/i).fill('ankora-test-profil@ankora.test');
await page.getByLabel(/mot de passe/i).fill('TestProfil!2026');
await page.getByRole('button', { name: /connexion|se connecter/i }).click();
await page.waitForURL(/\/app/, { timeout: 20_000 });
await page.waitForTimeout(1000);

const nav = await page.evaluate(() => {
  const H = window.innerHeight;
  const dansLePli = (el) => {
    const r = el.getBoundingClientRect();
    return r.top < H && r.bottom > 0;
  };
  // Tout contrôle interactif ancré en bas d'écran (barre d'onglets) ou fixe.
  const controles = [...document.querySelectorAll('a,button,[role="button"],[role="tab"]')]
    .filter((el) => {
      const cs = getComputedStyle(el);
      const fixe = ['fixed', 'sticky'].includes(cs.position);
      const parentFixe = el.closest('nav,[role="navigation"],footer,header');
      return (fixe || parentFixe) && dansLePli(el);
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') ?? '(implicite)',
        nomAccessible: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
        href: el.getAttribute('href') ?? null,
        conteneur: el.closest('nav,footer,header')?.tagName.toLowerCase() ?? '(aucun)',
        y: Math.round(r.top),
        largeur: Math.round(r.width),
        hauteur: Math.round(r.height),
        cibleOk: r.width >= 44 && r.height >= 44,
      };
    });
  return { hauteurEcran: H, controles };
});

console.log(
  `écran ${nav.hauteurEcran}px — ${nav.controles.length} contrôles de navigation ancrés\n`,
);
for (const c of nav.controles) {
  console.log(
    `  ${c.conteneur.padEnd(7)} ${c.tag.padEnd(6)} role=${c.role.padEnd(11)} ` +
      `y=${String(c.y).padStart(4)} ${String(c.largeur).padStart(3)}×${String(c.hauteur).padStart(3)}` +
      `${c.cibleOk ? '   ' : ' ⚠ '} "${c.nomAccessible}" ${c.href ?? ''}`,
  );
}
await browser.close();
