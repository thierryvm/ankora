import type { Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

export type TestUser = {
  email: string;
  password: string;
};

/**
 * Generates a disposable test user. Email uses the `+e2e` subaddress on a
 * domain we control so Supabase Auth accepts it. Password meets the project
 * policy (12+ chars, mixed case, number).
 */
export function makeTestUser(): TestUser {
  const id = randomBytes(6).toString('hex');
  return {
    email: `ankora-e2e+${id}@ankora.test`,
    password: `Tests${id.toUpperCase()}!9`,
  };
}

export async function fillSignup(page: Page, user: TestUser): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByLabel('Confirmer le mot de passe').fill(user.password);
  await page.getByLabel(/CGU/i).check();
  await page.getByLabel(/confidentialité/i).check();
}

export async function fillLogin(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
}
