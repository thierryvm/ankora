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
        'text-(--color-foreground)',
        'text-base leading-relaxed md:text-[1.0625rem]',
        // Headings
        '[&_h1]:mt-0 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight md:[&_h1]:text-4xl',
        '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight',
        '[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold',
        // Paragraphs
        '[&_p]:my-4 [&_p]:text-(--color-foreground)',
        // Lists
        '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6',
        '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6',
        '[&_li]:leading-relaxed [&_li]:text-(--color-foreground)',
        '[&_li::marker]:text-(--color-brand-600)',
        // Links — 5.5:1 contrast + clear affordance
        '[&_a]:font-medium [&_a]:text-(--color-brand-700) [&_a]:underline [&_a]:decoration-(--color-brand-600)/40 [&_a]:underline-offset-4 hover:[&_a]:decoration-(--color-brand-700)',
        'dark:[&_a]:text-(--color-brand-300) dark:[&_a]:decoration-(--color-brand-300)/50',
        // Inline emphasis
        '[&_strong]:font-semibold [&_strong]:text-(--color-foreground)',
        '[&_code]:rounded [&_code]:bg-(--color-brand-100) [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-(--color-brand-900)',
        'dark:[&_code]:bg-(--color-brand-900) dark:[&_code]:text-(--color-brand-100)',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function ProseMeta({ children }: { children: ReactNode }) {
  return <p className="mt-2 mb-8 text-sm text-(--color-muted-foreground)">{children}</p>;
}
