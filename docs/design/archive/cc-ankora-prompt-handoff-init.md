# Prompt CC Ankora — Initialisation workflow trio design

À coller dans Claude Code terminal (CC Ankora). Ce prompt est l'amorce du nouveau workflow trio (Cowork + Claude Design + CC Ankora).

---

## Prompt

```
@cc-ankora — Initialisation workflow trio design

Contexte : @cowork vient de livrer un pack complet pour structurer la collaboration entre les 3 agents IA qui construisent Ankora (Cowork, Claude Design, toi). Décision verrouillée par @thierry le 2026-04-24.

Ta mission :

1. LIRE (dans cet ordre, sans raccourci) :
   - docs/design/trio-agents.md (convention de tags + rôles + loop handoff)
   - docs/design/claude-design-brief.md (template brief à coller dans claude.ai/design)
   - docs/design/design-principles-2026.md (trends + red flags pour revue exports)
   - CLAUDE.md §"Trio d'agents & handoff design" (résumé des règles)

2. VÉRIFIER que la branche main est propre :
   - git status
   - git log --oneline -5
   - aucun fichier non tracké dans docs/design/ (les 3 fichiers doivent apparaître comme nouveaux)

3. CRÉER la branche dédiée :
   - git checkout -b feat/cc-design-handoff
   - git add docs/design/ CLAUDE.md
   - git commit -m "docs(design): trio agents convention + Claude Design brief template

     - Add docs/design/trio-agents.md (agents + tag convention + handoff loop)
     - Add docs/design/claude-design-brief.md (full brief template for claude.ai/design)
     - Add docs/design/design-principles-2026.md (trends + red flags reference)
     - Update CLAUDE.md with Trio d'agents section

     Locked 2026-04-24 by @thierry. Replaces HTML mockup pixel iteration
     workflow with spec functional → Claude Design polish → CC integration loop.

     Refs: docs/NORTH_STAR.md (Cap v1.0 publique), docs/ROADMAP.md"

4. PRÉPARER l'arbo pour les exports futurs (question gitignore à résoudre) :

   A. Dans le repo ankora, confirmer que `docs/design/*.md` sont bien VERSIONNÉS (source de vérité produit, doivent aller sur GitHub). Vérifier qu'il n'y a pas de règle .gitignore qui les exclut par erreur. Rapport : état `git check-ignore` sur les 4 fichiers docs/design/*.md.

   B. Dans le dossier F:\PROJECTS\Apps\ankora-mockups\ :
      - Vérifier s'il est un repo git indépendant (`git -C F:\PROJECTS\Apps\ankora-mockups\ rev-parse --is-inside-work-tree 2>&1`).
      - Si OUI (repo séparé) :
        * Créer le sous-dossier `design-exports/` avec un README.md expliquant sa fonction
        * Ajouter dans SON .gitignore (pas celui d'ankora) : `design-exports/**/*.zip` + `design-exports/**/node_modules/` + `design-exports/**/dist/` (on exclut les binaires lourds mais on garde les structures + READMEs)
        * Commit séparé dans ankora-mockups : `chore(design): add design-exports folder with gitignore rules`
      - Si NON (dossier non versionné) :
        * Juste créer design-exports/.gitkeep + README.md local, aucune action git
        * Noter le statut dans le rapport pour que @thierry décide plus tard si ankora-mockups doit devenir un repo git

   C. Dans le repo ankora principal, aucun export Claude Design ne sera stocké. Seuls les docs/specs y vivent. À vérifier dans le rapport.

5. PUSH la branche :
   - git push -u origin feat/cc-design-handoff
   - NE PAS ouvrir de PR pour l'instant — c'est une branche d'infra qui accueillera les futurs exports design

6. RAPPORT ATTENDU (format strict) :

   @thierry — branche feat/cc-design-handoff poussée
   @cowork — docs design lues, questions résiduelles : [lister ou "aucune"]
   @cc-design — rien pour l'instant

   Puis :
   ## Vérifications effectuées
   - [ ] Les 3 docs design trio lues intégralement (+ cc-ankora-prompt-handoff-init.md)
   - [ ] CLAUDE.md §"Trio d'agents" lu
   - [ ] Branche feat/cc-design-handoff créée
   - [ ] Commit docs(design) ... présent
   - [ ] Push origin OK
   - [ ] docs/design/*.md confirmés VERSIONNÉS (`git check-ignore` clean)
   - [ ] Statut ankora-mockups git déterminé (repo OUI/NON)
   - [ ] Arbo design-exports/ préparée (+ gitignore si repo) OU .gitkeep + README si non-repo
   - [ ] CI verte sur la branche (pas de lint/typecheck impacté — commit docs-only)

   ## Questions ou incohérences détectées (posture ingénieur partenaire)
   [SI TU REPÈRES UN PROBLÈME dans les docs trio, remonte-le. Si la convention de tag ne colle pas avec les GitHub Actions existants, dis-le. Si le brief Claude Design mentionne React 19 / Tailwind 4 et que tu vois un gap vs le codebase, signale-le.]

   ## État post-tâche
   - Branche active : feat/cc-design-handoff (commits X)
   - Main intact
   - Pas de conflit
   - Task #144 → done

CONTRAINTES NON NÉGOCIABLES :
- Tu ne merges PAS cette branche sur main (c'est la branche mère du workflow design)
- Tu ne modifies PAS les docs/design/*.md (elles sont la source de vérité @cowork)
- Si tu veux amender quelque chose, tag @cowork avec ta proposition, on en discute

Pas de scope creep. Pas d'ajout d'agents QA. Pas de refactor de CLAUDE.md au-delà de la section Trio. Cette tâche = init infra, rien d'autre.

Go.
```

---

## Notes pour @cowork (interne, pas à coller)

- Ce prompt respecte le canon CC Ankora : contexte, mission numérotée, rapport attendu format strict, contraintes explicites
- Tag `@thierry` en premier dans le rapport pour qu'il voie immédiatement le statut push
- Tag `@cowork` juste après pour questions résiduelles éventuelles
- La branche `feat/cc-design-handoff` restera ouverte longtemps (branche mère design), les futures branches `feat/cc-design-<surface>` partiront d'elle ou de main selon le choix
- Pas de PR ouverte maintenant → on commit l'infra sans bruit

Si CC Ankora remonte une incohérence réelle (posture ingénieur partenaire), @cowork tranche AVANT de relancer.
