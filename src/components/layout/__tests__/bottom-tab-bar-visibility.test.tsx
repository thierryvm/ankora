import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * La décision de monter la barre suit-elle la ROUTE, ou reste-t-elle figée ?
 *
 * C'est la seule question de ce fichier, et c'est celle que rien ne posait :
 * l'ancienne décision était prise dans un layout partagé, à partir de l'en-tête
 * de la requête du **document**. Elle était donc juste au premier rendu et
 * fausse ensuite, pour toujours — la barre ne pouvait jamais apparaître dans la
 * PWA installée, qui démarre sur `/` et n'y navigue plus qu'au clic.
 *
 * Un test qui rendrait le composant une fois par chemin ne verrait rien : c'est
 * le CHANGEMENT de chemin sans remontage qui est en cause. D'où le pilote de
 * chemin ci-dessous, qui rejoue exactement ce que fait une navigation client —
 * même arbre React, `usePathname()` qui rend autre chose.
 */
const cheminActuel = vi.hoisted(() => ({ value: '/' }));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => cheminActuel.value,
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

// Les composants réels tirent next-intl, Supabase et le stockage local. On ne
// mesure ici que la DÉCISION, pas leur rendu — chacun a déjà ses propres specs.
vi.mock('@/components/gdpr/ConsentBanner', () => ({
  ConsentBanner: ({ liftedForBottomBar }: { liftedForBottomBar?: boolean }) => (
    <div data-testid="banniere-consentement" data-lifted={String(liftedForBottomBar)} />
  ),
}));
vi.mock('@/components/pwa/UpdateBanner', () => ({
  UpdateBanner: ({ liftedForBottomBar }: { liftedForBottomBar?: boolean }) => (
    <div data-testid="banniere-maj" data-lifted={String(liftedForBottomBar)} />
  ),
}));
vi.mock('@/components/layout/ScrollToTop', () => ({
  ScrollToTop: ({ liftedForBottomBar }: { liftedForBottomBar?: boolean }) => (
    <div data-testid="haut-de-page" data-lifted={String(liftedForBottomBar)} />
  ),
}));
vi.mock('../BottomTabBar', () => ({
  BottomTabBar: ({ isAdmin }: { isAdmin?: boolean }) => (
    <nav data-testid="bottom-tab-bar" data-admin={String(isAdmin)} />
  ),
}));

import {
  BottomTabBarVisibilityProvider,
  BottomTabBarSlot,
  ConsentBannerSlot,
  UpdateBannerSlot,
  ScrollToTopSlot,
} from '../bottom-tab-bar-visibility';

const arbre = (isAuthenticated: boolean) => (
  <BottomTabBarVisibilityProvider isAuthenticated={isAuthenticated}>
    <ConsentBannerSlot />
    <BottomTabBarSlot isAdmin={false} />
    <UpdateBannerSlot />
    <ScrollToTopSlot />
  </BottomTabBarVisibilityProvider>
);

const barre = () => screen.queryByTestId('bottom-tab-bar');
/**
 * `BottomTabBar` est chargé par `next/dynamic` : à sa première apparition, son
 * module doit se résoudre avant d'être rendu. C'est le prix, assumé, de ne pas
 * expédier son code à la landing — et c'est un VRAI comportement, pas un
 * artefact de test : sur une navigation client vers `/app`, la barre arrive au
 * tick suivant.
 *
 * Les assertions d'ABSENCE restent synchrones, délibérément : rien n'est jamais
 * rendu puis retiré, donc une absence constatée tout de suite est une absence.
 */
const barreApparue = () => screen.findByTestId('bottom-tab-bar');
const releve = (id: string) => screen.getByTestId(id).getAttribute('data-lifted');

describe('la visibilité de la barre suit la route, sans remontage', () => {
  beforeEach(() => {
    cheminActuel.value = '/';
  });

  it("LE CAS DU DÉFAUT : de `/` vers `/app` sans remonter l'arbre, la barre apparaît", async () => {
    const { rerender } = render(arbre(true));
    // Une route exclue — `/` en est une. C'était le point de départ de la PWA
    // installée jusqu'au 8 août 2026 (`start_url` vaut `/app` depuis) ; le cas
    // reste celui de tout arrivant par une page publique. Aucune barre, et
    // c'est correct.
    expect(barre()).not.toBeInTheDocument();

    // Ce que fait un clic sur « Mon cockpit » : le chemin change, l'arbre non.
    cheminActuel.value = '/app';
    rerender(arbre(true));

    // Avant le correctif : toujours 0. C'est l'assertion qui échoue sur le code
    // d'avant, et la seule raison d'être de ce fichier.
    expect(await barreApparue()).toBeInTheDocument();
  });

  it('et dans l’autre sens : de `/app` vers `/`, elle disparaît', async () => {
    cheminActuel.value = '/app';
    const { rerender } = render(arbre(true));
    expect(await barreApparue()).toBeInTheDocument();

    cheminActuel.value = '/';
    rerender(arbre(true));
    // Symétrie du même défaut : une barre figée resterait visible sur la landing,
    // où elle n'a rien à faire.
    expect(barre()).not.toBeInTheDocument();
  });

  it('les trois décalages suivent la barre, au même instant', () => {
    const { rerender } = render(arbre(true));
    expect(releve('banniere-consentement')).toBe('false');
    expect(releve('banniere-maj')).toBe('false');
    expect(releve('haut-de-page')).toBe('false');

    cheminActuel.value = '/app';
    rerender(arbre(true));

    // Corriger le montage sans corriger les décalages livrerait deux bannières
    // relevées de 4 rem au-dessus de rien, ou posées sur la barre : le défaut
    // #302 rejoué dans un sens ou dans l'autre.
    expect(releve('banniere-consentement')).toBe('true');
    expect(releve('banniere-maj')).toBe('true');
    expect(releve('haut-de-page')).toBe('true');
  });

  it("un visiteur anonyme n'a jamais de barre, quel que soit le chemin", () => {
    for (const chemin of ['/', '/app', '/faq', '/legal/privacy', '/admin']) {
      cheminActuel.value = chemin;
      const { unmount } = render(arbre(false));
      expect(barre(), `chemin ${chemin}`).not.toBeInTheDocument();
      unmount();
    }
  });

  it('la barre est ABSENTE du DOM, jamais masquée en CSS', () => {
    cheminActuel.value = '/';
    render(arbre(true));
    // `e2e/mobile-ios/bottom-tab-bar.spec.ts` assert `toHaveCount(0)` pour
    // l'anonyme. Une barre rendue puis masquée passerait ce test unitaire si on
    // se contentait de vérifier la visibilité — pas celui-ci.
    expect(document.querySelectorAll('[data-testid="bottom-tab-bar"]')).toHaveLength(0);
  });

  it("chaque route exclue l'est vraiment, et les autres ne le sont pas", async () => {
    const exclues = ['/', '/login', '/signup', '/onboarding', '/offline'];
    const autorisees = ['/app', '/app/accounts', '/admin', '/faq', '/glossaire'];

    for (const chemin of exclues) {
      cheminActuel.value = chemin;
      const { unmount } = render(arbre(true));
      expect(barre(), `exclue : ${chemin}`).not.toBeInTheDocument();
      unmount();
    }
    for (const chemin of autorisees) {
      cheminActuel.value = chemin;
      const { unmount } = render(arbre(true));
      expect(await barreApparue(), `autorisée : ${chemin}`).toBeInTheDocument();
      unmount();
    }
  });
});
