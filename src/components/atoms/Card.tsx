import * as React from 'react';

export type CardPadding = 'sm' | 'md' | 'lg' | 'none';
export type CardElevation = 'flat' | 'raised';
export type CardTone = 'default' | 'soft' | 'brand' | 'accent' | 'warning' | 'danger';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  readonly padding?: CardPadding;
  readonly elevation?: CardElevation;
  readonly tone?: CardTone;
  readonly eyebrow?: React.ReactNode;
  readonly title?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly children?: React.ReactNode;
}

export function Card({
  padding = 'md',
  elevation = 'flat',
  tone = 'default',
  eyebrow,
  title,
  footer,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const classes = [
    'atm-card',
    `atm-card--p-${padding}`,
    `atm-card--${elevation}`,
    `atm-card--tone-${tone}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} {...rest}>
      {(eyebrow || title) && (
        <header className="atm-card-head">
          {eyebrow && <div className="atm-card-eyebrow eyebrow">{eyebrow}</div>}
          {title && <h3 className="atm-card-title">{title}</h3>}
        </header>
      )}
      <div className="atm-card-body">{children}</div>
      {footer && <footer className="atm-card-foot">{footer}</footer>}
    </section>
  );
}
