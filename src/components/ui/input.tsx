import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-(--color-border) bg-(--color-card) px-3 py-2 text-sm text-(--color-foreground) shadow-sm transition-colors',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-(--color-foreground)',
        'placeholder:text-(--color-muted)',
        'focus-visible:border-(--color-brand-500) focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-(--color-danger) aria-invalid:focus-visible:ring-(--color-danger)',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
