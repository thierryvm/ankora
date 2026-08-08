// Le sélecteur de charge du simulateur est un combobox custom : il faut l'ouvrir.
import { chromium, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 14'],
  viewport: { width: 390, height: 844 },
  locale: 'fr-BE',
  extraHTTPHeaders: { 'x-forwarded-for': `10.13.${((Date.now() / 1000) % 250) | 0}.3` },
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

// La route `/app/simulator` a été supprimée le 2026-08-08 : le simulateur ne
// s'atteint plus que par le tiroir du cockpit. Y aller par `goto` rendrait une
// redirection vers `/app` et la sonde chercherait ses contrôles sur un écran qui
// ne les porte pas — un faux positif de défaut, pas un résultat vide.
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
await page.getByTestId('simulator-drawer-trigger').click();
await page.getByTestId('simulator-drawer').waitFor({ state: 'visible', timeout: 10000 });
await page.waitForTimeout(600);
// Deux pièges rencontrés, tous deux du côté de la sonde et non de l'app :
//  1. le scénario doit être choisi d'abord — le sélecteur n'existe pas avant ;
//  2. le sélecteur est un `role="combobox"`, pas un `button`. `getByRole('button')`
//     ne le trouve donc jamais, alors que son texte est bien « Choisis une
//     charge à simuler ». Une fois ouvert, il expose 19 `role="option"` — une
//     par charge. Le simulateur fonctionne.
await page.getByRole('button', { name: /^annuler une charge$/i }).click();
await page.waitForTimeout(500);
console.log(
  'boutons après choix du scénario :',
  JSON.stringify(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean),
    ),
  ),
);
console.log(
  'attributs du sélecteur :',
  JSON.stringify(
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) =>
        /choisis une charge/i.test(x.textContent ?? ''),
      );
      if (!b) return null;
      return {
        texte: b.textContent?.trim(),
        nomAccessible: b.getAttribute('aria-label'),
        role: b.getAttribute('role'),
        ariaExpanded: b.getAttribute('aria-expanded'),
        ariaHaspopup: b.getAttribute('aria-haspopup'),
        disabled: b.disabled,
        ariaDisabled: b.getAttribute('aria-disabled'),
      };
    }),
  ),
);
// Clic par le DOM, en contournant le nom accessible manquant.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    /choisis une charge/i.test(x.textContent ?? ''),
  );
  b?.click();
});
await page.waitForTimeout(700);
console.log(
  'après ouverture — rôles présents :',
  JSON.stringify(
    await page.evaluate(() => {
      const c = {};
      for (const el of document.querySelectorAll('[role]')) {
        const r = el.getAttribute('role');
        c[r] = (c[r] ?? 0) + 1;
      }
      return c;
    }),
  ),
);
await page.screenshot({
  path: 'C:/Users/Utilisateur/dev/captures-ankora/16-simulateur-liste.png',
  fullPage: true,
});

const liste = await page.evaluate(() => {
  const opts = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim());
  return { nbOptions: opts.length, premieres: opts.slice(0, 8) };
});
console.log('options ouvertes :', JSON.stringify(liste, null, 1));

if (liste.nbOptions > 0) {
  // On choisit « Impôt » : c'est la charge en doublon avec le plan d'apurement.
  const cible = page.getByRole('option', { name: /impôt/i }).first();
  if (await cible.count()) {
    await cible.click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: 'C:/Users/Utilisateur/dev/captures-ankora/17-simulateur-impact.png',
      fullPage: true,
    });
    console.log('\n===== impact affiché =====');
    console.log((await page.locator('main').innerText()).replace(/\n{3,}/g, '\n\n'));
  }
}
await browser.close();
