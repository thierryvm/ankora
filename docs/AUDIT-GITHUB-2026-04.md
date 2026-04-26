# Audit GitHub — Ankora™

**Date** : 20 avril 2026
**Repo** : [github.com/thierryvm/ankora](https://github.com/thierryvm/ankora)
**Audité par** : Cowork (Claude) — double regard **Chef de Projet** + **Marketing Manager**
**Contexte** : Audit réalisé en parallèle pendant que CC Ankora exécute PR-2 (glossaire & stratégie de traduction).

---

## TL;DR — verdict en 5 lignes

1. **Santé technique : excellente.** 119 runs CI, 3 workflows actifs, dernier `main` vert (CI #72). 2 contributeurs, 25 commits, 0 conflit.
2. **Santé produit/marketing : moyenne.** README pro et dense, mais **plusieurs incohérences bloquantes** pour un visiteur (website, topics, phase, releases).
3. **Incohérence critique confirmée** : website GitHub = `ankora.eu`, mais l'adresse réelle est **`ankora.be`** (confirmé par Thierry). Email `security@ankora.eu` idem.
4. **Positionnement floué** par le topic `openbanking-ready` (contredit le pitch "pas de PSD2").
5. **Manque de narratif produit** : 0 release publiée, pas de `About` soigné côté visuel, description sans accents.

**Action immédiate recommandée** : **PR-GH-CLEANUP** (paramètres repo + topics + description) — 30 min, zéro impact code, gros gain d'image avant l'ouverture de la bêta privée.

---

## 1. Vue Chef de Projet — état de la livraison

### 1.1 Workflows & CI

| Workflow               | Rôle                               | Derniers runs                                |
| ---------------------- | ---------------------------------- | -------------------------------------------- |
| **CI**                 | Lint + typecheck + tests + build   | CI #72 ✅ `main` (post-merge ROADMAP, 3m15s) |
| **Auto-label PRs**     | Application automatique des labels | Run #26 ✅                                   |
| **Dependabot Updates** | Bump dépendances                   | Actif                                        |

- **119 runs cumulés** → robustesse CI, pas de flakiness apparente.
- **Runtime standard 3-4 min** → bon rapport feedback/coût runners.
- **Post PR #27** : `main` stable, 0 check rouge.

### 1.2 Pull Requests

- **Open : 1** → `#24 chore(runtime): pin Node 24 LTS + @types/node + packageManager` (Draft, ouvert 19 avr).
- **Closed : 26** → cadence saine, PR moyennes de taille contenue.
- **PR-2 en cours** (CC Ankora) → pas encore ouverte en PR sur GitHub (branch locale ou push imminent).
- **À statuer** : la PR #24 (Node 24) peut-elle être finalisée avant PR-2 ou est-elle parkée ?

### 1.3 Contributors & velocity

- **2 contributors** : `thierryvm` + `claude` (bot Claude Code).
- **25 commits** sur `main` → rythme MVP early-stage cohérent.
- **Branches actives visibles** : `feature/landing-v2-foundation`, `refactor/post-pr25-debts`, `chore/pin-runtime`, `chore/tailwind-canonical-classes`, `chore/gitignore-playwright-mcp`, `fix/csp-nonce-legal-stubs-licence`. Bon flux feature-branch.

### 1.4 Security & qualité

- **Deployments : 75** (intégration Vercel saine, pas de backlog visible).
- **SECURITY.md présent** ✅ mais email `security@ankora.eu` **à corriger en `.be`**.
- **7 agents QA** documentés dans `.claude/agents/` (security-auditor, rls-flow-tester, financial-formula-validator, ui-auditor, lighthouse-auditor, seo-geo-auditor, gdpr-compliance-auditor). Excellent signal pour un audit externe.
- **Portes de qualité** (lint, typecheck, tests, e2e, Lighthouse ≥95) clairement documentées.

### 1.5 Dette visible côté repo

| Item                                                            | Gravité                | Effort      | Où                                                     |
| --------------------------------------------------------------- | ---------------------- | ----------- | ------------------------------------------------------ |
| Incohérence phase (README dit "Phase 2", ROADMAP dit "Phase 1") | 🟡 Moyen               | 5 min       | `README.md` ligne Feuille de route + `docs/ROADMAP.md` |
| Topic `openbanking-ready`                                       | 🔴 Bloquant narratif   | 2 min       | Settings → About                                       |
| Website `ankora.eu` vs `ankora.be`                              | 🔴 Bloquant onboarding | 1 min       | Settings → About                                       |
| Email `security@ankora.eu`                                      | 🔴 Bloquant sécurité   | 1 min       | `SECURITY.md` + README                                 |
| Description sans accents ("Cockpit budgetaire personnel…")      | 🟡 Moyen               | 2 min       | Settings → About                                       |
| 0 release publiée                                               | 🟡 Moyen               | 30 min      | Tag `v0.x.0-mvp-beta`                                  |
| Pas de bannière `About`/social preview                          | 🟡 Moyen               | 1h (design) | Settings → Social preview                              |

---

## 2. Vue Marketing Manager — image publique

### 2.1 Ce que voit un visiteur en 10 secondes

1. **Header GitHub** → "thierryvm/ankora · Cockpit budgetaire personnel - Belgique - RGPD - heberge UE. Next.js 16 + Supabase + PWA."
   - ⚠️ **Pas d'accents** → paraît cheap, surtout pour un produit belge francophone.
   - ⚠️ Stack mentionnée (Next.js/Supabase/PWA) → top pour dev, sans intérêt pour un investisseur/journaliste.

2. **Website link → ankora.eu** → **bloquant**. Si un prospect clique, il atterrit sur une URL inexistante/parkée. Premier touchpoint raté.

3. **Topics (13)** incluent :
   - ✅ `personal-finance`, `budget`, `belgium`, `gdpr`, `privacy`, `pwa`, `nextjs`, `supabase`, `fintech`, `rgpd` → bons.
   - ❌ **`openbanking-ready`** → _contradiction directe_ avec le pitch "pas de PSD2, pas d'agrégation" du README. Soit le topic ment, soit le README ment.

4. **Releases : 0** → aucun tag, aucun changelog visible. Un lecteur GitHub (hunter, partenaire) n'a aucune idée du momentum.

5. **README** (très fort 💪) — analyse détaillée ci-dessous.

### 2.2 Audit README — force par force

**🏆 Forces** :

- Pitch en une phrase clair : "Ton ancrage financier…"
- Positionnement **différenciant explicite** : anti-PSD2, anti-agrégation, FSMA-aware.
- Tableau `Fonctionnalités` percutant (9 features lisibles en 20s).
- Mapping RGPD **article par article** → rare, rassurant, vendable en B2B.
- Section `Principes de conception` → 7 principes, bonne plateforme de marque (souveraineté, privacy by default, a11y WCAG 2.2 AA…).
- Stack technique complète → crédibilité dev.
- FAQ avec 7 questions **pertinentes** (remplace ma banque, FSMA, sécurité, sans compte, open source, prix, hors Belgique).

**⚠️ Faiblesses / risques** :

- **Phase 2** déclarée dans README alors que ROADMAP interne est **Phase 1 MVP** → frustrant pour un contributeur externe, signal de décohérence.
- **Pas d'image de bannière / hero** dans le README → 100% texte, perte d'impact marketing.
- **Pas de démo live ni de screenshot** → un visiteur ne voit pas le produit.
- **Pas de badges** (CI status, license, version, stars, Lighthouse) → occasion manquée pour la preuve sociale + technique.
- **Section "Combien ça coûte ?"** dit "MVP en phase bêta privée" — correct, mais **aucun CTA** (liste d'attente, waitlist, signup early-access).
- **Licence propriétaire** bien expliquée, mais formulation "Le code source est fourni à titre consultatif" mériterait un lien vers un formulaire si un tiers veut l'utiliser (ouvrable = opportunité).
- **Pas de lien About** type "Why Ankora" ou page personnelle du fondateur → manque d'humain.

**🎯 Quick wins README (< 2h)** :

1. Ajouter bannière hero (1 image PNG, 1280×640, exportable depuis `design-mockup-og.html`).
2. Ajouter 3-4 badges en haut : License · CI · Node · Built with Next.js.
3. Corriger Phase 2 → Phase 1.
4. Remplacer `ankora.eu` → `ankora.be` (texte + SECURITY.md).
5. Ajouter 1 GIF ou 1 screenshot du dashboard (hors bêta, anonymisé).
6. Ajouter un bloc **Waitlist / Early access** avec lien vers `ankora.be/signup`.

### 2.3 Topics recommandés (nettoyage)

**Garder (10)** : `personal-finance`, `budget`, `belgium`, `gdpr`, `rgpd`, `privacy`, `pwa`, `nextjs`, `supabase`, `fintech`.
**Retirer (1)** : `openbanking-ready` ❌.
**Ajouter (2-3)** : `typescript`, `decimal`, `fsma` (différenciant réglementaire), `self-hosted-friendly`.

### 2.4 Description GitHub recommandée

Actuelle :

> `Cockpit budgetaire personnel - Belgique - RGPD - heberge UE. Next.js 16 + Supabase + PWA.`

Proposée (avec accents, 140 chars, orientée utilisateur) :

> `Cockpit budgétaire personnel pour la Belgique. Lisse tes charges annuelles, anticipe chaque facture. RGPD · hébergé UE · sans PSD2.`

### 2.5 Stratégie releases (0 → 1)

Publier **v0.9.0-mvp-beta** dès la fin de PR-3 :

- Tag sémantique.
- Release notes = résumé des 5 dernières PR.
- Assets : aucun (code source suffit pour une licence propriétaire).
- Bénéfice : un outsider voit le momentum ; `GET /releases/latest` devient une API stable pour les intégrations futures.

---

## 3. Synthèse PM + Marketing — priorisation

### 🔴 P0 — Avant l'annonce publique (total ~1h)

1. **Settings → About** : remplacer `ankora.eu` par `ankora.be` **et** retirer `openbanking-ready` **et** corriger description (avec accents).
2. **SECURITY.md** : remplacer `security@ankora.eu` par `security@ankora.be`.
3. **README** : Phase 2 → Phase 1 (aligner avec `docs/ROADMAP.md`).
4. **Social preview** : uploader une image 1280×640 (reprendre le hero `design-mockup-og.html`).

### 🟡 P1 — Quick wins avant PR-3 (total ~3h)

5. README badges (License, CI, Node, Built with Next.js, Lighthouse).
6. README bannière hero + 1 screenshot dashboard.
7. Ajouter bloc `🚀 Early Access / Waitlist` avec CTA vers `ankora.be/signup`.
8. Créer tag `v0.8.0-alpha-pre-pr3` pour matérialiser l'état actuel.

### 🟢 P2 — Post PR-3 (release publique)

9. Publier `v0.9.0-mvp-beta` avec release notes.
10. Ajouter un `GOVERNANCE.md` (qui décide, comment proposer une feature).
11. Activer GitHub Discussions pour la FAQ produit (≠ Issues techniques).
12. Créer template Issue "Feature request" orienté utilisateur non-dev.

---

## 4. Items non vérifiables dans cette session

| Item                                           | Comment le vérifier                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Branch protection `main`                       | Settings → Branches (accès propriétaire requis)                               |
| Secrets configurés (Supabase, Upstash, Vercel) | Settings → Secrets and variables → Actions                                    |
| Dependabot alerts ouvertes                     | Security tab (peut être vide = OK ou non activé)                              |
| CODEOWNERS actif                               | Présence du fichier `.github/CODEOWNERS` (non vérifié côté repo file listing) |
| Traffic analytics                              | Insights → Traffic (propriétaire uniquement)                                  |
| Lighthouse CI dernière note                    | Artifact du workflow CI                                                       |

→ **Proposé** : audit complémentaire 15 min en session dédiée si Thierry veut vérifier ces points avec accès propriétaire.

---

## 5. Décision recommandée

**Pendant que CC Ankora termine PR-2**, exécute **PR-GH-CLEANUP en 30 min** (ordre) :

1. Settings GitHub → About → corriger website, description, topics.
2. `SECURITY.md` + `README.md` → remplacer `.eu` par `.be` + Phase 2 → Phase 1.
3. Commit `chore(repo): align GitHub metadata with ankora.be and phase 1` → push sur `main` direct (aucun impact runtime, pas besoin de PR review lourde, ou PR rapide self-approuvée).
4. Settings → Social preview → upload image hero.

**Après PR-3**, exécuter **P2** (release tagging, Discussions, CODEOWNERS) en une session.

---

## Sources

- [README.md rendu public](https://github.com/thierryvm/ankora)
- [Actions (119 runs)](https://github.com/thierryvm/ankora/actions)
- [Pull Requests](https://github.com/thierryvm/ankora/pulls)
- `F:\PROJECTS\Apps\ankora\docs\ROADMAP.md` (référence Phase 1 MVP)
- `F:\PROJECTS\Apps\ankora\docs\AUDIT-2026-04.md` (audit technique précédent)
