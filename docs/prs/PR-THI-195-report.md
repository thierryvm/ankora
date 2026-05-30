# PR-THI-195 — Simulateur what-if en drawer depuis le dashboard

**Branch** : `feat/thi-195-simulator-drawer`
**Date** : 2026-05-29
**Pilote** : @cc-ankora (Claude Opus 4.8)
**Demandeur** : @thierry via @cowork prompt 29/05
**Linear** : THI-195 — 3e des 3 sections cockpit « essentielles Beta » (après Health gauge THI-190 ✅ + Bills J-7/14/30 THI-192 ✅).

---

## Pourquoi cette PR

Le simulateur what-if existait uniquement en route dédiée `/app/simulator` → sous-utilisé car invisible depuis le cockpit. THI-195 le rend accessible **en drawer in-page** depuis le dashboard, sans navigation, tout en **conservant la route** comme fallback (SEO + lien direct).

---

## Phase 0 — contre-analyse (correction du prompt d'origine)

Le prompt @cowork prescrivait `vaul` (« déjà présent, aucune dépendance neuve ») et l'atome `Drawer.tsx` (`EditDrawer`). Le code-verify a invalidé ces deux hypothèses :

| Hypothèse prompt             | Réalité repo (vérifiée)                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `vaul` déjà présent          | ❌ **Absent** de `package.json`, 0 import dans `src/`                                              |
| Atome `Drawer.tsx` à wrapper | ⚠️ `EditDrawer` = drawer **de formulaire** (champs discriminés), inadapté pour un calculateur live |
| « drawer vaul = quirks iOS » | Les 3 drawers existants sont **hand-rolled, sans vaul**                                            |

**Décision @thierry (AskUserQuestion)** : pattern drawer **maison, zéro dépendance** → budget 0 € respecté + cohérence avec les 3 drawers sibling (`AjusterResteAVivreDrawer`, `ChargeEditDrawer`, `ExpenseEditDrawer`).

**Gouvernance** : spec-translator (spec Phase 0 + Scope + DoD) → plan-reviewer (🟡 APPROVED WITH CHANGES → 3 conditions de re-vérif satisfaites avec preuve filesystem : branche créée, serializabilité `rawCharges` confirmée, absence de `RawCharge` canonique → Option A validée).

---

## Scope livré

### Fichiers

