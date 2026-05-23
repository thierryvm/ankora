# PR-CHORE-CLAUDE-HYGIENE — Rapport final

| Champ         | Valeur                                                     |
| ------------- | ---------------------------------------------------------- |
| Branche       | `chore/claude-hygiene`                                     |
| Type          | `chore` (docs + config uniquement, 0 impact runtime)       |
| Date          | 2026-05-23                                                 |
| Modèle        | Claude Opus 4.7 (pinned via `.claude/settings.local.json`) |
| Worktree      | `F:\PROJECTS\Apps\ankora-worktrees\chore-claude-hygiene`   |
| Linear ticket | aucun (chore interne — traçable via commit)                |
| Beta-blocker  | **non** — investissement qualité hors chemin critique      |

---

## 1. Contexte

Audit `.claude/` réalisé par @cowork le 23/05 17h. Plusieurs anomalies + drifts détectés, dont le skill `ankora-design-system/SKILL.md` (dernière modif 26/04) significativement désynchronisé avec la vision produit verrouillée (NORTH_STAR + 20 ADRs + amendement ADR-009 du 09/05 + nouveau `docs/ankora-product-quality-bar-v1.md` créé 23/05).

Cette PR consolide 5 fix dans un seul commit chore. **Sans cette PR, chaque future PR design devra refaire le cross-reference NORTH_STAR + ADRs manuellement.**

---

## 2. Changements (5 surfaces)

### 2.1 `.claude/skills/ankora-design-system/SKILL.md` (P1)

Le plus gros morceau. Refactor de 4 sections + ajout de 2 nouvelles :

- **§4 Voice** → divisé en :
  - **§4.1 Vocabulaire recommandé** : ajout des 14 concepts différenciants verrouillés (Capacité d'épargne réelle, Compte épargne 3 lectures, Reste à vivre vs Reste disponible, Effort financier mensuel, Lissage, Plan d'apurement, Assistant Virements, Ballet provisions, Live decrement, Détection déficit + rattrapage, Santé Provisions, Prochaines factures J-7/14/30, Cashflow waterfall). Chaque entrée pointe vers son ADR / NORTH_STAR source.
  - **§4.2 Vocabulaire interdit (instant reject)** : 4 catégories — FSMA réglementaire, **R-06 anti-culpabilisation** (`tu dépenses trop`, `il faut économiser`, `mauvais comportement`, etc.), marketing trompeur, jargon corporate. Source : `docs/ankora-product-quality-bar-v1.md` §2.
- **§9 numéros tabulaires** → corrigé : `font-variant-numeric: tabular-nums` (Tailwind utility) est la convention production. La legacy classe `.num` du ZIP mockup est marquée **déprécated**. Source : `src/app/[locale]/app/page.tsx:267` etc.
- **§10 Surfaces overview** → réécrit pour pointer vers les **composants React production** au lieu des `ui_kits/` archive :
  - Landing : `src/components/marketing/landing/sections/*`
  - Dashboard user : `src/app/[locale]/app/page.tsx` + `src/components/dashboard/*` + `src/components/features/AccountCard.tsx`
  - Admin : `src/app/[locale]/admin/page.tsx` (avec note branche paused `feat/pr-b2-mock-vertical-slice`)
  - Onboarding : `src/app/[locale]/onboarding/page.tsx` + `OnboardingWizard.tsx`
  - Header / Nav : `Header.tsx` (Server) + `HeaderNav.tsx` (Client + Portal drawer)
  - LocaleSwitcher : `LocaleSwitcher.tsx` (FR+EN visible v1.0, NL/DE/ES v1.1)
- **§11 Sources de vérité doctrine (nouveau)** : liste prioritaire des docs avec ordre NORTH_STAR > ADR > Quality Bar > SKILL. Pointe explicitement vers `docs/ankora-product-quality-bar-v1.md`, NORTH_STAR, ADR-008/009 amd/010/011/012/017/018, `docs/i18n-glossary.md`.
- **§12 Agents QA visuels obligatoires (nouveau)** : référence `dashboard-ux-auditor`, `admin-dashboard-auditor`, `ui-auditor`, `mobile-ios-auditor`, `i18n-auditor`, `lighthouse-auditor` avec leurs scopes respectifs et liens vers `CLAUDE.md`.

### 2.2 `.claude/skills/i18n-translator/SKILL.md` (P2)

Ajout d'une section **"Scope linguistique — v1.0 vs v1.1"** après l'introduction qui clarifie :

