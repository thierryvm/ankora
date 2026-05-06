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

const LINK_CLASSES =
  'focus-visible:ring-brand-600 flex shrink-0 items-center rounded-md transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-95';

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
