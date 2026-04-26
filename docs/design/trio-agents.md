# Trio d'agents Ankora — Convention de collaboration

Verrouillé le 24 avril 2026. Ce document décrit la collaboration entre les **3 agents IA** qui contribuent à Ankora, et la règle de tag à utiliser dans les rapports, PRs, et comms inter-agents.

---

## Les 3 agents

| Agent          | Rôle                                                                                                                                                | Surface                                    | Modèle                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| **@cowork**    | Vision produit, spec fonctionnelle, recherche, contenu, arbitrage, orchestration, update NORTH_STAR/ROADMAP, brief Claude Design, revue des exports | Cowork (desktop app Claude)                | Claude Opus (Anthropic) |
| **@cc-design** | Polish visuel, exploration UI, cohérence design system, variations, export React/Tailwind ou ZIP                                                    | claude.ai/design (research preview)        | Claude Opus 4.7 Design  |
| **@cc-ankora** | Code de production, intégration Supabase/Next.js, tests, CI, PRs, merge final, hotfixes                                                             | Claude Code terminal (gh/npm/supabase CLI) | Claude Opus (Anthropic) |

**Thierry** = vision produit humaine, validation à chaque étape, merge autorité finale sur `main`.

---

## Convention de tag

Tout rapport, commit, commentaire PR ou note inter-agents utilise ces préfixes pour diriger le message au bon destinataire :

- **`@cowork — …`** : pour l'agent Cowork (spec fonctionnelle, contenu FR/EN, recherche, arbitrage, docs)
- **`@cc-design — …`** : pour l'agent Claude Design (UI à polish, nouveau composant, variation, export à régénérer)
- **`@cc-ankora — …`** : pour l'agent Claude Code terminal (intégration code, PR à ouvrir, test à jouer, CI à débloquer)
- **`@thierry — …`** : pour Thierry (validation humaine, décision produit, merge, GO/NO-GO)

Ex. : dans un rapport CC Ankora :

> @cowork — besoin d'une reformulation FR du label "Provisions affectées" (trop technique)
> @cc-design — le composant `EnvelopeCard` exporté n'a pas le state `drag-over`, tu peux le régénérer ?
> @thierry — PR #58 prête à merge, toutes les checks vertes

---

## Loop de collaboration standard

Pour une nouvelle surface UI (ex: `admin-dashboard`, `onboarding`, `dashboard-v3`) :

1. **@cowork** produit une **spec fonctionnelle** (data model, sections, flows, différenciateurs, contraintes)
2. **@cowork** rédige un **brief Claude Design** (à partir du template `docs/design/claude-design-brief.md`)
3. **@cowork** pilote la session Claude Design via Chrome MCP OU Thierry la lance manuellement
4. **@cc-design** produit des variations visuelles, polish, itération inline
5. Thierry **valide** une version → export ZIP ou Handoff to Claude Code
6. **@cowork** rédige un **prompt d'intégration** pour CC Ankora (mapping composants, tokens à respecter, tests requis)
7. **@cc-ankora** ouvre une **branche dédiée** (`feat/cc-design-<surface>`), intègre, ouvre PR
8. **@cowork** passe les agents QA (`ui-auditor`, `dashboard-ux-auditor`, `lighthouse-auditor`, `gdpr-compliance-auditor`)
9. **@thierry** valide et merge

---

## Règles non négociables pour le handoff Claude Design → CC Ankora

1. **Jamais de merge direct de l'export brut.** Toujours une branche `feat/cc-design-<surface>` dédiée, review CC Ankora + agents QA, revue Thierry.
2. **Tokens CSS prod = source de vérité.** Si Claude Design propose une palette différente, on arbitre au niveau `@cowork` avant d'intégrer. Pas de pollution des tokens live en douce.
3. **Accessibilité WCAG AA minimum.** Tous les exports passent `design:accessibility-review` avant merge.
4. **Pas de dépendance payante ajoutée sans validation Thierry.** Claude Design peut suggérer Framer Motion / GSAP — validation explicite requise.
5. **FSMA / GDPR.** Aucune copie UI ne doit suggérer du conseil en investissement. @cowork relit toute la micro-copy avant intégration.
6. **Sécurité.** Aucun secret, aucune clé API dans un export. CC Ankora doit vérifier au moment du merge.

---

## Gestion des ratés Claude Design (research preview)

- **Inline comments qui disparaissent** → workaround documenté : coller dans chat principal
- **Save errors en compact view** → passer en full view avant d'exporter
- **Large codebase lag** → limiter le scope du repo lié (`src/components/ui/`, `src/app/globals.css`, `ankora-mockups/` uniquement, pas le repo complet)
- **Chat upstream error** → ouvrir nouveau chat tab dans le même projet

Si un export est cassé ou incohérent avec le design system : **abandonner proprement** la branche, itérer à nouveau côté Claude Design, jamais forcer un export douteux en prod.

---

## Historique des décisions trio

- **2026-04-24** — Adoption du workflow trio + convention tags (Thierry)
- **2026-04-24** — Claude Design validé comme outil de polish visuel en research preview, avec branche dédiée obligatoire
