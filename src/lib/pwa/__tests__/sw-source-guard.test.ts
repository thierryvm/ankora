import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde source sur `public/sw.js`.
 *
 * `public/sw.js` n'est ni compilé, ni typé, ni importé : aucun test unitaire ne
 * peut l'atteindre, et aucun outil de ce dépôt ne le regarde. Tout le mécanisme
 * de mise à jour repose pourtant sur **l'absence** d'un appel : un contributeur
 * qui remet `self.skipWaiting()` dans `install` fait disparaître l'état
 * `waiting`, donc la détection, donc le bandeau — et **rien ne rougit**.
 *
 * C'est exactement la famille de défauts que `silent-failure-auditor` traque :
 * un garde-fou dont l'arrêt ne se voit nulle part. Même méthode que
 * `sheet-is-the-only-modal.test.ts` — lire la source et l'assertionner.
 */
const SW = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

/**
 * Le code, sans les commentaires.
 *
 * Le premier jet de ce garde échouait sur le commentaire qui explique pourquoi
 * `skipWaiting()` ne doit PAS être là : il en épelle le nom. Une sonde qui lit
 * un fichier comme du texte brut doit d'abord retirer ce qui n'est pas exécuté,
 * sinon elle juge la prose. Même leçon que la classe Tailwind épelée dans une
 * JSDoc (cf. `CLAUDE.md`, porte du 29/07).
 */
const CODE = sansCommentaires(SW);

/**
 * Tour 64 — a two-regex strip (block comments, then line comments) read the
 * `/*` inside « // /fonts/*.ttf » as the start of a block comment and swallowed
 * every line of code down to the next `*\/`. This reader walks the source once
 * and knows when it is inside a string, a template or a regex literal.
 */
function sansCommentaires(src: string): string {
  let out = '';
  let i = 0;
  // Last significant character emitted: decides whether `/` opens a regex.
  let prec = '';
  const avantRegex = '(,=:[!&|?{};+-*%<>~^';
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const fin = src.indexOf('*/', i + 2);
      i = fin === -1 ? src.length : fin + 2;
      out += ' ';
      continue;
    }
    if (
      c === "'" ||
      c === '"' ||
      c === '`' ||
      (c === '/' && (prec === '' || avantRegex.includes(prec)))
    ) {
      let j = i + 1;
      let classe = false;
      while (j < src.length) {
        const d = src[j]!;
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (c === '/' && d === '[') classe = true;
        else if (c === '/' && d === ']') classe = false;
        else if (d === c && !classe) break;
        j++;
      }
      out += src.slice(i, j + 1);
      prec = c;
      i = j + 1;
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prec = c;
    i++;
  }
  return out;
}

describe('sansCommentaires — the probe strips comments, never code', () => {
  it('a line comment spelling /fonts/*.ttf does not swallow the code after it', () => {
    const src = [
      '// /fonts/*.ttf HTML-404 poison.)',
      "const garde = 'gardé';",
      '/* fin */ const apres = 1;',
    ].join('\n');
    const code = sansCommentaires(src);
    expect(code).toContain("const garde = 'gardé';");
    expect(code).toContain('const apres = 1;');
    expect(code).not.toContain('poison');
    expect(code).not.toContain('fin');
  });

  it('keeps strings and regex literals that contain // or /*', () => {
    const src = [
      "const u = 'https://ankora.be/*';",
      'const r = /^\\/(?:fonts\\/)|\\.(?:ttf)$/; // trailing',
      'const s = "a/*b";',
    ].join('\n');
    const code = sansCommentaires(src);
    expect(code).toContain("'https://ankora.be/*'");
    expect(code).toContain('/^\\/(?:fonts\\/)|\\.(?:ttf)$/;');
    expect(code).toContain('"a/*b"');
    expect(code).not.toContain('trailing');
  });

  it('the real sw.js keeps every handler after its comments', () => {
    for (const h of ['install', 'activate', 'message', 'fetch'])
      expect(CODE).toContain(`addEventListener('${h}'`);
    expect(CODE).toContain('const CACHEABLE_ASSET');
    // Declared right after the « /fonts/*.ttf » line comment.
    expect(CODE).toContain('const MAX_BUILD_ASSETS');
  });
});

describe('public/sw.js — runtime caching lives inside the event lifetime', () => {
  it('the fetch handler hands its cache write to event.waitUntil', () => {
    // Without it the browser may stop the worker once the response is
    // returned, before cache.put and the trim have run.
    const debut = CODE.indexOf("addEventListener('fetch'");
    expect(debut, "le gestionnaire 'fetch' est introuvable").toBeGreaterThanOrEqual(0);
    const fetchHandler = CODE.slice(debut);
    const attente = fetchHandler.indexOf('event.waitUntil(');
    expect(attente, 'aucun event.waitUntil dans fetch').toBeGreaterThanOrEqual(0);
    expect(fetchHandler.indexOf('cache.put(', attente)).toBeGreaterThan(attente);
    expect(fetchHandler.slice(attente)).toContain('trimBuildAssets(');
  });
});

describe('public/sw.js — garde source du mécanisme de mise à jour', () => {
  it("n'active PAS le worker automatiquement à l'installation", () => {
    // Le seul `skipWaiting()` toléré est celui du gestionnaire de message.
    // Un appel dans `install` supprimerait l'état `waiting` : plus rien à
    // détecter, plus rien à annoncer, et la PWA installée redeviendrait
    // impossible à mettre à jour sur iPhone.
    const debut = CODE.indexOf("addEventListener('install'");
    const fin = CODE.indexOf("addEventListener('activate'");
    // Sans ces deux assertions, un marqueur renomme rendrait `-1` et le `slice`
    // verifierait silencieusement la mauvaise portion du fichier : le garde
    // passerait au vert en ne gardant plus rien. Un garde-fou qui echoue OUVERT
    // est pire que pas de garde-fou.
    expect(debut, "le gestionnaire 'install' est introuvable").toBeGreaterThanOrEqual(0);
    expect(fin, "le gestionnaire 'activate' est introuvable").toBeGreaterThanOrEqual(0);
    expect(fin).toBeGreaterThan(debut);

    const install = CODE.slice(debut, fin);
    expect(install).not.toContain('skipWaiting');
  });

  it('active le worker sur demande explicite du client', () => {
    expect(CODE).toContain("addEventListener('message'");
    expect(CODE).toContain('SKIP_WAITING');
    expect(CODE).toContain('self.skipWaiting()');
  });

  it('revendique les clients à l’activation', () => {
    // `clients.claim()` reste nécessaire : sans lui, le worker fraîchement
    // activé ne contrôlerait pas le document déjà ouvert, et le rechargement
    // qui suit repartirait sous l'ancien.
    expect(CODE).toContain('clients.claim()');
  });

  it('sert les navigations par le réseau, jamais par le cache', () => {
    // Propriété dont dépend la phrase « le HTML et le JavaScript neufs
    // arrivent tout de suite » : c'est elle qui rend l'interface de détection
    // présente dès la première ouverture après un déploiement.
    expect(CODE).toContain("request.mode === 'navigate'");
  });
});
