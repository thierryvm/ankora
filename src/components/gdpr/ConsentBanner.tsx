'use client';

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { recordCookieConsentAction } from '@/lib/actions/consent';
// La version vient du module qui la PERSISTE. Ce composant en portait une copie
// locale : deux constantes pour un seul numéro, dont aucune ne surveillait
// l'autre. Cf. le commentaire de `COOKIE_CONSENT_VERSION` pour les deux dérives
// muettes que cela rendait possibles.
import { COOKIE_CONSENT_VERSION } from '@/lib/actions/consent-types';

const STORAGE_KEY = 'ankora.consent.v1';
const REOPEN_FLAG_KEY = 'ankora.consent.reopen';

type ConsentState = {
  version: string;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

function readStored(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isReopenRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REOPEN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function persist(state: ConsentState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Reopen flag is consumed: any successful decision dismisses the banner.
  window.localStorage.removeItem(REOPEN_FLAG_KEY);
}

/**
 * Module-level snapshot cache. useSyncExternalStore requires getSnapshot() to
 * return a stable reference between invalidations — otherwise React loops.
 * We only recompute when subscribers are notified (persist or storage event).
 */
let cachedInitialized = false;

type StoreSnapshot = {
  stored: ConsentState | null;
  reopen: boolean;
};

const SNAPSHOT_REF: { value: StoreSnapshot } = {
  value: { stored: null, reopen: false },
};

function refreshSnapshot(): void {
  const next: StoreSnapshot = {
    stored: readStored(),
    reopen: isReopenRequested(),
  };
  // Stable identity unless the relevant fields changed.
  const prev = SNAPSHOT_REF.value;
  if (
    prev.stored?.version !== next.stored?.version ||
    prev.stored?.analytics !== next.stored?.analytics ||
    prev.stored?.marketing !== next.stored?.marketing ||
    prev.reopen !== next.reopen
  ) {
    SNAPSHOT_REF.value = next;
  }
}

function getSnapshot(): StoreSnapshot {
  if (!cachedInitialized) {
    refreshSnapshot();
    cachedInitialized = true;
  }
  return SNAPSHOT_REF.value;
}

// Frozen module-level constant for SSR: useSyncExternalStore requires
// getServerSnapshot() to return a referentially stable value across calls,
// otherwise React logs "The result of getServerSnapshot should be cached
// to avoid an infinite loop" and may re-render in a tight loop.
const SERVER_SNAPSHOT: StoreSnapshot = { stored: null, reopen: false };

function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

const STORAGE_LISTENERS = new Set<() => void>();

function subscribe(cb: () => void) {
  STORAGE_LISTENERS.add(cb);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === REOPEN_FLAG_KEY) {
      refreshSnapshot();
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    STORAGE_LISTENERS.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function notify() {
  refreshSnapshot();
  STORAGE_LISTENERS.forEach((cb) => cb());
}

/**
 * Test-only escape hatch — forces the module-level snapshot cache to be
 * recomputed from a fresh `localStorage` read on the next render. Vitest
 * shares module state between test cases by default, so without this the
 * banner would carry the consent decision of one test into the next.
 *
 * Not exported in any production import path (only `__tests__/` files
 * call it). Kept inside the module so the cache implementation stays
 * private.
 */
export function __resetConsentCacheForTests(): void {
  cachedInitialized = false;
  SNAPSHOT_REF.value = { stored: null, reopen: false };
}

/**
 * Test-only accessor that returns the SSR snapshot used by
 * useSyncExternalStore. Exposed so a Vitest can assert referential
 * stability without going through a real SSR render cycle.
 */
export function __getServerSnapshotForTests(): StoreSnapshot {
  return getServerSnapshot();
}

/**
 * Programmatically requests the banner to re-open. Called from the Settings
 * "Reset choice" button and the Footer "Manage cookie preferences" link so
 * the user can revisit their decision from anywhere.
 *
 * Implementation: clears the consent record AND sets a reopen flag. The flag
 * is necessary because the version-cookie removal alone cannot distinguish
 * "first visit" from "user-requested reopen" cleanly across SSR boundaries.
 */
/**
 * La bannière de consentement occupe-t-elle le bas de l'écran ?
 *
 * Exporté pour que le bandeau de mise à jour PWA s'efface devant elle. Les deux
 * sont `fixed` en bas avec le même décalage au-dessus de la barre d'onglets :
 * les empiler rendrait le second invisible ET injoignable sous le `z-50` du
 * premier. C'est la faute de #302 rejouée d'un cran plus bas.
 *
 * La condition reprend celle de `shouldShow` : `!hasDecided || reopen`. Un
 * simple `stored !== null` raterait le drapeau de réouverture — et « rouvrir
 * ses préférences cookies depuis la feuille Plus » est un chemin réel, pas une
 * hypothèse.
 *
 * Ne couvre pas l'état local `dismissed` du composant, qui n'est pas dans le
 * store. L'écart est borné à l'instant entre le clic et l'écriture de la
 * décision, et il penche du bon côté : on se croit masqué un instant de trop
 * plutôt que de se peindre sous un dialogue.
 */
/**
 * L'état du consentement analytics — à TROIS valeurs, et non deux.
 *
 * `null` (décision effacée, bannière rouverte) et `false` (refus enregistré)
 * commandent des comportements différents en aval : le premier démonte les
 * traceurs, le second démonte ET recharge. Les confondre était le défaut de la
 * première version de ce gate.
 *
 * Rend `null` côté serveur — `getServerSnapshot()` renvoie une décision nulle —
 * donc aucun traceur ne peut être monté pendant le rendu serveur.
 */
export function useAnalyticsConsent(): boolean | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snap.stored === null ? null : snap.stored.analytics;
}

/**
 * Réveille les abonnés au store après une écriture faite ailleurs que par la
 * bannière.
 *
 * L'événement `storage` ne se déclenche PAS dans l'onglet qui écrit, et la
 * bannière vit dans le layout racine : son `useEffect(notify, [])` ne rejoue
 * jamais sur une navigation client. Sans cet appel, une décision prise dans
 * `/app/settings` resterait invisible du reste de l'application jusqu'au
 * prochain chargement de document.
 */
export function notifyConsentChanged(): void {
  notify();
}

export function useConsentBannerPending(): boolean {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snap.stored === null || snap.reopen;
}

export function reopenConsentBanner(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.setItem(REOPEN_FLAG_KEY, '1');
  notify();
}

export type ConsentBannerProps = {
  /**
   * La `BottomTabBar` est-elle montée pour cette requête ?
   *
   * Quand elle l'est, la barre de consentement se pose sur elle au lieu du bord
   * de l'écran.
   *
   * Même contrat que `ScrollToTop.liftedForBottomBar`, et pour la même raison :
   * la barre est `position: fixed`, donc la réserve `--consent-height` posée en
   * `padding-bottom` sur `body` ne la déplace PAS — un élément hors flux ignore
   * le padding de son conteneur. La bannière (`z-50`) se peignait donc par-dessus
   * la barre (`z-40`) et interceptait les cinq onglets.
   *
   * Mesuré le 2026-08-03 à 390 × 844, utilisateur connecté, consentement non
   * décidé : `elementFromPoint` au centre de chacun des cinq onglets renvoyait la
   * bannière, sur WebKit **comme** sur Chromium. Après décision, 5/5 atteignables.
   *
   * Passé depuis `[locale]/layout.tsx`, qui calcule déjà `showBottomTabBar`.
   */
  liftedForBottomBar?: boolean;
};

export function ConsentBanner({ liftedForBottomBar = false }: ConsentBannerProps = {}) {
  const t = useTranslations('consent');
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  // Post-hydration refresh: the module-level snapshot cache survives
  // soft navigations within the SPA. If localStorage was written in
  // another tab (multi-tab race) or in a previous route before this
  // banner mounted, getSnapshot() may return a stale value taken from
  // the first pre-hydration read. Forcing a notify() at mount re-reads
  // localStorage and wakes up all subscribers (including this one).
  useEffect(() => {
    notify();
  }, []);

  /**
   * `dismissed` est un état LOCAL, et il ne se remettait jamais à zéro.
   *
   * Signalé par @thierry le 11 août 2026 : cliquer « Modifier mes préférences
   * cookies » ne ramenait pas la bannière ; seul un rechargement complet la
   * faisait revenir. Reproduit, puis remonté jusqu'ici.
   *
   * Le store faisait pourtant son travail — `reopenConsentBanner()` vidait bien
   * la décision et posait le drapeau. Mais `setDismissed(true)`, posé au moment
   * de la décision, n'était annulé par rien, et `shouldShow` le lit en premier :
   * `!dismissed` suffisait à masquer une bannière que tout le reste demandait à
   * afficher. Un rechargement « réparait » en remontant le composant, ce qui
   * remettait l'état local à `false` — d'où un symptôme qui ressemblait à un
   * cache, alors qu'il n'y en avait aucun.
   *
   * Ce composant vit dans le layout racine : son état survit donc à TOUTE la
   * navigation client. Une fois la décision prise, le retrait devenait
   * inatteignable pour le reste de la session.
   *
   * L'enjeu est réglementaire : retirer son consentement doit être aussi simple
   * que le donner (RGPD art. 7(3)). Un retrait qui exige un rechargement complet
   * ne l'est pas.
   *
   * Ajustement PENDANT le rendu, et non dans un `useEffect` : c'est le motif que
   * React documente pour réinitialiser un état local quand une valeur externe
   * change. Un effet ferait la même chose au prix d'un rendu en cascade — le
   * linter le refuse, à raison, et le contourner par un commentaire de
   * désactivation masquerait le coût sans le supprimer. Ici React redémarre le
   * rendu avant de peindre : aucun affichage intermédiaire.
   *
   * La bascule est comparée plutôt que lue à plat : au moment d'une décision,
   * `persist()` retire le drapeau mais `notify()` n'est appelé qu'APRÈS l'action
   * serveur. Sans cette comparaison, un `snap.reopen` encore à `true` dans cet
   * intervalle rouvrirait la bannière que `setDismissed(true)` vient de fermer,
   * et la garantie « la bannière disparaît immédiatement » tomberait.
   */
  const [reopenPrecedent, setReopenPrecedent] = useState(snap.reopen);
  if (snap.reopen !== reopenPrecedent) {
    setReopenPrecedent(snap.reopen);
    if (snap.reopen) setDismissed(false);
  }

  const hasDecided = snap.stored !== null;
  const shouldShow = !dismissed && (!hasDecided || snap.reopen);

  /*
   * The reserve: while the bar is open, `body` gets a bottom padding equal to
   * the distance from the viewport's bottom edge to the bar's top edge
   * (globals.css reads `--consent-height`). Without it the fixed bar would sit
   * on the last lines of every page — on 31 July 2026 it made « Se connecter »
   * unreachable on every iPhone preset.
   *
   * Measured, never guessed: the distance includes the lift above the bottom
   * tab bar and the safe-area inset, and it follows wrapping and rotation.
   * Written through the CSSOM (`style.setProperty`), which a nonce-based CSP
   * does not govern — only style attributes in markup are.
   *
   * Padding added at the BOTTOM of the page moves nothing above it. On a page
   * shorter than the screen, what is anchored to the bottom (the footer) does
   * move up by the reserve when the bar closes.
   *
   * `liftedForBottomBar` is a dependency: it flips on client navigation
   * (public page ↔ /app) and moves the bar by the tab bar's height WITHOUT
   * resizing it, so neither the ResizeObserver nor `resize` would fire.
   */
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!shouldShow || !el) {
      root.style.removeProperty('--consent-height');
      return;
    }
    const apply = () =>
      root.style.setProperty(
        '--consent-height',
        `${Math.round(window.innerHeight - el.getBoundingClientRect().top)}px`,
      );
    apply();
    // `innerHeight` changes on rotation and when the mobile URL bar folds,
    // without the bar itself resizing: the ResizeObserver alone would miss it.
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      ro?.disconnect();
      root.style.removeProperty('--consent-height');
    };
  }, [shouldShow, liftedForBottomBar]);

  if (!shouldShow) return null;

  const accept = (analyticsValue: boolean, marketingValue: boolean) => {
    persist({
      version: COOKIE_CONSENT_VERSION,
      analytics: analyticsValue,
      marketing: marketingValue,
      decidedAt: new Date().toISOString(),
    });
    setDismissed(true);
    // `notify()` est DÉPLACÉ après l'action serveur, et n'y va que sur succès.
    //
    // Il réveille le gate des traceurs (`ConsentGatedAnalytics`), qui recharge
    // le document sur un refus enregistré. Un rechargement lancé ici, avant que
    // le POST parte, l'avorterait : le stockage local dirait « refusé » pendant
    // que la base dirait encore « accordé », sans trace de l'art. 7(3) — et le
    // retour sur l'écran réhydrate depuis le local, donc l'écart serait
    // invisible.
    //
    // La condition porte sur `ok` SEUL. `recordCookieConsentAction` rend
    // `{ ok: true, data: { persisted: false } }` pour un visiteur non
    // authentifié : c'est le cas normal sur le site public, et le gate DOIT y
    // réagir. Y ajouter `&& res.data.persisted` le désactiverait pour tout
    // visiteur anonyme.
    //
    // La bannière, elle, disparaît toujours immédiatement : `setDismissed(true)`
    // reste synchrone.
    startTransition(async () => {
      const res = await recordCookieConsentAction({
        analytics: analyticsValue,
        marketing: marketingValue,
      }).catch(() => null);
      if (res?.ok) notify();
    });
  };

  /*
   * A THIN bar fixed at the bottom of the screen (decided by @thierry on
   * 19 September 2026), replacing the 294 px card.
   *
   * An in-flow bar at the top was tried first and measured at 375 × 812 on a
   * production build: the consent lives in localStorage, so the server cannot
   * know whether to render it. Rendered by the server, it was removed after
   * hydration for every returning visitor (layout shift 0.2155); on a first
   * visit, the web font swap made its text wrap one more line and pushed the
   * whole page down (0.1399). A fixed bar moves nothing: its contribution to
   * layout shift is nil by construction, and the reserve above keeps it from
   * covering the end of the page.
   *
   * Refuser coûte exactement autant qu'accepter : deux boutons de même taille,
   * côte à côte, au même niveau. L'écran « Personnaliser » est retiré : il ne
   * portait qu'une case analyse et une case marketing, et aucun traceur
   * marketing n'existe (les seules dépendances de mesure sont
   * `@vercel/analytics` et `@vercel/speed-insights`). Accepter n'accorde que
   * la mesure d'audience ; `marketing` reste écrit à `false` pour que le
   * format stocké et la base ne changent pas.
   */
  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      data-testid="consent-banner"
      data-lifted-for-bottom-bar={String(liftedForBottomBar)}
      /*
       * Bottom offset. Above the tab bar, the bar rests exactly on it: the tab
       * bar is 3 rem plus the safe-area inset, and it hides at `xl:` — so the
       * lift is released at `xl:` too, never earlier (the fault PR #293 fixed
       * on the other space compensations). Without the tab bar, the bar sits
       * on the screen edge and pads itself by the safe-area inset.
       */
      className={[
        'border-border bg-card fixed inset-x-0 z-50 border-t shadow-lg',
        liftedForBottomBar
          ? 'bottom-[calc(env(safe-area-inset-bottom)+3rem)] xl:bottom-0 xl:pb-[env(safe-area-inset-bottom)]'
          : 'bottom-0 pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:py-3 md:px-6">
        <h2 id="consent-title" className="sr-only">
          {t('title')}
        </h2>
        <p id="consent-body" className="text-muted-foreground flex-1 text-sm">
          {t.rich('body', {
            link: (chunks) => (
              <Link href="/legal/cookies" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:w-auto sm:shrink-0">
          <button
            type="button"
            onClick={() => accept(false, false)}
            className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 min-h-11 rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('refuse')}
          </button>
          <button
            type="button"
            onClick={() => accept(true, false)}
            className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 min-h-11 rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
