import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

/**
 * La puce d'état du cockpit — un ton, une icône, un mot.
 *
 * ## Pourquoi l'icône n'est pas une prop
 *
 * Le contrat du plan dit : « une puce d'**état** porte icône + libellé +
 * couleur ». Laisser l'icône au choix de l'appelant rendrait possible une puce
 * rouge sans icône — c'est-à-dire une information portée par la seule couleur,
 * illisible pour un daltonien, à l'impression et en contrastes forcés.
 *
 * Elle est donc **dérivée du ton**. Ce n'est pas une commodité : c'est ce qui
 * rend la faute impossible plutôt qu'interdite. `icon` existe pour l'exception
 * motivée — la puce « configure tes revenus » porte un portefeuille, parce
 * qu'elle ne signale pas un état mais une action.
 *
 * ## Et pourquoi elle ne dit jamais si c'est bien
 *
 * Ankora n'est pas un service de conseil (contrainte FSMA). Une puce verte qui
 * annonce « tu gères bien » porte une appréciation sur les choix de quelqu'un ;
 * une puce verte qui annonce « tout est couvert ce mois-ci » énonce un fait
 * vérifiable. Ce composant ne connaît que le second — il reçoit un libellé
 * traduit et ne fabrique aucun jugement.
 *
 * Présentationnel et sans état : rend sur le serveur.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<StatusTone, { Icon: LucideIcon | null; classes: string }> = {
  success: { Icon: CheckCircle2, classes: 'text-success bg-success/10 ring-success/20' },
  warning: { Icon: AlertTriangle, classes: 'text-warning bg-warning/10 ring-warning/20' },
  danger: { Icon: AlertCircle, classes: 'text-danger bg-danger/10 ring-danger/20' },
  info: { Icon: Info, classes: 'text-info bg-info/10 ring-info/20' },
  // Aucun signal, donc aucune icône : rien à doubler. Le libellé EST
  // l'information, et lui ajouter un glyphe décoratif ne ferait que du bruit.
  neutral: { Icon: null, classes: 'text-muted-foreground bg-surface-muted ring-border/60' },
};

export type StatusChipProps = {
  tone: StatusTone;
  /** Déjà traduit — ce composant n'appelle pas `getTranslations`. */
  label: string;
  /** Exception motivée uniquement (voir la JSDoc). */
  icon?: LucideIcon;
  testId?: string;
};

export function StatusChip({ tone, label, icon, testId = 'status-chip' }: StatusChipProps) {
  const { Icon: IconDuTon, classes } = TONES[tone];
  const Icon = icon ?? IconDuTon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${classes}`}
      data-testid={testId}
      data-tone={tone}
    >
      {/* `aria-hidden` : le libellé porte déjà l'information en toutes lettres.
          L'icône existe pour l'œil qui ne distingue pas les teintes, pas pour
          la faire répéter à un lecteur d'écran. */}
      {Icon && <Icon aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0" />}
      {label}
    </span>
  );
}
