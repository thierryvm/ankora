#!/usr/bin/env node
// Additive-only guard for Supabase migrations.
//
// Production migrations are applied by CI on merge to main
// (.github/workflows/migrations-production.yml). This guard is what makes that
// safe: it lets through only migrations that ADD, and refuses anything that
// destroys, rewrites, or widens access. A refused migration is still possible,
// but never automatically: Thierry pushes it himself
// (docs/contributing/migrations.md).
//
// Deliberate choices, all fail-closed:
// - Comments (-- and nested /* */) are removed before analysis.
// - String literals and $tag$ bodies are KEPT and analysed. A destructive word
//   inside a string counts, because `execute 'drop table …'` inside a do block
//   would otherwise walk past the guard. The cost is a rare false positive.
// - Function bodies are analysed too: a function that contains `delete from`
//   makes its migration manual.
//
// Built-in modules only: the production workflow runs it before `npm ci`
// would ever be needed, and it must not execute any dependency code there.
//
// Usage:
//   node scripts/ci/migrations-additives.mjs --base <ref> --head <ref>
//   node scripts/ci/migrations-additives.mjs --verifier-attente <file> --base <ref> --head <ref>
//   node scripts/ci/migrations-additives.mjs --verifier-liste <file>
//   node scripts/ci/migrations-additives.mjs --masquer-url   (reads SUPABASE_DB_URL)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = 'supabase/migrations';
const VERSION = /^(\d{14})_[^/]*\.sql$/;
const IDENT = String.raw`(?:"[^"]+"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][\w$]*))?`;

const MESSAGES = {
  drop: 'supprime un objet (drop)',
  truncate: 'vide une table (truncate)',
  delete: 'efface des données (delete from)',
  update: 'réécrit des données (update … set)',
  type: 'change le type d’une colonne (alter … type)',
  rename: 'renomme un objet (rename)',
  'set-not-null': 'rend obligatoire une colonne existante (set not null)',
  revoke: 'retire des droits sur un objet existant (revoke)',
  'alter-policy': 'modifie une règle d’accès existante (alter policy)',
  rls: 'désactive ou affaiblit la sécurité par ligne (row level security)',
  grant: 'ouvre un accès à anon ou public (grant … to anon/public)',
  'default-privileges': 'change les droits par défaut (alter default privileges)',
  'create-or-replace': 'remplace un objet qui existe déjà (create or replace)',
  'trigger-off': 'désactive des déclencheurs (disable trigger, session_replication_role)',
  'grant-role': 'donne un rôle à un autre (grant <rôle> to …)',
  definer: 'crée ou modifie une fonction security definer',
  vue: 'crée une vue sans security_invoker (elle contournerait la RLS)',
  policy: 'ajoute une règle d’accès à une table existante (create policy)',
  'objet-sensible': 'crée une règle, une extension, ou change un propriétaire',
  'alter-routine': 'modifie une fonction ou une vue existante (alter function/view)',
  dynamique: 'exécute du SQL dynamique (execute)',
  appel: 'exécute du code à l’application (do, select, call)',
  'rls-absente': 'crée une table sans activer la sécurité par ligne dans le même fichier',
  nom: 'porte un nom de fichier que la garde ne sait pas dater (AAAAMMJJhhmmss_nom.sql)',
  modifiee: 'modifie une migration déjà dans l’historique',
  supprimee: 'supprime une migration déjà dans l’historique',
  renommee: 'renomme une migration déjà dans l’historique',
  horodatage: 'porte un horodatage antérieur à la dernière migration de l’historique',
};

