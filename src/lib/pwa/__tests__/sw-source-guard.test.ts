import { describe, it, expect, vi } from 'vitest';
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
  // After these keywords an expression starts, so `/` opens a regex even
  // though the last significant character is a letter (`return /x/.test(u)`).
  // `(?<![\w$.])` keeps `foo.return` or `myreturn` out.
  const apresMotCle =
    /(?<![\w$.])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)\s*$/;
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
      (c === '/' && (prec === '' || avantRegex.includes(prec) || apresMotCle.test(out)))
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

  it('a regex literal right after return is read as a regex, not a comment', () => {
    // Tour 64 leftover: after `return` the last significant character is a
    // letter, so `/` was read as a division and the `/*` inside the regex
    // below opened a block comment that swallowed the code after it.
    const src = [
      'function isFont(u) {',
      '  return /^\\/fonts\\/*x/.test(u); // trailing',
      '}',
      'const apres = 1; /* fin */',
    ].join('\n');
    const code = sansCommentaires(src);
    expect(code).toContain('return /^\\/fonts\\/*x/.test(u);');
    expect(code).toContain('const apres = 1;');
    expect(code).not.toContain('trailing');
    expect(code).not.toContain('fin');
  });

  it('a division after an identifier is still a division', () => {
    const code = sansCommentaires('const r = total / parts; // half\nconst s = 2;');
    expect(code).toContain('const r = total / parts;');
    expect(code).toContain('const s = 2;');
    expect(code).not.toContain('half');
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

describe('public/sw.js — a simulated fetch event', () => {
  // Runs the real worker source against a fake `self`, `caches` and `fetch`.
  // The fake event behaves like the browser: `waitUntil` throws once the
  // promise given to `respondWith` has settled (InvalidStateError).
  function demarrer() {
    const handlers: Record<string, (e: unknown) => void> = {};
    const puts: string[] = [];
    const cache = {
      put: async (req: { url: string }) => {
        puts.push(req.url);
      },
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    };
    const fakeSelf = {
      location: { origin: 'https://ankora.test' },
      clients: { claim: async () => undefined },
      skipWaiting: () => undefined,
      addEventListener: (type: string, h: (e: unknown) => void) => {
        handlers[type] = h;
      },
    };
    const fakeCaches = {
      match: async () => undefined,
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    };
    const reseau = async () => ({ ok: true, clone: () => ({ copie: true }) });
    new Function('self', 'caches', 'fetch', SW)(fakeSelf, fakeCaches, reseau);
    return { handlers, puts };
  }

  it('writes the asset to the cache through event.waitUntil, without throwing', async () => {
    const { handlers, puts } = demarrer();
    expect(handlers.fetch, "no 'fetch' handler registered").toBeTypeOf('function');

    let reglee = false;
    let reponse: Promise<unknown> | undefined;
    const attentes: Promise<unknown>[] = [];
    const url = 'https://ankora.test/_next/static/chunks/app-505.js';
    const event = {
      request: { method: 'GET', url, mode: 'no-cors' },
      respondWith: (p: Promise<unknown>) => {
        reponse = Promise.resolve(p).finally(() => {
          reglee = true;
        });
      },
      waitUntil: (p: Promise<unknown>) => {
        if (reglee) throw new Error('InvalidStateError: waitUntil after respondWith settled');
        attentes.push(p);
      },
    };

    handlers.fetch!(event);
    expect(reponse, 'a cacheable asset must be answered by the worker').toBeDefined();
    await expect(reponse).resolves.toMatchObject({ ok: true });
    expect(attentes, 'the cache write must be handed to waitUntil').toHaveLength(1);
    await Promise.all(attentes);
    expect(puts).toEqual([url]);
  });

  it('leaves a non-asset request to the browser (no respondWith)', () => {
    const { handlers } = demarrer();
    const respondWith = vi.fn();
    handlers.fetch!({
      request: { method: 'GET', url: 'https://ankora.test/fr-BE/app?_rsc=1', mode: 'cors' },
      respondWith,
      waitUntil: vi.fn(),
    });
    expect(respondWith).not.toHaveBeenCalled();
  });
});

/**
 * Lot P3 (15 November 2026) — navigation preload.
 *
 * Every navigation used to wait for the worker to boot before its network
 * request even started. Navigation preload lets the browser start that request
 * in parallel; the worker then hands back `event.preloadResponse`. These tests
 * run the shipped worker against fakes and pin the three properties that make
 * it safe: the preload is always consumed, never doubled by a second fetch (a
 * one-shot `?code=` would be replayed), and a navigation never touches Cache
 * Storage except to read the `/offline` fallback.
 */
describe('public/sw.js — navigation preload (lot P3)', () => {
  type Options = { registration?: unknown; fetchImpl?: (req: unknown) => Promise<unknown> };
  const OFFLINE = { offline: true };

  function demarrer({ registration, fetchImpl }: Options = {}) {
    const handlers: Record<string, (e: unknown) => void> = {};
    const claim = vi.fn(async () => undefined);
    const fakeSelf: Record<string, unknown> = {
      location: { origin: 'https://ankora.test' },
      clients: { claim },
      skipWaiting: () => undefined,
      addEventListener: (type: string, h: (e: unknown) => void) => {
        handlers[type] = h;
      },
    };
    if (registration !== undefined) fakeSelf.registration = registration;
    const fakeCaches = {
      match: vi.fn(async (key: unknown) => (key === '/offline' ? OFFLINE : undefined)),
      open: vi.fn(async () => ({ put: vi.fn(), keys: async () => [], delete: vi.fn() })),
      keys: vi.fn(async () => ['ankora-v1-old-static']),
      delete: vi.fn(async () => true),
    };
    const reseau = vi.fn(fetchImpl ?? (async () => ({ fromFetch: true })));
    new Function('self', 'caches', 'fetch', SW)(fakeSelf, fakeCaches, reseau);
    return { handlers, claim, fakeCaches, reseau };
  }

  async function activer(registration?: unknown) {
    const h = demarrer({ registration });
    let attente: Promise<unknown> | undefined;
    h.handlers.activate!({
      waitUntil: (p: Promise<unknown>) => {
        attente = p;
      },
    });
    expect(attente, 'activate must hand its work to waitUntil').toBeDefined();
    await attente;
    return h;
  }

  /** Dispatches a navigation and returns what the worker answered with. */
  async function naviguer(
    h: ReturnType<typeof demarrer>,
    url: string,
    preload?: { value: Promise<unknown> } | 'absent',
  ) {
    let reponse: Promise<unknown> | undefined;
    const event: Record<string, unknown> = {
      request: { method: 'GET', url, mode: 'navigate' },
      respondWith: (p: Promise<unknown>) => {
        reponse = Promise.resolve(p);
      },
      waitUntil: vi.fn(),
    };
    if (preload && preload !== 'absent') event.preloadResponse = preload.value;
    h.handlers.fetch!(event);
    expect(reponse, `a navigation to ${url} must be answered by the worker`).toBeDefined();
    return reponse;
  }

  it('activate enables navigation preload, still purges old caches and claims', async () => {
    const enable = vi.fn(async () => undefined);
    const { claim, fakeCaches } = await activer({ navigationPreload: { enable } });
    expect(enable).toHaveBeenCalledTimes(1);
    expect(fakeCaches.delete).toHaveBeenCalledWith('ankora-v1-old-static');
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no registration at all', undefined],
    ['a registration without navigationPreload (WebKit < 15.4)', {}],
  ])('activate feature-detects: %s → no throw, claim still runs', async (_label, registration) => {
    const { claim } = await activer(registration);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('a rejected enable() never blocks activation', async () => {
    const enable = vi.fn(async () => {
      throw new Error('InvalidStateError');
    });
    const { claim } = await activer({ navigationPreload: { enable } });
    expect(enable).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('a preloaded response is returned as is, without a second request', async () => {
    const h = demarrer();
    const preloaded = { preloaded: true };
    const reponse = naviguer(h, 'https://ankora.test/app', {
      value: Promise.resolve(preloaded),
    });
    await expect(reponse).resolves.toBe(preloaded);
    expect(h.reseau).not.toHaveBeenCalled();
  });

  it('a redirect from the preload (next-intl 307) is passed through untouched', async () => {
    const h = demarrer();
    const redirect = { type: 'opaqueredirect', status: 0, redirected: false };
    await expect(
      naviguer(h, 'https://ankora.test/', { value: Promise.resolve(redirect) }),
    ).resolves.toBe(redirect);
    expect(h.reseau).not.toHaveBeenCalled();
  });

  it.each([
    ['preloadResponse absent (unsupported browser)', 'absent' as const],
    [
      'preloadResponse resolving to undefined (preload disabled)',
      { value: Promise.resolve(undefined) },
    ],
  ])('%s → falls back to one network fetch', async (_label, preload) => {
    const h = demarrer();
    await expect(naviguer(h, 'https://ankora.test/app', preload)).resolves.toEqual({
      fromFetch: true,
    });
    expect(h.reseau).toHaveBeenCalledTimes(1);
  });

  it('a rejected preload goes straight to /offline, never retried', async () => {
    const h = demarrer();
    await expect(
      naviguer(h, 'https://ankora.test/app', { value: Promise.reject(new TypeError('offline')) }),
    ).resolves.toBe(OFFLINE);
    expect(h.reseau).not.toHaveBeenCalled();
  });

  it('a failed fetch (no preload) falls back to /offline', async () => {
    const h = demarrer({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(naviguer(h, 'https://ankora.test/app', 'absent')).resolves.toBe(OFFLINE);
  });

  it('a one-shot OAuth code is requested once: preload present → no fetch, even on failure', async () => {
    // The navigate branch runs before isBypass, so /auth/callback is preloaded
    // too. A second request would replay the single-use `?code=`.
    const ok = demarrer();
    const preloaded = { preloaded: true };
    await expect(
      naviguer(ok, 'https://ankora.test/auth/callback?code=x', {
        value: Promise.resolve(preloaded),
      }),
    ).resolves.toBe(preloaded);
    expect(ok.reseau).not.toHaveBeenCalled();

    const ko = demarrer();
    await expect(
      naviguer(ko, 'https://ankora.test/auth/callback?code=x', {
        value: Promise.reject(new TypeError('network')),
      }),
    ).resolves.toBe(OFFLINE);
    expect(ko.reseau).not.toHaveBeenCalled();
  });

  it.each(['/app', '/en/app', '/nl-BE/app/charges', '/', '/login'])(
    'a navigation to %s never reads or writes Cache Storage for the page',
    async (path) => {
      for (const preload of ['absent' as const, { value: Promise.resolve({ preloaded: true }) }]) {
        const h = demarrer();
        await naviguer(h, `https://ankora.test${path}`, preload);
        expect(h.fakeCaches.open).not.toHaveBeenCalled();
        for (const [key] of h.fakeCaches.match.mock.calls) expect(key).toBe('/offline');
      }
      // And on failure, the only read is the offline fallback.
      const ko = demarrer();
      await naviguer(ko, `https://ankora.test${path}`, {
        value: Promise.reject(new TypeError('network')),
      });
      expect(ko.fakeCaches.match.mock.calls).toEqual([['/offline']]);
      expect(ko.fakeCaches.open).not.toHaveBeenCalled();
    },
  );
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

describe('public/sw.js — preload is never enabled without its consumer (lot P3)', () => {
  // The enabled state lives on the registration and outlives this file. A
  // worker that keeps enable() but stops reading preloadResponse would send
  // every navigation twice and replay single-use URLs (/auth/callback?code=).
  // Either the navigate branch consumes the preload, or activate disables it.
  /** Body of a top-level function: from its declaration to the next column-0 brace. */
  const corps = (nom: string) => {
    const debut = CODE.indexOf(`function ${nom}(`);
    if (debut < 0) return '';
    const fin = CODE.indexOf('\n}', debut);
    return CODE.slice(debut, fin < 0 ? undefined : fin + 2);
  };

  it('enable() implies the navigate branch awaits event.preloadResponse', () => {
    const active = CODE.includes('navigationPreload') && /\.enable\(\)/.test(CODE);
    const desactive = /navigationPreload[\s\S]{0,80}\.disable\(\)/.test(CODE);
    expect(active || desactive, 'preload is neither enabled nor disabled').toBe(true);
    if (!active) return;
    expect(CODE).toContain('event.respondWith(answerNavigation(event))');
    const answer = corps('answerNavigation');
    expect(answer, 'answerNavigation not found').not.toBe('');
    expect(answer).toContain('await event.preloadResponse');
    // The preload is read before any network request of the worker's own.
    expect(answer.indexOf('await event.preloadResponse')).toBeLessThan(answer.indexOf('fetch('));
  });
});
