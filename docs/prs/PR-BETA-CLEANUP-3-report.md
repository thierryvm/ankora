# PR-BETA-CLEANUP-3 — UX cohérence (parité Dépenses, drop ".00", focus rings F2)

**Branch** : `feat/beta-cleanup-3-ux-coherence`
**Date** : 2026-05-27
**Pilote** : @cc-ankora (Claude Opus 4.7)
**Demandeur** : @thierry via @cowork prompt 27/05 — smoke prod 26/05 23:50.

---

## Pourquoi cette PR

3 bugs UX indépendants détectés au smoke prod 26/05 post PR-BETA-CLEANUP-2, **indépendants du 503 reste-à-vivre** (Phase 1 du prompt → diagnostic-only, livré séparément). Ces 3 fixes sont shippables même tant que l'investigation Vercel runtime n'a pas tranché.

| Bug | Symptôme                                                                             | Source                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a  | `/app/expenses` n'a pas de bouton Modifier, date affichée en ISO brut (`2026-05-15`) | Asymétrie avec `/app/charges` (PR-BETA-CLEANUP-2 a livré le pattern Modifier sur Charges seulement)                                            |
| 2b  | Input "Ajuster reste à vivre" affichait `500.00` au lieu de `500`                    | `initialResteAVivre.toFixed(2)` dans `AjusterResteAVivreDrawer.tsx` lignes 49 + 62                                                             |
| 2c  | "Bordures énormes parfois blanches" sur Charges, Dépenses ET forms d'auth            | `ring-2 ring-offset-2 ring-brand-600` survivants sur Select/Button/Dialog Close — la migration F2 du 2026-05-07 n'avait touché que `Input.tsx` |

---

## Phase 1 — Diagnostic 503 (livré, code-free, gate respectée)

Synthèse (livrée au tour précédent) :

| Hypothèse                                                                             | Verdict                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| RLS UPDATE manquante sur `workspace_settings`                                         | **❌ Éliminée** — `settings_editor_update` policy présente ligne 85 du migration `20260416000002_rls_policies.sql` |
| Server Action logique cassée                                                          | **❌ Éliminée** — outer try/catch, `isNextControlFlowError` propage, toutes les branches retournent `{ok}` typé    |
| `Proxy matcher` intercepte/casse POST `/app`                                          | **🟡 Improbable** — matcher ne fait pas de redirect sur path déjà localisé, à valider via Vercel runtime logs      |
| Cold-start crash module init avant try/catch (`requireUserWithWorkspace` outside try) | **🟢 Hypothèse la plus plausible** — pas vérifiable sans logs runtime                                              |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` manquante                                        | **❌ Éliminée** — ajoutée hier (`fd42e0a`) + fresh build                                                           |

**Gate respectée** : aucun hotfix #5 prescrit sans logs runtime. La Phase 2 ci-dessous est **indépendante** du 503 — elle améliore l'UX hors-Server-Action.

---

## Phase 2 — Scope livré

### 2a — Parité Dépenses ↔ Charges

**Fichiers** :

- `src/app/[locale]/app/expenses/ExpenseEditDrawer.tsx` (nouveau)
- `src/app/[locale]/app/expenses/ExpensesClient.tsx` (refactor : bouton Modifier + date locale)

- Copie 1:1 du pattern `ChargeEditDrawer` (PR-BETA-CLEANUP-2) : slide-from-right desktop / `h-dvh` mobile, re-seed synchrone via `seedId` (pas de `setState-in-effect`), doctrine fail-loud PR-BETA-3 hotfix #3 (`isNextControlFlowError(err) → throw err`, toast sur `{ok:false}` ou exception, drawer reste OUVERT pour retry)
- Champs édités : `label`, `amount`, `occurredOn` — passés à `updateExpenseAction(id, input)` (existe déjà, schema `expenseUpdateSchema` partial)
- Liste : `formatDate(e.occurredOn, locale, 'medium')` remplace l'ISO brut `{e.occurredOn}` (ex fr-BE : "15 mai 2026" au lieu de "2026-05-15")
- Bouton Modifier (icône Pencil) + bouton Supprimer alignés horizontalement
- ARIA labels `editAria` + `deleteAria` avec interpolation `{label}`

**Zéro Server Action backend touché** — `updateExpenseAction(id, input)` existe depuis PR-D4 ligne 75 de `expenses.ts`.

### 2b — Drop ".00" sur AjusterResteAVivreDrawer

**Fichier** : `src/components/dashboard/AjusterResteAVivreDrawer.tsx`

```diff
-  const [draftStr, setDraftStr] = useState(initialResteAVivre.toFixed(2));
+  const [draftStr, setDraftStr] = useState(formatInitialAmount(initialResteAVivre));
```

Nouveau helper local `formatInitialAmount(value)` en bas de fichier :

- Entier (500, 0, 1234) → `"500"`, `"0"`, `"1234"`
- Fractionnel (425.50, 162.34) → `"425.50"`, `"162.34"` (préservation centimes)
- `NaN` / `!Number.isFinite` → `"0"` (défensif)

**Ne touche PAS `formatCurrency` global** — `formatCurrency` reste `1 234,56 €` partout dans le dashboard (Bloc 2, Santé Provisions, etc.). Fix ciblé sur le seul input drawer.

### 2c — Focus rings : Select + Button + Dialog Close alignés sur pattern F2

**Diagnostic source unique** :

- `src/components/ui/input.tsx` lignes 11-14 documente le pattern F2 (2026-05-07) : `ring-brand-500/30` à 30% opacité, **no offset**. Raison : `ring-offset` adopte la couleur du background, et sur dark theme `--color-background = navy → ring-offset = navy → halo entre ring-brand-600 et l'élément` = effet "thick white outline".
- 3 UI primitives partagées avaient survécu à la migration F2 : `SelectTrigger` (line 23), `Button` (line 24 via `cva`), `DialogPrimitive.Close` (line 46).

