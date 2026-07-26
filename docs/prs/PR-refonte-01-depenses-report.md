# PR — Refonte étape 1 : dépenses, filet et affordance

**Date** : 26 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `fix/refonte-01-depenses-filet-affordance`
**Revue de plan** : `plan-reviewer` — 🟡 puis ✅ APPROVED (10 édits, tous intégrés)
**Étape** : 1 / 17 du plan de refonte v2 (mergé en #268)

---

## 1. Ce que ça corrige

Trois défauts sur le chemin des dépenses, aucun ne se manifestant par une erreur, plus le
filet d'autorisation qui aurait dû les attraper.

### La date pré-remplie était en UTC

`ExpensesClient` calculait sa date par défaut avec `new Date().toISOString().slice(0, 10)` —
le jour **UTC**. En heure d'été belge, entre minuit et 02:00 locales, UTC est encore la
veille : le formulaire pré-remplissait **hier**. Le 1er du mois, la dépense partait sur le
mois précédent, où la liste du mois courant ne la montre jamais — sans le moindre signal.

`ANKORA_TIMEZONE` sort de `workspace-snapshot.ts` pour devenir `src/lib/date/tz.ts`, source
unique. L'implémentation est **recopiée telle quelle de `ChargesClient`**, qui avait déjà
résolu le problème localement — elle est éprouvée et client-safe.

### `formatDate` ignorait le fuseau, contrairement à `formatMonth` vingt lignes plus bas

Les dates de dépense sont des valeurs _date-only_ (`occurred_on` est un `date` Postgres). Or
`new Date('2026-07-18')` est parsée à minuit UTC : formatée dans le fuseau du runtime, elle
rendait le 17 à l'ouest de Greenwich — jour faux à l'écran, et divergence d'hydratation entre
un serveur Vercel en UTC et le navigateur.

**Le correctif est volontairement étroit, et c'est le point le plus important de cette PR.**
Un `timeZone: 'UTC'` global aurait corrompu les trois appelants qui passent un instant réel :
les dates de suppression de compte (`scheduled_for`, `cancelled_at`, toutes deux
`timestamptz`). Un utilisateur belge demandant la suppression en soirée se serait vu
annoncer une date d'effacement **décalée d'un jour** — une donnée juridiquement engageante,
cassée par une PR « dépenses ».

UTC ne s'applique donc qu'aux chaînes date-only. `plan-reviewer` a relevé ce piège avant que
la moindre ligne ne soit écrite.

### `createExpenseAction` laissait tomber `paid_from`

L'INSERT énumérait toutes les colonnes sauf `paid_from`, que `updateExpenseAction` honore
pourtant. **Ce n'est pas un bug utilisateur** : aucune UI ne choisit de compte et le défaut
en base couvrait le cas. C'est un correctif de **frontière de Server Action**, qui aurait
émergé sur le seul chemin de création le jour où un sélecteur de compte arrive.

## 2. Le filet qui accompagne

`tests/actions/expenses.test.ts` couvrait déjà ces deux actions — mais pour le **contrat
`revalidatePath`**, pas pour les frontières d'autorisation. Rien ne prouvait qu'un appelant
sans session, sans membership, ou au-delà du rate limit était refusé. Or la création est le
chemin le plus emprunté de l'app, et la suppression le seul irréversible.

**Correction d'une affirmation de ma Phase 0** : j'avais écrit « aucun test » pour ces deux
actions. C'était faux, et `plan-reviewer` l'a relevé. La nouvelle table vit dans
`src/lib/actions/__tests__/expenses.test.ts`, en miroir d'`updateExpenseAction` ; la suite
existante reste intacte.

Le mock d'`insert` capture désormais son payload comme celui d'`update` le faisait déjà —
sans quoi il n'existe aucun moyen d'asserter ce que la création écrit, c'est-à-dire
exactement l'endroit où une colonne oubliée se cache.

## 3. L'affordance

L'édition **fonctionnait déjà** : `ExpenseEditDrawer` (217 lignes) était monté, testé,
opérationnel. Son déclencheur était un crayon `text-muted-foreground` collé à une corbeille
`text-danger`. L'œil va au rouge — @thierry a cru pendant des semaines qu'on ne pouvait pas
modifier une dépense.

La ligne entière devient la cible, sous forme d'un vrai `<button>` et non d'un `onClick` sur
le `<li>` : le focus clavier, le nom accessible et la cible de 44 px sont préservés, et rien
d'interactif n'est imbriqué à l'intérieur.

La suppression descend dans le drawer, derrière une confirmation en deux temps qui **nomme**
ce qui va disparaître :

> Supprimer « Intermarché » — 27 € ? Cette dépense sera définitivement effacée.

Une action irréversible à un tap de travers dans une liste qui défile, sans confirmation,
était la moitié la plus dangereuse de la même disposition. Le soft delete avec fenêtre
d'annulation viendra à l'étape 12 ; d'ici là, nommer la dépense et son montant est tout le
filet.

## 4. Preuve

### Falsifiabilité — vérifiée, pas supposée

| Ce qu'on retire                        | Ce qui devient rouge                                          |
| -------------------------------------- | ------------------------------------------------------------- |
| la ligne `paid_from` de l'INSERT       | 2 specs                                                       |
| le prédicat date-only de `formatDate`  | 3 specs date-only ; les **2 specs d'instants restent vertes** |
| le retrait de la corbeille de la liste | 1 spec structurelle                                           |

La deuxième ligne est la plus parlante : elle prouve que les **deux moitiés** du contrat sont
épinglées — le correctif s'applique aux dates, et ne s'applique pas aux instants.

### Parcours joué en direct, session connectée, iPhone 14

```
date pré-remplie            : 2026-07-26   ← heure belge, pas UTC
lignes après création       : 1
suppression depuis la liste : 0
confirmation                : Supprimer « Intermarché » — 27 € ? …
lignes avant/après          : 1 → 0
```

### Quality gates

|                         |                 |
| ----------------------- | --------------- |
| `npm run test`          | **1702 / 1702** |
| `npm run typecheck`     | 0 erreur        |
| `npm run lint`          | 0 erreur        |
| `npm run test:coverage` | exit 0          |

`src/lib/actions/expenses.ts` entre dans la couverture avec un **seuil par-glob à 80 %**.
L'ajouter sous la barre globale de 90 % aurait rendu la CI rouge au lieu de relever le
plancher : une Server Action est surtout faite de gardes et d'un appel Supabase, et le
dernier pourcent, ce sont les branches d'erreur du client lui-même.

### Ce que la CI ne prouvera pas

`e2e/mobile-ios/expenses-crud.spec.ts` est `seededUser`-gated et **s'auto-skippe en CI**
(pas de `SUPABASE_SERVICE_ROLE_KEY` : un seul projet Supabase, la clé `service_role` ne doit
pas y atteindre). Vérifié dans les deux sens : **1 passed** en local avec les secrets,
**1 skipped** sans. Une CI verte ne vaut donc pas validation de ce parcours.

La preuve « le test de fuseau échoue si on retire le correctif » n'est pas automatisable :
c'est la vérification manuelle consignée dans le tableau ci-dessus, pas un test.

## 5. Hors périmètre, délibérément

Catégories (étape 6) · soft delete (étape 12) · refonte visuelle du formulaire (étape 11) ·
toute modification de navigation · `src/lib/domain/expenses/update.ts`, module mort dont le
sort se décide à l'étape 11.

Le swap de `ChargesClient.todayBrusselsIso` vers `tz.ts` n'a **pas** été fait : il n'était
autorisé qu'en import 1-ligne à comportement strictement identique, et le fichier mérite sa
propre passe. Tracé ici plutôt que glissé dans cette PR.

## 6. Definition of DONE

| #   | Critère                                | Preuve                            |
| --- | -------------------------------------- | --------------------------------- |
| 1   | CI verte                               | cf. checks de la PR               |
| 2   | Sourcery muet sur le dernier commit    | `gh api …/comments` → sortie vide |
| 3   | Approbation @thierry + threads résolus | à la revue                        |
| 4   | Pas de conflit avec `main`             | `mergeStateStatus: CLEAN`         |
| 5   | Rapport livré                          | ce fichier                        |
