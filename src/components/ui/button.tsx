import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Premium pattern (Apple / Linear feel) per cc-design `_shared/shell.css`:
 *   - Default rest: clean fill + subtle elevation shadow.
 *   - Hover: `translateY(-1px)` + magnetic shadow strengthens.
 *   - Active: `scale(0.98)` (press-down feel).
 *   - Focus-visible: soft brand-tinted ring (no browser default outline).
 *   - Disabled: opacity 0.5, all hover/focus effects suppressed.
 *
 * The motion is wrapped in `motion-safe:` so users with `prefers-reduced-motion`
 * still get a flat button (no translate / scale) — matches the global rule
 * declared in `globals.css` ~line 361.
 *
 * `link` is intentionally NOT enriched with translate/scale (no surface to
 * elevate); same rule applies to `icon` size which keeps the elevation but
 * skips the shadow (icon buttons sit on existing surfaces).
 */
// PR-BETA-CLEANUP-3 (2026-05-27) — focus ring aligned on the Input.tsx F2
// contract: `ring-brand-500/30` at 30% opacity, no offset. The previous
// `ring-2 ring-brand-600 ring-offset-2` combination rendered as a thick
// white outline on dark theme because the offset took on the background
// colour. Same root cause as the Select/Input fixes. See
// `src/components/ui/input.tsx` for the F2 origin and the dark-theme
// rationale.
const buttonVariants = cva(
  // ---------------------------------------------------------------------
  // Les QUATRE états du socle v3 (lot 1, 20 septembre 2026)
  //
  // Ce qui a été RETIRÉ, et pourquoi c'est le cœur du changement :
  // `motion-safe:active:scale-[0.98]` et `motion-safe:hover:-translate-y-px`.
  // La règle de la maquette est nette — « un contrôle sur lequel on vient
  // d'appuyer ne bouge jamais ». Un bouton qui rétrécit sous le doigt déplace
  // sa propre cible au moment précis où le doigt la vise, et il fait bouger ce
  // qui l'entoure quand il est dans une liste. L'appui se dit maintenant par
  // la TEINTE (`--color-control-pressed` et les crans de la rampe), qui ne
  // déplace rien et qui reste visible quand `prefers-reduced-motion` met les
  // durées à zéro.
  //
  // `disabled:opacity-50` part pour la même famille de raison : une opacité
  // dilue le texte ET son fond, donc elle casse un contraste qu'on a mesuré,
  // et de façon imprévisible puisqu'elle dépend de ce qu'il y a derrière. Un
  // bouton éteint prend une teinte éteinte — mesurée, elle.
  //
  // Le survol n'est pas gardé ici, et il n'a pas à l'être : `globals.css`
  // redéclare la variante `hover:` de Tailwind sous `@media (hover: hover)`
  // pour tout le projet. La mesure qui a motivé cette redéclaration est écrite
  // là-bas — la variante n'était PAS gardée par défaut, contrairement à ce
  // qu'on lit sur Tailwind v4.
  //
  // `rounded-lg` (12px) → `rounded-md` (8px) : le rayon d'un CONTRÔLE dans le
  // socle v3. 16px reste celui d'une carte.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--dur-state)] ease-[var(--ease-spring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:bg-control disabled:text-muted-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-brand-700 text-on-accent shadow-sm hover:bg-brand-600 active:bg-brand-800 active:shadow-none',
        destructive:
          'bg-danger text-on-accent shadow-sm hover:bg-danger/90 active:bg-danger active:shadow-none',
        outline:
          'border border-border-control bg-control text-foreground hover:bg-control-hover hover:border-brand-500 active:bg-control-pressed',
        secondary:
          'bg-brand-100 text-brand-900 hover:bg-brand-200 active:bg-brand-300 active:shadow-none',
        ghost: 'text-foreground hover:bg-control-hover active:bg-control-pressed',
        link: 'text-brand-700 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-12 rounded-md px-6 text-base',
        // PR-D5 mobile-iOS: 40×40 → 44×44 to meet Apple HIG + WCAG 2.5.5
        // touch target recommendation. Affects all icon buttons (Trash2 in
        // Charges/Expenses, drawer close button, etc.).
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
