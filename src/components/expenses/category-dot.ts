/**
 * Chip palette. Closed set, mirroring the DB `color_token` check constraint.
 *
 * ## `pink` a cessé d'être un doublon de `rose` — 2026-08-23
 *
 * Les deux pointaient sur `bg-danger`. Sur une pastille de 8 px posée à côté
 * d'un NOM, c'était sans conséquence : personne ne lit la couleur, on lit
 * « Loisirs ». Le jour où ces huit jetons deviennent un CHOIX — le sélecteur de
 * couleur d'une catégorie qu'on crée — deux pastilles identiques rendent le
 * contrôle cassé : on clique l'une, l'autre reste allumée à l'identique, et
 * rien ne dit laquelle on a prise. Mesuré à la capture 390 × 844.
 *
 * `pink` devient donc un dérivé de `--color-danger` éclairci vers la carte, et
 * non une couleur neuve : la palette reste fermée, la teinte reste de la
 * famille, et les deux se distinguent enfin. `color-mix` dans une classe
 * Tailwind, jamais dans un `style` inline — la CSP refuse le second.
 */
export const CHIP_DOT: Record<string, string> = {
  blue: 'bg-info',
  cyan: 'bg-brand-500',
  emerald: 'bg-success',
  amber: 'bg-warning',
  rose: 'bg-danger',
  pink: 'bg-[color-mix(in_oklab,var(--color-danger)_55%,var(--color-card))]',
  purple: 'bg-accent-600',
  zinc: 'bg-muted-foreground',
};
