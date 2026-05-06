import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const recordCookieConsentMock = vi.fn().mockResolvedValue({ ok: true, data: { persisted: true } });
const reopenMock = vi.fn();

vi.mock('@/lib/actions/consent', () => ({
  recordCookieConsentAction: (...args: unknown[]) => recordCookieConsentMock(...args),
}));

vi.mock('@/components/gdpr/ConsentBanner', () => ({
  reopenConsentBanner: () => reopenMock(),
  CONSENT_VERSION: '1.0.0',
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { CookiesPreferencesSection } from '../CookiesPreferencesSection';

const STORAGE_KEY = 'ankora.consent.v1';

const wrapped = (
  initial: React.ComponentProps<typeof CookiesPreferencesSection>['initialServerSnapshot'],
) => (
  <NextIntlClientProvider locale="fr-BE" messages={messages}>
    <CookiesPreferencesSection initialServerSnapshot={initial} />
  </NextIntlClientProvider>
);

describe('<CookiesPreferencesSection />', () => {
  beforeEach(() => {
    window.localStorage.clear();
    recordCookieConsentMock.mockClear();
    reopenMock.mockClear();
  });

  it('renders the title, description and the three categories', () => {
    render(wrapped(null));
    // CardTitle renders as a <div>, not a heading — assert by visible text.
    expect(screen.getByText(messages.app.settings.cookies.title)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByLabelText(messages.app.settings.cookies.essentialLabel)).toBeDisabled();
  });

  it('reflects the server-fetched snapshot when one is provided', () => {
    render(
      wrapped({
        analytics: true,
        marketing: false,
        version: '1.0.0',
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const analyticsCheckbox = screen.getByLabelText(
      messages.app.settings.cookies.analyticsLabel,
    ) as HTMLInputElement;
    const marketingCheckbox = screen.getByLabelText(
      messages.app.settings.cookies.marketingLabel,
    ) as HTMLInputElement;
    expect(analyticsCheckbox.checked).toBe(true);
    expect(marketingCheckbox.checked).toBe(false);
  });

  it('toggling analytics persists localStorage and calls the server action', async () => {
    render(wrapped(null));
    const checkbox = screen.getByLabelText(
      messages.app.settings.cookies.analyticsLabel,
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(recordCookieConsentMock).toHaveBeenCalledWith({ analytics: true, marketing: false });
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
      expect(stored).toMatchObject({ analytics: true, marketing: false });
    });
  });

  it('reset button clears localStorage, calls reopenConsentBanner, and persists revocation server-side', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '1.0.0',
        analytics: true,
        marketing: true,
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    render(
      wrapped({
        analytics: true,
        marketing: true,
        version: '1.0.0',
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: messages.app.settings.cookies.resetButton }),
    );
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(reopenMock).toHaveBeenCalledTimes(1);
      expect(recordCookieConsentMock).toHaveBeenCalledWith({ analytics: false, marketing: false });
    });
  });

  it('hydrates from a fresher localStorage decision over a stale server snapshot', () => {
    const fresh = '2026-12-31T23:59:59.000Z';
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '1.0.0',
        analytics: false,
        marketing: true,
        decidedAt: fresh,
      }),
    );
    render(
      wrapped({
        analytics: true,
        marketing: false,
        version: '1.0.0',
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const analytics = screen.getByLabelText(
      messages.app.settings.cookies.analyticsLabel,
    ) as HTMLInputElement;
    const marketing = screen.getByLabelText(
      messages.app.settings.cookies.marketingLabel,
    ) as HTMLInputElement;
    expect(analytics.checked).toBe(false);
    expect(marketing.checked).toBe(true);
  });
});
