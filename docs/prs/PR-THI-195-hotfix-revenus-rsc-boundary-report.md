# Hotfix THI-195 — crash drawer simulateur (frontière RSC `revenus`)

> **Branche** : `hotfix/thi-195-revenus-rsc-boundary` · **Date** : 2026-05-30 · **Auteur** : @cc-ankora (Opus 4.8)
> **Sévérité** : 🔴 critique — crash à l'ouverture du drawer « Simuler », live sur main (`1a56a0d`, ex-#199).

## Symptôme

Ouvrir le drawer « Simuler » depuis le dashboard déclenche l'error boundary :
`TypeError: revenus.lte is not a function` dans `SimulatorClient.tsx`.

## Cause racine (confirmée)

`revenus` était passé en **`Money` (Decimal.js)** à travers la frontière RSC **server → client** :

- `page.tsx` (server) → `<SimulatorDrawer revenus={money(...)}>` (client) → `SimulatorClient` (client)
- `simulator/page.tsx` (server) → `<SimulatorClient revenus={money(...)}>` (client)

Next sérialise les props des client components : une instance `Decimal` **perd son prototype** → arrive sans `.lte`/`.minus` → crash dès le render (`const incomeMissing = revenus.lte(0)` est évalué inconditionnellement).

Le pattern `charges` ne crashait pas car `RawCharge.amount` traverse en **`number`** brut, re-wrappé `money(c.amount)` **dans** le client. `revenus` était la seule exception — il traversait en Decimal.

## Fix

Faire traverser `revenus` en **`number`** brut, et le wrapper `money()` **à l'intérieur** de `SimulatorClient` (mirror exact de `domainCharges`). **Aucun Decimal ne traverse une frontière RSC.**

- `SimulatorClient.tsx` — prop `revenus: Money` → `revenus: number` ; `const revenusMoney = money(revenus)` en tête ; `resteDisponibleView(revenusMoney, …)` + `incomeMissing = revenusMoney.lte(0)`.
- `SimulatorDrawer.tsx` — prop `revenus: Money` → `revenus: number` (passe-plat).
- `page.tsx` (dashboard) — `revenus={snapshot.monthlyIncome ?? 0}` (number brut). `monthlyIncome` (Money) reste pour `CapaciteEpargneCard` (server, pas de frontière) + le plan Transfer.
- `simulator/page.tsx` — `revenus={snapshot.monthlyIncome ?? 0}` ; import `money` retiré.

**Math inchangée** : `resteDisponibleView` prend toujours un `Money` ; seul l'endroit du wrap change. **Rendu inchangé.**

## Garde-fous

- **Type-level** : le typecheck passe avec `revenus: number` → preuve qu'aucun appel de méthode Decimal ne subsiste sur le `revenus` brut (TS errorerait sur `.lte`/`.minus`).
- **Test unitaire de régression** : `SimulatorDrawer.test.tsx` passe désormais `revenus={2466}` (number, mirror de la vraie frontière — un Decimal masquait le bug) + test dédié « renders without crashing when revenus arrives as a raw number (RSC boundary) » qui ouvre le drawer et force le chemin `money(revenus).lte(0)`.
- **E2E** (déjà présent sur main via #199) : `dashboard-simulator-drawer.spec.ts` ouvre réellement le drawer + sélectionne une charge + assert que l'Impact rend → reproduction navigateur réelle de la sérialisation.

## Audit « autres Money vers le drawer »

- `charges` : `number` (OK). `revenus` : corrigé. Aucun autre Money vers `SimulatorDrawer`/`SimulatorClient`.
- Convention confirmée : `CapaciteEpargneCard` → `AjusterResteAVivreDrawer` passe déjà des numbers (`revenus.toNumber()`, `initialResteAVivre.toNumber()`). Le fix s'aligne sur le pattern établi du repo.

## Pourquoi pas de re-run des agents QA

Ce hotfix ne change **aucune formule** (`financial-formula-validator` : rien à auditer, math identique) ni **aucun rendu** (`dashboard-ux` : sortie identique). Le risque est purement la frontière de sérialisation, couvert par typecheck + test de reproduction + suite complète. `test-runner` = **1357 vitest verts**.

## Évidence DoD

`typecheck` ✅ · `eslint` (fichiers changés) ✅ · `lint:use-server` ✅ · `npm run test` → **1357 passed** · Sourcery + CI verte ⏳ après push.
