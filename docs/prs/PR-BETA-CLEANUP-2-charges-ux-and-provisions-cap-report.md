# PR-BETA-CLEANUP-2 — Charges UX (paymentDay + Modifier + nextDueDate) + Santé Provisions cap 100%

**Linear** : THI-281 (Linear free tier limit atteint — backlog Obsidian)
**Branch** : `chore/beta-cleanup-2-charges-ux-and-provisions-cap`
**Date** : 2026-05-26
**Pilote** : @cc-ankora (Claude Opus 4.7)
**Demandeur** : @thierry via @cowork prompt — smoke prod 26/05 sur `/app/charges` et `/app`.

---

## Pourquoi cette PR

Smoke @thierry post-merge PR-BETA-3 a révélé **2 bugs UX indépendants** sur le cockpit user :

1. **`/app/charges`** affiche juste le mois abrégé ("JANV.") sans date complète, pas de bouton "Modifier" — seulement Supprimer
2. **`/app` cockpit** card "Santé des provisions" affiche `546%` "À jour" — math correcte mais UX trompeuse

Aucun Server Action touché → zéro risque de réintroduire l'incident 503 / NEXT_REDIRECT de PR-BETA-3.

---

## Challenge du prompt @cowork (doctrine "ingénieur partenaire d'abord")

Trois corrections de scope avant exécution :

| Prompt @cowork                                          | Réalité du code                                                     | Décision                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| "Server Action `updateChargeAction` à créer si absente" | **Existe déjà** dans `src/lib/actions/charges.ts:88` (PR-D4)        | Réutilisé tel quel                                                    |
| "Migration SQL si nécessaire pour colonne date"         | `payment_day` + `payment_months[]` existent depuis PR THI-192       | **Pas de migration**, juste exposer dans le UI                        |
| "Référence UX = ExpensesClient"                         | ExpensesClient lui-même n'a ni bouton Modifier ni date locale-aware | Au-delà de "aligner" — drawer custom créé pour Charges spécifiquement |

