/**
 * dashboard.spec.ts — Sprint Mobile Recovery PR-QA-1b
 *
 * Audits the authenticated /app dashboard on iPhone Safari WebKit. Documents
 * the "cards Dashboard coupées à droite" bug observed on iPhone 14 by
 * @thierry on 2026-05-04. All tests need a real Supabase backend
 * (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) and skip otherwise.
 */

import { test, expect } from './fixtures/mobile-test';
import { seedUserWithCharges, deleteSeededUser } from './fixtures/mobile-test';
import { ouvrirRepli } from '../helpers/cockpit';

test.describe('Dashboard — iPhone Safari WebKit (PR-QA-1b)', () => {
  test('no horizontal overflow on /app', async ({ page, admin }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');

      const mesurer = () =>
        page.evaluate(() => ({
          bodyScrollWidth: document.body.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));

      const replie = await mesurer();
      expect(
        replie.bodyScrollWidth - replie.clientWidth,
        `body.scrollWidth=${replie.bodyScrollWidth} > clientWidth=${replie.clientWidth} — horizontal overflow on /app (this is the @thierry-2026-05-04 "cards coupées" bug)`,
      ).toBeLessThanOrEqual(1);

      // ATTENDU ÉLARGI par la refonte B : la page repliée ne mesure plus que
      // ce qui est visible. Un contenu qui déborde à l'intérieur d'un repli
      // fermé ne compte dans AUCUNE de ces deux largeurs — la mesure serait
      // verte sur une carte coupée. On rouvre donc, et on ne mesure qu'après
      // avoir constaté qu'une carte est bien visible.
      await ouvrirRepli(page, 'repli-comptes');
      await expect(page.locator('[data-account-type]').first()).toBeVisible();

      const ouvert = await mesurer();
      expect(
        ouvert.bodyScrollWidth - ouvert.clientWidth,
        `body.scrollWidth=${ouvert.bodyScrollWidth} > clientWidth=${ouvert.clientWidth} — horizontal overflow once the « Mes comptes » fold is open`,
      ).toBeLessThanOrEqual(1);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('typed account cards: each card fits within the viewport (no right-edge clipping)', async ({
    page,
    admin,
  }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
      {
        label: 'Assurance auto',
        amount: 600,
        frequency: 'annual',
        dueMonth: 6,
        paidFrom: 'epargne',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });
      await page.waitForLoadState('networkidle');

      // The dashboard exposes account cards via [data-account-type] (cf.
      // dashboard-account-rename.spec.ts). Since the refonte B they sit inside
      // the « Mes comptes » fold, closed on load: measuring them there would
      // read 0 × 0 boxes and report "no clipping" on genuinely clipped cards.
      await ouvrirRepli(page, 'repli-comptes');

      const cards = page.locator('[data-account-type]');
      const count = await cards.count();
      expect(count, 'Expected at least 1 typed account card').toBeGreaterThan(0);
      await expect(cards.first()).toBeVisible();

      // A card with a zero-sized box cannot overflow, so it would pass this
      // test for the wrong reason. Fail on it explicitly rather than let it
      // vanish from the measure.
      const invisibles = await cards.evaluateAll((els) =>
        els
          .map((el, i) => ({
            index: i,
            type: el.getAttribute('data-account-type'),
            rect: el.getBoundingClientRect(),
          }))
          .filter((c) => c.rect.width === 0 || c.rect.height === 0)
          .map((c) => ({ index: c.index, type: c.type })),
      );
      expect(
        invisibles,
        `Account cards with a zero-sized box — the overflow measure below would pass vacuously: ${JSON.stringify(invisibles)}`,
      ).toEqual([]);

      const overflowing = await cards.evaluateAll((els) => {
        const clientWidth = document.documentElement.clientWidth;
        return els
          .map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
              index: i,
              type: el.getAttribute('data-account-type'),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              clientWidth,
              overflows: rect.right > clientWidth + 1,
            };
          })
          .filter((c) => c.overflows);
      });

      expect(
        overflowing,
        `Account cards clipped on the right edge: ${JSON.stringify(overflowing)}`,
      ).toEqual([]);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('rename: pencil edit affordance is visible (opacity ≥ 0.3)', async ({ page, admin }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await ouvrirRepli(page, 'repli-comptes');

      // The pencil affordance is inside the "Renommer le compte" button
      // (cf. dashboard-account-rename.spec.ts pattern).
      const renameButton = page
        .locator('[data-account-type="income_bills"]')
        .getByRole('button', { name: /Renommer le compte/i });
      await expect(renameButton).toBeVisible();

      // The svg pencil inside has its own opacity. We check the icon (svg)
      // descendant of the button.
      const opacity = await renameButton.evaluate((btn) => {
        const svg = btn.querySelector('svg');
        if (!svg) return 1;
        return parseFloat(window.getComputedStyle(svg).opacity);
      });
      expect(
        opacity,
        `Pencil icon opacity is ${opacity} — must be ≥ 0.3 to be discoverable on mobile (no hover on touch)`,
      ).toBeGreaterThanOrEqual(0.3);
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });

  test('rename: tap title → input appears, type → Enter persists across reload', async ({
    page,
    admin,
  }) => {
    test.skip(!admin, 'Needs real Supabase.');
    if (!admin) return;

    const user = await seedUserWithCharges(admin, [
      {
        label: 'Loyer',
        amount: 800,
        frequency: 'monthly',
        dueMonth: 1,
        paidFrom: 'principal',
      },
    ]);

    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Mot de passe').fill(user.password);
      await page.getByRole('button', { name: /^se connecter$/i }).click();
      await page.waitForURL(/\/app\b/, { timeout: 15_000 });

      await ouvrirRepli(page, 'repli-comptes');

      const card = page.locator('[data-account-type="income_bills"]');
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: /Renommer le compte/i }).click();
      const input = card.getByRole('textbox');
      await expect(input).toBeFocused();
      await input.fill('iPhone test');
      // Attendre la réponse de la Server Action AVANT de recharger.
      //
      // Le titre bascule OPTIMISTEMENT, avant toute écriture : recharger dans la
      // foulée court après l'écriture, et le reload relit une base qui peut
      // encore porter l'ancien nom. C'est exactement ce qui s'est produit à la
      // première exécution de cette spec (24/08/2026) — échec sur l'assertion
      // POST-RELOAD, jamais sur l'optimiste, la signature même de cette course.
      //
      // Le remède n'est pas de mon invention : `e2e/dashboard-account-rename.spec.ts:48-70`
      // avait diagnostiqué et refermé le même piège en juillet. Le prédicat porte
      // sur l'en-tête `next-action`, que Next envoie sur les appels de Server
      // Action et sur rien d'autre — un POST sans rapport ne peut donc pas
      // satisfaire l'attente et laisser passer le reload trop tôt.
      await Promise.all([
        page.waitForResponse((r) => 'next-action' in r.request().headers(), { timeout: 15_000 }),
        input.press('Enter'),
      ]);

      await expect(
        card.getByRole('button', { name: /Renommer le compte « iPhone test »/i }),
      ).toBeVisible();

      await page.reload();
      await ouvrirRepli(page, 'repli-comptes');
      await expect(
        page.locator('[data-account-type="income_bills"]').getByRole('button', {
          name: /Renommer le compte « iPhone test »/i,
        }),
      ).toBeVisible();
    } finally {
      await deleteSeededUser(admin, user.userId);
    }
  });
});
