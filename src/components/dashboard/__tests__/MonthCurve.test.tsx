import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MonthCurve, type MonthCurveProps } from '../MonthCurve';

/**
 * La courbe du mois — **la moitié « états »**.
 *
 * La géométrie est prouvée ailleurs (`month-curve-geometry.test.ts`, 21 cas).
 * Ici on tient ce que la géométrie ne peut pas tenir : la couleur n'est jamais
 * seule, le tracé s'accorde au chiffre du hero, rien ne part en `style` inline,
 * et la projection n'apparaît pas quand elle n'existe pas.
 *
 * **L'assertion qui justifie le fichier** est celle de l'accord hero ↔ courbe.
 * `month-situation.ts` le dit de sa propre main : deux calculs de la même somme
 * finissent toujours par diverger. Une courbe figée à côté d'un nombre qui
 * bouge est cette maladie à l'écran.
 */

const serieLineaire = (jusquA: number, parJour: number) =>
  Array.from({ length: jusquA }, (_, i) => ({ jour: i + 1, cumule: parJour * (i + 1) }));

const labels: MonthCurveProps['labels'] = {
  aria: '250 € dépensés sur 1 000 € de budget, au jour 10 sur 31.',
  reel: 'Dépensé',
  rythme: 'Rythme régulier',
  projection: 'Estimation',
  verdict: 'dans le rythme',
};

const base: MonthCurveProps = {
  serie: serieLineaire(10, 25),
  joursEcoules: 10,
  joursDuMois: 31,
  budgetDuMois: 1000,
  depensesDuMois: 250,
  projection: null,
  labels,
};

