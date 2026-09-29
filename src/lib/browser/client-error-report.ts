import { isVersionSkewError } from './version-skew';

/**
 * A crash report small enough to say nothing about the person.
 *
 * Until this existed, an error caught by a boundary in the browser went to
 * `console.error` and nowhere else: the production logs could show zero errors
 * while users were looking at the error screen. The report fixes that, under a
 * strict rule — it carries the SHAPE of what happened, never its content:
 *
 *   - the error name, from a closed list (a custom class name could be anything);
 *   - the digest, only when it has the form of one (server errors only);
 *   - the route template, with every identifier-like segment replaced;
 *   - the build the tab is running, and whether the error looks like skew.
 *
 * No message, no stack, no query string, no amount. Messages are the one field
 * where application code routinely interpolates what the user typed.
 */

export const REPORT_ERROR_NAMES = [
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'ChunkLoadError',
  'AbortError',
  'NotFoundError',
  'SecurityError',
  'Other',
] as const;
export type ReportErrorName = (typeof REPORT_ERROR_NAMES)[number];

export const REPORT_SOURCES = ['boundary', 'global'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export type ClientErrorReport = {
  source: ReportSource;
  name: ReportErrorName;
  digest?: string;
  route: string;
  build: string;
  skew: boolean;
};

/** Accepted digest and build shape. Shared with the route, which re-checks it. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const ROUTE_MAX_LENGTH = 120;

/** A segment kept as-is: letters and hyphens only, so it names a page, not a record. */
const KEPT_SEGMENT = /^[A-Za-z][A-Za-z-]{0,39}$/;
/** A segment that is an identifier of some kind: replaced by `:id`. */
const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Route template accepted by the route: `/`, or segments that are either a kept
 * segment or one of the two placeholders. Must describe exactly what
 * `routeTemplate()` can produce.
 */
export const ROUTE_TEMPLATE_PATTERN =
  /^\/(?:(?:[A-Za-z][A-Za-z-]{0,39}|:id|:seg)(?:\/(?:[A-Za-z][A-Za-z-]{0,39}|:id|:seg))*)?$/;

export function routeTemplate(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? '/';
  const out: string[] = [];
  let length = 0;
  for (const segment of path.split('/')) {
    if (segment === '') continue;
    const template = KEPT_SEGMENT.test(segment)
      ? segment
      : ID_SEGMENT.test(segment)
        ? ':id'
        : ':seg';
    if (length + 1 + template.length > ROUTE_MAX_LENGTH) break;
    out.push(template);
    length += 1 + template.length;
  }
  return '/' + out.join('/');
}

function reportName(error: Error): ReportErrorName {
  return (REPORT_ERROR_NAMES as readonly string[]).includes(error.name)
    ? (error.name as ReportErrorName)
    : 'Other';
}

export function buildClientErrorReport(
  error: Error & { digest?: string },
  context: { source: ReportSource; pathname: string; build: string },
): ClientErrorReport {
  const report: ClientErrorReport = {
    source: context.source,
    name: reportName(error),
    route: routeTemplate(context.pathname),
    build: TOKEN_PATTERN.test(context.build) ? context.build : 'unknown',
    skew: isVersionSkewError(error),
  };
  if (typeof error.digest === 'string' && TOKEN_PATTERN.test(error.digest)) {
    report.digest = error.digest;
  }
  return report;
}

export const CLIENT_ERROR_ENDPOINT = '/api/client-error';

/** The build this tab runs. Inlined at build time from next.config.ts. */
export function currentBuild(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID ?? 'local';
}

/**
 * Fire and forget. `sendBeacon` survives the automatic reload that may follow
 * immediately, which a plain `fetch` would not reliably do. A report that
 * cannot be sent is dropped: the error screen must never fail because of it.
 */
export function sendClientErrorReport(report: ClientErrorReport): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    const body = new Blob([JSON.stringify(report)], { type: 'application/json' });
    navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, body);
  } catch {
    // Dropped on purpose — see above.
  }
}
