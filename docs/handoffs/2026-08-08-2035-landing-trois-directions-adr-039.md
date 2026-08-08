---
project: ankora
type: cc-handoff
session: 2026-08-08-2035
agent: cc-fable
---

# Handoff — Refonte landing : trois directions, choix A, ADR-039 + plan validé

> Session @cc-fable (Fable 5, exception explicite @thierry pour le périmètre
> visuel landing), worktree `F:\PROJECTS\Apps\ankora-landing`, port dev 3200.
> **Trois sessions parallèles sur le dépôt** — ne jamais sortir de son worktree.

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD
# → feat/landing-refonte-2026

git rev-parse --short HEAD
# → e19ddcb (commit docs) — un commit miroir handoff suit dans la même PR

git log --oneline -3
# e19ddcb docs(landing): ADR-039 paper token scope + revamp execution plan
# 0eb6986 chore(orthographe): la vérification couvre docs/, prompts/ et .claude/ (#333)
# 8310c8e docs(passation): handoff du 8 août, et markdownlint cadré sur ce qui casse le rendu (#332)

git status --short
# → propre après le commit miroir (fichiers de session : uniquement les 2 docs + dictionnaire + ce handoff)
```

Le worktree porte `supabase/.temp/project-ref` (gitignoré) — nécessaire au
résolveur DevContext, sinon préflight NO-GO (cf. mémoire
`project_worktree_supabase_preflight`).

## 2. PR en vol

- **PR #334** — <https://github.com/thierryvm/ankora/pull/334>
- **Titre** : `docs(landing): ADR-039 paper token scope + landing revamp execution plan`
- **Contenu** : docs-only — `docs/adr/ADR-039-portee-tokens-marketing-papier.md`,
  `prompts/PR-LAND-refonte-releve-corrige.md`, `.cspell/project-words.txt`
  (+ miroir de ce handoff)
- **DoD 5/5 état au moment de l'écriture** :
  1. CI : ⏳ (lancée au push)
  2. Sourcery silent : ⏳ (à re-lire après le push du miroir)
  3. Reviews : ⏳ (@thierry)
  4. Conflit main : ✅ aucun (branche ff sur 0eb6986 = main)
  5. Rapport : ce handoff + rapport final de session dans la conversation
- Gates locales déjà passées : lint 0 erreur (9 warnings préexistants),
  typecheck ✅, vitest 2116 ✅, markdownlint/cspell/prettier 0 sur les fichiers.

## 3. Plan en cours

- **Phase 2 livrée** : trois directions visuelles (A relevé corrigé / B
  instrument de bord / C question directe), maquettes hero à 390 px, ratios
  calculés — galerie artefact Claude privé « Ankora — Trois directions pour la
  page d'accueil ». **@thierry a choisi A.**
- **ADR-039** : statut Proposed — mécanisme `.mkt-paper` + compagnon
  `body:has()`. Relecture cockpit exigée sur DEUX questions : symétrie
  `.app-surface`, et sort de `body > main` (règle de fondation partagée).
- **Plan d'exécution** : `prompts/PR-LAND-refonte-releve-corrige.md` — 3 PR
  (L1 tokens → L2 hero+nav → L3 sections). `plan-reviewer` : 🔴 (16 éditions)
  puis 🟡 APPROVED WITH CHANGES (6 éditions + 3 mineurs) — tout est intégré,
  pas de nouvelle revue exigée.
- **Implémentation : AUCUNE, délibérément** (cooldown banned-list n°2, décision
  @thierry en session).

## 4. Décisions prises cette session

- Direction **A « Le relevé corrigé »** parce que différenciation maximale +
  cible novice (choix @thierry sur trois maquettes rendues) ; B et C écartées
  mais leurs mécaniques absorbées (échéances datées → relevé, pédagogie → L3).
- **Cooldown respecté** parce que `.mkt-paper` = 4e motif de portée dans la
  fondation partagée ; alternative « implémenter dans la foulée » écartée par
  @thierry (la relecture cockpit devient l'obtention de la perspective
  manquante).
- **« Encore vraiment à toi »** comme libellé du chiffre du hero parce que son
  calcul n'est aucun des quatre chiffres ADR-035 ; « Il te reste, vraiment »
  écarté (collision de nom).
- **Anti-PSD2 en première ligne de carte** (« Le solde que tu lis à ta banque —
  recopié par toi ») parce qu'une carte qui affiche un solde se lit « Ankora
  voit mon compte ».
- **Animation d'entrée du hero : coupée** parce qu'un état de repos
  `opacity:0` fait d'un hero invisible le mode de défaillance (arbitrage
  plan-reviewer).
- **PR L1 sous Opus** parce que fondation + doctrine d'agent = architecture ;
  l'exception Fable 5 ne couvre que L2/L3 (visuel).
- `public/llms-full.txt` : ne JAMAIS l'éditer — généré par
  `scripts/build-llms-full.mjs` (décision @thierry en session).

## 5. Décisions en attente @thierry

- **Q1** : merge PR #334 quand DoD 5/5 — non urgent.
- **Q2** : trois PNG à moi traînent à la **racine de `F:\PROJECTS\Apps\ankora`**
  (`dir-a-hero.png`, `dir-b-hero.png`, `dir-c-hero.png`, non suivis) — cwd du
  serveur Playwright MCP ; le garde-fou m'a interdit d'y retoucher. Une
  suppression d'un geste, chez toi ou session cockpit.
- **Q3** : planifier la relecture cockpit d'ADR-039 (2 questions) — c'est le
  verrou de toute l'implémentation.

## 6. Garde-fous activés

- Modèle : Fable 5 sur exception explicite écrite dans le prompt de session
  (périmètre visuel landing uniquement) ; L1 rendue à Opus dans le plan.
- Préflight : NO-GO Supabase initial (worktree sans project-ref) **corrigé
  proprement** (sb-index + project-ref) → GO complet ; le pre-push a bloqué un
  push où le module DevContext ne s'était pas chargé — garde-fou vérifié en
  conditions réelles.
- `plan-reviewer` invoqué **deux fois** conformément à la doctrine ; code
  interdit tant que non-APPROVED : respecté (zéro code produit).
- `git add` : chemins explicites uniquement ; aucune commande destructive.

## 7. Next action concrète

**Session cockpit (Opus)** : lire `docs/adr/ADR-039-portee-tokens-marketing-papier.md`,
répondre aux deux questions du §« Ce que cet ADR ne décide PAS » (symétrie
`.app-surface` ; `body > main`), flipper le statut Proposed → Accepted (ou
amender), puis une session fraîche exécute
`prompts/PR-LAND-refonte-releve-corrige.md` en commençant par la Phase 0 et la
PR L1 (Opus obligatoire sur L1).

## 8. Anti-pièges (prochaine session)

- Ne PAS implémenter quoi que ce soit du plan avant le flip d'ADR-039.
- Ne PAS exécuter L1 sous Fable/Sonnet/Haiku — Opus seulement (L2/L3 : Fable 5
  admis par l'exception du 8 août).
- Ne PAS éditer `public/llms-full.txt` (généré) ni `content/glossary/fr-BE.json`
  (session cockpit, passe vocabulaire post-PR).
- Ne PAS toucher `messages/` depuis la session cockpit tant que les 3 PR
  landing ne sont pas mergées (accord du 8 août).
- Ne PAS recoder depuis la galerie de maquettes : le plan + l'ADR sont la
  source, la galerie n'est qu'une référence visuelle.
- Ne PAS supprimer le worktree `ankora-landing` ni sa branche — PR #334 en vol.

---

**Signé** : @cc-fable · Session 2026-08-08-2035
