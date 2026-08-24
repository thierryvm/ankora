import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * L'échelle d'élévation, et pourquoi elle n'est pas portée par le même moyen
 * dans les deux thèmes.
 *
 * Trois crans : le **sol** (`--color-background`), l'**objet** (cette carte,
 * `--color-card`), et le **panneau interne** creusé dans la carte
 * (`--color-surface-soft` — champs, aires de tracé). Le cockpit se lisait plat
 * parce que tout vivait au même cran, pas parce qu'il manquait un effet.
 *
 * En mode **clair**, la carte se détache par l'ombre autant que par la couleur :
 * blanc sur papier tiède, plus une ombre portée. `shadow-sm` était le cran le
 * plus discret de l'échelle, choisi quand la carte était le seul objet de
 * l'écran ; `shadow-md` la décolle vraiment, sans rien changer à la géométrie.
 *
 * En mode **sombre**, une ombre sur fond de nuit ne se voit pas : l'élévation y
 * repose **entièrement** sur l'écart entre surfaces. C'est pour cela que la même
 * PR sépare `--color-surface-muted` de `--color-surface-soft`, qui portaient la
 * même valeur — trois crans déclarés pour quatre jetons, donc un cran perdu là
 * où il était le seul moyen disponible.
 *
 * Aucune mise en page ne change ici : ni rayon, ni bordure, ni espacement.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('border-border bg-card text-foreground rounded-xl border shadow-md', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  /**
   * Heading level. Defaults to `h3`, which is right for a card sitting under a
   * page `h1` and a section `h2`. Override when the surrounding outline
   * differs — a wrong level is its own accessibility defect, so this is a real
   * prop rather than a fixed tag.
   */
  as?: 'h2' | 'h3' | 'h4';
};

/**
 * Card heading.
 *
 * Renders a real heading element. It used to be a `<div>`, which meant no card
 * in the app existed in a screen reader's heading navigation — and, less
 * visibly, that three e2e specs written against `getByRole('heading')` could
 * never pass. They sat green in CI for two months because the authenticated
 * job had no Supabase and skipped them entirely.
 */
const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Tag = 'h3', ...props }, ref) => (
    <Tag
      ref={ref}
      className={cn('text-lg leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
