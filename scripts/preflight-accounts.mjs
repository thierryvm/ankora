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
  vercelLogin: 'thierryvm',
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

// Mode `--local` : uniquement les vérifications sans réseau. Utilisé par le
// hook pre-commit, où l'on veut attraper une identité git erronée AVANT que des
// commits mal attribués n'existent, sans payer un aller-retour réseau à chaque
// `git commit`.
const LOCAL_ONLY = process.argv.includes('--local');

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

// Troisième état, distinct d'un succès comme d'un échec : l'outil que la
// vérification interroge n'est pas installé, donc l'opération qu'elle protège
// est de toute façon impossible depuis cette machine. Le compter comme un échec
// ferait échouer le préflight en permanence chez qui n'a pas la CLI — et un
// garde-fou qu'on prend l'habitude de contourner ne garde plus rien.
// Une CLI PRÉSENTE qui répond mal reste un ❌.
const skip = (name, detail) => results.push({ name, skipped: true, detail });

// Sous Windows, les binaires installés globalement par npm sont des `.cmd`, et
// Node ≥ 20 refuse de les lancer sans shell (durcissement CVE-2024-27980,
// erreur `EINVAL`). `gh` et `supabase` sont de vrais exécutables et n'en ont pas
// besoin ; `vercel` si. On passe donc par le shell UNIQUEMENT sur Windows, avec
// des arguments codés en dur — aucune entrée utilisateur n'entre ici.
// Sur Windows la commande complète part en UNE chaîne, sans tableau d'arguments :
// Node déprécie la combinaison `shell:true` + args (les arguments y sont
// concaténés sans échappement). Ici tout est littéral, mais un avertissement de
// dépréciation dans la sortie d'un garde-fou est du bruit — et le bruit est ce
// qui fait qu'on cesse de lire un garde-fou.
const runCli = (name, args) => {
  const onWindows = process.platform === 'win32';
  const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  return onWindows
    ? execFileSync(`${name}.cmd ${args.join(' ')}`, [], { ...opts, shell: true })
    : execFileSync(name, args, opts);
};

