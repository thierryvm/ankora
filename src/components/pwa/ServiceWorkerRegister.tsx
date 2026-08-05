'use client';

import { useEffect } from 'react';

import { signalerMiseAJour, surControllerChange } from '@/lib/pwa/update-store';

/**
 * Enregistre `/sw.js` en production, puis surveille les mises à jour.
 *
 * ## Ce qui manquait
 *
 * Ce composant se contentait de `register()`. Rien n'appelait
 * `registration.update()`, rien n'écoutait `updatefound`, et l'interface n'avait
 * aucun moyen d'apprendre qu'une version attendait. Dans une PWA installée
 * (`display: standalone`), iOS supprime la barre d'adresse et le
 * tirer-pour-rafraîchir : l'utilisateur n'avait donc **aucun** chemin vers une
 * mise à jour. Rapporté par @thierry le 2026-08-05.
 *
 * ## Le retour de visibilité est le seul moment utile
 *
 * Une PWA suspendue puis reprise ne recharge pas son document : `register()`
 * n'est jamais rappelé et aucun code neuf n'entre. Interroger le serveur au
 * moment où l'application redevient visible est le seul instant où elle peut
 * découvrir un déploiement.
 */

/** Au plus une interrogation par minute — reprendre l'app ne doit pas marteler. */
const INTERVALLE_MIN_MS = 60_000;

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let annule = false;
    let registration: ServiceWorkerRegistration | null = null;
    let derniereVerification = 0;

    /**
     * Un worker installé signale une mise à jour **seulement** s'il en remplace
     * un autre. Sans le test du contrôleur, la toute première installation
     * serait annoncée comme une mise à jour — à un visiteur qui n'a rien
     * installé, dont le clic rechargerait la page sans raison.
     */
    const suivre = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const surEtat = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          if (!annule && registration) signalerMiseAJour(registration);
        }
        // `installed` et `redundant` sont terminaux : au-delà, cet écouteur ne
        // peut plus rien apprendre. `redundant` signifie une installation
        // échouée — il n'y a rien à annoncer.
        if (worker.state === 'installed' || worker.state === 'redundant') {
          worker.removeEventListener('statechange', surEtat);
        }
      };
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        if (!annule && registration) signalerMiseAJour(registration);
        return;
      }
      worker.addEventListener('statechange', surEtat);
    };

    const surVisibilite = () => {
      if (document.visibilityState !== 'visible') return;
      const maintenant = Date.now();
      if (maintenant - derniereVerification < INTERVALLE_MIN_MS) return;
      derniereVerification = maintenant;
      // `update()` REJETTE hors ligne. Sans ce `catch`, chaque reprise en
      // tunnel produirait un rejet non géré — du bruit permanent qui finit par
      // faire ignorer la console.
      registration?.update().catch(() => undefined);
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (annule) return;
          registration = reg;

          // Une version peut déjà attendre — l'utilisateur a ouvert l'app deux
          // fois sans la recharger.
          if (reg.waiting && navigator.serviceWorker.controller) signalerMiseAJour(reg);

          // Et une installation peut être DÉJÀ EN COURS, lancée par un
          // chargement précédent : `updatefound` a alors déjà eu lieu et ne
          // refera pas feu. Sans cette branche, la détection serait morte en
          // silence — exactement le genre de panne muette que ce chantier
          // existe pour supprimer.
          suivre(reg.installing);

          reg.addEventListener('updatefound', () => suivre(reg.installing));
          derniereVerification = Date.now();
          document.addEventListener('visibilitychange', surVisibilite);
        })
        .catch(() => {
          /* le worker est un confort, jamais un bloqueur de démarrage */
        });
    };

    navigator.serviceWorker.addEventListener('controllerchange', surControllerChange);

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });

    return () => {
      annule = true;
      window.removeEventListener('load', onLoad);
      document.removeEventListener('visibilitychange', surVisibilite);
      navigator.serviceWorker.removeEventListener('controllerchange', surControllerChange);
    };
  }, []);

  return null;
}
