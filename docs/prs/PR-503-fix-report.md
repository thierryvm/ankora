# PR-503-fix — Hotfix #4 Étape 2 : column `created_at` → `joined_at`

> **Suite directe de PR #190** ([fix(503-diag): instrument requireUser](https://github.com/thierryvm/ankora/pull/190)) qui a permis de capturer la cause exacte du 503/303 sur `POST /app` en prod (Server Action "Ajuster ce mois" → reste-à-vivre override).

## TL;DR

- **1 ligne fonctionnelle changée** dans [`src/lib/auth/require-user.ts`](../../src/lib/auth/require-user.ts).
- **Cause** : `requireUserWithWorkspace()` ordonnait `workspace_members` par `created_at`, colonne inexistante côté schéma réel (la colonne s'appelle `joined_at`). Postgres renvoyait l'erreur `42703` (undefined_column).
- **Effet observé** : Server Action `updateResteAVivreOverrideAction` redirigeait silencieusement vers `/onboarding` à cause du `if (!membership) redirect(...)`, ce qui se traduisait côté client par un 303 sur `POST /app` puis 503 au follow-up (chain redirect cassée).
- **L'instrumentation `[503-diag]` reste en place** dans cette PR. Cleanup dédié dans une PR ultérieure une fois la prod stabilisée 24–48h.

## Diff

```diff
- .order('created_at', { ascending: true })
+ .order('joined_at', { ascending: true })
```

Chemin : [`src/lib/auth/require-user.ts:107`](../../src/lib/auth/require-user.ts#L107) (dans `requireUserWithWorkspace`).

## Evidence — avant fix

**Source** : log Vercel runtime capturé via instrumentation PR #190 (commit a35e4c1 mergé sur main).

- Request ID : `26cmm-1779961685968-44bd510c9a63`
- Path : `POST /app`
- Réponse : `303` (puis 503 au follow-up Server Action)
- Log warn `[503-diag] require-user workspace_members query error` avec :
  - `code: '42703'`
  - `msg: 'column workspace_members.created_at does not exist'`

## Evidence — schéma réel

Source de vérité : [`src/lib/supabase/types.ts:495-530`](../../src/lib/supabase/types.ts#L495-L530) (généré via `npm run supabase:types`) :

```ts
workspace_members: {
  Row: {
    joined_at: string;
    role: string;
    user_id: string;
    workspace_id: string;
  }
  // …
}
```

Aucune colonne `created_at` n'existe sur `public.workspace_members`.

## Vérification cross-call-sites

Recherche exhaustive `workspace_members` croisée avec `created_at` :

```bash
grep -rn "workspace_members" src/ | grep -i "created_at"
```

Seul match (avant fix) = la ligne corrigée. Aucun autre call-site ne dépend de cette colonne fantôme.

Autres call-sites `workspace_members` audités (lecture seule, pas de tri) :

- `src/lib/data/workspace-snapshot.ts:153` — `.select(...)` sans `.order()` sur cette table ✓
- `src/lib/actions/{charges,expenses,charge-payments,accounts}.ts` — guards `.select('role').eq('user_id', ...)` sans `.order()` ✓
- Mocks tests `expenses/charges/charge-payments.test.ts` — n'invoquent pas `.order()` ✓

## Quality gates (locaux, pré-push)

| Gate                      | Résultat                                              |
| ------------------------- | ----------------------------------------------------- |
| `npm run lint`            | 0 errors (6 warnings préexistants, non liés au fix)   |
| `npm run lint:use-server` | ✓ `All "use server" files contain only async exports` |
| `npm run typecheck`       | ✓ `tsc --noEmit` silent                               |
| `npm run test`            | ✓ **1337/1337** tests passent (107 fichiers)          |
| `npm run build`           | ✓ 161/161 pages générées                              |

Aucun test n'a dû être ajusté : le test existant `require-user.test.ts` ne couvre que `getOptionalUser()` (path auth), pas `requireUserWithWorkspace()` (path query). La couverture du path query est laissée hors scope volontairement — couverture à reprendre dans une PR de cleanup dédiée si la valeur le justifie.

## Smoke test post-merge (pris en charge par @cowork)

1. Reproduire le parcours en prod : `/app` → drawer "Reste à vivre" → "Ajuster ce mois" → valeur → **Enregistrer**.
2. Attendu :
   - Réponse `200` sur `POST /app` (plus de `303` ni de `503`).
   - Drawer se ferme, toast success affiché.
   - Aucune log `[503-diag] require-user workspace_members query error` dans Vercel runtime logs.
3. Stabilité 24–48h prod ⇒ déclenchement de la PR de cleanup `chore(diag): remove 503-diag instrumentation`.

## Définition de DONE (per CLAUDE.md)

- [x] Lint, lint:use-server, typecheck, tests, build verts locaux
- [ ] CI verte sur la PR (à vérifier post-push)
- [ ] Sourcery silencieux sur le dernier commit (à vérifier post-push)
- [ ] Smoke test prod 200 confirmé par @cowork (24–48h)
- [ ] PR mergée par @thierry

## Hors scope (volontaire, 1 PR = 1 objectif)

- **Cleanup instrumentation `[503-diag]`** → PR séparée 24–48h après stabilisation prod.
- **Test unitaire couvrant `requireUserWithWorkspace`** → à arbitrer dans la PR de cleanup ou backlog QA.
- **Audit RBAC/RLS plus large sur `workspace_members`** → non bloquant pour le hotfix.
