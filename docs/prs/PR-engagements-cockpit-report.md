# PR — Engagements dans le cockpit (ADR-021) — Rapport

- **PR** : #236 · branche `feat/engagements-cockpit`
- **Épic** : « Dettes & échéanciers » (suite PR-1/2/3 mergées)
- **ADR** : [`docs/adr/ADR-021`](../adr/ADR-021-engagements-dans-le-cockpit.md) · `plan-reviewer` ✅ APPROVED

## Objectif

Réconcilier le chiffre-héros « Reste disponible » du dashboard avec la carte
« Mes engagements ». Avant : le hero ignorait les engagements ; la carte les
affichait dus. Deux chiffres contradictoires. Après : les mensualités lissées
des engagements actifs sont déduites du reste disponible (one-off exclus).

## Scope livré

| Task | Contenu                                               | Tests              |
| ---- | ----------------------------------------------------- | ------------------ |
| 1    | `engagementsMensuelsLisses` (domaine pur)             | 15                 |
| 2-3  | `calculerSituationDuMois` déduit engagements + export | 11 (8 non-rég + 3) |
| 4    | Hero : FlowRow + segment AllocationBar + prop         | 9                  |
| 5    | i18n `flow.engagements` + `barAriaEngagements` × 5    | parité 5/5         |
| 6    | Wiring `page.tsx` (même read que la carte)            | —                  |

## Définition de DONE — état

| #   | Critère               | État                                                                                                                  |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | CI verte              | 🟡 **bloqué par `Security audit`** (voir ci-dessous) — Lint/Typecheck/Tests ✅, E2E ✅, Sourcery review ✅, Vercel ✅ |
| 2   | Sourcery silencieux   | ✅ 2 commentaires traités (tests nudge/aria + typo), threads résolus                                                  |
| 3   | Reviews résolues      | ✅                                                                                                                    |
| 4   | Pas de conflit `main` | ✅ (branché sur `origin/main` à jour)                                                                                 |
| 5   | Rapport livré         | ✅ (ce fichier)                                                                                                       |

## Evidence

- `npm run typecheck` ✅ · `npm run lint` ✅ 0 erreur · `lint:use-server` ✅
- **1594+ tests verts** (suite complète), dont +25 nouveaux sur cette PR
- **`financial-formula-validator` : GO** — équivalence arithmétique de la fenêtre
  prouvée, float-safe (Decimal à la frontière cockpit), edge `installmentsTotal===1`
  exclu (fallback prouvé mort par contrainte DB + Zod), non-régression exacte à
  `engagementsMensuels=0`.
- **WCAG 1.4.11 (vérifié inline)** : segment `muted-foreground` vs piste =
  **6.92:1** light / **12.02:1** dark ; vs voisins 3.04 / 3.19 → ≥ 3:1. Info
  jamais couleur-seule (dot + label + `<dl>` + `role=img` aria-label).
  `ui-auditor` a calé sur une limite de session (reset 17h) — à relancer pour
  doublon si souhaité.

## ⛔ Blocage CI — `Security audit` (hors scope, escaladé @thierry)

`npm audit` remonte **4 vulnérabilités (2 low, 2 high)** dans des dépendances
**transitives** : `body-parser` (DoS), `esbuild` (dev-server Windows), `sharp`/
libvips (CVE-2026-33327/33328/35590/35591).

- **Prouvé non lié à cette PR** : le diff ne touche **aucun** `package.json` /
  `package-lock.json` ; les mêmes 4 vulns sont présentes sur `main` (advisories
  CVE-2026 publiés depuis le merge #235 de ce matin, qui passait).
- **Fix = PR sécurité dédiée** : `npm audit fix` (body-parser + esbuild, non
  breaking) + `sharp@0.35.3` (**breaking** — `sharp` sert à `npm run icons`, à
  re-tester ; validation @thierry requise pour un upgrade breaking).
- **Ne pas bundler ici** (banned-list : deps/infra hors PR feature).

**#236 est fonctionnellement DONE ; elle ne peut merger qu'une fois la PR
sécurité mergée en amont** (ou l'advisory triagé). Décision @thierry attendue.

## Follow-ups tracés (hors PR)

1. **Dérive d'ancrage simulateur** (flag HAUT `financial-formula-validator`) :
   le simulateur ancre son « Actuel » sur la réserve **charges-only**
   (`simulation.ts`), alors que le hero affiche désormais l'engagement-adjusted.
   Divergence de `engagementsMensuels` dès qu'un engagement existe. → recâbler
   le simulateur sur le même figure (ou helper partagé) + test anti-dérive.
2. **PR sécurité npm audit** (voir blocage ci-dessus).
3. **Property-test roundtrip** `installmentAmount·step/step` par fréquence
   (nice-to-have, `financial-formula-validator`).
