---
project: ankora
type: cc-handoff
date: 2026-05-30
session: 2026-05-30-2135
status: done
tags: [simulator, track-b, p1, projection, cumul, a11y, merged]
---

# CC Ankora handoff — Track B P1 lot 1 (projection 6 mois + cumul) MERGÉ

> Session 2026-05-30 ~20:55→21:35. Kickoff @cowork : Track B P1 lot 1 du simulateur réserve libre (S3 projection 6 mois + S4 cumul humain). Suite P0 #199 + #202. Livré, mergé #203, live-test @cowork PASS clair+sombre.

---

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD
# → main

git rev-parse --short HEAD
# → b36e15f

git log --oneline -5
# b36e15f docs(handoffs): session handoff + canonical simulator audit spec (#201)
# f9c9b18 feat(simulator): projection 6 mois + cumul réserve libre (Track B P1 lot 1) (#203)
# e6e1e7f fix(simulator): pass revenus as a number across the RSC boundary (THI-195 hotfix) (#202)
# 1a56a0d feat(simulator): reframe what-if impact on réserve libre (THI-195) (#199)
# 7e0fedc chore(agents): upgrade QA agents for réserve-libre simulator + liquid glass (#200)

git status --short
# (vide — main propre, aucun WIP)
```

**WIP non commité** : aucun. La branche feature `feat/simulateur-projection-6m-cumul` est mergée (squash) et peut être nettoyée. Deux stashes orphelins existent (`stash@{0}` = png `preview-pr-196-landing.png` capturé au branch-off ; `stash@{1}` = backup lint-staged stale) — non liés à cette session, voir §8.

---

## 2. PR en vol

- **PR #203** — https://github.com/thierryvm/ankora/pull/203 — **MERGÉE** (squash → `f9c9b18`, 2026-05-30T19:26:50Z)
- **Titre** : `feat(simulator): projection 6 mois + cumul réserve libre (Track B P1 lot 1)`
- **DoD 5/5** :
  1. CI verts : ✅ (Lint+Typecheck+Unit, Security, e2e, build — verts au merge)
  2. Sourcery silent : ✅ (`gh api .../pulls/203/comments` → aucun commentaire bot)
  3. Reviews approved + **live-test @cowork PASS** (clair + sombre) : ✅
  4. Conflit main : ✅ aucun
  5. Rapport `docs/prs/PR-trackB-p1-lot1-projection-report.md` : ✅ écrit (commité dans la PR)
- **mergeStateStatus** : `MERGED`

Aucune autre PR en vol.

---

## 3. Plan en cours

Aucun plan multi-step interrompu. Track B P1 **lot 1 terminé**.

- plan-reviewer : 🟡 APPROVED WITH CHANGES (4 points) → ✅ APPROVED après 1 révision (décision delta=0 résolvant 3 points).
- Découpage Track B P1 : lot 1 (S3+S4) ✅ ce lot · lot 2 (S5 curseur + marché) ⏳ next · lots suivants (DateField, liquid-glass, half-sheet) backlog.

---

## 4. Décisions prises cette session

- **Modèle projection 6 mois = « cumul marginal »** (option 1/3, tranchée @thierry) : « Sans changement » = 0 plat, « Avec ce choix » = `monthlyDelta × mois`, l'écart = épargne cumulée. Alternative écartée : « réserve absolue style landing » (suppose épargne = 100 % du reste/mois → projection comportementale du patrimoine, zone grise FSMA) ; et « 2 lignes plates » (redondant avec le hero, ne sert pas S4). **On ne mélange pas flux €/mois (hero) et stock € cumulés (courbe).**
- **`RESERVE_BASELINE_6M` (landing) NON réimporté** dans le cockpit authentifié : artefact démo fabriqué, le caveat démo ne se transfère pas au live.
- **Edge delta = 0 → pas de sparkline + ligne neutre** (« Aucun impact sur 6 mois ») : élimine le domaine SVG dégénéré `[0,0]→NaN` ET le « +0 € » trompeur ; le hero affiche déjà X→X. Décision tranchée par moi (edge mineur, pas un arbitrage produit).
- **Fix a11y WCAG AA in-scope (pas de changement de token global)** : petit texte coloré (cumul text-sm, légende text-xs) passé en `text-foreground`/`text-muted-foreground`. Ratios vérifiés : success `#059669` = 3.77:1 sur card claire, danger `#dc2626` = 3.59:1 sur card sombre → **sub-4.5:1**. La couleur gain/perte vit dans la sparkline (objet graphique, ≥3:1). Alternative écartée : override dark-mode des tokens (blast radius app-wide → PR a11y dédiée).
- **Calcul 100 % client-side** : `cumulativeReserveSeries` (domaine pur) appelée dans le `'use client'` ; aucun `Decimal`/`Money` sérialisé server→client (classe #202). Test de régression frontière dédié.

---

## 5. Décisions en attente Thierry

Aucune question bloquante ouverte. Non bloquant (tracé pour @cowork) :

- **Micro-copy FR** des 7 clés `app.simulator.impact` à relire (FSMA + qualité) — draft factuel fourni, déjà mergé mais relecture possible en lot 2.
- **Glossaire i18n v1.2** : formaliser l'entrée « réserve libre » (note i18n-auditor).
- **Note systémique a11y** : `--color-success`/`--color-danger` sont sub-4.5:1 pour petit texte sur cards → tout futur petit texte coloré échouera AA. Usages existants (grand texte, seuil 3:1) OK. PR a11y dédiée recommandée (override dark-mode `success→#34d399`, `danger→#f87171`).

---

## 6. Garde-fous activés (Phase 0 verifications)

- Modèle actif : `claude-opus-4-8` ✅
- Branch protection `main` : ✅ active
- `npm run lint:use-server` : ✅ pass
- Sub-agents : `plan-reviewer` invoqué (obligatoire, code > 50 lignes + composant) → APPROVED ✅. `spec-translator` non requis (kickoff @cowork déjà structuré).
- Gates QA : financial-formula ✅ · dashboard-ux ✅ · i18n ✅ · ui-auditor (a11y-high corrigé) ✅
- vitest **1367/1367** ✅
- DoD 5/5 vérifié sur la PR mergée (#203) : ✅ (live-test inclus)

---

## 7. Next action concrète

**Attendre le prompt @cowork pour Track B P1 lot 2 = S5 (curseur montant + contexte marché FSMA-safe), puis exécuter la séquence canonique : Phase 0 model check → code-verify (`SimulatorClient.tsx` carte scénario + `SimulatorProjection.tsx`) → surfacer toute décision produit AVANT de coder (reco taguée « (Recommandé) ») → plan-reviewer obligatoire → gates QA → live-test @cowork PASS avant merge.**

---

## 8. Anti-pièges (ce que la prochaine session NE doit PAS faire)

- **Ne PAS réimporter `RESERVE_BASELINE_6M`** (`scenarios.ts`, landing) dans le cockpit authentifié — artefact démo fabriqué, viole FSMA en live.
- **Ne PAS modifier `--color-success`/`--color-danger` dans une PR feature** — blast radius app-wide, réservé à une PR a11y dédiée avec sweep de régression.
- **Ne PAS faire traverser un `Decimal`/`Money` à la frontière RSC** — `revenus` reste `number`, re-wrap `money()` client (classe #202). Tout calcul projection est client-side.
- **Live-test d'intégration PASS = critère de merge feature** (appliqué #202 et #203) : pas de merge sur code + CI seuls. Ouvrir le drawer, sélectionner une charge, voir le rendu sans crash sur vraie donnée, clair + sombre.
- **Ne PAS pop les stashes orphelins** sans vérifier (`stash@{0}` png PR-196, `stash@{1}` backup lint-staged) — non liés au simulateur.
- **Ne PAS toucher la branche `feat/simulateur-projection-6m-cumul`** autrement que pour la supprimer (mergée squash → `git branch -D` safe après `fetch --prune`).

---

## Annexes

### Fichiers livrés (#203, 12 fichiers)

- `src/lib/domain/simulation.ts` (+`cumulativeReserveSeries`)
- `src/lib/domain/__tests__/simulation.test.ts` (+7) · `simulation.property.test.ts` (+3)
- `src/app/[locale]/app/simulator/SimulatorProjection.tsx` (nouveau)
- `src/app/[locale]/app/simulator/SimulatorClient.tsx` (intégration additive)
- `messages/{fr-BE,nl-BE,en,de-DE,es-ES}.json` (+7 clés chacun)
- `e2e/dashboard-simulator-drawer.spec.ts` (+3 assertions)
- `docs/prs/PR-trackB-p1-lot1-projection-report.md` (rapport)

### Liens externes

- PR mergée : https://github.com/thierryvm/ankora/pull/203 → `f9c9b18`
- Prod : https://ankora-chi.vercel.app
- Rapport : `docs/prs/PR-trackB-p1-lot1-projection-report.md`
