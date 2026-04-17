#!/usr/bin/env node
/**
 * One-shot migration runner. Resolves DNS via Cloudflare (1.1.1.1) to bypass
 * the ISP's catchall DNS for *.supabase.com, then connects directly by IP
 * while keeping the TLS SNI set to the original hostname so Supavisor can
 * route to the right tenant.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Resolver } from 'node:dns/promises';
import pg from 'pg';

const repoRoot = resolve(process.cwd());
const envPath = join(repoRoot, '.env.local');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const password = process.env.SUPABASE_DB_PASSWORD;
const urlHost = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!password || !urlHost) {
  console.error('Missing SUPABASE_DB_PASSWORD or NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}
const ref = urlHost.replace('https://', '').split('.')[0];

const resolver = new Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);

async function resolveHost(hostname) {
  try {
    const v4 = await resolver.resolve4(hostname);
    if (v4.length) return { ip: v4[0], family: 4 };
  } catch {}
  try {
    const v6 = await resolver.resolve6(hostname);
    if (v6.length) return { ip: v6[0], family: 6 };
  } catch {}
  throw new Error(`Unable to resolve ${hostname}`);
}

const poolerRegions = ['eu-central-1', 'eu-west-1', 'eu-west-3', 'eu-west-2', 'eu-north-1'];
const candidates = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
  ...poolerRegions.flatMap((r) => [
    { host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}` },
    { host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` },
  ]),
];

const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log(`Applying ${files.length} migrations to ${ref}…`);

let client;
for (const c of candidates) {
  try {
    const { ip } = await resolveHost(c.host);
    console.log(`  trying ${c.user}@${c.host}:${c.port} → ${ip}`);
    const attempt = new pg.Client({
      host: ip,
      port: c.port,
      user: c.user,
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false, servername: c.host },
      connectionTimeoutMillis: 8000,
    });
    await attempt.connect();
    client = attempt;
    console.log('  ✓ connected');
    break;
  } catch (err) {
    console.log(`  ✗ ${err.message}`);
  }
}
if (!client) {
  console.error('No connection candidate worked.');
  process.exit(1);
}

try {
  await client.query('begin');
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`  → ${file}`);
    await client.query(sql);
  }
  await client.query('commit');
  console.log('✓ All migrations applied.');
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('✗ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