/** Removes comments; keeps strings, quoted identifiers and dollar bodies. Returns top-level statements, lower-cased. */
export function instructions(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let dollar = null; // open $tag$ delimiter, statements are not split inside
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    // Inside a $tag$ body Postgres looks for the closing tag and nothing else:
    // no comment, no string. Deciding the bounds any other way lets a `--`
    // swallow the closing tag and hide what follows it (review, 29 Sept 2026).
    if (dollar !== null) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length;
        dollar = null;
        cur += ' ';
      } else {
        cur += c;
        i++;
      }
      continue;
    }
    if (c === '-' && d === '-') {
      while (i < n && sql[i] !== '\n') i++;
      cur += ' ';
      continue;
    }
    if (c === '/' && d === '*') {
      let depth = 0;
      while (i < n) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
          if (depth === 0) break;
        } else i++;
      }
      cur += ' ';
      continue;
    }
    if (c === "'" || c === '"') {
      const escapeBackslash = c === "'" && /[eE]$/.test(cur) && !/[\w$][eE]$/.test(cur);
      let j = i + 1;
      while (j < n) {
        if (escapeBackslash && sql[j] === '\\') {
          j += 2;
          continue;
        }
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$' && !/[\w$]$/.test(cur)) {
      const m = /^\$([a-z_][\w]*)?\$/i.exec(sql.slice(i, i + 64));
      if (m) {
        dollar = m[0];
        cur += ' ';
        i += m[0].length;
        continue;
      }
    }
    if (c === ';' && dollar === null) {
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
}

/** Normalises an identifier: quotes removed, lower-case, `public.` when unqualified. */
export function nom(brut) {
  const propre = brut.replace(/"/g, '').replace(/\s+/g, '').toLowerCase();
  return propre.includes('.') ? propre : `public.${propre}`;
}

const CREATION_OBJET = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+|recursive\s+|materialized\s+)?(?:function|procedure|view|trigger|rule)\s+(?:if\s+not\s+exists\s+)?(${IDENT})`,
  'g',
);
const CREATION_TABLE = new RegExp(
  String.raw`^create\s+(?:unlogged\s+)?table\s+(if\s+not\s+exists\s+)?(${IDENT})`,
);

/** Names of tables, functions, procedures, views, triggers and rules a migration creates. */
export function objetsCrees(sql) {
  const noms = new Set();
  for (const s of instructions(sql)) {
    for (const m of s.matchAll(CREATION_OBJET)) noms.add(nom(m[1]));
    const t = CREATION_TABLE.exec(s);
    if (t) noms.add(nom(t[2]));
  }
  return noms;
}

/**
 * Refusals for one migration. `objetsExistants` = names created by migrations
 * already in history (see objetsCrees), for the create-or-replace rule.
 */
export function analyserMigration(sql, { objetsExistants = new Set() } = {}) {
  const stmts = instructions(sql);
  const tables = new Set();
  const colonnes = new Set();
  const routines = new Set();
  for (const s of stmts) {
    // `if not exists` is a no-op on an object that already exists: it only
    // counts as created here when history does not know the table, and never
    // for a column (history does not list columns).
    const t = CREATION_TABLE.exec(s);
    if (t && !(t[1] && objetsExistants.has(nom(t[2])))) tables.add(nom(t[2]));
    const a = new RegExp(
      String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${IDENT})`,
    ).exec(s);
    if (a) {
      for (const c of s.matchAll(
        /\badd\s+(?:column\s+)?(?!if\s+not\s+exists)("[^"]+"|[a-z_][\w$]*)/g,
      )) {
        if (!/^(constraint|primary|unique|foreign|check|exclude)$/.test(c[1])) {
          colonnes.add(`${nom(a[1])}.${c[1].replace(/"/g, '')}`);
        }
      }
    }
    for (const m of s.matchAll(CREATION_OBJET)) routines.add(nom(m[1]));
  }

  const refus = [];
  const refuser = (regle, s) => refus.push({ regle, extrait: s.slice(0, 160) });

  for (const s0 of stmts) {
    // drop policy/trigger if exists … on <table created here> is the idempotent pattern.
    const s = s0.replace(
      new RegExp(
        String.raw`\bdrop\s+(?:policy|trigger)\s+(?:if\s+exists\s+)?(?:"[^"]+"|[\w$]+)\s+on\s+(${IDENT})`,
        'g',
      ),
      (tout, table) => (tables.has(nom(table)) ? ' ' : tout),
    );
    if (/\bdrop\b/.test(s)) refuser('drop', s0);
    if (/\btruncate\b/.test(s)) refuser('truncate', s0);
    if (/\bdelete\s+from\b/.test(s)) refuser('delete', s0);
    if (
      new RegExp(
        String.raw`(?<!\bon\s)\bupdate\s+(?:only\s+)?${IDENT}(?:\s+(?:as\s+)?(?:"[^"]+"|[a-z_][\w$]*))?\s+set\b`,
      ).test(s) ||
      /\bdo\s+update\s+set\b/.test(s) ||
      /\bmerge\s+into\b/.test(s)
    ) {
      refuser('update', s0);
    }
    if (/\balter\s+(?:column\s+)?(?:"[^"]+"|[\w$]+)\s+(?:set\s+data\s+)?type\b/.test(s))
      refuser('type', s0);
    if (/\brename\b/.test(s)) refuser('rename', s0);

    for (const m of s.matchAll(
      new RegExp(
        String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${IDENT})[^;]*?\balter\s+(?:column\s+)?("[^"]+"|[\w$]+)\s+set\s+not\s+null`,
        'g',
      ),
    )) {
      const table = nom(m[1]);
      if (!tables.has(table) && !colonnes.has(`${table}.${m[2].replace(/"/g, '')}`))
        refuser('set-not-null', s0);
    }

    for (const m of s.matchAll(/\brevoke\b[^;]*?\bon\s+([^;]*?)\s+from\b/g)) {
      const cible = m[1].trim();
      const fn = new RegExp(String.raw`^(?:function|procedure|routine)\s+(${IDENT})`).exec(cible);
      const ok = fn
        ? routines.has(nom(fn[1]))
        : !/^(?:all\s|schema\s|sequence\s|type\s|domain\s)/.test(cible) &&
          cible
            .replace(/^table\s+/, '')
            .split(',')
            .every((t) => tables.has(nom(t.trim())));
      if (!ok) refuser('revoke', s0);
    }

    if (/\balter\s+policy\b/.test(s)) refuser('alter-policy', s0);
    if (/\bdisable\s+row\s+level\s+security\b|\bno\s+force\s+row\s+level\s+security\b/.test(s))
      refuser('rls', s0);
    for (const m of s.matchAll(/\bgrant\b[^;]*?\bto\s+([^;]*)/g)) {
      if (/(?:^|[\s,])"?(?:anon|public)"?(?![\w$."])/.test(m[1])) refuser('grant', s0);
    }
    if (/\balter\s+default\s+privileges\b/.test(s)) refuser('default-privileges', s0);
    if (/\bdisable\s+trigger\b|\bsession_replication_role\b/.test(s)) refuser('trigger-off', s0);

    // What opens access by ADDING: default privileges give anon every right on
    // a new table and EXECUTE on a new function (measured in 20260920000001
    // and 20260729000002), so a new object is only safe when it closes itself.
    for (const m of s.matchAll(/\bgrant\b((?:(?!\bon\b)[^;])*?)\bto\b/g)) {
      if (!/\bon\b/.test(m[1])) refuser('grant-role', s0);
    }
    if (/\bsecurity\s+definer\b/.test(s)) refuser('definer', s0);
    if (
      /\bcreate\s+(?:or\s+replace\s+)?(?:recursive\s+)?view\b/.test(s) &&
      !/\bsecurity_invoker\s*=\s*(?:true|on)\b/.test(s)
    )
      refuser('vue', s0);
    if (/\bcreate\s+materialized\s+view\b/.test(s)) refuser('vue', s0);
    for (const m of s.matchAll(
      new RegExp(String.raw`\bcreate\s+policy\s+(?:"[^"]+"|[\w$]+)\s+on\s+(${IDENT})`, 'g'),
    )) {
      if (!tables.has(nom(m[1]))) refuser('policy', s0);
    }
    if (/\bcreate\s+(?:or\s+replace\s+)?rule\b|\bcreate\s+extension\b|\bowner\s+to\b/.test(s))
      refuser('objet-sensible', s0);
    if (/\balter\s+(?:function|procedure|routine|view|materialized\s+view)\b/.test(s))
      refuser('alter-routine', s0);

    // Destruction without the word: dynamic SQL, or a call to a function that
    // exists already (a purge, say). Never automatic.
    if (/\bexecute\b(?!\s+(?:function|procedure)\b)/.test(s)) refuser('dynamique', s0);
    if (/^(?:do|select|call|perform)\b/.test(s)) refuser('appel', s0);

    for (const m of s.matchAll(
      new RegExp(
        String.raw`\bcreate\s+or\s+replace\s+(?:constraint\s+|recursive\s+)?(?:function|procedure|view|trigger|rule)\s+(${IDENT})`,
        'g',
      ),
    )) {
      if (objetsExistants.has(nom(m[1]))) refuser('create-or-replace', s0);
    }
  }

  const rlsActivee = new Set();
  for (const s of stmts) {
    const m = new RegExp(
      String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${IDENT})\s+enable\s+row\s+level\s+security\b`,
    ).exec(s);
    if (m) rlsActivee.add(nom(m[1]));
  }
  for (const t of tables) if (!rlsActivee.has(t)) refus.push({ regle: 'rls-absente', extrait: t });
  return refus;
}

/** Refusals from `git diff --name-status -M` lines limited to the migrations folder. */
export function analyserStatuts(nameStatus, derniereVersion) {
  const refus = [];
  for (const ligne of nameStatus.split('\n').filter(Boolean)) {
    const [statut, ...chemins] = ligne.split('\t');
    const fichier = chemins[chemins.length - 1];
    if (statut.startsWith('A')) {
      const v = VERSION.exec(path.posix.basename(fichier));
      if (!v) refus.push({ regle: 'nom', extrait: fichier });
      else if (derniereVersion && v[1] <= derniereVersion)
        refus.push({ regle: 'horodatage', extrait: fichier });
    } else if (statut.startsWith('D')) refus.push({ regle: 'supprimee', extrait: fichier });
    else if (statut.startsWith('R'))
      refus.push({ regle: 'renommee', extrait: chemins.join(' → ') });
    else refus.push({ regle: 'modifiee', extrait: fichier });
  }
  return refus;
}

/** Rows of `supabase migration list`: [local|undefined, remote|undefined]. */
function lignesListe(sortie) {
  const rows = [];
  for (const l of sortie.split(/\r?\n/)) {
    const m = /^\s*(\d+)?\s*[|│]\s*(\d+)?\s*[|│]/.exec(l);
    if (m && (m[1] || m[2])) rows.push([m[1], m[2]]);
  }
  return rows;
}

/**
 * `db push` applies EVERY pending migration, not only the ones of this push.
 * A migration refused earlier and not yet pushed by hand would otherwise ride
 * along with the next additive one. Returns the pending versions this push did
 * not add (and a marker when the list cannot be read): empty = safe to push.
 */
export function attenteNonCouverte(sortie, versionsAjoutees) {
  const rows = lignesListe(sortie);
  if (rows.length === 0) return ['liste illisible'];
  return rows.filter(([l, r]) => l && !r && !versionsAjoutees.includes(l)).map(([l]) => l);
}

/** Compares `supabase migration list` output with the repository's versions. Fail-closed. */
export function comparerListeMigrations(sortie, versionsLocales) {
  const ecarts = [];
  const distantes = new Set();
  const rows = lignesListe(sortie);
  for (const [l, r] of rows) {
    if (r) distantes.add(r);
    if (l !== r) ecarts.push(`local ${l ?? '—'} / distante ${r ?? '—'}`);
  }
  if (rows.length === 0) ecarts.push('sortie de `migration list` illisible ou vide');
  for (const v of versionsLocales) if (!distantes.has(v)) ecarts.push(`${v} absente de la base`);
  for (const v of distantes)
    if (!versionsLocales.includes(v)) ecarts.push(`${v} présente en base, absente du dépôt`);
  return { ok: ecarts.length === 0, ecarts };
}

// ---------------------------------------------------------------- CLI

function git(...args) {
  // quotePath=false: an accented file name would otherwise come back quoted
  // and escaped, fail every `.sql` / version match, and never be analysed.
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function echec(lignes) {
  for (const l of lignes) console.error(l);
  process.exit(1);
}

function garde(base, head) {
  if (!base || /^0+$/.test(base) || !head) {
    echec(['Garde des migrations : base de comparaison absente. Refus par prudence.']);
  }
  try {
    git('cat-file', '-e', `${base}^{commit}`);
    git('cat-file', '-e', `${head}^{commit}`);
  } catch {
    echec(['Garde des migrations : commit de comparaison introuvable. Refus par prudence.']);
  }
  const statuts = git('diff', '--no-renames', '--name-status', base, head, '--', DOSSIER);
  const avecRenommages = git('diff', '-M', '--name-status', base, head, '--', DOSSIER);
  const existantes = git('ls-tree', '--name-only', `${base}:${DOSSIER}`)
    .split('\n')
    .filter((f) => VERSION.test(f))
    .sort();
  const derniere = existantes.length ? VERSION.exec(existantes[existantes.length - 1])[1] : null;

  const refus = analyserStatuts(avecRenommages, derniere).map((r) => ({
    ...r,
    fichier: r.extrait,
  }));
  const objetsExistants = new Set();
  for (const f of existantes)
    for (const o of objetsCrees(git('show', `${base}:${DOSSIER}/${f}`))) objetsExistants.add(o);

  const ajoutees = statuts
    .split('\n')
    .filter((l) => l.startsWith('A\t') && l.endsWith('.sql'))
    .map((l) => l.slice(2))
    .sort();
  for (const f of ajoutees) {
    for (const r of analyserMigration(git('show', `${head}:${f}`), { objetsExistants }))
      refus.push({ ...r, fichier: f });
  }

  if (refus.length === 0) {
    console.log(
      `Garde des migrations : ${ajoutees.length} migration(s) ajoutée(s), toutes additives.`,
    );
    return;
  }
  echec([
    'Garde des migrations : REFUS. Cette migration ne peut pas partir automatiquement en production.',
    '',
    ...refus.map(
      (r) =>
        `  - ${r.fichier} : ${MESSAGES[r.regle]}\n      ${r.fichier === r.extrait ? '' : r.extrait}`,
    ),
    '',
    'Une migration qui détruit, réécrit ou élargit un accès est possible, mais jamais automatiquement :',
    'Thierry la pousse lui-même, après une sauvegarde, en suivant docs/contributing/migrations.md',
    '(section « Migration destructive »).',
  ]);
}

function verifierAttente(fichier, base, head) {
  if (!base || /^0+$/.test(base) || !head)
    echec(['Contrôle d’attente : base de comparaison absente. Refus par prudence.']);
  const ajoutees = git(
    'diff',
    '--no-renames',
    '--name-status',
    '--diff-filter=A',
    base,
    head,
    '--',
    DOSSIER,
  )
    .split('\n')
    .map((l) => VERSION.exec(path.posix.basename(l.split('\t')[1] ?? ''))?.[1])
    .filter(Boolean);
  const hors = attenteNonCouverte(fs.readFileSync(fichier, 'utf8'), ajoutees);
  if (hors.length) {
    echec([
      'Contrôle d’attente : la base attend des migrations que ce push n’a pas ajoutées.',
      ...hors.map((v) => `  - ${v}`),
      'Elles n’ont pas été vues par la garde de CE push (refus antérieur, ou run précédent en échec).',
      'Rien n’est appliqué. Thierry les pousse à la main : docs/contributing/migrations.md.',
    ]);
  }
  console.log(
    `Contrôle d’attente : ${ajoutees.length} migration(s) en attente, toutes ajoutées par ce push.`,
  );
}

function verifierListe(fichier) {
  const versions = fs
    .readdirSync(DOSSIER)
    .map((f) => VERSION.exec(f)?.[1])
    .filter(Boolean);
  const res = comparerListeMigrations(fs.readFileSync(fichier, 'utf8'), versions);
  if (!res.ok)
    echec([
      'Vérification : la base ne correspond pas au dépôt.',
      ...res.ecarts.map((e) => `  - ${e}`),
    ]);
  console.log(`Vérification : ${versions.length} migrations, base identique au dépôt.`);
}

// Registers the parts of the database URL as masked values, so that a CLI
// message quoting the host, the user or a decoded password is hidden too.
// Never prints the URL, not even in an error: `new URL` puts its input on the
// thrown error, so the error is swallowed and replaced.
function masquerUrl() {
  const brut = process.env.SUPABASE_DB_URL ?? '';
  if (!brut) echec(['Le secret SUPABASE_DB_URL est absent de l’environnement production.']);
  let u;
  try {
    u = new URL(brut);
  } catch {
    echec(['Le secret SUPABASE_DB_URL n’est pas une adresse de connexion lisible.']);
  }
  const parts = new Set();
  // Measured with CLI 2.84.2 on a refused connection: the error quotes
  // `host=… user=…` (never the password). A pooler user is `postgres.<ref>`,
  // so the project identifier alone is masked too.
  const suffixeUtilisateur = u.username.includes('.')
    ? u.username.slice(u.username.indexOf('.') + 1)
    : '';
  for (const v of [u.password, u.username, suffixeUtilisateur, u.hostname, u.host]) {
    if (!v) continue;
    parts.add(v);
    try {
      parts.add(decodeURIComponent(v));
    } catch {
      // keep the raw form only
    }
  }
  for (const v of parts) if (v.length >= 4) process.stdout.write(`::add-mask::${v}\n`);
  if (!u.password) echec(['Le secret SUPABASE_DB_URL ne contient pas de mot de passe.']);
}

const estPrincipal =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (estPrincipal) {
  const args = process.argv.slice(2);
  const val = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (args.includes('--masquer-url')) masquerUrl();
  else if (args.includes('--verifier-attente'))
    verifierAttente(val('--verifier-attente'), val('--base'), val('--head'));
  else if (args.includes('--verifier-liste')) verifierListe(val('--verifier-liste'));
  else garde(val('--base'), val('--head'));
}
