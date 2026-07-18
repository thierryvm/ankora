---
project: ankora
type: cc-handoff
date: 2026-06-06
session: 2026-06-06-2305
status: complete
---

# CC Ankora handoff — PR-A (#223) + PR-B (#224) epic Factures cohérentes

> Session reprise quota-reset. Mandat @thierry : process début de session + Linear/GitHub/Obsidian + total autonomie avec garde-fous, aucun leak, code-review. Deux PRs livrées, vertes, en attente merge @thierry.

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD
# → feat/cc-charges-current-period

git log --oneline -4
# → (PR-B) feat(charges): current-period due date + overdue badge + paid toggle carry (THI-329)
#   docs(plans): PR-B charges page current-period (THI-329, plan-reviewer 🟡→integrated)
#   d1a2b4d docs(epic): factures-coherentes spec + session handoff 2026-06-05 (#222)  [= origin/main]

git status --short
# → M public/llms-full.txt   (PRÉ-EXISTANT, PAS de cette session — ne pas commit)
```

Deux branches poussées cette session :

- `feat/thi-329-payment-aware-due-date` (PR-A #223), HEAD `b97c248`
- `feat/cc-charges-current-period` (PR-B #224), branchée depuis `origin/main` (d1a2b4d)

## 2. PR en vol

### PR #223 — PR-A — `feat(charges): payment-aware due-date + backfill payment_months (THI-329)`

URL : https://github.com/thierryvm/ankora/pull/223 · **mergeStateStatus : CLEAN** · mergeable.
DoD 5/5 : CI ✅ · Sourcery ✅ (1 suggestion advisory complexity → répondu + thread résolu) · review ⏳ @thierry · pas de conflit ✅ · rapport = corps PR ✅.
Contenu : migration `20260605000001_backfill_payment_months.sql` (recompute payment_months depuis (frequency,due_month), idempotente, zéro-perte) + domaine pur `nextUnpaidDueDate` (prochaine occurrence NON payée, saute payées + surface overdue) câblé dans dashboard `getUpcomingCharges`. QA : plan-reviewer 🟡→intégré, rls-flow-tester GO, financial-formula-validator GO.
⚠️ **Migration données PROD au merge** → c'est le merge de @thierry (garde-fou irréversibilité).

### PR #224 — PR-B — `feat(charges): current-period due date + overdue badge + paid toggle carry (THI-329)`

URL : https://github.com/thierryvm/ankora/pull/224 · **mergeStateStatus : CLEAN** · mergeable.
DoD 5/5 : CI ✅ (E2E 6m51, Lint/TC/Tests, Security, Vercel) · Sourcery inline vide ✅ (review skipping) · review ⏳ @thierry · pas de conflit ✅ · rapport = corps PR ✅.
Contenu : domaine pur `currentPeriodDueDate` (ancre au mois courant, états paid/overdue/dueThisMonth/upcoming — fix « juillet avant juin ») + carry #221 (toggle Payé useOptimistic, redesign groupes, résumé « ce mois ») SANS le trim rejeté + badge « En retard ». QA : plan-reviewer 🟡→intégré (CR-1..4), financial-formula-validator GO, i18n-auditor GO, dashboard-ux C1/H1 corrigés, mobile-ios PASS_WITH_NOTES.

**Overlap merge #223 ↔ #224** : les deux ajoutent un bloc d'export dans `src/lib/domain/charges/index.ts` (#223=nextUnpaid, #224=currentPeriod). Au merge du 2e, conflit trivial sur ce bloc → **garder les deux exports**. Le 2e PR aura `mergeStateStatus: BEHIND/CONFLICTING` après le 1er merge → rebase rapide.

## 3. Plan en cours

Epic « Factures cohérentes » (spec `docs/plans/epic-factures-coherentes-spec.md`). Plans par PR : `docs/plans/pr-a-payment-aware-due-date.md`, `docs/plans/pr-b-charges-page-current-period.md`. **PR-A + PR-B done (code livré).** Reste : PR-C (is_watched + dashboard remanié « Ce mois 5 / À surveiller »), reset + alerte oubli, PR-D CadenceField (THI-301).

## 4. Décisions prises cette session

- **Re-découpage epic** : #223 (PR-A) livré plus étroit que la spec (data+domaine+dashboard) ; la page charges (carry #221) déplacée en PR-B #224. Raison : <600 lignes/PR + #221 trim rejeté à retirer.
- **PR-B branche depuis main, pas stack sur #223** parce que `currentPeriodDueDate` + carry #221 ne dépendent pas de `nextUnpaidDueDate`/upcoming.ts (vérifié git). Évite la complexité de stacking.
- **2 résolveurs date distincts, non fusionnés** : `nextUnpaidDueDate` (dashboard, saute payées, roule) vs `currentPeriodDueDate` (page, ancre au mois courant, labellise). Documenté JSDoc pour empêcher un refactor de les fusionner.
- **Badge overdue = blanc sur danger plein** (pas `text-danger`/`bg-danger/10`) parce que `--color-danger` n'a pas d'override dark → text-danger échoue AA dark (3.4:1) ; blanc-sur-plein = 4.84:1 les 2 thèmes.
- **Sous-total carrié `text-brand-700`→`text-brand-text`** (overridé dark) pour passer AA dark.
- **Sourcery PR-A advisory complexity (helpers date dupliqués)** : déféré avec rationale (isolation domaine, endorsé financial-validator), thread résolu. Extraction util partagé = chore post-merge quand les 3 résolveurs sont sur main.

## 5. Décisions en attente Thierry

- **Merge #223 + #224** (ordre indifférent ; le 2e demandera un rebase trivial sur index.ts). #223 applique la migration data prod.
- **#221 NE PAS merger** (son contenu utile est carrié dans #224, son trim est rejeté). À fermer après merge #224.

## 6. Garde-fous activés

- Modèle : Opus 4.8 ✅ (Phase 0 model check OK).
- `npm run lint:use-server` ✅ · lint 0 erreur (6 warnings pré-existants) · typecheck ✅ · 1444 tests ✅ · build ✅.
- plan-reviewer invoqué pour PR-A ET PR-B (obligatoire migration/Server Action/domaine >50 lignes) ✅.
- Aucun leak : aucun secret en clair/URL/log. Lectures prod read-only uniquement (sessions précédentes).
- Branch protection main active (les 2 PRs BLOCKED→CLEAN après gates, attendent review).

## 7. Next action concrète

**MAJ fin de session 2026-06-06** : **#223 MERGÉ** (`cf656d0` sur main, squash). **#224 rebasé sur main** (conflit `index.ts` résolu = les 2 exports), CI verte, Sourcery vide, **CLEAN** — **attend le smoke visuel @thierry** (preview Vercel #224, desktop + mobile/iPhone SE + dark mode). @thierry s'est arrêté pour la nuit avant le smoke.

**Reprise : dès le GO visuel @thierry sur #224 → `gh pr merge 224 --squash --delete-branch`, puis `gh pr close 221` + `git fetch --prune` (cleanup branches), puis démarrer PR-C** (is_watched + dashboard « Ce mois 5 / À surveiller ») — plan `docs/plans/pr-c-watched-marker-dashboard.md` → plan-reviewer (migration + Server Action `toggleWatchAction`) → exécuter.

⚠️ **Migration #223 prod** : confirmer qu'elle s'est appliquée (mécanisme deploy Supabase) — le « janv. 2027 » S.W.D.E ne disparaît qu'après application.

## 8. Anti-pièges

- **Ne PAS merger #221** — contenu carrié dans #224, trim rejeté. La fermer après #224.
- **Ne PAS re-passer plan-reviewer sur PR-A/PR-B** — déjà APPROVED, code livré.
- **Ne PAS toucher `ProchainesFacturesCard.tsx`** dans PR-C sans traiter THI-348 (a11y chip danger + brand-700 dark) — sauf si PR-C le réécrit (alors corriger en passant).
- **Ne PAS commit `public/llms-full.txt`** (modif pré-existante, hors session).
- **Ne PAS oublier le rebase index.ts** au 2e merge des PRs jumelles #223/#224.
- **Ne PAS fusionner `nextUnpaidDueDate` et `currentPeriodDueDate`** (comportements délibérément distincts).

## Annexes

### Linear

- **THI-329** (In Progress) — epic surfacer payé : PR-A #223 + PR-B #224 liées.
- **THI-348** (Backlog, Medium) — a11y dette `ProchainesFacturesCard` chip danger + brand-700 dark (trouvée par dashboard-ux pendant PR-B).
- THI-301 — CadenceField (PR-D, plan déjà ✅ APPROVED session antérieure).

### Liens

- PR #223 : https://github.com/thierryvm/ankora/pull/223
- PR #224 : https://github.com/thierryvm/ankora/pull/224
- Vercel preview #224 : déploiement OK (SSO-gated → smoke manuel @thierry desktop + mobile/iPhone SE + dark mode).

---

**Signé par** : @cc-ankora · Session `2026-06-06-2305`
