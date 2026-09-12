# Catégories de dépenses — spec d'exécution

> **Statut : spec validée, NON passée par `plan-reviewer`.** Rédigée le 25 août 2026
> par `spec-translator` sur demande informelle de @thierry (23 puis 25 août).
> Trois arbitrages tranchés par @thierry le 25/08, notés §3.
> **Gate avant code : `plan-reviewer` sur PR-CAT-1** (elle porte une migration).

## 1. D'où ça vient

Trois plaintes de @thierry, toutes **vérifiées en code**, aucune supposée :

1. On ajoute une catégorie mais on ne peut **ni la renommer ni la supprimer**.
   Constaté en production le 25/08 : une catégorie orthographiée « Intermaché »
   est définitive.
2. **« L'orange n'existe pas »** — littéralement exact.
3. La création de catégorie s'ouvre **dans** la feuille « Nouvelle dépense » et
   pousse les champs de la dépense hors de vue, avec deux boutons concurrents.

## 2. Faits mesurés — ne pas re-dériver

| Fait                                                                                                  | Preuve                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Créer existe, testé (14 cas)                                                                          | `src/lib/actions/categories.ts:37-136` + `__tests__/categories.test.ts`                                                                                                                                                                            |
| Renommer / supprimer **n'existent pas**                                                               | aucune occurrence de `updateExpenseCategory`/`deleteExpenseCategory` dans `src/`                                                                                                                                                                   |
| La palette est faite de **jetons sémantiques empruntés**                                              | `CATEGORY_COLOR_TOKENS` (`src/lib/domain/categories/types.ts:42-51`) = 8 noms ; `CHIP_DOT` (`AddExpenseSheet.tsx:107-116`) les mappe sur `bg-success`, `bg-warning`, `bg-danger`, `bg-info`… + un `color-mix` pour `pink`. **Aucun n'est orange.** |
| La **rampe correcte existe déjà**                                                                     | `--color-graph-1..6` + `-rest`, `globals.css:152-158` (clair) / `:290-296` (sombre), livrée par la PR 0 (#449). `:152` porte le commentaire `/* orange — the categorical one, not the warning */`                                                  |
| La migration de `color_token` vers cette rampe **n'a jamais été faite**                               | `docs/plans/cockpit-refonte-e-plan.md:170-171` le dit explicitement                                                                                                                                                                                |
| Cette palette **bloque `CategoryDonut`** (PR 2a)                                                      | même plan, §1.2b : une couleur définie comme un mélange **vers** la carte ne peut pas atteindre 3:1 **contre** elle ; et success/warning/danger sur un grand anneau **juge** (FSMA)                                                                |
| `is_system` existe en base depuis le 3 mai et **aucun code TS ne la lit**                             | `20260503000003_pr_d1_categories_enrichments.sql:24`                                                                                                                                                                                               |
| RLS asymétrique : `DELETE` n'a qu'un `USING`, `UPDATE` a aussi `WITH CHECK (created_by = auth.uid())` | `20260416000002_rls_policies.sql:64-66` (déjà noté par ADR-043 §D4)                                                                                                                                                                                |
| `color_token` est typé `string` dans les types générés                                                | `src/lib/supabase/types.ts:100,112,124` — **aucune régénération de types requise**                                                                                                                                                                 |
| Le nom d'une catégorie n'est **jamais** journalisé dans l'audit                                       | discipline testée, `categories.test.ts:262-269`                                                                                                                                                                                                    |
| `contrast-ratios.test.ts` teste la rampe CSS **sans passer par le domaine catégories**                | `:475-483` — non impacté                                                                                                                                                                                                                           |
| Un précédent de route imbriquée sous settings existe                                                  | `SettingsClient.tsx:424` → `/app/settings/deletion-status` ; aucune config `pathnames` dans `src/i18n/routing.ts`, donc **aucune modif de routing** pour un nouveau segment                                                                        |
| Le `footer` de `Sheet` est un `ReactNode` **échangeable sans toucher `Sheet.tsx`**                    | `src/components/primitives/Sheet.tsx:135,469-471`                                                                                                                                                                                                  |
| `docs/ROADMAP.md` est **périmé**                                                                      | `:137` dit ADR-043 « en cours » (Accepted depuis le 23/08) ; `:138` dit « PR catégories 1 » en attente (déjà mergée)                                                                                                                               |

**Cause exacte du conflit des deux boutons**, et elle est contre-intuitive : le
`scroll-into-view` **ajouté le 23/08** (`AddExpenseSheet.tsx:300-330`) corrigeait
un symptôme (« Créer » était caché) et en a produit un autre — il pousse le bloc
de création en bas de l'écran visible. Le pied de `Sheet` étant `shrink-0` donc
toujours visible, « Ajouter » (`:461-472`) et « Créer » (`:845-854`) coexistent,
tous deux en `bg-brand-700`. Et `canSubmit` (`:234`) **ne dépend pas** de
`creatingCategory` : sans montant déjà saisi, « Ajouter » est désactivé.

**Rien à supposer** : aucun écran de gestion des catégories n'existe. La mention
« Catégories (drag-to-reorder + soft-delete) » de `CHANGELOG.md:129` est un
artefact de maquette du 8 mai, jamais implémenté.

## 3. Arbitrages @thierry — 25 août 2026

| #   | Question                                                   | Décision                                                                                                    |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D1  | Migrer la base, ou remapper le CSS seul ?                  | **Migrer la base.** Source unique de vérité ; `CategoryDonut` lira `color_token` sans couche de traduction. |
| D1b | La rampe a 6 teintes, le sélecteur 8. Que devient `cyan` ? | **`cyan` → `graph-1` (orange).** L'orange devient choisissable pour la première fois.                       |
| D2  | « Autres » (`is_system`) renommable ?                      | **Oui.** Le commentaire de colonne ne protège que la suppression.                                           |
| D3  | Catégories `fixed` renommables ?                           | **Oui**, dans une section distincte de l'écran de gestion, jamais mélangées au sélecteur de dépense.        |
| D4  | Suppression                                                | **Hors périmètre → ADR-044.** Concevoir et implémenter dans la même session est un interdit de la doctrine. |

**Mapping D1 retenu** : `blue→graph-4` · `emerald→graph-3` · `amber→graph-2` ·
`purple→graph-5` · `rose` **et** `pink`→`graph-6` (fusion délibérée : les deux
pointaient déjà sur `bg-danger` avant le hack `color-mix`) · `zinc→graph-rest` ·
`cyan→graph-1`.

## 4. Découpage

| #            | Contenu                                                 | Bloque PR 2a ?     |
| ------------ | ------------------------------------------------------- | ------------------ |
| **PR-CAT-1** | migrer `color_token` vers la rampe                      | **Oui — priorité** |
| **PR-CAT-2** | un seul CTA visible pendant la création                 | non                |
| **PR-CAT-3** | renommer / recolorer + écran `/app/settings/categories` | non                |
| **ADR-044**  | archivage, préalable à toute suppression                | non                |

### PR-CAT-1 — migrer la palette

`supabase/migrations/2026XXXX_categories_color_graph_ramp.sql` **[CREATE]** —
nouveau `check` à 7 valeurs, `UPDATE` de backfill selon le mapping, **et
réécriture des `INSERT` littéraux de `seed_default_categories()` et
`seed_expense_categories()`** (`20260503000003:44-52`, `20260729000002:105-124`) :
ces deux fonctions `SECURITY DEFINER` insèrent des `color_token` en dur et
cassent en silence si le `check` change sans elles.

**[MODIFY]** `domain/categories/types.ts` (7 valeurs) · `domain/categories/couleur.ts`
(logique inchangée, JSDoc `:9-24,:58-59` périmée) · ses tests · `schemas/category.ts`
(commentaire « 8 jetons » `:61`) · `AddExpenseSheet.tsx` (`CHIP_DOT` → `bg-graph-*`,
supprimer le `color-mix` `:113`, JSDoc `:90-105`) · ses tests (`:82-84,370,504`) ·
`lib/data/categories.ts` (repli `?? 'zinc'` `:66` → `'graph-rest'`) ·
`lib/i18n/__tests__/categories-keys.test.ts` (`CLES_COULEUR` `:40-50`, 8→7) ·
**les 5 fichiers de `messages/`** (bloc `app.expenses.addSheet.color`,
`fr-BE.json:964-973`) · `ADR-022` (note d'amendement — le §4 gouverne ce set fermé) ·
`docs/ROADMAP.md`.

Attention : `categories.test.ts:212-234` utilise `colorToken: 'rose'` en fixture.

**Test neuf obligatoire** : après backfill, aucune ligne `categories` ne porte une
valeur hors des 7 — sinon un jeton devient invisible en silence.

QA : `ui-auditor`, `mobile-ios-auditor`, `i18n-auditor`, `dashboard-ux-auditor`,
`silent-failure-auditor` (fonctions `SECURITY DEFINER` modifiées), `rls-flow-tester`,
`test-quality-auditor`, `test-runner`. **`plan-reviewer` obligatoire.**

Branche `feat/categories-color-ramp`.

### PR-CAT-2 — un seul CTA

**Option retenue** : substituer le pied de `Sheet` pendant l'édition —
`creatingCategory ? <CréerAnnuler/> : <Ajouter/>`. Possible sans toucher
`Sheet.tsx` (le `footer` est un `ReactNode`). Un seul CTA visible à la fois.

Tests : ouverture masque le CTA principal ; fermeture (Créer, Annuler, Échap) le
restaure ; **le montant déjà tapé n'est jamais perdu** (non-régression `:774-779`).

Voie légère. Branche `fix/expense-sheet-category-creation-conflict`.

### PR-CAT-3 — renommer / recolorer

Une seule action `updateExpenseCategoryAction(id, { name?, colorToken? })`.
`authorizedWorkspace()` + `rateLimit('mutation')` + contrôle d'homonyme **en
excluant la ligne elle-même** + `logAuditEvent(CATEGORY_RENAMED)` **sans jamais
le nom** dans les métadonnées.

Nouveaux : `app/[locale]/app/settings/categories/{page.tsx,CategoriesManagementClient.tsx}`

- tests. Modifiés : `schemas/category.ts`, `actions/categories.ts`,
  `actions/categories.types.ts`, `security/audit-log.ts` (`CATEGORY_RENAMED` à côté
  de `CATEGORY_CREATED` `:75`), `SettingsClient.tsx` (lien, patron `:424`),
  `lib/data/categories.ts` (vérifier qu'aucun filtre n'exclut les `fixed` **en lisant
  le call-site avant d'écrire**), les 5 `messages/`.

**Vigilance sécurité, à tester et non supposer couverte par la RLS** :
l'asymétrie `DELETE`/`UPDATE` (§2) peut bloquer un futur membre non-créateur en
écriture après que l'autorisation applicative a réussi. L'action doit rendre une
erreur lisible, pas un échec Supabase brut. `rls-flow-tester` doit vérifier ce cas
**en conditions réelles**, pas en mock.

**Vigilance volume** : c'est la plus grosse des trois. Si > 600 lignes, scinder en
3a (action + tests) puis 3b (écran).

QA : `security-auditor`, `rls-flow-tester`, `silent-failure-auditor`,
`gdpr-compliance-auditor` (le nom est une donnée déjà exportée en RGPD),
`ui-auditor`, `mobile-ios-auditor`, `dashboard-ux-auditor`, `i18n-auditor`,
`test-quality-auditor`, `test-runner`. **`plan-reviewer` obligatoire.**

Branche `feat/categories-rename-recolor`.

### ADR-044 — archivage (aucun code)

Doit trancher : le design `archived_at`, ce qu'affiche une dépense pointant vers
une catégorie archivée, le sort de l'asymétrie RLS, et si un index unique
`(workspace_id, name)` accompagne la décision. **Cooldown obligatoire** : session
N décision, session N+1 code.

## 5. Hors périmètre

Le code de suppression · `CategoryDonut` lui-même (ce chantier la débloque, ne la
construit pas) · `.claude/settings.local.json`, `.husky/`, workflows GHA · toute
dépendance payante · la dette du `.order('created_at')` faux (ADR-043, PR à part) ·
le test manquant `category-is-not-a-calculation-axis` (même table).

## 6. Smoke tests @thierry

- **PR-CAT-1** : ouvrir ⊕ en prod, créer une catégorie test, confirmer qu'une
  teinte **orange** est proposée et que les puces existantes restent distinctes en
  clair **et** en sombre.
- **PR-CAT-2** : sur iPhone, ouvrir ⊕ et lancer « nouvelle catégorie **avant** de
  saisir un montant » — un seul bouton d'action visible, aucun champ caché.
- **PR-CAT-3** : renommer « Intermaché » → « Intermarché », confirmer que la
  feuille ⊕ affiche immédiatement le nouveau nom.
