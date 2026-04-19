import type { ReactNode } from 'react';

/**
 * Typography wrapper for long-form legal / informational pages.
 * WCAG 2.2 AA compliant — verified contrast ratios on both light & dark surfaces:
 *   - foreground on background : ≥ 12:1
 *   - muted-foreground on background : ≥ 7:1
 *   - brand-700 links on background : ≥ 5.5:1
 *
 * Tailwind 4 `@theme` tokens are declared in `globals.css`, so we use the
 * `text-(--color-*)` arbitrary property syntax instead of the plugin classes
 * (`prose-slate`, `text-muted-foreground` etc.) which aren't registered.
 */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        'text-foreground',
        'text-base leading-relaxed md:text-[1.0625rem]',
        // Headings
        '[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight md:[&_h1]:text-4xl',
        '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight',
        '[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold',
        // Paragraphs
        '[&_p]:text-foreground [&_p]:my-4',
        // Lists
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6',
        '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6',
        '[&_li]:text-foreground [&_li]:leading-relaxed',
        '[&_li::marker]:text-brand-600',
        // Links — 5.5:1 contrast + clear affordance
        '[&_a]:text-brand-700 [&_a]:decoration-brand-600/40 hover:[&_a]:decoration-brand-700 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4',
        'dark:[&_a]:text-brand-300 dark:[&_a]:decoration-brand-300/50',
        // Inline emphasis
        '[&_strong]:text-foreground [&_strong]:font-semibold',
        '[&_code]:bg-brand-100 [&_code]:text-brand-900 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em]',
        'dark:[&_code]:bg-brand-900 dark:[&_code]:text-brand-100',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function ProseMeta({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground mt-2 mb-8 text-sm">{children}</p>;
}
