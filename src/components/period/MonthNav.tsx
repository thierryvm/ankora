import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Link } from '@/i18n/navigation';

/**
 * The ‹ month › selector, shared by Bills and the cockpit (ADR-046, lot 2).
 *
 * Moved out of `ChargesClient` with its DOM unchanged — the `data-testid`s are
 * built from `testIdPrefix`, so Bills keeps `charges-period-*`. No hook, no
 * state: it renders the same from a Server Component (cockpit) and a Client
 * Component (Bills). The window (floor, twelve months ahead) is decided by
 * `viewedPeriodNav` in `domain/period/viewed-period.ts`, never here.
 */
export type MonthNavProps = Readonly<{
  pathname: '/app' | '/app/charges';
  testIdPrefix: string;
  label: string;
  prevParam: string | null;
  nextParam: string | null;
  isCurrent: boolean;
  labels: { navAria: string; prevAria: string; nextAria: string; backToCurrent: string };
  /**
   * Bills renders a nav landmark (unchanged). The cockpit passes false: the app
   * shell promises ONE navigation surface per width (coquille-v3), and choosing
   * a month is not site navigation — a named group says what it is.
   */
  landmark?: boolean;
}>;

const ARROW =
  'hover:bg-surface-muted focus-visible:ring-brand-600 text-muted-foreground flex size-11 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none';
const ARROW_OFF = 'text-muted-foreground/30 flex size-11 items-center justify-center';

export function MonthNav({
  pathname,
  testIdPrefix,
  label,
  prevParam,
  nextParam,
  isCurrent,
  labels,
  landmark = true,
}: MonthNavProps) {
  const Wrapper = landmark ? 'nav' : 'div';
  return (
    <Wrapper
      role={landmark ? undefined : 'group'}
      aria-label={labels.navAria}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex items-center gap-1">
        {prevParam ? (
          <Link
            href={{ pathname, query: { period: prevParam } }}
            aria-label={labels.prevAria}
            data-testid={`${testIdPrefix}-prev`}
            className={ARROW}
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </Link>
        ) : (
          <span className={ARROW_OFF}>
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </span>
        )}
        <span
          data-testid={`${testIdPrefix}-label`}
          className="text-foreground min-w-32 text-center text-sm font-semibold capitalize"
        >
          {label}
        </span>
        {nextParam ? (
          <Link
            href={{ pathname, query: { period: nextParam } }}
            aria-label={labels.nextAria}
            data-testid={`${testIdPrefix}-next`}
            className={ARROW}
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : (
          <span className={ARROW_OFF}>
            <ChevronRight aria-hidden className="h-4 w-4" />
          </span>
        )}
      </div>
      {!isCurrent && (
        <Link
          href={pathname}
          data-testid={`${testIdPrefix}-back`}
          className="text-brand-text hover:text-brand-text-strong focus-visible:ring-brand-600 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {labels.backToCurrent}
        </Link>
      )}
    </Wrapper>
  );
}
