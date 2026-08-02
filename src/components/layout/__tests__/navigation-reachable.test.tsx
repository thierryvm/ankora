import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * À TOUTE largeur de fenêtre, un utilisateur connecté doit avoir au moins un
 * chemin de navigation à l'écran.
 *
 * Trois défauts de la même famille en trois semaines, aucun couvert par un
 * test : la bannière de consentement qui recouvrait « Se connecter » sur
 * iPhone, le CTA cockpit invisible sous 640 px, et — mesuré le 2026-08-02
 * depuis une PWA installée — une bande de **256 px** (768 à 1023) où la barre
 * d'onglets était déjà partie et la nav du header pas encore arrivée. Aucune
 * navigation du tout, sur tous les écrans de l'app.
 *
 * Le correctif de l'un de ces trous ne ferme pas la classe. Ce test la ferme,
 * parce qu'il ne teste pas une largeur : il vérifie que la **réunion** des
 * intervalles de visibilité recouvre l'axe entier. Un trou de 1 px échoue au
 * même titre qu'un trou de 256.
 *
 * Pourquoi lire la source plutôt que rendre les composants : jsdom n'évalue pas
 * les media queries — `matchMedia` y est un bouchon, tout `lg:` y est donc
 * invisible et une assertion sur le DOM rendu ne pourrait pas échouer. Un
 * balayage e2e mesurerait le vrai pixel mais par ÉCHANTILLONS ; il resterait
 * aveugle entre deux largeurs testées. Ici on prouve la couverture, on ne
 * l'échantillonne pas.
 */

/** Points de rupture Tailwind 4 par défaut — `globals.css` n'en redéfinit aucun. */
const BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** Intervalle de largeurs `[min, max)` sur lequel une surface est à l'écran. */
type Intervalle = { min: number; max: number };

/**
 * `<prefixe>:hidden` sur un élément visible par défaut → visible de 0 au point
 * de rupture, exclu.
 */
function visibleJusqua(className: string, quoi: string): Intervalle {
  const m = className.match(/(?:^|\s)(sm|md|lg|xl|2xl):hidden(?:\s|$)/);
  expect(
    m,
    `${quoi} : aucune classe de masquage trouvée — la sonde regarde ailleurs`,
  ).not.toBeNull();
  return { min: 0, max: BREAKPOINTS[m![1]!]! };
}

/**
 * `hidden` + `<prefixe>:flex` → invisible avant le point de rupture, visible à
 * partir de lui.
 */
function visibleAPartirDe(className: string, quoi: string): Intervalle {
  expect(className, `${quoi} : pas de \`hidden\` de base`).toMatch(/(?:^|\s)hidden(?:\s|$)/);
  const m = className.match(/(?:^|\s)(sm|md|lg|xl|2xl):flex(?:\s|$)/);
  expect(
    m,
    `${quoi} : aucune classe de révélation trouvée — la sonde regarde ailleurs`,
  ).not.toBeNull();
  return { min: BREAKPOINTS[m![1]!]!, max: Number.POSITIVE_INFINITY };
}

/**
 * Extrait le `className` littéral d'un élément repéré par un attribut ancre.
 * Échoue bruyamment si l'ancre a disparu : une sonde qui ne trouve plus sa
 * cible doit casser le test, jamais le rendre vert par défaut.
 */
function classNameDe(source: string, ancre: string, quoi: string): string {
  const i = source.indexOf(ancre);
  expect(i, `${quoi} : ancre \`${ancre}\` introuvable dans la source`).toBeGreaterThan(-1);
  const apres = source.slice(i);
  const m = apres.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
  expect(m, `${quoi} : aucun className après l'ancre`).not.toBeNull();
  return (m![1] ?? m![2] ?? '').replace(/\s+/g, ' ').trim();
}

