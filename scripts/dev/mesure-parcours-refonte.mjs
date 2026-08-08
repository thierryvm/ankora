// Mesure des parcours réels — refonte 2026. Stack LOCALE uniquement.
//
// Ce que cette sonde établit, et qu'aucune lecture de code ne peut établir :
//   A. où atterrit un utilisateur CONNECTÉ qui ouvre la PWA (start_url = '/')
//   B. ce qui tient au-dessus de la ligne de flottaison du cockpit
//
// Sur la hauteur : un iPhone 14 fait 844 px d'écran PHYSIQUE, mais il n'en
// reste que ~664 au document une fois la barre de Safari posée. La sonde ne
// suppose donc aucune hauteur — elle relève `window.innerHeight` et rapporte
// tout contre lui. Écrire « 390 × 844 » dans un audit, c'est se donner 27 %
// de hauteur qu'aucun utilisateur n'a jamais eue.
//   C. le nombre de gestes réels pour les trois intentions décrites par @thierry
//
// Rien n'est déduit : chaque chiffre vient de getBoundingClientRect() ou d'un
// compteur de clics effectivement exécutés.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3150';
const EMAIL = 'ankora-test-profil@ankora.test';
const PASSWORD = 'TestProfil!2026';
const OUT = process.env.MESURE_OUT ?? 'mesures-refonte';
mkdirSync(OUT, { recursive: true });

// `viewport` reste nul jusqu'à ce qu'il soit MESURÉ — cf. l'en-tête.
const releve = { base: BASE, viewport: null, sections: [], gestes: [], notes: [] };

/**
 * Une adresse distincte par exécution.
 *
 * `rateLimit('auth', …)` autorise 5 tentatives par 15 min et PAR IP. Une sonde
 * qu'on relance pour vérifier sa stabilité épuise ce quota en trois passages,
 * et l'échec se lit « la connexion est cassée » alors qu'il dit « tu as trop
 * essayé ». `e2e/helpers/test.ts` règle le problème de la même façon : c'est
 * l'en-tête dont l'application dérive déjà l'adresse de l'appelant, et Vercel
 * le réécrit en amont — aucun risque ajouté en production.
 */
