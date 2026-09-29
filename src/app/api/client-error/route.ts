import { z } from 'zod';

import {
  REPORT_ERROR_NAMES,
  REPORT_SOURCES,
  ROUTE_MAX_LENGTH,
  ROUTE_TEMPLATE_PATTERN,
  TOKEN_PATTERN,
} from '@/lib/browser/client-error-report';
import { log } from '@/lib/log';
import { identifierFromRequest, rateLimit } from '@/lib/security/rate-limit';

/**
 * Receives the crash reports sent by the two error boundaries.
 *
 * Public and unauthenticated by necessity: the error screen may be showing
 * because the session or the app shell is what broke. So it trusts nothing:
 * rate limit first, a hard size cap on the body actually read, a strict schema
 * where every string field has a closed shape, and a single log line as its
 * only effect. It never touches the database.
 */

export const MAX_REPORT_BYTES = 1024;

const reportSchema = z
  .object({
    source: z.enum(REPORT_SOURCES),
    name: z.enum(REPORT_ERROR_NAMES),
    digest: z.string().regex(TOKEN_PATTERN).optional(),
    route: z.string().max(ROUTE_MAX_LENGTH).regex(ROUTE_TEMPLATE_PATTERN),
    build: z.string().regex(TOKEN_PATTERN),
    skew: z.boolean(),
  })
  .strict();

const empty = (status: number) => new Response(null, { status });

/**
 * Only the app's own pages may report. Without this, a third-party page could
 * post forged reports from each of its visitors' IPs, bypassing the per-IP
 * limit and spending a Redis command per request. Checked BEFORE the limiter so
 * forged traffic costs nothing. `Sec-Fetch-Site` is sent by every current
 * engine; `Origin` covers the older ones.
 */
function isCrossOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('host') ?? new URL(request.url).host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Reads the body chunk by chunk and stops at the cap. `content-length` is only
 * a claim (absent on a chunked body, and anyone can lie in it), so the cap is
 * enforced on the bytes actually received, without ever buffering more.
 */
async function readCapped(request: Request): Promise<string | null | 'too-large'> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REPORT_BYTES) {
        await reader.cancel().catch(() => undefined);
        return 'too-large';
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) return empty(413);

  if (isCrossOrigin(request)) return empty(403);

  const verdict = await rateLimit('api', `client-error:${identifierFromRequest(request)}`);
  if (!verdict.success) return empty(429);

  const text = await readCapped(request);
  if (text === 'too-large') return empty(413);
  if (text === null) return empty(400);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return empty(400);
  }

  // JSON.parse turns a "__proto__" key into an own property that the strict
  // schema does not see as unknown; refuse it explicitly.
  if (json !== null && typeof json === 'object' && Object.hasOwn(json, '__proto__')) {
    return empty(400);
  }

  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) return empty(400);

  const { build, ...report } = parsed.data;
  log.warn('client_error_reported', {
    ...report,
    clientBuild: build,
    serverBuild: process.env.VERCEL_DEPLOYMENT_ID ?? 'local',
  });
  return empty(204);
}
