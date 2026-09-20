import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../../../messages/fr-BE.json';

const recordCookieConsentMock = vi.fn().mockResolvedValue({ ok: true, data: { persisted: true } });
const reopenMock = vi.fn();

vi.mock('@/lib/actions/consent', () => ({
  recordCookieConsentAction: (...args: unknown[]) => recordCookieConsentMock(...args),
}));

const notifyMock = vi.hoisted(() => vi.fn());
const reloadMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/gdpr/ConsentBanner', () => ({
  reopenConsentBanner: () => reopenMock(),
  notifyConsentChanged: () => notifyMock(),
}));

vi.mock('@/lib/browser/reload', () => ({ reloadPage: () => reloadMock() }));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { CookiesPreferencesSection } from '../CookiesPreferencesSection';
// Importee, jamais recopiee : ce fichier figeait le litteral '1.0.0', si bien
// qu'une copie privee de la constante dans le composant serait restee
// invisible tant que les deux valeurs coincidaient. Meme faute que celle que
// consent-version-source.test.tsx documente pour la banniere.
import { COOKIE_CONSENT_VERSION } from '@/lib/actions/consent-types';

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
    notifyMock.mockClear();
    reloadMock.mockClear();
  });

  // 19 September 2026: no marketing tracker exists and the bar no longer asks
  // about one (#471). A box that grants nothing is a promise the product does
  // not keep, so Settings shows the two categories that do something.
  it('renders the title, description and two categories, with no marketing box', () => {
    render(wrapped(null));
    // CardTitle renders as a <div>, not a heading — assert by visible text.
    expect(screen.getByText(messages.app.settings.cookies.title)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByLabelText(messages.app.settings.cookies.essentialLabel)).toBeDisabled();
    expect(screen.queryByLabelText(/marketing/i)).not.toBeInTheDocument();
  });

  // The stored shape is unchanged (no migration): `marketing` is still
  // written, always false — including over a decision that had granted it.
  it('toggling analytics writes marketing: false, even over a stored marketing: true', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: COOKIE_CONSENT_VERSION,
        analytics: false,
        marketing: true,
        decidedAt: '2026-12-31T23:59:59.000Z',
      }),
    );
    render(wrapped(null));
    fireEvent.click(screen.getByLabelText(messages.app.settings.cookies.analyticsLabel));
    await waitFor(() => {
      expect(recordCookieConsentMock).toHaveBeenCalledWith({ analytics: true, marketing: false });
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
      expect(stored).toMatchObject({ analytics: true, marketing: false });
    });
  });

  it('reflects the server-fetched snapshot when one is provided', () => {
    render(
      wrapped({
        analytics: true,
        marketing: false,
        version: COOKIE_CONSENT_VERSION,
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const analyticsCheckbox = screen.getByLabelText(
      messages.app.settings.cookies.analyticsLabel,
    ) as HTMLInputElement;
    expect(analyticsCheckbox.checked).toBe(true);
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
        version: COOKIE_CONSENT_VERSION,
        analytics: true,
        marketing: true,
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    render(
      wrapped({
        analytics: true,
        marketing: true,
        version: COOKIE_CONSENT_VERSION,
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
    // Ce bouton revoque REELLEMENT cote serveur, mais il efface la decision
    // locale : le gate des traceurs n'y voit qu'un `null`, indiscernable d'une
    // banniere rouverte depuis le pied de page. Sans ce rechargement, le
    // traceur deja charge continuerait d'emettre pour toute la duree du
    // document — le retrait le plus explicite de l'interface serait le seul
    // sans effet.
    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    // Et il vient APRES l'action serveur : un rechargement lance avant
    // l'avorterait.
    const ordreAction = recordCookieConsentMock.mock.invocationCallOrder[0];
    const ordreReload = reloadMock.mock.invocationCallOrder[0];
    expect(ordreAction).toBeDefined();
    expect(ordreReload).toBeDefined();
    expect(ordreAction as number).toBeLessThan(ordreReload as number);
  });

  it('reset : une action serveur en echec ne rouvre rien et ne recharge pas', async () => {
    // Falsification du cas precedent : sans elle, une implementation qui
    // recharge quoi qu'il arrive passerait les deux.
    recordCookieConsentMock.mockResolvedValueOnce({ ok: false, error: 'boom' });
    render(wrapped(null));
    fireEvent.click(
      screen.getByRole('button', { name: messages.app.settings.cookies.resetButton }),
    );
    await waitFor(() => {
      expect(recordCookieConsentMock).toHaveBeenCalled();
    });
    expect(reopenMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('bascule : une action serveur qui REJETTE ne reveille pas le gate', async () => {
    // Troisieme branche promise par la regle « on ne reveille que sur ok » :
    // un `.catch(() => null)` reecrit en `.catch(e => { throw e })` ne ferait
    // rougir personne sans ce cas.
    recordCookieConsentMock.mockRejectedValueOnce(new Error('reseau'));
    render(wrapped(null));
    fireEvent.click(screen.getByLabelText(messages.app.settings.cookies.analyticsLabel));
    await waitFor(() => {
      expect(recordCookieConsentMock).toHaveBeenCalled();
    });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('hydrates from a fresher localStorage decision over a stale server snapshot', () => {
    const fresh = '2026-12-31T23:59:59.000Z';
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: COOKIE_CONSENT_VERSION,
        analytics: false,
        marketing: true,
        decidedAt: fresh,
      }),
    );
    render(
      wrapped({
        analytics: true,
        marketing: false,
        version: COOKIE_CONSENT_VERSION,
        decidedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const analytics = screen.getByLabelText(
      messages.app.settings.cookies.analyticsLabel,
    ) as HTMLInputElement;
    expect(analytics.checked).toBe(false);
  });

  // F-11: the proof of consent names WHICH version was accepted, and when.
  // `user_consents.version` already carries it; the screen did not say it.
  describe('the date of the choice and the policy version', () => {
    it('shows both from the server snapshot', () => {
      render(
        wrapped({
          analytics: true,
          marketing: false,
          version: '1.0.0',
          decidedAt: '2026-09-03T10:00:00.000Z',
        }),
      );
      const meta = screen.getByTestId('cookies-decision-meta');
      expect(meta).toHaveTextContent('3 septembre 2026');
      expect(meta).toHaveTextContent('version 1.0.0');
    });

    it('shows the version the SERVER recorded, not the current constant', () => {
      render(
        wrapped({
          analytics: false,
          marketing: false,
          version: '0.9.0',
          decidedAt: '2026-08-01T10:00:00.000Z',
        }),
      );
      expect(screen.getByTestId('cookies-decision-meta')).toHaveTextContent('version 0.9.0');
    });

    it('falls back to the local decision when there is no server record', async () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: COOKIE_CONSENT_VERSION,
          analytics: false,
          marketing: false,
          decidedAt: '2026-09-10T08:00:00.000Z',
        }),
      );
      render(wrapped(null));
      await waitFor(() =>
        expect(screen.getByTestId('cookies-decision-meta')).toHaveTextContent('10 septembre 2026'),
      );
      expect(screen.getByTestId('cookies-decision-meta')).toHaveTextContent(
        `version ${COOKIE_CONSENT_VERSION}`,
      );
    });

    it('shows nothing when no choice exists anywhere', () => {
      render(wrapped(null));
      expect(screen.queryByTestId('cookies-decision-meta')).not.toBeInTheDocument();
    });

    it('dates a fresh choice made on this screen', async () => {
      render(wrapped(null));
      fireEvent.click(screen.getByLabelText(messages.app.settings.cookies.analyticsLabel));
      await waitFor(() =>
        expect(screen.getByTestId('cookies-decision-meta')).toHaveTextContent(
          `version ${COOKIE_CONSENT_VERSION}`,
        ),
      );
    });
  });
});
