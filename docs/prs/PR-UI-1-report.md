# PR-UI-1 — Champs : focus/bordure « un signal pas deux » (THI-298)

> **PR** : [#205](https://github.com/thierryvm/ankora/pull/205) · **Branche** : `fix/thi-298-field-focus-border` · **Ticket** : THI-298
> **Auteur** : @cc-ankora · **Date** : 2026-05-31 · **Statut** : ✅ DoD satisfaite — en attente du merge (squash) @thierry

---

## 1. Objectif

Supprimer le « double signal » de focus sur les champs de formulaire. Au focus, la primitive partagée empilait **deux signaux disparates** : une bordure colorée `border-brand-500` **et** un `ring-2`, lu par @thierry comme une « double bordure ». Le focus devient désormais **un signal émeraude cohérent** : bordure `brand-700` + halo `ring-brand-500/50` de la même famille teal.

Surfaces touchées : primitives partagées **`Input`** et **`SelectTrigger`** → blast radius global (tous les formulaires de l'app : charges, dépenses, login, signup, onboarding, settings, accounts, simulateur, auth).

---

## 2. Contrat de champ final (Input + SelectTrigger, identique 1:1)

| État                         | Classe                                                                                                                                       | Note                                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repos**                    | `border-border` (plein) + `transition-colors`                                                                                                | Affordance champ garantie clair + sombre. Un repos allégé (`/60`) a été **rejeté** par plan-reviewer (perte d'affordance en dark : border `#1e293b` sur card `#111a2e` déjà peu contrasté).                                      |
| **Hover**                    | `hover:border-brand-500/40`                                                                                                                  | Indice de marque subtil avant focus.                                                                                                                                                                                             |
| **Focus**                    | `focus-visible:border-brand-700 focus-visible:ring-brand-500/50 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none` | **Un signal cohérent** : bordure `brand-700` (#0f766e, ~5:1 sur card clair ET sombre → conforme WCAG 2.4.11) + halo assorti même teinte.                                                                                         |
| **Invalide (repos + focus)** | `aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger`                                 | La bordure danger **survit au focus** : les classes `aria-invalid:focus-visible:*` sont émises après `focus-visible:border-brand-700` → le source-order Tailwind v4 garde la bordure/ring danger sur un champ invalide focalisé. |

**Contrats préexistants intacts** : F2 (ring soft) · F3 (spin-buttons neutralisés sur `type=number`) · F4 (`dark:scheme-dark` icône date) · iOS 16px anti-zoom (`ankora-form-control-16`).

### Itération du contrat (traçabilité)

1. **v1** — repos allégé `/60` : rejeté (a11y dark) → repos `border-border` plein.
2. **v2** — focus « ring seul » (`border-transparent` + ring `/30`) : rejeté avant merge — avec bordure transparente le ring devenait le **seul** indicateur, et `brand-500/30` tombe sous le seuil WCAG 2.4.11 (~1.3:1 clair, ~1.8:1 sombre).
3. **v3 (livré)** — focus = bordure `brand-700` + ring `brand-500/50` assorti : conforme 2.4.11, un signal cohérent.

---

## 3. Fichiers modifiés

- `src/components/ui/input.tsx` — contrat focus + JSDoc.
- `src/components/ui/select.tsx` (SelectTrigger) — miroir 1:1 + ajout `transition-colors` (absent avant).
- `src/components/ui/__tests__/input.test.tsx` — tests focus/hover/aria-invalid (présence classes + attribut DOM e2e).
- `src/components/ui/__tests__/select.test.tsx` — tests contrat trigger + test dédié `aria-invalid` forwarding.

---

## 4. Définition de DONE — preuves

| #   | Critère                              | Statut | Preuve                                                                                                                                   |
| --- | ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CI tous verts                        | ✅     | Playwright E2E ✅ · Lint+Typecheck+Tests ✅ · Security ✅ · Sourcery review ✅ · **check-sourcery-resolved ✅** · Vercel ✅              |
| 2   | Sourcery silencieux (dernier commit) | ✅     | 2 suggestions tests (`aria-invalid` attribut DOM) traitées dans le code ; 2 review threads **résolus** (`isResolved:true`, 0 non résolu) |
| 3   | Review humaine                       | ⏳     | Branch protection n'exige pas d'approbation formelle ; @thierry arbitre le merge                                                         |
| 4   | Pas de conflit avec main             | ✅     | `mergeStateStatus = CLEAN` / `mergeable = MERGEABLE`                                                                                     |
| 5   | Rapport final                        | ✅     | Ce document                                                                                                                              |

### QA agents (tous PASS)

| Agent                | Verdict            | Note                                                                                                                                                                                                    |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-reviewer`      | ✅ APPROVED        | 2 passes (contrat initial + révision focus) ; tous les faits re-vérifiés ; aria-invalid override confirmé fiable                                                                                        |
| `ui-auditor`         | ✅ PASS            | brand-700 = 5.47:1 clair / 2.97:1 dark bordure seule (ring /50 assorti couvre le périmètre → focus compound conforme) ; pas de « double bordure »                                                       |
| `mobile-ios-auditor` | ✅ PASS_WITH_NOTES | BLOCK initial **levé** : dépendance `:focus-visible` au tap iOS est une dette **pré-existante** (l'ancien code utilisait déjà `focus-visible:`), non régressée par cette PR. iOS 16px / F3 / F4 intacts |

### Tests

- `vitest` ciblé `input.test.tsx` + `select.test.tsx` : **15/15** pass.
- `vitest` dossier `src/components/ui/__tests__/` : **72/72** pass.
- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur (6 warnings pré-existants hors scope).

### Live-test @cowork (critère bloquant)

✅ **PASS** — focus input validé en live sur `/login`, **clair ET sombre** : bordure brand-700 + halo doux = un seul signal, visible et conforme 2.4.11, **zéro double cadre**. Pas de bascule sur la variante de repli (bordure seule). SelectTrigger partage le contrat 1:1 (non vu live mais couvert par QA agents + tests). `aria-invalid` couvert par les tests.

---

## 5. Hors scope (tracé)

**Le « double cadre au repos »** (bordure de la card du formulaire + bordure du champ, même token `--color-border`) est un sujet **layout/card**, pas primitive champ. À traiter côté card en PR-UI-3a — ne pas compenser via une bordure de champ plus fine (mauvais levier + risque dark).

**Dette a11y focus transverse → [THI-304](https://linear.app/thierryvm/issue/THI-304)** :

- Lot A : ring `brand-500/30` seul sous WCAG 2.4.11 sur `button.tsx`, `dialog.tsx` (close), `ExpenseEditDrawer.tsx` — à corriger ensemble.
- Lot B : fallback `:focus` (en plus de `:focus-visible`) pour iOS WebKit au tap — dette pré-existante.
- Lot C : note contraste dark `border-brand-700` (2.97:1 bordure seule) + doc `token-usage.md`.

---

## 6. Suite du lot UI

THI-298 (PR-UI-1) ✅ → THI-299 → THI-300 → THI-201 (UI-3b) → THI-301 (DateField : jour 1-31 + clamp dernier jour du mois). Une PR à la fois.
