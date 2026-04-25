# Prompt CC Ankora — Handoff intégration Design System Claude Design (PR-3)

**Date** : 25 avril 2026
**Source** : Session Claude Design #1 terminée (validée @thierry + @cowork)
**Branche cible** : `feat/cc-design-handoff-v1` (à créer depuis `main`)
**Issue Linear associée** : à créer par CC Ankora après lecture

---

## Prompt prêt à coller dans Claude Code terminal (Antigravity Ankora)

```markdown
@cc-ankora — Intégration Design System Claude Design (PR-3 socle)

Contexte : @cowork a piloté hier + ce matin une session @cc-design (claude.ai/design) qui a généré un Design System complet pour Ankora. Validation @thierry obtenue. Tu prends le relais pour l'intégration React.

=== AVANT TOUT — LIRE INTÉGRALEMENT ===

1. docs/design/trio-agents.md (convention tags + workflow)
2. docs/design/claude-design-brief.md (brief original V2)
3. docs/design/design-principles-2026.md (trends + red flags)
4. CLAUDE.md §"Trio d'agents & handoff design"
5. NORTH_STAR.md §"Cap v1.0" et §"Différenciateur Réserve libre"

=== LE LIVRABLE @cc-design (situé localement) ===

Deux ZIPs ont été générés par Claude Design et placés par @thierry dans :
F:\PROJECTS\Apps\ankora-mockups\design-exports\

- Ankora Design System.zip (2.5 MB) ← UTILISER CELUI-CI (full project, plus riche)
- Handoff Package.zip (831 KB) ← redondant, dans son sous-dossier design_handoff_ankora_v1/

Contenu de "Ankora Design System.zip" (full project) :
├── README.md (root, 13 KB)
├── SKILL.md (5.6 KB) ← À INSTALLER dans .claude/skills/ankora-design-system/
├── colors_and_type.css (10.5 KB) ← TOKENS source de vérité
├── assets/ (logo.svg, icon-512.png, apple-touch-icon.png, favicon-32.png, mono-dark/light.svg)
├── fonts/ (Inter-Variable.ttf 880KB + Fraunces-Variable.ttf 304KB + JetBrainsMono-Variable.ttf 300KB + fonts.css)
├── messages/ ← BONUS ! strings i18n extraites
│ ├── en.json (35.6 KB)
│ └── fr-BE.json (38.5 KB)
├── ui_kits/
│ ├── \_shared/ (icons.jsx + shell.css 14.6 KB)
│ ├── landing_page/ (index.html + Landing.jsx 28.9 KB)
│ ├── user_dashboard/ (index.html + Dashboard.jsx 21.7 KB)
│ ├── admin_dashboard/ (index.html + Admin.jsx 16.2 KB)
│ ├── onboarding/ (index.html + Onboarding.jsx 40.6 KB)
│ ├── index.html (grille navigable des 4 kits)
│ └── responsive_audit.html (audit page 4 kits 375px+1280px side-by-side)
├── preview/ ← BONUS ! Composants individuels en preview HTML
│ ├── accent-variations.html
│ ├── brand-iconography.html, brand-logo.html
│ ├── colors-accent-laiton.html, colors-brand-teal.html, colors-neutrals.html, colors-semantic.html
│ ├── components-badges.html, components-buttons.html, components-cards.html
│ ├── components-command-palette.html (et plus)
│ └── \_base.css
└── design_handoff_ankora_v1/ ← DUPLICATE du contenu (ignorer, redondant)

NOTE : le sous-dossier design_handoff_ankora_v1/ duplique tout le contenu racine. C'est le packaging "handoff" généré en parallèle par Claude Design. Tu peux l'ignorer et travailler depuis la racine du ZIP, qui contient en PLUS les messages/i18n + preview/.

=== TA MISSION (dans cet ordre, pas d'improvisation) ===

ÉTAPE 1 — Préparer la branche

- git checkout main
- git pull origin main
- git checkout -b feat/cc-design-handoff-v1
- Confirmer dans rapport : commit hash de main avant branche

ÉTAPE 2 — Extraire le ZIP et inventorier

- Source : F:\PROJECTS\Apps\ankora-mockups\design-exports\Ankora Design System.zip
- Unzip dans F:\PROJECTS\Apps\ankora-mockups\design-exports\unpacked-v1\ (PAS dans le repo Ankora)
- tree de l'arbo extraite
- Vérifier checksums :
  - SKILL.md présent (5.6 KB)
  - fonts/ contient Inter-Variable.ttf (880 KB), Fraunces-Variable.ttf (304 KB), JetBrainsMono-Variable.ttf (300 KB), fonts.css
  - ui_kits/ contient \_shared, landing_page, user_dashboard, admin_dashboard, onboarding (5 dossiers)
  - colors_and_type.css présent (10.5 KB)
  - messages/en.json (35.6 KB) + messages/fr-BE.json (38.5 KB)
  - preview/ contient au moins 14 fichiers HTML
- Si export incomplet → STOP + remonter à @cowork (ne pas continuer avec un ZIP partiel)
- Ignorer le sous-dossier design_handoff_ankora_v1/ (duplicate)

ÉTAPE 3 — Installer le SKILL.md (nom dédié)

- Créer le dossier : .claude/skills/ankora-design-system/
- Copier SKILL.md dedans : .claude/skills/ankora-design-system/SKILL.md
- **Nom du skill = "ankora-design-system"** (clair, mémorable, non confondable avec d'autres SKILL.md)
- Vérifier que les triggers du SKILL.md sont pertinents (mots-clés : enveloppe, provision, waterfall, laiton, simulateur, cockpit, réserve libre — sinon les ajouter)
- Confirmer que le bloc "CRITICAL BRAND CONSTRAINT — NO PSD2" est en haut

ÉTAPE 4 — Mapper les tokens dans le repo Ankora

- Lire colors_and_type.css depuis l'export
- Diff vs src/app/globals.css existant
- Actions :
  - Si nouveau token (--color-accent-laiton-dark, --color-accent-laiton-light, etc.) → ajouter à globals.css
  - Si conflit (ex: --color-text avait une valeur, l'export en a une différente) → arbitrer en faveur de l'export ET noter le diff dans le rapport pour @cowork
  - Si supplément (motion tokens, easing curves, durations) → ajouter
- Charger les 3 fichiers fonts .ttf dans public/fonts/ et déclarer @font-face dans globals.css

ÉTAPE 5 — Créer la base components/ui

- Examiner ui_kits/\_shared/ pour récupérer les composants atomiques (Button, Card, Input, Badge, Toast, etc.)
- Mapper vers src/components/ui/ avec convention shadcn-like (un fichier par composant, export named)
- Convertir HTML/JSX brut → composants React 19 / TypeScript strict / Tailwind v4 propres
- **Aucun className arbitraire `bg-[#abc]`** : utiliser tokens CSS via classes Tailwind générées
- Tests Vitest co-located pour chaque composant (au moins render + a11y basic)

ÉTAPE 6 — Intégrer la Landing en route prod

- ui_kits/landing_page/Landing.jsx → src/app/(marketing)/page.tsx
- Adapter à Next.js 16 App Router :
  - Imports next/link au lieu de <a> standard
  - Server Components par défaut, "use client" seulement où nécessaire (animations, simulateur)
  - Metadata API pour SEO (Title, Description, OG, Schema.org SoftwareApplication + Organization + FAQPage + DefinedTerm)
- Conserver les copies prod-validated :
  - "Tu rejoins Ankora pendant sa Phase 1 ? Ton compte garde un accès complet au cockpit core à vie..."
  - "Ankora ne touche à rien et ne déplace pas d'argent"
  - "Saisie manuelle · données hébergées en Belgique"
- Banner "app.ankora.be · COCKPIT" → vérifier qu'il est devenu "Ankora · Cockpit" (sinon ajuster manuellement)
- Language switcher : implémenter toggle interactif **FR · EN seulement** (NL post-v1.0)

ÉTAPE 7 — Tests responsive obligatoires (Playwright)

- Setup tests/e2e/landing-mobile.spec.ts qui :
  - Lance dev server
  - Navigue sur "/"
  - Teste viewport 375×667 (iPhone SE), 390×844 (iPhone 14), 768×1024 (iPad portrait), 1280×800 (desktop)
  - Vérifie : pas de scroll horizontal, hero readable, KPI cards stack vertical sur mobile, simulateur démo usable mobile, CTAs tappable 44px+
- Run npm run e2e:mobile + screenshot par viewport
- Rapport : screenshots side-by-side dans docs/prs/PR-3-mobile-audit.md

ÉTAPE 8 — Valider la copie FSMA + qualité FR

- Grep "investir|placement|recommandons|conseil" dans tous les composants migrés → 0 hit accepté
- Grep "PSD2|agrégation|connexion bancaire|relier" → 0 hit accepté
- Si hit → corriger AVANT merge

ÉTAPE 9 — Lancer agents QA (obligatoire avant rapport)

- design:accessibility-review — sur src/components/ui/ et src/app/(marketing)/page.tsx
- ui-auditor — sur Landing complète
- lighthouse-auditor — sur build prod (mobile + desktop)
- gdpr-compliance-auditor — sur copy publique
- test-runner — full suite
- security-auditor — pas de secret hardcodé, pas de CSP override

ÉTAPE 10 — Ouvrir la PR

- Title : feat(design): integrate cc-design Design System v1 + Landing
- Base : main, Head : feat/cc-design-handoff-v1
- Description : référencer docs/design/cc-ankora-prompt-handoff-integration.md + résultats agents QA
- Labels : design-system, landing, mobile-first
- Reviewers : @thierry obligatoire

=== FORMAT RAPPORT FINAL @cc-ankora ===

À écrire dans docs/prs/PR-3-cc-design-integration-report.md :

@thierry — PR #X ouverte : feat(design): integrate cc-design Design System v1 + Landing
@cowork — questions résiduelles ou ambiguïtés UX/copy : [liste ou "aucune"]
@cc-design — points où l'export brut n'était pas directement utilisable : [liste pour next session]

## Vérifications effectuées

- [ ] ZIP extrait, inventaire complet
- [ ] SKILL.md installé dans .claude/skills/ankora-design-system/
- [ ] Tokens migrés dans globals.css (diff documenté)
- [ ] Fonts .ttf placées dans public/fonts/ + @font-face déclaré
- [ ] components/ui/ migré (X composants atomiques)
- [ ] Landing intégrée à src/app/(marketing)/page.tsx
- [ ] Banner Ankora · Cockpit (pas app.ankora.be)
- [ ] Language switcher FR · EN interactif
- [ ] Pas de mention PSD2 / FSMA risqué (grep clean)
- [ ] Tests Playwright mobile passent (4 viewports)
- [ ] Agents QA tous green
- [ ] Lighthouse ≥ 95 perf, 100 a11y/BP/SEO
- [ ] PR ouverte avec rapport complet

## Bugs réels détectés en tests Playwright (vs rapport @cc-design)

[Lister chaque bug avec : surface concernée, viewport, fichier CSS, ligne. Ce sera le feedback pour @cc-design en next session.]

## Estimations vs réalisé

- Estimation effort : X heures
- Réalisé : Y heures
- Écart : justifier si > 30 %

=== CONTRAINTES NON NÉGOCIABLES (rappel CLAUDE.md) ===

- Domain pur : src/lib/domain/ ne touche jamais Supabase (juste TS pur + decimal.js)
- Validation Zod en entrée de toute Server Action / Route Handler
- RLS Supabase obligatoire sur toute nouvelle table (pas applicable PR-3 mais à garder en tête)
- Nonce CSP : aucun script/style inline sans nonce={nonce}
- 'use server' : exports async uniquement (vérifié par lint:use-server)
- Tests domain ≥ 90% lignes/fonctions, ≥ 85% branches
- PR < 600 lignes ou justification en commentaire

=== POSTURE INGÉNIEUR PARTENAIRE (rappel) ===

Si tu identifies un problème à l'intégration (export ZIP partiel, conflit token, classe Tailwind cassée, dépendance manquante, perf Lighthouse en chute) :

1. STOP avant d'agir
2. Documente le problème dans le rapport @thierry / @cowork
3. Propose la solution + alternative
4. Attends arbitrage avant de continuer

Pas de "correction silencieuse" qui pollue l'export d'origine. Pas de "scope creep" qui ajoute des features non demandées. Le ZIP est sacré, on intègre proprement, on signale les écarts.

Go.
```

---

## Notes pour @cowork (interne, pas à coller dans CC Ankora)

### Pourquoi le naming `ankora-design-system` pour le SKILL.md

Trois raisons pratiques :

1. **Disambiguation** : Thierry a plusieurs projets avec des SKILL.md (terminal-learning, irontrack, obsidian, etc.). Un nom générique `design-system` créerait de la confusion. Le préfixe `ankora-` lie clairement le skill au projet.
2. **Trigger ciblé** : les mots-clés du skill (enveloppe, provision, waterfall, laiton, etc.) sont Ankora-specific. Le nommage doit refléter ça.
3. **Réutilisation post-v1.0** : si Ankora a un jour un design system v2 (refonte), on pourra avoir `ankora-design-system-v2` à côté sans casser les références v1.

### Risques connus à surveiller

- **Tokens CSS conflicts** : Claude Design a fait son DS depuis ses propres extractions. Possible que certains tokens prod existants soient écrasés. CC Ankora doit faire un diff propre et documenter chaque conflit.
- **Composants pas TypeScript-strict** : les `.jsx` peuvent ne pas avoir les types stricts. CC Ankora doit ajouter les types lors de la migration.
- **Server Components vs Client Components** : Claude Design ne connaît pas Next.js 16 RSC. CC Ankora doit re-écrire avec `"use client"` directive UNIQUEMENT où nécessaire.
- **Mobile responsive** : On a un doute sur certains rendus mobiles. Playwright à 375px est OBLIGATOIRE pour valider.

### Ordre de session future @cc-design (après PR-3 mergée)

1. Surface #2 = User Dashboard v3 (déjà ébauché, à finaliser visuellement)
2. Surface #3 = Onboarding 3 étapes (validé Step 1, fini Steps 2-3)
3. Surface #4 = Admin Dashboard
4. Surface #5 = Charges/Provisions detail screen (suggéré par @cc-design dans next-if-you-want)
