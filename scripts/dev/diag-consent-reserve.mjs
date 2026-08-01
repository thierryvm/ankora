// Diagnostic de la réserve `--consent-height` : la page gagne-t-elle vraiment
// de la marge de défilement, et le bouton sort-il de sous la bannière ?
import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const VIEWPORTS = [
  [320, 568, 'iPhone SE'],
  [390, 664, 'iPhone 12 / 14'],
  [430, 739, 'iPhone 15 Pro Max'],
  [390, 780, 'dernier bloqué mesuré'],
  [412, 839, 'Pixel 7'],
];

const browser = await chromium.launch();
for (const [width, height, nom] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'fr-BE' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  // SANS_RESERVE=1 neutralise le correctif à l'exécution : sert à vérifier que
  // e2e/consent-first-visit.spec.ts échouerait bien SANS lui — un test qui ne
  // sait pas échouer ne prouve rien.
  // (addStyleTag est refusé par la CSP de l'app — on retire la variable que la
  // bannière publie, ce qui reproduit exactement l'état d'avant le correctif.)
  if (process.env.SANS_RESERVE === '1') {
    await page.evaluate(() => document.documentElement.style.removeProperty('--consent-height'));
  }
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) =>
      /se connecter/i.test(b.textContent ?? ''),
    );
    const dlg = document.querySelector('[role="dialog"][aria-labelledby="consent-title"]');
    const variable = getComputedStyle(document.documentElement)
      .getPropertyValue('--consent-height')
      .trim();
    const padding = getComputedStyle(document.body).paddingBottom;
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
    const banniereH = dlg ? Math.round(dlg.getBoundingClientRect().height) : null;
    // `html { scroll-behavior: smooth }` (globals.css:451) anime le défilement :
    // sans `instant`, scrollY vaut encore 0 à la lecture suivante.
    // `block: 'start'` et non le fond de page : à 320×568 aller au fond fait
    // SORTIR le bouton par le haut (mesuré : -31→9).
    btn?.scrollIntoView({ block: 'start', behavior: 'instant' });
    const b = btn?.getBoundingClientRect();
    const d = dlg?.getBoundingClientRect();
    const top = b && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      variable,
      padding,
      banniereH,
      scrollMax,
      scrollY: Math.round(window.scrollY),
      bouton: b ? `${Math.round(b.top)}->${Math.round(b.bottom)}` : null,
      banniereHaut: d ? Math.round(d.top) : null,
      recoit: top ? `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}` : null,
      ok: Boolean(btn && top && (top === btn || btn.contains(top))),
    };
  });

  console.log(
    `${width}x${String(height).padEnd(4)} ${nom.padEnd(22)} var=${(r.variable || '(vide)').padEnd(7)} ` +
      `pad=${r.padding.padEnd(7)} bannH=${String(r.banniereH).padEnd(4)} scrollMax=${String(r.scrollMax).padEnd(4)} ` +
      `scrollY=${String(r.scrollY).padEnd(4)} bouton=${String(r.bouton).padEnd(9)} ` +
      `bannHaut=${String(r.banniereHaut).padEnd(4)} recoit="${r.recoit}" -> ${r.ok ? 'OK' : 'BLOQUE'}`,
  );
  await ctx.close();
}
await browser.close();