**Fix appliqué aux 3 primitives** :

```diff
-  focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2
+  focus-visible:ring-2 focus-visible:ring-brand-500/30
```

Pourquoi pas tout d'un coup (HeaderNav, BrandHomeLink, ConsentBanner, ProchainesFacturesCard, MktNav, MktFooter, ScrollToTop) : ce sont des **call-sites** locaux, pas des UI primitives. Une PR cleanup transverse séparée s'occupera des call-sites sans changer la doctrine. Cette PR ne touche QUE les 3 primitives partagées qui propagent le bug à tous les forms (charges, dépenses, auth, dashboard).

### i18n 5 locales (fr-BE / en / nl-BE / de-DE / es-ES)

Nouvelles clés `app.expenses.*` × 5 locales :

- `editAria` (avec `{label}`)
- `toastUpdated`
- `drawer.{title, save, saving, cancel, errorGeneric}`

Test parity 5 locales intégré dans `ExpensesClient.test.tsx`.

---

## Tests

### Vitest — **1334 passing** (+13 nouveaux par rapport à 1321 PR-BETA-CLEANUP-2)

- `ExpensesClient.test.tsx` (nouveau, 7 cas + parity 5 locales) :
  - Liste : date locale-aware (4-digit year présent, pas l'ISO brut)
  - Modifier + Supprimer buttons rendered avec aria-label `Modifier {label}`
  - Drawer : open avec pré-remplissage, save → updateExpenseAction + toast success + drawer close + router.refresh
  - Drawer : `{ok:false}` → toast error + drawer stays open + pas de refresh
- `AjusterResteAVivreDrawer.test.tsx` (+2 nouveaux cas) :
  - Integer (500) → input value `"500"` (pas `"500.00"`)
  - Fractional (425.5) → input value `"425.50"` (2 décimales préservées)
  - Zero → `"0"` (pas `"0.00"`)

### Quality gates ✅

`lint` 0 err · `lint:use-server` ✅ · `typecheck` 0 err · `test` **1334 passing** · `build` ✅

---

## Décisions techniques et arbitrages

| Sujet                                  | Décision                                        | Justification                                                                                                                     |
| -------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ExpenseEditDrawer scope                | Édite `label`, `amount`, `occurredOn` seulement | Parité avec form add. `note` non géré (rare, peut être ajouté en follow-up). `paidFrom`, `categoryId` non touchés (out-of-scope). |
| Drop ".00" : seuil de décision         | Helper teste `Number.isInteger(value)`          | Plus propre que `value % 1 === 0` (gère NaN défensivement)                                                                        |
| `formatCurrency` global                | **Pas touché**                                  | Le reste du dashboard dépend de `1 234,56 €` complet. Fix ciblé sur l'input drawer uniquement.                                    |
| Call-sites focus ring (HeaderNav etc.) | **Hors-scope**                                  | Ce sont des appels locaux, pas une UI primitive. PR cleanup transverse dédiée — ne change pas la doctrine appliquée ici           |
| `currencyFormatter` 30% opacity        | Inchangé                                        | Ring-brand-500/30 sur le pattern F2 d'Input — déjà éprouvé sur Input depuis 2026-05-07, doctrine validée                          |
| 503 reste-à-vivre                      | **Non touché**                                  | Phase 1 = diagnostic seulement (gate prompt). Tout fix code attendrait des logs runtime Vercel.                                   |

---

## Files

### Nouveaux (3)

- `src/app/[locale]/app/expenses/ExpenseEditDrawer.tsx`
- `src/app/[locale]/app/expenses/__tests__/ExpensesClient.test.tsx`
- `docs/prs/PR-BETA-CLEANUP-3-report.md`

### Modifiés (10)

- `src/app/[locale]/app/expenses/ExpensesClient.tsx` (bouton Modifier + date locale + drawer integration + fail-loud doctrine)
- `src/components/dashboard/AjusterResteAVivreDrawer.tsx` (helper `formatInitialAmount` drop ".00")
- `src/components/dashboard/__tests__/AjusterResteAVivreDrawer.test.tsx` (3 tests updated/added)
- `src/components/ui/select.tsx` (focus ring F2)
- `src/components/ui/button.tsx` (focus ring F2)
- `src/components/ui/dialog.tsx` (focus ring F2 sur Close)
- `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` (clés `app.expenses.editAria/toastUpdated/drawer.*`)

---

## Smoke test @thierry POST-merge

### /app/expenses

- [ ] Liste : la date complète affiche "15 mai 2026" au lieu de "2026-05-15"
- [ ] Bouton Modifier (Pencil) visible sur chaque row à côté du Supprimer
- [ ] Tap Modifier → drawer slide-in pré-rempli (label + amount + date)
- [ ] Changer montant + Save → toast vert + drawer ferme + liste reflète la nouvelle valeur

### /app cockpit

- [ ] Tap "Ajuster ce mois" sur la card Capacité → drawer ouvre avec **"500"** (pas "500.00")
- [ ] Si valeur fractionnée (ex 425.50) → drawer affiche **"425.50"** (préservation 2 décimales)

### Focus rings (dark theme)

- [ ] Tab sur form charges / expenses / auth → focus ring brand-500 à 30% opacité, **sans halo blanc/épais**
- [ ] Tab sur n'importe quel Button (toutes variantes) → idem
- [ ] Tab sur close du Dialog (Cookies preferences) → idem

---

## Hors-scope (à arbitrer séparément)

- Investigation 503 reste-à-vivre — **gate respectée**, attend logs runtime Vercel
- Focus ring sur call-sites (HeaderNav, BrandHomeLink, ConsentBanner, MktNav, etc.) — PR cleanup transverse dédiée
- Édit `categoryId` / `note` / `paidFrom` dans ExpenseEditDrawer — follow-up si user demande
- Pareil pour ChargeEditDrawer (paymentMonths edit avancé) — déjà couvert par PR-BETA-CLEANUP-2

---

## DoD 5/5 (état initial post-push)

1. ⏳ CI verte (à valider sur PR ouverte)
2. ⏳ Sourcery silent (re-fetch après ~3-5 min post-push)
3. ⏳ @thierry approval (humain)
4. ✅ 0 conflit avec main (branche depuis `00b5b9d`)
5. ✅ Rapport `docs/prs/PR-BETA-CLEANUP-3-report.md` (ce fichier)
