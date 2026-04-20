import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { log } from '@/lib/log';

type LimiterKind = 'auth' | 'api' | 'mutation' | 'export';

type RateLimitReason = 'rate_limit_unavailable' | 'rate_limited';

export type RateLimitVerdict = {
  success: boolean;
  reason?: RateLimitReason;
  limit: number;
  remaining: number;
  reset: number;
};

const redisConfigured = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  if (env.NODE_ENV === 'production') {
    log.error(
      'Upstash Redis env vars are missing in production — requests are NOT rate-limited. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    );
  } else {
    log.warn(
      'Upstash Redis env vars are missing — rate-limiting disabled (dev fallback). Requests will always succeed.',
    );
  }
}

const limiters: Record<LimiterKind, Ratelimit> | null = redisConfigured
  ? (() => {
      const redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL!,
        token: env.UPSTASH_REDIS_REST_TOKEN!,
      });
      return {
        auth: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(5, '15 m'),
          analytics: true,
          prefix: 'rl:auth',
        }),
        api: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(60, '1 m'),
          analytics: true,
          prefix: 'rl:api',
        }),
        mutation: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(20, '1 m'),
          analytics: true,
          prefix: 'rl:mut',
        }),
        export: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(3, '1 h'),
          analytics: true,
          prefix: 'rl:export',
        }),
      };
    })()
  : null;

export async function rateLimit(kind: LimiterKind, identifier: string): Promise<RateLimitVerdict> {
  const isProd = env.NODE_ENV === 'production';

  if (!limiters) {
    warnOnce();
    if (isProd) {
      return { success: false, reason: 'rate_limit_unavailable', limit: 0, remaining: 0, reset: 0 };
    }
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }

  try {
    const result = await limiters[kind].limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    const redactedIdentifier =
      typeof identifier === 'string'
        ? `${identifier.slice(0, 3)}***`
        : identifier != null
          ? '[non-string-identifier]'
          : undefined;
    log.error('Rate limit upstream error', {
      kind,
      identifier: redactedIdentifier,
      error,
    });
    if (isProd) {
      return { success: false, reason: 'rate_limit_unavailable', limit: 0, remaining: 0, reset: 0 };
    }
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
}

export function mapRateLimitErrorToErrorCode(reason?: RateLimitReason): string {
  return reason === 'rate_limit_unavailable'
    ? 'errors.auth.serviceTemporarilyUnavailable'
    : 'errors.auth.rateLimited';
}

export function identifierFromRequest(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'anon';
  return `ip:${ip}`;
}
