import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

const recordCookieConsentMock = vi.fn().mockResolvedValue({ ok: true, data: { persisted: false } });

vi.mock('@/lib/actions/consent', () => ({
  recordCookieConsentAction: (...args: unknown[]) => recordCookieConsentMock(...args),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  ConsentBanner,
  reopenConsentBanner,
  CONSENT_VERSION,
  __resetConsentCacheForTests,
  __getServerSnapshotForTests,
} from '../ConsentBanner';

const STORAGE_KEY = 'ankora.consent.v1';
const REOPEN_KEY = 'ankora.consent.reopen';

const wrapped = () => (
  <NextIntlClientProvider locale="fr-BE" messages={messages}>
    <ConsentBanner />
  </NextIntlClientProvider>
);

const readStored = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};

describe('<ConsentBanner /> — extended (PR-LEGAL-1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    recordCookieConsentMock.mockClear();
    __resetConsentCacheForTests();
  });

  it('renders the three primary actions on first visit', () => {
    render(wrapped());
    expect(
      screen.getByRole('button', { name: messages.consent.essentialOnly }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: messages.consent.customize.button }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.consent.acceptAll })).toBeInTheDocument();
  });

  it('Accept all → analytics + marketing both true and banner dismissed', async () => {
    render(wrapped());
    fireEvent.click(screen.getByRole('button', { name: messages.consent.acceptAll }));
    await waitFor(() => {
      const stored = readStored();
      expect(stored).toMatchObject({
        version: CONSENT_VERSION,
        analytics: true,
        marketing: true,
      });
    });
    expect(recordCookieConsentMock).toHaveBeenCalledWith({ analytics: true, marketing: true });
    expect(
      screen.queryByRole('button', { name: messages.consent.essentialOnly }),
    ).not.toBeInTheDocument();
  });

  it('Essential only → both analytics and marketing false', async () => {
    render(wrapped());
    fireEvent.click(screen.getByRole('button', { name: messages.consent.essentialOnly }));
    await waitFor(() => {
      expect(readStored()).toMatchObject({ analytics: false, marketing: false });
    });
    expect(recordCookieConsentMock).toHaveBeenCalledWith({ analytics: false, marketing: false });
  });

  it('Customize opens an inline panel with the three category toggles', () => {
    render(wrapped());
    fireEvent.click(screen.getByRole('button', { name: messages.consent.customize.button }));
    expect(
      screen.getByRole('checkbox', { name: messages.consent.customize.essentialLabel }),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: messages.consent.customize.analyticsLabel }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: messages.consent.customize.marketingLabel }),
    ).toBeEnabled();
  });

  it('Customize → toggle analytics only → save persists analytics=true marketing=false', async () => {
    render(wrapped());
    fireEvent.click(screen.getByRole('button', { name: messages.consent.customize.button }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: messages.consent.customize.analyticsLabel }),
    );
    fireEvent.click(screen.getByRole('button', { name: messages.consent.customize.save }));
    await waitFor(() => {
      expect(readStored()).toMatchObject({ analytics: true, marketing: false });
    });
    expect(recordCookieConsentMock).toHaveBeenCalledWith({ analytics: true, marketing: false });
  });

  it('does not render once a fresh decision is already in localStorage', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION,
        analytics: true,
        marketing: false,
        decidedAt: new Date().toISOString(),
      }),
    );
    render(wrapped());
    expect(
      screen.queryByRole('button', { name: messages.consent.acceptAll }),
    ).not.toBeInTheDocument();
  });

  it('reopens when the reopen flag is set even if a decision exists', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION,
        analytics: true,
        marketing: false,
        decidedAt: new Date().toISOString(),
      }),
    );
    window.localStorage.setItem(REOPEN_KEY, '1');
    render(wrapped());
    expect(screen.getByRole('button', { name: messages.consent.acceptAll })).toBeInTheDocument();
  });

  it('reopenConsentBanner() clears the decision and sets the reopen flag', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION,
        analytics: true,
        marketing: false,
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    reopenConsentBanner();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REOPEN_KEY)).toBe('1');
  });

  it('getServerSnapshot returns a referentially stable value across calls (no React loop)', () => {
    const first = __getServerSnapshotForTests();
    const second = __getServerSnapshotForTests();
    const third = __getServerSnapshotForTests();
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first.stored).toBeNull();
    expect(first.reopen).toBe(false);
  });

  it('post-mount refresh picks up a decision written between renders (stale cache repro)', async () => {
    // First render: no decision in localStorage → banner visible. This
    // call also primes the module-level snapshot cache with
    // {stored: null, reopen: false} (the bug scenario from issue #126).
    const first = render(wrapped());
    expect(screen.getByRole('button', { name: messages.consent.acceptAll })).toBeInTheDocument();
    first.unmount();

    // Simulate a multi-tab race: another tab persists a decision while
    // this tab still has the stale module cache. We intentionally do
    // NOT call __resetConsentCacheForTests() — the cache stays stale.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION,
        analytics: true,
        marketing: true,
        decidedAt: new Date().toISOString(),
      }),
    );

    // Remount: the post-hydration useEffect must force a notify() that
    // re-reads localStorage, so the banner should NOT render anymore.
    render(wrapped());
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: messages.consent.acceptAll }),
      ).not.toBeInTheDocument();
    });
  });
});
