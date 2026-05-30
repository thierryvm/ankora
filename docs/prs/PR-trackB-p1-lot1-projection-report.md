# PR — Track B P1 lot 1 : projection 6 mois + cumul humain (simulateur)

> **Branche** : `feat/simulateur-projection-6m-cumul` (off `main`) · **Date** : 2026-05-30 · **Auteur** : @cc-ankora (Opus 4.8)
> **Kickoff** : @cowork — Track B P1 lot 1 (suite P0 #199 + #202)

## Contexte

Le P0 du simulateur réserve libre est live (#199 recâblage + #202 hotfix crash RSC). Le drawer affiche « Reste disponible : X → Y /mois » (flux mensuel) + économie annuelle + ancre effort lissé. Ce lot ajoute la **dimension temps/stock** que le hero ne porte pas : la projection cumulée sur 6 mois (S3) et sa traduction humaine (S4).

## Décision modèle (verrouillée @thierry, 2026-05-30)

**Option 1 — « Cumul marginal du choix »** (sur 3 modèles présentés).

- Axe = € **cumulés** en réserve libre (stock), distinct du hero qui montre le **flux** €/mois.
- Ligne « Sans changement » = **0 plat** ; ligne « Avec ce choix » = `monthlyDelta × mois` (mois 1..6). L'écart **est** l'épargne cumulée.
- S4 : « En 6 mois, +X € en réserve libre » avec X = `monthlyDelta × 6`.

**Pourquoi vs les 2 autres** (rationale @cowork) : seul modèle qui livre le cumul **sans franchir FSMA**. Option 2 (réserve absolue style landing) suppose épargne = 100 % du reste/mois → projection comportementale du patrimoine (zone grise ; le caveat démo de la landing ne se transfère pas au live). Option 3 (2 lignes plates) = redondant avec le hero, ne sert pas S4. On ne mélange pas flux et stock sur un même axe. La constante `RESERVE_BASELINE_6M` de la landing est un **artefact démo fabriqué** et n'est PAS réimportée dans le cockpit authentifié.

## Gouvernance pré-code

- **Phase 0 Model check** : Opus 4.8 ✅.
- **Code-verify** : `projectCumulative` déjà présent/testé ; calcul simulateur 100 % client-side (frontière RSC déjà couverte #202) ; zéro dépendance graphique (recharts/visx/victory/d3 absents) → SVG inline (budget 0 €).
- **plan-reviewer** : 🟡 APPROVED WITH CHANGES (4 points) → ✅ **APPROVED** après révision (décision delta=0 résolvant 3 points d'un coup).

## Scope livré

- **S3** — Mini-courbe SVG sparkline dans la carte Impact (branche réserve libre uniquement) : baseline plate 0 « Sans changement » (pointillé) + ligne scénario `monthlyDelta × mois` « Avec ce choix » (aire remplie). Origine 0 explicite (les 2 lignes divergent depuis un point commun). Échelle gérant les 2 signes (annuler/renégocier-baisse → montant + ; ajouter/renégocier-hausse → montant −, courbe descendante).
- **S4** — Phrase cumul humaine : « En 6 mois, +X € en réserve libre » (gain) / « − X € » (perte) / « Aucun impact sur 6 mois » (delta = 0).
- **Edge delta = 0** : sparkline supprimée (rien à tracer, élimine le domaine SVG dégénéré `[0,0]` → NaN) + ligne neutre. Le hero affiche déjà X → X.

**Hors scope (lots suivants)** : curseur + contexte marché (S5), DateField, liquid-glass, half-sheet. Non touchés.

## Changements (fichiers)

| Fichier                                                  | Changement                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/domain/simulation.ts`                           | +`cumulativeReserveSeries(monthlyDelta, months)` pure, délègue à `projectCumulative` (signe préservé, garde `months >= 0`).                      |
| `src/lib/domain/__tests__/simulation.test.ts`            | +7 tests (série +/−/0, months=0, months<0, **oracle** `series[5].eq(projectCumulative(...))`, **régression frontière** depuis `money(number)`).  |
| `src/lib/domain/__tests__/simulation.property.test.ts`   | +3 properties (longueur, égalité point-à-point à l'oracle, throw months<0).                                                                      |
| `src/app/[locale]/app/simulator/SimulatorProjection.tsx` | **Nouveau** sous-composant `'use client'` : sparkline + cumul + a11y. Dérive `deltaPositive`/`isZero` en interne (single source).                |
| `src/app/[locale]/app/simulator/SimulatorClient.tsx`     | Intégration **additive** dans le `else` hero (entre épargne annuelle et ancre). `deltaPositive` l.147 et branche `incomeMissing` **intouchées**. |
| `messages/{fr-BE,nl-BE,en,de-DE,es-ES}.json`             | +7 clés `app.simulator.impact` (parité 5/5, placeholders intacts).                                                                               |
| `e2e/dashboard-simulator-drawer.spec.ts`                 | +3 assertions (projection + cumul rendus, cumul contient « 240 » sur annulation 40 €/mois).                                                      |

## Contraintes respectées

- **FSMA** : arithmétique pure sur la donnée saisie, zéro conseil/montant suggéré. Pas de projection comportementale du patrimoine.
- **Frontière RSC** : aucun `Decimal`/`Money` sérialisé server→client ; `cumulativeReserveSeries` tourne dans le client depuis un `monthlyDelta` déjà côté navigateur. Test de régression dédié.
- **Budget 0 €** : SVG inline, zéro dépendance ajoutée.
- **a11y** : `<svg role="img" aria-label>` = équivalent texte « de 0 € à {to} » ; SVG légende `aria-hidden` ; phrase cumul = vrai texte. **Fix WCAG AA** : le petit texte coloré (cumul text-sm, légende text-xs) passe en `text-foreground`/`text-muted-foreground` (success #059669 = 3.77:1 sur card claire ; danger #dc2626 = 3.59:1 sur card sombre → sub-4.5:1) ; la couleur gain/perte vit dans la sparkline (objet graphique, ≥3:1).

## Agents QA

| Agent                       | Verdict                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| plan-reviewer               | ✅ APPROVED (après révision)                                                                                                         |
| financial-formula-validator | ✅ PASS (drift-free par construction `times(i+1)`, oracle verrouillé)                                                                |
| i18n-auditor                | ✅ PASS_WITH_NOTES (parité/placeholders OK ; notes glossaire v1.2 + résidus `landing.*` préexistants hors scope)                     |
| dashboard-ux-auditor        | ✅ PASSE (tokens, hiérarchie, mobile-first OK)                                                                                       |
| ui-auditor                  | ✅ PASS_WITH_NOTES → finding a11y-high **corrigé** (cf. fix WCAG ci-dessus) ; `<title>` SVG optionnel non retenu (aria-label suffit) |

## Quality gates locaux

- `npm run typecheck` ✅ · `npx eslint` (fichiers changés) ✅ · `npm run lint:use-server` ✅
- `npx vitest run` ✅ **1367 / 1367** (108 fichiers) — dont 36 sur `simulation`.
- Playwright : assertions ajoutées (tournera en CI ; nécessite Supabase admin en local).

## DoD — état

1. ⏳ CI verte — à confirmer après push.
2. ⏳ Sourcery silencieux — à vérifier après push.
3. ⏳ Reviews humaines.
4. ✅ Pas de conflit (branche off `main` à jour).
5. ⏳ **Live-test intégration PASS** (piloté @cowork) — ouvrir le drawer, sélectionner une charge, voir courbe + cumul rendre sans crash sur vraie donnée. **Merge bloqué tant que non PASS** (doctrine post-#199).

## Notes pour @cowork (non bloquant)

- **Micro-copy FR** des 7 clés à relire (FSMA + qualité) avant merge — draft factuel fourni.
- **Glossaire v1.2** : entrée « réserve libre » à formaliser (i18n-auditor) — surface séparée.
- **Observation systémique a11y** (hors scope, à tracer) : `--color-success` #059669 = 3.77:1 sur card claire et `--color-danger` #dc2626 = 3.59:1 sur card sombre sont **sous 4.5:1** → tout futur petit texte coloré échouera AA. Les usages existants (hero text-xl, épargne text-lg = grand texte, seuil 3:1) restent conformes. Un override dark-mode des tokens (`success→#34d399`, `danger→#f87171`) règlerait le système mais a un blast radius app-wide → PR a11y dédiée recommandée, pas ici.
