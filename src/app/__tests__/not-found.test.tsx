import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import messagesFrBE from '../../../messages/fr-BE.json';
import messagesEn from '../../../messages/en.json';
import messagesDeDE from '../../../messages/de-DE.json';
import messagesEsES from '../../../messages/es-ES.json';
import messagesNlBE from '../../../messages/nl-BE.json';

vi.mock('../globals.css', () => ({}));

const cookieStore = {
  value: undefined as string | undefined,
};
const headerStore = {
  acceptLanguage: '' as string,
};

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'NEXT_LOCALE' && cookieStore.value !== undefined
        ? { value: cookieStore.value }
        : undefined,
  }),
  headers: async () => ({
    get: (name: string) => (name === 'accept-language' ? headerStore.acceptLanguage : null),
  }),
}));

const renderTree = async () => {
  const NotFound = (await import('../not-found')).default;
  const tree = await NotFound();
  return render(tree, { container: document.body.appendChild(document.createElement('div')) });
};

describe('<NotFound /> — root-level branded 404', () => {
  beforeEach(() => {
    cookieStore.value = undefined;
    headerStore.acceptLanguage = '';
  });

  it('renders the FR copy when no locale cookie is set and Accept-Language is FR', async () => {
    headerStore.acceptLanguage = 'fr-BE,fr;q=0.9';
    const { container } = await renderTree();
    expect(container.textContent).toContain('Page introuvable');
    expect(container.textContent).toContain("Retour à l'accueil");
    expect(container.textContent).toContain('Aller à mon cockpit');
  });

  it('renders the EN copy when the NEXT_LOCALE cookie is "en"', async () => {
    cookieStore.value = 'en';
    const { container } = await renderTree();
    expect(container.textContent).toContain('Page not found');
    expect(container.textContent).toContain('Back to home');
    expect(container.textContent).toContain('Go to my cockpit');
  });

  it('renders the EN copy when Accept-Language starts with en (no cookie)', async () => {
    headerStore.acceptLanguage = 'en-US,en;q=0.9';
    const { container } = await renderTree();
    expect(container.textContent).toContain('Page not found');
  });

  it('falls back to FR when locale cookie is set to a non-EN value', async () => {
    cookieStore.value = 'nl-BE';
    const { container } = await renderTree();
    expect(container.textContent).toContain('Page introuvable');
  });

  it('uses Fraunces (var(--font-display)) for the H1', async () => {
    const { container } = await renderTree();
    const heading = container.querySelector('h1');
    expect(heading?.getAttribute('style')).toContain('var(--font-display)');
  });

  it('exposes a noindex meta via generateMetadata', async () => {
    const { generateMetadata } = await import('../not-found');
    const meta = await generateMetadata();
    expect(meta.robots).toMatchObject({ index: false, follow: false });
    expect(typeof meta.title).toBe('string');
  });

  it('honours the cookie over Accept-Language when both disagree (Sourcery #2)', async () => {
    cookieStore.value = 'fr-BE';
    headerStore.acceptLanguage = 'en-US,en;q=0.9';
    const { container } = await renderTree();
    expect(container.textContent).toContain('Page introuvable');
    expect(container.textContent).not.toContain('Page not found');
  });

  it('treats regional EN cookie variants like en-GB as English (Sourcery #3)', async () => {
    cookieStore.value = 'en-GB';
    const { container } = await renderTree();
    expect(container.textContent).toContain('Page not found');
    expect(container.textContent).not.toContain('Page introuvable');
  });

  it('points the cockpit CTA to /en/app in EN, /app in FR', async () => {
    cookieStore.value = 'en';
    let { container } = await renderTree();
    let cockpitLink = Array.from(container.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Go to my cockpit'),
    );
    expect(cockpitLink?.getAttribute('href')).toBe('/en/app');

    cookieStore.value = 'fr-BE';
    ({ container } = await renderTree());
    cockpitLink = Array.from(container.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Aller à mon cockpit'),
    );
    expect(cockpitLink?.getAttribute('href')).toBe('/app');
  });
});

describe('errors.notFound — i18n parity (5 locales)', () => {
  it.each([
    ['fr-BE', messagesFrBE],
    ['en', messagesEn],
    ['de-DE', messagesDeDE],
    ['es-ES', messagesEsES],
    ['nl-BE', messagesNlBE],
  ] as const)('locale %s exposes title/description/ctaHome/ctaCockpit', (_, m) => {
    const nf = (m as { errors: { notFound: Record<string, string | undefined> } }).errors.notFound;
    expect(nf.title).toBeTypeOf('string');
    expect((nf.title ?? '').length).toBeGreaterThan(0);
    expect(nf.description).toBeTypeOf('string');
    expect((nf.description ?? '').length).toBeGreaterThan(0);
    expect(nf.ctaHome).toBeTypeOf('string');
    expect(nf.ctaCockpit).toBeTypeOf('string');
  });
});
