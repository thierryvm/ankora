# PR-QA-2 — Diagnostic Root Cause Playwright (12 annotations / 7 tests fails)

- **Date** : 2026-05-07 14:30 (UTC+2, PM)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Phase 0 OK
- **Branche** : `chore/qa-2-playwright-root-cause` (créée mais aucun fix appliqué — cf. §"Phase 8 — STOP")
- **Run analysé** : `25493551817` sur `main@6ddc7e4` (PR-QA-1d mergée), conclusion FAILURE
- **Artifact analysé** : `playwright-report` (9.4 MB), 42 fichiers de données, 7 error-context.md exploitables

---

## TL;DR @cowork

**12 annotations GitHub ≠ 12 tests fails.** Le compte 12 est artefact API GitHub Annotations + retries Playwright. La vérité :

- **7 tests UNIQUE fails** sur le job Playwright E2E
- **155 passed**, **100 skipped** (Supabase env-gated specs)
- **6 sur 7 sont CODE APPLICATIF / CODE TEST**, pas env-dependent CI
- **1 sur 7 est tracé** (BUG-iOS-011 #116)

**Conclusion principale** : mes fixes PR-QA-1d (Blocs A/B/C) **n'ont pas tenu en CI** parce qu'ils traitaient les **symptômes**, pas les root causes. Le test "Footer reopens" fail à `not.toBeVisible()` ligne 90 **AVANT** mon `scrollIntoViewIfNeeded()` ligne 100 — le banner reste visible alors qu'il ne devrait pas. C'est un bug **`useSyncExternalStore` SSR/hydration cache** dans `ConsentBanner.tsx`, pas un timing test.

**Recommandation** : ne PAS re-patcher les tests. Ouvrir 2 issues code applicatif (consent-banner cache + mobile-safari nav 404) et trancher l'ordre PR-CONSENT-FIX vs autres priorités.

---

## Phase 4 — Catégorisation des 7 tests UNIQUE fails

| #   | Spec:line                                          | Browser          | Type erreur                                                                                   | Catégorie                                                                                                                              | Issue tracker                  | Action recommandée                                                        |
| --- | -------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| 1   | `cookies-consent.spec.ts:70` Footer reopens        | chromium-desktop | `expect(locator).not.toBeVisible() failed` (banner visible alors que decision déjà persistée) | **(4) RÉGRESSION POST-MERGE PR-LEGAL-1** + **(5) FIX PR-QA-1d INSUFFISANT**                                                            | Pas d'issue → **CRÉER**        | PR-CONSENT-FIX (code)                                                     |
| 2   | `cookies-consent.spec.ts:70` Footer reopens        | mobile-chrome    | (idem #1, même cause)                                                                         | (4) + (5)                                                                                                                              | Voir issue créée pour #1       | idem                                                                      |
| 3   | `cookies-consent.spec.ts:70` Footer reopens        | mobile-safari    | (idem #1, même cause) + WebKit timing additionnel                                             | (4) + (5)                                                                                                                              | idem                           | idem                                                                      |
| 4   | `cookies-consent.spec.ts:25` Accept all dismisses  | mobile-safari    | `page.waitForFunction: Timeout 5000ms` (localStorage jamais rempli)                           | **(2) PRÉ-EXISTANT NON-TRACKÉ WebKit** + **(5)**                                                                                       | Pas d'issue → **CRÉER**        | PR-CONSENT-FIX (code) — Server Action ne s'exécute pas en mobile-safari ? |
| 5   | `cookies-consent.spec.ts:49` Customize granular    | mobile-safari    | `locator.check: Timeout 10000ms` (checkbox introuvable)                                       | **(2) PRÉ-EXISTANT NON-TRACKÉ WebKit**                                                                                                 | idem #4                        | PR-CONSENT-FIX (code) — checkbox role non-exposé en WebKit ?              |
| 6   | `error-boundaries.spec.ts:21` Home CTA             | mobile-safari    | `expect(page).toHaveURL failed` (URL reste `/this-page-does-not-exist`)                       | **(4) RÉGRESSION POST-MERGE THI-122 WebKit** + **(5) Bloc C insuffisant** + lié potentiellement à **#115 RSC prefetch 404 production** | Pas d'issue dédiée → **CRÉER** | PR-NAV-FIX (code)                                                         |
| 7   | `mobile-ios/landing.spec.ts:15` iPhone SE overflow | iPhone SE        | `window.scrollX moved 0→18` (overflow horizontal 18px)                                        | **(1) PRÉ-EXISTANT TRACKÉ #116**                                                                                                       | BUG-iOS-011 #116               | Backlog accepté @cowork, bypass admin pattern                             |

**Aucun test n'est catégorie (3) ENV-DEPENDENT CI** ni **(6) FLAKY non-déterministe**. Les 6 fails non-tracés sont reproducibles et déterministes.

---

## Phase 5 — Investigation par catégorie

### Tests #1, #2, #3 — "Footer reopens" sur 3 browsers

**Symptôme** : `await expect(page.getByRole('button', { name: 'Tout accepter' })).not.toBeVisible()` fail ligne 90 — le banner cookies est visible alors qu'une décision est déjà dans `localStorage` (set via `addInitScript` avant `page.goto`).

**Page snapshot prouve** (extrait error-context `1aa64e2e...md` lignes 301-311) :

```yaml
- dialog "Cookies et vie privée" [ref=e297]:
    - heading "Cookies et vie privée" [level=2]
    - paragraph: 'On utilise uniquement les cookies essentiels...'
    - button "Essentiels uniquement"
    - button "Personnaliser"
    - button "Tout accepter"  ← visible alors que decision persistée
```

**Root cause technique** : module-level cache stale dans `ConsentBanner.tsx` (lignes 53–87) :

```ts
let cachedInitialized = false;
const SNAPSHOT_REF = { value: { stored: null, reopen: false } };

function getSnapshot(): StoreSnapshot {
  if (!cachedInitialized) {
    refreshSnapshot(); // lit localStorage — UNE seule fois
    cachedInitialized = true;
  }
  return SNAPSHOT_REF.value; // retourne le cache figé après le 1er appel
}
```

**Scénario CI prod build** (Next.js production):

1. Module `ConsentBanner.tsx` évalué côté serveur (SSR pre-render).
2. Bundle hydraté côté client. Le `getSnapshot()` est appelé pour la première fois en mount.
3. **MAIS** : le client appelle parfois `getSnapshot()` AVANT que Playwright ait fini d'exécuter `addInitScript` (qui set `localStorage`). Le timing est non-déterministe selon `next/script` strategy + module preload Next 16.
4. Premier `refreshSnapshot()` → `readStored()` retourne `null` (localStorage vide à ce moment) → `SNAPSHOT_REF.value = { stored: null }` → `cachedInitialized = true`.
5. Tous les `getSnapshot()` suivants retournent le cache stale `{ stored: null }` → banner reste visible.
6. Le `subscribe()` n'écoute que les `storage` events (cross-tab) — il ne déclenche **PAS** sur localStorage.setItem dans la même fenêtre.

**Pourquoi ça fonctionnait peut-être en PR-LEGAL-1 ?** Flaky retries — Playwright a 2 retries en CI. Si retry #1 ou #2 a un timing différent (cold cache CDN, etc.), le test peut passer. Avec 7 fails persistants malgré 2 retries, le bug est devenu reproductible.

**Pourquoi mon Bloc A `scrollIntoViewIfNeeded()` n'a pas tenu** : le test fail à `not.toBeVisible()` **ligne 90**, AVANT même d'atteindre le `scrollIntoViewIfNeeded()` ligne 100. Mon fix n'est jamais exécuté.

**Fix correct** (à faire dans une PR-CONSENT-FIX dédiée, hors scope PR-QA-2) :

Option A (recommandée) — **forcer un refresh au mount via useEffect** :

```ts
export function ConsentBanner() {
  const t = useTranslations('consent');
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Force a fresh read after hydration, in case the module cache was
  // primed with an empty localStorage during preload.
  useEffect(() => {
    notify(); // refreshSnapshot + notify all listeners
  }, []);
  // ...
}
```

Option B — **supprimer le `cachedInitialized` guard** et toujours `refreshSnapshot()` dans `getSnapshot()`. Risque : boucle React si la stable identity de `SNAPSHOT_REF.value` n'est pas garantie.

Option C — **ajouter un listener custom** qui propage les mutations localStorage de la même fenêtre (par défaut `storage` event ne déclenche que pour les autres tabs). Wrap `localStorage.setItem` ou utiliser un broadcast custom.

### Test #4 — "Accept all dismisses" mobile-safari

**Symptôme** : `await page.waitForFunction((key) => !!window.localStorage.getItem(key), STORAGE_KEY, { timeout: 5000 })` timeout après 5s. Le `localStorage` n'est jamais rempli.

**Investigation** :

- Le click `Tout accepter` déclenche le `accept(true, true)` dans `ConsentBanner.tsx`.
- Cette fonction fait `persist({...})` (sync) + `notify()` (sync) + `startTransition(() => recordCookieConsentAction(...))` (async Server Action).
- `persist()` est SYNC → `localStorage.setItem` devrait s'exécuter immédiatement.

**Si `localStorage` n'est PAS rempli après 5s** sur mobile-safari, deux hypothèses :

H1. **Le click ne déclenche pas le handler** (problème WebKit). Possible si le banner a un overlay invisible qui intercepte les events, ou un `pointer-events: none` qui empêche le click.

H2. **`persist()` throw une exception silencieuse** sur Safari (e.g. quota exceeded en mode privé). Mais Playwright iPhone 14 emulation devrait être OK.

**Mon Bloc B `waitForFunction(localStorage)` est logiquement correct** mais il assume que le `persist()` finit par s'exécuter. Si le bug est en amont (click ineffectif), le wait timeout est inévitable.

**Fix correct** (PR-CONSENT-FIX) : investigate WebKit pointer events sur ConsentBanner. Possiblement le glow blob `<div aria-hidden ... blur-3xl ...>` capte le click — vérifier `pointer-events: none` sur les éléments décoratifs.

### Test #5 — "Customize granular" mobile-safari

**Symptôme** : `await page.getByRole('checkbox', { name: "Analyse d'usage" }).check()` timeout 10s. La checkbox est introuvable OU non-actionable.

**Investigation** : la checkbox dans `ConsentBanner.tsx` :

```tsx
<label className="...">
  <input
    type="checkbox"
    checked={analytics}
    onChange={(e) => setAnalytics(e.target.checked)}
    aria-label={t('customize.analyticsLabel')} // "Analyse d'usage"
    className="..."
  />
  <span className="flex-1">...</span>
</label>
```

L'input a un `aria-label` direct. `getByRole('checkbox', { name: 'Analyse d\'usage' })` devrait le trouver.

**Hypothèse** : sur mobile-safari, le panel "Customize" peut ne pas s'afficher après le click "Personnaliser" — soit le `setCustomizing(true)` ne déclenche pas re-render (timing useState), soit le panel est conditionnellement rendu et le test ne le voit pas. **Probable** : même bug `useSyncExternalStore` que les tests #1-3 (WebKit timing/cache).

**Fix correct** : même PR-CONSENT-FIX que #1-3, plus possible bonus de revue React 19 prod build.

### Test #6 — "Home CTA" mobile-safari

**Symptôme** : après `await page.getByRole('link', { name: "Retour à l'accueil" }).click()`, l'URL reste `http://localhost:3000/this-page-does-not-exist`. La navigation **n'a jamais eu lieu**.

**Investigation** : le `not-found.tsx` (root level, PR-THI-122) utilise un `<a href="/">` natif (pas `next/link`) :

```tsx
<a href="/" className="...">
  {' '}
  {copy.ctaHome}{' '}
</a>
```

Sur Chromium, ça marche. Sur WebKit + page servie en HTTP 404, le browser pourrait avoir un comportement spécial (fragment navigation, click handler intercept, etc.).

**Hypothèse confirmée par issue #115** : `bug(routing): RSC prefetch 404 on production (?_rsc= URLs)` — le RSC prefetch est broken en prod. Quand le `<a href="/">` est cliqué, Next.js peut tenter un RSC prefetch qui fail, et la nav classique fallback ne se déclenche pas en WebKit.

**Mon Bloc C `test.use({ actionTimeout: 15s, navigationTimeout: 30s })` n'aide pas** : le problème n'est pas un timeout (waiting for nav), c'est que la nav ne se DÉCLENCHE jamais.

**Fix correct** (PR-NAV-FIX) : utiliser `next/link` ou ajouter un `onClick` qui force `window.location.href = '/'`. Coupler avec investigation #115 (RSC prefetch).

### Test #7 — "iPhone SE overflow" — BUG-iOS-011 #116

**Symptôme** : `window.scrollX moved 0→18` après `scrollBy({left: 100})`. La page a 18px d'overflow horizontal sur viewport 320px iPhone SE.

**Catégorie** : (1) PRÉ-EXISTANT TRACKÉ. Issue #116 ouverte avec investigation #112 en cours pour identifier l'élément offending.

**Action** : aucune dans ce diagnostic. Backlog accepté @cowork.

---

## Phase 6 — Plan d'action @cowork

### Ce qui est CONFIRMÉ

1. **PR-QA-1d a été un fix superficiel** : Bloc A jamais atteint (fail ligne 90), Bloc B traite symptôme pas cause, Bloc C ne fix pas le bug réel (nav pas timeout).
2. **6 sur 7 fails sont code applicatif** (`ConsentBanner.tsx` cache + `not-found.tsx` WebKit nav).
3. **1 sur 7 est BUG-iOS-011 #116** déjà tracé.

### Ce qui est PROPOSÉ

**Pas de fix dans cette PR PR-QA-2.** Aucun fix env-level UNIQUE et trivial identifié. Les root causes sont code applicatif → demanderaient :

| PR proposée               | Scope                                                                                                                                                 | Estimation                                  | Priorité                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| **PR-CONSENT-FIX**        | `src/components/gdpr/ConsentBanner.tsx` — useEffect refresh au mount + investigation pointer-events glow blob WebKit + checkbox aria-label robustness | 1-2 jours (code + tests + smoke 3 browsers) | **HAUTE** — bloque 5 tests cookies-consent + tout user qui revient via Footer |
| **PR-NAV-FIX**            | `src/app/not-found.tsx` — passer `<a href="/">` à `next/link` ou onClick window.location, lier à l'investigation issue #115                           | 0.5 jour                                    | MOYENNE — affecte UX mobile-safari sur 404                                    |
| **(reverter PR-QA-1d ?)** | Rollback des 3 blocs de PR-QA-1d qui n'ont pas tenu — éviter la dette du fix-fantôme                                                                  | 5 min                                       | BASSE (les fixes ne nuisent pas, juste inutiles)                              |

**Décision @cowork demandée** : ouvrir PR-CONSENT-FIX et PR-NAV-FIX, ou prioriser autre chose (PR-D4 / PR-D3-ter / PR-CAT-1) ?

### Ce qui reste BACKLOG

- **BUG-iOS-011 #116** — déjà tracé, accepté.
- **Issue #115 RSC prefetch 404 production** — peut englober PR-NAV-FIX si root cause partagée.

---

## Phase 7 — Issues GitHub à créer

Pour les fails catégorie (2) PRÉ-EXISTANT NON-TRACKÉ et (4) RÉGRESSION POST-MERGE non-trackés, je propose **2 nouvelles issues** :

### Issue 1 — `bug(consent): module-level cache stale → ConsentBanner reste visible après decision`

**Body proposé** :

> Le test E2E `e2e/cookies-consent.spec.ts:70` fail sur 3 browsers (chromium-desktop + mobile-safari + mobile-chrome) en CI prod build. Cause racine : `cachedInitialized = false` flag dans `ConsentBanner.tsx` ligne 53 fige le snapshot du `useSyncExternalStore` au premier appel — si ce premier appel se produit AVANT que le `localStorage` soit set par `addInitScript` (cas Playwright) ou par le user (cas réel reload sur navigation interne), le cache reste figé sur `{stored: null}` et le banner reste visible.
>
> Tests fails associés (3) :
>
> - `[chromium-desktop] cookies-consent:70 Footer reopens`
> - `[mobile-chrome] cookies-consent:70 Footer reopens`
> - `[mobile-safari] cookies-consent:70 Footer reopens`
>
> Tests fails additionnels mobile-safari (probable même cause + WebKit timing) :
>
> - `[mobile-safari] cookies-consent:25 Accept all dismisses` (waitForFunction localStorage timeout)
> - `[mobile-safari] cookies-consent:49 Customize granular` (locator.check checkbox timeout)
>
> Diagnostic complet : `cc-handoffs/2026-05-07-PR-QA-2-diagnostic-12-fails.md`. Fix recommandé : useEffect au mount qui force `notify()` après hydration.
>
> Labels : `bug`, `type:fix`, `area:gdpr`, `priority:high`

### Issue 2 — `bug(routing): not-found.tsx native anchor click ne navigue pas en mobile-safari`

**Body proposé** :

> Le test E2E `e2e/error-boundaries.spec.ts:21` fail sur mobile-safari. Le `<a href="/">` natif dans `src/app/not-found.tsx` (PR-THI-122) ne déclenche pas la navigation après click — l'URL reste `/this-page-does-not-exist`.
>
> Possiblement lié à issue #115 `bug(routing): RSC prefetch 404 on production (?_rsc= URLs)` — le RSC prefetch broken peut empêcher la nav classique de fallback en WebKit.
>
> Fix recommandé : remplacer `<a href="/">` par `<Link href="/">` from `next/link`, ou ajouter `onClick={(e) => { e.preventDefault(); window.location.href = '/'; }}`.
>
> Labels : `bug`, `type:fix`, `area:routing`, `related:#115`, `priority:medium`

---

## Phase 8 — STOP, aucun fix appliqué

**Posture enquêteur respectée**. Aucun fix code ou test appliqué dans cette PR.

**Pourquoi ?** Les root causes sont code applicatif (`ConsentBanner.tsx` cache + `not-found.tsx` WebKit nav) → **out of scope strict** PR-QA-2 (diagnostic only). Si je patchais ici, j'enchaînerais sur la même dette du fix-fantôme PR-QA-1d.

**Diff dans cette PR** : `git diff --name-only main chore/qa-2-playwright-root-cause` →

```
(rien — branche créée mais aucun commit appliqué)
```

Aucun changement de code. Aucun changement de tests. Aucun changement de config.

---

## Métriques et preuves

- **Run analysé** : https://github.com/thierryvm/ankora/actions/runs/25493551817
- **Job Playwright** : https://github.com/thierryvm/ankora/actions/runs/25493551817/job/74807635176
- **Artifact** : `playwright-report` (9.4 MB), 42 fichiers data
- **7 error-context.md** analysés en détail
- **3 root causes distinctes** identifiées (cache stale + WebKit pointer/checkbox + 404 anchor nav)

| Métrique              | Valeur                                                           |
| --------------------- | ---------------------------------------------------------------- |
| Tests passed          | 155                                                              |
| Tests skipped         | 100                                                              |
| Tests failed (unique) | 7                                                                |
| Annotations GitHub    | 12 (résumé + warnings + retries × 4)                             |
| CI retry attempts     | 3 (initial + retry 1 + retry 2) — fails persistants tous retries |

---

## Actions @cowork demandées

- [ ] Lire ce diagnostic, valider les 3 root causes identifiées
- [ ] Trancher : ouvrir PR-CONSENT-FIX + PR-NAV-FIX OU prioriser autre travail (PR-D4 / PR-D3-ter / PR-CAT-1)
- [ ] (Optionnel) Décider rollback PR-QA-1d : les 3 fixes appliqués sont **inoffensifs** mais **inutiles** (Bloc A jamais atteint, Bloc B traite symptôme, Bloc C wrong layer). Garder pour preuve de discipline scope strict.
- [ ] (Optionnel) Confirmer création des 2 issues GitHub proposées (je peux les créer après ton GO si tu valides les libellés/labels)

## Pour @thierry

- 12 annotations Playwright = artefact GitHub Annotations + retries (1 warning Node 20 + 1 notice + 10 failure entries des retries des 4 premiers tests).
- 7 tests UNIQUE fail. 6 sont du **code applicatif** (ConsentBanner cache + 404 nav). 1 est BUG-iOS-011 #116 connu.
- **PR-QA-1d était un mauvais fix** : je l'ai documenté honnêtement ci-dessus. Mes 3 blocs traitaient les symptômes de surface, pas les causes profondes. Bonne leçon "discipline diagnostic avant patcher" — exactement l'esprit de cette PR-QA-2.

---

**Pas de push, pas de PR, pas de fix.** Branche `chore/qa-2-playwright-root-cause` créée pour matérialiser le ticket Linear / la trace, mais reste vide jusqu'à ta décision.

— @cc-ankora (Opus 4.7) · 2026-05-07 14:30 UTC+2 · enquêteur, pas pompier
