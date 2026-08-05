'use client';

import { useEffect, useRef } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { reloadPage } from '@/lib/browser/reload';
import { useAnalyticsConsent } from './ConsentBanner';

/**
 * Les deux traceurs Vercel, montés UNIQUEMENT sur consentement analytics.
 *
 * ## Ce que le gate change réellement
 *
 * Ces composants ne rendent aucune balise côté serveur : ils injectent leur
 * script impérativement dans `document.head`, depuis un effet, et le font quel
 * que soit l'environnement — seule l'URL du script diffère hors production.
 * « Absent du HTML initial » était donc déjà vrai avant ce fichier et ne prouve
 * rien. Ce que le gate obtient, c'est que le script ne soit **pas injecté du
 * tout** tant que le consentement n'est pas accordé.
 *
 * ## Démonter ne suffit pas
 *
 * Aucun des deux effets n'a de fonction de nettoyage : après démontage, la
 * balise reste dans `document.head` et `window.va` / `window.si` restent
 * définis. Le script a instrumenté la navigation, il continue d'émettre. Seul
 * un document neuf arrête la mesure — d'où le rechargement.
 *
 * ## Trois états, pas deux
 *
 *   accordé            → monte
 *   refus enregistré   → démonte ET recharge, si les traceurs avaient chargé
 *   décision effacée   → démonte, sans recharger
 *
 * La décision effacée vient du lien « gérer mes préférences » (pied de page,
 * pied de page marketing, feuille « Plus »), qui ne révoque rien : le
 * consentement tient juridiquement jusqu'à la décision suivante. Les deux
 * chemins qui révoquent réellement — la bascule et la réinitialisation de
 * `/app/settings` — rechargent eux-mêmes, après leur action serveur. Le gate ne
 * peut pas les distinguer d'une simple réouverture, et il n'a pas à essayer.
 */
export function ConsentGatedAnalytics() {
  const consentement = useAnalyticsConsent();
  const avaitCharge = useRef(false);

  useEffect(() => {
    if (consentement === true) {
      avaitCharge.current = true;
      return;
    }
    // Décision effacée : on démonte, on ne recharge pas. Ce `return` est AVANT
    // la remise à zéro de `avaitCharge` — sans quoi la chaîne
    // « accordé → effacé → refusé » perdrait la mémoire du chargement et ne
    // rechargerait jamais. Un cas de test verrouille cet ordre.
    //
    // Corollaire : cette `ref` ne survit à l'étape « décision effacée » que
    // parce que ce composant est monté INCONDITIONNELLEMENT dans le layout. Un
    // futur `{cond && <ConsentGatedAnalytics />}` la réinitialiserait, et ce
    // cas de test cesserait de prouver quoi que ce soit — en silence.
    if (consentement === null) return;
    if (!avaitCharge.current) return;
    avaitCharge.current = false;
    reloadPage();
  }, [consentement]);

  if (consentement !== true) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
