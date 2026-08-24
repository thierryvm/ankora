import {
  CURVE_HEIGHT,
  CURVE_WIDTH,
  monthCurveGeometry,
  type CurvePoint,
} from './month-curve-geometry';

/**
 * La courbe du mois — **la moitié « états »** de `MonthCurve`.
 *
 * La géométrie vit dans `month-curve-geometry.ts` et se prouve sans DOM. Ce
 * fichier ne tient que ce qu'elle ne peut pas tenir : la couleur, les libellés,
 * la projection conditionnelle et le nom accessible.
 *
 * ## Ce qu'elle remplace
 *
 * `PaceBar`, dont elle reprend les trois états et la doctrine : **un seul
 * niveau d'alarme par écran**. Dépasser le budget est un fait grave et prend
 * `--color-danger` ; aller plus vite que le mois est un fait, pas une alarme, et
 * prend `--color-warning`. Elle ne dit jamais « tu dépenses trop » (R-06) : ce
 * n'est pas le travail de cet écran d'avoir un avis.
 *
 * Et elle corrige le défaut structurel de la barre : `PaceBar` **plafonnait**
 * son remplissage, donc un dépassement de 300 % ressemblait à un dépassement de
 * 1 %. Ici l'échelle s'ouvre et le dépassement se voit.
 *
 * ## L'accord avec le hero, et pourquoi il est une PROP et non un calcul
 *
 * Le tracé se termine sur le « Dépensé ce mois » **reçu**, jamais sur la somme
 * de la série. C'est la règle 10 de `CLAUDE.md` prise au sérieux : un total
 * descend avec ses composantes, il ne se recalcule pas à l'affichage. Deux
 * calculs de la même somme finissent toujours par diverger — `month-situation.ts`
 * le dit de sa propre main, et c'est la maladie que cette refonte soigne.
 *
 * Conséquence pratique : quand la saisie ⊕ annonce une dépense avant
 * l'aller-retour serveur, le hero et la courbe bougent du même geste, parce
 * qu'ils bougent sur le même nombre.
 *
 * ## Le canal non-couleur
 *
 * Trois tracés qui ne se distingueraient que par leur teinte violeraient WCAG
 * 1.4.1. Chacun porte donc **un libellé et une forme** : point plein pour le
 * réel, trait pointillé fin pour la référence, trait pointillé épais pour
 * l'estimation. Le verdict est écrit en toutes lettres.
 *
 * ## Les clés `pace.*` sont CONSERVÉES — divergence assumée du plan
 *
 * Le plan prévoyait de renommer `pace.onTrack` / `faster` / `exceeded` vers des
 * clés « courbe.* ». Refusé : ces trois clés sont réellement traduites dans les
 * cinq locales, `pace.perDay` survit de toute façon, et renommer trois voisines
 * d'un espace de noms qui reste ne change rien pour qui lit l'écran. C'est la
 * règle « clé neuve ≠ clé déjà traduite » appliquée un cran plus haut que là où
 * le plan l'appliquait.
 *
 * ## CSP
 *
 * Aucun attribut `style` : `style-src` ne porte pas `'unsafe-inline'` en
 * production. Géométrie, couleurs et opacités voyagent par des ATTRIBUTS SVG,
 * y compris les arrêts du dégradé. Même construction que `PaceBar`.
 *
 * Présentationnel et sans état : rend sur le serveur. Les libellés arrivent
 * traduits, donc ce fichier n'appelle pas `getTranslations` et se teste sans
 * fournisseur i18n.
 */

/** Hauteur de rendu, en ATTRIBUT — jamais une chaîne Tailwind (quirk WebKit < 17.4). */
const RENDER_HEIGHT = 112;

export type MonthCurveProps = {
  /** La série cumulée du mois, un point par jour (`depensesParJour`). */
  serie: readonly CurvePoint[];
  joursEcoules: number;
  joursDuMois: number;
  /** « Budget du mois » — la référence de rythme. */
  budgetDuMois: number;
  /** « Dépensé ce mois » — la figure AFFICHÉE, celle sur laquelle le tracé finit. */
  depensesDuMois: number;
  /** Fin de mois estimée, ou `null` (ADR-035 : rien avant le 7e jour). */
  projection: number | null;
  /** Jours portant une échéance. Décoratif : la liste réelle a sa propre carte. */
  billDays?: readonly number[];
  labels: {
    /** Phrase complète décrivant la courbe pour un lecteur d'écran. */
    aria: string;
    reel: string;
    rythme: string;
    projection: string;
    /** « dans le rythme » / « au-dessus du rythme » / « budget dépassé », ou `null`. */
    verdict: string | null;
  };
  /**
   * Identifiant du dégradé. Un seul cockpit par page aujourd'hui, donc une
   * constante suffit ; la prop existe pour que deux courbes sur un même
   * document ne se volent pas leur `fill`.
   */
  gradientId?: string;
};

/**
 * Fait finir la série sur le total affiché, sans toucher aux jours passés.
 *
 * Le dernier point visible **est** « Dépensé ce mois » : c'est la définition
 * d'un cumulé. Le reculer d'un centime ferait diverger la courbe du chiffre
 * qu'elle décompose, et personne ne verrait l'écart avant qu'il soit gênant.
 */
function alignerSurLeTotal(
  serie: readonly CurvePoint[],
  joursEcoules: number,
  total: number,
): readonly CurvePoint[] {
  if (serie.length === 0 || !Number.isFinite(total)) return serie;
  const index = Math.max(1, Math.min(joursEcoules, serie.length)) - 1;
  return serie.map((point, i) => (i === index ? { ...point, cumule: total } : point));
}

