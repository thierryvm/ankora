import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messagesFrBE from '../../../../messages/fr-BE.json';
import messagesEn from '../../../../messages/en.json';
import messagesDeDE from '../../../../messages/de-DE.json';
import messagesEsES from '../../../../messages/es-ES.json';
import messagesNlBE from '../../../../messages/nl-BE.json';

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

import ErrorBoundary from '../error';

const renderBoundary = (resetFn = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="fr-BE" messages={messagesFrBE}>
      <ErrorBoundary error={new Error('boom')} reset={resetFn} />
    </NextIntlClientProvider>,
  );

describe('<ErrorBoundary /> — error.tsx route-level', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('renders the FR-BE title, description, and 2 CTAs', () => {
    renderBoundary();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "Quelque chose s'est cassé",
    );
    expect(screen.getByText(/Tes données sont en sécurité/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/');
  });

  it('marks the main element as role="alert" for AT users', () => {
    renderBoundary();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls reset() when the retry button is clicked', () => {
    const reset = vi.fn();
    renderBoundary(reset);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs only the digest, never the raw error message (PII safety)', () => {
    const spy = vi.spyOn(console, 'error');
    const err = Object.assign(new Error('user@example.com leaked'), { digest: 'd-123' });
    render(
      <NextIntlClientProvider locale="fr-BE" messages={messagesFrBE}>
        <ErrorBoundary error={err} reset={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const calls = spy.mock.calls.flat();
    const haystack = JSON.stringify(calls);
    expect(haystack).toContain('d-123');
    expect(haystack).not.toContain('user@example.com leaked');
  });

  it('uses Fraunces for the title via font-display utility (no inline style — THI-249 CSP)', () => {
    // THI-249 (2026-05-20): migrated from `style={{ fontFamily: 'var(--font-display)' }}`
    // to the Tailwind 4 auto-generated `font-display` utility class so the
    // strict CSP `style-src 'self' 'nonce-XXX'` no longer flags this surface.
    // Element-level inline `style="..."` attributes are not covered by
    // nonces; only `<style>` tags are. The utility class resolves the same
    // `var(--font-display)` token statically through `globals.css @theme`.
    const { container } = renderBoundary();
    const heading = container.querySelector('h1');
    expect(heading?.className).toContain('font-display');
    expect(heading?.hasAttribute('style')).toBe(false);
  });
});

describe('errors.boundary — i18n parity (5 locales)', () => {
  it.each([
    ['fr-BE', messagesFrBE],
    ['en', messagesEn],
    ['de-DE', messagesDeDE],
    ['es-ES', messagesEsES],
    ['nl-BE', messagesNlBE],
  ] as const)('locale %s exposes title/description/ctaRetry/ctaHome', (_, m) => {
    const b = (m as { errors: { boundary: Record<string, string | undefined> } }).errors.boundary;
    expect(b.title).toBeTypeOf('string');
    expect((b.title ?? '').length).toBeGreaterThan(0);
    expect(b.description).toBeTypeOf('string');
    expect(b.ctaRetry).toBeTypeOf('string');
    expect(b.ctaHome).toBeTypeOf('string');
  });
});
