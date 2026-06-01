---
project: ankora
type: cc-handoff
date: 2026-06-01
session: 2026-06-01-2105
status: closed
---

# CC Ankora handoff — switch langue segmented + 6 merges + agents + THI-300 prêt

> Session marathon (~8 objectifs). Écrit en fin de session. Double redondance : vault Obsidian + miroir `docs/handoffs/` repo.

---

## 1. État git brut

```
git rev-parse --abbrev-ref HEAD   # → main
git rev-parse --short HEAD         # → d571ea3
git log --oneline -6
# d571ea3 feat(i18n): switch langue en segmented control iOS (FR | EN) (#209)
# d91d9cc chore(agents): test-runner haiku → sonnet (minimum Sonnet) (#210)
# 098fd74 feat(layout): AccountButton menu compte login/logout partout (PR-A) (#208)
# 05a39d2 docs(handoffs): clôture session THI-298 + miroir handoff + ROADMAP synced (#206)
# 95cb4b4 feat(charges): badge fréquence sobre, visible et distinct (THI-299) (#207)
# de8e0d4 docs(handoffs): session handoff — Track B P1 lot 1 projection (#203) (#204)

git status --short   # → M public/llms-full.txt  (pré-existant, NE PAS commit)
```

Working tree propre hors `public/llms-full.txt`. Aucun WIP THI-300 en code (seulement des Read en Phase 0). Repo branches : `main` + `feat/pr-b2-mock-vertical-slice` (active, préservée) uniquement — 12 branches mergées nettoyées cette session.

---

## 2. PR en vol

**Aucune PR ouverte.** Les 6 PR de la session sont TOUTES mergées : #205 (focus champ THI-298), #206 (handoff/ROADMAP), #207 (badge THI-299), #208 (AccountButton PR-A), **#209 (switch langue segmented)**, **#210 (agents min Sonnet)**.

---

## 3. Plan en cours

**THI-300 (PR-UI-3a, liste charges)** : Phase 0 + plan-reviewer round 1 FAITS, exécution déléguée à une **session fraîche** (contexte de cette session-ci trop lourd). Le prompt complet self-contained a été remis à @thierry et collé dans la nouvelle session. Spec dé-risquée (voir §7).

---

## 4. Décisions prises cette session

- **Switch langue = segmented control iOS** (FR | EN) parce que 2 locales visibles seulement (`LOCALES_VISIBLE`) → un toggle bat le `<select>` natif (qui avait la « grosse bordure » = outline global sur le select focalisé). @thierry a choisi le pill iOS. Libellé court FR/EN + nom complet en aria-label.
- **Avatar Tailwind, PAS Avatar.tsx** (AccountButton + leçon réutilisée) : `Avatar.tsx` utilise des inline `style={{}}` bloqués par la CSP prod (`style-src 'self' 'nonce'` sans unsafe-inline, proxy.ts:57), et n'est utilisé qu'en design-playground. Override des recos cowork + ux-auditor.
- **Switch langue : 2 tab-stops, PAS de roving tabindex** parce que le roving (inactif `tabindex=-1`) cassait le focus-trap du drawer mobile (HeaderNav) où vit le LocaleSwitcher → l'e2e `drawer-mobile-focus-trap` échouait. Régression introduite puis fixée.
- **Anneau actif = `ring-brand-600`** (teal) parce que `ring-border` neutre était à ~2:1 en dark (sous WCAG 1.4.11) ; @thierry a validé le teal (≥3:1, lecture « selected » brand).
- **test-runner haiku → sonnet** (directive @thierry : minimum Sonnet, jamais Haiku sur aucun agent).
- **Avatar profil = différé post-launch** (THI-318), séquencé : afficher la photo OAuth Google (near-free, +CSP lh3) AVANT l'upload (DB+Storage+RLS+GDPR, ADR requis). Initiales = état final légitime, pas un pis-aller.
- **THI-300 total = Option A** (sous-total brut/groupe + global effort-lissé/mois + équiv. annuel). Option C (somme brute inter-cadences) interdite (chiffre mensonger, FSMA).

---

## 5. Décisions en attente Thierry

- **THI-300** en cours d'exécution par la session fraîche (prompt collé). @thierry tranche le contrat DOM e2e si la session le remonte.
- **Dette « 2 agents sans `tools:` »** (admin-dashboard-auditor, dashboard-ux-auditor héritent tous les outils) → créer un ticket Linear « scoper tools moindre privilège » — non urgent.

---

## 6. Garde-fous activés

- Modèle : `claude-opus-4-8` (pinné settings.local.json).
- plan-reviewer invoqué AVANT code : sur AccountButton (Option B prop-drill imposée, mon Option A reposait sur un cache() inexistant) + sur THI-300 (round 1, a attrapé le bug réconciliation active/inactive).
- Code-review (feature-dev:code-reviewer) sur le switch langue : a attrapé un **P0** que j'avais raté (e2e ciblait encore le `<select>`) → corrigé.
- DoD respectée : aucune PR mergée sur CI pending. #209 e2e a échoué (régression focus-trap) → fix → re-vert → merge. Preuve que « push done ≠ task done » fonctionne.
- Agents : 15/15 déclarent un model ; smoke statique OK ; 6 prouvés live.

---

## 7. Next action concrète

**La session fraîche exécute THI-300** selon le prompt remis : plan-reviewer round 2 (valider les points résolus) → code (grouping par fréquence + total Option A server-computed + aplatissement mobile + filtre actif) → e2e mis à jour (les specs charges-list utilisent `> li` enfant-direct que le grouping casse) → 5 QA agents (dont financial-formula-validator) → PR → CI verte avant DONE. **Puis THI-301 (DateField).**

---

## 8. Anti-pièges (ce que la prochaine session NE doit PAS faire)

- **NE PAS commit `public/llms-full.txt`** (modif pré-existante hors scope).
- **NE PAS supprimer `feat/pr-b2-mock-vertical-slice`** (active, pas mergée).
- **NE PAS oublier le filtre actif** sur THI-300 : `rawCharges` inclut les inactives mais les helpers domaine les skippent → liste + sous-totaux + global TOUS sur actives, sinon les chiffres ne réconcilient pas.
- **NE PAS casser** : badge fréquence THI-299, grille desktop 6-col, focus-trap drawer, contrat THI-277 BottomTabBar.
- **NE PAS utiliser d'inline style** (CSP prod bloque) ni `Avatar.tsx` sur surface réelle.
- **NE PAS faire confiance aux specs cowork sans re-Read** : incident natifs→primitive (faits inférés présentés vérifiés).

---

## Annexes

### Dettes tracées Linear

- THI-312 (2 champs natifs `<input>` → primitive Input).
- THI-314 (token fantôme `--color-border-strong` documenté mais absent de globals.css).
- THI-318 (avatar profil post-launch, OAuth-display → upload).
- À créer : ticket « scoper tools des 2 agents sans `tools:` ».

### Liens

- main : `d571ea3` · Prod : https://ankora-chi.vercel.app
- ROADMAP next : THI-300 (PR-UI-3a) → THI-301 (DateField).

---

**Signé par** : @cc-ankora · Session `2026-06-01-2105`
