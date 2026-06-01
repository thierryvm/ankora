---
project: ankora
type: cc-handoff
date: 2026-05-31
session: 2026-05-31-2328
status: closed
---

# CC Ankora session handoff — THI-298 focus « un signal » saga + clôture

> Écrit en fin de session (clôture @thierry). Double redondance : vault Obsidian + miroir `docs/handoffs/` repo.

---

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD
# → main

git rev-parse --short HEAD
# → de8e0d4

git log --oneline -5
# de8e0d4 docs(handoffs): session handoff — Track B P1 lot 1 projection (#203) (#204)
# 4bc0bb3 fix(ui): champs focus en un signal pas deux (THI-298) (#205)
# b36e15f docs(handoffs): session handoff + canonical simulator audit spec (#201)
# f9c9b18 feat(simulator): projection 6 mois + cumul réserve libre (Track B P1 lot 1) (#203)
# e6e1e7f fix(simulator): pass revenus as a number across the RSC boundary (THI-195 hotfix) (#202)

git status --short
# M public/llms-full.txt   ← pré-existant, hors scope, NE PAS commit
```

Working tree propre hors `public/llms-full.txt` (modif pré-existante, intouchée). Aucun fichier debug/log traînant.

---

## 2. PR en vol

**Aucune PR de code en vol.** Les deux PR de la journée sont mergées :

- **PR #205** — `fix(ui): champs focus en un signal pas deux (THI-298)` — squash `4bc0bb3` dans main. DoD 5/5 ✅ (CI verte, Sourcery résolu, pas de conflit, rapport `docs/prs/PR-UI-1-report.md` réaligné sur le contrat réel). Live-test @cowork PASS clair+sombre.
- **PR #204** — `docs(handoffs): session handoff #203` — squash `de8e0d4` dans main.

