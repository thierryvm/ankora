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

import { AUTH_BACKEND_UNAVAILABLE_DIGEST } from '@/lib/auth/auth-error';

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

/**
 * A brief Supabase outage is not a crash, and must not be dressed up as one.
 *
 * Context, because the wording here is load-bearing. Before 2026-07-30 an
 * unreachable auth backend redirected every signed-in visitor to `/login` — an
 * outage laundered into a mass logout, invisible in the logs as anything but
 * ordinary session churn. Surfacing it was the fix; surfacing it as "Quelque
 * chose s'est cassé" would have been the next mistake, telling users their app
 * broke and implying their data might be gone. Neither. This screen says what is
 * actually true: a dependency is unreachable, the session stands, retry.
 */
describe('<ErrorBoundary /> — a backend outage gets its own honest screen', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  const renderUnavailable = (
    messages: typeof messagesFrBE = messagesFrBE,
    locale: 'fr-BE' | 'en' | 'de-DE' | 'es-ES' | 'nl-BE' = 'fr-BE',
    reset = vi.fn(),
  ) => {
    const error = Object.assign(new Error('Supabase auth backend unavailable'), {
      digest: AUTH_BACKEND_UNAVAILABLE_DIGEST,
    });
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ErrorBoundary error={error} reset={reset} />
      </NextIntlClientProvider>,
    );
  };

  it('says the service is unavailable, not that something broke', () => {
    renderUnavailable();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Service temporairement indisponible',
    );
    expect(screen.queryByText(/Quelque chose s'est cassé/)).not.toBeInTheDocument();
  });

  it('tells the visitor their data and their session are intact', () => {
    renderUnavailable();
    // The two reassurances that distinguish an outage from a crash. A visitor
    // who is told "something broke" has no way to know either of these.
    expect(screen.getByText(/données sont intactes/)).toBeInTheDocument();
    expect(screen.getByText(/session n'a pas été fermée/)).toBeInTheDocument();
  });

  it('still offers a retry that calls reset()', () => {
    const reset = vi.fn();
    renderUnavailable(messagesFrBE, 'fr-BE', reset);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('keeps role="alert" so assistive tech announces it', () => {
    renderUnavailable();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the outage screen in English too', () => {
    renderUnavailable(messagesEn as typeof messagesFrBE, 'en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Service temporarily unavailable',
    );
  });

  // The generic screen must remain the default: an unknown digest is a real bug,
  // and calling a bug "temporarily unavailable" hides it.
  it.each([undefined, 'some-other-digest', 'ANKORA_SOMETHING_ELSE'])(
    'falls back to the generic screen for digest %s',
    (digest) => {
      const error = Object.assign(new Error('boom'), digest ? { digest } : {});
      render(
        <NextIntlClientProvider locale="fr-BE" messages={messagesFrBE}>
          <ErrorBoundary error={error} reset={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        "Quelque chose s'est cassé",
      );
    },
  );

  it('logs only the digest on the outage path too (PII safety)', () => {
    const spy = vi.spyOn(console, 'error');
    renderUnavailable();
    const haystack = JSON.stringify(spy.mock.calls.flat());
    expect(haystack).toContain(AUTH_BACKEND_UNAVAILABLE_DIGEST);
  });
});

describe('errors.unavailable — i18n parity (5 locales)', () => {
  it.each([
    ['fr-BE', messagesFrBE],
    ['en', messagesEn],
    ['de-DE', messagesDeDE],
    ['es-ES', messagesEsES],
    ['nl-BE', messagesNlBE],
  ] as const)('locale %s exposes title/description/ctaRetry/ctaHome', (_, m) => {
    const u = (m as { errors: { unavailable: Record<string, string | undefined> } }).errors
      .unavailable;
    expect(u.title).toBeTypeOf('string');
    expect((u.title ?? '').length).toBeGreaterThan(0);
    expect(u.description).toBeTypeOf('string');
    expect(u.ctaRetry).toBeTypeOf('string');
    expect(u.ctaHome).toBeTypeOf('string');
  });

  // The wording must not drift back into crash language. `errors.boundary` owns
  // "broken"; `errors.unavailable` owns "unavailable". Swapping them silently is
  // the regression this asserts against.
  it.each([
    ['fr-BE', messagesFrBE],
    ['en', messagesEn],
    ['de-DE', messagesDeDE],
    ['es-ES', messagesEsES],
    ['nl-BE', messagesNlBE],
  ] as const)('locale %s keeps the two screens worded differently', (_, m) => {
    const e = (m as { errors: { boundary: { title: string }; unavailable: { title: string } } })
      .errors;
    expect(e.unavailable.title).not.toBe(e.boundary.title);
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
