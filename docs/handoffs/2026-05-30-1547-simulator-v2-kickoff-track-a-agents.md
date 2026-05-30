---
project: ankora
type: cc-handoff
date: 2026-05-30
session: 2026-05-30-1547
status: in-progress
tags: [simulator, thi-195, qa-agents, track-a, track-b]
---

# CC Ankora handoff — Kickoff simulateur v2 (THI-195) + upgrade agents QA

> Session 2026-05-30 ~14:00→15:47. Kickoff @cowork : refonte simulateur what-if (PR #199 gelée) + upgrade agents QA + tracing Obsidian. Spec d'entrée = audit @cowork `ankora-audit-simulateur-nav-2026-05-30.md`.

---

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD
# → chore/qa-agents-upgrade

git rev-parse --short HEAD
# → 717d5a6

git log --oneline -5
# 717d5a6 chore(agents): upgrade QA agents for réserve-libre simulator + liquid glass
# e91d030 chore(claude): align model refs 4.7 → 4.8 in active doctrine (#198)
# 8b6f2c0 ci(e2e): migrate to official Playwright container (v1.59.1-noble) (#197)
# 01a76bc chore(ci): bump Playwright E2E timeout 20 → 30 min (#195)
# 4af6592 chore(deps)(deps): bump ws from 8.20.0 to 8.21.0 (#194)

git status --short
# ?? docs/prs/preview-pr-196-landing.png   (orphelin untracked — voir §8)
```

**WIP non commité** : aucun (hors png orphelin). La branche `feat/thi-195-simulator-drawer` (#199, commit 7a8ce38) reste gelée, non touchée cette session.

---

## 2. PR en vol

- **PR #200** — https://github.com/thierryvm/ankora/pull/200
- **Titre** : `chore(agents): upgrade QA agents for réserve-libre simulator + liquid glass`
- **Branche / HEAD** : `chore/qa-agents-upgrade` / `717d5a6`
- **DoD 5/5** :
  1. CI : ⏳ (Lint+Typecheck+Tests pending, Security ✅, Sourcery skip docs-only au snapshot 15:47)
  2. Sourcery silent : ⏳ (skipping — docs-only)
  3. Reviews approved : ⏳ (review humaine @thierry requise — agents = guardrail infra)
  4. Conflit main : ✅ aucun
  5. Rapport : N/A (PR docs-only, contenu dans description PR)
- **mergeStateStatus** : `OPEN / CLEAN`
- **Scope** : strictement 4 fichiers `.claude/agents/*.md` (+119/−1). png orphelin laissé untracked (garde-fou scope @cowork respecté : `git add .claude/agents/`, jamais `-A`/`.`).

- **PR #199** — GELÉE (drawer THI-195 techniquement OK, ne tient pas la promesse landing). Sera **amendée** en Track B (décision @thierry/@cowork : amender, pas nouvelle branche).

---

## 3. Plan en cours

**Track A (agents QA)** — ✅ livré (PR #200 ouverte). Scope @cowork : prio `financial-formula-validator` + `dashboard-ux-auditor` ; liquid-glass `ui-auditor`/`mobile-ios-auditor` en P1. Zéro gold-plating. Doctrine `model:` vérifiée sur les 15 agents (tous pinnés).

**Track B (P0 simulateur)** — plan PAS encore rédigé. Séquence verrouillée : plan technique (D1-D5) → **plan-reviewer OBLIGATOIRE** → code sur #199 (après merge #200 pour hériter des agents upgradés sur main).

**Tracing Obsidian** — handoff (ce fichier) + miroir repo `docs/handoffs/` + copie spec `docs/design/` : EN COURS.

---

## 4. Décisions prises cette session

- **Branche Track B** : **amender #199** — garde la coquille drawer smoke-testée (a11y/focus-trap/scroll-lock ITP-safe) ; alternative écartée : nouvelle branche v2 (rebuild inutile d'une coquille qui marche).
- **D1 surface partagée** : **Option A** — recâbler `SimulatorClient` UNE fois (source unique). `SimulatorDrawer` n'est qu'un wrapper de `SimulatorClient`, lui-même calculateur de la route `/app/simulator`. Forker = 2 calculateurs divergents (anti-pattern combattu). Bonus : `/app/simulator` hérite du recâblage.
- **D2 réserve libre** = **`resteDisponible`** = Revenus − Effort lissé (le champ `resteDisponible` de `capaciteEpargneReelle`), **PAS** `capacite` (= resteDisponible − reste-à-vivre). Confirmé par landing : « Argent disponible / +507 € » = « Réserve libre ». Le libellé simulateur DOIT matcher le hero dashboard.
- **D3 lissage** : unifier sur `effortFinancierLisse`. **Découverte code-verify** : `budget.monthlyProvisionTotal` ≡ `effortFinancierLisse` NUMÉRIQUEMENT (Σ mensuel + Σ périodique lissé). Donc « Actuel » simulateur == « Effort lissé » dashboard DÉJÀ. Recâblage = framing (threader `revenus`, libellés, retirer `%/mois`), PAS réécriture math. Garde-fou : test explicite `budget≡effort` à ajouter (verrouillé par financial-formula-validator).
- **D4 scénarios** : **Option D pour P0** (tranché @cowork). Pas de chips par catégorie (Option B) : code-verify a montré que les catégories seedées sont Logement/Famille/Taxes/Santé/Abonnements/Assurances/Transport/Autres → **pas de Télécom ni Énergie**, et matching sur `name` texte-libre renommable (pas de slug stable), pas de `provider_type`. Option A (match mot-clé label) écartée = heuristique fragile/faux positifs. Option C (seeder + slug stable + chips) = **P1** (chevauche PR-CAT-1). **P0 = supprimer le défaut « Annuler le Loyer », dropdown sur charges réelles + copy d'exemple.**
- **D5 FSMA** : confirmé — aucun repère marché / montant suggéré en P0. « Annuler » = delta = montant plein ; « Renégocier » = montant saisi par l'user. Zéro chiffre de notre part.
- **Pin `financial-formula-validator` sonnet → opus** — validé @thierry (métrique financière signature, coût d'erreur > coût token). Alias `model: opus` (homogène avec plan-reviewer/llm-security), pas de chaîne explicite.

---

## 5. Décisions en attente Thierry / @cowork

- **Q1** — @cowork doit valider le **mécanisme exact du défaut P0 Option D** (placeholder guidé « Choisis une charge » VS auto-sélection d'une charge discrétionnaire type plus grosse « Abonnements »). @cowork a délégué la règle exacte au **plan-reviewer**. Non urgent — sera tranché dans le plan Track B.
- **Q2** — Source officielle **Obsidian CLI** : @thierry doit confirmer avant install (nouvelle dép). Tracing fait pour l'instant en écriture fichier normale (pas de CLI).

---

## 6. Garde-fous activés (Phase 0)

- Modèle actif : **`claude-opus-4-8`** ✅ (Phase 0 model check passé en ouverture de session).
- Branch protection `main` : ✅ (require PR + checks).
- Scope strict PR #200 : ✅ (`git add .claude/agents/` explicite ; png hors commit).
- Doctrine `model:` 15 agents : ✅ tous pinnés (opus: plan-reviewer/llm-security/**financial-formula-validator** ; haiku: test-runner ; sonnet: reste).
- `plan-reviewer` : ⏳ PAS encore invoqué — OBLIGATOIRE avant code Track B (gate verrouillée).
- `spec-translator` : N/A — @cowork a fourni une spec structurée (l'audit), pas une demande informelle.
- Règle slug Obsidian : ✅ lu `10_Projects/ankora/_index.md`, `project: ankora` extrait, utilisé tel quel.

---

## 7. Next action concrète

**Attendre la réponse @cowork sur le mécanisme défaut Option D (Q1), puis rédiger le plan technique Track B (D1-D5, D=Option D, + test `budget≡effort`), l'envoyer à `plan-reviewer`, et coder UNIQUEMENT après verdict APPROVED ET merge de #200 sur main.**

---

## 8. Anti-pièges (ce que la prochaine session NE doit PAS faire)

- Ne PAS coder Track B avant : (a) merge #200, (b) plan-reviewer ✅ APPROVED. Gate doctrine.
- Ne PAS implémenter Option B (chips par catégorie) en P0 — catégories Télécom/Énergie INEXISTANTES + pas de slug stable. C'est P1 (Option C via PR-CAT-1).
- Ne PAS réécrire la math de `simulation.ts` — `budget.monthlyProvisionTotal` ≡ `effortFinancierLisse`. Le recâblage est framing + threading `revenus`, pas une nouvelle formule.
- Ne PAS forker `SimulatorClient` — recâblage UNIQUE (D1 Option A), `/app/simulator` + drawer partagent le calculateur.
- Ne PAS suggérer de montant marché / négociation chiffré (FSMA, D5).
- Ne PAS commit `docs/prs/preview-pr-196-landing.png` dans #200 ou #199 — orphelin untracked, à triager en `chore(docs)` dédié (ou `.gitignore`/suppression) plus tard, priorité basse.
- Ne PAS `git add -A` / `git add .` sur la branche agents — scope strict `.claude/agents/`.

---

## Annexes

### Fichiers clés Track B (code-verify session)

- `src/components/dashboard/SimulatorDrawer.tsx` — wrapper drawer (coquille a11y à garder).
- `src/app/[locale]/app/simulator/SimulatorClient.tsx` — calculateur PARTAGÉ (drawer + route autonome).
- `src/lib/domain/simulation.ts` — `simulate()` retourne déjà current/projected/monthlyDelta/annualDelta/changePercent.
- `src/lib/domain/budget.ts` — `monthlyProvisionTotal` (chemin legacy simulateur).
- `src/lib/domain/cockpit/effort-financier-lisse.ts` + `capacite-epargne-reelle.ts` — `effortFinancierLisse` (canonique) + `resteDisponible` (= réserve libre).
- `src/app/[locale]/app/page.tsx:395` — `<SimulatorDrawer charges={snapshot.rawCharges} />` ; `monthlyIncome` (l.49) à threader.
- i18n simulateur : `messages/*.json` → `app.simulator.impact.*` (à reformuler : `currentMonthly`, `projectedMonthly`, `annualSavings`, `monthlyChange` faux-ami à retirer).
- Catégories seed : `supabase/migrations/20260503000003_pr_d1_categories_enrichments.sql`.

### Liens

- Audit @cowork (spec d'entrée) : `F:\PROJECTS\ankora-audit-simulateur-nav-2026-05-30.md` → copié dans `docs/design/audit-simulateur-nav-2026-05-30.md`.
- Linear : THI-195 (simulateur what-if drawer).
- PR #200 : https://github.com/thierryvm/ankora/pull/200

---

**Signé par** : @cc-ankora · Session `2026-05-30-1547`
