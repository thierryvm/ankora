# Ankora — Master Plan Waves 3→5

> Document de traçabilité. Mappe chaque point de l'analyse post-Wave 1.5
> vers son livrable concret et sa Wave.

---

## 0. Contexte

**Point de départ.** Après PR #34 (Wave 1.5 Opération Babel) et le chore
i18n tooling, 4 intuitions ont émergé de l'analyse Cowork :

1. **Safety Gate** sur les skills/agents pour éviter les bêtises
2. **Tests élargis** : stabilité, scalabilité, cybersécurité, SEO/GEO, LLM-friendly
3. **Protection anti-régression automatique** sur chemins critiques
4. **Contrôle admin / user / dashboard / graphiques** avec vérif cohérence data

Chaque intuition est désormais tracée vers un livrable daté.

---

## 1. Mapping intuition → livrable → Wave

| #   | Intuition                            | Livrable concret                                                                                              | Wave                      | État                        |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------- |
| 1   | Safety Gate sur skills               | Bloc `## Safety Gate` en tête de `i18n-translator/SKILL.md` + pattern pour futurs skills/agents non read-only | **Wave 3.1**              | 📋 prompt prêt              |
| 2.a | Stabilité — runtime recovery         | React Error Boundaries (root + section) + log JSON structuré                                                  | **Wave 3.2**              | 📋 prompt prêt              |
| 2.b | Stabilité — perf régression          | Lighthouse CI sur chaque PR (perf/a11y/bp/seo bloquants)                                                      | **Wave 3.3**              | 📋 prompt prêt              |
| 2.c | Stabilité — format                   | Prettier dans CI bloquant                                                                                     | **Wave 3.4**              | 📋 prompt prêt              |
| 2.d | Cybersécurité — regression auto      | Agent `regression-guardian` (diff pairing + grep sécurité)                                                    | **Wave 3.5**              | 📋 prompt prêt              |
| 2.e | Cybersécurité — RLS automatisée      | Tests pgtap par table dans `supabase/tests/`                                                                  | **Wave 4.3**              | 🗂 spec à écrire            |
| 2.f | Cybersécurité — auth & middleware    | Tests E2E middleware (locale, session, redirections)                                                          | **Wave 4.4**              | 🗂 spec à écrire            |
| 2.g | Scalabilité — load                   | k6 smoke run en nightly (seuils p95 < 500ms)                                                                  | **Wave 5.3**              | 🗂 spec à écrire            |
| 2.h | Scalabilité — chaos                  | Chaos monkey sur Server Actions (fault injection)                                                             | **Wave 5.4**              | 🗂 spec à écrire            |
| 2.i | SEO / GEO                            | ai.txt + llms.txt + llms-full.txt + robots IA + /glossaire + DefinedTermSet                                   | **Wave 2** (après Wave 3) | 🗂 issues #104 #105         |
| 2.j | LLM-friendly — retrieval             | `seo-geo-auditor` agent + score retrieval page par page                                                       | **Wave 2**                | ✅ agent existe, à invoquer |
| 3.a | Anti-régression — calculs financiers | Property-based tests `fast-check` sur `src/lib/calcs/**`                                                      | **Wave 4.1**              | 🗂 spec à écrire            |
| 3.b | Anti-régression — Server Actions     | Tests Server Actions (success + error + auth + RLS)                                                           | **Wave 4.2**              | 🗂 spec à écrire            |
| 3.c | Anti-régression — i18n keys          | `i18n-auditor` agent + `/i18n-audit` slash command                                                            | **Wave 1.6**              | ✅ shippé (ce chore)        |
| 4.a | Contrôle admin/user/dashboard        | Tests E2E Playwright par rôle (unauth, user, admin) sur flows critiques                                       | **Wave 5.1**              | 🗂 spec à écrire            |
| 4.b | Cohérence data graphiques            | Tests snapshot + invariants (somme lignes = total, axe Y non-négatif sur provisions)                          | **Wave 5.2**              | 🗂 spec à écrire            |
| 4.c | Tests visuels — régression UI        | Playwright screenshots sur landing + dashboard + simulateur, 5 locales, 3 viewports                           | **Wave 5.1**              | 🗂 spec à écrire            |