- v1.0 Beta visible = **fr-BE + en** uniquement (cohérent avec `LOCALES_VISIBLE` dans `src/i18n/routing.ts` + PR #172).
- Backlog v1.1 post-launch = nl-BE + de-DE + es-ES.
- **Parité JSON 5 locales préservée** (test `messages-parity.test.ts` reste vert) pour faciliter v1.1 sans churn structurel.

Aucune autre modification du contenu (workflow, principes, don't-translate, checklist — tous inchangés).

### 2.3 `.claude/commands/README.md` (P2)

- "4 commandes" → "5 commandes"
- Ajout `/i18n-audit` à la table + aux instructions de copy PowerShell / Bash
- Description : "Audit i18n rapide — parité clés 5 locales, placeholders ICU, résidus FR dans NL/EN/DE/ES, pattern email-as-keyword, metadata locale-aware".

### 2.4 `CLAUDE.md` (P1)

3 corrections :

1. **§"Agents QA"** : "12 au total" → "13 au total". Ajout d'un paragraphe pour `llm-security-auditor` avec son scope (OWASP LLM Top 10 + vecteurs 2026, modèle Opus, complémentaire de `security-auditor`).
2. **§Architecture** : commentaire arborescence `agents/ # 12 QA agents` → `13 QA agents (..., llm-security)`.
3. **§"Workflow agents"** : ajout entrée `llm-security-auditor` à la fin du tableau scope.

### 2.5 `.gitignore` (P2)

Ajout de `.claude/worktrees/` (avec commentaire pédagogique sur la convention canonique `F:/PROJECTS/Apps/ankora-worktrees/` externe au repo) pour ne plus tracker ce dossier si un outil tiers le recrée.

### 2.6 Local cleanup (hors PR — non versionné)

Suppression des fichiers orphelins gitignored dans `F:/PROJECTS/Apps/ankora/.claude/` (action **locale only**, pas dans le commit) :

- `scheduled_tasks.lock` (lock orphelin PID 35856 mort depuis 5 jours)
- `tmp/vercel-env-{5rows,complete,filled,step1}.png` (~700 KB, setup initial Vercel obsolète)
- `worktrees/` (répertoire vide)

Tous étaient déjà dans `.gitignore` (sauf `worktrees/` qui l'est désormais via §2.5).

---

## 3. Non-changements (preserved)

- `.claude/settings.local.json` — **intact**. Pin `claude-opus-4-7` + permissions Bash. Garde-fou post-incident Haiku 24/04, ne pas y toucher.
- Tous les 13 fichiers `.claude/agents/*.md` — **intacts**. Aucune refactor de scope agent dans cette PR.
- Aucun fichier `src/` modifié. Aucun test modifié. Aucun composant produit touché.

---

## 4. Note sur `docs/ankora-product-quality-bar-v1.md`

Le SKILL.md référence ce document. **Le fichier existe dans `F:/PROJECTS/Apps/ankora/docs/` mais n'est PAS encore commité dans git** (untracked depuis sa création le 23/05 par @cowork — statut Draft v1, à valider @thierry).

Cette PR ne le commit pas (hors scope). La référence dans SKILL.md devient pleinement active dès que @thierry / @cowork le valident + commit, dans une PR séparée. Tant que le fichier est seulement local, lire-le directement depuis le main repo working tree.

---

## 5. Quality gates

| Gate                      | Statut attendu                               |
| ------------------------- | -------------------------------------------- |
| `npm run lint`            | 0 errors (aucun .ts/.tsx touché, juste docs) |
| `npm run lint:use-server` | 0 errors (idem)                              |
| `npm run typecheck`       | 0 errors (idem)                              |
| `npm run build`           | success (idem)                               |
| Tests Vitest / Playwright | non re-lancés (aucun .ts/.tsx touché)        |

Pas d'agent QA invoqué (PR chore docs/config, pas de code touch — directive @cowork explicite).

---

## 6. DoD compact

- [x] Phase 0 model check (Opus 4.7 pinné)
- [x] Worktree dédié `chore/claude-hygiene`
- [x] 5 fichiers updatés (CLAUDE.md, 2 SKILL.md, README.md commands, .gitignore)
- [x] Local cleanup orphan files dans main repo (gitignored, hors PR)
- [ ] CI verte (à confirmer post-push)
- [ ] Sourcery silent sur le dernier commit
- [x] Rapport `docs/prs/PR-CHORE-CLAUDE-HYGIENE-report.md` (ce document)
- [ ] Notification @cowork après merge (pas de Linear ticket à fermer)

---

## 7. Value & follow-up

**Valeur ajoutée** : chaque future PR design qui invoque le skill `ankora-design-system` aura un brief enrichi qui reflète la vision verrouillée. Plus besoin de cross-reference manuel avec NORTH_STAR + ADRs à chaque session. Le skill devient à nouveau une **source de vérité fiable**, alignée avec `docs/ankora-product-quality-bar-v1.md`.

**Suite naturelle** :

- Sprint Beta restant : PR-FIX-AUTH-CTA (THI-254 "Mon cockpit" auth-aware) + PR-FIX-I18N-PERF (Phase B drawer-stay-open + cookies extraction).
- Post-Beta : intégrer NL/DE/ES dans `LOCALES_VISIBLE` (revue native par locuteur natif), unbranch `feat/pr-b2-mock-vertical-slice` admin panel.
- Quand @thierry valide `docs/ankora-product-quality-bar-v1.md` → PR séparée pour le commit + activation des références dans SKILL.md.

— @cc-ankora, 2026-05-23
