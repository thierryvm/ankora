'use client';

import * as React from 'react';

/**
 * The admin's four tabs (audit of 1 October 2026, §3.3): horizontal on every
 * width, scrolling sideways on a phone rather than wrapping.
 *
 * WAI-ARIA tabs pattern with automatic activation: the arrow keys, Home and End
 * move the selection and the focus together; only the selected tab sits in the
 * tab order. The panels arrive already rendered by the server: this component
 * only decides which one shows.
 */
export type AdminTab = Readonly<{ id: string; label: string; panel: React.ReactNode }>;

export function AdminTabs({
  tabs,
  label,
}: Readonly<{ tabs: ReadonlyArray<AdminTab>; label: string }>): React.JSX.Element {
  const [selected, setSelected] = React.useState(0);
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const select = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setSelected(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    // Alt+← is the browser's Back, Ctrl+Home its own: never swallowed.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={label}
        className="border-border -mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0"
      >
        {tabs.map((tab, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-controls={`admin-panel-${tab.id}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`focus-visible:ring-accent-text -mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none ${
                isSelected
                  ? 'border-accent-text text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`admin-panel-${tab.id}`}
          aria-labelledby={`admin-tab-${tab.id}`}
          hidden={index !== selected}
          tabIndex={0}
          className="focus-visible:ring-accent-text rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
