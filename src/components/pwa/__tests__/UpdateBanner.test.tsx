import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/browser/reload', () => ({ reloadPage }));

const consentPending = vi.hoisted(() => ({ value: false }));
vi.mock('@/components/gdpr/ConsentBanner', () => ({
  useConsentBannerPending: () => consentPending.value,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({ title: 'Une nouvelle version est disponible', reload: 'Recharger', later: 'Plus tard' })[
      key
    ] ?? key,
}));

import { UpdateBanner } from '../UpdateBanner';
import { __resetUpdateStoreForTests, getSnapshot, signalerMiseAJour } from '@/lib/pwa/update-store';

const registration = (waiting: unknown = { postMessage: vi.fn() }) =>
  ({ waiting }) as unknown as ServiceWorkerRegistration;

beforeEach(() => {
  __resetUpdateStoreForTests();
  reloadPage.mockClear();
  consentPending.value = false;
});

describe('<UpdateBanner />', () => {
  it('reste invisible tant qu’aucune mise à jour n’attend', () => {
    render(<UpdateBanner />);
    expect(screen.queryByTestId('pwa-update-banner')).toBeNull();
  });

  it('apparaît quand une mise à jour est signalée', () => {
    signalerMiseAJour(registration());
    render(<UpdateBanner />);
    expect(screen.getByTestId('pwa-update-banner')).toBeInTheDocument();
  });

  it('reste invisible tant que le consentement n’est pas décidé', () => {
    // Les deux bandeaux se peignent au même endroit et la bannière de
    // consentement est `z-50` : empilés, celui-ci serait invisible ET
    // injoignable. C'est la faute de #302, un cran plus bas.
    consentPending.value = true;
    signalerMiseAJour(registration());
    render(<UpdateBanner />);
    expect(screen.queryByTestId('pwa-update-banner')).toBeNull();
  });

  it('« Plus tard » masque sans recharger', () => {
    signalerMiseAJour(registration());
    const { rerender } = render(<UpdateBanner />);
    fireEvent.click(screen.getByTestId('pwa-update-later'));
    rerender(<UpdateBanner />);
    expect(screen.queryByTestId('pwa-update-banner')).toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();
    expect(getSnapshot().miseAJourDisponible).toBe(false);
  });

  it('« Recharger » demande l’activation au worker en attente', () => {
    const postMessage = vi.fn();
    signalerMiseAJour(registration({ postMessage }));
    render(<UpdateBanner />);
    fireEvent.click(screen.getByTestId('pwa-update-reload'));
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('se décale au-dessus de la barre d’onglets quand elle est montée', () => {
    // Un élément `fixed` ne se pousse pas avec un `padding-bottom` sur `body` :
    // sans ce décalage, ce bandeau recouvrirait les cinq onglets (#302).
    signalerMiseAJour(registration());
    render(<UpdateBanner liftedForBottomBar />);
    expect(screen.getByTestId('pwa-update-banner').className).toContain(
      'safe-area-inset-bottom)+4rem',
    );
  });

  it('les deux boutons tiennent la cible tactile de 44 px', () => {
    signalerMiseAJour(registration());
    render(<UpdateBanner />);
    expect(screen.getByTestId('pwa-update-reload').className).toContain('min-h-11');
    expect(screen.getByTestId('pwa-update-later').className).toContain('min-h-11');
  });
});
