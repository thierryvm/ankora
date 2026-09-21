import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AllocationBar } from '@/components/dashboard/AllocationBar';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatCurrency } from '@/lib/i18n/formatters';

import { IlTeResteChiffres } from './IlTeResteChiffres';
import { Repli } from './Repli';

/**
 * C2 — « Il te reste ». La carte de tête du cockpit v3.
 *
 * ## Une seule question, un seul chiffre
 *
 * La page répond à « où en est l'argent ». Cette carte porte la réponse ; tout
 * le reste de l'écran l'explique ou la prolonge. Elle est la première surface
 * sous l'en-tête, et le seul chiffre de cette taille sur la page.
 *
 * ## La ligne de formule (PR D, option B)
 *
 * `situation-mois.ts` calcule :
 *
 *     resteDisponible = revenus − retenu − misDeCote
 *     ilTeReste       = resteDisponible − dépensesDuMois
 *
 * La ligne affichée la dit mot pour mot :
 *
 *     Revenus − Déjà compté pour tes factures [− Mis de côté] − Dépensé = Il te reste
 *
 * Chaque terme descend de la situation, AUCUN n'est recalculé ici. « Déjà
 * compté » est `situation.retenu` : le dériver par `revenus −
 * resteDisponible`, comme avant la PR D, y ferait entrer le mis de côté une
 * seconde fois. « Mis de côté » n'apparaît que non nul (la maquette).
 *
 * ## Pourquoi la retenue se décompose sous la ligne
 *
 * Règle 10 du CLAUDE.md : un montant issu d'une somme s'ouvre sur ce qui le
 * compose. « Déjà compté pour tes factures » en est une — trois postes, chacun
 * avec son nom et sa part. Le détail facture par facture reste derrière « D'où
 * vient ce chiffre », qui ouvre la cascade.
 *
 * `Decimal` ne traverse pas la frontière RSC : ce composant reçoit des
 * `number`, déjà convertis par la page.
 */
export type IlTeResteCardProps = Readonly<{
  /** Le chiffre de tête. */
  ilTeReste: number;
  /** Le budget du mois, avant dépenses — la base de la jauge. */
  resteDisponible: number;
  revenus: number;
  depensesDuMois: number;
  /** « Déjà compté pour tes factures » : la somme des trois postes ci-dessous. */
  retenu: number;
  /** La part d'épargne libre des virements faits du mois. 0 : le terme n'apparaît pas. */
  misDeCote: number;
  /**
   * Le solde du compte qui paie le quotidien, déduit de ses opérations. `null`
   * sans ce compte ou sans relevé : la ligne n'apparaît pas du tout.
   */
  soldeQuotidien: number | null;
  /** Les trois postes de la retenue, tels que la production les calcule. */
  chargesFixes: number;
  provisionsLissees: number;
  engagementsMensuels: number;
  /** Le mois, déjà formaté par la page. */
  monthLabel: string;
  /** Vrai quand aucun revenu n'est connu : rien ne se calcule sans lui. */
  incomplet: boolean;
  locale: Locale;
  /**
   * Ce qui compose le chiffre, rendu par la page (la cascade). Passé en
   * `children` plutôt qu'importé ici : la cascade est un Server Component, le
   * repli est un composant client, et c'est la page qui les marie.
   */
  cascade: ReactNode;
}>;

