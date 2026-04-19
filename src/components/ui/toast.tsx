'use client';

import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'group toast rounded-lg border border-border bg-card text-foreground shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-brand-700 text-white rounded-md px-3 py-1 text-xs font-medium',
          cancelButton: 'bg-border text-foreground rounded-md px-3 py-1 text-xs font-medium',
          error: 'border-danger text-danger',
          success: 'border-success text-success',
          warning: 'border-warning text-warning',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
