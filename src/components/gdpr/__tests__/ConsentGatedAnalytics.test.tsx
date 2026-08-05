import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

const reloadPage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/browser/reload', () => ({ reloadPage }));

// Les deux traceurs sont remplacés par des sondes : on teste ce que l'arbre
// MONTE, pas ce que le réseau charge. C'est la seule assertion qui peut rougir
// en jsdom, et c'est exactement la propriété que le gate doit garantir.
vi.mock('@vercel/analytics/next', () => ({
  Analytics: () => <div data-testid="sonde-va" />,
}));
vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => <div data-testid="sonde-si" />,
}));

// `ConsentBanner.tsx` importe `Link` de `@/i18n/navigation`, dont le
// `createNavigation` de next-intl tire `next/navigation` — irrésoluble sous
// jsdom. On moque la navigation, JAMAIS le module `ConsentBanner` : le gate a
// besoin du vrai store, c'est lui qu'on teste.
// `ConsentBanner` importe l'action serveur, qui tire le client Supabase, donc
// la validation d'environnement. Rien de tout cela n'est l'objet de ce fichier.
vi.mock('@/lib/actions/consent', () => ({
  recordCookieConsentAction: vi.fn(async () => ({ ok: true, data: { persisted: false } })),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  redirect: vi.fn(),
}));

import { ConsentGatedAnalytics } from '../ConsentGatedAnalytics';
import {
  CONSENT_VERSION,
  notifyConsentChanged,
  reopenConsentBanner,
  __resetConsentCacheForTests,
} from '../ConsentBanner';

const STORAGE_KEY = 'ankora.consent.v1';

const decider = (analytics: boolean, marketing = false, version = CONSENT_VERSION) => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version, analytics, marketing, decidedAt: new Date().toISOString() }),
  );
};

const sondesMontees = () => ({
  va: screen.queryByTestId('sonde-va') !== null,
  si: screen.queryByTestId('sonde-si') !== null,
});

beforeEach(() => {
  window.localStorage.clear();
  __resetConsentCacheForTests();
  reloadPage.mockClear();
});

describe('<ConsentGatedAnalytics /> — ce qui se monte', () => {
  it('aucune décision : aucun traceur — le cas qui était faux en production', () => {
    render(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: false, si: false });
  });

  it('refus enregistré : aucun traceur', () => {
    decider(false);
    render(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: false, si: false });
  });

  it('consentement accordé : les deux traceurs', () => {
    decider(true);
    render(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: true, si: true });
  });

  it('marketing accordé seul ne monte rien — les scopes sont indépendants', () => {
    decider(false, true);
    render(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: false, si: false });
  });

  it('version de consentement périmée : aucun traceur', () => {
    // `readStored()` rejette déjà les versions étrangères ; ce cas verrouille
    // que le gate hérite du rejet au lieu de le contourner.
    decider(true, false, '0.9.0');
    render(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: false, si: false });
  });

  it('rendu serveur : aucun traceur, quel que soit l’état réel du navigateur', () => {
    decider(true);
    const html = renderToString(<ConsentGatedAnalytics />);
    expect(html).not.toContain('sonde-va');
    expect(html).not.toContain('sonde-si');
  });
});

describe('<ConsentGatedAnalytics /> — les transitions', () => {
  it('refus → accord monte les traceurs sans rechargement', () => {
    decider(false);
    const { rerender } = render(<ConsentGatedAnalytics />);
    expect(sondesMontees().va).toBe(false);

    act(() => {
      decider(true);
      notifyConsentChanged();
    });
    rerender(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: true, si: true });
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('accord → refus recharge exactement une fois', () => {
    decider(true);
    const { rerender } = render(<ConsentGatedAnalytics />);
    act(() => {
      decider(false);
      notifyConsentChanged();
    });
    rerender(<ConsentGatedAnalytics />);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('accord → refus démonte aussi les sondes', () => {
    // Le cas précédent ne prouve QUE l'appel à `reloadPage`.
    decider(true);
    const { rerender } = render(<ConsentGatedAnalytics />);
    act(() => {
      decider(false);
      notifyConsentChanged();
    });
    rerender(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: false, si: false });
  });

  it('un refus INITIAL ne recharge pas', () => {
    // Falsification du cas précédent : sans lui, un gate qui rechargerait à
    // tout changement passerait les deux.
    render(<ConsentGatedAnalytics />);
    act(() => {
      decider(false);
      notifyConsentChanged();
    });
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('rouvrir la bannière après un accord démonte SANS recharger', () => {
    // « Gérer mes préférences » n'est pas un retrait : le consentement tient
    // jusqu'à la décision suivante, et recharger la page sous l'utilisateur
    // serait faux.
    decider(true);
    const { rerender } = render(<ConsentGatedAnalytics />);
    act(() => {
      reopenConsentBanner();
    });
    rerender(<ConsentGatedAnalytics />);
    expect(sondesMontees()).toEqual({ va: false, si: false });
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('chaîne accord → décision effacée → refus : un seul rechargement', () => {
    // Verrouille l'ordre des deux `return` dans l'effet. Les inverser ferait
    // consommer la mémoire du chargement à l'étape « effacée », et la chaîne
    // ne rechargerait jamais — sans qu'aucun autre cas ne rougisse.
    decider(true);
    const { rerender } = render(<ConsentGatedAnalytics />);

    act(() => {
      reopenConsentBanner();
    });
    rerender(<ConsentGatedAnalytics />);
    expect(reloadPage).not.toHaveBeenCalled();

    act(() => {
      decider(false);
      notifyConsentChanged();
    });
    rerender(<ConsentGatedAnalytics />);
    expect(reloadPage).toHaveBeenCalledTimes(1);
  });

  it('un retrait fait dans un AUTRE onglet est vu et recharge', () => {
    // Le chemin `subscribe` → `storage` n'est exercé par aucun autre cas :
    // tous pilotent le store par `notifyConsentChanged()`.
    decider(true);
    const { rerender } = render(<ConsentGatedAnalytics />);
    act(() => {
      decider(false);
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    });
    rerender(<ConsentGatedAnalytics />);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(sondesMontees()).toEqual({ va: false, si: false });
  });
});