// « L'outil est-il installé ? » se décide sur un code de sortie, jamais sur le
// texte d'une erreur : avec `shell:true`, une commande absente produit un
// message TRADUIT par le système (« n'est pas reconnu… » sur un Windows
// français). Une regex anglaise y échouait en silence, et la vérification
// tombait en ❌ au lieu de se déclarer non applicable.
const hasBinary = (name) => {
  try {
    // `where` et `which` sont de vrais exécutables : pas de shell, et leur code
    // de sortie ne dépend pas de la langue du système.
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const fingerprint = (value) =>
  createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

// Emplacements d'installation connus de `gh`, consultés UNIQUEMENT si le PATH ne
// donne rien. Motif : `gh` est bien installé et bien présent dans le PATH
// *persistant*, mais un process démarré AVANT l'installation garde son PATH
// d'origine. Le hook pre-push hérite alors d'un environnement où `gh` est
// introuvable, et le préflight rend ❌ alors que rien n'est cassé — un faux
// NO-GO, c'est-à-dire précisément ce qui apprend à taper `--no-verify`.
// Une absence RÉELLE de la CLI reste un ❌ : cf. l'asymétrie documentée en 1).
const GH_FALLBACK_DIRS =
  process.platform === 'win32'
    ? [
        join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links'),
        join(
          process.env.LOCALAPPDATA ?? '',
          'Microsoft',
          'WinGet',
          'Packages',
          'GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe',
          'bin',
        ),
        join(process.env.ProgramFiles ?? '', 'GitHub CLI', 'bin'),
        join(process.env.LOCALAPPDATA ?? '', 'Programs', 'GitHub CLI', 'bin'),
      ]
    : ['/usr/local/bin', '/usr/bin', '/opt/homebrew/bin'];

// Renvoie de quoi lancer `gh` — le nom nu s'il est sur le PATH, sinon un chemin
// absolu — ou `null` si la CLI est réellement absente de la machine.
const resolveGh = () => {
  if (hasBinary('gh')) return 'gh';
  const exe = process.platform === 'win32' ? 'gh.exe' : 'gh';
  for (const dir of GH_FALLBACK_DIRS) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

// ── 1) Compte GitHub actif ───────────────────────────────────────────────────
// Ankora n'a pas de token GitHub dans .env.local : l'accès passe par la CLI
// `gh`. C'est aussi là qu'est le vrai risque — le compte ACTIF de la CLI, pas
// un token de service.
//
// Asymétrie assumée avec 4bis et 6bis : `gh` absente reste un ❌, là où
// `supabase` ou `vercel` absentes se déclarent non applicables. La raison tient
// en une phrase — sans la CLI Supabase on ne peut pas migrer, sans la CLI Vercel
// on ne peut pas déployer, donc le risque disparaît avec l'outil ; alors que
// `git push` fonctionne très bien sans `gh`, par un autre assistant
// d'identifiants. Le risque, lui, reste entier.
const ghBin = LOCAL_ONLY ? null : resolveGh();
if (LOCAL_ONLY) {
  // Sauté volontairement : seul appel réseau du script.
} else if (!ghBin) {
  check(
    'Compte GitHub actif',
    false,
    'CLI `gh` introuvable — ni dans le PATH, ni aux emplacements d’installation connus',
  );
} else
  try {
    const login = execFileSync(ghBin, ['api', 'user', '--jq', '.login'], {
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

// ── 4bis) Compte Supabase réellement utilisé par la CLI ──────────────────────
// Distinct du 4) : celui-ci lit un FICHIER sur le disque, qui peut désigner le
// bon projet pendant que la CLI est authentifiée sur un AUTRE compte. Le fichier
// dirait GO et la commande partirait ailleurs.
//
// @thierry a deux comptes Supabase. Le premier porte une organisation nommée
// « ankora » qui ne contient QUE le projet airsoft ; `ankora-prod` vit sur le
// second. Le 27 juillet 2026 il a interrogé le mauvais projet depuis le
// dashboard et lu le schéma d'une autre application — vingt minutes à croire à
// une dérive de schéma en production.
//
// On demande donc à la CLI ce qu'elle voit, avec les identifiants qu'elle
// utilisera vraiment. Voir le projet attendu ET le voir marqué `linked` est la
// seule preuve qui vaille.
if (!LOCAL_ONLY && !hasBinary('supabase')) {
  skip('Compte Supabase actif', 'CLI `supabase` absente — aucune migration possible d’ici');
} else if (!LOCAL_ONLY) {
  try {
    const raw = runCli('supabase', ['projects', 'list', '-o', 'json']);
    // La CLI a livré les deux formes selon les versions : un tableau nu avec
    // `-o json`, un objet `{ projects: [...] }` sans. On accepte les deux.
    const parsed = JSON.parse(raw);
    const projects = Array.isArray(parsed) ? parsed : (parsed.projects ?? []);
    const target = projects.find((p) => p.ref === EXPECTED.supabaseRef);
    check(
      'Compte Supabase actif',
      Boolean(target?.linked),
      target
        ? target.linked
          ? `voit ${target.name} et le considère lié`
          : `voit ${target.name} mais NON lié — \`supabase link\` ?`
        : `le compte actif ne voit PAS ${EXPECTED.supabaseRef} (${projects.length} projet(s) visible(s)) — mauvais compte Supabase`,
    );
  } catch (error) {
    check('Compte Supabase actif', false, `supabase a échoué : ${error.message.split('\n')[0]}`);
  }
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
// `vercel link` produit DEUX formes de lien selon qu'on lie un projet ou le
// dépôt entier, et elles n'écrivent pas le même fichier :
//   - scope projet : `.vercel/project.json` → { orgId, projectId }
//   - scope dépôt  : `.vercel/repo.json`    → { projects: [{ id, orgId, directory }] }
//
// N'accepter que la première rendait un NO-GO PERMANENT sur une machine liée en
// scope dépôt — donc sur un dépôt pourtant correctement lié. Mesuré ici du
// 29 juillet au 1er août 2026 : `--no-verify` était devenu le seul moyen de
// committer, ce qui emportait aussi le contrôle de compte du pre-push. Un
// garde-fou qu'on prend l'habitude de contourner ne garde plus rien.
//
// Accepter les deux ne baisse pas la barre : les deux formes portent les MÊMES
// identifiants (organisation + projet), donc la vérification par empreinte est
// rigoureusement identique. C'est le LIEN qui est validé, pas le fichier qui le
// porte — et un lien vers le mauvais compte reste un ❌ dans les deux cas.
const readVercelLink = () => {
  const projectPath = join(repoRoot, '.vercel', 'project.json');
  if (existsSync(projectPath)) {
    const { orgId, projectId } = JSON.parse(readFileSync(projectPath, 'utf8'));
    return { orgId, projectId, source: 'project.json' };
  }

  const repoPath = join(repoRoot, '.vercel', 'repo.json');
  if (existsSync(repoPath)) {
    const { projects } = JSON.parse(readFileSync(repoPath, 'utf8'));
    const entries = Array.isArray(projects) ? projects : [];
    // Un lien de scope dépôt mappe des RÉPERTOIRES vers des projets. Ankora
    // n'est pas un monorepo : l'entrée qui nous concerne est celle de la racine.
    // On ne se rabat sur l'entrée unique que s'il n'y en a qu'une — piocher au
    // hasard parmi plusieurs reviendrait à valider n'importe quel projet, et
    // c'est exactement le mélange perso/pro que ce script existe pour empêcher.
    const entry =
      entries.find((p) => p.directory === '.') ?? (entries.length === 1 ? entries[0] : undefined);
    if (!entry) {
      throw new Error(
        entries.length
          ? `repo.json ne décrit aucun projet pour la racine (${entries.length} entrées)`
          : 'repo.json ne contient aucun projet',
      );
    }
    return { orgId: entry.orgId, projectId: entry.id, source: 'repo.json' };
  }

  return null;
};

try {
  const link = readVercelLink();
  if (!link) {
    check(
      'Vercel projet lié',
      false,
      'aucun lien Vercel — ni .vercel/project.json ni .vercel/repo.json (`vercel link` ?)',
    );
  } else {
    const orgOk = fingerprint(link.orgId) === EXPECTED.vercelOrgFingerprint;
    const projectOk = fingerprint(link.projectId) === EXPECTED.vercelProjectFingerprint;
    check(
      'Vercel projet lié',
      orgOk && projectOk,
      orgOk && projectOk
        ? `organisation et projet correspondent (via ${link.source})`
        : `empreinte ${orgOk ? 'projet' : 'organisation'} différente (via ${link.source}) — lié au mauvais compte ?`,
    );
  }
} catch (error) {
  check('Vercel projet lié', false, `lien Vercel illisible : ${error.message.split('\n')[0]}`);
}

// ── 6bis) Compte Vercel réellement connecté ──────────────────────────────────
// Même raisonnement qu'en 4bis : `.vercel/project.json` est un fichier, pas une
// session. Un `vercel deploy` part sous le compte connecté à la CLI, et le
// projet pro vit sur un autre compte.
if (!LOCAL_ONLY && !hasBinary('vercel')) {
  skip('Compte Vercel actif', 'CLI `vercel` absente — aucun déploiement possible d’ici');
} else if (!LOCAL_ONLY) {
  try {
    const out = runCli('vercel', ['whoami']);
    // La commande préfixe sa sortie d'une ligne vide : on prend la dernière
    // ligne non vide plutôt que de faire confiance à la première.
    const login = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    check(
      'Compte Vercel actif',
      login === EXPECTED.vercelLogin,
      `login=${login ?? '(vide)'} (attendu ${EXPECTED.vercelLogin})`,
    );
  } catch (error) {
    check('Compte Vercel actif', false, `vercel a échoué : ${error.message.split('\n')[0]}`);
  }
}

// ── 7) URL applicative ───────────────────────────────────────────────────────
// `.env.local` est le fichier de DÉVELOPPEMENT : localhost y est la valeur
// attendue. La valeur de production (https://ankora.be) vit dans les variables
// d'environnement Vercel et n'a rien à faire ici. Les deux sont donc valides —
// ce qui ne l'est pas, c'est un domaine qui n'appartient à aucun des deux.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const isLocal = Boolean(appUrl?.includes('localhost') || appUrl?.includes('127.0.0.1'));
const isProd = Boolean(appUrl?.includes(EXPECTED.appHost));
check(
  'URL applicative',
  isLocal || isProd,
  appUrl
    ? `${appUrl} — ${isLocal ? `dev local (prod = ${EXPECTED.appHost}, définie côté Vercel)` : 'production'}`
    : 'NEXT_PUBLIC_APP_URL absent',
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
console.log(
  `\n  PREFLIGHT COMPTES — Ankora (projet personnel, thierryvm)${LOCAL_ONLY ? ' · mode local' : ''}\n`,
);

let allOk = true;
for (const r of results) {
  const mark = r.skipped ? '➖' : r.ok ? '✅' : '❌';
  console.log(`  ${mark}  ${pad(r.name, 24)} ${r.detail}`);
  if (!r.skipped && !r.ok) allOk = false;
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
