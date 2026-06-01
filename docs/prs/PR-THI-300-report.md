# PR-THI-300 (PR-UI-3a) — Liste des charges : groupement par fréquence + totaux + flatten mobile

> Branche : `feat/charges-list-totals-thi-300` · Base : `main` (d571ea3) · Auteur : @cc-ankora · 2026-06-01

## Plainte @thierry

« On ne voit jamais le total des factures en bas » + cartes mobile fragmentées peu lisibles.

## Scope livré (3 piliers)

1. **Groupement par fréquence** — la liste plate devient des sections par fréquence dans l'ordre fixe `monthly → quarterly → semiannual → annual` ; groupe vide masqué. Chaque section : titre `<h2>` (`common.frequency.{freq}`) + sous-total à droite.
2. **Totaux** (Option A, validée @thierry) :
   - **sous-total brut par groupe** (somme des montants de la cadence, cohérent même-cadence), `tabular-nums` ;
   - **total global en bas** : `Effort lissé / mois` (`monthlyProvisionTotal`) + `Équivalent annuel` (`annualTotal`), calculés **server-side** (Decimal → `.toNumber()`) et passés en props `number`. **Pas** de somme brute inter-cadences (Option C interdite, FSMA).
   - Réconciliation : sous-totaux + global **tous actif-only** (sémantique `budget.ts`). La **liste reste exhaustive** (toutes les charges, aucune masquée) — décision plan-reviewer pour éviter une régression de visibilité.
3. **Flatten mobile** — le `<li>` perd `bg-card border rounded-lg p-4` → lignes plates séparées par `divide-y`, comme desktop. Conservés : grille desktop 6-col, badge fréquence THI-299, tap targets edit/delete 44px. Ajout `min-h-13` (52px) pour garantir la hauteur ≥ boutons absolute (mobile-ios-auditor F3).

## Fichiers

| Fichier                                             | Changement                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/budget.ts`                          | + helper PUR `subtotalByFrequency` (skip inactif, Decimal). Helpers existants inchangés.                                                                                                                                                    |
| `src/lib/domain/__tests__/budget.test.ts`           | + 6 tests (buckets, skip inactif, float drift, empty, **réconciliation croisée** ↔ `annualTotal`).                                                                                                                                          |
| `src/app/[locale]/app/charges/page.tsx`             | Compute subtotals + totaux server-side, `.toNumber()`, props.                                                                                                                                                                               |
| `src/app/[locale]/app/charges/ChargesClient.tsx`    | Grouping + sous-totaux + footer total + flatten + props.                                                                                                                                                                                    |
| `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json`        | + `subtotalLabel`, `totalMonthlyLabel`, `totalAnnualLabel`.                                                                                                                                                                                 |
| `e2e/charges/charges-list-{desktop,mobile}.spec.ts` | Sélecteurs `> li` → descendant ` li` ; testid périmé `charges-row-month` → `charges-row-next-due` (dette THI-281 réparée, collatérale nécessaire au nouveau DOM) ; assertions card mobile → flat ; + assertions grouping/sous-totaux/total. |

## Gouvernance

- **plan-reviewer (Opus)** : 🟡 APPROVED WITH CHANGES — les 4 points (branche step 0, liste exhaustive non filtrée, sous-totaux Decimal domaine, DoD+rapport) intégrés ; + invariant `listitem === charges.length` testé, footer hors `<ul>`, fallback boutons tranché.
- **financial-formula-validator** : PASS (math VÉRIFIÉE, réconciliation actif-only, anti-drift float prouvé). Test de réconciliation croisée ajouté sur sa reco.
- **i18n-auditor** : PASS — 3 clés propres, parité 5 locales, glossaire aligné (lissage/spreiding/smoothing/verteilt/distribución), FSMA OK. Fuites FR/EN pré-existantes nl/de/es signalées hors scope (doctrine v1.0 : seuls fr-BE+en prod-visibles).
- **ui-auditor** : PASS_WITH_NOTES — hiérarchie titres OK, tokens-only, zéro inline, role=list/listitem cohérent. F-01/F-02/F-03/F-04 = **pré-existants** (drawer role, header translucide, aria-invalid form, CardTitle div) → backlog.
- **mobile-ios-auditor** : PASS_WITH_NOTES, **aucun BLOCK** sur le chevauchement. F3 (min-h) corrigé. F1 (gap boutons 4px<8px) + F2 (autocomplete) = pré-existants → backlog mobile-polish.

## Quality gates (local, réels)

- `npm run typecheck` → 0 erreur ✅
- `npm run lint` → 0 erreur (6 warnings pré-existants, hors fichiers touchés) ✅
- `npm run lint:use-server` → ✅
- `npm run test` → **1385 passed** (full) ✅ ; ciblés budget+ChargesClient+i18n-parity → 52 passed ✅
- e2e Playwright : skippent en local (pas de Supabase service-role) → tourneront en CI.

## DoD — à finir à la reprise

1. ⏳ CI verte (6 checks) — **à vérifier après push**.
2. ⏳ Sourcery silent sur dernier commit — `gh api repos/thierryvm/ankora/pulls/<N>/comments`.
3. ⏳ Review @thierry + threads résolus.
4. ⏳ mergeStateStatus CLEAN.
5. ✅ Rapport (ce fichier).

## Live-test @thierry (à faire)

`/app/charges` iPhone (393 + 375px) clair/sombre : groupes lisibles, lignes plates non fragmentées, total visible en bas, boutons edit/delete non chevauchés, footer FR+EN non tronqué.
