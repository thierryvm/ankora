'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

import { usePathname } from '@/i18n/navigation';
import { ConsentBanner } from '@/components/gdpr/ConsentBanner';
import { UpdateBanner } from '@/components/pwa/UpdateBanner';
import { ScrollToTop } from '@/components/layout/ScrollToTop';

import { isExcludedRoute } from './bottom-tab-bar.routes';

/**
 * Chargement différé, et ce n'est pas une optimisation gratuite.
 *
 * Avant ce module, `BottomTabBar` — donc `MoreSheet` et `AddExpenseSheet` avec
 * lui — était rendu **conditionnellement par un Server Component** : son code
 * n'était même pas référencé dans la charge de la landing. Une décision prise à
 * l'exécution le rendrait joignable depuis `/`, c'est-à-dire depuis la page dont
 * Lighthouse est une porte de merge.
 *
 * `next/dynamic` rétablit la propriété perdue : l'import ne part que si le
 * composant est réellement rendu. Sur une route exclue, l'emplacement rend
 * `null` et le code n'est jamais demandé.
 *
 * `ssr` reste activé (défaut) : la barre doit être présente dans le HTML servi,
 * sinon elle apparaîtrait après l'hydratation — un saut visuel sur chaque page
 * du cockpit.
 */
const BottomTabBar = dynamic(() =>
  import('./BottomTabBar').then((m) => ({ default: m.BottomTabBar })),
);

/**
 * La visibilité de la barre d'onglets, décidée **là où elle change**.
 *
 * ## Le défaut que ce module supprime
 *
 * `shouldMountBottomTabBar()` lit l'en-tête `x-pathname` — celui de la requête
 * **du document** — et il était consommé dans `src/app/[locale]/layout.tsx`, un
 * layout **partagé**. Next ne re-rend pas un layout partagé lors d'une
 * navigation client : la charge RSC ne contient que la page. La valeur était
 * donc gelée pour toute la vie du document.
 *
 * Mesuré en production le 5 août 2026, session authentifiée, largeur 1100 px :
 *
 * | Chemin d'entrée                                  | barres dans le DOM |
 * | ------------------------------------------------ | ------------------ |
 * | document sur `/`, puis clic vers `/app`          | **0**              |
 * | rechargement ordinaire sur `/app`                | **1**              |
 *
 * Le manifeste portait alors `start_url: '/'`, une route exclue. L'application
 * installée démarrait donc toujours sans barre, le seul chemin vers le cockpit
 * est un `<Link>`, et en `standalone` iOS n'offre aucun geste qui charge un
 * nouveau document. **La barre ne pouvait structurellement jamais apparaître.**
 *
 * `start_url` vaut `'/app'` depuis le 8 août 2026, pour une raison sans rapport
 * (supprimer un geste à chaque ouverture). Cela **ne remplace pas** ce module :
 * la visibilité est décidée à chaque navigation client, quel que soit le point
 * d'entrée. Un `start_url` qui masquerait le défaut plutôt que de le corriger
 * serait le pire des deux mondes — le bug reviendrait au premier lien depuis une
 * page publique.
 *
 * ## La scission
 *
 * La décision mélangeait deux choses de natures différentes :
 *
 * 1. **« le visiteur est-il authentifié ? »** — état serveur, qui ne change
 *    qu'à la connexion ou à la déconnexion ;
 * 2. **« la route courante autorise-t-elle la barre ? »** — dépend du chemin,
 *    donc doit être réévaluée à **chaque** navigation client.
 *
 * Seule la seconde passe ici. La première descend du serveur, une fois.
 *
 * ## Deux invariants, et ce qui les tient
 *
 * **1. Gaté = non rendu, jamais `hidden`.**
 * `e2e/mobile-ios/bottom-tab-bar.spec.ts` assert `toHaveCount(0)` pour un
 * visiteur anonyme sur `/faq` et sur `/`. Une barre masquée en CSS rendrait ces
 * deux cas verts tout en expédiant la navigation à des visiteurs anonymes.
 *
 * **2. La moitié « authentifié » reste figée pour la vie du document**, et ce
 * n'est acceptable que parce que les deux transitions passent par un `redirect()`
 * de niveau document : `src/lib/actions/auth.ts` (connexion et déconnexion),
 * `settings.ts`, `onboarding.ts`. Une connexion qui finirait un jour par un
 * `router.replace()` côté client recréerait le même défaut **en miroir** — la
 * barre resterait après la déconnexion. Le témoin automatisé de cet invariant
 * est `e2e/mobile-ios/bottom-tab-bar.spec.ts`, qui se connecte puis clique sans
 * aucun `goto` ni `reload` intermédiaire : **ne pas y ajouter l'un des deux pour
 * « stabiliser »**, ce geste supprimerait la preuve sans faire baisser aucun
 * chiffre.
 *
 * ## Deux contraintes de fichier, chacune née d'un incident
 *
 * - Ce module porte `'use client'` et importe **depuis**
 *   `bottom-tab-bar.routes.ts`. L'inverse est interdit : sous Next 16 + React 19,
 *   un Server Component qui importe une valeur non-composant depuis un module
 *   `'use client'` fait planter le rendu de **toutes** les pages (constaté en
 *   prévisualisation Vercel, PR #182). `Header` et `Footer` continuent d'importer
 *   `shouldMountBottomTabBar` depuis le module serveur, qui reste intact.
 * - `usePathname` vient de `@/i18n/navigation`, **jamais** de `next/navigation` :
 *   le premier rend le chemin sans préfixe de locale, ce qu'attend
 *   `isExcludedRoute` ; le second rendrait `/en/app` et casserait l'exclusion sur
 *   toutes les locales non par défaut.
 *
 * ## Piège pour plus tard
 *
 * Ajouter `staleTimes.dynamic > 0` dans `next.config.ts` figerait `Header` et
 * `Footer` à leur tour — ils sont corrects aujourd'hui **parce que** les segments
 * dynamiques sont refetchés à chaque navigation. Cela ressusciterait la
 * contradiction, dans l'autre sens.
 */
