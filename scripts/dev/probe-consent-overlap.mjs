// Mesure du recouvrement bannière de consentement ↔ bouton « Se connecter ».
// Le facteur déterminant est la HAUTEUR du viewport : la bannière est
// `fixed bottom-4`, le bouton est à y≈458 dans le flux.
import { chromium, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

const MESURE = async (page) =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) =>
      /se connecter/i.test(b.textContent ?? ''),
    );
    if (!btn) return { erreur: 'bouton introuvable' };
    const b = btn.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const dlg = document.querySelector('[role="dialog"][aria-labelledby="consent-title"]');
    const d = dlg?.getBoundingClientRect();
    return {
      boutonBas: Math.round(b.bottom),
      banniereHaut: d ? Math.round(d.top) : null,
      banniereH: d ? Math.round(d.height) : null,
      recoit: top ? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}` : null,
      bloque: Boolean(dlg && top && dlg.contains(top)),
    };
  });

const browser = await chromium.launch();

console.log('=== A. Presets d appareils réels (ceux qu utilise la CI) ===');
for (const nom of [
  'iPhone SE',
  'iPhone 12',
  'iPhone 14',
  'iPhone 15 Pro Max',
  'Pixel 7',
  'Galaxy S9+',
]) {
  const dev = devices[nom];
  if (!dev) continue;
  const ctx = await browser.newContext({ ...dev, locale: 'fr-BE' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const r = await MESURE(page);
  console.log(
    `${nom.padEnd(20)} ${dev.viewport.width}×${dev.viewport.height}  ` +
      `boutonBas=${r.boutonBas} banniereHaut=${r.banniereHaut} (h=${r.banniereH}) ` +
      `reçoit="${r.recoit}" → ${r.bloque ? 'BLOQUÉ' : 'cliquable'}`,
  );
  await ctx.close();
}

console.log('\n=== B. Balayage en hauteur à 390 px de large — seuil de bascule ===');
let dernierBloque = null;
let premierOk = null;
for (let h = 560; h <= 800; h += 10) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: h }, locale: 'fr-BE' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const r = await MESURE(page);
  if (r.bloque) dernierBloque = h;
  else if (premierOk === null) premierOk = h;
  await ctx.close();
}
console.log(`  dernière hauteur BLOQUÉE : ${dernierBloque} px`);
console.log(`  première hauteur OK      : ${premierOk} px`);

await browser.close();
