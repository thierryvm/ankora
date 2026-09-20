import { expect, type Page } from '@playwright/test';

/**
 * Ouvrir un repli du cockpit v3, et s'assurer qu'il est RÉELLEMENT ouvert.
 *
 * ## Pourquoi ce helper existe
 *
 * Depuis la refonte B, les cartes de comptes, les dépenses, le rythme et les
 * engagements vivent dans des replis FERMÉS au chargement (`Repli.tsx`). Leur
 * corps n'est pas démonté — il porte `hidden` — donc tout ce qui vit dedans
 * existe dans le DOM avec une boîte de 0 × 0.
 *
 * C'est le piège que ce helper referme : une mesure de débordement sur un
 * élément masqué rend `rect.right = 0`, c'est-à-dire « aucun débordement », et
 * la spec passe AU VERT sur une carte réellement coupée. Un instrument qui
 * regarde un élément à zéro ne rend pas un résultat vide, il rend une fausse
 * certitude.
 *
 * Le clic est conditionnel (`aria-expanded`) pour rester idempotent : une spec
 * qui recharge la page rouvre sans risquer de refermer.
 */
export async function ouvrirRepli(page: Page, testId: string): Promise<void> {
  const repli = page.getByTestId(testId);
  await expect(repli).toBeVisible();

  const tete = repli.locator('[data-repli-tete]');
  if ((await tete.getAttribute('aria-expanded')) !== 'true') {
    await tete.click();
  }
  await expect(tete).toHaveAttribute('aria-expanded', 'true');
}
