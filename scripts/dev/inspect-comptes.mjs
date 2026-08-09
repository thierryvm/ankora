// Relève les contrôles de /app/accounts : nom accessible réel de chaque champ
// et de chaque bouton d'enregistrement. Écrit après qu'une sonde a cherché
// « revenu » et n'a rien trouvé — le champ s'appelle autrement.
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

await page.goto(`${BASE}/app/accounts`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const releve = await page.evaluate(() => {
  const nomAccessible = (el) => {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const par = el.getAttribute('aria-labelledby');
    if (par)
      return par
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join(' ');
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return lab.textContent.trim();
    }
    return el.closest('label')?.textContent?.trim() ?? '(AUCUN)';
  };
  const champs = [...document.querySelectorAll('input,select,textarea')].map((el) => ({
    type: el.type ?? el.tagName.toLowerCase(),
    nom: nomAccessible(el),
    valeur: el.value,
    y: Math.round(el.getBoundingClientRect().top + window.scrollY),
  }));
  const boutons = [...document.querySelectorAll('button')]
    .map((el) => ({
      nom: el.textContent.trim().slice(0, 40),
      y: Math.round(el.getBoundingClientRect().top + window.scrollY),
    }))
    .filter((b) => b.nom);
  return {
    hauteurDocument: document.documentElement.scrollHeight,
    hauteurEcran: window.innerHeight,
    champs,
    boutons,
  };
});

console.log(
  `/app/accounts — document ${releve.hauteurDocument}px sur écran ${releve.hauteurEcran}px`,
);
console.log(
  `= ${(releve.hauteurDocument / releve.hauteurEcran).toFixed(2)} écrans de défilement\n`,
);

console.log('CHAMPS :');
const parNom = new Map();
for (const c of releve.champs) {
  parNom.set(c.nom, (parNom.get(c.nom) ?? 0) + 1);
  console.log(`  y=${String(c.y).padStart(5)}  [${c.type}] "${c.nom}"  valeur="${c.valeur}"`);
}
console.log('\nNOMS EN DOUBLON (ambiguïté pour un lecteur d écran) :');
let doublon = false;
for (const [nom, n] of parNom) {
  if (n > 1) {
    doublon = true;
    console.log(`  ⚠  "${nom}" apparaît ${n} fois`);
  }
}
if (!doublon) console.log('  (aucun)');

console.log('\nBOUTONS :');
for (const b of releve.boutons) console.log(`  y=${String(b.y).padStart(5)}  "${b.nom}"`);
const sauvegardes = releve.boutons.filter((b) =>
  /enregistrer|mettre à jour|sauvegarder/i.test(b.nom),
);
console.log(
  `\n→ ${sauvegardes.length} action(s) d enregistrement distinctes sur cette seule page.`,
);

await browser.close();