/** Les intervalles couvrent-ils `[0, ∞)` sans trou ? Rend le trou, ou `null`. */
function trouDeCouverture(intervalles: Intervalle[]): Intervalle | null {
  const tries = [...intervalles].sort((a, b) => a.min - b.min);
  let atteint = 0;
  for (const i of tries) {
    if (i.min > atteint) return { min: atteint, max: i.min };
    atteint = Math.max(atteint, i.max);
  }
  return atteint === Number.POSITIVE_INFINITY
    ? null
    : { min: atteint, max: Number.POSITIVE_INFINITY };
}

describe('un utilisateur connecté a toujours un chemin de navigation', () => {
  const barre = classNameDe(
    read('src/components/layout/BottomTabBar.tsx'),
    'data-testid="bottom-tab-bar"',
    'barre d’onglets basse',
  );
  const navHeader = classNameDe(
    read('src/components/layout/Header.tsx'),
    "aria-label={t('nav.appLabel')}",
    'nav applicative du header',
  );

  const surfaces = [
    { nom: 'barre d’onglets basse', intervalle: visibleJusqua(barre, 'barre d’onglets basse') },
    {
      nom: 'nav applicative du header',
      intervalle: visibleAPartirDe(navHeader, 'nav applicative du header'),
    },
  ];

  it('les deux surfaces se relaient sans laisser un seul pixel de largeur à découvert', () => {
    const trou = trouDeCouverture(surfaces.map((s) => s.intervalle));
    expect(
      trou,
      trou
        ? `Plage morte de ${trou.max - trou.min} px : de ${trou.min} px à ${trou.max - 1} px inclus, ` +
            `aucune surface de navigation n'est à l'écran. Surfaces : ` +
            surfaces.map((s) => `${s.nom} [${s.intervalle.min}, ${s.intervalle.max})`).join(' ; ')
        : '',
    ).toBeNull();
  });

  it('les deux surfaces se relaient au MÊME point de rupture', () => {
    // Plus strict que « pas de trou », et volontairement : un recouvrement
    // signifierait deux navigations simultanées à l'écran, l'anti-pattern que
    // `HeaderNav` documente déjà. Sans trou ET sans recouvrement, il ne reste
    // qu'une couture — la seule forme où aucune des deux ne peut partir avant
    // que l'autre arrive.
    const [barreI, navI] = surfaces.map((s) => s.intervalle);
    expect(barreI!.max).toBe(navI!.min);
  });

  /**
   * Tout ce qui réserve de la place pour la barre doit la libérer AU MÊME
   * endroit qu'elle. Libérer plus tôt fait passer du contenu derrière la barre
   * — c'est ce qui aurait caché le lien cookies exigé par le RGPD art. 7(3)
   * pendant toute la bande 768–1023.
   */
  it('tout ce qui réserve de la place sous la barre la libère au même point', () => {
    const seuil = surfaces[0]!.intervalle.max;
    const nomSeuil = Object.keys(BREAKPOINTS).find((k) => BREAKPOINTS[k] === seuil);

    const compensations = [
      {
        quoi: 'padding bas du footer',
        source: 'src/components/layout/Footer.tsx',
        motif: /(sm|md|lg|xl|2xl):pb-10/,
      },
      {
        quoi: 'padding du main /app',
        source: 'src/app/[locale]/app/layout.tsx',
        motif: /(sm|md|lg|xl|2xl):py-12/,
      },
      {
        quoi: 'offset bas du bouton « haut de page »',
        source: 'src/components/layout/ScrollToTop.tsx',
        motif: /(sm|md|lg|xl|2xl):bottom-\[/,
      },
    ];

    for (const c of compensations) {
      const m = read(c.source).match(c.motif);
      expect(m, `${c.quoi} : compensation introuvable dans ${c.source}`).not.toBeNull();
      expect(
        BREAKPOINTS[m![1]!],
        `${c.quoi} se libère à \`${m![1]}\` alors que la barre disparaît à \`${nomSeuil}\``,
      ).toBe(seuil);
    }
  });
});
