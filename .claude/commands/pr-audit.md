---
description: Audit rapide de conformité — budget 0€, dépendances, cohérence ROADMAP vs code
---

Produis un audit de conformité du projet Ankora en 5 sections.

## 1. Budget 0 €

Grep dans `package.json` (deps + devDeps) :

```
@sentry/|logrocket|bugsnag|datadog|rollbar|newrelic|fullstory|heap|mixpanel|amplitude|hotjar|appsignal
```

- Si match : ⚠️ alerte avec la dépendance + recommandation (retirer ou demander validation Thierry)
- Sinon : ✅ "Aucune dépendance de monitoring payante détectée"

Grep dans `src/` :

```
process\.env\.(STRIPE|OPENAI|ANTHROPIC|DEEPL|GOOGLE_API)
```

- Si match hors tests : ⚠️ alerte (API payante côté runtime)
- Sinon : ✅

## 2. Cohérence ROADMAP ↔ code ↔ GitHub

- Lis le tableau d'ordre des PR dans `docs/ROADMAP.md`
- Pour chaque PR marquée ✅ : vérifie qu'il existe un `docs/prs/PR-{X}-report.md`. Si absent : ⚠️
- Pour chaque PR 📋 : vérifie que `prompts/PR-{X}-*.md` existe. Si absent : ⚠️
- Pour chaque PR 🚧/📋 : vérifie qu'une issue GitHub existe avec le label `pr:PR-{X}` (via `gh issue list --label "pr:PR-X"`). Si absent : ⚠️

## 3. Sécurité rapide

- `npm audit --production` → report des high/critical si présents
- Grep `src/` pour : `any(?![a-zA-Z])` (TypeScript any non qualifié) → liste des occurrences
- Grep `src/` pour : `eslint-disable` → liste des suppressions
- Grep `supabase/migrations/` pour : tables sans `ENABLE ROW LEVEL SECURITY` → ⚠️

## 4. Variables d'env

Compare `.env.example` avec `src/lib/env.ts` (schéma Zod).

- Variables déclarées dans l'env mais pas dans le schéma : ⚠️
- Variables dans le schéma mais pas dans `.env.example` : ⚠️

## 5. Branches Git

- Vérifie que `main` est protégée (via `gh api repos/thierryvm/ankora/branches/main/protection`)
- Vérifie que la branche courante n'est pas `main` (pas de commits directs)
- Vérifie que toutes les PR ouvertes ont les labels requis (`pr:PR-X`, `type:*`, `status:*`)

## Synthèse

Produis un tableau final :

| Catégorie    | Statut   | Issues |
| ------------ | -------- | ------ |
| Budget 0 €   | ✅ ou ⚠️ | …      |
| ROADMAP sync | ✅ ou ⚠️ | …      |
| Sécurité     | ✅ ou ⚠️ | …      |
| Env vars     | ✅ ou ⚠️ | …      |
| Git hygiene  | ✅ ou ⚠️ | …      |

Termine par une recommandation concrète si au moins une ligne est ⚠️.
