# Runbook — Déploiement des migrations Supabase

> **Trou process documenté le 3 mai 2026** : les migrations Supabase **ne sont pas auto-appliquées** par les déploiements Vercel. Toute PR qui contient un fichier dans `supabase/migrations/` exige une étape manuelle après merge.

## Quand exécuter ce runbook

À chaque merge sur `main` d'une PR qui ajoute, modifie ou supprime un fichier dans `supabase/migrations/`. La signature CI (Vercel deploy READY) ne suffit **pas** : Vercel ne touche que le bundle Next.js, pas le schéma DB Supabase.

**Symptôme typique du non-déploiement** : code merge sur `main`, deploy Vercel READY, mais le rendu prod n'utilise pas les nouvelles colonnes / tables. Les Server Components Next.js lisent du `undefined` sur les nouvelles colonnes et fallbackent silencieusement (pas d'erreur 500, juste un rendu incomplet).

## Procédure standard

```bash
cd F:\PROJECTS\Apps\ankora

# 1. Sync local main avec remote
git checkout main
git pull origin main

# 2. Lister l'écart entre migrations locales et migrations remote (prod)
supabase migration list --linked

# Le tableau affiché doit montrer les nouvelles migrations dans la colonne
# "Local" mais avec une colonne "Remote" vide pour les non-appliquées.

# 3. Push les migrations manquantes vers prod
supabase db push --linked

# 4. Vérifier que toutes les migrations sont bien appliquées (Local = Remote)
supabase migration list --linked
```

Le push est **idempotent** : Supabase garde l'historique des migrations appliquées et ne re-applique jamais une migration déjà présente.

## Garde-fous obligatoires sur les migrations

- **Toutes les migrations doivent être idempotentes** : `add column if not exists`, `create policy if not exists` (via `do $$` blocs), `on conflict do nothing` sur les seeds.
- **Toutes les migrations doivent être additives en MVP** : pas de `drop column` sans renaming PR séparée + audit consommateurs.
- **Tester en local avant push prod** : `supabase db reset` (réinitialise la DB locale via Docker) puis vérifier que la migration s'applique sans erreur.

## Erreurs Postgres fréquentes à éviter

### `cannot use subquery in check constraint (SQLSTATE 0A000)`

Postgres interdit les subqueries dans les `CHECK` constraints. Pour valider qu'un tableau ne contient que des valeurs autorisées, **utiliser l'opérateur `<@`** (contained by), pas `(SELECT bool_and FROM unnest)` :

```sql
-- ❌ Plante au push
check (
  array_length(payment_months, 1) between 1 and 12
  and (select bool_and(m between 1 and 12) from unnest(payment_months) as m)
)

-- ✅ Accepté en CHECK
check (
  array_length(payment_months, 1) between 1 and 12
  and payment_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
)
```

Référence d'incident : PR #97 (3 mai 2026) — fix migration 2 PR-D1.

### `could not connect to "supabase_db_<project>"`

Symptôme du Supabase CLI qui essaie d'utiliser Docker localement au lieu du remote. Solution : toujours passer le flag `--linked` aux commandes Supabase CLI quand on cible la prod.

## Procédure de rollback

Si une migration push prod produit un effet inattendu :

1. **Identifier la migration fautive** dans `supabase migration list --linked` (la dernière colonne "Time UTC" = date d'application).
2. **Créer une migration inverse** dans `supabase/migrations/<nouveau_timestamp>_revert_<migration>.sql` qui annule les changements (drop column, drop policy, etc.).
3. **NE PAS éditer la migration fautive existante** — elle doit rester pour l'historique.
4. **PR + merge** la migration inverse.
5. **Push** : `supabase db push --linked`.

Pour les cas de panique (corruption de données) : restore depuis le backup automatique Supabase via le dashboard `Database > Backups`. RPO ~24h.

## Plan d'automatisation future

Le push manuel après merge est une dette process. Options pour automatiser :

### Option A — GitHub Action post-merge `main`

Workflow `.github/workflows/supabase-migrations.yml` :

```yaml
name: Apply Supabase migrations
on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']

jobs:
  push-migrations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} --password ${{ secrets.SUPABASE_DB_PASSWORD }}
      - run: supabase db push --include-all
```

**Risque** : Supabase access token + DB password en GitHub Secrets. Audit régulier requis.

### Option B — Hook Vercel post-deploy

Ajouter un script `vercel.json` `buildCommand` qui inclut `supabase db push --linked` avant `next build`.

**Risque** : couplage Vercel ↔ Supabase, difficile à débugger. Build time augmente.

### Recommandation @cowork

Option A en CI dédiée, exécutée seulement sur push `main` (pas en PR), avec un **dry-run obligatoire** en preview Vercel d'abord. À implémenter en PR `chore(ci): auto-apply Supabase migrations on main push` post-Voie D.

## Checklist DoD pour PR contenant migrations

À ajouter dans la définition de DONE Ankora (`CLAUDE.md` projet) :

- [ ] Migration testée localement avec `supabase db reset` (zero erreur)
- [ ] Migration idempotente (DO bloc avec `if not exists` sur policies/constraints)
- [ ] **Après merge `main`** : exécuter `supabase db push --linked` et vérifier `supabase migration list --linked` (Local = Remote pour la nouvelle migration)
- [ ] Smoke test prod du parcours user qui dépend de la migration

## Historique des incidents traités

| Date | PR | Incident | Résolution |
|---|---|---|---|
| 2026-05-03 | #94 + #96 | 4 migrations PR-D1 mergées sur main mais non appliquées prod → PR-D2 (#96) servie sans les colonnes `account_type`/`display_name`, rendu fallback silencieux | `supabase db push --linked` exécuté manuellement par @cowork. Migration 2 a planté (subquery in CHECK), fix dans PR #97. Re-push OK 4/4 appliquées 20:23 UTC. |

---

Voir aussi : `docs/adr/ADR-006-testing-strategy-v1.md` pour la stratégie de tests autour des migrations.
