import { Link } from '@/i18n/navigation';
import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { cn } from '@/lib/utils';

type Props = {
  /**
   * Localised aria-label announced by assistive tech (e.g. "Accueil Ankora").
   * The inner `<svg>` is intentionally `aria-hidden` so SR users hear this
   * label exactly once — fixing the duplicate announcement that motivated
   * the Sourcery review on PR #119.
   */
  ariaLabel: string;
  /** Extra classes for the outer `<Link>` (rare — defaults to the canonical pattern). */
  className?: string;
  /** Sizing for the inner `<AnkoraLogo>` (e.g. `h-8 w-auto` in Header, `h-7 w-auto` in Footer). */
  logoClassName?: string;
};

// Socle v3 (lot 1) : `motion-safe:active:scale-95` a ete RETIRE, et avec lui
// `transition-transform`. La regle de la maquette est « un controle sur lequel
// on vient d'appuyer ne bouge jamais » — un lien qui retrecit de 5 % sous le
// doigt deplace sa propre cible au moment ou le doigt la vise, et il fait
// respirer l'en-tete autour de lui.
//
// Ce que ca ne retire pas : le retour d'appui. Il se dit par l'opacite du
// logo, qui ne change la geometrie de rien. C'est le meme geste, sans le
// deplacement.
const LINK_CLASSES =
  'focus-visible:ring-brand-600 flex shrink-0 items-center rounded-md transition-opacity duration-[var(--dur-micro)] ease-[var(--ease-spring)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:opacity-70';

/**
 * Shared "home" link wrapping the Ankora wordmark. Used by both Header and
 * Footer so the focus ring, press animation and a11y semantics never drift
 * between the two surfaces.
 *
 * The logo SVG is rendered with `aria-hidden focusable={false}` because the
 * surrounding `<Link>` already announces "Accueil Ankora" — anything else
 * would have screen readers say "Ankora, Accueil Ankora" or similar.
 */
export function BrandHomeLink({ ariaLabel, className, logoClassName }: Props) {
  return (
    <Link href="/" aria-label={ariaLabel} className={cn(LINK_CLASSES, className)}>
      <AnkoraLogo className={logoClassName} aria-hidden focusable={false} aria-label={undefined} />
    </Link>
  );
}
