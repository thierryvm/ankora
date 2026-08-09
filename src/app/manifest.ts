import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    lang: SITE.defaultLocale,
    /**
     * L'identité de l'application installée, épinglée AVANT de bouger `start_url`.
     *
     * Sans `id`, l'identité d'une PWA **est** son `start_url`. Changer l'un
     * changeait donc l'autre — et un navigateur qui ne reconnaît plus
     * l'application n'applique pas la mise à jour du manifeste à l'installation
     * existante : il y voit une autre application. Le correctif ci-dessous
     * n'aurait alors atteint personne d'installé.
     *
     * `'/'` est exactement la valeur que les navigateurs avaient calculée
     * jusqu'ici, donc l'identité historique est préservée telle quelle. Ne pas
     * la faire suivre `start_url` : ce serait rouvrir le même piège au prochain
     * changement.
     *
     * Ajouté le 9 août 2026, après relecture. Sur iOS, un raccourci déjà posé
     * peut malgré tout conserver l'ancienne configuration — si l'icône continue
     * d'ouvrir la page d'accueil après déploiement, la supprimer et la
     * re-ajouter est le geste qui tranche. Non mesuré ici : le comportement
     * exact d'iOS sur ce point n'a pas pu être vérifié depuis cette machine.
     */
    id: '/',
    /**
     * L'icône installée mène au cockpit, pas à la vitrine.
     *
     * Elle valait `'/'`, la page marketing. Mesuré le 8 août 2026 : la page
     * d'accueil n'a **aucun garde de session**, donc un utilisateur connecté qui
     * demandait `/` y restait. L'application installée s'ouvrait sur la vitrine,
     * et il fallait un geste de plus pour atteindre le cockpit — à chaque
     * ouverture, sur les deux intentions quotidiennes.
     *
     * Des deux corrections envisagées, c'est la seule qui puisse porter sur
     * iPhone : Safari ne supporte ni les raccourcis de manifeste (`shortcuts`)
     * ni le menu contextuel d'une web app installée. Un raccourci n'aurait rien
     * changé pour l'utilisateur principal. Voir toutefois la réserve sur `id`
     * ci-dessus : « peut porter » n'est pas « portera d'office sur un raccourci
     * déjà posé ».
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
