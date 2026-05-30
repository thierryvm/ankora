# PR-THI-195-v2 — Simulateur what-if recâblé sur la réserve libre

> **Branche** : `feat/thi-195-simulator-drawer` (amende PR #199, gelée) · **Date** : 2026-05-30 · **Auteur** : @cc-ankora (Opus 4.8)
> **Spec d'entrée** : [`docs/design/audit-simulateur-nav-2026-05-30.md`](../design/audit-simulateur-nav-2026-05-30.md) (@cowork)

## Contexte

PR #199 livrait un drawer what-if techniquement correct (a11y/focus-trap/scroll-lock smoke-testés) mais qui **ne tenait pas la promesse de la landing** : défaut absurde « Annuler le Loyer », impact cadré sur l'« effort financier » au lieu de la **réserve libre** (métrique signature), et un « +37,26 %/mois » faux-ami. Cette PR amende #199 pour le scope **P0** de l'audit.

## Décisions verrouillées (D1–D5, @cowork)

| #   | Décision                                                                                           | Implémentation                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Recâbler le `SimulatorClient` **partagé** une fois (drawer + route `/app/simulator`)               | Un seul composant modifié, les 2 surfaces héritent                                                                                                                                           |
| D2  | Réserve libre = **`resteDisponible`** = Revenus − Effort lissé (PAS `capacite`)                    | `resteDisponibleView(revenus, result)` ; libellé « Reste disponible » aligné sur le hero `CapaciteEpargneCard`                                                                               |
| D3  | Unifier le lissage ; « Actuel » simulateur == « Effort lissé » dashboard                           | Code-verify : `budget.monthlyProvisionTotal` ≡ `effortFinancierLisse` **numériquement** → recâblage = framing, pas de réécriture math. **Test garde-fou d'équivalence** ajouté (anti-drift). |
| D4  | Scénarios **Option D** : pas de chips catégorie (Télécom/Énergie inexistantes, pas de slug stable) | Défaut = placeholder guidé « Choisis une charge à simuler » (zéro auto-sélection loyer) + dropdown sur charges réelles + copy d'exemple                                                      |
| D5  | FSMA : aucun montant suggéré                                                                       | « Annuler » = montant plein ; « Renégocier » = montant saisi par l'user                                                                                                                      |

## Scope P0 livré

- **S1** — Défaut « Annuler le Loyer » supprimé → placeholder guidé (Q3, validé plan-reviewer).
- **S2** — Impact recâblé sur la **réserve libre** : ligne héros « Reste disponible : {actuel} → {projeté} » + économie annuelle + ancre sous-texte « Effort lissé ». Suppression du `%/mois` faux-ami.
- **§2 audit** — Ancrage des chiffres ; libellé « Reste disponible » identique au hero (parité 5 locales).
- Edge **revenus non configuré** (route autonome sans garde `missingSetup`) : hint + CTA `/app/accounts` au lieu d'une réserve négative trompeuse.

**Hors scope P0 (= P1, non faits)** : projection 6 mois, curseur, contexte marché, chips Option B/C, redesign drawer, liquid glass, DateField, IA nav.

## Changements (fichiers)

- `src/lib/domain/simulation.ts` — retrait `changePercent` (type + calcul) ; ajout helper pur `resteDisponibleView`.
- `src/lib/domain/__tests__/simulation.test.ts` — retrait assertion `changePercent` ; +6 tests (resteDisponibleView cancel/negotiate/add/revenus=0/invariance + **équivalence `monthlyProvisionTotal ≈ effortFinancierLisse`** sur fixture mixte + toutes fréquences + inactive).
- `src/app/[locale]/app/simulator/SimulatorClient.tsx` — prop `revenus` ; carte Impact recâblée ; défaut placeholder ; edge `revenus ≤ 0` ; pont `sr-only` « de X à Y » ; CTA `min-h-11`.
- `src/app/[locale]/app/simulator/page.tsx` + `src/app/[locale]/app/page.tsx` — call-sites passent `revenus`.
- `src/components/dashboard/SimulatorDrawer.tsx` — prop `revenus`.
- `src/components/dashboard/__tests__/SimulatorDrawer.test.tsx` — mock `@/i18n/navigation`, prop `revenus`, test Q3 (placeholder guidé).
- `e2e/dashboard-simulator-drawer.spec.ts` — +2 tests (framing « Reste disponible » avec revenus seedés ; income-hint sans revenus).
- `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` — clés `app.simulator.impact` recâblées (parité 5/5, `monthlyChange` retiré).

## Agents QA

| Agent                                | Verdict                       | Notes                                                                                                                                   |
| ------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `financial-formula-validator` (opus) | **PASS**                      | Math correcte, Decimal partout, équivalence D3 en place et non négociable, 0 % faux-ami.                                                |
| `dashboard-ux-auditor`               | **GO**                        | 7/7 checks simulateur v2 ; parité libellé hero confirmée 5 locales.                                                                     |
| `ui-auditor`                         | **PASS_WITH_NOTES** → corrigé | F1 sr-only « de X à Y » **corrigé** ; F3 cible tactile CTA `min-h-11` **corrigé** ; F2 (contraste dark) → **différé** (cf. ci-dessous). |
| `feature-dev:code-reviewer`          | 2 findings → traités          | [1] test branche revenus=0 **ajouté** (e2e) ; [2] garde `!reserveView` = narrowing TS, **commenté** (le retirer casse le typecheck).    |

### Finding différé (hors scope, à tracker)

**F2 — `text-success` / `text-danger` borderline/échec en dark mode** (`globals.css`, `#059669`/`#dc2626` sur `#111a2e`). **Systémique au design-system** : ces tokens sémantiques sont utilisés dans toute l'app (CapaciteEpargneCard, cards plan, etc.), **pas introduit par cette PR**. Corriger les overrides dark dans `globals.css` impacte des dizaines de composants → PR a11y dédiée (famille THI-202). Documenté ici + handoff.

## Évidence DoD

| #   | Critère                                                 | État                                                                                               |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | CI verte (Lint, Typecheck, Tests, E2E, Security, Build) | ⏳ après push — local : `typecheck` ✅, `eslint` ✅, `lint:use-server` ✅, **`test` 1356/1356 ✅** |
| 2   | Sourcery silencieux sur le dernier commit               | ⏳ après push                                                                                      |
| 3   | Reviews humaines résolues (@thierry)                    | ⏳                                                                                                 |
| 4   | Pas de conflit avec main                                | ✅ (branche rebasée sur `7e0fedc`)                                                                 |
| 5   | Rapport livré                                           | ✅ (ce fichier)                                                                                    |

**Local evidence** : `npm run typecheck` → 0 erreur · `npm run test` → 1356 passed · parité i18n 5/5 (`monthlyChange` orphelin = 0).