export async function IlTeResteCard({
  ilTeReste,
  resteDisponible,
  revenus,
  depensesDuMois,
  retenu,
  misDeCote,
  soldeQuotidien,
  chargesFixes,
  provisionsLissees,
  engagementsMensuels,
  monthLabel,
  incomplet,
  locale,
  cascade,
}: IlTeResteCardProps) {
  const t = await getTranslations('cockpit.ilTeReste');
  const fmt = (v: number) => formatCurrency(v, locale);

  if (incomplet) {
    return (
      <Card data-surface="C2" data-testid="cockpit-il-te-reste">
        <CardContent className="pt-6">
          <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
            {t('etiquette')}
          </p>
          {/* Le même id que la branche complète : les deux sont exclusives, et
              la région `aria-labelledby` doit garder un nom dans l'état qu'un
              nouvel utilisateur voit en premier. */}
          <h2 id="cockpit-heading" className="mt-2 text-xl font-semibold">
            {t('incompletTitre')}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('incompletPhrase', { month: monthLabel })}
          </p>
          <Button asChild className="mt-4">
            <Link href="/app/accounts">{t('incompletCta')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // La jauge : ce qui est dépensé sur ce que le mois laissait. Bornée à 0-100 —
  // au-delà, c'est la teinte qui dit le dépassement, pas une barre qui sort de
  // sa piste.
  const pct =
    resteDisponible > 0
      ? Math.min(100, Math.max(0, Math.round((depensesDuMois / resteDisponible) * 100)))
      : 0;
  const depasse = ilTeReste < 0;

  return (
    <Card data-surface="C2" data-testid="cockpit-il-te-reste">
      <CardContent className="pt-6">
        <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
          {t('etiquette')}
        </p>

        <h2 id="cockpit-heading" className="mt-2 text-base font-medium">
          {t('titre')}
        </h2>

        {/* Le chiffre, sa base et la ligne de formule passent par un composant
            client : le chiffre de tête doit descendre à l'annonce d'une
            dépense, avant la réponse du serveur (ADR-010), et la ligne doit
            descendre avec lui — sinon la soustraction affichée devient fausse
            le temps d'un aller-retour. Cf. `IlTeResteChiffres`. */}
        <IlTeResteChiffres
          ilTeReste={ilTeReste}
          depensesDuMois={depensesDuMois}
          revenus={revenus}
          dejaCompte={retenu}
          misDeCote={misDeCote}
          locale={locale}
          base={t('base', { month: monthLabel })}
          termes={{
            revenus: t('termeRevenus'),
            retenu: t('termeRetenu'),
            depense: t('termeDepense'),
            misDeCote: t('termeMisDeCote'),
          }}
        />

        {/* La décomposition de la retenue — règle 10 : un total s'ouvre sur ses
            parts, et celles-ci descendent avec lui plutôt que d'être
            recalculées à l'affichage. */}
        <p className="text-muted-foreground mt-2 text-xs" data-retenu>
          {t('retenuDetail', {
            factures: fmt(chargesFixes),
            parts: fmt(provisionsLissees),
            echeances: fmt(engagementsMensuels),
          })}
        </p>

        {/* Le second chiffre de la carte, qui ne répond pas à la même question :
            ce qu'il y a sur le compte du quotidien, déduit de ses opérations.
            Il dit sa source et s'ouvre sur la page Comptes, où son tiroir le
            décompose (règle 10). Absent sans solde déductible, jamais « 0 € ». */}
        {soldeQuotidien !== null && (
          <p className="mt-2 text-xs">
            <Link
              href="/app/accounts"
              data-quotidien
              data-testid="cockpit-solde-quotidien"
              aria-label={t('quotidienAria', { montant: fmt(soldeQuotidien) })}
              className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {t('quotidien', { montant: fmt(soldeQuotidien) })}
            </Link>
          </p>
        )}

        {/* La jauge passe par `AllocationBar` : un `style={{width}}` inline est
            bloqué par la CSP stricte `style-src 'self' 'nonce-…'` (THI-322).
            Le SVG pose sa largeur en attribut, pas en style. */}
        {resteDisponible > 0 && (
          <div className="mt-4" data-jauge>
            <AllocationBar
              ariaLabel={t('jaugeAria', {
                depense: fmt(depensesDuMois),
                budget: fmt(resteDisponible),
              })}
              segments={[
                {
                  key: 'depense',
                  ratio: pct / 100,
                  fill: depasse ? 'var(--color-danger)' : 'var(--color-brand-600)',
                },
              ]}
            />
          </div>
        )}

        {/* L'action de la carte, et la seule (règle 5) : ce qui compose le
            chiffre. Le détail facture par facture vit ici, replié — la carte
            de tête reste une réponse, pas un tableau. */}
        <div className="mt-4">
          <Repli titre={t('ouvrirCascade')} cle={fmt(ilTeReste)} testId="cockpit-repli-cascade">
            {cascade}
          </Repli>
        </div>
      </CardContent>
    </Card>
  );
}
