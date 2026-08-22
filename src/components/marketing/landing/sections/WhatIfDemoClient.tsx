'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Check } from '@/components/marketing/landing/icons';
import { Eyebrow } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

import { PROJECTION_MONTHS, WHAT_IF_SCENARIOS, type WhatIfScenarioId } from './simulator/scenarios';

/**
 * Géométrie du tracé. La hauteur inclut la bande des libellés de mois : un
 * conteneur dimensionné sur le seul tracé produit une barre de défilement
 * imbriquée quand l'axe déborde.
 */
const W = 480;
const H = 190;
const PAD_X = 30;
const PAD_TOP = 26;
const PAD_BOTTOM = 30;

/**
 * WhatIfDemoClient — la démo publique « et si tu changeais une seule chose ? ».
 *
 * CE QUE CE GRAPHIQUE MONTRE, ET CE QU'IL MONTRAIT AVANT.
 *
 * Il traçait deux courbes : une réserve de départ codée en dur, et la même
 * augmentée de l'économie choisie. Sur le scénario par défaut, le visiteur
 * voyait la courbe monter de 494 € à 1192 €. Sur ces +698 €, **628 € (90 %)**
 * venaient de la trajectoire inventée et **70 €** de sa décision. La section
 * promettait « vois l'impact de ton choix » et montrait à 90 % autre chose.
 *
 * Une seule série désormais : **l'écart cumulé attribuable au choix**, partant
 * de zéro. Chaque euro tracé a une cause nommée, et le total se recalcule de
 * tête — économie mensuelle × nombre de mois. C'est la règle « un chiffre qu'on
 * ne peut pas ouvrir est une injonction, pas une information » (CLAUDE.md).
 *
 * DÉCISIONS DE TRACÉ, toutes issues de la même grammaire :
 *
 * - **Série unique donc aucune légende.** Un cartouche à une entrée répète le
 *   titre et coûte de la place. Le titre dit ce qui est tracé.
 * - **Un seul libellé direct**, au bout de la ligne. Une valeur sur chaque point
 *   ne se lit pas.
 * - **Grilles pleines**, jamais pointillées : un pointillé se lit comme une
 *   projection ou un seuil alors que ce n'est qu'une grille.
 * - **Aire à 10 % d'opacité** — un lavis, jamais un aplat saturé.
 * - **`brand-600` et non `brand-400`.** Vérifié par le validateur de palette :
 *   `#2dd4bf` (brand-400) sort de la bande de luminosité sur fond sombre
 *   (0,785), `#0d9488` passe toutes les vérifications dans LES DEUX thèmes. Le
 *   mode sombre se choisit et se mesure, il ne se déduit pas d'une inversion.
 * - **Aucun `style` inline.** La CSP de production (`src/proxy.ts`) n'autorise
 *   pas `'unsafe-hashes'` : un `style={{ left }}` est retiré en production alors
 *   qu'il reste vert en développement et en test. Le dépôt compte cinq
 *   précédents, dont un qui affichait « soldé » sur tous les plans en prod. Le
 *   repère de survol est donc positionné par `transform` SVG, un attribut.
 */
type Props = {
  /**
   * Les six libellés de mois de l'axe, calculés côté serveur à partir de la
   * date du jour (cf. `WhatIfDemo.tsx`). Reçus en props plutôt que calculés
   * ici : `new Date()` dans un composant client diverge du rendu serveur au
   * passage de minuit, et une divergence d'hydratation sur la landing est
   * exactement ce que #354 traque ailleurs.
   */
  mois: readonly string[];
};

/**
 * Plafond de l'axe — arrondi au pas « rond » supérieur.
 *
 * Sans cela le tracé serait écrasé : l'ancien code plafonnait à
 * `Math.max(...serie, 1500)`, hérité d'une réserve qui atteignait 1192 €. La
 * nouvelle série culmine vers 84–270 € ; le même plafond la collerait au bas
 * d'un axe six fois trop haut, et la refonte aurait l'air cassée en production.
 */
function plafondAxe(max: number): number {
  if (max <= 0) return 60;
  const pas = max <= 120 ? 20 : max <= 300 ? 50 : 100;
  return Math.max(pas, Math.ceil(max / pas) * pas);
}

