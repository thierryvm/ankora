import { z } from 'zod';

/**
 * Runtime env validation. Server-only.
 * Throws at module load if required variables are missing or malformed,
 * so broken deployments fail fast instead of surfacing cryptic errors later.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  INTERNAL_SECRET: z.string().min(32),
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