Légende : ✅ shippé · 📋 prompt CC prêt à lancer · 🗂 spec à écrire

---

## 2. Wave 2 — SEO-AI (après Wave 3)

**Rappel.** Wave 2 a été reportée APRÈS Wave 3 pour blinder le runtime
avant d'ouvrir les vannes SEO. Issues #104 et #105.

Livrables :

- `public/ai.txt` — déclaration d'acceptation/refus des bots IA
- `public/llms.txt` — index lisible LLM (pitch + liens pages clés)
- `public/llms-full.txt` — contenu pleine forme, sections factuelles courtes
- `src/app/robots.ts` — allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.
- Route `/[locale]/glossaire` — page publique rendue depuis `docs/i18n-glossary.md`
- Schema.org `DefinedTermSet` + `DefinedTerm` dans la route glossaire
- Agent `seo-geo-auditor` invoqué en vérification

Critères d'acceptation :

- [ ] `/pr-audit` ✅
- [ ] `seo-geo-auditor` retourne PASS
- [ ] `llms.txt` validé sur https://llmstxt.org/ (format)
- [ ] Score retrieval ≥ 4/5 sur landing + glossaire
- [ ] 5 locales traduites via `i18n-translator` skill

---

## 3. Wave 4 — Couverture métier

### 4.1 — Tests financiers (`fast-check`)

Dépendance : `fast-check@^3.22.x` (MIT, 0 €).

Dossiers cibles :

- `src/lib/calcs/smoothing.ts` — lissage mensuel
- `src/lib/calcs/provision.ts` — calcul de provisions
- `src/lib/calcs/bucketing.ts` — allocation des buckets
- `src/lib/calcs/forecast.ts` — projections
- `src/lib/calcs/currency.ts` — arithmétique EUR cents

Invariants à tester (property-based) :

- Somme des buckets = montant total (tolérance 1 cent max pour arrondis)
- Lissage sur N mois : somme des mensualités = montant annuel
- Provisions : jamais négatives, jamais > solde compte
- Currency : pas de perte de précision sur 1M opérations aléatoires
- Edge cases : DST, année bissextile, fin de mois (28/29/30/31)

Seuil couverture : ≥ 95 % sur `src/lib/calcs/`.

### 4.2 — Tests Server Actions

Dossier `src/app/**/actions.ts` ou équivalent. Pour chaque action :

- Test success path avec payload valide
- Test validation Zod (payload invalide → erreur typée)
- Test auth (utilisateur non connecté → redirect/401)
- Test RLS (utilisateur connecté mais pas propriétaire → 403)
- Test rate limit si applicable

Seuil couverture : ≥ 90 % sur `src/app/**/actions.ts`.

### 4.3 — Tests pgtap (RLS)

Outil : `pgtap` (PostgreSQL extension, 0 €, déjà dispo sur Supabase).

Dossier à créer : `supabase/tests/rls/`.

Pour chaque table avec RLS :

- `SELECT` par owner → retourne
- `SELECT` par non-owner → retourne 0 lignes
- `INSERT` avec `auth.uid()` correct → OK
- `INSERT` avec `auth.uid()` falsifié → rejet
- `UPDATE` par non-owner → rejet
- `DELETE` par non-owner → rejet

Invocation CI : job GitHub Actions `pgtap-tests` sur PR + main.

### 4.4 — Tests middleware

Fichier `tests/middleware.test.ts` :

- Redirection short-locale (`/fr` → `/`, `/nl` → `/nl-BE`, etc.)
- Détection locale par `Accept-Language`
- Détection locale par cookie `NEXT_LOCALE`
- Routes protégées redirigent vers login
- CSP / headers de sécurité présents
- Rate limiting déclenche 429 après seuil

---

## 4. Wave 5 — Tests visuels + chaos

### 5.1 — Playwright screenshots par rôle

3 projets Playwright : `unauthenticated`, `user`, `admin`.

Pages à capturer en screenshot par projet :

- Landing `/`
- Glossaire `/glossaire`
- Simulateur `/simulateur`
- Dashboard `/dashboard` (user + admin)
- Admin panel (admin uniquement)

3 viewports : mobile 375x812, tablet 768x1024, desktop 1440x900.
5 locales : fr-BE, nl-BE, en, de-DE, es-ES.

