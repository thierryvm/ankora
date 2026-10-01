# sonner 2.0.8 — vendored copy

- **Origin**: `sonner@2.0.8` from npm (`dist/index.mjs`, `dist/index.d.mts`, `dist/styles.css`, `LICENSE.md`), MIT, © Emil Kowalski.
- **Removed**: the `__insertCSS` helper and its single call at module evaluation. It appended a `<style>` element without a nonce, which our CSP blocks: two `style-src` console errors on every production page.
- **Why that is safe**: the same stylesheet is served from `styles.css` here, imported by `src/app/globals.css` inside `layer(sonner)`. The CSP stays unchanged (allowing that `<style>` would also apply it unlayered, above our utilities: see the comment in `globals.css`).
- **Nothing else changed**: same code, same types. ESLint and Prettier skip this folder so the copy stays diffable against upstream.
- **Upgrading**: `npm pack sonner@<version>`, copy the four files, delete the `__insertCSS` function and its call again, diff against the previous copy, then run `npx vitest run src/lib/security/__tests__/vendor-sonner-no-style-injection.test.ts` (it fails while the injection is present).
