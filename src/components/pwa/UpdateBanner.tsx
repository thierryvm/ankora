'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import { useConsentBannerPending } from '@/components/gdpr/ConsentBanner';
import {
  appliquerMiseAJour,
  getServerSnapshot,
  getSnapshot,
  reporterMiseAJour,
  subscribe,
} from '@/lib/pwa/update-store';

export type UpdateBannerProps = {
  /**
   * La `BottomTabBar` est-elle montée pour cette requête ?
   *
   * Même contrat que `ConsentBanner.liftedForBottomBar` et pour la même raison :
   * la barre est `fixed`, donc aucune réserve en `padding-bottom` sur `body` ne
   * la déplace. Sans ce décalage, ce bandeau la recouvrirait — c'est exactement
   * ce qui s'est produit avec la bannière de consentement (#302).
   */
  liftedForBottomBar?: boolean;
};

/**
 * « Une nouvelle version est disponible » — la seule façon, dans une PWA
 * installée, d'apprendre qu'il faut recharger.
 *
 * Opaque, jamais translucide : `bg-card` + `border-border` + `shadow-lg`, comme
 * la bannière de consentement. Rien à auditer côté verre.
 */
export function UpdateBanner({ liftedForBottomBar = false }: UpdateBannerProps = {}) {
  const t = useTranslations('pwa.update');
  const { miseAJourDisponible } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const consentementEnAttente = useConsentBannerPending();

  // La bannière de consentement est bloquante par nature et se peint au même
  // endroit. On attend qu'elle ait sa réponse plutôt que d'empiler deux
  // dialogues sur le même bord d'écran.
  if (!miseAJourDisponible || consentementEnAttente) return null;

  return (
    <div
      role="status"
      data-testid="pwa-update-banner"
      className={[
        'bg-card border-border fixed right-4 left-4 z-40 rounded-lg border p-3 shadow-lg',
        liftedForBottomBar
          ? 'bottom-[calc(env(safe-area-inset-bottom)+4rem)] xl:bottom-4'
          : 'bottom-[calc(env(safe-area-inset-bottom)+1rem)]',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-foreground flex items-center gap-2 text-sm font-medium">
          <RefreshCw aria-hidden className="text-brand-600 h-4 w-4 shrink-0" strokeWidth={1.5} />
          {t('title')}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="pwa-update-later"
            onClick={reporterMiseAJour}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 min-h-11 rounded-md px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('later')}
          </button>
          <button
            type="button"
            data-testid="pwa-update-reload"
            onClick={appliquerMiseAJour}
            className="bg-brand-700 text-primary-foreground focus-visible:ring-brand-600 min-h-11 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('reload')}
          </button>
        </div>
      </div>
    </div>
  );
}
