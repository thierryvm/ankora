# ADR-008 — Naming des comptes : `display_name` user-defined + `account_type` sémantique

- **Statut** : Accepted
- **Date** : 2026-05-03
- **Accepté le** : 2026-05-03 par délégation explicite de @thierry à @cowork (chat session, "tu as la responsabilité des choix techniques")
- **Proposé par** : Cowork-Opus (Architecture)
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `data-model`, `ux`, `i18n`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-002 (bucket-model), spec `dashboard-cockpit-vraie-vision-2026-05-03.md`, PR-D2

---

## Contexte & problème

Le Dashboard Ankora actuel (post PR-C2a) affiche 3 comptes nommés en dur : "Compte Principal", "Vie Courante", "Épargne". Lors du smoke test prod 2026-05-03, @thierry a remonté un **bug UX** :

> Le mot "Compte Principal" est ambigu. L'utilisateur lit "Principal → Vie Courante" et ne sait pas si "Principal" = "celui d'où ça part" (sémantique métier Ankora) ou "celui qui est principal pour moi" (sémantique langagière user, qui pense souvent que c'est son compte courant chez sa banque).

Plus largement, @thierry utilise dans la vraie vie :

- **Belfius** (compte courant où arrive le salaire) — concept Ankora `Compte Principal`
- **Compte Épargne Belfius** (provisions factures variables) — concept Ankora `Compte Épargne`
- **Revolut** (carte quotidienne courses/essence/loisirs) — concept Ankora `Vie Courante`

Forcer l'utilisateur à renommer mentalement ses comptes pour matcher la nomenclature Ankora **crée de la friction cognitive permanente**. À l'inverse, laisser l'utilisateur nommer librement sans typer sémantiquement casse toute la logique métier (l'Assistant Virements, l'algo Santé Provisions, le routing des charges entre comptes, etc.).

La spec canonique du Dashboard cockpit (cf. document `dashboard-cockpit-vraie-vision-2026-05-03.md`) tranche : on a **3 comptes typés sémantiquement** (`income_bills` / `provisions` / `daily_card`) **renommables par l'utilisateur** (Belfius / Compte Épargne / Revolut). Cet ADR formalise ce choix dans le data model.

---

## Décision — drivers

Trois objectifs en tension :

1. **Clarté UX** : l'utilisateur doit voir SES noms de comptes (cohérence avec son interface bancaire et son monde mental).
2. **Solidité métier** : le code Ankora doit pouvoir distinguer sans ambiguïté un compte "où arrive le salaire" d'un compte "où vivent les provisions" sans dépendre d'un parsing fragile sur le nom textuel.
3. **i18n** : les libellés par défaut doivent être traduits FR/EN (et NL/DE/ES post-launch), mais les noms saisis par l'utilisateur sont langue-neutres (libre).

---

## Décision adoptée

**Adopter une séparation `display_name` (libre) + `account_type` (enum fixe)** au niveau du schéma `accounts`.

### Schéma cible

```sql
-- Type enum (fixe, code only)
CREATE TYPE account_type_enum AS ENUM (
  'income_bills',  -- où arrive le salaire, d'où partent les charges fixes mensuelles
  'provisions',    -- où vivent les provisions pour charges périodiques (annuelles, trimestrielles)
  'daily_card'     -- carte quotidienne (courses, essence, loisirs) avec plafond mensuel
);

-- Migration de la table accounts existante
ALTER TABLE accounts
  ADD COLUMN account_type account_type_enum,
  ADD COLUMN display_name TEXT;

-- Backfill (one-shot via migration)
UPDATE accounts SET account_type = 'income_bills', display_name = 'Compte Principal' WHERE name ILIKE 'compte principal' OR name ILIKE 'principal';
UPDATE accounts SET account_type = 'provisions', display_name = 'Compte Épargne' WHERE name ILIKE '%épargne%' OR name ILIKE '%epargne%';
UPDATE accounts SET account_type = 'daily_card', display_name = 'Vie Courante' WHERE name ILIKE 'vie courante' OR name ILIKE '%quotidien%';

-- Forcer NOT NULL après backfill
ALTER TABLE accounts
  ALTER COLUMN account_type SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL;

-- Contrainte : un workspace a au plus 1 account par type
CREATE UNIQUE INDEX accounts_workspace_type_unique ON accounts (workspace_id, account_type);
```

