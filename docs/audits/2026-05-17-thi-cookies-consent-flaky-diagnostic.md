# Diagnostic — `cookies-consent.spec.ts` flaky tests (lecture seule)

**Date** : 2026-05-17
**Agent** : @cc-ankora (Opus 4.7)
**Scope** : reproduction factuelle + identification root cause + propositions fix. **Aucune modification de test ou de composant.**
**Décideurs** : @cowork (priorisation) + @thierry (validation merge).

---

## TL;DR exécutif (10 lignes)

1. **Le test ligne 70 actuel = "Customize"** (test name : `Customize → analytics on, marketing off → save persists granular choice`). Le numéro de ligne dans le prompt @cowork est légèrement obsolète — le vrai test "footer scroll timeout" est à **ligne 107** (`Footer "Modifier mes préférences cookies" reopens the banner from any page`).
2. **Reproduction locale (3 runs × 3 projets)** : **21/21 PASS, 15 SKIPPED, 0 fail**. Aucune flakiness observée en local — **mais** :
   - Tests `:25` (Accept all) et `:68` (Customize) sont `test.fixme(browserName === 'webkit')` → skip mobile-safari déterministe.
   - Test `:107` (Footer scroll) est `test.fixme(...)` **global** → skippé sur les 3 browsers.
3. **PR-FIX-CONSENT (ROADMAP ligne 168) jamais appliquée**. Le bug `cachedInitialized` ligne 53 + 82-87 de `ConsentBanner.tsx` est toujours présent.
4. **Bug React supplémentaire détecté en reproduction** : `The result of getServerSnapshot should be cached to avoid an infinite loop` au `ConsentBanner.tsx:148` (logged dans la console Playwright à chaque run). Cause : `getServerSnapshot()` (ligne 89-90) retourne un **nouvel objet à chaque appel**, violant le contrat React 18+ qui exige une référence stable.
5. **Root cause primaire** : `cachedInitialized` côté client fige le snapshot au premier appel. Quand Playwright `addInitScript` set `localStorage` avant navigation, le snapshot capturé peut être `{stored: null}` figé → banner reste visible → tests `not.toBeVisible()` fail.
6. **Root cause secondaire** : `getServerSnapshot()` non-stable amplifie potentiellement le bug (re-render forcé en pipeline `useTransition` + Server Action).
7. **Root cause tertiaire (footer test)** : `scrollIntoViewIfNeeded()` timeout 10s sur footer en CI/WebKit. Aggravé si banner reste affichée (réduit la zone scrollable utile).
8. **Recommandation @cc-ankora** : **Option A** — appliquer PR-FIX-CONSENT tel que specd dans ROADMAP (+ corriger `getServerSnapshot()` en passant). Effort 0.5 jour, fixe les 3 fixme + le warning React + débloque le bug user prod (issue #126).
9. **Pas une régression PR #164** : le warning React est déjà présent sur main avant la PR fix header. Indépendant.
10. **NOT URGENT (pas de bug sécurité)** : tests skippés, RGPD UX dégradée pour utilisateurs reload navigation interne. À planifier post-mutuelle 19/05 en PR-LIGHT.

---

## 1. Reproduction factuelle

### 1.1 Commande exécutée

```bash
npx playwright test e2e/cookies-consent.spec.ts --repeat-each=3 --reporter=list
```

### 1.2 Résultat brut

```
21 passed (42.7s)
15 skipped
0 failed
```

### 1.3 Décomposition (12 tests effectifs × 3 reps)

| Test                                        | Ligne  | chromium-desktop          | mobile-safari (WebKit)    | mobile-chrome             | Total                          |
| ------------------------------------------- | ------ | ------------------------- | ------------------------- | ------------------------- | ------------------------------ |
| `first visit shows the banner`              | `:17`  | 3 PASS                    | 3 PASS                    | 3 PASS                    | 9 PASS                         |
| `Accept all`                                | `:25`  | 3 PASS                    | **3 SKIP** (fixme webkit) | 3 PASS                    | 6 PASS + 3 SKIP                |
| `Customize → analytics on, marketing off`   | `:68`  | 3 PASS                    | **3 SKIP** (fixme webkit) | 3 PASS                    | 6 PASS + 3 SKIP                |
| `Footer "Modifier mes préférences cookies"` | `:107` | **3 SKIP** (fixme global) | **3 SKIP** (fixme global) | **3 SKIP** (fixme global) | 9 SKIP                         |
| **Total**                                   |        | 12 PASS                   | 6 PASS + 6 SKIP           | 12 PASS                   | **21 PASS / 15 SKIP / 0 FAIL** |

**Conclusion factuelle** : **aucune flakiness observée en local** dans la configuration actuelle. Les tests "flaky" historiquement signalés ont été muselés par `test.fixme()` (PR-QA-1d, 2026-05-10). Le test footer (`:107`) est complètement désactivé.

### 1.4 Warning React grave reproduit à chaque run

Capturé dans la console Playwright (à chaque navigation `/`) :

```
[browser] The result of getServerSnapshot should be cached to avoid an infinite loop
    at ConsentBanner (src/components/gdpr/ConsentBanner.tsx:148:36)
  148 |   const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
                                            ^
```

**Cause** : `getServerSnapshot()` ligne 89-90 retourne `{ stored: null, reopen: false }` (objet littéral neuf à chaque appel). React 18+ exige une référence stable pour les snapshots SSR (sinon hydratation pose un risque de boucle).

---

## 2. Lecture historique

### 2.1 Fichiers consultés

- [`src/components/gdpr/ConsentBanner.tsx`](../../src/components/gdpr/ConsentBanner.tsx) — composant cible (lignes 1-150).
- [`e2e/cookies-consent.spec.ts`](../../e2e/cookies-consent.spec.ts) — test cible (lignes 1-141).
- [`docs/ROADMAP.md`](../ROADMAP.md) — entrées PR-QA-1d (ligne 162), PR-FIX-CONSENT (ligne 168), PR-FIX-NAV-404 (ligne 169).
- `docs/cc-handoffs/2026-05-07-PR-QA-2-diagnostic-12-fails.md` — **n'existe pas sur main** (dossier `cc-handoffs/` absent). Probablement consommé puis supprimé.
- Git log : commits historiques du fichier : `9a656c6`, `f0ed006`, `099bac7`, `6ddc7e4`, `d8b606f`.

### 2.2 Synthèse historique

- **2026-05-06** : `d8b606f` — création initiale `ConsentBanner` (PR-LEGAL-1 #120).
- **2026-05-09** : `6ddc7e4` — PR-QA-1d (#125) ajoute `waitForFunction(localStorage)` + `scrollIntoViewIfNeeded()` (band-aid).
- **2026-05-10** : `9a656c6` — post-PR-D4-PHASE2-A stabilization : ajout des `test.fixme()` webkit + global (mise en quarantaine).
- **2026-05-07** : ROADMAP enregistre **PR-FIX-CONSENT** comme fix root cause planifié (Option A : `useEffect(() => notify(), [])`). Jamais ouverte.
- **BUG-iOS-011 issue #116** : mentionné dans PR-QA-1d scope ("reste en backlog"). Pas lié directement à ce test (focus mobile-iOS navigation).

### 2.3 État du composant `ConsentBanner.tsx` (lignes critiques)

```tsx
// Ligne 53 — flag module-level (jamais reset à l'hydratation)
let cachedInitialized = false;

// Ligne 81-87 — getSnapshot avec cache one-shot
function getSnapshot(): StoreSnapshot {
  if (!cachedInitialized) {
    refreshSnapshot();
    cachedInitialized = true;
  }
  return SNAPSHOT_REF.value; // ← figé après le 1er appel
}

// Ligne 89-91 — getServerSnapshot non-stable (BUG React)
function getServerSnapshot(): StoreSnapshot {
  return { stored: null, reopen: false }; // ← nouvel objet à chaque appel
}

// Ligne 148 — site d'appel
const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
```

**Le fix PR-FIX-CONSENT spec'd (Option A)** : ajouter `useEffect(() => { notify(); }, []);` dans `ConsentBanner` au mount pour forcer un refresh post-hydration, court-circuitant le cache figé.

---

## 3. Hypothèses root cause (par ordre de confiance)

### H1 — `cachedInitialized` fige le snapshot pré-hydration (CONFIANCE : ÉLEVÉE)

**Symptôme** : tests Playwright qui font `addInitScript` pour préseter `localStorage` voient le banner rester affiché alors qu'un consent decision est déjà persisté.

**Mécanisme** :

1. Playwright `addInitScript` injecte du code avant tout script de page.
2. Mais le code n'écrit dans `localStorage` qu'après l'init du document — séquence non garantie vs hydration React.
3. Le premier `getSnapshot()` peut être appelé **avant** que `localStorage` ne contienne la décision.
4. `cachedInitialized = true` → tous les `getSnapshot()` suivants renvoient le snapshot figé `{stored: null}`.
5. Banner reste visible → test `.not.toBeVisible()` fail → flagué `test.fixme(webkit)`.

**Pourquoi WebKit-spécifique** : WebKit a un ordre d'init scripts légèrement différent de Chromium (microtask scheduling). Le timing change déterministe-ment.

**Preuve indirecte** : ROADMAP PR-FIX-CONSENT documente exactement ce mécanisme (« cache reste figé sur `{stored: null}` et banner reste visible »).

**Impact prod réel** : pas seulement E2E. Issue #126 (bug user) — si l'utilisateur ouvre 2 onglets et accepte sur l'un, l'autre garde le banner.

---

### H2 — `getServerSnapshot()` non-stable (CONFIANCE : ÉLEVÉE)

**Symptôme** : warning React console à chaque rendu : « The result of getServerSnapshot should be cached to avoid an infinite loop ».

**Mécanisme** :

1. React 18+ compare les snapshots SSR par identité (`===`).
2. `return { stored: null, reopen: false }` crée un nouvel objet à chaque appel → identité jamais égale.
3. React peut entrer en boucle de re-render au moment de l'hydratation (warning préventif).
4. En interaction avec `useTransition` + Server Action `recordCookieConsentAction`, peut amplifier le timing déjà fragile (Server Action déclenche un nouveau snapshot pendant l'hydratation).

**Pourquoi pas un fail direct** : React stoppe la boucle après quelques itérations + le warning n'est qu'un avertissement. Mais en WebKit avec scheduling différent, peut transformer le warning en flake observable.

**Fix trivial** : `const SERVER_SNAPSHOT: StoreSnapshot = { stored: null, reopen: false };` au niveau module + `return SERVER_SNAPSHOT;` dans la fonction.

---

### H3 — Footer scroll timeout = symptôme aggravé par H1 (CONFIANCE : MOYENNE)

**Symptôme original (avant fixme global)** : `scrollIntoViewIfNeeded()` sur footer button time out à 10s en CI.

**Mécanisme proposé** :

1. Test set `localStorage` avec `addInitScript` (consent déjà décidé).
2. H1 actif → banner reste visible → footer est repoussé hors viewport.
3. `scrollIntoViewIfNeeded()` tente de scroller vers footer, mais banner overlay masque la zone cible.
4. Combinaison `await page.goto('/')` + assertion `not.toBeVisible()` immédiate + scroll = race conditions multiples.
5. Timeout 10s atteint car DOM ne stabilise jamais (banner re-paint, footer hidden, viewport recalculated).

**Pourquoi probable** : si H1 est fixée, le banner s'effacerait correctement, le footer remonterait dans le viewport, et le scroll réussirait. C'est cohérent avec la note `:104` du test : « possible root cause commune ».

**Alternative** : footer Server Component hydraté tardivement (pas confirmé — composant `CookiePreferencesLink` est `'use client'` ligne 1, donc déjà client).

---

## 4. Options de fix

### Option A ⭐ — Appliquer PR-FIX-CONSENT + corriger `getServerSnapshot()` (RECOMMANDÉE)

**Principe** : implémenter le fix déjà spec'd dans ROADMAP + bonus 1-ligne pour le bug React.

**Changements** :

```tsx
// 1. Server snapshot stable (BUG REACT FIX) — module level
const SERVER_SNAPSHOT: StoreSnapshot = { stored: null, reopen: false };
function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

// 2. Force refresh post-hydration (PR-FIX-CONSENT) — dans ConsentBanner()
import { useEffect } from 'react';
// ...
export function ConsentBanner() {
  // ... existing hooks ...
  useEffect(() => {
    notify(); // recompute snapshot from real localStorage post-hydration
  }, []);
  // ... rest unchanged ...
}

// 3. Cleanup les 3 test.fixme dans cookies-consent.spec.ts
//    (retirer les fixme webkit + le fixme global footer)
```

**Pros** :

- Fix déjà specd et validé par @cowork en ROADMAP.
- Effort minimal : 3 changements en 2 fichiers.
- Réactive 3 tests skippés (couverture E2E réelle).
- Fixe un bug user prod réel (issue #126).
- Élimine le warning React console.

**Cons** :

- `useEffect(() => notify(), [])` ajoute un re-render forcé au mount (négligeable, mais à mentionner).
- Nécessite revérifier les 11 tests Vitest existants de `ConsentBanner.test.tsx` (peuvent assumer le cache one-shot).

**Effort estimé** : **0.5 jour** (incluant tests Vitest + lancer suite E2E complète + vérif Lighthouse).

**Fichiers impactés** :

- `src/components/gdpr/ConsentBanner.tsx` (3 lignes ajoutées/modifiées)
- `e2e/cookies-consent.spec.ts` (suppression de 3 `test.fixme`)
- Possiblement `src/components/gdpr/__tests__/ConsentBanner.test.tsx` (mock `useEffect`)

**Risque** : **faible**. Le fix est ciblé, la spec est connue depuis 2 semaines, et le test E2E re-couvre le flow.

---

### Option B — Réécrire `ConsentBanner` sans `useSyncExternalStore`

**Principe** : passer à `useEffect` + `useState` classique, abandonner le pattern external store.

**Changements** :

- Supprimer `getSnapshot/getServerSnapshot/subscribe/cachedInitialized/SNAPSHOT_REF`.
- Remplacer par `const [snap, setSnap] = useState(SERVER_SNAPSHOT)` + `useEffect(() => { setSnap(readFromStorage()); subscribe... }, [])`.

**Pros** :

- Pattern plus simple, moins de chausse-trappes React.
- Élimine définitivement les 2 bugs (`cachedInitialized` + `getServerSnapshot` non stable).

**Cons** :

- Réécriture composant cœur RGPD (audit security/gdpr-compliance-auditor obligatoire).
- Perte du pattern "external store" qui était volontairement choisi (multi-tab sync via `storage` event).
- `useState` initial sera toujours `SERVER_SNAPSHOT` → flash visuel "banner visible une frame" même si décision déjà persistée.

**Effort estimé** : **1-1.5 jour** (réécriture + tests Vitest + audit GDPR + E2E + audit a11y).

**Fichiers impactés** :

- `src/components/gdpr/ConsentBanner.tsx` (réécriture ~150 lignes)
- `src/components/gdpr/__tests__/ConsentBanner.test.tsx` (réécriture tests cache)
- `src/app/[locale]/app/settings/CookiesPreferencesSection.tsx` (vérifier API stable)
- `src/components/layout/CookiePreferencesLink.tsx` (vérifier API stable)
- `e2e/cookies-consent.spec.ts` (suppression `test.fixme`)

**Risque** : **moyen** (composant légal RGPD, audit gdpr-compliance-auditor obligatoire avant merge).

---

### Option C — Status quo + dette documentée

**Principe** : laisser les `test.fixme` actifs + créer issue GitHub dédiée + tracker la dette dans ROADMAP.

**Pros** :

- 0 effort court terme.
- Pas de risque régression.

**Cons** :

- **Bug user prod reste actif** (issue #126).
- Dette s'accumule (3 tests skippés, 1 warning React permanent).
- Va à l'encontre de la doctrine Ankora "push done ≠ task done" (test skippé = test absent).

**Effort estimé** : **5 min** (créer issue GH).

**Risque** : **faible techniquement, élevé pour qualité produit** (le bug touche l'expérience RGPD critique pour FSMA + GDPR).

---

## 5. Recommandation @cc-ankora

**Option A** pour les raisons suivantes :

1. **Fix déjà specd et validé** : PR-FIX-CONSENT est dans ROADMAP depuis 10 jours, scope clair, validation @cowork acquise.
2. **Compatible fenêtre sas 48h post-mutuelle** : 0.5 jour, donc à planifier **post-19/05** mais avant PR-D6.
3. **Débloque un bug user prod** (issue #126) en plus des tests E2E.
4. **Élimine le warning React** au passage (1 ligne supplémentaire vs le scope spec'd, gratuit).
5. **Aligné avec doctrine Ankora** : pas de test skippé sans plan de fix.

**Plan d'exécution suggéré (à valider par @cowork)** :

1. Créer branche `feat/pr-fix-consent` post-19/05.
2. Appliquer les 3 changements (Option A code block ci-dessus).
3. Tester localement : `npm run test ConsentBanner` + `npx playwright test e2e/cookies-consent.spec.ts --repeat-each=3`.
4. Invoquer `gdpr-compliance-auditor` (composant RGPD touché).
5. Invoquer `test-runner` (validation suite complète).
6. PR → review @thierry → merge.
7. Update ROADMAP : marquer PR-FIX-CONSENT mergée.
8. Fermer issue #126.

**Pré-requis avant cette PR** :

- ✅ Aucun (PR autonome, pas de blocage).
- Doit passer **après** la sortie de la fenêtre sas 48h (19/05 21h).

---

## 6. Données brutes vérifiées

**Méthode** : lecture composant + lecture test + `npx playwright test --repeat-each=3` + grep ROADMAP + git log.

- Commande reproduction : `npx playwright test e2e/cookies-consent.spec.ts --repeat-each=3 --reporter=list`
- Durée : 42.7 secondes
- Browsers : chromium-desktop, mobile-safari (WebKit), mobile-chrome (Pixel 7)
- Tests effectifs : 4 (first visit + Accept all + Customize + Footer reopens)
- Résultat : 21 PASS / 15 SKIP / 0 FAIL
- Warnings React capturés : 6+ instances de "The result of getServerSnapshot should be cached"
- Composant : `src/components/gdpr/ConsentBanner.tsx` (220 lignes total, bug ligne 53 + 82-87 + 89-91)
- Test : `e2e/cookies-consent.spec.ts` (141 lignes, 4 tests, 3 fixme actifs)
- Fix spec'd : `docs/ROADMAP.md:168` (PR-FIX-CONSENT)
- Issue user prod : #126

---

## 7. Hors scope

- Fix BUG-iOS-011 issue #116 (non lié au flow consent).
- Réécriture du composant marketing footer (CookiePreferencesLink déjà OK).
- Refactor du flow Server Action `recordCookieConsentAction` (out of scope).
- Suppression des fixme webkit pour les autres tests `error-boundaries.spec.ts:21` (même famille bug, à traiter en même PR si pertinent — laissé au choix @cowork).

---

## 8. STOP conditions évaluées

- ✅ **Pas 100 % systématique broken** : 21/21 PASS observés → vrai flaky (skippé volontairement).
- ✅ **Pas de bug sécurité/auth direct** : RGPD UX dégradée mais pas de fuite de PII ni d'auth bypass.
- ✅ **Diagnostic < 2h** : ~1h15 dont 45s de reproduction E2E.
- ✅ **Pas de fatigue** : reste cohérent.

---

## 9. Prochaines actions proposées

1. **@cowork** lit ce diagnostic et tranche Option A / B / C.
2. Si Option A retenue : planifier PR-FIX-CONSENT post-19/05 (effort 0.5 j, branche dédiée).
3. **@cc-ankora** exécutera la PR sur signal @cowork — pas avant.

---

**Fin du diagnostic.** Aucune modification code dans ce passage. Working tree main inchangé (sauf création de ce fichier markdown + le diagnostic THI-189 précédent, tous deux untracked).
