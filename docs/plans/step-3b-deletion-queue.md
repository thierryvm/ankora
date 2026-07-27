# Étape 3b — plan d'exécution : brancher la file de suppression de compte

> **Décisions** : [ADR-024](../adr/ADR-024-file-de-suppression-de-compte.md) (conception) et
> [ADR-023](../adr/ADR-023-delai-de-grace-suppression-de-compte.md) (délai 30 → 14 jours).
> Ce document ne re-litige aucune décision : il dit **comment** et **dans quel ordre**.
>
> **Prérequis de session** : Phase 0 model check (Opus), `npm run preflight` → GO.
> Revu par `plan-reviewer` (3 tours). Décisions écrites en session N ; exécution en N+1.

---

## Étape 0 — Ouvrir la branche

```bash
git checkout main && git pull --ff-only
git checkout -b feat/3b-a-deletion-queue     # PR-A
```

PR-B partira de `main` **après** le merge de PR-A, sur `feat/3b-b-cron-arming`.

---

# PR-A — la file d'attente, inerte

**Invariant de la PR** : `executeDeletion` n'acquiert aucun appelant. Rien ne peut
supprimer un compte à l'issue de ce merge.

## A1. Migration `supabase/migrations/20260727000001_deletion_queue.sql`

**a) Statut `processing` + `claimed_at`**

```sql
alter table public.deletion_requests
  drop constraint if exists deletion_requests_status_check;
alter table public.deletion_requests
  add constraint deletion_requests_status_check
  check (status in ('pending','processing','cancelled','completed'));
alter table public.deletion_requests add column if not exists claimed_at timestamptz;
```

`if exists` : le nom auto-généré est déterministe, mais une migration qui touche à la
suppression de comptes n'a pas le droit d'échouer sur un pari.

**b) Collapse défensif des doublons, puis index unique partiel**

```sql
update public.deletion_requests d
   set status = 'cancelled', cancelled_at = now()
 where d.status = 'pending'
   and exists (select 1 from public.deletion_requests d2
                where d2.user_id = d.user_id and d2.status = 'pending'
                  and d2.requested_at > d.requested_at);

create unique index if not exists deletion_requests_one_active_idx
  on public.deletion_requests(user_id)
  where status in ('pending','processing');
```

La plus récente survit ; personne ne perd sa demande. L'index couvre **les deux** statuts
actifs, sinon la remise en file violerait sa propre contrainte.

> ⚠️ **Cette instruction écrit en production.** Le push est verrouillé par la lecture n° 2
> (§Lectures production). Reporter le nombre de lignes affectées dans le rapport de PR.

**c) `claim_pending_deletions`**

```sql
create or replace function public.claim_pending_deletions(batch_size integer)
returns table(request_id uuid, target_user_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- INVARIANT : ce seuil d'1 h DOIT rester supérieur au `maxDuration` de
  -- src/app/api/cron/gdpr/route.ts (60 s). Les deux valeurs forment un couple :
  -- si un run vivant dépasse le seuil, le run suivant lui vole son lot et le
  -- même compte est supprimé deux fois.
  --
  -- `claimed_at`, PAS `requested_at` : une ligne n'étant réclamable qu'à
  -- `scheduled_for <= now()`, soit 14 jours après `requested_at`, un test sur
  -- `requested_at` serait TOUJOURS vrai et remettrait en file toutes les lignes
  -- `processing` à chaque run — y compris celles qu'un run concurrent traite.
  update public.deletion_requests
     set status = 'pending', claimed_at = null
   where status = 'processing'
     and claimed_at < now() - interval '1 hour';

  return query
  with claimed as (
    update public.deletion_requests
       set status = 'processing', claimed_at = now()
     where id in (
       select id from public.deletion_requests
        where status = 'pending' and scheduled_for <= now()
        order by scheduled_for
        limit greatest(1, least(batch_size, 100))
        for update skip locked
     )
    returning id, user_id
  )
  select id, user_id from claimed;
end $$;

revoke execute on function public.claim_pending_deletions(integer) from public;
grant  execute on function public.claim_pending_deletions(integer) to service_role;
```

Forme `with claimed as (update … returning) select` **mesurée en local** : appel 1 →
réclame la ligne due **et** la ligne bloquée depuis 2 h, ignore la ligne future et la
`processing` récente ; appel 2 immédiat → 0 ligne.

`revoke from public` **avant** le `grant` (advisor 0028 : Postgres accorde `EXECUTE` à
`PUBLIC` à la création ; révoquer pour `anon` seul ne retire rien).

**d) Politiques** — cf. ADR-024 D3.

