# PR — fix(security) : le client service_role fuitait la session utilisateur (H3, #192)

**Branche** `fix/h3-service-role-client` · base `main` @ `f714221` · voie LOURDE
**Agent** @cc-ankora (Opus 5) · 26 juillet 2026

---

## 1. Le défaut, mesuré

`createAdminClient()` construisait un `createServerClient` de `@supabase/ssr` avec la clé
service_role **et** un adaptateur qui rendait les cookies de la requête. Le SDK y trouvait
une session et envoyait le JWT utilisateur en `Authorization` à la place de la clé. Le
client retombait en rôle `authenticated`, à qui `audit_log` est révoqué
(`20260416000002_rls_policies.sql:110`) et explicitement nié (`20260417000003`).

Deux inserts, **même clé, même base, même table**, seul le bocal à cookies change :

```
service_role, SANS cookie          INSERTED
service_role, AVEC cookie session  DENIED  [42501] permission denied for table audit_log
```

**Antériorité** : c'est H3, [issue #192](https://github.com/thierryvm/ankora/issues/192),
ouverte le 28 mai, `type:security`, sortie du scope de la PR security-hardening
(`PR-security-hardening-report.md:23,85,204`). Elle y était qualifiée de « piste forte ».
Elle n'avait jamais été mesurée.

### Portée réelle sur l'application

`logAuditEvent()` est appelé depuis **toutes** les Server Actions, qui tournent **toutes**
avec un cookie de session. Mesure sur un build non corrigé, stack locale, après une
connexion réussie **et** un renommage de compte :

| Événement             | Contexte                    | Dans `audit_log` ? |
| --------------------- | --------------------------- | ------------------ |
| `auth.rate_limited`   | avant toute session         | ✅ 81 lignes       |
| `auth.password_reset` | avant toute session         | ✅ 3 lignes        |
| `auth.login`          | session écrite dans l'appel | ❌ **jamais**      |
| `account.renamed`     | Server Action authentifiée  | ❌ **jamais**      |

Le journal ne contenait que ce qui était émis **avant** l'existence d'un cookie.
`logAuditEvent` avalant son erreur (`log.error`, jamais de `throw`), rien ne l'a signalé
pendant trois mois.

**Non vérifié en production** : la même migration `revoke` s'y applique, donc l'inférence
est forte, mais deux tentatives de lecture d'agrégats (CLI puis connecteur Supabase) ont
été refusées par le classifieur. **À confirmer par @thierry** — une requête suffit :

```sql
select event_type, count(*), max(occurred_at)
from public.audit_log group by 1 order by 2 desc;
```

Si `charge.created`, `expense.created`, `account.renamed` y sont absents alors que
`auth.rate_limited` est présent, la production a le même trou et il faut le dire dans le
registre RGPD (art. 5(2), accountability).

## 2. Ce qui change

