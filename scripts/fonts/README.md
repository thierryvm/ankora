# Self-hosted fonts — how they are built

The fonts under `public/fonts/<family>/` are subsets built from upstream sources by
`build-fonts.py`, described by `fonts.json` and checked by `__tests__/fonts.test.ts` and
`e2e/fonts.spec.ts`. Nothing here runs in CI or from `package.json`: rebuilding is a
deliberate, manual act.

## What `fonts.json` holds

- `upstream` + `sources` — google/fonts pinned at one commit; each source's path, size, git
  blob SHA-1 and SHA-256.
- `licences` — each family's `OFL.txt`, copied unmodified next to its fonts.
- `ranges` — the `latin` and `latin-ext` unicode ranges. They are disjoint, so a French,
  Dutch, German or Spanish page never downloads a latin-ext file.
- `required` — characters every output of a range must map. A missing one fails the test
  unless it is listed under that output's `exceptions`, with its reason.
- `outputs` — for each file: stable `name`, hashed `file`, family, style, weight, axes
  pinned (`pin`) and kept (`axes`), the exact OpenType `features` that survive, `alias`
  (a code point mapped to another's glyph), size budget, `preload` scope, size and SHA-256.

## Rebuild

1. **Tools**, in a throwaway virtual environment outside the repository (versions must
   equal `fonts.json`, the script refuses otherwise):

   ```bash
   python -m venv <venv>
   <venv>/bin/python -I -m pip install "fonttools==4.68.0" "brotli==1.2.1"
   ```

2. **Sources**, into a new empty directory, keeping the upstream paths. For each entry of
   `sources` and `licences`, download `upstream.rawBase` + its path (brackets and commas
   URL-encoded), for example:

   ```bash
   curl -fL -o "<src>/ofl/inter/Inter[opsz,wght].ttf" \
     "https://raw.githubusercontent.com/google/fonts/<commit>/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
   ```

   The script checks every SHA-256 before building and stops on a mismatch.

3. **Build** into a directory that does not exist yet (it is written atomically):

   ```bash
   <venv>/bin/python -I scripts/fonts/build-fonts.py --sources <src> --out <new-dir>
   ```

   Each output is named `<name>.<first 8 hex of its SHA-256>.woff2`. `/fonts/` is served
   `immutable` for a year, so new bytes always get a new URL. Two runs with the same
   inputs give byte-identical files.

4. **Publish**: replace the woff2 files in `public/fonts/<family>/` with the new ones,
   copy each printed `file`, `bytes` and `sha256` into `fonts.json`, then regenerate the
   `@font-face` block of `src/app/globals.css` from:

   ```bash
   <venv>/bin/python -I scripts/fonts/build-fonts.py --print-css
   ```

   If a preloaded file changed name, update `FONT_PRELOADS` in `src/lib/fonts.tsx`.

5. **Check**: `npx vitest run scripts/fonts` and `npx playwright test e2e/fonts.spec.ts`.
   The tests fail on any drift between the files, `fonts.json`, the CSS and the preloads.

## Bumping the upstream commit

Change `upstream.commit` and `rawBase`, download, record each source's new size, git blob
SHA-1 (`git hash-object <file>`) and SHA-256, then rebuild. Before publishing, read each new
`OFL.txt` copyright statement: a "Reserved Font Name" would forbid publishing our subsets
under the original name (the test also checks this).