```sql
drop policy "deletion_self_insert" on public.deletion_requests;

drop policy "deletion_self_update" on public.deletion_requests;
create policy "deletion_self_update" on public.deletion_requests
  for update using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'cancelled');
```

**e) `purge_audit_log_older_than_12_months()` → `security invoker`**, corps inchangé.

## A2. Régénérer les types — après le push, avant le typecheck

`npm run supabase:types` est `--linked`, donc lit **la production**. Séquence obligatoire :

```bash
npm run preflight                 # GO exigé
supabase db push --linked         # applique la migration
npm run supabase:types            # régénère src/lib/supabase/types.ts
npm run typecheck
```

Sans cette étape, `admin.rpc('claim_pending_deletions', …)` ne typecheckera pas — et un
`any` est interdit.

## A3. `src/lib/gdpr/deletion-core.ts` — nouveau, **sans** `import 'server-only'`

Reçoit le client Supabase en paramètre (ADR-024 D5). Contient l'orchestration :

- `pseudonymiseAuditLog(client, userId)` — **0 ligne = succès**, seule une `error` lève.
- `executeDeletionWith(client, userId)` — scrub, puis `auth.admin.deleteUser`.
  **« user not found » compte comme un succès** (ADR-024 D1), sinon la ligne devient une
  pilule empoisonnée réclamée et échouée chaque jour.
- `claimPendingDeletionsWith(client, limit)`.

## A4. `src/lib/gdpr/deletion.ts` — l'enveloppe `server-only`

Injecte `createServiceRoleAdminClient()` / `createServiceRoleClient()` et ré-exporte.
Plus :

- `executeDeletion` : le `delete from workspaces` disparaît (redondant, cascade depuis
  `users`). `logAuditEvent(GDPR_DELETION_COMPLETED)` reste **ici et nulle part ailleurs**.
