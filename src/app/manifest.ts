import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    lang: SITE.defaultLocale,
    /**
     * L'icône installée mène au cockpit, pas à la vitrine.
     *
     * Elle valait `'/'`, la page marketing. Mesuré le 8 août 2026 : la page
     * d'accueil n'a **aucun garde de session**, donc un utilisateur connecté qui
     * demandait `/` y restait. L'application installée s'ouvrait sur la vitrine,
     * et il fallait un geste de plus pour atteindre le cockpit — à chaque
     * ouverture, sur les deux intentions quotidiennes.
     *
     * C'est la seule correction qui porte sur iPhone : Safari ne supporte ni les
     * raccourcis de manifeste (`shortcuts`) ni le menu contextuel d'une web app
     * installée. Un raccourci n'aurait rien changé pour l'utilisateur principal.
     *
     * Sans danger pour un visiteur non connecté : `requireUser()` le renvoie
     * vers `/login`, ce qui est le comportement attendu d'une application
     * installée. Et hors ligne, `public/sw.js` traite toute navigation par le
     * réseau avec `/offline` pour seul repli — inchangé par cette valeur.
     */
    start_url: '/app',
    /**
     * La portée reste `/`, volontairement plus large que `start_url` : depuis
     * l'application installée, le pied de page mène à la FAQ, au glossaire et
     * aux pages légales. Une portée réduite à `/app` ferait sortir chacun de ces
     * liens vers le navigateur.
     */
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: SITE.background,
    theme_color: SITE.themeColor,
    categories: ['finance', 'productivity', 'lifestyle'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