const VisibiliteContext = createContext<boolean>(false);

export function BottomTabBarVisibilityProvider({
  isAuthenticated,
  children,
}: {
  /**
   * Résolu côté serveur, une seule fois par document. Le client ne se fait
   * jamais confiance sur ce point — cf. l'invariant 2 ci-dessus.
   */
  isAuthenticated: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const visible = useMemo(
    () => isAuthenticated && !isExcludedRoute(pathname),
    [isAuthenticated, pathname],
  );
  return <VisibiliteContext.Provider value={visible}>{children}</VisibiliteContext.Provider>;
}

/** La barre est-elle montée pour la route courante ? */
export function useBottomTabBarVisible(): boolean {
  return useContext(VisibiliteContext);
}

/*
 * Les quatre emplacements ci-dessous existent pour une raison précise : ils
 * gardent le **prop** `liftedForBottomBar` là où il était déjà, et gardent
 * chaque composant **à sa place exacte dans le DOM**.
 *
 * Le prop était la bonne frontière — seule la moitié qui l'alimentait était
 * fausse. `ScrollToTop`, `UpdateBanner` et `ConsentBanner` ont chacun des tests
 * qui assertent sur ce contrat ; les faire lire le contexte eux-mêmes obligerait
 * à réécrire ces tests pour zéro gain.
 *
 * Et l'ordre DOM compte : `navigation-usable-first-visit.spec.ts` mesure par
 * `elementFromPoint`, donc par ordre de peinture. Regrouper ces composants sous
 * un parent commun déplacerait `Toaster` et `ServiceWorkerRegister` par rapport
 * à eux. Un emplacement par composant, au même endroit qu'avant, ne déplace rien.
 */

export function ConsentBannerSlot() {
  return <ConsentBanner liftedForBottomBar={useBottomTabBarVisible()} />;
}

export function UpdateBannerSlot() {
  return <UpdateBanner liftedForBottomBar={useBottomTabBarVisible()} />;
}

export function ScrollToTopSlot() {
  return <ScrollToTop liftedForBottomBar={useBottomTabBarVisible()} />;
}

export function BottomTabBarSlot({ isAdmin }: { isAdmin: boolean }) {
  const visible = useBottomTabBarVisible();
  // Non rendue, jamais masquée — invariant 1.
  if (!visible) return null;
  return <BottomTabBar isAdmin={isAdmin} />;
}
