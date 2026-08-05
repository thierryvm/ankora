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
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
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

  const hasDecided = snap.stored !== null;
  const shouldShow = !dismissed && (!hasDecided || snap.reopen);

  /**
   * Réserve, dans le flux, la hauteur que la bannière occupe en `fixed`.
   *
   * Sans cela la bannière recouvre le contenu et **intercepte les clics** : sur
   * `/login`, le bouton « Se connecter » finit à `y = 498` alors que la bannière
   * commence à `hauteurViewport − 16 − hauteurBannière`. Mesuré le 2026-07-31 :
   * bloqué sur TOUS les presets iPhone (SE 320×568, 12/14 390×664, 15 Pro Max
   * 430×739) et sur Galaxy S9+ ; à 390 px de large, bloqué jusqu'à 780 px de
   * haut, cliquable à partir de 790. Les conteneurs d'auth sont `min-h-dvh`,
   * donc la page n'avait **aucune marge de défilement** : le bouton était
   * visible, activé, stable — et hors d'atteinte.
   *
   * La hauteur est mesurée plutôt que devinée : la bannière va de 272 à 378 px
   * selon le retour à la ligne, et elle est d'autant plus haute que l'écran est
   * étroit — le pire cas est le plus petit écran. `globals.css` consomme la
   * variable en `padding-bottom` sur `body`.
   */
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!shouldShow || !el) {
      root.style.removeProperty('--consent-height');
      return;
    }
    // La réserve est la distance du BAS du viewport au HAUT de la bannière —
    // pas `offsetHeight + 16`. Cette dernière forme codait en dur le décalage
    // `bottom-4` et devenait fausse dès que la bannière se relevait au-dessus de
    // la BottomTabBar (`liftedForBottomBar`). Mesurer la position réelle rend la
    // réserve juste quel que soit le décalage appliqué, aujourd'hui et après le
    // prochain changement de classe. La bannière étant `fixed`, son `top` ne
    // dépend pas du padding de `body` : pas de boucle avec le ResizeObserver.
    const apply = () =>
      root.style.setProperty(
        '--consent-height',
        `${Math.round(window.innerHeight - el.getBoundingClientRect().top)}px`,
      );
    apply();
    // La mesure dépend désormais de `window.innerHeight`, que le ResizeObserver
    // de la bannière ne voit pas : une rotation d'écran, ou la barre d'URL
    // mobile qui se replie, change la hauteur du viewport sans changer celle de
    // la bannière. Sans cet écouteur la réserve resterait figée sur l'ancienne
    // hauteur — précisément le genre de décalage silencieux que ce bloc existe
    // pour empêcher.
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    const detachViewport = () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
    // jsdom (Vitest) n'implémente pas ResizeObserver : la réserve est posée une
    // fois, elle ne suit simplement pas les changements de hauteur. Suffisant
    // pour les tests unitaires, et le comportement navigateur reste complet.
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        detachViewport();
        root.style.removeProperty('--consent-height');
      };
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      detachViewport();
      ro.disconnect();
      root.style.removeProperty('--consent-height');
    };
  }, [shouldShow, customizing]);

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

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      data-testid="consent-banner"
      data-lifted-for-bottom-bar={String(liftedForBottomBar)}
      /*
       * Décalage bas — même arithmétique que `ScrollToTop`, et pour le même
       * motif : la barre d'onglets mesure `h-12` (3 rem) plus
       * `env(safe-area-inset-bottom)`. On lève donc la bannière de 4 rem au-dessus
       * de l'inset, ce qui laisse 1 rem d'air entre le bas de la bannière et le
       * haut de la barre (mesuré : 15 px avec un inset de 34 px, 16 px sans).
       *
       * Le décalage se relâche à `xl:`, EN MÊME TEMPS que la barre se cache
       * (`xl:hidden` sur `BottomTabBar`). Le relâcher plus tôt reposerait la
       * bannière sur une barre encore affichée — c'est exactement la faute que
       * la PR #293 a dû corriger sur les autres compensations d'espace.
       */
      className={[
        'border-border bg-card fixed inset-x-4 z-50 mx-auto max-w-3xl rounded-xl border p-5 shadow-lg md:inset-x-auto md:left-1/2 md:-translate-x-1/2',
        liftedForBottomBar
          ? 'bottom-[calc(env(safe-area-inset-bottom)+4rem)] xl:bottom-4'
          : 'bottom-4',
      ].join(' ')}
    >
      <h2 id="consent-title" className="text-base font-semibold">
        {t('title')}
      </h2>
      <p id="consent-body" className="text-muted-foreground mt-2 text-sm">
        {t.rich('body', {
          link: (chunks) => (
            <Link href="/legal/cookies" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>

      {customizing ? (
        <div className="mt-4 flex flex-col gap-3">
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">{t('customize.legend')}</legend>

            <label className="border-border flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked
                disabled
                aria-label={t('customize.essentialLabel')}
                className="text-brand-700 mt-0.5 h-4 w-4"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {t('customize.essentialLabel')}{' '}
                  <span className="text-muted-foreground text-xs font-normal">
                    {t('customize.essentialBadge')}
                  </span>
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t('customize.essentialDescription')}
                </span>
              </span>
            </label>

            <label className="border-border flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                aria-label={t('customize.analyticsLabel')}
                className="text-brand-700 focus-visible:ring-brand-600 mt-0.5 h-4 w-4 focus-visible:ring-2 focus-visible:outline-none"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t('customize.analyticsLabel')}</span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t('customize.analyticsDescription')}
                </span>
              </span>
            </label>

            <label className="border-border flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                aria-label={t('customize.marketingLabel')}
                className="text-brand-700 focus-visible:ring-brand-600 mt-0.5 h-4 w-4 focus-visible:ring-2 focus-visible:outline-none"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{t('customize.marketingLabel')}</span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t('customize.marketingDescription')}
                </span>
              </span>
            </label>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => accept(analytics, marketing)}
              className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('customize.save')}
            </button>
            <button
              type="button"
              onClick={() => setCustomizing(false)}
              className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('customize.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => accept(false, false)}
            className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('essentialOnly')}
          </button>
          <button
            type="button"
            onClick={() => setCustomizing(true)}
            className="border-border hover:bg-brand-100 focus-visible:ring-brand-600 rounded-md border px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('customize.button')}
          </button>
          <button
            type="button"
            onClick={() => accept(true, true)}
            className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 rounded-md px-4 py-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('acceptAll')}
          </button>
        </div>
      )}
    </div>
  );
}
