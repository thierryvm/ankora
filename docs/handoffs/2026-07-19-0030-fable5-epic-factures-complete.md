---
project: ankora
type: cc-handoff
date: 2026-07-19
session: 2026-07-19-0030
status: complete
---

# CC Ankora handoff — session Fable 5 : epic Factures quasi complète + incident migrations résolu

> Session marathon 17-19 juillet (Fable 5 épinglé par @thierry, mandat « analyse A→Z avec ton regard, toute la partie technique y compris Supabase »). #225 → #228 tous mergés + incident « données effacées » résolu (fausse alerte).

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD   # → main
git log --oneline -1              # → e498015 feat(charges): CadenceField unified cadence picker (THI-301) (#228)
git status --short                # → M public/llms-full.txt (pré-existant, ne pas commit)
                                  #   ?? docs/handoffs/2026-06-06-2305...md (miroir, committé via prochaine docs PR)
```

Branches nettoyées : toutes les branches feat/\* mergées supprimées (local + remote).

## 2. PRs livrées cette session (toutes MERGÉES)

- **#225** — headline « Reste à payer ce mois » live en tête de la page charges (+ npm audit fix 3 high).
- **#226** — passe de cohérence page charges : chip 3 états « reste X € / ✓ tout payé », unités de cadence sur les sous-totaux (/mois, /trimestre, /an), bandeau succès, tri par date, formulaire replié (liste-first).
- **#227** — PR-C : colonne `is_watched` + `toggleWatchAction` (authz/audit/rate-limit) + `ProchainesFacturesCard` réécrite en 2 sections (« Ce mois-ci » 5 non payées + reste à payer / « À surveiller » = marquées 🔖) + bouton Bookmark inline + **THI-348 a11y soldé** + résilience anti-page-vide (`select('*')` + `log.error`).
- **#228** — PR-D : `CadenceField` (THI-301) — cluster unifié fréquence/ancre/jour, selects natifs, « Dernier jour du mois »=31, résumé humain « Prélevé le 15 : mars, juin, sept., déc. », `CHARGE_FREQUENCIES` centralisé domaine. **C'est l'outil pour corriger les vraies ancres de dates de @thierry** (ex. S.W.D.E → trimestriel à partir de mai).

## 3. Incident majeur résolu (2026-07-18) — « tout le contenu a disparu »

**Fausse alerte.** @thierry a vu la preview #227 (code SELECT `is_watched`) sur la prod NON migrée → requête charges échouée, avalée par `?? []` → UI vide ≈ perte de données. **Preuve read-only : 23 charges intactes (ses 19 comprises).** Zéro donnée perdue, zéro réinsertion.

**Découverte structurelle** : AUCUN mécanisme n'appliquait les migrations Supabase (pas d'intégration GitHub, pas de GHA). Le ledger remote s'arrêtait au 26/05 — le hardening 0528 ET le backfill payment_months 0605 (#223) n'avaient JAMAIS été appliqués (les dates de @thierry étaient bonnes car corrigées à la main via l'UI). **J'ai appliqué les 3 migrations via `supabase db push --linked`** (CLI loggé, projet ankora-prod linké, password `.env.local`) → ledger 14/14 sync, intégrité vérifiée. Process canonique mémorisé : `project_supabase_migrations_manual_push`.

## 4. Décisions prises

- Self-review Fable 5 à la place du plan-reviewer (tombé sur la limite API) — mandat explicite @thierry.
- Résilience schéma N-1 : `select('*')` sur charges + défauts au mapping — plus jamais de page vide sur une fenêtre migration/deploy.
- `CHARGE_FREQUENCIES` = source unique domaine (Sourcery) ; extraction `selectClass` déférée (1 seul select natif) ; `|| 1` défendu (filet).
- Démo design-playground THI-301 omise (nice-to-have, à ajouter sur demande).

## 5. Reste à faire (prochaine session)

1. **Reset mensuel + alerte oubli** — dernier morceau de l'epic Factures (`resetPeriodPaymentsAction` + confirmation ; `getOverdueUnpaidCount` → bandeau « N factures oubliées du mois précédent »). Décision actée : manuel, PAS d'auto-cron.
2. **Analyse graphique phases THI-327 restantes** (timeline 6 mois, goals ETA, drag-to-rebalance — NORTH_STAR #3/#4/#6).
3. **Linear** (MCP déconnecté toute la session) : fermer THI-329, THI-301, THI-348 ; commenter l'incident migrations.
4. Miroir handoffs (`docs/handoffs/` untracked ×2) à committer via une docs PR.

## 6. Anti-pièges

- **Ne PAS commit `public/llms-full.txt`** (modif pré-existante).
- **Migrations** : toujours `npx supabase migration list --linked` avant/après merge d'une PR à migration ; `yes | npx supabase db push --linked` ; jamais supposer une auto-application.
- **MCP Supabase claude.ai = MAUVAIS compte** (Terminal Learning) — utiliser le CLI pour Ankora.
- Ne pas « corriger » `Number(paymentDay) || 1` (intentionnel, expliqué en commentaire PR #228).
- La branche `feat/thi-301-cadence-field` (docs de juin) a été supprimée — les docs vivent sur main via #228.

---

**Signé par** : @cc-ankora (Fable 5) · Session `2026-07-19-0030`
