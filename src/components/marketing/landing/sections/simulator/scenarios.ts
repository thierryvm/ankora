import { PiggyBank, Sparkles, TrendingUp } from '@/components/marketing/landing/icons';
import type { LucideIcon } from 'lucide-react';

/**
 * WhatIfDemo — scénarios de la démo publique.
 *
 * CE QUE LE CURSEUR PORTE, ET POURQUOI CE N'EST PLUS L'ÉCONOMIE.
 *
 * Jusqu'au 22 août 2026, le curseur demandait directement l'économie mensuelle,
 * et la fourchette de marché vivait dans le TEXTE traduit
 * (« marché : 18–28 €/mois ») pendant que les bornes vivaient ici. Deux sources
 * pour une même vérité, donc deux vérités : le curseur descendait à 0 € et
 * montait à 22 €, alors que la phrase juste en dessous annonçait un marché entre
 * 18 et 28 € — soit une économie comprise entre 14 et 24 €. Le contrôle
 * autorisait des valeurs que sa propre légende déclarait impossibles.
 *
 * Il demandait aussi la mauvaise donnée. Personne ne connaît « son écart » : on
 * connaît ce qu'on paie, et ce qu'on paierait. La soustraction était à la charge
 * du visiteur.
 *
 * Le curseur glisse donc désormais sur le **prix futur**, entre `floor` (le
 * meilleur prix atteignable) et `current` (ce qu'on paie aujourd'hui). L'économie
 * en est DÉDUITE. Conséquence recherchée : une borne ne peut plus contredire une
 * légende, puisque la légende est écrite à partir des bornes.
 *
 * `current` et `floor` sont illustratifs et non traduisibles — ce sont des
 * montants, pas du texte. Seuls `label` et `hint` sont des clés i18n, et `hint`
 * reçoit les deux montants en paramètres plutôt que de les réécrire.
 */
export type WhatIfScenarioId = 'gsm' | 'elec' | 'stream';

export type WhatIfScenario = {
  readonly id: WhatIfScenarioId;
  readonly icon: LucideIcon;
  /** Ce que le visiteur paie aujourd'hui (€/mois). Borne HAUTE du curseur. */
  readonly current: number;
  /** Le meilleur prix atteignable (€/mois). Borne BASSE du curseur. */
  readonly floor: number;
  /** Position de repos du curseur — un prix futur plausible, jamais le plancher. */
  readonly default: number;
  readonly step: number;
};

export const WHAT_IF_SCENARIOS: readonly WhatIfScenario[] = [
  // 42 € payés, marché dès 18 € : repos à 28 €, soit 14 € économisés.
  { id: 'gsm', icon: Sparkles, current: 42, floor: 18, default: 28, step: 1 },
  // 168 € payés, offres dès 123 € : repos à 143 €, soit 25 € économisés.
  { id: 'elec', icon: TrendingUp, current: 168, floor: 123, default: 143, step: 5 },
  // 38 € payés, 13 € en gardant l'essentiel : repos à 20 €, soit 18 € économisés.
  { id: 'stream', icon: PiggyBank, current: 38, floor: 13, default: 20, step: 1 },
] as const;

/** Nombre de mois projetés. L'axe des libellés est calculé côté serveur. */
export const PROJECTION_MONTHS = 6;

/*
 * CE QUI A ÉTÉ SUPPRIMÉ LE 22 AOÛT 2026, ET POURQUOI.
 *
 * `RESERVE_BASELINE_6M` — une trajectoire de réserve codée en dur,
 * [480, 612, 740, 866, 988, 1108]. Le graphique traçait cette courbe, puis la
 * même augmentée de l'économie choisie. Mesuré sur le scénario par défaut : la
 * courbe montait de 494 € à 1192 €, soit +698 €, dont **628 € (90 %) venaient de
 * cette trajectoire inventée** et 70 € seulement du choix du visiteur. La
 * section promettait « vois l'impact de ton choix » et montrait à 90 % une
 * épargne d'environ 125 €/mois que rien n'expliquait et que personne ne pouvait
 * décomposer.
 *
 * Le graphique trace maintenant une seule série : l'écart cumulé attribuable au
 * choix, partant de zéro. Chaque euro affiché a une cause nommée.
 *
 * `THRESHOLD_ZONES` — trois bandes « découvert / fragile / confortable » aux
 * bornes 0 € et 200 €. Elles ne sont pas devenues fausses, elles sont devenues
 * SANS OBJET : ces bornes qualifient un NIVEAU de réserve, alors que la série
 * est désormais un ÉCART cumulé partant de zéro. Un écart de 84 € n'est ni
 * fragile ni confortable — la question ne se pose pas. Décision d'origine :
 * `docs/design/copywriting-review-2026-04-28.md` §5.1, annulée par l'addendum
 * daté du 22/08/2026 dans ce même fichier. Le principe 4 du même document
 * (« feedback émotionnel discret mais présent ») reste honoré autrement : par le
 * chiffre héros et par une aire qui monte.
 *
 * `FLECHE_RATIO = 0.7` — produisait « Ankora pourrait flécher 10 €/mois » à
 * partir d'une économie de 14 €, sans que le ratio soit visible nulle part. Un
 * chiffre qu'on ne peut pas ouvrir est une injonction, pas une information
 * (CLAUDE.md). Il est retiré plutôt que d'être expliqué : la démo a déjà son
 * chiffre, et il n'en faut qu'un.
 */
