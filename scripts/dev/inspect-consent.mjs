import { chromium, devices } from '@playwright/test';
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['iPhone 14'], locale: 'fr-BE' })).newPage();
await p.goto('http://localhost:3100/login', { waitUntil: 'networkidle' });
const d = p.locator('[role="dialog"][aria-labelledby="consent-title"]');
console.log('TEXTE:', (await d.innerText()).replace(/\n/g, ' | '));
for (const e of await d.getByRole('button').all())
  console.log('BOUTON:', JSON.stringify(await e.innerText()));
for (const e of await d.getByRole('link').all())
  console.log('LIEN:', JSON.stringify(await e.innerText()));
await b.close();