- En-tête réécrit : la cascade **ne** couvre **pas** `auth.audit_log_entries` (issue #278).
  Y inscrire aussi l'invariant du rayon de destruction (`created_by`, ADR-024).
- `requestDeletion` : capture `23505` → renvoie le `scheduled_for` existant.
- `cancelDeletion` : `.select('id')`, retour typé
  `{ cancelled: true } | { cancelled: false; reason: 'in_progress' | 'none' }`.

## A5. `src/lib/actions/settings.ts`

`cancelAccountDeletionAction` traite les trois issues. **Aucun
`logAuditEvent(GDPR_DELETION_CANCELLED)` si rien n'a été annulé.** `in_progress` →
`errors.settings.deletionCancelTooLate`.

## A6. UI + i18n

`deletion-status/page.tsx` : branche `processing` (aujourd'hui un statut inconnu affiche
« Complétée » en rouge). Libellé propre, `text-warning`, **bouton d'annulation retiré**.

Trois clés × 5 locales, rédigées **dans la langue cible** (parcours destructif, la dette de
traduction ne s'applique pas ici) : `app.deletionStatus.statusProcessing`,
`app.deletionStatus.processingBody`, `errors.settings.deletionCancelTooLate`.

## A7. Tests — et où chacun s'exécute réellement

**Vitest, job `quality` (`ci.yml:14-35`) — aucun Supabase, `@/lib/env` mocké.** Donc
**aucune assertion de schéma ici**. Tout fichier touchant `admin.ts` porte
`// @vitest-environment node` (`assertServer()` refuse sous jsdom).

- `cancelDeletion` : `pending` → `{cancelled:true}` ; `processing` → `'in_progress'` ;
  aucune ligne → `'none'` ; l'action **n'émet pas** d'audit dans les deux derniers cas.
- `requestDeletion` : `23505` → renvoie l'existant.
- `executeDeletionWith` : une pseudonymisation en `error` **empêche** `deleteUser` ;
  **0 ligne pseudonymisée n'empêche rien** ; « user not found » → succès.
- `executeDeletion` (l'enveloppe) : **un seul** `logAuditEvent`, et aucun quand la
  pseudonymisation ou GoTrue échoue. Corrigé le 27 juillet : cette assertion était
  attribuée à `executeDeletionWith`, qui ne journalise rien — la garantie n'aurait donc
  été vérifiée nulle part.

**Tests existants à refondre** — à faire, pas à découvrir :
`src/lib/gdpr/__tests__/deletion.test.ts:110-115` (« propagates a workspace deletion
failure ») meurt avec la suppression du `delete from workspaces` ; `:94` change ;
`:126-137` (30 jours) migre en PR-B ; le faux client `:24-36` n'a pas de `.select()`,
qu'exigent `cancelDeletion` et `requestDeletion` revus.

**Job `Playwright E2E (authenticated)`** — le seul avec une vraie base. Nouvelle spec
utilisant `adminClientOrNull` :

- Chemin destructeur **de bout en bout** sur un utilisateur jetable (possible grâce à A3) :
  comptes de lignes **exacts** sur chaque table fille, `audit_log` conserve N lignes avec
  `user_id`/`ip_address`/`user_agent` à `NULL`.
- `claim_pending_deletions` : J+15 réclamée, J+13 non ; second appel immédiat → 0 ligne ;
  `processing` de 2 h reprise, de 5 min **non**.
- Seconde insertion `pending` pour le même utilisateur → violation d'unicité.
- Un JWT `authenticated` ne peut plus insérer du tout, ni passer sa ligne à `processing`.

**Deux pièges CI, tous deux rouges en quelques secondes si oubliés :**

1. Ajouter le chemin de la spec à `e2e/authenticated-specs.json` **dans le même commit** —
   `Verify authenticated spec selection` (`ci.yml:173-174`) échoue dans les deux sens.
2. La spec porte `test.skip(!admin, …)` : le job **public** la découvre aussi, et y
   `adminClientOrNull()` rend `null` (clé factice trop courte).

**Planchers e2e : mesurés avant push, jamais annoncés.** Une spec publique tourne dans
plusieurs projets Playwright ; le job authentifié n'en lance que deux, dont l'un filtré sur
`**/mobile-ios/**`. Relever la ligne du reporter et l'inscrire dans `CLAUDE.md`.

**Falsification obligatoire** : chaque test rejoué contre le code non corrigé, rouge copié
dans le rapport.

---

# PR-B — l'armement

## B1. `src/app/api/cron/gdpr/route.ts`

`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, **`maxDuration = 60`** — explicite, et
commenté avec l'invariant : _doit rester inférieur au seuil de reprise d'1 h de
`claim_pending_deletions`_.

1. **401 par défaut** : en-tête absent, ne commençant pas par `Bearer `, mauvais jeton.
   `timingSafeEqual` **jette** sur des longueurs inégales → **SHA-256 des deux côtés, puis
   `timingSafeEqual` sur les deux digests de 32 octets**.
2. **`CRON_SECRET` absent de l'environnement → 401 aussi, mais `log.error`.** Une panne de
   configuration doit crier ; un mauvais jeton doit rester muet. Indiscernables côté
   appelant.
3. `claimPendingDeletions(25)`.
4. Boucle, **chaque erreur isolée** (Vercel ne réessaie jamais un cron). Chaque échec émet
   un `log.error` structuré portant le **`request_id`, jamais le `user_id`**.
5. `purge_audit_log_older_than_12_months()` en fin de run.
6. Réponse `{ claimed, deleted, failed, purged, capped }` — aucune donnée personnelle.
   `capped === true` émet aussi un `log.error` : le plafond ne sert pas à limiter, il sert
   à **rendre visible** le jour où 25 lignes arrivent d'un coup.

Pas de `rateLimit()` — décision et résidu documentés dans ADR-024.

## B2. `vercel.json`, `env.ts`, `.env.example`

```json
"crons": [{ "path": "/api/cron/gdpr", "schedule": "0 3 * * *" }]
```

`CRON_SECRET` : `z.string().min(32).optional()` — **optionnel même en production**. Le
motif Upstash (requis via `superRefine`) casserait le build CI, et le réparer demanderait
d'éditer `ci.yml` : **action bannie en PR feature**. Le refus vit dans la route.

## B3. Délai 30 → 14 jours — huit sites hors i18n, deux publics

| Site                                        | Nature                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `src/lib/gdpr/deletion.ts:26`               | la constante                                                         |
| `src/lib/gdpr/deletion.ts:5`                | en-tête                                                              |
| `src/lib/actions/settings.ts:189`           | commentaire                                                          |
| `README.md:65`                              | **dépôt public**                                                     |
| `SECURITY.md:54`                            | **dépôt public**                                                     |
| `docs/ARCHITECTURE.md:85,115,116`           | 3 mentions                                                           |
| `docs/ankora-product-quality-bar-v1.md:193` |                                                                      |
| `public/llms-full.txt:146`                  | régénéré par `prebuild` — **committer le diff**, ne pas le restaurer |

Plus 25 chaînes i18n : lignes **359, 423, 467, 946, 952** de chacun des 5 `messages/*.json`.
Plus le test de date (`deletion.test.ts:126-137`).

## B4. Tests de PR-B

- **Vitest** : 401 sans en-tête / `Bearer` vide / mauvais secret / secret absent de l'env
  (+ `log.error` dans ce seul cas) ; 200 avec le bon. Isolation d'erreur : 3 réclamés, le
  2ᵉ lève → `{deleted:2, failed:1}` et les deux autres réellement supprimés. `capped`
  vrai/faux. `scheduled_for` à J+14 (±1 s).
- **e2e public** : `GET /api/cron/gdpr` sans secret → 401. Plancher **mesuré**.

## B5. Vérification d'armement — post-merge, dans le DoD

Un cron qu'on n'a jamais vu répondre 200 en production n'est pas livré :

1. `CRON_SECRET` posé dans Vercel (≥ 32 octets, généré **localement**, jamais dans une URL).
2. `vercel crons ls` → la tâche apparaît réellement armée.
3. Déclenchement manuel **file vide** → `{ claimed: 0 }` et 200.

---

## Lectures production — trois, aucune écriture

À faire passer à @thierry. Rappel : **deuxième** compte Supabase ; le signe qui les
distingue est la colonne `event_type` sur `audit_log`.

```sql
-- 1. Un workspace a-t-il plus d'un membre ? (rayon de destruction)
select workspace_id, count(*) as members
from public.workspace_members group by 1 having count(*) > 1;

-- 2. Des demandes `pending` en double ? (verrou du push de PR-A)
select user_id, count(*) from public.deletion_requests
 where status = 'pending' group by 1 having count(*) > 1;

-- 3. Le journal d'audit enregistre-t-il depuis la PR #273 ?
select event_type, count(*) from public.audit_log group by 1 order by 2 desc;
```

- **1 et 2 doivent renvoyer zéro ligne.** La n° 2 verrouille le `supabase db push` de PR-A.
- **La n° 3 est un NO-GO de PR-B** si `auth.login` et les `gdpr.*` restent absents après le
  27 juillet : toute la conception repose sur un chemin PostgREST `service_role` jamais
  re-vérifié en production depuis le correctif.
- Si la n° 1 renvoie une ligne : **stop**, décision produit à porter à @thierry.

---

## Rollback

Un rollback de déploiement Vercel **ne désarme pas** un cron actif.

1. **Désarmer** : retirer `crons` de `vercel.json` et redéployer. Vérifier par
   `vercel crons ls` — pas par supposition.
2. **Code** : revert de PR-B.
3. **Données** :
   ```sql
   update public.deletion_requests set status = 'pending', claimed_at = null
    where status = 'processing';
   ```
   Sans elle, toute demande en vol au moment du rollback reste gelée pour toujours.
4. **Migration** : additive, sauf deux politiques — **plus restrictives** que les
   précédentes, donc sans danger si le code revient en arrière. La contrainte `check`
   élargie accepte l'ancien jeu de valeurs.

---

## Definition of Done — les 5 critères, énumérés

1. Tous les checks CI verts : `Lint + Typecheck + Unit Tests`, `Security audit`,
   `Playwright E2E`, `Playwright E2E (authenticated)`.
2. **Sourcery silencieux sur le dernier commit** :
   `gh api repos/thierryvm/ankora/pulls/<N>/comments --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'`
   → vide. Relire après **chaque** push. Un plafond hebdomadaire atteint n'est **pas** un
   silence approbateur : le dire.
3. Reviews humaines approuvées et résolues.
4. `mergeStateStatus: CLEAN` — aucun conflit avec `main`.
5. Rapport livré : `docs/prs/PR-3B-A-report.md` puis `PR-3B-B-report.md`, avec preuve
   rouge-avant / vert-après de chaque test, les trois lectures production, le nombre de
   lignes affectées par le collapse, la vérification d'armement, et l'écart art. 17 de
   l'issue #278 énoncé sans euphémisme.

## Agents QA

- **PR-A** : `rls-flow-tester` (politiques + sens privilégié), `gdpr-compliance-auditor`,
  `i18n-auditor`, `test-quality-auditor`, `test-runner`.
- **PR-B** : `security-auditor` (route publique, secret, exemption `rateLimit`),
  `silent-failure-auditor` (le cron est-il armé ? la panne est-elle visible ?),
  `i18n-auditor`, `test-runner`.

## Résidus acceptés, nommés

- **Interblocage théorique** : l'`update` de reprise n'a ni `order by` ni `limit`. Deux
  resets concurrents pourraient se verrouiller en ordre inverse. Sur 5 comptes et un cron
  quotidien, négligeable.
- **Endpoint public non compté** sur un plan où l'invocation est la ressource rare. Le 401
  avant toute E/S borne le coût au CPU.
- **`completed` / `completed_at` inatteignables** (ADR-024 D1) : la ligne cascade avec le
  compte. La branche « Complétée » de l'écran de statut est du code mort — la laisser, ou
  la retirer dans une PR d'hygiène séparée.