export function WhatIfDemoClient({ mois }: Props) {
  const t = useTranslations('landing.whatif');
  const locale = useLocale();

  const [scenarioId, setScenarioId] = useState<WhatIfScenarioId>('gsm');
  const scenario = WHAT_IF_SCENARIOS.find((s) => s.id === scenarioId)!;

  /** Le curseur porte le PRIX FUTUR, pas l'écart. Cf. `scenarios.ts`. */
  const [prixFutur, setPrixFutur] = useState(scenario.default);
  const [survol, setSurvol] = useState<number | null>(null);

  /**
   * Remise au repos quand on change de scénario — par AJUSTEMENT AU RENDU, pas
   * par un effet.
   *
   * Un `useEffect` qui appelle `setState` déclenche un second rendu après que le
   * premier a été peint : le visiteur voit brièvement le prix de l'ancien
   * scénario sur les bornes du nouveau. Le linter le refuse d'ailleurs
   * explicitement (« cascading renders »), et la parade n'est pas de le faire
   * taire — c'est le motif documenté par React pour ajuster un état quand une
   * entrée change. React ré-exécute simplement ce composant avant de peindre.
   */
  const [scenarioPrecedent, setScenarioPrecedent] = useState(scenarioId);
  if (scenarioId !== scenarioPrecedent) {
    setScenarioPrecedent(scenarioId);
    setPrixFutur(scenario.default);
    setSurvol(null);
  }

  const economie = Math.max(0, scenario.current - prixFutur);
  const serie = Array.from({ length: PROJECTION_MONTHS }, (_, i) => economie * (i + 1));
  const total = economie * PROJECTION_MONTHS;

  const yMax = plafondAxe(total);
  const plotBas = H - PAD_BOTTOM;
  const plotHaut = PAD_TOP;

  const xAt = (i: number) => PAD_X + (i / (PROJECTION_MONTHS - 1)) * (W - PAD_X * 2);
  const yAt = (v: number) => plotBas - (v / yMax) * (plotBas - plotHaut);

  const ligne = serie.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
  const aire = `${ligne} L ${xAt(PROJECTION_MONTHS - 1)} ${plotBas} L ${xAt(0)} ${plotBas} Z`;

  /**
   * Signé seulement quand il y a quelque chose à signer. À 0 € — curseur au
   * prix actuel — « +0 € » se lirait comme un gain nul mais acquis ; « 0 € »
   * dit qu'il ne se passe rien, ce qui est exact.
   */
  const eur = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString(locale)} €`;
  const prix = (n: number) => `${n.toLocaleString(locale)} €`;

  const indexActif = survol ?? PROJECTION_MONTHS - 1;
  /**
   * `noUncheckedIndexedAccess` est actif : un accès indexé rend `T | undefined`
   * même quand la longueur est connue à la construction. Le repli sur 0 n'est
   * donc pas défensif, il est structurel — et 0 est la bonne valeur de repli
   * ici, puisque la série part de zéro.
   */
  const valeurActive = serie[indexActif] ?? 0;

  return (
    <>
      {/* GAUCHE — les contrôles */}
      <div className="border-border grid content-start gap-5 border-b p-7 md:border-r md:border-b-0 md:p-8">
        <div>
          <Eyebrow className="mb-2.5">{t('controls.scenario')}</Eyebrow>
          <div className="grid gap-1.5">
            {WHAT_IF_SCENARIOS.map((s) => {
              const actif = s.id === scenarioId;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenarioId(s.id)}
                  aria-pressed={actif}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition motion-reduce:transition-none',
                    'focus-visible:ring-brand-400/60 focus-visible:ring-2 focus-visible:outline-none',
                    actif
                      ? 'border-brand-surface-border bg-brand-surface text-foreground'
                      : 'border-border text-muted-foreground hover:bg-card/40 hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-6 w-6 flex-none place-items-center rounded-md transition-colors motion-reduce:transition-none',
                      actif
                        ? 'bg-brand-surface-border text-brand-text-strong'
                        : 'bg-card/40 text-muted-foreground',
                    )}
                  >
                    <Icon aria-hidden="true" className="h-3 w-3" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{t(`scenarios.${s.id}.label`)}</span>
                  {actif && (
                    <Check
                      aria-hidden="true"
                      className="text-brand-text-strong h-3.5 w-3.5 flex-none"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Le curseur glisse sur le prix futur — la donnée qu'on possède. */}
        <div>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <Eyebrow>{t('controls.future')}</Eyebrow>
            <span className="text-foreground font-mono text-base font-semibold tabular-nums">
              {prix(prixFutur)}
            </span>
          </div>
          {/*
            `aria-valuemin` / `aria-valuemax` / `aria-valuenow` EXPLICITES —
            BUG-iOS-010. Un `<input type="range">` expose implicitement ses
            bornes depuis `min`/`max` et les navigateurs les déduisent bien, mais
            les technologies d'assistance divergent sur cette déduction : le cas
            vivait en `test.fixme` dans `e2e/mobile-ios/simulator.spec.ts` depuis
            la campagne QA iOS. Trois attributs suffisent à lever le bug.
          */}
          <input
            type="range"
            min={scenario.floor}
            max={scenario.current}
            step={scenario.step}
            value={prixFutur}
            onChange={(e) => setPrixFutur(Number(e.target.value))}
            aria-label={t('controls.slider_aria', {
              label: t(`scenarios.${scenarioId}.label`),
            })}
            aria-valuetext={t('controls.slider_valuetext', {
              price: prix(prixFutur),
              saving: prix(economie),
            })}
            aria-valuemin={scenario.floor}
            aria-valuemax={scenario.current}
            aria-valuenow={prixFutur}
            className="accent-brand-400 h-6 w-full"
          />
          <div className="text-muted-foreground mt-0.5 flex justify-between font-mono text-xs tabular-nums">
            <span>{prix(scenario.floor)}</span>
            <span>{prix(scenario.current)}</span>
          </div>
          {/*
            Le texte d'aide est ÉCRIT DEPUIS les bornes du curseur. Avant, la
            fourchette de marché vivait dans la traduction et les bornes dans le
            code : le curseur descendait à 0 € pendant que la phrase annonçait un
            marché à 18 €. Une seule source, donc plus de contradiction possible.
          */}
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed text-pretty">
            {t(`scenarios.${scenarioId}.hint`, {
              current: prix(scenario.current),
              floor: prix(scenario.floor),
            })}
          </p>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
          {t('controls.saving', { amount: prix(economie) })}
        </p>
      </div>

      {/* DROITE — le chiffre, puis sa trajectoire */}
      <div className="grid content-start gap-3.5 p-7 md:p-8">
        <div>
          <Eyebrow>{t('chart.title')}</Eyebrow>
          {/*
            Le chiffre héros. Chiffres PROPORTIONNELS et non `tabular-nums` :
            à cette taille, des chasses égales font paraître un nombre comme
            « 121 » anormalement lâche. Les chasses fixes sont réservées aux
            colonnes qui doivent s'aligner — l'axe, le tableau ci-dessous.
          */}
          <p className="font-display text-brand-text-strong mt-1 text-5xl leading-none font-semibold">
            {eur(total)}
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
            {t('chart.subtitle', { months: PROJECTION_MONTHS })}
          </p>
        </div>

        <div className="bg-card/60 border-border rounded-xl border p-3">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={t('chart.aria', { months: PROJECTION_MONTHS })}
            className="block h-auto w-full"
            onMouseLeave={() => setSurvol(null)}
          >
            <defs>
              <linearGradient id="ankora-aire" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grilles : pleines et discrètes. Un pointillé se lirait comme un seuil. */}
            <g aria-hidden="true">
              {[0, 0.5, 1].map((g) => {
                const y = plotBas - g * (plotBas - plotHaut);
                return (
                  <line
                    key={g}
                    x1={PAD_X}
                    x2={W - PAD_X}
                    y1={y}
                    y2={y}
                    stroke="var(--color-border)"
                    strokeWidth="1"
                  />
                );
              })}
            </g>

            <path
              data-testid="whatif-area"
              d={aire}
              fill="url(#ankora-aire)"
              className="transition-[d] duration-200 motion-reduce:transition-none"
            />
            <path
              data-testid="whatif-line"
              d={ligne}
              fill="none"
              stroke="var(--color-brand-600)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-[d] duration-200 motion-reduce:transition-none"
            />

            {/* Repère de survol — positionné par `transform`, jamais par `style`. */}
            <g
              data-testid="whatif-marker"
              transform={`translate(${xAt(indexActif)}, ${yAt(valeurActive)})`}
              className="transition-transform duration-150 motion-reduce:transition-none"
            >
              <circle r="5" fill="var(--color-brand-600)" />
              <circle r="5" fill="none" stroke="var(--color-card)" strokeWidth="2" />
            </g>

            {/* Un seul libellé direct : la valeur du point actif. */}
            <text
              x={xAt(indexActif)}
              y={yAt(valeurActive) - 14}
              fontSize="12"
              fontWeight="600"
              fill="var(--color-brand-text-strong)"
              textAnchor={indexActif === PROJECTION_MONTHS - 1 ? 'end' : 'middle'}
              className="tabular-nums"
            >
              {eur(valeurActive)}
            </text>

            {/* Libellés de mois. */}
            <g aria-hidden="true">
              {mois.map((m, i) => (
                <text
                  key={m}
                  x={xAt(i)}
                  y={H - 10}
                  fontSize="10"
                  fill="var(--color-muted-foreground)"
                  textAnchor="middle"
                >
                  {m}
                </text>
              ))}
            </g>

            {/*
              Zones de survol. Larges à dessein : viser un point de 10 px est un
              exercice d'adresse, pas une interface. Chaque bande couvre tout son
              mois, sur toute la hauteur.
            */}
            <g>
              {serie.map((_, i) => (
                <rect
                  key={i}
                  x={xAt(i) - (W - PAD_X * 2) / (PROJECTION_MONTHS - 1) / 2}
                  y={plotHaut}
                  width={(W - PAD_X * 2) / (PROJECTION_MONTHS - 1)}
                  height={plotBas - plotHaut}
                  fill="transparent"
                  onMouseEnter={() => setSurvol(i)}
                />
              ))}
            </g>
          </svg>
        </div>

        {/*
          La vue tableau. Le survol ENRICHIT la lecture, il ne la conditionne
          jamais : sans elle, toute valeur intermédiaire ne serait accessible
          qu'à la souris. `sr-only` et non `hidden` — masquer à l'oeil, pas aux
          lecteurs d'écran.
        */}
        <table className="sr-only">
          <caption>{t('chart.table_caption', { months: PROJECTION_MONTHS })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('chart.table_month')}</th>
              <th scope="col">{t('chart.table_cumulative')}</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((v, i) => (
              <tr key={i}>
                <th scope="row">{mois[i]}</th>
                <td>{eur(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-muted-foreground text-xs leading-relaxed text-pretty">{t('caveat')}</p>
      </div>
    </>
  );
}
