/**
 * The colour of a category, per token — ONE table for the picker's dots
 * (`AddExpenseSheet`) and the « Catégories » card (`CategoriesCard`), so a
 * category never wears two colours on two screens.
 *
 * Literal class strings: Tailwind reads sources as text, a class built at run
 * time would never be generated. `DOT` paints a background; `TEXT` paints
 * `currentColor`, which the card's SVG bars fill with (no `style` attribute:
 * CSP).
 */
export const CATEGORY_DOT: Record<string, string> = {
  blue: 'bg-info',
  cyan: 'bg-brand-500',
  emerald: 'bg-success',
  amber: 'bg-warning',
  rose: 'bg-danger',
  pink: 'bg-[color-mix(in_oklab,var(--color-danger)_55%,var(--color-card))]',
  purple: 'bg-accent-600',
  zinc: 'bg-muted-foreground',
};

export const CATEGORY_TEXT: Record<string, string> = {
  blue: 'text-info',
  cyan: 'text-brand-500',
  emerald: 'text-success',
  amber: 'text-warning',
  rose: 'text-danger',
  pink: 'text-[color-mix(in_oklab,var(--color-danger)_55%,var(--color-card))]',
  purple: 'text-accent-600',
  zinc: 'text-muted-foreground',
};
