import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../../../../messages/fr-BE.json';

/**
 * D'OÙ la bannière tient-elle son numéro de version ?
 *
 * Les autres specs de ce dossier comparent ce qu'elle écrit à
 * `COOKIE_CONSENT_VERSION`. Tant que les deux valeurs coïncident — et elles
 * coïncidaient, `'1.0.0'` des deux côtés — cette comparaison passe aussi bien
 * avec une constante partagée qu'avec deux copies indépendantes. **Elle ne peut
 * pas échouer, donc elle ne prouve rien.**
 *
 * Ici, le module qui PERSISTE la version est remplacé par une valeur qui
 * n'existe nulle part ailleurs dans le code. Si la bannière relit bien sa
 * source, elle honore ce numéro. Si elle en garde une copie en dur, le
 * remplacement n'a aucun effet et les deux cas ci-dessous échouent.
 */
// `vi.hoisted` : la fabrique de `vi.mock` est remontée en tête de fichier, donc
// elle ne peut pas fermer sur une constante déclarée ici de façon ordinaire.
const VERSION_DE_TEST = vi.hoisted(() => '9.9.9-source-unique');

vi.mock('@/lib/actions/consent-types', () => ({
  COOKIE_CONSENT_VERSION: VERSION_DE_TEST,
}));

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

import { ConsentBanner, __resetConsentCacheForTests } from '../ConsentBanner';

const STORAGE_KEY = 'ankora.consent.v1';

const wrapped = () => (
  <NextIntlClientProvider locale="fr-BE" messages={messages}>
    <ConsentBanner />
  </NextIntlClientProvider>
);

const banniereVisible = () =>
  screen.queryByRole('button', { name: messages.consent.essentialOnly });

describe('la bannière lit sa version dans le module qui la persiste', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetConsentCacheForTests();
    recordCookieConsentMock.mockClear();
  });

  it('écrit le numéro du module serveur, et non un littéral qui lui serait propre', async () => {
    render(wrapped());
    fireEvent.click(screen.getByRole('button', { name: messages.consent.acceptAll }));

    await waitFor(() => {
      const brut = window.localStorage.getItem(STORAGE_KEY);
      expect(brut).not.toBeNull();
      expect(JSON.parse(brut as string).version).toBe(VERSION_DE_TEST);
    });
  });

  it('accepte une décision déjà stockée sous ce même numéro, et reste masquée', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: VERSION_DE_TEST,
        analytics: true,
        marketing: false,
        decidedAt: new Date().toISOString(),
      }),
    );
    __resetConsentCacheForTests();

    render(wrapped());

    expect(banniereVisible()).not.toBeInTheDocument();
  });

  it('réaffiche la bannière sur une décision stockée sous un AUTRE numéro', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: '0.0.1-perimee',
        analytics: true,
        marketing: false,
        decidedAt: new Date().toISOString(),
      }),
    );
    __resetConsentCacheForTests();

    render(wrapped());

    // Le cas de contrôle : il prouve que le cas précédent ne passe pas
    // simplement parce que la bannière serait masquée en toutes circonstances.
    expect(banniereVisible()).toBeInTheDocument();
  });
});