**Note squash** : le squash merge aplatit `b0d74ce`+`ccbec19` (PR #205) en un seul commit `4bc0bb3` ; les SHA originaux n'existent pas en linéaire sur main (comportement GitHub documenté, cf. CLAUDE.md §cleanup branches).

**PR docs-only de clôture** : `docs/handoff-2026-05-31-close` (miroir handoff + ROADMAP) ouverte en fin de session, @thierry merge demain.

---

## 3. Plan en cours

Aucune session multi-step interrompue. Lot UI THI-298 terminé bout-en-bout (5 itérations + réalignement doc). Prochain lot non démarré (voir §7).

---

## 4. Décisions prises cette session

- **Fix focus = exception compagne non-layered dans `globals.css`** (pas une utility Tailwind) parce que la globale `*:focus-visible { outline: 2px }` (`globals.css:394`) est **non-layered** et qu'en cascade CSS Layers non-layered bat layered quelle que soit la spécificité → le `focus-visible:outline-none` du composant (layered) ne pouvait PAS l'annuler. Alternative écartée : tout gérer au call-site composant — impossible structurellement.
- **Liseré ~2px = `border-color brand-600` + `box-shadow 0 0 0 1px brand-600`** (pas `border-2`) parce que le box-shadow ne change pas la largeur de bordure → **zéro reflow**. Alternative écartée : `border-2` = layout shift à chaque focus.
- **Carve-out `:not([aria-invalid='true'])`** parce que sinon le liseré émeraude clobbe le ring danger ; le champ invalide doit garder son signal danger seul. Confirmé par plan-reviewer.
- **Réécriture report + description PR sur `b0d74ce`** parce que les deux documentaient des contrats MORTS (v3 brand-700+ring/50 rejeté, v2 border-transparent+ring/30) → merger aurait fait entrer dans main un rapport documentant un design rejeté avec audits sur le mauvais contrat. Blocage DoD identifié par @cowork au live-test.
- **`.drw-input` hors scope → THI-304 Lot D** parce que c'est une primitive de champ PARALLÈLE (Drawer atom, `atoms.css:351`) qui ne porte pas `.ankora-form-control-16` → le fix central ne l'atteint pas. Déjà iOS-safe (`:focus`). Tracé, pas corrigé ici.

---

## 5. Décisions en attente Thierry

- **Merge PR docs-only de clôture** (`docs/handoff-2026-05-31-close`) — non urgent, demain.
- **Référence `#34 (natifs→primitive)`** du prompt de clôture cowork : GitHub #34 = « Opération Babel » i18n (MERGÉ), **pas** « natifs→primitive ». Référence à clarifier côté @cowork — quel tracker porte réellement la dette natifs→primitive ? Non bloquant.

---

## 6. Garde-fous activés (Phase 0)

- Modèle actif : `claude-opus-4-8` ✅ (pinné `.claude/settings.local.json`)
- Branch protection `main` : ✅ active
- `npm run lint:use-server` : ✅ pass (hook pre-commit)
- Sub-agents : `plan-reviewer` invoqué sur le fix focus (APPROVED WITH CHANGES, 3 hard gates traités) ✅
- DoD 5/5 vérifié sur PR #205 avant merge ✅
- **Doctrine live-test confirmée** : le live-test runtime @cowork a attrapé le « double/triple trait » que unit (15/15) + e2e + `ui-auditor` PASS + Sourcery ont TOUS raté — le bug vivait dans la cascade CSS runtime (outline global non-layered), invisible aux assertions de classes. Leçon : pour le focus/CSS cascade, le runtime visuel est irremplaçable.

---

## 7. Next action concrète

**Démarrer le lot UI suivant : THI-299 (PR-UI-2 — badge fréquence charges sobre + groupement), une PR à la fois, en lisant d'abord `prompts/` + `docs/ROADMAP.md` puis le ticket Linear THI-299.** Séquence lot UI verrouillée : THI-299 → THI-300 (liste charges groupée + total bas) → THI-301 (DateField jour-du-mois). En parallèle backlog : Track B P1 lot 2 (S5 curseur + marché).

---

## 8. Anti-pièges (NE PAS faire)

- **NE PAS commit `public/llms-full.txt`** — modif pré-existante hors scope, présente depuis avant cette session.
- **NE PAS toucher `.drw-input` en croyant finir THI-298** — c'est THI-304 Lot D, un ticket séparé, primitive Drawer parallèle.
- **NE PAS réintroduire un ring sur le focus VALIDE des champs** — le ring n'existe QUE pour `aria-invalid` désormais (contrat verrouillé, rejeté par @thierry deux fois).
- **NE PAS supprimer la globale `*:focus-visible` (`globals.css:394-398`)** — elle reste l'affordance correcte des non-champs (boutons/liens/tabs/checkboxes). Le fix est additif, pas un remplacement.
- **NE PAS faire confiance aux SHA `b0d74ce`/`ccbec19`** pour chercher dans main — squashés en `4bc0bb3`.
- **NE PAS supprimer les branches non mergées** : `feat/pr-b2-mock-vertical-slice`, `hotfix/pr-beta-3-503-*`, etc. restent actives.

---

## Annexes

### Dettes ouvertes tracées (confirmées Backlog Linear)

- **THI-304** — dette a11y focus transverse, Lots A (ring /30 button/dialog/ExpenseEditDrawer), B (fallback `:focus` iOS), C (contraste dark brand-700 + doc token-usage), **D (`.drw-input` drawer atom)**.
- **THI-300** — PR-UI-3a liste charges groupée + total global (porte aussi le double-cadre repos).
- **THI-299** — PR-UI-2 badge fréquence (NEXT).
- **THI-301** — DateField unifié.
- **THI-302** — PR-UI-4 backlog (is_bill, déféré).

### Liens

- PR #205 : https://github.com/thierryvm/ankora/pull/205
- Prod : https://ankora-chi.vercel.app
- Linear THI-298 (Done) : https://linear.app/thierryvm/issue/THI-298

---

**Signé par** : @cc-ankora · Session `2026-05-31-2328`