### Règles applicatives

1. **`account_type` est `readonly` côté UI**. L'utilisateur ne peut pas changer le type d'un compte (sinon toute la logique métier casse).
2. **`display_name` est éditable inline** depuis le Dashboard : click sur le nom → input → save (Server Action).
3. **À la création du workspace** (signup), 3 comptes sont créés automatiquement avec :
   ```
   income_bills → display_name = i18n("account.defaults.income_bills") = "Compte Principal" (fr) / "Main Account" (en)
   provisions   → display_name = i18n("account.defaults.provisions")   = "Compte Épargne"   (fr) / "Savings Account" (en)
   daily_card   → display_name = i18n("account.defaults.daily_card")   = "Carte Quotidien"  (fr) / "Daily Card"      (en)
   ```
4. **Validation Zod** sur `display_name` : trim, min 1, max 50 caractères, pas de HTML (XSS-safe via Zod `.regex(/^[^<>]*$/)`).
5. **i18n keys** ajoutées dans `messages/{fr-BE,en}.json` :
   ```json
   "account": {
     "types": {
       "income_bills": "Salaires & Factures",
       "provisions": "Provisions Annuelles",
       "daily_card": "Courses, Essence, Loisirs"
     },
     "defaults": {
       "income_bills": "Compte Principal",
       "provisions": "Compte Épargne",
       "daily_card": "Carte Quotidien"
     }
   }
   ```
6. **Affichage Dashboard** : dans la card compte, afficher `display_name` en titre (gros), et `i18n('account.types.{type}')` en sous-titre (petit). Cohérent avec la maquette IronBudget.

### Naming code TypeScript

```typescript
// src/lib/domain/accounts.ts
export type AccountType = 'income_bills' | 'provisions' | 'daily_card';

export type Account = {
  id: AccountId;
  workspaceId: WorkspaceId;
  accountType: AccountType;
  displayName: string;
  balance: Decimal;
  createdAt: Date;
  updatedAt: Date;
};

// Helpers pour l'UI
export function getAccountTypeLabel(type: AccountType, t: TFunction): string {
  return t(`account.types.${type}`);
}
```

---

## Conséquences positives

