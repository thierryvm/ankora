# PR-UI-1 — Champs : focus/bordure « un signal pas deux » (THI-298)

> **PR** : [#205](https://github.com/thierryvm/ankora/pull/205) · **Branche** : `fix/thi-298-field-focus-border` · **Ticket** : THI-298
> **Auteur** : @cc-ankora · **Date** : 2026-05-31 · **Statut** : ✅ DoD satisfaite — en attente du merge (squash) @thierry
> **Contrat documenté ici = commit livré `b0d74ce`** (les itérations v1→v4 sont superseded, cf. §2).

---

## 1. Objectif

Supprimer le « double signal » de focus sur les champs de formulaire. Au focus, la primitive partagée empilait **deux signaux disparates** : une bordure colorée **et** un `ring-2`, lu par @thierry comme une « double bordure ». De plus, la règle globale `*:focus-visible { outline: 2px }` (`globals.css:394`) ajoutait un **outline détaché** par-dessus la bordure du champ → un troisième trait concentrique.

Le focus devient désormais **un seul liseré émeraude ~2px** : `border-color: brand-600` + `box-shadow: 0 0 0 1px brand-600`, **outline global neutralisé** sur les champs, **sans ring** sur un champ valide.

Surfaces touchées : primitives partagées **`Input`** et **`SelectTrigger`** → blast radius global (tous les formulaires de l'app : charges, dépenses, login, signup, onboarding, settings, accounts, simulateur, auth).

---

## 2. Contrat de champ final (Input + SelectTrigger, identique 1:1)

| État                         | Mécanisme                                                                                                                                                                                                                                                                 | Note                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repos**                    | `border-border` (plein) + `transition-colors`                                                                                                                                                                                                                             | Affordance champ garantie clair + sombre. Un repos allégé (`/60`) a été **rejeté** par plan-reviewer (perte d'affordance en dark).                                                                                                                                          |
| **Hover**                    | `hover:border-brand-500/40`                                                                                                                                                                                                                                               | Indice de marque subtil avant focus.                                                                                                                                                                                                                                        |
| **Focus (valide)**           | **Composant** : `focus-visible:border-brand-600 focus-visible:outline-none`. **Central** (`globals.css:421-427`) : `.ankora-form-control-16:focus-visible { outline: none }` + `:not([aria-invalid='true']) { border-color: brand-600; box-shadow: 0 0 0 1px brand-600 }` | **Un seul liseré ~2px émeraude opaque**, suivant le rayon `rounded-lg`, **sans reflow** (la largeur de border ne change pas) et **sans ring/halo**. L'outline détaché global est tué sur les champs.                                                                        |
| **Invalide (repos + focus)** | `aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger aria-invalid:focus-visible:ring-2`                                                                                                                            | La bordure **et** le ring danger **survivent au focus** : le carve-out central `:not([aria-invalid='true'])` n'applique PAS le liseré émeraude aux champs invalides → le signal danger (bordure + `ring-2`) reste le seul, fort. Le ring n'existe QUE pour l'état invalide. |

### Pourquoi le fix vit dans `globals.css` (mécanisme cascade non-layered)

La règle globale `*:focus-visible { outline: 2px solid brand-600 }` (`globals.css:394`) est **non-layered**. Le `focus-visible:outline-none` des primitives est une **utility Tailwind** (`@layer utilities`). En cascade CSS Layers, **non-layered bat layered** quelle que soit la spécificité → l'outline global s'appliquait TOUJOURS, en plus de la bordure du champ. La neutralisation **doit donc aussi être non-layered** : c'est l'exception compagne `.ankora-form-control-16:focus-visible` (`globals.css:421`), non-layered et plus spécifique, qui gagne proprement. Les classes `focus-visible:border-brand-600` des composants restent comme **couleur cosmétique** documentant l'intention, mais le mécanisme effectif (épaisseur ~2px + outline:none) vit centralement.

`.ankora-form-control-16` n'est porté QUE par `Input` + `SelectTrigger` → boutons, liens, tabs, checkboxes gardent la globale `*:focus-visible` intacte (anti-régression WCAG 2.4.7). Le liseré réutilise `var(--color-brand-600)` exactement comme la globale → le remap brass admin (`[data-accent='admin']`) est honoré sans effort.

### Itération du contrat (traçabilité)

1. **v1** — repos allégé `/60` : rejeté (a11y dark) → repos `border-border` plein.
2. **v2** — focus « ring seul » (`border-transparent` + ring `/30`) : rejeté (ring seul indicateur, `/30` sous WCAG 2.4.11).
3. **v3** — focus = bordure `brand-700` + ring `brand-500/50` assorti : rejeté par @thierry (le halo/ring lu comme un cadre épais).
4. **v4** (`c0adaa6`) — focus = bordure fine seule, sans ring : corrige le halo mais l'**outline global détaché** subsistait (la bordure de champ ne pouvait pas l'annuler depuis une utility layered).
5. **v5 livré** (`b0d74ce`) — neutralisation **centrale non-layered** de l'outline global sur les champs + liseré ~2px (`border-color` + `box-shadow 1px`, no-reflow) + carve-out `aria-invalid`. **Un seul signal, en runtime.**

---

## 3. Fichiers modifiés (commit `b0d74ce`)

- `src/app/globals.css` — **mécanisme central** : exception non-layered `.ankora-form-control-16:focus-visible` (`outline:none` + carve-out `:not([aria-invalid])` → `border-color brand-600` + `box-shadow 0 0 0 1px brand-600`). C'est le cœur du fix.
- `src/components/ui/input.tsx` — classes focus cosmétiques `focus-visible:border-brand-600 focus-visible:outline-none` + ring danger ré-ancré sur `aria-invalid` + JSDoc pointant vers le mécanisme central.
- `src/components/ui/select.tsx` (SelectTrigger) — miroir 1:1 + `transition-colors`.
- `src/components/ui/__tests__/input.test.tsx` — tests focus/hover/aria-invalid (présence classes + attribut DOM e2e).
- `src/components/ui/__tests__/select.test.tsx` — tests contrat trigger + `aria-invalid` forwarding.

---

## 4. Définition de DONE — preuves

| #   | Critère                              | Statut | Preuve                                                                                                                            |
| --- | ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CI tous verts                        | ✅     | Playwright E2E ✅ · Lint+Typecheck+Tests ✅ · Security ✅ · **check-sourcery-resolved ✅** · Vercel ✅                            |
| 2   | Sourcery silencieux (dernier commit) | ✅     | Suggestions tests (`aria-invalid` attribut DOM) traitées dans `95e5e62` ; review threads **résolus** (0 non résolu sur `b0d74ce`) |
| 3   | Review humaine                       | ⏳     | Branch protection n'exige pas d'approbation formelle ; @thierry arbitre le merge                                                  |
| 4   | Pas de conflit avec main             | ✅     | `mergeStateStatus = CLEAN` / `mergeable = MERGEABLE`                                                                              |
| 5   | Rapport final                        | ✅     | Ce document (réécrit sur le contrat réel `b0d74ce`)                                                                               |

### Preuve a11y du rendu FINAL — live-test @cowork sur `b0d74ce` (critère bloquant)

✅ **PASS** — vérifié en **runtime** par @cowork sur `b0d74ce`, **clair ET sombre** (re-vérifié après stabilisation `transition-colors`) :

- focus champ = `border-color brand-600` + `box-shadow 0 0 0 1px brand-600` + `outline: none` → **un seul liseré ~2px émeraude**, identique clair + sombre, **zéro double/triple cadre** ;
- hover isolé conforme ;
- l'outline détaché global est bien neutralisé sur les champs.

> ⚠️ Les audits `ui-auditor` / `mobile-ios-auditor` ci-dessous ont tourné sur le contrat **v3** (brand-700 + ring-500/50). Le rendu final `b0d74ce` est un liseré `brand-600` **opaque** (pas un ring translucide `/30`–`/50`) → strictement **plus contrasté** que tout contrat à ring translucide précédemment audité. La preuve a11y du rendu final est le **live-test runtime @cowork** ci-dessus. Contraste `brand-600` dark ≈ 3.79:1 (cf. [THI-304](https://linear.app/thierryvm/issue/THI-304) Lot C), liseré doublé ~2px par le `box-shadow` assorti.

Carve-out `aria-invalid` (ring danger préservé au focus) + non-régression des non-champs (globale `*:focus-visible` `globals.css:394-398` **inchangée**, mécanisme additif) : vérifiés en **code** par @cowork, structurellement sûrs (couverts par tests pour `aria-invalid`).

### QA agents

| Agent                | Verdict                  | Contrat audité | Note                                                                                                                                     |
| -------------------- | ------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-reviewer`      | ✅ APPROVED WITH CHANGES | v5 (`b0d74ce`) | 3 hard gates traités : `.drw-input` hors scope tracé (THI-304 Lot D), carve-out `aria-invalid`, contraste admin = même token             |
| `ui-auditor`         | ✅ PASS                  | v3             | Audité sur brand-700 + ring/50. Rendu final = liseré brand-600 opaque, plus contrasté → conformité confirmée par live-test runtime       |
| `mobile-ios-auditor` | ✅ PASS_WITH_NOTES       | v3             | BLOCK levé : dépendance `:focus-visible` au tap iOS = dette **pré-existante** (THI-304 Lot B), non régressée. iOS 16px / F3 / F4 intacts |

### Tests

- `vitest` ciblé `input.test.tsx` + `select.test.tsx` : **15/15** pass.
- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur.
- `npm run build` : OK (CSS central compile, règle `globals.css:421` présente).

---

## 5. Hors scope (tracé)

**Le « double cadre au repos »** (bordure card du formulaire + bordure du champ, même token `--color-border`) est un sujet **layout/card**, pas primitive champ. À traiter côté card en PR-UI-3a.

**Dette a11y focus transverse → [THI-304](https://linear.app/thierryvm/issue/THI-304)** :

- Lot A : ring `brand-500/30` seul sous WCAG 2.4.11 sur `button.tsx`, `dialog.tsx` (close), `ExpenseEditDrawer.tsx`.
- Lot B : fallback `:focus` (en plus de `:focus-visible`) pour iOS WebKit au tap — dette pré-existante.
- Lot C : note contraste dark `border-brand-700` + doc `token-usage.md`.
- **Lot D : `.drw-input` (Drawer atom, `atoms.css:351`) hors périmètre du fix central** — primitive de champ parallèle qui ne porte pas `.ankora-form-control-16` ; son `:focus` utilise `brand-500` + ring `/0.22`, à aligner sur le contrat champ canonique. Déjà iOS-safe (`:focus`).

---

## 6. Suite du lot UI

THI-298 (PR-UI-1) ✅ → THI-299 → THI-300 → THI-201 (UI-3b) → THI-301 (DateField). Une PR à la fois.
