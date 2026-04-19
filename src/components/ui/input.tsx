import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'border-border bg-card text-foreground flex h-10 w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors',
        'file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted',
        'focus-visible:border-brand-500 focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
