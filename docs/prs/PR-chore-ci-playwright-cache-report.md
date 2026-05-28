# PR chore(ci) — Cache Playwright browsers between runs

> **Type** : `chore(ci)` — modification GitHub Actions workflow dédiée.
> **Doctrine** : post-Cowork — modif `.github/workflows/` interdite en PR feature, donc PR isolée obligatoire.
> **Diff** : `.github/workflows/ci.yml` job `e2e`, 1 étape remplacée par 4 étapes (cache + 2 paths d'install).
> **Plan-reviewer** : ✅ APPROVED (Opus, 2026-05-28) après 3 itérations (clé de cache enrichie, durcissement shell, DoD cache-hit mesurable).
> **Branche** : `chore/ci-playwright-cache` depuis `main` (commit `01a76bc`, post-PR #195).

---

## Contexte — flake résiduel post-PR #195

PR #195 (`chore(ci): bump Playwright timeout 20→30 min`, mergée le 2026-05-28 à `01a76bc`) a été mergée comme palliatif après 3 runs cancelled à 20 min exact sur 24 h (cf. `docs/prs/PR-chore-ci-playwright-timeout-report.md`).

Le rapport de cette PR notait déjà :

> Si la prochaine run Playwright E2E dépasse 25 minutes, c'est le signal pour ouvrir une PR dédiée :
>
> 1. Cache Playwright : ajouter `actions/cache@v4` sur le dossier binaires Playwright (`~/.cache/ms-playwright`) keyé par version Playwright + OS — évite le re-téléchargement Chromium/WebKit à chaque run.

Cette PR exécute exactement ce TODO. Le timeout 30 min est **conservé** comme marge de sécurité ; il sera réduit dans une PR future après 3-5 runs successifs sous 15 min.

## Diagnostic affiné

Le bump 30 min adressait le symptôme (jobs cancelled au plafond) mais pas la cause :

- L'étape `npx playwright install --with-deps chromium webkit` (ex-ligne 77) télécharge à **chaque run** :
  - Binaires Chromium (~170 Mo)
  - Binaires WebKit (~85 Mo)
  - System deps APT (libnss3, libatk, libgbm, libasound2, libxshmfence1, etc.)
- Sur runners GHA `ubuntu-latest` dont le réseau/disque varie, cette étape consomme 8-20 min sur les mois lents (mai 2026 documenté).
- Le code applicatif Ankora n'est pas en cause (baseline `#188` à ~7 min 21 s, `#189` à 7 min 50 s).

Sans cache, chaque PR paie le coût plein → instable structurellement.

## Solution — pattern officiel Playwright CI caching

[Playwright docs § CI caching](https://playwright.dev/docs/ci#caching-browsers) recommande exactement ce pattern pour GitHub Actions :

1. Extraire la version Playwright depuis `node_modules/@playwright/test/package.json` (résolue après `npm ci`, donc figée par le lockfile).
2. `actions/cache@v4` sur `~/.cache/ms-playwright` (path par défaut Linux pour les binaries Playwright).
3. Sur **cache miss** : `npx playwright install --with-deps` (binaires + APT).
4. Sur **cache hit** : `npx playwright install-deps` uniquement (binaires restaurés, mais APT toujours nécessaire car runner GHA éphémère).

### Logique de la clé de cache

```
playwright-${runner.os}-${runner.arch}-${version}-${hashFiles('package-lock.json')}
```

| Composant                        | Raison                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `runner.os` (`Linux`)            | Binaires Linux ≠ macOS ≠ Windows.                                                         |
| `runner.arch` (`X64`)            | Évite collision si GHA bascule arm64 un jour (incidents documentés sur ubuntu-24.04-arm). |
| `<version Playwright>`           | Bump Playwright = nouveaux binaires obligatoires.                                         |
| `hashFiles('package-lock.json')` | Invalide si lockfile change (bump transitive deps liées aux browsers).                    |

### Restore-keys partiel

```
restore-keys: |
  playwright-${runner.os}-${runner.arch}-${version}-
```

Si seul `package-lock.json` change sans bump Playwright (ex: bump unrelated transitive dep), le préfixe matche → binaires restaurés depuis le cache précédent, install-deps APT relancé. Évite un re-download inutile.

## Durcissements sécurité

- Étape Extract : `shell: bash` + `set -euo pipefail` pour échec fort si Node retourne un statut non-zéro ou si le pipe est cassé.
- Quote `"$GITHUB_OUTPUT"` (path peut contenir des espaces sur certains contextes).
- Pas de strip semver sur la version : elle vient du lockfile npm-installé, déjà figée par la chaîne d'approvisionnement npm. Tout strip serait du theater (la confiance commence et finit au lockfile).
- Étapes install : `run:` simple (bash GHA par défaut fournit `-e` qui suffit pour ces one-liners).

## Diff complet (`.github/workflows/ci.yml` job `e2e`)

**AVANT** (1 étape) :

```yaml
- run: npx playwright install --with-deps chromium webkit
```

**APRÈS** (4 étapes) :

```yaml
- name: Extract Playwright version
  id: playwright-version
  shell: bash
  run: |
    set -euo pipefail
    VERSION=$(node -p "require('@playwright/test/package.json').version")
    echo "version=$VERSION" >> "$GITHUB_OUTPUT"
- name: Cache Playwright browsers
  id: playwright-cache
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ runner.arch }}-${{ steps.playwright-version.outputs.version }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      playwright-${{ runner.os }}-${{ runner.arch }}-${{ steps.playwright-version.outputs.version }}-
- name: Install Playwright browsers (cache miss)
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps chromium webkit
- name: Install Playwright system deps (cache hit)
  if: steps.playwright-cache.outputs.cache-hit == 'true'
  run: npx playwright install-deps chromium webkit
```

## Quality gates locaux (avant push)

| Gate                      | Résultat                                           |
| ------------------------- | -------------------------------------------------- |
| `npm run lint`            | ✅ 0 erreur (6 warnings pré-existants, hors scope) |
| `npm run lint:use-server` | ✅ all async-only                                  |
| `npm run typecheck`       | ✅ 0 erreur                                        |
| `npm run test -- --run`   | ✅ 107 files / 1337 tests passés (27.04 s)         |
| `npm run build`           | ✅ Next.js build terminé                           |

> _Diff YAML pur n'impacte rien côté TS ; le rituel reste obligatoire (cf. CLAUDE.md projet)._

## DoD canonique (5 critères + preuve par l'usage)

1. **CI verte** sur cette PR — quality, security, e2e all green. Lighthouse skip sur PR (gated `push main`).
2. **2e run e2e validé en cache-hit** (clé essentielle de cette PR) :
   ```bash
   # Après 1er run CI vert (cache miss + save)
   gh run rerun <run-id>
   # Vérification cache-hit
   gh run view <new-run-id> --log | grep -E "Cache (restored from key|not found)"
   ```
   **Seuils mesurables** :
   - 2e run doit afficher `Cache restored from key: playwright-Linux-X64-<version>-<lockhash>`.
   - Étape "Install Playwright system deps (cache hit)" < 60 s (vs 2-3 min sans cache).
   - Total job `e2e` cache-hit < 15 min (vs 25-30 min observé pré-cache sur PR #191/#193).
3. **Sourcery silent** sur le dernier commit — YAML + MD only, skip attendu. Vérification :
   ```bash
   gh api repos/thierryvm/ankora/pulls/<N>/comments \
     --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
   ```
4. **Pas de conflit `main`** — branche créée depuis `01a76bc` (post-PR #195), pas d'autre PR concurrente sur `.github/workflows/ci.yml`.
5. **`mergeStateStatus` CLEAN** — `gh pr view <N> --json mergeStateStatus`.

## Hors scope (explicite)

- ❌ **Pas de réduction du timeout 30 min** : laissé en marge de sécurité. À réviser dans une PR future après 3-5 runs successifs sous 15 min.
- ❌ Pas d'optimisation parallèle / sharding Playwright (sujet à part, sera reconsidéré si suite caching insuffisant).
- ❌ Pas de modif des autres jobs (`quality`, `security`, `lighthouse`).
- ❌ Pas de modif du code applicatif, des configs Playwright (`playwright.config.ts`), ou des specs E2E.

## Références

- Pattern : [Playwright docs § CI caching browsers](https://playwright.dev/docs/ci#caching-browsers)
- Action : [actions/cache@v4](https://github.com/actions/cache)
- Incident d'origine : PR #195 + rapport `docs/prs/PR-chore-ci-playwright-timeout-report.md`
- Commit base : `01a76bc` (PR #195 merge sur `main`)