const adresseSonde = `203.0.113.${(process.pid % 254) + 1}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 14'],
  locale: 'fr-BE',
  extraHTTPHeaders: { 'x-forwarded-for': adresseSonde },
});
const page = await ctx.newPage();

/** Compte les clics réellement exécutés pour une intention donnée. */
function compteur(nom) {
  const etapes = [];
  return {
    async tap(libelle, locator) {
      await locator.click();
      etapes.push(libelle);
    },
    fin(atteint) {
      releve.gestes.push({ nom, taps: etapes.length, etapes, atteint });
      console.log(`\n[GESTE] ${nom} → ${etapes.length} tap(s) : ${etapes.join(' → ')}`);
    },
  };
}

// ---------------------------------------------------------------- connexion
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

// La bannière de consentement intercepte les clics tant qu'elle est ouverte.
// On l'accepte comme le ferait un vrai utilisateur, UNE fois, et on le note :
// la mesure qui suit est donc celle d'un utilisateur qui revient, pas d'un
// premier contact.
const banniere = page.locator('[role="dialog"][aria-labelledby="consent-title"]');
if (await banniere.isVisible().catch(() => false)) {
  const accepter = banniere.getByRole('button').first();
  await accepter.click();
  releve.notes.push(
    'Bannière de consentement acceptée avant mesure — les chiffres décrivent un utilisateur qui REVIENT.',
  );
  await banniere.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

await page.getByLabel(/e-?mail/i).fill(EMAIL);
await page.getByLabel(/mot de passe/i).fill(PASSWORD);
await page.getByRole('button', { name: /connexion|se connecter/i }).click();
await page.waitForURL(/\/app/, { timeout: 20_000 });
console.log('connecté →', page.url());

// -------------------------------------------- A. point d'entrée de la PWA
// start_url du manifeste = '/'. Que voit un CONNECTÉ qui ouvre son icône ?
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
releve.pwaEntree = {
  urlDemandee: `${BASE}/`,
  urlFinale: page.url(),
  redirigeVersCockpit: /\/app(\/|$)/.test(page.url()),
  titreH1: await page
    .locator('h1')
    .first()
    .innerText()
    .catch(() => '(aucun h1)'),
};
console.log('\n[A] PWA start_url  →', JSON.stringify(releve.pwaEntree, null, 2));

/**
 * Attend que la hauteur du document CESSE de bouger.
 *
 * `networkidle` + un délai fixe ne suffisent pas : deux exécutions identiques
 * ont rendu 3 792 px puis 4 150 px, 9 % d'écart, parce que des composants
 * client s'hydratent et redimensionnent après. Un chiffre pris avant
 * stabilisation n'est pas reproductible — et le fait que la page grandisse
 * encore est en soi un défaut visible par l'utilisateur.
 */
async function hauteurStabilisee(page, { pas = 250, stables = 4, max = 40 } = {}) {
  let precedente = -1;
  let compteur = 0;
  for (let i = 0; i < max; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    compteur = h === precedente ? compteur + 1 : 0;
    precedente = h;
    if (compteur >= stables) return { hauteur: h, msAttendus: i * pas };
    await page.waitForTimeout(pas);
  }
  return { hauteur: precedente, msAttendus: max * pas, jamaisStabilisee: true };
}

// ------------------------------- B. ligne de flottaison du cockpit
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
const stabilite = await hauteurStabilisee(page);
releve.stabilite = stabilite;
console.log(
  `\n[B0] hauteur stabilisée à ${stabilite.hauteur}px après ${stabilite.msAttendus}ms` +
    (stabilite.jamaisStabilisee ? '  ⚠ JAMAIS STABILISÉE' : ''),
);

releve.sections = await page.evaluate(() => {
  const H = window.innerHeight;
  const blocs = [...document.querySelectorAll('main section, main > div > section, main article')];
  return blocs.map((el) => {
    const r = el.getBoundingClientRect();
    const titre =
      el.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 60) ??
      el.getAttribute('aria-labelledby') ??
      '(sans titre)';
    return {
      titre,
      haut: Math.round(r.top),
      bas: Math.round(r.bottom),
      entierementVisible: r.top >= 0 && r.bottom <= H,
      commenceSousLaLigne: r.top >= H,
    };
  });
});

// Pourquoi deux exécutions identiques rendent 3 792 px puis 4 150 px : on relève
// ce qui pourrait ajouter une hauteur fantôme en fin de page — la réserve du
// consentement, les remplissages de bas, et l'espace vide après le dernier
// contenu réel.
releve.queue = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const dernier = [...document.querySelectorAll('main *')]
    .map((el) => el.getBoundingClientRect().bottom + window.scrollY)
    .reduce((a, b) => Math.max(a, b), 0);
  const dialogueConsentement = document.querySelector(
    '[role="dialog"][aria-labelledby="consent-title"]',
  );
  return {
    // Décisif : une réserve non nulle est CORRECTE si la bannière est encore
    // à l'écran, et fautive seulement si elle a disparu. Sans ce booléen on
    // conclut à un défaut là où il n'y en a pas.
    banniereEncoreAffichee: Boolean(dialogueConsentement),
    consentHeight: cs.getPropertyValue('--consent-height').trim() || '(non définie)',
    bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
    mainPaddingBottom: getComputedStyle(document.querySelector('main') ?? document.body)
      .paddingBottom,
    basDuDernierContenu: Math.round(dernier),
    hauteurDocument: document.documentElement.scrollHeight,
    videEnFinDePage: Math.round(document.documentElement.scrollHeight - dernier),
  };
});
console.log('\n[B1] queue de page :', JSON.stringify(releve.queue));

releve.page = await page.evaluate(() => ({
  hauteurEcran: window.innerHeight,
  hauteurDocument: document.documentElement.scrollHeight,
  ecransDeDefilement: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(2),
  debordementHorizontal: document.documentElement.scrollWidth > window.innerWidth,
}));

releve.viewport = `390 × ${releve.page.hauteurEcran} utiles`;
console.log(`\n[B] Cockpit à ${releve.viewport}`);
console.log('    hauteur document :', releve.page.hauteurDocument, 'px');
console.log('    écrans à faire défiler :', releve.page.ecransDeDefilement);
console.log('    débordement horizontal :', releve.page.debordementHorizontal);
for (const s of releve.sections) {
  const etat = s.entierementVisible ? 'VISIBLE ' : s.commenceSousLaLigne ? 'SOUS    ' : 'COUPÉE  ';
  console.log(`    ${etat} ${String(s.haut).padStart(5)}→${String(s.bas).padStart(5)}  ${s.titre}`);
}
await page.screenshot({ path: `${OUT}/cockpit-pli.png` });
await page.screenshot({ path: `${OUT}/cockpit-entier.png`, fullPage: true });

// Noms accessibles RELEVÉS au DOM par scripts/dev/inspect-nav.mjs — jamais devinés.
const TAP_AJOUT = () => page.getByRole('button', { name: 'Ajouter une dépense' }).first();
const TAP_PLUS = () => page.getByRole('button', { name: 'Plus' }).first();

try {
  // ------------------------------------------------- C. geste « capturer »
  {
    const g = compteur('Capturer une dépense, depuis l ouverture de l app');
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
    await g.tap('⊕ « Ajouter une dépense »', TAP_AJOUT());
    await page.waitForTimeout(800);
    const feuille = page.getByRole('dialog');
    const champMontant = feuille.getByLabel(/montant/i).first();
    g.fin(
      (await champMontant.isVisible().catch(() => false))
        ? 'champ Montant prêt à la saisie'
        : 'feuille ouverte mais champ Montant introuvable',
    );
    await page.keyboard.press('Escape').catch(() => {});
  }

  // ----------------------------------- C. geste « modifier mes rentrées »
  {
    const g = compteur('Modifier les rentrées du mois');
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
    await g.tap('« Plus » — ouvrir le tiroir', TAP_PLUS());
    await page.waitForTimeout(700);
    const tiroir = page.getByRole('dialog');
    await g.tap(
      '« Comptes » dans le tiroir',
      tiroir.getByRole('link', { name: /comptes/i }).first(),
    );
    await page.waitForURL(/\/accounts/, { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(900);

    const champ = page.getByLabel(/revenu|rentrée|salaire|mensuel/i).first();
    if (await champ.isVisible().catch(() => false)) {
      const pos = await champ.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), ecran: window.innerHeight };
      });
      releve.champRevenus = pos;
      if (pos.top >= pos.ecran) {
        await champ.scrollIntoViewIfNeeded();
        g.fin(`champ revenus à ${pos.top}px — SOUS la ligne (${pos.ecran}px), défilement requis`);
      } else {
        g.fin(`champ revenus visible à ${pos.top}px`);
      }
    } else {
      g.fin('champ revenus INTROUVABLE sur /app/accounts');
    }
    await page.screenshot({ path: `${OUT}/comptes-390-revenus.png`, fullPage: true });
  }
} catch (err) {
  releve.erreur = String(err?.message ?? err).slice(0, 400);
  console.error('\n[!] sonde interrompue :', releve.erreur);
} finally {
  writeFileSync(`${OUT}/releve.json`, JSON.stringify(releve, null, 2), 'utf8');
  console.log(`\n→ relevé écrit dans ${OUT}/releve.json`);
  await browser.close();
}
