import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatCurrency, formatDate } from '@/lib/i18n/formatters';
import type { LigneBientot } from '@/lib/domain/cockpit/bientot';

import { PartMensuelle, type PartMensuelleProps } from './PartMensuelle';

/**
 * C6 — « Encore à payer », et le bloc « Bientôt » qui la suit.
 *
 * ## Deux questions voisines, et pourquoi elles sont sur la même carte
 *
 * « Encore à payer » répond à « qu'est-ce qui sort ce mois-ci, et que je n'ai
 * pas encore réglé ». « Bientôt » répond à « qu'est-ce qui arrive juste après,
 * et qu'il faut avoir en tête maintenant ». La seconde n'a de sens que collée à
 * la première : sur une carte à part, elle redevient une liste de plus.
 *
 * ## « Bientôt » n'est plus un marqueur manuel
 *
 * Ces lignes se calculent à la lecture (`facturesBientot`, fenêtre de 60 jours),
 * au lieu d'attendre qu'on coche « à surveiller ». Le constat qui l'a décidé est
 * écrit dans DESIGN-v3.md : une facture d'eau trimestrielle n'était dite nulle
 * part au cockpit, alors que son montant, sa cadence et son jour d'échéance
 * étaient connus depuis le premier jour.
 *
 * ## Chaque ligne porte sa part mensuelle
 *
 * Une facture non mensuelle de 45 € tous les 3 mois coûte 15 € par mois, et
 * c'est ce second chiffre que le budget du mois a déjà retenu. Montrer 45 €
 * seul ferait croire à une sortie qui n'a pas lieu ; montrer 15 € seul serait
 * un quotient sans son dividende. Les deux, toujours ensemble (règle 10).
 */
export type LigneAPayer = Readonly<{
  id: string;
  label: string;
  /** Déjà converti par la page — un `Decimal` ne traverse pas la frontière RSC. */
  montant: number;
  dueDateIso: string;
  isOverdue: boolean;
}>;

export type EncoreAPayerCardProps = Readonly<{
  /** Ce qui reste dû ce mois-ci, toutes familles confondues. */
  resteAPayer: number;
  /** Combien de lignes sont réglées, sur combien. */
  payees: number;
  total: number;
  /** Les échéances du mois encore ouvertes. */
  lignes: readonly LigneAPayer[];
  /** Les factures non mensuelles qui arrivent — avec leur part mensuelle. */
  bientot: readonly LigneBientot[];
  monthLabel: string;
  locale: Locale;
}>;

/**
 * Combien de lignes du mois s'affichent. Trois, ramenées à DEUX dès que
 * « Bientôt » en porte : la carte reste à cinq montants au plus, et le budget
 * de page (douze montants sans geste) tient sans rien supprimer — le reste est
 * à un geste, dans « Mes factures ».
 */
const MAX_LIGNES_MOIS = 3;
const MAX_LIGNES_MOIS_AVEC_BIENTOT = 2;
const MAX_LIGNES_BIENTOT = 2;

export async function EncoreAPayerCard({
  resteAPayer,
  payees,
  total,
  lignes,
  bientot,
  monthLabel,
  locale,
}: EncoreAPayerCardProps) {
  const t = await getTranslations('cockpit.encoreAPayer');
  const tPart = await getTranslations('cockpit.partMensuelle');
  const fmt = (v: number) => formatCurrency(v, locale);

  const maxMois = bientot.length > 0 ? MAX_LIGNES_MOIS_AVEC_BIENTOT : MAX_LIGNES_MOIS;
  const visibles = lignes.slice(0, maxMois);
  const cachees = lignes.length - visibles.length;
  const bientotVisibles = bientot.slice(0, MAX_LIGNES_BIENTOT);
  const bientotCachees = bientot.length - bientotVisibles.length;
  /**
   * ATTENTION — `lignes` ne porte que les FACTURES, alors que `resteAPayer` et
   * `total` portent aussi les échéances d'engagement. Conclure « tout est
   * payé » depuis la longueur de `lignes` affichait le message à côté d'un
   * montant restant non nul : un énoncé faux sur de l'argent (relecture du
   * 20 sept. 2026). Le verdict se prend donc sur le MONTANT, la seule
   * grandeur qui couvre les deux familles.
   */
  const toutPaye = resteAPayer <= 0;
  const resteSansLigne = !toutPaye && lignes.length === 0;

  return (
    <Card data-surface="C6" data-testid="cockpit-encore-a-payer">
      <CardContent className="pt-6">
        <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
          {t('etiquette')}
        </p>

        <div className="mt-2 flex items-start justify-between gap-4">
          <h2 className="text-base font-medium" id="cockpit-encore-a-payer-heading">
            {t('titre')}
          </h2>
          <p className="shrink-0 text-xl font-semibold tabular-nums" data-montant>
            {fmt(resteAPayer)}
          </p>
        </div>

        <p className="text-muted-foreground mt-1 text-xs">{t('sousLigne', { payees, total })}</p>

        {toutPaye ? (
          <p className="text-success mt-3 text-sm">{t('toutPaye', { month: monthLabel })}</p>
        ) : resteSansLigne ? (
          /* Il reste de l'argent à sortir, mais aucune FACTURE : ce sont des
             échéances d'engagement. On dit où elles se lisent plutôt que de
             laisser un total sans ses parts (règle 10). */
          <p className="text-muted-foreground mt-3 text-sm">{t('resteEngagements')}</p>
        ) : (
          <ul className="divide-border mt-3 divide-y">
            {visibles.map((ligne) => (
              <li key={ligne.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{ligne.label}</p>
                  <p
                    className={`text-xs ${ligne.isOverdue ? 'text-danger' : 'text-muted-foreground'}`}
                  >
                    {ligne.isOverdue
                      ? t('enRetard', { date: formatDate(ligne.dueDateIso, locale, 'short') })
                      : formatDate(ligne.dueDateIso, locale, 'short')}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm tabular-nums" data-montant>
                  {fmt(ligne.montant)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {cachees > 0 && (
          <p className="text-muted-foreground mt-2 text-xs">{t('autres', { count: cachees })}</p>
        )}

        {/* « Bientôt » — hors du mois affiché, donc jamais confondu avec ce qui
            sort maintenant. Le titre le dit en toutes lettres. */}
        {bientotVisibles.length > 0 && (
          <div className="border-border mt-4 border-t pt-3" data-bientot-bloc>
            <p className="text-sm">
              <strong className="font-semibold">{t('bientot')}</strong>
              <span className="text-muted-foreground">
                {' '}
                · {t('bientotHorsDe', { month: monthLabel })}
              </span>
            </p>
            <ul className="divide-border mt-1 divide-y">
              {bientotVisibles.map((ligne) => (
                <li
                  key={ligne.charge.id}
                  className="flex items-start justify-between gap-3 py-2"
                  data-bientot
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {ligne.charge.label}
                      <span className="text-muted-foreground font-normal">
                        {' · '}
                        {formatDate(ligne.dueDateIso, locale, 'short')}
                      </span>
                    </p>
                    {/* La part mensuelle, jamais sans sa facture. */}
                    <PartMensuelle
                      montantFacture={ligne.partMensuelle.montantFacture.toNumber()}
                      cycleMois={ligne.partMensuelle.cycleMois}
                      montantMensuel={ligne.partMensuelle.montantMensuel.toNumber()}
                      locale={locale}
                      t={tPart as unknown as PartMensuelleProps['t']}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {bientotCachees > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                {t('bientotAutres', { count: bientotCachees })}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <Link
            href="/app/charges"
            className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {t('voirFactures')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
