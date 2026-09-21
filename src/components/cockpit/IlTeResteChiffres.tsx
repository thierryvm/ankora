'use client';

import { HeroAmount } from '@/components/dashboard/HeroAmount';
import { useOptimisticSpend } from '@/lib/expenses/optimistic-spend';
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters';
import type { Locale } from '@/i18n/routing';

/**
 * Les chiffres de la carte de tête : le grand nombre, sa base, et la ligne de
 * formule. Le seul morceau client de `IlTeResteCard`, et il l'est pour une
 * raison précise.
 *
 * ## Pourquoi ce composant existe (B1, régression du 20 septembre 2026)
 *
 * Le cockpit v3 a remplacé `SituationDuMoisHero` par une carte serveur qui
 * écrivait le montant en dur. « Il te reste » a donc cessé de bouger à
 * l'annonce d'une dépense : l'écran attendait l'aller-retour serveur, alors
 * qu'ADR-010 exige que le chiffre descende en moins de 100 ms — c'est le geste
 * qui fait la différence entre un cockpit et un formulaire. Personne n'appelait
 * plus `settleSpend()` non plus : une figure optimiste posée par la feuille ⊕
 * serait restée en mémoire jusqu'au démontage de la page.
 *
 * `HeroAmount` porte déjà toute cette mécanique (interpolation, purge sur
 * vérité serveur fraîche, annonce a11y une seule fois) ; ce composant la
 * rebranche et étend la cohérence à la ligne de formule.
 *
 * ## La ligne de formule bouge AVEC le chiffre
 *
 * Le magasin publie un COUPLE — « Il te reste » et « Dépensé ce mois ». La
 * ligne dit `Revenus − Déjà compté − Dépensé = Il te reste` : si seule la tête
 * suivait l'annonce, la soustraction affichée deviendrait fausse sous les yeux
 * de la personne. Les deux membres venant de la même dépense, l'identité reste
 * vraie sur les nombres affichés — c'est exactement pourquoi ils voyagent
 * ensemble.
 *
 * Pendant les ~420 ms de descente, la tête est en mouvement vers la valeur que
 * la ligne affiche déjà : la ligne énonce l'arithmétique arrivée, la tête
 * montre le trajet. Figer la ligne le temps de l'animation reviendrait à
 * afficher une soustraction fausse.
 *
 * ## L'unité, une seule fois, à sa place (I2)
 *
 * La première version retirait le « € » final par expression régulière sur une
 * chaîne déjà formatée. Mesuré avec `Intl` le 20 septembre 2026 : l'unité est
 * en TÊTE en `en` (`€1,234.50`) et en `nl-BE` (`€ 1.234,50`) — le motif de fin
 * n'y retirait rien, et la ligne portait quatre symboles. On ne découpe donc
 * plus une chaîne formatée : on formate des NOMBRES, et un seul terme — le
 * résultat — passe par `formatCurrency`, qui place l'unité où la locale la
 * veut.
 */

export type IlTeResteChiffresProps = Readonly<{
  /** Vérité serveur pour le chiffre de tête. */
  ilTeReste: number;
  /** Vérité serveur pour « Dépensé ce mois ». */
  depensesDuMois: number;
  revenus: number;
  /** « Déjà compté pour tes factures » (`situation.retenu`), jamais recalculé ici. */
  dejaCompte: number;
  /** « Mis de côté » : 0 = le terme n'apparaît pas (maquette, règle 20). */
  misDeCote: number;
  locale: Locale;
  /** La phrase de base (« sur ton budget de septembre »), déjà traduite. */
  base: string;
  /** Les intitulés de la formule, déjà traduits. */
  termes: Readonly<{ revenus: string; retenu: string; depense: string; misDeCote: string }>;
}>;

/**
 * Un nombre sans son unité, avec les mêmes décimales que `formatCurrency` :
 * deux, sauf sur un montant entier (« 500 », pas « 500,00 ») — la convention
 * belge arbitrée le 2 juin 2026 et déjà appliquée au formateur monétaire.
 */
function nombre(value: number, locale: Locale): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    trailingZeroDisplay: 'stripIfInteger',
  });
}

export function IlTeResteChiffres({
  ilTeReste,
  depensesDuMois,
  revenus,
  dejaCompte,
  misDeCote,
  locale,
  base,
  termes,
}: IlTeResteChiffresProps) {
  const optimiste = useOptimisticSpend();
  const reste = optimiste?.ilTeReste ?? ilTeReste;
  const depense = optimiste?.depensesDuMois ?? depensesDuMois;

  // Le dépassement suit la figure affichée : une dépense qui fait passer sous
  // zéro doit teinter le chiffre au moment où il passe, pas au retour serveur.
  const depasse = reste < 0;

  return (
    <>
      {/* 28 px sur 32 de ligne — la taille du chiffre de tête dans
          l'application, tranchée au tour 17 bis. Les 32 px sont une exception
          écrite, réservée à l'accueil et à l'écran d'entrée. */}
      <HeroAmount
        value={ilTeReste}
        locale={locale}
        testId="cockpit-chiffre"
        className={`mt-1 text-[28px] leading-8 font-bold ${
          depasse ? 'text-danger' : 'text-brand-text-strong'
        }`}
      />

      <p className="text-muted-foreground mt-1 text-sm" data-base>
        {base}
      </p>

      <p className="mt-3 text-sm" data-decomposition data-testid="cockpit-formule">
        <span className="tabular-nums">
          {termes.revenus} {nombre(revenus, locale)}
        </span>{' '}
        <span className="tabular-nums">
          − {termes.retenu} {nombre(dejaCompte, locale)}
        </span>{' '}
        {misDeCote !== 0 && (
          <>
            <span className="tabular-nums" data-terme-mis-de-cote>
              − {termes.misDeCote} {nombre(misDeCote, locale)}
            </span>{' '}
          </>
        )}
        <span className="tabular-nums">
          − {termes.depense} {nombre(depense, locale)} = {formatCurrency(reste, locale)}
        </span>
      </p>
    </>
  );
}
