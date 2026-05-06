import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messagesFrBE from '../../../../messages/fr-BE.json';
import messagesEn from '../../../../messages/en.json';
import messagesDeDE from '../../../../messages/de-DE.json';
import messagesEsES from '../../../../messages/es-ES.json';
import messagesNlBE from '../../../../messages/nl-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const segments = namespace.split('.');
    return (key: string) => {
      let node: unknown = messagesFrBE;
      for (const seg of segments) {
        node =
          typeof node === 'object' && node !== null
            ? (node as Record<string, unknown>)[seg]
            : undefined;
      }
      const final =
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined;
      return typeof final === 'string' ? final : `${namespace}.${key}`;
    };
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('<NotFound /> — page 404 brandée', () => {
  it('renders the canonical FR-BE title', async () => {
    const NotFound = (await import('../not-found')).default;
    const tree = await NotFound();
    render(tree);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page introuvable');
  });

  it('exposes generateMetadata with title + noindex', async () => {
    const { generateMetadata } = await import('../not-found');
    const meta = await generateMetadata();
    expect(meta.title).toBe('Page introuvable');
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('shows the home + cockpit CTAs as links with proper hrefs', async () => {
    const NotFound = (await import('../not-found')).default;
    const tree = await NotFound();
    render(tree);
    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Aller à mon cockpit' })).toHaveAttribute(
      'href',
      '/app',
    );
  });

  it('displays a decorative 404 indicator in monospace + Fraunces title', async () => {
    const NotFound = (await import('../not-found')).default;
    const tree = await NotFound();
    const { container } = render(tree);
    expect(container.textContent).toContain('404');
    const heading = container.querySelector('h1');
    expect(heading?.getAttribute('style')).toContain('var(--font-display)');
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
