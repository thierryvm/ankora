'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Le repli — la primitive qui manquait au socle du lot 1.
 *
 * ## Ce qu'il résout
 *
 * Le cockpit portait douze cartes ouvertes, 49 montants et 4,6 écrans à 375 px.
 * Le retour d'usage a été « tout est mélangé », puis « le foutoir ». La réponse
 * de la maquette v3 n'est pas de SUPPRIMER : c'est de replier. Rien ne se perd,
 * tout reste à un geste, et la page redevient lisible.
 *
 * ## Pourquoi le titre porte son chiffre
 *
 * Un repli dont le titre ne dit que « Mes comptes » demande d'ouvrir pour
 * savoir s'il y a quelque chose à voir : il déplace le travail au lieu de le
 * faire. « Mes comptes · 3 », « Ce qui a bougé · 12 dépenses », « Six mois ·
 * le plus serré : nov., 40 € » répondent DÉJÀ. On ouvre pour le détail, pas
 * pour l'existence. C'est la raison pour laquelle `cle` est obligatoire.
 *
 * ## Ce que le composant garantit, et que `e2e/cockpit-v3.spec.ts` mesure
 *
 * - un `button`, jamais un `div` cliquable ;
 * - `aria-expanded`, et `aria-controls` visant un `id` RÉELLEMENT présent dans
 *   le document — le corps est rendu en permanence et masqué par `hidden`,
 *   jamais démonté : un `aria-controls` qui pointe vers rien est un mensonge
 *   pour un lecteur d'écran ;
 * - 44 px de haut au moins (`min-h-11`), la cible tactile ;
 * - le titre tient sur DEUX lignes au plus (`line-clamp-2`), et n'est jamais
 *   coupé : un repli qui passe à trois lignes coûte plus cher que la carte
 *   qu'il replie, mais un titre amputé fait ouvrir pour lire ce qu'on aurait
 *   dû pouvoir lire. Mesuré le 20 septembre 2026 : sur `truncate`, « Provisions
 *   pour tes factures · ta réserve » occupait 267,4 px dans une boîte de 277 à
 *   375 px — 9,6 px de marge, contre plus de 50 pour tous les autres. Il ne
 *   tenait que par chance, et la CI (Chromium/Linux) le coupait à chaque run ;
 * - le chevron tourne, et sa rotation vaut 0 s sous `prefers-reduced-motion`
 *   (`motion-reduce:transition-none`).
 *
 * Fermé au chargement, toujours : c'est ce qui tient le budget de page. Un
 * repli fermé ne montre que la clé de son titre.
 */
export type RepliProps = Readonly<{
  /** Le titre, sans son chiffre. Ex. « Mes comptes ». */
  titre: string;
  /**
   * Le chiffre-clé, affiché après « · ». Ex. « 3 », « 12 dépenses »,
   * « le plus serré : nov., 40 € ». Obligatoire : un repli sans clé fait
   * ouvrir pour rien.
   */
  cle: string;
  /** Identifiant stable pour les sondes et la spec e2e. */
  testId?: string;
  children: ReactNode;
}>;

export function Repli({ titre, cle, testId, children }: RepliProps) {
  const [ouvert, setOuvert] = useState(false);
  const corpsId = useId();

  return (
    // Le contour de carte du lot 1 (--color-border-card), jamais le filet
    // interne : un repli EST une carte, il se pose sur la page comme elle.
    <div
      className="border-border-card bg-card text-foreground rounded-xl border shadow-sm"
      data-repli
      data-testid={testId}
    >
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={corpsId}
        onClick={() => setOuvert((o) => !o)}
        className="focus-visible:ring-brand-600 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        data-repli-tete
      >
        <span className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold">
          {titre}
          {/* Le séparateur est décoratif : un lecteur d'écran lit « Mes comptes 3 »,
              le point médian n'apporte rien à l'oral. */}
          <span aria-hidden> · </span>
          <span className="text-muted-foreground font-normal" data-repli-cle>
            {cle}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className={`h-5 w-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
            ouvert ? 'rotate-180' : ''
          }`}
        />
      </button>
      {/* Rendu en permanence, masqué par `hidden` : démonter le corps ferait
          pointer `aria-controls` vers un id absent, et casserait le lien que le
          lecteur d'écran annonce. */}
      <div id={corpsId} hidden={!ouvert} className="border-border border-t px-4 py-4">
        {children}
      </div>
    </div>
  );
}