Total : 3 projets × ~5 pages × 3 viewports × 5 locales = ~225 screenshots.

### 5.2 — Cohérence data graphiques

Dossier cible : `src/components/charts/`.

Pour chaque composant chart :

- Test unitaire : somme lignes = total affiché
- Test unitaire : axe Y respecte le type de donnée (non-négatif sur provisions, bornes sur pourcentages)
- Test unitaire : tri cohérent (chronologique, alphabétique, selon prop)
- Snapshot Playwright : rendu identique à 1px près

### 5.3 — k6 smoke

Outil : `k6` (Grafana Labs, open source, 0 € en usage local/CI).

Scénario `scripts/k6/smoke.js` :

- 10 VUs pendant 1 min sur `/`
- Seuils : p95 < 500ms, error rate < 1%
- Déclenchement : GitHub Actions nightly

### 5.4 — Chaos monkey

Middleware de test qui injecte aléatoirement des erreurs sur Server Actions
en environnement `preview`/`staging` (jamais en prod).

Cibles :

- Supabase timeout simulé (5% des requêtes)
- Latence artificielle (500ms sur 10% des requêtes)
- 500 random sur actions non critiques (3%)

But : vérifier que les Error Boundaries + retry logic + messages d'erreur
i18n tiennent le choc.

---

## 5. Pattern d'orchestration

```
Cowork (Claude Opus)  →  stratégie / analyse / prompts CC
       │
       ▼
CC Ankora (Opus 4.7)  →  exécution code / git / PR / issues
       │
       ▼
Thierry  →  arbitrage produit / merge final / tranchement
```

**Règles de synchronicité** :

1. Chaque prompt CC référence les fichiers versionnés (`.claude/skills/`, `.claude/agents/`, `.claude/commands/`)
2. Chaque Wave produit un commit atomique + une PR dédiée
3. Chaque PR passe `/pr-audit` + les auditeurs applicables avant merge
4. Cowork conserve le master plan à jour (ce fichier)
5. Thierry tranche les arbitrages ouverts (budget, priorité, design)
6. Pour toute étape nécessitant le terminal (git, gh, npm, pnpm), CC Ankora exécute — Thierry ne prend pas les mains

---

## 6. Budget 0 € — récap dépendances Waves 3→5

| Dépendance             | Wave | Licence              | Statut              |
| ---------------------- | ---- | -------------------- | ------------------- |
| `react-error-boundary` | 3    | MIT                  | ✅                  |
| `@lhci/cli`            | 3    | Apache-2.0           | ✅                  |
| `prettier`             | 3    | MIT                  | ✅                  |
| `fast-check`           | 4    | MIT                  | ✅                  |
| `pgtap`                | 4    | PostgreSQL           | ✅ (natif Supabase) |
| `k6`                   | 5    | AGPL-3.0 (CLI local) | ✅                  |
| Chaos monkey maison    | 5    | —                    | ✅ (code projet)    |
| **Aucun SaaS payant**  | —    | —                    | ✅                  |

Sentry / PostHog / LogRocket / Datadog restent **hors scope** et signalés par
`/pr-audit`. Toute tentative d'introduction nécessite validation explicite
de Thierry (Wave 3.5 optionnelle si un jour nécessaire).

---

## 7. État global — snapshot

| Wave  | Objectif                              | État               | Blocker           |
| ----- | ------------------------------------- | ------------------ | ----------------- |
| 1.5   | Opération Babel (5 locales)           | ✅ shippée PR #34  | —                 |
| 1.6   | i18n tooling + master plan versionnés | 🚧 ce chore        | —                 |
| **3** | **Garde-fous runtime**                | **📋 prompt prêt** | Merge 1.6 d'abord |
| 2     | SEO-AI                                | 🗂 spec finalisée  | Wave 3 shippée    |
| 4     | Couverture métier                     | 🗂 spec ci-dessus  | Wave 2 shippée    |
| 5     | Tests visuels + chaos                 | 🗂 spec ci-dessus  | Wave 4 shippée    |

---

## 8. Pending hors Waves

- Issue #100 — Mockups v2 simulateur
- Issue #68 — Doc modèle accounts + buckets + persona

Ces deux items seront intercalés par Thierry selon priorité produit.
