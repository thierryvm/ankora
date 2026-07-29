import { z } from 'zod';

/**
 * Runtime env validation. Server-only.
 * Throws at module load if required variables are missing or malformed,
 * so broken deployments fail fast instead of surfacing cryptic errors later.
 */
const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    INTERNAL_SECRET: z.string().min(32),
    // Bearer token for `/api/cron/gdpr`. **Optional even in production**, and
    // deliberately so: the Upstash pattern below (required via `superRefine`)
    // would fail the CI build, and repairing that would mean editing
    // `.github/workflows/` — a banned action in a feature PR. The refusal lives
    // in the route instead, which returns 401 when this is unset AND emits a
    // `log.error` so a misconfiguration screams while a wrong token stays mute.
    // `.trim()` is not cosmetic, and `.regex()` catches the cause at the source.
    // `openssl rand -base64 32` — the command written in `.env.example` — emits
    // a TRAILING NEWLINE, and a `vercel env add` fed by a pipe keeps it. The
    // fetch spec TRIMS a received header value, so the incoming token would be
    // clean while the expected one carried `\n`: `expected !== provided`
    // FOREVER, one 401 per night, no alert, and the right to erasure silently
    // unexecuted. Exactly the defect this route exists to remove, reintroduced
    // by a whitespace character.
    CRON_SECRET: z
      .string()
      .trim()
      .min(32)
      .regex(/^\S+$/, 'CRON_SECRET must not contain whitespace')
      .optional(),
    // Comma-separated list of Supabase user IDs allowed in /admin/* routes.
    // PR-D4-PHASE2-B initial: contains @thierry's user_id only. Future PRs
    // may move this to a workspace_members.role-based check.
    ANKORA_ADMIN_USER_IDS: z.string().default('').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.UPSTASH_REDIS_REST_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['UPSTASH_REDIS_REST_URL'],
          message: 'Required in production',
        });
      }
      if (!env.UPSTASH_REDIS_REST_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['UPSTASH_REDIS_REST_TOKEN'],
          message: 'Required in production',
        });
      }
    }
  });

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function parseServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid server environment variables:', z.treeifyError(parsed.error));
    throw new Error('Invalid server environment variables. See logs above.');
  }
  return parsed.data;
}

function parseClientEnv(): ClientEnv {
  const raw = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  const parsed = clientSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('❌ Invalid public environment variables:', z.treeifyError(parsed.error));
    throw new Error('Invalid public environment variables. See logs above.');
  }
  return parsed.data;
}

const isServer = typeof window === 'undefined';

export const env: ServerEnv = isServer
  ? parseServerEnv()
  : (parseClientEnv() as unknown as ServerEnv);
export const clientEnv: ClientEnv = parseClientEnv();