export function MonthCurve({
  serie,
  joursEcoules,
  joursDuMois,
  budgetDuMois,
  depensesDuMois,
  projection,
  billDays,
  labels,
  gradientId = 'month-curve-fill',
}: MonthCurveProps) {
  const geometrie = monthCurveGeometry({
    serie: alignerSurLeTotal(serie, joursEcoules, depensesDuMois),
    joursEcoules,
    joursDuMois,
    budgetDuMois,
    projection,
    billDays,
  });

  // Un budget non positif n'a pas de proportion : pas d'état, pas de verdict.
  // Le chiffre du hero porte déjà le constat.
  const aUneEchelle = budgetDuMois > 0;
  const depasse = aUneEchelle && depensesDuMois > budgetDuMois;
  const auDessus =
    aUneEchelle && joursDuMois > 0 && depensesDuMois / budgetDuMois > joursEcoules / joursDuMois;

  const etat = depasse ? 'depasse' : auDessus ? 'au-dessus' : 'dans-le-rythme';
  const teinte = depasse
    ? 'var(--color-danger)'
    : auDessus
      ? 'var(--color-warning)'
      : 'var(--color-brand-500)';

  return (
    <div className="flex flex-col gap-2" data-testid="month-curve" data-etat={etat}>
      <svg
        viewBox={`0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={labels.aria}
        height={RENDER_HEIGHT}
        className="block w-full"
      >
        <defs>
          {/*
            Le dégradé sous la courbe, emprunté au kit de référence. Les arrêts
            passent par `stop-color` / `stop-opacity`, des attributs — un
            `style` y serait supprimé en production et l'aire deviendrait
            opaque, masquant la référence de rythme qui passe dessous.
          */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={teinte} stopOpacity={0.24} />
            <stop offset="100%" stopColor={teinte} stopOpacity={0} />
          </linearGradient>
        </defs>

        {geometrie.areaPath && (
          <path d={geometrie.areaPath} fill={`url(#${gradientId})`} stroke="none" />
        )}

        {/* Les échéances d'abord, tout au fond : un repère de contexte ne doit
            jamais passer devant la donnée qu'il contextualise. */}
        {geometrie.billMarks.map((mark) => (
          <line
            key={mark.jour}
            x1={mark.x}
            x2={mark.x}
            y1={0}
            y2={CURVE_HEIGHT}
            stroke="var(--color-muted-foreground)"
            strokeOpacity={0.35}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
            aria-hidden
            data-testid={`month-curve-bill-${mark.jour}`}
          />
        ))}

        {/*
          La référence de rythme. Couleur pleine `--color-muted-foreground`
          plutôt qu'une opacité choisie à l'œil : ce jeton porte déjà du texte,
          donc son contraste est vérifié bien au-delà des 3:1 exigés par WCAG
          1.4.11 pour un objet graphique. `PaceBar` a dû corriger une opacité de
          0,35 pour cette raison exacte ; on évite le problème plutôt que de le
          re-mesurer.
        */}
        {geometrie.pacePath && (
          <path
            d={geometrie.pacePath}
            fill="none"
            stroke="var(--color-muted-foreground)"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            data-testid="month-curve-pace"
          />
        )}

        {geometrie.projectionPath && (
          <path
            d={geometrie.projectionPath}
            fill="none"
            stroke={teinte}
            strokeWidth={2}
            strokeDasharray="3 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            data-testid="month-curve-projection"
          />
        )}

        {/* Le réel EN DERNIER parmi les tracés : c'est la donnée, elle passe
            devant tout ce qui l'explique. */}
        {geometrie.linePath && (
          <path
            d={geometrie.linePath}
            fill="none"
            stroke={teinte}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            data-testid="month-curve-line"
          />
        )}

        {geometrie.projectionEnd && (
          <circle
            cx={geometrie.projectionEnd.x}
            cy={geometrie.projectionEnd.y}
            r={2.4}
            fill="var(--color-card)"
            stroke={teinte}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-testid="month-curve-projection-end"
          />
        )}
      </svg>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <LegendItem forme="point" teinte={teinte} libelle={labels.reel} />
        <LegendItem
          forme="tiret-fin"
          teinte="var(--color-muted-foreground)"
          libelle={labels.rythme}
        />
        {geometrie.projectionPath && (
          <LegendItem forme="tiret-epais" teinte={teinte} libelle={labels.projection} />
        )}
        {labels.verdict && (
          <span className="ms-auto shrink-0" data-testid="month-curve-verdict">
            {labels.verdict}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Une entrée de légende : une forme, une couleur, un mot.
 *
 * La FORME est le canal qui compte — elle survit au daltonisme, à l'impression
 * en noir et blanc et au mode contrastes forcés, là où la teinte disparaît.
 */
function LegendItem({
  forme,
  teinte,
  libelle,
}: {
  forme: 'point' | 'tiret-fin' | 'tiret-epais';
  teinte: string;
  libelle: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={14} height={8} viewBox="0 0 14 8" aria-hidden className="shrink-0">
        {forme === 'point' ? (
          <circle cx={7} cy={4} r={3.2} fill={teinte} />
        ) : (
          <line
            x1={0}
            x2={14}
            y1={4}
            y2={4}
            stroke={teinte}
            strokeWidth={forme === 'tiret-epais' ? 2.4 : 1.4}
            strokeDasharray={forme === 'tiret-epais' ? '3 3' : '3 2'}
            strokeLinecap="round"
          />
        )}
      </svg>
      {libelle}
    </span>
  );
}
