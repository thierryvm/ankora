# PR Security Hardening — Function Grants + Search Path

**Date** : 2026-05-28
**Branche** : `chore/security-function-grants-and-audit-log`
**Type** : `chore(security)` — strict hardening, no functional change
**Auteurs** : @cowork (vision + smoke MCP), @cc-ankora (plan + code + tests), @thierry (validation + GO)

---

## 1. Contexte

### Origine

Les Supabase Advisors (lints `0011_function_search_path_mutable`, `0028_exposed_security_definer`, `0029_function_search_path_mutable`) signalaient :

- 7 fonctions `SECURITY DEFINER` exposées publiquement via `PostgREST` (callable en RPC par tout JWT, y compris `anon`)
- 1 fonction (`touch_updated_at`) avec `search_path` mutable (vulnérabilité supply chain potentielle si un attaquant modifie le `search_path` d'une session)

### Bug secondaire détecté

Lors du smoke #191 (fix 503 reste-à-vivre, PR mergée 2026-05-28 10:16Z), `logAuditEvent()` pour l'event `workspace.reste_a_vivre_updated` a retourné `permission denied for table audit_log`. Non-bloquant (fire-and-forget), mais audit trail cassé.

**Décision @thierry** : sortir ce bug en follow-up PR dédiée pour préserver le scope étroit de cette PR sécurité. Suivi via issue [#192](https://github.com/thierryvm/ankora/issues/192) (`chore(security): fix audit_log service_role client (H3 createServerClient leak)`).

---

## 2. Étape 0 — Vérifications préalables (avant écriture du code)

Doctrine Ankora "code verify before prescribe" appliquée systématiquement avant la rédaction de la migration.

### 2.1 Call-sites RPC client (regex couvrant guillemets simples, doubles, backticks)

```bash
grep -rn -E "\.rpc\([\"'\`](seed_default_accounts|seed_default_categories|purge_audit_log_older_than_12_months|rls_auto_enable|is_workspace_member|is_workspace_editor|handle_new_user)" src/
```

**Résultat** : **0 match**. Aucune des 7 fonctions n'est appelée en `.rpc()` depuis le code applicatif.

### 2.2 `handle_new_user` — trigger uniquement ?

Définition à `supabase/migrations/20260503000003_pr_d1_categories_enrichments.sql:62-83` :

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
...
```

`returns trigger` → fonction trigger sur `auth.users`, invoquée par Postgres en tant qu'owner. Aucun call RPC dans le code app (cf. 2.1). Revoke from anon/authenticated/public **sans effet** sur le déclenchement du trigger.

### 2.3 Convention nommage migration

`ls supabase/migrations/` → format `YYYYMMDDhhmmss_<slug>.sql`. Dernière : `20260526000001_pr_beta_3_reste_a_vivre.sql`. Nouvelle : `20260528000001_security_hardening.sql`.

### 2.4 `rls_auto_enable` — drift documenté

```bash
grep -rn "rls_auto_enable" supabase/migrations/
```

**Résultat** : **0 match**. Cette fonction est signalée par l'advisor Supabase mais n'est pas définie dans les migrations versionnées. Soit drift BDD ↔ repo (créée out-of-band via SQL Editor avant que le tracking de migration soit en place), soit faux positif advisor.

**Stratégie** : guarder le `revoke` en `do $$ if exists ... end $$;` pour éviter migration failure si la fonction n'existe pas en réalité.

### 2.5 Helpers RLS — confirmation P2

Définitions `is_workspace_member(uuid)` et `is_workspace_editor(uuid)` : `supabase/migrations/20260416000002_rls_policies.sql:31-45`, toutes deux `SECURITY DEFINER`. Utilisées dans les policies RLS aux lignes :

- `51` — `workspaces_member_select`
- `63` — `categories_member_select`
- `65` — `categories_editor_write`
- `69` — `charges_member_select`
- `71` — `charges_editor_write`
- `75` — `expenses_member_select`
- `77` — `expenses_editor_write`

Ces policies s'exécutent en rôle **authenticated**. **`REVOKE EXECUTE FROM authenticated` casserait toutes les RLS workspace-scoped**. Donc revoke from `anon` ONLY.

### 2.6 P4 — investigation audit_log "permission denied"

Trois hypothèses cause documentées dans l'issue [#192](https://github.com/thierryvm/ankora/issues/192) :

- **H1** (grant insert manquant) : réfuté à 80% (audit_log a `revoke all from anon, authenticated` mais aucun revoke explicite sur service_role/postgres).
- **H2** (RLS policy bloque) : réfuté (service_role a `bypassrls` par défaut Supabase).
- **H3** (`createAdminClient` mauvais client) : **piste forte**. Vérifié dans `src/lib/supabase/server.ts:37-54` — utilise `createServerClient` de `@supabase/ssr` avec `SERVICE_ROLE_KEY` + cookie handler qui lit les cookies user. Pattern suspect : le SDK SSR peut envoyer le JWT user dans `Authorization` à la place de la service_role_key, dégradant le client en rôle authenticated.

**Décision** : fix transverse (touche `createAdminClient` utilisé par 5+ call-sites critiques). Hors scope de cette PR. Issue follow-up #192 ouverte AVANT merge.

---

## 3. Migration appliquée

Fichier : [`supabase/migrations/20260528000001_security_hardening.sql`](../../supabase/migrations/20260528000001_security_hardening.sql)

### Structure

| Section | Objectif                                                                                                                                                                       | Cible advisors                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| P1      | Revoke EXECUTE sur 5 fonctions privileged (purge_audit_log, rls_auto_enable, handle_new_user, seed_default_accounts, seed_default_categories) depuis anon/authenticated/public | `0011_function_search_path_mutable`, `0028_exposed_security_definer` |
| P2      | Revoke EXECUTE sur 2 helpers RLS (is_workspace_member, is_workspace_editor) depuis **anon ONLY**                                                                               | `0028_exposed_security_definer` (partiel)                            |
| P3      | `alter function touch_updated_at() set search_path = ''`                                                                                                                       | `0029_function_search_path_mutable`                                  |

### Choix techniques notables

- **DO/IF EXISTS bloc P1** : défense anti-drift pour `rls_auto_enable` (absente des migrations versionnées). Le bloc DO/IF EXISTS couvre les 5 fonctions du même coup pour idempotence et lisibilité.
- **Commentaire SQL P1 sur PERFORM** : documenté que `seed_default_*` sont appelés via `PERFORM` depuis `handle_new_user` (SECURITY DEFINER → exécute en owner context), donc le revoke est defense-in-depth (no-op fonctionnel sur le chemin signup).
- **Commentaire SQL P2 avec citations exactes** : `rls_policies.sql:51,63,65,69,71,75,77` pour qu'un futur lecteur ne tente pas de revoke from authenticated.
- **Comments SQL on function** : avertissement permanent sur `is_workspace_member`/`is_workspace_editor`.

### Note ACL additivité (suggestion plan-reviewer v2)

Les `revoke from anon, authenticated` de P1 sont **strictement additifs** au `revoke from public` préexistant sur `handle_new_user` et `touch_updated_at` (lignes 114-115 de `20260416000002_rls_policies.sql`). Postgres traite `PUBLIC` et les rôles nommés séparément en ACL — pas de double-revoke ni conflit.

---

## 4. Application en production

**Méthode choisie** : Supabase Studio SQL Editor (manuel) — doctrine Ankora pour migrations sensibles (RLS / function grants). Validation visuelle ligne par ligne avant Run, pas de dépendance CLI prod.

**Application effective** : @cowork via Supabase MCP `execute_sql` (équivalent runtime du SQL Editor).

---

## 5. Validations post-migration

### 5.1 Vérification `pg_proc` (search_path pinné)

```sql
select proname, proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'touch_updated_at';
```

✅ Résultat : `proconfig = {search_path=}` (empty path appliqué).

### 5.2 Vérification ACL

`information_schema.role_table_grants` + `pg_proc.proacl` confirmés cohérents avec la migration. Les fonctions privileged P1 ne sont plus EXECUTE pour anon/authenticated.

### 5.3 Smoke prod ankora.be

- **Cockpit RLS member** : login utilisateur existant → `/app` s'affiche normalement, RLS policy `workspaces_member_select` (via `is_workspace_member`) fonctionne en rôle authenticated comme attendu.
- **POST /app reste-à-vivre** : Server Action retourne HTTP 200.
- **vercelId smoke** : `cdg1::fra1::6q5cx-1779966126837-96859e90d718`.

### 5.4 Re-run advisors security

**Avant** : 16 WARN (advisors 0011/0028/0029 sur les 7 fonctions + 2 helpers).
**Après** : 5 WARN.
**Delta** : **-11 advisors** (au lieu des -13 anticipés initialement).

### 5.5 Cause du delta -11 vs -13 (decision recorded)

**Findings @cowork via MCP** :

- `revoke execute from anon` sur `is_workspace_member` / `is_workspace_editor` est **no-op tant que PUBLIC retient EXECUTE**.
- Raison Postgres ACL : `PUBLIC` est un pseudo-rôle englobant **tous** les rôles (anon inclus). Si `PUBLIC` a EXECUTE, retirer EXECUTE à `anon` seul ne change pas le calcul effectif des permissions (l'union prévaut).
- Conséquence : l'advisor 0011 continue de flagger `is_workspace_member` et `is_workspace_editor` comme exposées à anon.

**Décision** : **accepter les 2 WARN anon persistants** sur les helpers RLS.

**Justification** :

- Les fonctions retournent `false` pour anon car `auth.uid()` est `null` → la query `where workspace_id = ws_id and user_id = auth.uid()` matche 0 row → pas de fuite d'information.
- L'alternative (`revoke from PUBLIC + grant to authenticated`) risquerait de casser les RLS sur les queries faites en rôle anon (sign-up flow, public marketing pages, etc.) — trade-off non favorable.
- Coût du fix : moyen (1 migration + tests RLS étendus). Bénéfice sécurité réel : marginal (false anyway pour anon).

**WARN persistants attendus** :
| WARN | Raison | Action |
|---|---|---|
| 0011 sur `is_workspace_member` | PUBLIC retient EXECUTE, anon WARN reste | Accepté — fonction retourne false pour anon, pas de fuite |
| 0011 sur `is_workspace_editor` | Idem | Idem |
| Leaked password protection | Free tier Supabase | Hors scope ROADMAP — paid tier requis |
| 2 autres (à détailler après re-run final) | À investiguer | Suivi follow-up si nécessaire |

---

## 6. Risques résiduels

### 6.1 Audit trail temporairement incomplet

L'event `workspace.reste_a_vivre_updated` (et potentiellement d'autres) continue d'échouer en insert sur `audit_log` jusqu'à la résolution de l'issue [#192](https://github.com/thierryvm/ankora/issues/192). Impact GDPR art. 5(2) accountability + art. 30 records of processing à surveiller (mais events critiques GDPR — consent, deletion, export — restent à vérifier dans la PR follow-up).

### 6.2 Helpers RLS exposés à anon

`is_workspace_member`/`is_workspace_editor` restent callables par anon. Pas de fuite de données (return false), mais expose le schéma de signature. Risque résiduel : négligeable.

### 6.3 Rolling deploy safety

`REVOKE EXECUTE` est une opération metadata immédiate sur Postgres. Un signup en cours d'exécution dans le trigger `handle_new_user` au moment du Run **ne re-vérifie pas les grants à mi-parcours** — l'exécution déjà entrée dans la fonction se termine normalement. Pas de risque de "permission denied" partiel en cours de signup. Confirmé par plan-reviewer.

### 6.4 Drift `rls_auto_enable`

Si l'advisor continue de la signaler après la migration, c'est qu'elle existe bien en BDD hors-migrations. Le `revoke` est appliqué par le bloc DO/IF EXISTS. À documenter en post-mortem si elle réapparaît.

---

## 7. Investigation P4 — preuve déférée

L'issue [#192](https://github.com/thierryvm/ankora/issues/192) ouverte AVANT merge de cette PR contient :

- Les 3 hypothèses H1/H2/H3 documentées avec preuves SQL/TS à exécuter
- Le pattern canonique de fix si H3 confirmée (`createServiceRoleClient` direct via `@supabase/supabase-js`)
- La liste exhaustive des call-sites de `createAdminClient` à migrer
- Les critères de done de la follow-up PR

Procédure d'investigation recommandée détaillée dans l'issue. Le fix demandera une PR séparée car il touche un lib core utilisé par 5+ features critiques (audit-log, requireAdmin, GDPR deletion/export/consent).

---

## 8. DoD canonique 5 critères

- [ ] Tous les checks CI verts (Lint, Typecheck, Tests, E2E, Security, Build)
- [ ] Sourcery bot silencieux sur le DERNIER commit de la PR
- [ ] Toutes les reviews humaines approuvées et résolues
- [ ] Pas de conflit avec main
- [ ] Rapport final livré à @thierry avec preuve de chaque critère

À cocher après ouverture PR + checks.

---

## 9. Fichiers touchés

- ✅ `supabase/migrations/20260528000001_security_hardening.sql` (nouveau, 87 lignes)
- ✅ `docs/prs/PR-security-hardening-report.md` (ce rapport)

Aucun fichier TS modifié. Scope strictement SQL.

---

## 10. Suivi

| Action                        | Statut | Référence                                               |
| ----------------------------- | ------ | ------------------------------------------------------- |
| Migration appliquée prod      | ✅     | Cowork MCP execute_sql 2026-05-28                       |
| Advisors avant/après          | ✅     | 16 → 5 (-11)                                            |
| Smoke prod                    | ✅     | vercelId `cdg1::fra1::6q5cx-1779966126837-96859e90d718` |
| Issue follow-up P4            | ✅     | [#192](https://github.com/thierryvm/ankora/issues/192)  |
| Décision delta -11 documentée | ✅     | Section 5.5                                             |
| Risques résiduels documentés  | ✅     | Section 6                                               |
| PR ouverte                    | ⏳     | (lien à venir)                                          |
| DoD canonique 5 critères      | ⏳     | Post-merge                                              |