**Question levée à @thierry sur la sémantique "date saisie"** : ambiguë entre `created_at`, `payment_day` (jour du mois), ou `effective_from` (date d'effet). @thierry a confirmé "proche de l'option 2 (`payment_day`)" et invité à challenger via best practices. **Décision retenue** : `paymentDay` (jour du mois 1-31) + affichage de la **prochaine échéance complète** (`nextDueDateForCharge`) — pattern standard Monarch/YNAB/Linxo.

---

## Scope livré

### Bug #2 — Santé Provisions cap visuel 100% (Option C)

**Fichier** : `src/components/dashboard/ProvisionHealthGaugeCard.tsx`

```diff
- const percentLabel = Math.round(ratio * 100);  // 546% pour Thierry
+ const isOverachieving = hasTarget && ratio > 1;
+ const displayPercent = isOverachieving ? 100 : Math.round(ratio * 100);
+ const surplusOverTarget = isOverachieving
+   ? result.soldeEpargneActuel.minus(result.totalEpargneTheorique)
+   : null;
```

- KPI principal cappé à **100%** quand `solde > cible` (au lieu de 546%)
- Sub-text **"+ 1 442,42 € au-delà de la cible"** affiché en couleur success
- ProgressBar `value={Math.min(ratio, 1)}` cappée pour éviter overflow visuel
- Math interne `result.soldeEpargneActuel` / `result.totalEpargneTheorique` **inchangée** (préservation pour autres consommateurs)

**R-06 anti-culpabilisation respectée** : pas de "trop épargné", pas de "économise trop", juste factuel. Assertion testée.

### Bug #1 — Charges UX (paymentDay + nextDueDate + Modifier)

**Fichiers principaux** :

- `src/lib/domain/charges/payment-months-from-frequency.ts` (nouveau, pure)
- `src/lib/data/workspace-snapshot.ts` (type `rawCharges` étendu pour exposer `paymentDay` + `paymentMonths`)
- `src/app/[locale]/app/charges/ChargesClient.tsx` (refactor : form + liste)
- `src/app/[locale]/app/charges/ChargeEditDrawer.tsx` (nouveau, client)

#### Formulaire "Ajouter une charge"

Ajout d'un Input number **"Jour du mois"** (1-31, requis). Submit calcule désormais explicitement `paymentMonths` via le helper pur `paymentMonthsFromFrequency(frequency, dueMonth)` :

- `monthly` → `[1..12]`
- `quarterly` → `[dueMonth, +3, +6, +9]` modulo 12 (wrap année correct)
- `semiannual` → `[dueMonth, +6]` modulo 12
- `annual` → `[dueMonth]`

**Bug latent corrigé en passant** : avant cette PR, `paymentMonths` était `undefined` à la création → DB default `[1..12]` même pour une charge annuelle → `nextDueDateForCharge()` la traitait comme mensuelle. Le helper garantit maintenant la cohérence frequency ↔ schedule.

#### Liste des charges

- **Colonne `charges-row-next-due`** : affiche la **prochaine échéance complète** locale-aware via `nextDueDateForCharge(c, todayIso)` + `formatDate(iso, locale, 'medium')`. Pour Thierry en fr-BE : "5 juin 2026" au lieu de "JANV." opaque
- Fallback gracieux à `formatMonth(dueMonth, locale, 'long')` si la charge est inactive ou `paymentMonths` est vide
- Bouton **"Modifier"** (icône Pencil) ajouté sur chaque row, à côté du Supprimer
- ARIA labels `editAria` + `deleteAria` avec interpolation `{label}`

#### Drawer "Modifier la charge"

Nouveau composant client `ChargeEditDrawer.tsx` :

- Slide-from-right desktop / full-screen mobile (`h-dvh` + `sm:max-w-md`) — même idiom que `AjusterResteAVivreDrawer` de PR-BETA-3
- Pré-rempli depuis le row sélectionné (label, amount, frequency, dueMonth, paymentDay)
- Re-seed synchrone à l'ouverture (pas dans `useEffect` — évite le `react-hooks/set-state-in-effect` anti-pattern de React 19)
- ESC ferme, backdrop ferme, body scroll-lock pendant ouverture
- Submit → `updateChargeAction(id, { ...fields, paymentMonths: paymentMonthsFromFrequency(...) })`
- **Doctrine fail-loud PR-BETA-3 hotfix #3 respectée** : try/catch JS + `isNextControlFlowError(err) → throw err` (NEXT_REDIRECT propage), toast.error sur `{ok:false}` ou exception, drawer reste OUVERT pour retry sans re-saisie

#### i18n 5 locales (fr-BE / en / nl-BE / de-DE / es-ES)

Nouvelles clés :

- `app.charges.paymentDayLabel` + `paymentDayHint`
- `app.charges.editAria` (avec `{label}`)
- `app.charges.toastUpdated`
- `app.charges.drawer.{title, save, saving, cancel, errorGeneric}`
- `dashboard.health.objectifDepasse` (avec `{amount}`)

---

## Tests

### Vitest (1321 passing, +26 nouveaux)

- **`payment-months-from-frequency.test.ts`** (7 cas) : monthly→[1..12], quarterly avec wrap, semiannual avec wrap, annual single, dueMonth out-of-range défensif, ordre ascendant garanti
- **`ProvisionHealthGaugeCard.test.tsx`** (+6 cas Option C) : cap à 100%, sub-text "+X€" en couleur success, pas de sub-text à 100% pile, pas de sub-text < 100%, fixture @thierry (1766/323.58), ProgressBar clamped
- **`ChargesClient.test.tsx`** (+13 cas PR-BETA-CLEANUP-2) :
  - liste : next-due date locale-aware, Modifier + Supprimer buttons
  - form add : input paymentDay présent, action payload contient `paymentDay` + `paymentMonths`
  - drawer : open au Modifier click, pré-remplissage, save → updateChargeAction + toast success, échec → drawer reste ouvert + toast error
  - i18n parity 5 locales (paymentDay + editAria + toastUpdated + drawer.\*)

### Quality gates ✅

`npm run lint` 0 err · `npm run lint:use-server` ✅ · `npm run typecheck` 0 err · `npm run test` **1321 passing** · `npm run build` ✅

---

## Décisions techniques et arbitrages

| Sujet                               | Décision                                        | Justification                                                                                                 |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `paymentDay` input                  | Input number 1-31 requis                        | Pattern standard banking apps (Monarch, YNAB) ; couvre la sémantique "date de payement" demandée par @thierry |
| `dueMonth` conservé                 | Oui, garde le UI 1-12                           | Legacy column maintenu pendant migration `paymentMonths`-only (PR-CLEANUP-LEGACY future)                      |
| `paymentMonths` calculé client-side | Oui, via helper pur                             | Fix bug latent où DB default `[1..12]` cassait `nextDueDateForCharge` pour non-monthly                        |
| Drawer dédié vs `EditDrawer` atom   | Dédié                                           | L'atom est field-générique, ne supporte pas natively les Select shadcn ; coût isolation faible                |
| Re-seed drawer state                | Synchrone in-render (`if charge.id !== seedId`) | Évite `setState-in-effect` lint rule React 19 ; même approche que `AjusterResteAVivreDrawer`                  |
| Cap 100% Option C                   | Math interne préservée                          | `result.ratio` raw reste accessible si autre consommateur en a besoin ; seul l'affichage est cappé            |
| Migration SQL                       | **Aucune**                                      | `payment_day` + `payment_months[]` existent déjà (PR THI-192) — pas besoin de toucher le schema               |

---

## Smoke test @thierry POST-merge

### `/app/charges`

1. Form : champ "Jour du mois" visible, defaults à 1, required
2. Ajouter charge "Test" 50€ "annuel" "juin" "jour 15" → liste affiche `15 juin 2026` + bouton Modifier visible
3. Tap Modifier → drawer slide-in (right desktop / bottom-up mobile)
4. Drawer pré-rempli avec les valeurs actuelles
5. Changer montant 50→75 + Save → toast vert "Charge mise à jour" + drawer ferme + liste reflète 75€

### `/app` cockpit

1. Card "Santé des provisions" affiche **`100%`** (au lieu de `546%`)
2. Sub-text **"+ 1 442,42 € au-delà de la cible"** visible en couleur success
3. Status "À jour" toujours présent
4. ProgressBar full (cappée à 100%)
5. Pas de jugement / culpabilisation dans la copy

---

## Hors-scope (vraiment)

- Refonte ExpensesClient pour ajouter bouton Modifier — autre PR si @thierry le souhaite
- Refonte categoryId UI dans `/app/charges` — pas demandé
- Migration `dueMonth` → `paymentMonths`-only — PR-CLEANUP-LEGACY future
- Notifications J-3 / J-1 / overdue basées sur `paymentDay` — utilise déjà la colonne, pas de changement requis

---

## Files

### Nouveaux (3)

- `src/lib/domain/charges/payment-months-from-frequency.ts`
- `src/lib/domain/charges/__tests__/payment-months-from-frequency.test.ts`
- `src/app/[locale]/app/charges/ChargeEditDrawer.tsx`

### Modifiés (11)

- `src/components/dashboard/ProvisionHealthGaugeCard.tsx` (cap 100% + sub-text overflow)
- `src/components/dashboard/__tests__/ProvisionHealthGaugeCard.test.tsx` (+6 tests + parity overflow)
- `src/lib/data/workspace-snapshot.ts` (type `rawCharges` exposant `paymentDay` + `paymentMonths`)
- `src/lib/domain/charges/index.ts` (re-export utility)
- `src/app/[locale]/app/charges/ChargesClient.tsx` (form + liste refactor)
- `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx` (+13 tests + fixture étendue)
- `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` (clés paymentDay + edit + drawer + objectifDepasse)
