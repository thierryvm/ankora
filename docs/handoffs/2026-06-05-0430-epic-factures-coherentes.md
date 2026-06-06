# Handoff — Session 2026-06-04→05 : Simulateur mergé + Epic « Factures cohérentes » cadré

> 2026-06-05 ~04:30 · @cc-ankora · clôture sur fatigue (@thierry 4h22).

## 0. TL;DR reprise

**Exécuter PR-A de l'epic « Factures cohérentes »**. Spec :
`docs/plans/epic-factures-coherentes-spec.md` (décisions verrouillées). PR-A =
backfill `payment_months` + vue « période courante » + carry redesign/toggle.
Reprise : branche depuis `main` → plan PR-A → **plan-reviewer (migration obligatoire)** → code → QA → DoD5.

## 1. Mergé cette session

#217 dashboard · #218 agents→Opus · #219 simulateur (validé+QA+DoD5) · #220 handoff docs.

## 2. PR #221 « Factures Phase 2 » — NE PAS MERGER

`feat/charges-phase2-paid-toggle` (draft). Redesign liste + toggle Payé VALIDÉS,
mais trim dashboard REJETÉ + feedback @thierry a révélé bugs dates. → carry
redesign+toggle dans PR-A, drop le trim.

## 3. Diagnostic factuel (prouvé en prod, lecture seule)

- **DATA** : migration `20260503000002` l.57-60 a fait `payment_months=[due_month]`
  pour non-mensuelles → S.W.D.E `quarterly`=`[1]` au lieu de `[1,4,7,10]` → « janv. 2027 ».
- **LOGIQUE** : `nextDueDateForCharge` roule vers l'occurrence future → échéance
  passée non payée saute d'un an (cache le retard).
- **Workspace propre** : 19 charges ; « Crédit travaux » = autre user (RLS OK).
- **Trimestriel** = tous les 3 mois dès l'ancre `due_month` (S.W.D.E réel=mai=`[2,5,8,11]`), pas 3/6/9/12 universel.

## 4. Epic (spec complète dans docs/plans/)

- **PR-A** _(LOURDE)_ backfill + `currentPeriodDueDate()` (nouveau ; NE PAS toucher
  `nextDueDateForCharge`) + vue mois courant + badge retard + carry redesign/toggle. **1er.**
- **PR-B** _(LOURDE)_ colonne `is_watched` + `toggleWatchAction` + bouton inline +
  dashboard (« Ce mois-ci »=5 non-payées/date+reste à payer ; « À surveiller »=flaggées).
- **PR-C** reset manuel + alerte oubli.
- **PR-D** CadenceField (THI-301, plan-reviewer ✅) — UX SIMPLE (fréquences déroutantes pour @thierry).

## 5. Décisions verrouillées 2026-06-05

`is_watched` · reset **manuel + alerte** (pas auto-cron v1) · toggle watch **inline**.
@thierry corrige ses dates lui-même (CRUD complet) via CadenceField.

## 6. Méthode safe secrets (réutilisable)

Script node `.tmp/*.mjs` parse `.env.local` → supabase-js admin → READ-ONLY →
clé jamais affichée, script supprimé. Jamais via MCP. (A prouvé le bug data + RLS.)

## 7. Reprise git

`git checkout main && git pull` → `git checkout -b feat/epic-factures-pr-a-cadence`
→ plan PR-A → plan-reviewer → code. #221 reste draft (ne pas merger).
