import * as React from 'react';

/**
 * "(simulated)" badge — used by sections still on fixture data while real
 * wiring is deferred to a follow-up PR. Visually muted but readable so
 * @thierry can spot in seconds which sections are not live yet.
 */
export function SimulatedBadge({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div
      role="status"
      className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-800 dark:text-amber-200"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
