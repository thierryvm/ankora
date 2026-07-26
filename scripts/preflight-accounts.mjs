#!/usr/bin/env node
// Garde-fou anti-mauvais-compte — Ankora (projet PERSONNEL, compte thierryvm).
//
// @thierry mène en parallèle un projet PRO sur le compte `ovb` (GitHub
// ovb-willemot, Vercel, Supabase). Les deux comptes GitHub sont connectés au
// keyring EN MÊME TEMPS : `gh auth status` en liste deux, un seul actif. Une
// bascule silencieuse enverrait du code perso sur l'infra pro, ou l'inverse.
//
// À lancer AVANT toute opération prod (push, migration, deploy) :
//   npm run preflight
//   ou : node --env-file=.env.local scripts/preflight-accounts.mjs
//
// Exit 0 = GO (tout correspond) · Exit 1 = NO-GO (au moins un ❌).
//
// N'AFFICHE JAMAIS DE VALEUR DE SECRET. Deux précautions y veillent :
//   - les tokens ne servent qu'à interroger une API, jamais à être imprimés ;
//   - les identifiants Vercel sont comparés par EMPREINTE sha256 tronquée, pas
//     en clair, pour qu'aucun identifiant d'organisation ne se retrouve figé
//     dans un fichier versionné.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = {
  ghLogin: 'thierryvm',
  ghRepo: 'thierryvm/ankora',
  // Référence publique : elle est déjà exposée dans NEXT_PUBLIC_SUPABASE_URL,
  // donc la figer ici n'ajoute aucune fuite.
  supabaseRef: 'fkscfvoouwufyjwnfvhb',
  appHost: 'ankora.be',
  // Empreintes sha256 (12 car.) des identifiants Vercel — cf. note d'en-tête.
  vercelOrgFingerprint: '8386904cdc64',
  vercelProjectFingerprint: '428b5ceefd5e',
};

// `scripts/` est à la racine du repo (pas de monorepo ici, contrairement au
// projet pro où le script vit dans `apps/web/scripts/`).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const fingerprint = (value) =>
  createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

// ── 1) Compte GitHub actif ───────────────────────────────────────────────────
// Ankora n'a pas de token GitHub dans .env.local : l'accès passe par la CLI
// `gh`. C'est aussi là qu'est le vrai risque — le compte ACTIF de la CLI, pas
// un token de service.
try {
  const login = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  check(
    'Compte GitHub actif',
    login === EXPECTED.ghLogin,
    `login=${login} (attendu ${EXPECTED.ghLogin})`,
  );
} catch (error) {
  const hint = /not found|ENOENT/i.test(error.message)
    ? 'CLI `gh` introuvable'
    : `gh a échoué : ${error.message.split('\n')[0]}`;
  check('Compte GitHub actif', false, hint);
}

// ── 2) Identité des commits ──────────────────────────────────────────────────
// Un `gh` correct avec un `git config user.name` du projet pro produirait des
// commits attribués au mauvais compte, sans qu'aucun push n'échoue.
try {
  const name = execFileSync('git', ['config', 'user.name'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  check('Identité des commits', name === EXPECTED.ghLogin, `user.name=${name}`);
} catch {
  check('Identité des commits', false, 'git config user.name absent');
}

// ── 3) Remote git ────────────────────────────────────────────────────────────
try {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  check(
    'Remote git origin',
    remote.includes(EXPECTED.ghRepo),
    `${remote} (attendu ${EXPECTED.ghRepo})`,
  );
} catch (error) {
  check('Remote git origin', false, error.message.split('\n')[0]);
}

// ── 4) Projet Supabase lié à la CLI ──────────────────────────────────────────
const projectRefPath = join(repoRoot, 'supabase', '.temp', 'project-ref');
if (existsSync(projectRefPath)) {
  const ref = readFileSync(projectRefPath, 'utf8').trim();
  check(
    'Supabase projet lié',
    ref === EXPECTED.supabaseRef,
    `ref=${ref} (attendu ${EXPECTED.supabaseRef})`,
  );
} else {
  check('Supabase projet lié', false, 'project-ref introuvable (`supabase link` ?)');
}

// ── 5) Supabase pointé par l'environnement ───────────────────────────────────
// Distinct du précédent : la CLI peut être liée au bon projet pendant que
// .env.local pointe ailleurs. L'app tournerait alors sur la mauvaise base.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
check(
  'Supabase de .env.local',
  Boolean(supabaseUrl?.includes(EXPECTED.supabaseRef)),
  supabaseUrl
    ? `NEXT_PUBLIC_SUPABASE_URL ${supabaseUrl.includes(EXPECTED.supabaseRef) ? 'correspond' : 'pointe AILLEURS'}`
    : 'NEXT_PUBLIC_SUPABASE_URL absent (lancer avec --env-file=.env.local)',
);

// ── 6) Projet Vercel lié ─────────────────────────────────────────────────────
const vercelPath = join(repoRoot, '.vercel', 'project.json');
if (existsSync(vercelPath)) {
  try {
    const { orgId, projectId } = JSON.parse(readFileSync(vercelPath, 'utf8'));
    const orgOk = fingerprint(orgId) === EXPECTED.vercelOrgFingerprint;
    const projectOk = fingerprint(projectId) === EXPECTED.vercelProjectFingerprint;
    check(
      'Vercel projet lié',
      orgOk && projectOk,
      orgOk && projectOk
        ? 'organisation et projet correspondent'
        : `empreinte ${orgOk ? 'projet' : 'organisation'} différente — lié au mauvais compte ?`,
    );
  } catch (error) {
    check('Vercel projet lié', false, `project.json illisible : ${error.message.split('\n')[0]}`);
  }
} else {
  check('Vercel projet lié', false, '.vercel/project.json introuvable (`vercel link` ?)');
}

// ── 7) URL applicative ───────────────────────────────────────────────────────
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
check(
  'URL applicative',
  Boolean(appUrl?.includes(EXPECTED.appHost)) || Boolean(appUrl?.includes('localhost')),
  appUrl ?? 'NEXT_PUBLIC_APP_URL absent',
);

// ── 8) Secrets requis par les opérations prod ────────────────────────────────
// Présence seulement — jamais la valeur.
check(
  'Supabase access token',
  Boolean(process.env.SUPABASE_ACCESS_TOKEN),
  process.env.SUPABASE_ACCESS_TOKEN ? 'présent' : 'SUPABASE_ACCESS_TOKEN absent',
);
check(
  'Supabase DB password',
  Boolean(process.env.SUPABASE_DB_PASSWORD),
  process.env.SUPABASE_DB_PASSWORD
    ? 'présent'
    : 'SUPABASE_DB_PASSWORD absent (requis pour `supabase db push`)',
);

// ── Rapport ──────────────────────────────────────────────────────────────────
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
console.log('\n  PREFLIGHT COMPTES — Ankora (projet personnel, thierryvm)\n');

let allOk = true;
for (const r of results) {
  console.log(`  ${r.ok ? '✅' : '❌'}  ${pad(r.name, 24)} ${r.detail}`);
  if (!r.ok) allOk = false;
}
console.log('');

if (allOk) {
  console.log('  → GO : tous les comptes correspondent au projet personnel.\n');
} else {
  console.log('  → NO-GO : corrige les ❌ avant toute opération prod (push / migration / deploy).');
  console.log('     Mauvais compte GitHub ? `gh auth switch --user thierryvm`\n');
}

// exitCode plutôt que process.exit : laisse les handles se fermer proprement
// sous Windows tout en propageant le bon code.
process.exitCode = allOk ? 0 : 1;
