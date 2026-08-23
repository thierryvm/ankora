import type { Page } from '@playwright/test';

// La fixture partagée pré-pose la décision de consentement. C'est délibéré ICI
// : la bannière est `fixed` et recouvre le pied de page, donc sans elle la
// mesure porterait sur une cible masquée. Le test qui exige l'ABSENCE de ce
// pré-remplissage existe et importe le `test` de base — `consent-first-visit`.
import { test, expect } from '../helpers/test';

/**
 * WCAG 2.2 AA · 2.5.8 — Target Size (Minimum), 24 × 24 px.
 *
 * Scope of this file: the STANDALONE controls, i.e. those the criterion gives
 * no exception to. Inline links inside a sentence ("Pas encore de compte ?
 * *Créer un compte*", the CGU link inside its paragraph) are explicitly exempt
 * — their height is constrained by the line-height of the text carrying them —
 * and asserting on them would fail a compliant page.
 *
 * Why these three in particular, out of the 49 sub-24px targets swept on
 * 2026-08-10: they are the RECOVERY paths. Forgotten password, going back to
 * the login screen, withdrawing consent. Gestures made once, under pressure,
 * often one-handed. The rest of the app is careful — 76 buttons at 44 × 44 in
 * the bill list — because that is where the volume is. These are where the
 * volume is not.
 *
 * The measurement is deliberately RAW: `getBoundingClientRect` returns
 * fractional CSS pixels, and rounding before comparing promotes 23.6 px to 24 —
 * the guard would then wave through exactly what it exists to stop.
 */

/**
 * The role matters as much as the name. « Modifier mes préférences cookies » is
 * a `<button>`, not a link — it mutates client state instead of navigating —
 * and `getByRole('link', …)` would never find it, timing out with a message
 * that reads "the control is broken" while meaning "my probe looked elsewhere".
 */
async function targetSize(page: Page, role: 'link' | 'button', name: RegExp) {
  const control = page.getByRole(role, { name }).first();
  await control.scrollIntoViewIfNeeded();
  const rect = await control.boundingBox();
  expect(rect, `cible introuvable pour ${name}`).not.toBeNull();
  return rect!;
}

function assertFloor(rect: { width: number; height: number }, label: string) {
  expect(
    rect.height,
    `${label} — hauteur de cible (mesurée ${rect.height.toFixed(2)} px, plancher 24)`,
  ).toBeGreaterThanOrEqual(24);
  expect(
    rect.width,
    `${label} — largeur de cible (mesurée ${rect.width.toFixed(2)} px, plancher 24)`,
  ).toBeGreaterThanOrEqual(24);
}

const COOKIES = /Modifier mes préférences cookies/i;

test.describe('WCAG 2.5.8 — contrôles autonomes', () => {
  test('les chemins de récupération du tunnel d’auth atteignent 24 px', async ({ page }) => {
    await page.goto('/login');
    assertFloor(
      await targetSize(page, 'link', /Mot de passe oublié/i),
      '/login « Mot de passe oublié ? »',
    );

    await page.goto('/forgot-password');
    assertFloor(
      await targetSize(page, 'link', /Retour à la connexion/i),
      '/forgot-password « Retour à la connexion »',
    );
  });

  /**
   * Two footers render this control, and only one of them had been fixed.
   * `MktFooter` (landing) passes its own class and measured 194 × 44 on
   * 2026-08-22; `Footer` (/faq, /legal/*) relies on the component's default
   * class and measured 226 × 20 — because raising the four sibling links to
   * `min-h-11` was done at the call site, where this one has no class to raise.
   * Both are asserted so the next fix cannot land on one footer only.
   *
   * Regulatory weight: withdrawing consent must be as easy as giving it
   * (RGPD art. 7(3)). A target a finger misses is not as easy.
   */
  test('le retrait du consentement atteint 24 px sur les deux pieds de page', async ({ page }) => {
    for (const route of ['/', '/faq']) {
      await page.goto(route);
      assertFloor(await targetSize(page, 'button', COOKIES), `${route} « préférences cookies »`);
    }
  });
});