/** Dernier couple de coordonnées d'un chemin SVG. */
function dernierPoint(testId: string) {
  const d = screen.getByTestId(testId).getAttribute('d') ?? '';
  const points = [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  const dernier = points.at(-1);
  return { x: Number(dernier?.[1]), y: Number(dernier?.[2]) };
}

const cheminDe = (testId: string) => screen.getByTestId(testId).getAttribute('d');

describe('MonthCurve — l’accord avec le chiffre du hero', () => {
  it('fait finir le tracé sur « Dépensé ce mois » reçu, jamais sur la somme de la série', () => {
    // La série s'arrête à 250 ; le hero, lui, affiche 400 — c'est ce qui se
    // passe pendant une saisie optimiste, avant l'aller-retour serveur. Le
    // tracé doit suivre le chiffre AFFICHÉ, sinon l'écran se contredit sur la
    // seule question qu'il pose.
    const { unmount } = render(<MonthCurve {...base} depensesDuMois={400} />);
    const avecOptimiste = cheminDe('month-curve-line');
    unmount();

    // La même image, obtenue par une série qui vaut réellement 400 : les deux
    // chemins doivent être IDENTIQUES. Comparer à un attendu recopié à la main
    // ne prouverait que ma capacité à recopier.
    render(
      <MonthCurve
        {...base}
        serie={[...serieLineaire(9, 25), { jour: 10, cumule: 400 }]}
        depensesDuMois={400}
      />,
    );
    expect(cheminDe('month-curve-line')).toBe(avecOptimiste);
  });

  it('change de tracé quand le chiffre affiché change', () => {
    // La preuve négative du cas précédent : sans elle, une implémentation qui
    // IGNORE `depensesDuMois` passerait le premier test.
    const { unmount } = render(<MonthCurve {...base} depensesDuMois={250} />);
    const a = cheminDe('month-curve-line');
    unmount();
    render(<MonthCurve {...base} depensesDuMois={900} />);
    expect(cheminDe('month-curve-line')).not.toBe(a);
  });

  it('ne déplace que le dernier point, jamais les jours déjà passés', () => {
    const { unmount } = render(<MonthCurve {...base} depensesDuMois={250} />);
    const debut = (cheminDe('month-curve-line') ?? '').split('L')[0];
    unmount();
    render(<MonthCurve {...base} depensesDuMois={900} />);
    expect((cheminDe('month-curve-line') ?? '').split('L')[0]).toBe(debut);
  });
});

describe('MonthCurve — les trois états, et la couleur jamais seule', () => {
  it.each([
    ['dans-le-rythme', 200, 'dans le rythme'],
    ['au-dessus', 500, 'au-dessus du rythme'],
    ['depasse', 1200, 'budget dépassé'],
  ])('rend l’état %s', (etat, depensesDuMois, verdict) => {
    render(
      <MonthCurve {...base} depensesDuMois={depensesDuMois} labels={{ ...labels, verdict }} />,
    );
    expect(screen.getByTestId('month-curve')).toHaveAttribute('data-etat', etat);
    // L'état est lisible SANS la couleur : le verdict est écrit en toutes
    // lettres à côté du tracé.
    expect(screen.getByTestId('month-curve-verdict')).toHaveTextContent(verdict);
  });

  it.each([
    ['dans-le-rythme', 200, 'var(--color-brand-text)'],
    ['au-dessus', 500, 'var(--color-warning)'],
    ['depasse', 1200, 'var(--color-danger)'],
  ])('peint l’état %s avec son jeton, et pas un autre', (_etat, depensesDuMois, jeton) => {
    // `--color-danger` UNIQUEMENT une fois le budget réellement dépassé : un
    // seul niveau d'alarme par écran, et il appartient au dépassement. Aller
    // plus vite que le mois est un fait, pas une alarme. Doctrine reprise de
    // `PaceBar` ; sans cette assertion, une implémentation qui peindrait tout
    // de la même teinte passerait les cas d'état ci-dessus.
    render(<MonthCurve {...base} depensesDuMois={depensesDuMois} />);
    expect(screen.getByTestId('month-curve-line')).toHaveAttribute('stroke', jeton);
  });

  it('laisse la référence de rythme neutre quel que soit l’état', () => {
    // Elle décrit le calendrier, pas la dépense : la teindre en rouge lui
    // ferait dire quelque chose sur un mois dont elle ne sait rien.
    render(<MonthCurve {...base} depensesDuMois={1200} />);
    expect(screen.getByTestId('month-curve-pace')).toHaveAttribute(
      'stroke',
      'var(--color-muted-foreground)',
    );
  });

  it('nomme les trois tracés, pour qu’ils ne se distinguent pas par la seule couleur', () => {
    render(<MonthCurve {...base} projection={800} />);
    expect(screen.getByText(labels.reel)).toBeInTheDocument();
    expect(screen.getByText(labels.rythme)).toBeInTheDocument();
    expect(screen.getByText(labels.projection)).toBeInTheDocument();
  });

  it('n’annonce pas l’estimation dans la légende quand il n’y en a pas', () => {
    render(<MonthCurve {...base} projection={null} />);
    expect(screen.queryByText(labels.projection)).not.toBeInTheDocument();
  });

  it('omet le verdict plutôt que d’en inventer un', () => {
    // Budget non positif : aucune proportion à énoncer. Le hero porte déjà le
    // constat, et une puce vide vaut mieux qu'un jugement fabriqué.
    render(<MonthCurve {...base} budgetDuMois={0} labels={{ ...labels, verdict: null }} />);
    expect(screen.queryByTestId('month-curve-verdict')).not.toBeInTheDocument();
  });
});

describe('MonthCurve — la projection', () => {
  it('trace la continuation et son point terminal quand elle existe', () => {
    render(<MonthCurve {...base} projection={775} />);
    expect(screen.getByTestId('month-curve-projection')).toBeInTheDocument();
    expect(screen.getByTestId('month-curve-projection-end')).toBeInTheDocument();
  });

  it('ne trace rien avant le septième jour', () => {
    // ADR-035 : `epargneEstimee` vaut `null` tant que `joursEcoules < 7`. Le
    // composant reçoit alors `projection: null` et ne comble pas la place.
    render(
      <MonthCurve {...base} serie={serieLineaire(3, 25)} joursEcoules={3} projection={null} />,
    );
    expect(screen.queryByTestId('month-curve-projection')).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-curve-projection-end')).not.toBeInTheDocument();
  });

  it('part du dernier point du réel, pas d’ailleurs', () => {
    render(<MonthCurve {...base} projection={775} />);
    const fin = dernierPoint('month-curve-line');
    const d = screen.getByTestId('month-curve-projection').getAttribute('d') ?? '';
    expect(d.startsWith(`M ${fin.x} ${fin.y}`)).toBe(true);
  });
});

describe('MonthCurve — la référence de rythme et les échéances', () => {
  it('trace la référence quand le budget est positif', () => {
    render(<MonthCurve {...base} />);
    expect(screen.getByTestId('month-curve-pace')).toBeInTheDocument();
  });

  it.each([0, -250])('efface la référence quand le budget vaut %s', (budgetDuMois) => {
    render(<MonthCurve {...base} budgetDuMois={budgetDuMois} />);
    expect(screen.queryByTestId('month-curve-pace')).not.toBeInTheDocument();
  });

  it('marque une échéance par jour fourni', () => {
    render(<MonthCurve {...base} billDays={[5, 20]} />);
    expect(screen.getByTestId('month-curve-bill-5')).toBeInTheDocument();
    expect(screen.getByTestId('month-curve-bill-20')).toBeInTheDocument();
  });

  it('ne marque rien quand aucune échéance n’est fournie', () => {
    const { container } = render(<MonthCurve {...base} />);
    expect(container.querySelectorAll('[data-testid^="month-curve-bill-"]')).toHaveLength(0);
  });
});

describe('MonthCurve — CSP, accessibilité et WebKit', () => {
  it('ne porte aucun attribut `style`', () => {
    // `style-src 'self' 'nonce-…'` ne porte pas `'unsafe-inline'` : un attribut
    // `style` est supprimé en production et la forme disparaît. Toute la
    // géométrie voyage par des attributs SVG.
    const { container } = render(<MonthCurve {...base} projection={800} billDays={[5]} />);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('se nomme en phrase complète pour un lecteur d’écran', () => {
    render(<MonthCurve {...base} />);
    expect(screen.getByRole('img', { name: labels.aria })).toBeInTheDocument();
  });

  it('porte sa hauteur en ATTRIBUT, pas en chaîne Tailwind', () => {
    // Quirk WebKit < 17.4 documenté sur `PaceBar` et `AllocationBar` : une
    // hauteur d'enfant résolue en pourcentage d'un parent construit à partir
    // d'une propriété personnalisée peut s'effondrer à 0, et le tracé devient
    // invisible sans qu'aucun test de logique ne bouge.
    const { container } = render(<MonthCurve {...base} />);
    expect(container.querySelector('svg')).toHaveAttribute('height');
  });

  it('garde une épaisseur de trait constante malgré l’étirement', () => {
    // Le SVG s'étire à la largeur de la carte avec `preserveAspectRatio="none"`.
    // Sans `vector-effect`, l'épaisseur du trait s'étire avec lui : la courbe
    // devient un ruban horizontal écrasé sur un grand écran, et un fil sur un
    // petit. Aucun test de logique ne le verrait.
    render(<MonthCurve {...base} projection={775} />);
    for (const id of ['month-curve-line', 'month-curve-pace', 'month-curve-projection']) {
      expect(screen.getByTestId(id)).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    }
  });

  it('survit à un mois de zéro jour sans rien tracer', () => {
    render(<MonthCurve {...base} serie={[]} joursEcoules={0} joursDuMois={0} />);
    expect(screen.getByTestId('month-curve')).toBeInTheDocument();
    expect(screen.queryByTestId('month-curve-line')).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-curve-pace')).not.toBeInTheDocument();
  });
});
