import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/browser/reload', () => ({ reloadPage }));

import {
  __resetUpdateStoreForTests,
  appliquerMiseAJour,
  getServerSnapshot,
  getSnapshot,
  reporterMiseAJour,
  signalerMiseAJour,
  subscribe,
  surControllerChange,
} from '../update-store';

/** Un enregistrement minimal : seul `waiting.postMessage` nous intéresse. */
const registration = (waiting: { postMessage: ReturnType<typeof vi.fn> } | null) =>
  ({ waiting }) as unknown as ServiceWorkerRegistration;

beforeEach(() => {
  __resetUpdateStoreForTests();
  reloadPage.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('store de mise à jour PWA', () => {
  it('part sans mise à jour', () => {
    expect(getSnapshot().miseAJourDisponible).toBe(false);
  });

  it('réveille ses abonnés au signalement', () => {
    const cb = vi.fn();
    subscribe(cb);
    signalerMiseAJour(registration(null));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getSnapshot().miseAJourDisponible).toBe(true);
  });

  it('rend un instantané serveur référentiellement stable', () => {
    // `useSyncExternalStore` boucle si cette référence change.
    expect(getServerSnapshot()).toBe(getServerSnapshot());
    expect(getServerSnapshot().miseAJourDisponible).toBe(false);
  });

  it('avec un worker en attente : poste SKIP_WAITING sans recharger tout de suite', () => {
    const postMessage = vi.fn();
    signalerMiseAJour(registration({ postMessage }));
    appliquerMiseAJour();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('sans worker en attente : recharge immédiatement', () => {
    // Le worker a pu devenir redondant entre le rendu du bandeau et le clic.
    // Un bouton « Recharger » qui ne recharge pas EST la plainte d'origine.
    signalerMiseAJour(registration(null));
    appliquerMiseAJour();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('replie sur un rechargement si controllerchange n’arrive jamais', () => {
    signalerMiseAJour(registration({ postMessage: vi.fn() }));
    appliquerMiseAJour();
    expect(reloadPage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('ne recharge PAS sur controllerchange non armé', () => {
    // Le cas qui protège tout nouveau visiteur : `clients.claim()` déclenche
    // `controllerchange` à la PREMIÈRE installation, pour quelqu'un qui n'a
    // rien demandé. Sans ce garde, sa page sauterait — en plein formulaire
    // d'inscription, par exemple.
    surControllerChange();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('recharge une seule fois sur controllerchange armé, et annule le repli', () => {
    signalerMiseAJour(registration({ postMessage: vi.fn() }));
    appliquerMiseAJour();
    surControllerChange();
    expect(reloadPage).toHaveBeenCalledTimes(1);
    // Le minuteur doit avoir été annulé : sinon le nouveau worker peut être
    // encore `activating` à t+2 s et le rechargement repartirait sous l'ancien.
    vi.advanceTimersByTime(5000);
    surControllerChange();
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('« Plus tard » masque, et un second signalement ne le ré-arme pas', () => {
    signalerMiseAJour(registration(null));
    reporterMiseAJour();
    expect(getSnapshot().miseAJourDisponible).toBe(false);
    signalerMiseAJour(registration(null));
    expect(getSnapshot().miseAJourDisponible).toBe(false);
  });
});
