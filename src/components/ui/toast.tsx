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
          toast:
            'group toast rounded-lg border border-(--color-border) bg-(--color-card) text-(--color-foreground) shadow-lg',
          description: 'text-(--color-muted-foreground)',
          actionButton:
            'bg-(--color-brand-700) text-white rounded-md px-3 py-1 text-xs font-medium',
          cancelButton:
            'bg-(--color-border) text-(--color-foreground) rounded-md px-3 py-1 text-xs font-medium',
          error: 'border-(--color-danger) text-(--color-danger)',
          success: 'border-(--color-success) text-(--color-success)',
          warning: 'border-(--color-warning) text-(--color-warning)',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