| Fichier                         | Changement                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/supabase/admin.ts`     | **nouveau** — `createServiceRoleClient()`, sans cookies, sans storage, refus explicite d'exécution navigateur |
| `src/lib/supabase/server.ts`    | `createAdminClient` **supprimé**, remplacé par un commentaire qui dit pourquoi il ne doit pas revenir         |
| `src/lib/security/audit-log.ts` | repointé ; `error_code` ajouté au log d'échec — c'est `42501` qui aurait nommé ce bug en dix secondes         |
| `src/lib/gdpr/export.ts`        | repointé (son commentaire ligne 7 promettait déjà ce comportement)                                            |
| `src/lib/gdpr/deletion.ts`      | repointé ×3 ; erreur de pseudonymisation **capturée** ; `resource_id` retiré                                  |

### Deux défauts que ce correctif ACTIVAIT

1. **Ré-identification post-pseudonymisation.** `executeDeletion` journalisait
   `GDPR_DELETION_COMPLETED` avec `resource_id: userId` **après** avoir mis
   `audit_log.user_id` à `NULL`. Invisible tant que l'insert échouait ; dès qu'il passe,
   l'UUID du compte supprimé réapparaît de façon permanente une ligne après son
   effacement — le jsonb n'est pas cascadé par `on delete set null`. C'est exactement le
   motif pour lequel `attempted_user_id` avait déjà été retiré de l'allow-list.
2. **Erreur de pseudonymisation non lue.** Le résultat n'était même pas capturé : un refus
   laissait les lignes identifiantes en place pendant que la suppression continuait.

## 3. Preuve

**Rouge avant, vert après** — la même spec, contre le même serveur, avant et après le
correctif :

```
build non corrigé : 1 failed  — "auth.login never reached audit_log"
build corrigé     : 1 passed
```

**Falsification des garde-fous unitaires** — module saboté (clé remplacée +
`import 'next/headers'` ajouté) : 2 échecs sur 3, puis restauration et retour au vert.
Un test qui ne peut pas échouer ne prouve rien ; ces deux-là peuvent.

| Vérification                      | Résultat                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `npm run typecheck`               | 0 erreur                                                  |
| `npm run lint`                    | 0 erreur (9 warnings préexistants)                        |
| `npm run lint:use-server`         | 0 erreur                                                  |
| `npm run test`                    | **132 fichiers, 1708 tests**                              |
| Job authentifié (local)           | **25 passed** — plancher relevé 24 → 25, mesuré           |
| Spec sous env public factice      | **skipped**, pas échouée → plancher public inchangé (215) |
| `node scripts/e2e-auth-specs.mjs` | 14 specs, 8 exécutées, 6 en quarantaine                   |

## 4. Tests ajoutés

- `src/lib/supabase/__tests__/admin.test.ts` — assertion sur le **contrat réseau** (la
  requête porte-t-elle `apikey` ET `Authorization: Bearer <service_role>` ?), refus
  navigateur, et interdiction statique des imports `@supabase/ssr` / `next/headers`.
  Cette dernière est assumée comme un **lint** — mais c'est le garde-fou porteur pour
  cette régression précise, car un test unitaire ne peut pas reproduire le bug réel
  (il faut une session vivante et une vraie base).
- `src/lib/gdpr/__tests__/deletion.test.ts` — **premier test de `src/lib/gdpr/`**, qui
  n'en avait aucun : arrêt avant destruction si la pseudonymisation échoue, absence de
  `resource_id`, propagation d'un échec de suppression de workspace.
- `e2e/audit-log.spec.ts` — parcours connecté réel, deux chemins (`auth.login` et
  `account.renamed`), assertions **avant** la suppression de l'utilisateur semé (la
  supprimer d'abord effacerait la preuve).

## 5. Hors périmètre, assumé

Complétion de l'export RGPD aux 14 tables, Zod sur `recordCookieConsentAction`, file de
suppression + cron, purge `audit_log`, THI-206. Chacun aura sa PR.

**`executeDeletion` n'a toujours aucun appelant** (`settings.ts` ne câble que
`requestDeletion`, `cancelDeletion`, `exportUserData`). Personne ne doit lire cette PR
comme « la suppression de compte fonctionne » : elle rend correct un code qui n'est pas
encore branché. C'est l'objet de l'étape 3b.

## 6. Décision demandée à @thierry

**Dépendance `server-only` — non ajoutée, volontairement.** L'ancien client importait
`next/headers`, ce qui faisait **échouer le build** si un composant `'use client'`
l'importait. Le nouveau module perd ce garde-fou machine. `server-only` (Vercel, ~1 Ko,
gratuit) le restituerait.

Je ne l'ai pas installée : la doctrine exige une validation explicite pour toute nouvelle
dépendance, et « carte blanche » n'est pas cette validation. En attendant, deux garde-fous
sans dépendance : un refus d'exécution navigateur au runtime, et le test statique
d'imports. Précision utile pour trancher — le risque n'est **pas** une fuite de clé : Next
n'inline pas les variables non `NEXT_PUBLIC_*`, donc un import accidentel donnerait
`undefined` et une erreur obscure, pas un secret dans le bundle.

## 7. Definition of DONE

| #   | Critère                                   | État          |
| --- | ----------------------------------------- | ------------- |
| 1   | CI verte (4 checks requis + Build)        | ⏳ après push |
| 2   | Sourcery silencieux sur le dernier commit | ⏳            |
| 3   | Threads de revue résolus                  | ⏳            |
| 4   | `mergeStateStatus: CLEAN`                 | ⏳            |
| 5   | Ce rapport                                | ✅            |

## 8. Observation annexe

`e2e/dashboard-account-rename.spec.ts` a échoué une fois puis passé au rejeu : elle est
sensible au démarrage à froid quand elle est le **premier** trafic servi par un serveur de
production fraîchement lancé. En CI `auth.spec.ts` passe avant et chauffe le serveur. Pas
un défaut produit, mais une fragilité à connaître avant d'accuser le code.
