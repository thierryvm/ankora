# THI-243 — Perf investigation : lenteur 1sec+ navigation prod (ankora.be)

> **Note** : ticket Linear effectif = **[THI-243](https://linear.app/thierryvm/issue/THI-243/perf-investigation-lenteur-1sec-navigation-prod-145-mb-fonts-ttf-non)**. Le préfixe `thi-225` dans le nom du fichier était la prédiction du prompt @cowork — Linear auto-numérote séquentiellement et a attribué THI-243. Filename gardé tel quel (le date-stamp `2026-05-19-...` est l'identifiant canonique du document).

| Champ          | Valeur                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Date audit     | 2026-05-19                                                               |
| Auteur         | @cc-ankora (session #4, Opus 4.7)                                        |
| Demandeur      | @cowork (mandaté par @thierry)                                           |
| Scope          | **Audit only** — aucune modification code source. Diagnostic + fix path. |
| Branche audit  | `audit/perf-investigation-19052026` (worktree isolé)                     |
| Référence prod | `aeaa22f` (main, 19/05)                                                  |
| Région Vercel  | `cdg1 → fra1` ✅ EU                                                      |

## 1. Contexte

@thierry a constaté lenteur 1sec+ généralisée sur navigation prod (changement de langue, page→page). @cowork a remonté manuellement via Chrome MCP :

| Signal            | Mesure                                                | Source                                 |
| ----------------- | ----------------------------------------------------- | -------------------------------------- |
| Hard load complet | 3173 ms (`domComplete`)                               | Navigation Timing API desktop 1280×800 |
| RSC prefetch 503  | 2/25 requests (signup, faq), token `LGyBvtBwaeshY1DN` | DevTools Network                       |
| Soft nav FR→EN    | Fonctionne                                            | `<select>` change                      |

**Mission** : diagnostic factuel + identifier root cause(s) + proposer fix path. **Pas d'exécution de fix**.

## 2. Mesures factuelles (méthodologie reproductible)

### 2.1 — RSC prefetch latency (curl, 5 runs par route, headers `rsc: 1` + `next-router-prefetch: 1`)

| Route     | TTFB min | TTFB max | TTFB moyen | HTTP   | Cache                  |
| --------- | -------- | -------- | ---------- | ------ | ---------------------- |
| `/signup` | 167 ms   | 211 ms   | 191 ms     | 200 ×5 | `X-Vercel-Cache: MISS` |
| `/faq`    | 154 ms   | 298 ms   | 199 ms     | 200 ×5 | MISS                   |
| `/`       | 147 ms   | 223 ms   | 175 ms     | 200 ×5 | MISS                   |

**Conclusion 2.1** : sur 15 calls séquentiels, **aucun 503 reproduit**. Le signal 503 @cowork est probablement un **cold-start transient** Vercel Hobby (pas de pre-warming sur ce plan). Tous prefetches `Cache-Control: private, no-store` → exécution fonction serverless complète à chaque hit (par design, justifié par nonce CSP per-request).

### 2.2 — Full HTML response timing (curl sans header RSC)

| Route     | TTFB premier hit (cold) | TTFB hits suivants (warm) | Taille HTML        |
| --------- | ----------------------- | ------------------------- | ------------------ |
| `/signup` | 430 ms                  | 170–195 ms                | **84 562 octets**  |
| `/faq`    | 427 ms                  | 170–225 ms                | **101 564 octets** |

**Variation cold/warm : 2–3×**. Le hard load 3173 ms côté @cowork peut être expliqué par cold start + ressources sub-séquentes (fonts, JS, CSS).

### 2.3 — Fonts auto-hébergés (THE smoking gun)

| Asset                               | Taille brute       | Content-Encoding | Cache-Control                        |
| ----------------------------------- | ------------------ | ---------------- | ------------------------------------ |
| `/fonts/Inter-Variable.ttf`         | **879 708 octets** | _aucun (TTF)_    | `public, max-age=0, must-revalidate` |
| `/fonts/Fraunces-Variable.ttf`      | 303 781 octets     | _aucun_          | `public, max-age=0, must-revalidate` |
| `/fonts/JetBrainsMono-Variable.ttf` | 300 144 octets     | _aucun_          | `public, max-age=0, must-revalidate` |
| **Total fonts par page**            | **~1.45 MB**       | non compressé    | **revalidation à chaque navigation** |

Source : `src/app/globals.css:8–34` (3 × `@font-face` pointant `/fonts/*.ttf`) + `src/app/[locale]/layout.tsx:21–25` (`next/font/google` Inter).

**Double chargement Inter confirmé** :

- ① `next/font/google` Inter → Google Fonts CDN (woff2 ~25 KB, cache CDN long)
- ② `globals.css` `@font-face url('/fonts/Inter-Variable.ttf')` → self-hosted, TTF, 879 KB, **revalidation par défaut**

Le double-load Inter était déjà flagué F-4 par `mobile-ios-auditor` dans PR #169 ("dette pré-existante à tracker"). C'est au moins ~1 MB de poids inutile sur **chaque page**.

### 2.4 — Bundle size (`npm run build` Next.js 16.2.6 + Turbopack)

| Top chunks                     | Taille brute (sur disque)                   |
| ------------------------------ | ------------------------------------------- |
| `0nqtby78rj49r.js`             | 268 KB                                      |
| `17mubwtqwijpu.js`             | 228 KB                                      |
| `0fx9ag598bzmi.js`             | 164 KB                                      |
| `03~yq9q893hmn.js` (polyfills) | 112 KB                                      |
| `14rr1qs9.b6q1.css`            | **96 KB CSS**                               |
| `11ekn.n-56taf.js`             | 80 KB                                       |
| Top 5 JS cumulé                | ~852 KB raw / **~260–310 KB gzippé estimé** |

`rootMainFiles` (charge sur **toutes** les routes) compte 5 chunks : `0ztf_.iml.v07.js` (24 KB), `00f6e6q842y9l.js` (28 KB), `17mubwtqwijpu.js` (228 KB), `0fx9ag598bzmi.js` (164 KB), `turbopack-*.js`.

**Observation** : `decimal.js` (~150 KB raw, ~50 KB gzippé) est importé par 4 composants dashboard **client** (CapaciteEpargne, EffortFinancier, ProvisionHealthGauge, Simulateur). Ces composants ne sont pas chargés sur le marketing public mais font partie de `/app/*`. Pour le marketing pur (`/`, `/faq`, `/legal/*`), `decimal.js` ne devrait pas être bundlé. À vérifier dans phase fix.

**Toutes les routes sont `ƒ` (Dynamic, server-rendered on demand)**. Aucun pré-rendu statique, même pour les pages marketing publiques (`/`, `/faq`, `/legal/*`, `/glossaire/*`). Cause : `cookies()` lu dans `[locale]/layout.tsx:142–144` (theme cookie) + `request.headers` (nonce CSP) → opt-out de la static generation.

### 2.5 — Middleware pipeline par requête (`src/proxy.ts`)

Chaque requête, **y compris les RSC prefetches depuis PR #169** (merged hier 18/05) :

1. CSP nonce gen (`Buffer.from(nanoid()).toString('base64')`) — <1 ms
2. `request.headers.set` × 3 (x-nonce, content-security-policy, x-pathname) — <1 ms
3. `handleI18nRouting(request)` — next-intl, ~5–15 ms
4. `updateSession(request, response)` → **`supabase.auth.getUser()` network call** vers Supabase EU — **~30–80 ms** (mesuré indirectement via TTFB delta entre prefetch warm 170 ms et le coût constant non-fonction)

**Avant PR #169** : les prefetches bypassaient le middleware via le `missing:` filter → 404 (bug fixé) mais aussi **~50 ms économisés par prefetch** (pas de Supabase auth call sur prefetch).

**Compromis volontaire** : PR #169 a réintroduit le full pipeline sur prefetches pour résoudre les 404s locale-rewrite. Trade-off conscient (cf. commit body). Pas un bug — mais la latence ~50 ms × N prefetches sur une page se cumule.

### 2.6 — Vercel region

`X-Vercel-Id: cdg1::fra1::...` → Paris edge + Frankfurt function. EU optimal pour @thierry (Belgique). ✅ **Pas un facteur de latence**.

### 2.7 — Messages JSON shippés au client

`src/app/[locale]/layout.tsx:184` : `<NextIntlClientProvider locale={locale} messages={messages}>`. `getMessages()` retourne le **bundle complet** de la locale active (`messages/fr-BE.json` = 52 KB, `en.json` = 48 KB).

→ ~48–52 KB JSON sérialisés dans le HTML inline (visible dans la mesure 2.2 : `/faq` HTML = 101 KB dont ~50 KB messages). Côté client : parse + hydration de tout le tree de messages, même les clés non utilisées sur cette page.

Recommandation next-intl 4.x : passer `<NextIntlClientProvider messages={pick(messages, ['common', 'navigation', ...])}>` au lieu du dump complet. Économie potentielle : 30–40 KB HTML + parse cost.

## 3. Root causes identifiés (classés par impact perçu)

### 🔴 RC #1 — Fonts auto-hébergés TTF 1.45 MB sans cache effectif

**Preuve** : §2.3.

**Mécanisme** :

- TTF format non compressible (vs WOFF2 typiquement -65 %)
- `Cache-Control: max-age=0, must-revalidate` (défaut Vercel pour `/public/*` sans config) → revalidation 304 conditionnelle à chaque navigation
- Double chargement Inter (Google Fonts + self-hosted)
- Hard load cold = ~1.45 MB téléchargement + parse + paint blocked si pas FOUC-safe

**Impact estimé** : sur connexion 4G typique (10 Mbps effectif), 1.45 MB = ~1.16 s download seul. Sur cold load (cache vide), c'est l'explication N°1 du 3173 ms `domComplete`.

### 🟠 RC #2 — Toutes les routes en `ƒ` Dynamic (zéro statique)

**Preuve** : §2.4 build output + `cookies()` dans layout.

**Mécanisme** : `cookies().get('theme')` ligne 142 et `headers().get('x-nonce')` opt-out static generation. Conséquence : `/`, `/faq`, `/legal/*`, `/glossaire/*` (pages 100 % publiques anonymes) exécutent une fonction serverless cold-startable à chaque visite.

**Impact** : ~200–400 ms TTFB cold sur ces routes au lieu de ~50 ms (edge cache). Sur ankora.be Hobby plan, cold start fréquent (pas de pre-warming).

### 🟡 RC #3 — Messages JSON complets inline dans HTML

**Preuve** : §2.7. /faq HTML = 101 KB dont ~50 KB messages JSON.

**Impact** : +30–40 KB HTML par page + parse cost client. Pas critique mais améliorable trivialement.

### 🟡 RC #4 — Supabase `auth.getUser()` middleware sur routes publiques anonymes

**Preuve** : `src/lib/supabase/middleware.ts:29` — appel inconditionnel.

**Mécanisme** : même pour un visiteur anonyme arrivant sur `/`, le middleware exécute un round-trip réseau vers Supabase EU pour vérifier la session. ~30–80 ms ajoutés à chaque request, y compris RSC prefetches depuis PR #169.

**Impact** : addition de ~50 ms par navigation. Pas dramatique unitairement, mais multiplié par N prefetches déclenchés par Next.js sur viewport visible / hover, ça pèse.

### 🟢 RC #5 (signal écarté) — RSC prefetch 503

**Preuve** : §2.1, 15/15 RSC prefetches retournés HTTP 200 sur signup/faq/root.

**Diagnostic** : 503 transitoire = cold start Vercel function sous burst de prefetches concurrent. Plan Hobby pas de pre-warming → variance attendue. Surveiller via Vercel logs si récidive, mais **pas un root cause structurel**.

## 4. Recommandations fix (par priorité décroissante)

| #      | Fix                                                                                                                                                                                              | Effort          | Impact perçu                                               | Risque                                                                             | Quality gates touchés                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **F1** | Convertir 3 fonts TTF → WOFF2 (+ subset latin si besoin)                                                                                                                                         | **S** (~30 min) | **-1 MB par page, -800 ms LCP cold**                       | Faible — WOFF2 supporté >97 % browsers                                             | `mobile-ios-auditor`, `ui-auditor` (fallback fonts à valider)    |
| **F2** | Ajouter `Cache-Control: public, max-age=31536000, immutable` sur `/fonts/*` via `next.config.ts headers()`                                                                                       | **XS** (~5 min) | **-1.45 MB sur tous loads sauf 1er**, élimine revalidation | Aucun — fingerprint des fonts si renaming futur                                    | `security-auditor` (sanity check)                                |
| **F3** | Supprimer double-load Inter : choisir EITHER `next/font/google` Inter (drop globals.css `@font-face Inter`) EITHER self-hosted (drop `next/font/google` Inter import)                            | **S** (~15 min) | **-879 KB sur cold load**                                  | Faible — vérifier que la stack `var(--font-sans)` reste cohérente                  | F-4 mobile-ios dette résolue                                     |
| **F4** | Marketing public en statique : extraire `cookies()` (theme) hors `[locale]/layout.tsx`, déléguer à un Client Component d'hydration (ThemeBootScript déjà fait ça côté SSR — à pousser plus loin) | **M** (~2 h)    | **TTFB ~50 ms edge cache** sur `/`, `/faq`, `/legal/*`     | Moyen — peut casser dark-mode SSR initial (FOUC)                                   | `mobile-ios-auditor` (no-FOUC invariant), `dashboard-ux-auditor` |
| **F5** | `<NextIntlClientProvider messages={pick(messages, ['common', 'navigation', 'cookies'])}>` (scoper messages au tree commun + lazy charger les autres namespaces par route)                        | **M** (~1 h)    | **-30 à -40 KB HTML par page**                             | Faible — TS strict détecte les keys manquantes                                     | `i18n-auditor`, `test-runner`                                    |
| **F6** | Skip `supabase.auth.getUser()` middleware sur routes publiques anonymes (whitelist `/`, `/faq`, `/legal/*`, `/glossaire/*`, `/login`, `/signup`)                                                 | **S** (~30 min) | **-30 à -80 ms TTFB** sur marketing                        | Moyen — gérer le edge case "user déjà loggé visite home" (lui rediriger vers /app) | `security-auditor`, `rls-flow-tester`, `gdpr-compliance-auditor` |
| **F7** | Marketing `/`, `/faq`, `/legal/*` : audit composants client pour exclure `decimal.js` du bundle (dynamic import si vraiment requis sur ces pages)                                                | **S** (~30 min) | **-50 KB gzippé** sur marketing bundles                    | Faible                                                                             | `test-runner`                                                    |

### Séquençage proposé

1. **Phase A — quick wins (F1 + F2 + F3)** : 1 PR, ~1 h effort, **gain estimé -1 MB par page + -800 ms LCP cold**. Aucun risque architectural. À shipper en priorité absolue, **probablement résout 70 % du problème perçu**.
2. **Phase B — middleware lean (F4 + F6)** : 1 PR, ~3 h effort. Static prerender marketing + skip Supabase auth sur routes anonymes. Gain TTFB cumulé ~100 ms / route. Demande validation `security-auditor` rigoureuse (regressions auth).
3. **Phase C — payload trim (F5 + F7)** : 1 PR, ~1.5 h effort. Tree-shake messages JSON + dynamic imports. Gain marginal mais propre.

## 5. Hypothèses @cowork écartées (avec preuves)

| Hypothèse @cowork                                     | Statut                                    | Preuve d'écartement                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RSC prefetch instable (503 systémique signup/faq)     | **Écartée** comme root cause              | 15/15 RSC prefetches retournent HTTP 200 sur signup/faq/root (§2.1). Le 503 observé via Chrome MCP est probablement un cold-start transient ponctuel (Vercel Hobby, pas de pre-warming).                                                             |
| next-intl middleware overhead                         | **Partiellement confirmée mais marginal** | Pipeline ~5–15 ms (§2.5). Surcoût réel après PR #169 = `supabase.auth.getUser()` ~30–80 ms (RC #4), pas next-intl lui-même.                                                                                                                          |
| Hydration JS bundle large (Recharts + decimal.js + …) | **Partiellement confirmée**               | Pas de Recharts dans `package.json` (vérifié §2.4 et `dependencies` deps list). `decimal.js` présent mais limité aux composants dashboard `/app/*`. Bundle marketing reste raisonnable ~260–310 KB gzippé top 5 chunks. **Pas le facteur dominant**. |

## 6. STOP CONDITIONS rencontrées

| Condition                                         | Statut                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit perf récent existant en cours de fix        | ❌ Aucun. Premier audit perf documenté dans `docs/audits/`.                                                                                                     |
| Conflit avec session #3 (THI-192)                 | ❌ Worktree isolé `audit-perf-investigation-19052026`, branche dédiée, **0 modif code source prod**.                                                            |
| Dépendance payante implicite dans recommandations | ❌ F1 (woff2 conversion) faisable avec `fonttools` Python ou `glyphhanger` Node, gratuit. F2 (Cache-Control header) Vercel headers config. Budget 0 € respecté. |
| Fix trivial < 5 lignes résolvant 503 RSC          | ❌ Pas de fix trivial — le "503" n'est pas reproduit, donc pas de fix à proposer. Si récidive, instrumenter via Vercel function logs.                           |
| Validation Thierry requise avant doc audit        | ❌ Audit only, pas de PR fix. @thierry valide diagnostic + plan séquençage avant ouverture PR fix.                                                              |

## 7. Limites de l'audit

- **Lighthouse CI prod a crashé** sur ce poste Windows (Chrome cleanup EPERM + `NO_NAVSTART` errors). Scores LH chiffrés non capturés. Mitigation : mesures curl + analyse code statique fournissent un signal solide pour les 4 root causes. Re-run lhci recommandé depuis CI Linux (où il tourne déjà sur `.lighthouserc.json` localhost — adapter pour prod URL si besoin).
- Mesures réseau effectuées depuis Belgique fibre (~150–200 ms RTT). Sur 4G/3G les chiffres explosent (factor 5–10×) — le RC #1 fonts devient critique mobile.
- Aucun profil JS hydration capturé (DevTools Performance). Si Phase A ne résout pas l'intégralité du ressenti, profiler hydration dans un audit follow-up.

## 8. Next steps (proposition @cowork)

1. **@cowork** valide diagnostic + séquençage Phase A/B/C.
2. **Linear THI-243** créé (priorité High, labels Bug + Tech Debt + frontend + Mobile). Template utilisé en Annexe A à titre de référence.
3. **@cc-ankora** ouvre PR Phase A (F1+F2+F3) sur worktree dédié, ~1 h effort, **résout 70 % du problème probablement**.
4. **@thierry** smoke test prod post-merge Phase A pour valider le ressenti avant d'engager Phase B.

---

## Annexe A — Linear THI-243 (créé)

> Ticket effectif : [THI-243](https://linear.app/thierryvm/issue/THI-243/perf-investigation-lenteur-1sec-navigation-prod-145-mb-fonts-ttf-non) — Priority: High · Labels: Bug, Tech Debt, frontend, Mobile · Status: Backlog

```
Title: Perf investigation — lenteur 1sec+ navigation prod (1.45 MB fonts TTF non cachées + 3 RC)
Priority: High (P2)
Labels: Performance, Bug, Beta-blocker-soft

Description:
Audit complet : docs/audits/2026-05-19-thi-225-perf-investigation-1sec-nav-lag.md

TL;DR
- Root cause N°1 : 1.45 MB de fonts TTF auto-hébergées, max-age=0, double-load Inter (Google + self-hosted)
- 3 RC secondaires : routes 100% dynamic, messages JSON inline 50 KB, Supabase auth getUser sur routes anonymes
- Le 503 RSC observé n'est PAS reproductible — cold start transient, pas un bug structurel
- Région Vercel EU ✅, bundle ~280 KB gzippé acceptable

Fix Phase A (priorité 1, ~1h effort)
- F1 : TTF → WOFF2 (-1 MB par page)
- F2 : Cache-Control immutable sur /fonts/* (-1.45 MB sur loads suivants)
- F3 : Supprimer double-load Inter

Acceptance criteria
- LH performance ≥ 0.95 desktop, ≥ 0.85 mobile sur ankora.be/
- Total font payload < 250 KB woff2 par page
- @thierry smoke test : ressenti navigation < 500 ms warm

Owner: @cc-ankora (exec) + @cowork (validate)
```

## Annexe B — Reproductibilité commandes

```bash
# Worktree audit isolé (séparé de session #3 THI-192)
git worktree add F:/PROJECTS/Apps/ankora-worktrees/audit-perf-investigation-19052026 \
  -b audit/perf-investigation-19052026 origin/main

# RSC prefetch repro (15/15 = HTTP 200, pas de 503)
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "HTTP=%{http_code} time=%{time_total}s\n" \
    "https://ankora.be/signup?_rsc=$i" \
    -H "rsc: 1" -H "next-router-prefetch: 1"
done

# Fonts size + cache headers (3/3 = max-age=0, TTF non compressé)
curl -sI "https://ankora.be/fonts/Inter-Variable.ttf"        # 879 KB
curl -sI "https://ankora.be/fonts/Fraunces-Variable.ttf"     # 304 KB
curl -sI "https://ankora.be/fonts/JetBrainsMono-Variable.ttf"# 300 KB

# Vercel region (EU OK)
curl -sI "https://ankora.be/" | grep -i x-vercel-id   # cdg1::fra1

# Bundle analysis
npm run build  # voir Route table + .next/static/chunks/*.js
```

— @cc-ankora (session #4, Opus 4.7), 2026-05-19