| Fichier                                                       | Nature      | Détail                                                                                                                                      |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/dashboard/SimulatorDrawer.tsx`                | **NOUVEAU** | Drawer maison wrappant `<SimulatorClient hideHeader>`. Trigger `<Button variant="outline" size="lg">`.                                      |
| `src/app/[locale]/app/simulator/SimulatorClient.tsx`          | modifié     | `export type RawCharge` + prop `hideHeader?: boolean` (masque le `<header>` h1+subtitle dans le drawer ; défaut `false` → route inchangée). |
| `src/app/[locale]/app/page.tsx`                               | modifié     | Le 3e CTA grid « Simuler » (ex `<Link href="/app/simulator">`) → `<SimulatorDrawer charges={snapshot.rawCharges} />`.                       |
| `src/components/dashboard/__tests__/SimulatorDrawer.test.tsx` | **NOUVEAU** | 12 cas Vitest.                                                                                                                              |
| `e2e/dashboard-simulator-drawer.spec.ts`                      | **NOUVEAU** | 4 parcours × 3 projets (12 tests).                                                                                                          |

### Comportement

- **bottom mobile / right desktop** : `fixed inset-0 z-50 flex items-end justify-end sm:items-stretch` + panel `h-dvh max-h-dvh sm:h-full sm:max-w-md sm:border-l` (idiome identique aux siblings).
- **ESC + backdrop + X** ferment.
- **return-focus** : à la fermeture, `requestAnimationFrame(() => triggerRef.current?.focus())` → le focus revient sur le CTA d'origine (WCAG 2.4.3).
- **Tab focus-trap** : cycle Tab / Shift+Tab confiné au panel (WCAG 4.1.2). _Amélioration vs les 3 siblings qui ne l'ont pas — local au composant, pas de hook partagé (éviterait le scope creep ; extraction `useDrawerA11y` notée en backlog)._
- **Pas de re-fetch à l'ouverture** : `charges` passées en prop depuis le server component (`snapshot.rawCharges`, déjà en mémoire).
- **Zéro nouvelle clé i18n** : réutilise `app.dashboard.ctaSimulator`, `app.simulator.title`, `ui.action.close` (parité 5 locales confirmée).

### Hors scope (respecté)

Route `/app/simulator` intacte · `getWorkspaceSnapshot` / `src/lib/domain` / migrations non touchés · aucune dépendance npm · pas de pré-remplissage contextuel enveloppe (backlog) · `.husky`/GHA/`settings.local.json` non touchés.

---

## Agents QA

| Agent                    | Verdict         | Suite                                                                                                                                                                                                          |
| ------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ui-auditor**           | PASS_WITH_NOTES | F2/F3 corrigés : `role="dialog"` + `aria-modal` + `aria-labelledby` déplacés sur le panel (au lieu de l'overlay), `<aside>` → `<div>` (landmark propre).                                                       |
| **dashboard-ux-auditor** | PASSED          | Cohérence pixel-parfaite avec le sibling ; focus-trap + return-focus salués comme améliorations.                                                                                                               |
| **mobile-ios-auditor**   | PASS_WITH_NOTES | F1 corrigé : `pb-[max(1.5rem,env(safe-area-inset-bottom))]` sur le scroll container. F5 corrigé : scroll-lock `position:fixed` (pattern `MoreSheet`, rubber-band iOS proof) au lieu de `overflow:hidden` seul. |
| **i18n-auditor**         | PASS            | Parité 3 clés OK sur 5 locales, aucun hardcode FR.                                                                                                                                                             |
| **test-runner**          | couvert         | Suite Vitest complète exécutée manuellement (108 fichiers / 1349 tests verts).                                                                                                                                 |

### Findings non retenus (justifiés)

- **X button 36×36px** (ui F1/mobile F2) : conforme WCAG AA 2.5.8 (min 24px ; 2.5.5 « 44px » est AAA). Identique aux 3 siblings → cohérence préservée. Dette partagée backlog.
- **`autocomplete` absent sur inputs montant** (mobile F3) : code **pré-existant** dans `SimulatorClient`, hors scope THI-195.
- **Radix Select portal × focus-trap** (mobile F4) : edge case à valider au smoke iPhone réel (le filtre `offsetParent` exclut déjà les items portalisés). → checklist smoke ci-dessous.
- **Animation slide / scroll affordance** (ux OBS-2 / mobile F6) : backlog UI, cohérent avec les siblings (aucune animation).

---

## Quality gates (local)

| Gate                             | Résultat                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| `npm run typecheck`              | ✅ 0 erreur                                                 |
| `npm run lint`                   | ✅ 0 erreur (6 warnings pré-existants hors diff)            |
| `npm run lint:use-server`        | ✅ clean                                                    |
| `npm run test`                   | ✅ **108 fichiers / 1349 tests**                            |
| `npx playwright test ... --list` | ✅ 12 tests collectés (e2e tourne en CI avec Supabase réel) |

> E2E skip en local (`test.skip(!admin)` — pas de `SUPABASE_SERVICE_ROLE_KEY`), exécuté en CI.

---

## Smoke test @thierry (post-preview / post-merge)

Sur la preview Vercel `/app` :

1. Cliquer « Simuler » → le drawer s'ouvre **par-dessus** le dashboard, sans changement d'URL. Mobile (iPhone) = slide du bas ; desktop = slide de la droite.
2. Mode « Annuler une charge » → sélectionner une charge → vérifier l'impact dans le drawer. ESC → le drawer se ferme, le focus revient sur « Simuler ».
3. **iPhone** : scroller jusqu'au bas des résultats → le dernier chiffre n'est pas masqué par le home indicator (F1). Tenter de scroller la page sous le drawer par rebond → elle ne bouge pas (F5). En mode « Annuler », ouvrir le Select charge, sélectionner un item → le focus ne saute pas (F4).
4. Naviguer manuellement vers `/app/simulator` → la page dédiée affiche toujours son `<h1>` complet.

---

## DoD (anti « push done = task done »)

1. ⏳ CI verte — à confirmer après push.
2. ⏳ Sourcery silencieux sur le dernier commit — à vérifier après push (`gh api repos/thierryvm/ankora/pulls/<N>/comments`).
3. ⏳ Review @thierry approuvée + merge.
4. ⏳ Pas de conflit avec `main`.
5. ✅ Rapport livré (ce fichier).
