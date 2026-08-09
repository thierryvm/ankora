---
project: ankora
type: cc-handoff
session: 2026-08-09-2310
agent: cc-fable
---

# Handoff — PR L2 « relevé corrigé » : hero + portée papier, mergée (#339)

> Session @cc-fable (Fable 5, exception @thierry du 8 août — périmètre visuel
> L2/L3), worktree `F:\PROJECTS\Apps\ankora-landing`, port 3200.
> **Merge exécuté par l'agent sur délégation EXPLICITE de @thierry en session**
> (« tu peux merge à ma place sans soucis, tant que tout est vérifié »).

## 1. État git brut

```text
origin/main : c378978 feat(landing): le hero « relevé corrigé », et la page passe au papier (#339)
              685d172 feat(pwa): l'icône installée mène au cockpit… (#336)
              7e3df34 feat(design): la portée papier de la landing… (#338 = L1)

worktree    : feat/landing-hero-releve (2 commits squashés dans c378978)
              540cef8 le hero + wrapper + i18n + tests + fixme levé
              14c1325 l'assertion de signe (retour Sourcery) + rapport
```

Le worktree garde `supabase/.temp/project-ref` (gitignoré) et le harnais de
mesure `.playwright-mcp/measure-l2.mjs` + captures (gitignorés).

## 2. PR — état final

**#339, MERGED** le 9 août 2026 à 21:01Z, squash `c378978`. DoD 5/5 consignée
dans le dernier commentaire de la PR :

- CI toute verte ; Vitest CI **2193/2193**.
- **Planchers e2e relevés sur le run 31335138067/31335135503** : public
  **231 passed** (228 → 231, exactement le +3 de la levée du fixme
  BUG-iOS-HERO-OVERFLOW, un par projet iPhone, 0 failed 0 flaky) ; authentifié
  **41 passed / 5 skipped**, inchangé. Le journal
  `docs/reference/planchers-e2e-historique.md` doit reprendre **231** au
  prochain passage.
- Sourcery : inline appliqué avec 2 corrections (sa suggestion mettait le
  solde positif dans les négatifs et visait une clé inexistante) — réponse
  dans le fil, fil résolu ; 2 remarques générales écartées avec motif en
  commentaire de PR (épingler la copie exacte est un choix du dépôt).
- `check-sourcery-resolved` a rougi au push-2 (piège documenté : il tourne
  avant la résolution du fil) → fil résolu puis `gh run rerun` → vert.

## 3. Ce que L2 a livré

Wrapper `.mkt-paper` dans `(public)/page.tsx` + parade flex
(`body > .mkt-paper` + `body > .mkt-paper > main` — PAS `.mkt-paper > main`,
qui casserait la falsification `blockAfter` de contrast-ratios.test.ts:348) ;
`Hero.tsx` carte relevé (figure/dl, aria-label complet, zéro JS client, zéro
animation) ; `RELEVE_DEMO {1240,280,162,798}` + tests (arithmétique, signe
U+2212 ×5 bundles, typographie NBSP épinglée par textContent brut) ;
`landing.hero.releve.*` ×5 bundles (waterfall préservé pour Feature) ;
`.bg-brand-radial` supprimé ; `HERO_KPIS`/`HERO_SPARKLINE` supprimés,
`HERO_BROWSER_DOTS` dormant (consigne du plan — son seul consommateur était
l'ancien hero). Rapport complet : `docs/prs/PR-L2-report.md`.

Mesures build prod, 390×664, deux thèmes : payoff **611 ≤ 664**, zéro
débordement (aussi 360/320), parade prouvée (footer épinglé page courte),
compagnon `body:has()` actif sous la bannière, navy intact en sombre.

## 4. Décisions prises cette session

- **Retouches issues des agents QA avant push** : `shadow-md` sur la carte
  (frontière 1,05:1 sur papier — l'ombre EST la frontière, trade-off documenté
  dans le composant ; durcir `paper-line` serait un chantier L1) ; `min-w-0`
  sur les quatre `dt` (garde anti-mot-insécable, composés allemands).
- **H1 mobile à 28 px** = plancher Fraunces du design system, pour tenir le
  payoff au-dessus du pli (mesuré 764 → 679 → 611 en trois resserrages).
- **e2e:auth local NON lancé** : l'outil cible la production réelle ; diff
  100 % public ; le job CI éphémère a mesuré le plancher (41, inchangé).
- Suite vitest plein-workers instable sur cette machine (contention →
  `settings-mfa` rougit) : `--maxWorkers=4` stable, signalé au rapport.

## 5. En attente @thierry

- **5 contrôles visuels iPhone réel** (listés au rapport §Agents QA) :
  payoff à 320 px deux thèmes ; filet double au zoom (deux traits ?) ;
  italique « déjà engagé » (synthétique — pas de fonte italique Fraunces) ;
  défilement lent en surveillant la nav sticky (révélerait le double-scroller
  F1) ; A2HS sur SE.
- Valider la micro-PR handoff+ROADMAP si elle n'est pas déjà mergée.

## 6. Garde-fous activés

Préflight GO à chaque commande sortante (aucun NO-GO cette session) ; chemins
explicites au staging, `git diff --cached --stat` relu avant chaque commit ;
`public/llms-full.txt` restauré avant chaque commit (régénéré par 3 builds) ;
agents QA read-only (Read/Grep/Glob, pas de Bash). Un faux positif corrigé en
route : mon tri du dictionnaire cspell réécrivait 1024 lignes pour un mot —
restauré, insertion à sa place.

## 7. Next action concrète

**PR L3** (`feat/landing-sections-releve`, plan §L3) — Fable 5 admis :
sections Principles/Feature/WhatIfDemo/FAQ/FooterCTA au ton « relevé »,
5e entrée FAQ (l'objection banque), migration `landing.hero.waterfall.*` →
`landing.feature.waterfall.*` + `HERO_WATERFALL_DEMO`/`HERO_BROWSER_DOTS`
(arbitrage dormant), metadata SEO, adaptations connues
(`landing-sections.spec.ts:37/:66`, `FAQ.test.tsx:39`). Reprendre au passage :
NBSP des montants waterfall, `<h3>` orphelin de Feature.

## 8. Anti-pièges (session L3)

- Le plancher public est désormais **231** — toute PR qui le fait baisser se
  justifie par écrit.
- `landing-sections.spec.ts:66` attend `mainEntity` = 4 → passera à 5 avec la
  FAQ ; `:37` asserte la copie du h2 FooterCTA.
- Ne PAS « aligner » « Encore vraiment à toi » sur un nom ADR-035 — les deux
  chiffres ne sont pas la même formule (écrit dans l'ADR-039 et dans
  Hero.test.tsx, assertion négative).
- Ne PAS fusionner les deux blocs de portée papier ; ne PAS écrire de règle
  commençant par `.mkt-paper`.
- e2e locaux : serveur PROD local obligatoire (`build` + `start` — le dev
  compile à la demande et fait échouer par timeout) ; `consent-first-visit` et
  `admin-security-headers` échouent en local par l'environnement (vrai
  Supabase/Upstash, header prod absent), pas par le code.
- Suivis ouverts hors L3 : fonte italique Fraunces ; double scroll-container
  html/body ; cibles < 44 px préexistantes (logo, hamburger, consentement).

---

**Signé** : @cc-fable · Session 2026-08-09-2310
