import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: React.ReactNode;
  readonly iconRight?: React.ReactNode;
  readonly loading?: boolean;
  readonly children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isIconOnly = !!icon && !children;
  const classes = [
    'atm-btn',
    `atm-btn--${variant}`,
    `atm-btn--${size}`,
    loading ? 'is-loading' : '',
    isIconOnly ? 'atm-btn--icon-only' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="atm-btn-spin" aria-hidden="true" />}
      {!loading && icon && (
        <span className="atm-btn-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children && <span className="atm-btn-label">{children}</span>}
      {!loading && iconRight && (
        <span className="atm-btn-icon" aria-hidden="true">
          {iconRight}
        </span>
      )}
    </button>
  );
});