- ✅ L'utilisateur voit SES noms de comptes partout (réduit friction cognitive permanente).
- ✅ Le code métier reste solide et déterministe (l'Assistant Virements peut référencer `account_type === 'provisions'` sans parser).
- ✅ Migration backward-compatible : les comptes existants gardent leur nom historique comme `display_name`.
- ✅ Multi-workspace propre : chaque workspace peut avoir 1 income_bills, 1 provisions, 1 daily_card (la contrainte `UNIQUE (workspace_id, account_type)` garantit qu'on ne peut pas créer de doublons).
- ✅ i18n claire : les défauts sont traduits, les noms users restent langue-neutres.
- ✅ Édition inline simple à implémenter (Server Action + revalidatePath).
- ✅ Open the door pour Phase 3 : ajouter d'autres types de comptes (`emergency`, `investment`, `joint`, etc.) reste trivial (extension de l'enum + nouvelles cards).

## Conséquences négatives

- ❌ **3 comptes typés fixes en v1.0** : pas de support pour user qui voudrait "2 comptes courants" ou "0 carte quotidien" en v1.0. Mitigation : couvre le persona Thierry_3_comptes et 80 % des cas user. Si feedback v1.0 demande flexibilité, on assouplit la contrainte `UNIQUE` en v1.1 et on permet 0..N comptes par type.
- ❌ **Migration nécessaire** sur les workspaces existants (mais on n'a actuellement que @thierry en data prod réelle).
- ❌ **Charge mentale onboarding** : il faut expliquer les 3 types lors de l'onboarding 3 étapes (PR-D6 ou onboarding dédié).
- ❌ **Limitation par enum SQL** : ajouter un type plus tard nécessite une migration `ALTER TYPE ... ADD VALUE` + redéploiement coordonné.

---

## Alternatives évaluées

### Alternative 1 — `name` libre seul (sans type)

Garder uniquement la colonne `name` actuelle (texte libre), sans `account_type`. Le code métier inférerait le rôle d'un compte via heuristique sur le nom, ou via un paramètre user explicite.

**Rejetée** : casse toute la logique métier déterministe. Heuristique sur le nom = fragile (un user qui appelle son compte épargne "ING Direct" perd la sémantique). Paramètre user explicite = double saisie inutile.

### Alternative 2 — `tag` libre + `is_default_X` booléens

Marquer un compte avec des booléens `is_income_account`, `is_provisions_account`, etc. (au lieu d'un enum).

**Rejetée** : on perd la contrainte d'unicité naturelle (un compte pourrait être 2 types à la fois, ou 0). Plus dur à valider, moins clair en code (multiples conditions au lieu d'un switch sur un type discriminant).

### Alternative 3 — Comptes 100 % libres + UI typée par les charges

Laisser les comptes 100 % libres (juste un nom), et typer la logique au niveau des charges (chaque charge dit "je suis payée depuis tel compte"). L'Assistant Virements regrouperait alors par compte à la volée.

**Rejetée** : on perd le concept "compte de provisions" qui est central pour Santé Provisions. L'algo `totalEpargneTheorique` doit savoir "ce compte sert aux provisions" pour comparer son solde à la cible théorique. Sans `account_type === 'provisions'`, il faudrait des heuristiques fragiles.

### Alternative 4 — i18n côté serveur (libellés générés)

Au lieu de stocker `display_name` en DB, le générer à la volée côté serveur depuis l'enum + locale.

**Rejetée** : empêche le renommage user. C'est précisément le bug UX qu'on veut résoudre. La solution adoptée combine les deux (défaut i18n au signup + édition libre user).

---

## Plan d'implémentation

1. **PR-D1 (Foundations)** :
   - Migration Supabase `0XX_add_account_type_and_display_name.sql` (création enum + colonnes + backfill + UNIQUE index)
   - Mise à jour `src/lib/supabase/types.ts` via `npm run supabase:types`
   - Mise à jour domain `src/lib/domain/accounts.ts` avec le type `AccountType`
   - i18n keys `messages/{fr-BE,en}.json` (account.types._ + account.defaults._)
   - Tests Vitest : unicité par workspace, defaults au signup, validation Zod sur `display_name`
2. **PR-D2 (Header + cards)** :
   - Composant `AccountCard` qui consomme `account_type` pour la couleur/icône et `display_name` pour le titre
   - Server Action `renameAccount(accountId, newDisplayName)` avec validation Zod et `revalidatePath`
   - UI inline edit (click → input → save sur blur ou Enter)
   - Tests E2E Playwright : "user renomme un compte → persisté + visible header"
3. **Documentation** : compléter `docs/data-model/accounts.md` (à créer si inexistant) avec le pattern et la migration des comptes existants.

---

## Risques

- **Risque 1 — Migration prod casse l'app actuel** : le backfill peut rater certains comptes (ex: nom "Mon compte chèque" ne match aucune regex). Mitigation : log les workspaces où le backfill échoue, fallback `account_type = 'income_bills'` + flag manuel @thierry pour valider individuellement. Étant donné qu'on a 1 user prod réel (@thierry), risque très faible.
- **Risque 2 — Performance UNIQUE index** : aucun, l'index couvre `(workspace_id, account_type)` qui est extrêmement sélectif.
- **Risque 3 — Scope creep type discoverability** : un utilisateur futur peut vouloir un compte "joint" ou "emergency". On limite v1.0 aux 3 types et on document le pattern d'extension dans le code (commenté au-dessus de l'enum).

---

## Métriques de succès

À mesurer 4 semaines post-PR-D2 :

- **Adoption renaming** : % de workspaces où ≥ 1 compte a un `display_name` ≠ default i18n. Cible : ≥ 50 %.
- **Friction onboarding** : taux de complétion de l'étape "comptes" dans l'onboarding 3 étapes (PR-D6). Cible : ≥ 90 %.
- **Bug reports liés au naming** : 0 sur GitHub Issues + 0 dans les retours @thierry user N°1.

---

## Décision finale

À valider par @thierry. En attendant validation explicite, statut `Proposed`.
