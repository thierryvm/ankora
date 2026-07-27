---
project: ankora
type: cc-handoff
date: 2026-07-27
agent: cc-ankora
model: claude-opus-5
---

# Handoff — 27 juillet 2026, 21h00 · Étape 3B / PR-B : le cron est écrit, il n'est pas armé

> **Le fait à lire en premier** : `CRON_SECRET` **n'existe pas** dans l'environnement de
> production Vercel, et `vercel crons ls` rend `not deployed`. Le code capable de supprimer
> un compte est donc mergé et **inerte**. C'est la pose du secret qui arme, et elle est
> **bloquée** par [#285](https://github.com/thierryvm/ankora/issues/285).

---

## 1. État git brut

```
$ git rev-parse --abbrev-ref HEAD
main

$ git log --oneline -3
b74ad15 feat(gdpr): armer la file — la route qui peut enfin supprimer un compte (#284)
207c064 docs(handoff): étape 3B/PR-A — et le fait que le merge a devancé le handoff (#283)
d386aae feat(gdpr): la file de suppression, inerte — le schéma sans l'exécuteur (#282)

$ git status --short
(vide)
```

Branches nettoyées : `docs/handoff-2026-07-27`, `docs/handoff-3b-a`,
`feat/3b-b-cron-arming` — toutes `[gone]` après prune.

## 2. PR en vol

**Aucune.** Les trois PR de la session sont mergées : #282 (file inerte), #283 (handoff
PR-A), #284 (armement). L'étape 3B est **livrée côté code**.

## 3. Ce qui est en production, et ce qui ne l'est pas

|                                                | État                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Migrations `20260727000001` + `20260727000002` | **appliquées** sur `ankora-prod`                                    |
| Route `/api/cron/gdpr`                         | **déployée**, répond 401 à tout                                     |
| `vercel.json` → `crons`                        | **déployé**                                                         |
| `CRON_SECRET` dans Vercel                      | **ABSENT** — mesuré                                                 |
| `vercel crons ls`                              | **`not deployed`** — mesuré                                         |
| Délai annoncé                                  | **14 jours** partout (code, 5 locales, README, SECURITY, llms-full) |

**Rien ne peut supprimer un compte aujourd'hui.** Mais la politique et les CGU annoncent
désormais « suppression effective 14 jours après la demande » — donc **l'écart entre ce qui
est promis et ce qui se fait existe dès maintenant**, et il se referme en posant le secret.
C'est la seule raison de ne pas laisser traîner.

## 4. Le piège qui bloque la pose du secret — issue #285

`claim_pending_deletions` réclame **par `order by scheduled_for`**, lot de 25, et il
n'existe **aucune colonne `attempts`** : une ligne après 1 échec et après 300 sont
identiques en base. **25 lignes empoisonnées affament la file pour toujours.**

Pendant ce temps l'écran affiche « La suppression de ton compte a commencé. Elle ne peut
plus être annulée » **et retire le bouton d'annulation**. On a retiré la sortie **et** on ne
tient pas la promesse. Le bug d'origine était au moins réversible ; celui-ci ne l'est pas.

**Le préalable, relevé par @thierry** : la reprise fait
`set status='pending', claimed_at = null`. **Elle efface la seule trace qu'une tentative a
eu lieu.** Même avant d'ajouter un compteur, on ne distingue déjà plus une ligne jamais
tentée d'une ligne tentée trois cents fois. Quelle que soit la conception retenue, **elle
doit cesser d'effacer**.

## 5. Décisions prises cette session

- **Le plancher e2e public a été BAISSÉ**, de 227 annoncé à **224**. `silent-failure-auditor`
  a mesuré que `CRON_SECRET` n'est défini dans aucun bloc `env` de `ci.yml` : les cas
  sortaient par la première branche de la route et n'atteignaient jamais la comparaison de
  secret. Un cas affirmait que les deux refus sont indiscernables — en CI ils sont la même
  branche, l'assertion ne pouvait pas échouer. Retiré. **Un plancher bâti sur une
  tautologie inspire une confiance qu'il ne mérite pas.**
- **`CRON_SECRET` est `optional()` même en production**, et la route refuse en son absence.
  Le motif Upstash (requis via `superRefine`) aurait cassé le build CI, et le réparer aurait
  demandé d'éditer `.github/workflows/` — action bannie en PR feature.
- **Pas de `rateLimit()` sur la route** : `rate-limit.ts` échoue **fermé** en production, donc
  une panne Upstash bloquerait l'exercice d'un droit RGPD. Résidu nommé dans ADR-024.
- **Les corrections de commentaires des migrations livrées vivent dans l'ADR et les
  rapports, pas dans les fichiers** : `schema_migrations` porte une colonne `statements`.
- **`purged: null` + `purgeOk: false`** en cas d'échec de purge : `purged: 0` est **aussi** la
  réponse saine jusqu'à ~avril 2027 (`audit_log` naît le 16 avril 2026), donc « cassé » et
  « rien à faire » s'écrivaient identiquement pendant neuf mois.

## 6. Décisions en attente @thierry

- **Lecture n° 5** — combien de comptes le **premier** run détruirait-il ? À faire **avant**
  de poser le secret, pas avant de merger :
  ```sql
  select count(*) as due_now, min(scheduled_for) as oldest, max(scheduled_for) as newest
  from public.deletion_requests where status = 'pending' and scheduled_for <= now();
  ```
  `due_now > 0` est une **décision produit** : ces demandes ont été formulées sous la
  promesse « 30 jours » et leur fenêtre s'est écoulée pendant que **rien n'exécutait**.
- **Lecture n° 4** — privilèges des 9 fonctions sur l'hébergé. Transmise le 27 juillet,
  **non revenue**. Elle conditionne la PR grants, pas l'armement.

## 7. Garde-fous activés

- Modèle : **Opus 5** ✅ · `npm run preflight` : **GO** avant chaque opération sortante
- `npm run lint:use-server` ✅ · branch protection `main` ✅ (4 checks requis)
- Agents QA passés : `plan-reviewer` 🟡, `i18n-auditor` PASS_WITH_NOTES,
  `gdpr-compliance-auditor` COMPLIANT_WITH_NOTES, `test-quality-auditor` PASS WITH GAPS,
  `rls-flow-tester` **PASS**, `security-auditor` **BLOCK levé**,
  `silent-failure-auditor` **SILENT_FAILURE_CONFIRMED**
- **Sourcery : `skipping` sur #282 et #284** — plafond hebdomadaire de 500 000 caractères
  atteint. Les deux PR ont été mergées **sans revue automatique**, sciemment. À ne jamais
  compter comme un vert.

## 8. Next action concrète

**Amender `docs/adr/ADR-024-file-de-suppression-de-compte.md` avec la conception retenue
pour l'issue #285** — arrêt de l'effacement de `claimed_at`, comptage des tentatives, seuil
de quarantaine, honnêteté de l'écran dans cet état — puis STOP. La migration s'exécute en
session N+1, doctrine projet.

## 9. Anti-pièges

- **NE PAS poser `CRON_SECRET` avant le correctif de #285.** L'issue porte l'interdit.
- **NE PAS poser le secret sans redéployer.** Les variables Vercel sont figées dans un
  déploiement : poser après coup, ou faire tourner sans redéployer, donne un **401 quotidien
  sans aucun log** — `expected` est alors défini, juste faux. Ordre indivisible :
  **poser → redéployer → `vercel crons ls` → run manuel file vide**.
- **NE PAS rejouer les migrations `20260727000001` / `20260727000002`**, ni les éditer.
- **NE PAS croire que `log.error` est une détection** : ni drain de logs, ni alerte, ni
  Sentry. Personne n'est abonné.
- **NE PAS se servir du MCP Supabase pour vérifier la production** : il est branché sur le
  **premier** compte et ne voit que `goldteam`.
- **NE PAS supposer qu'un test local prouve un privilège de l'hébergé** : `postgres` porte
  `rolbypassrls = t` en local.
- **NE PAS lancer un agent QA doté de Bash** sur le répertoire depuis lequel on commite sans
  appliquer les 3 règles de `CLAUDE.md` (chemins explicites, `git diff --cached --stat`
  avant chaque commit, mutations hors de l'arbre).
- **NE PAS exécuter un prompt tagué `@cc-goldteam`** — autre projet, autre compte
  (`ovb-willemot`). Un tel prompt est arrivé dans cette session le 27 juillet et n'a pas
  été exécuté.

---

## Annexes

### Suites, par ordre

1. **#285** — amendement ADR-024 (session N), migration + écran (session N+1). **Bloque la
   pose du secret.**
2. **Lectures n° 5 et n° 4**.
3. **Armement** : poser → redéployer → `vercel crons ls` → run manuel file vide.
4. **PR `.github/workflows/`** — poser `CRON_SECRET` (faux de 32 caractères) dans l'env du
   job e2e public : 9 cas vains deviennent réels, plus le cas qui manque partout, **un 200
   sur HTTP avec le bon secret**. PR dédiée, l'édition des workflows étant bannie en PR
   feature.
5. **PR grants** — `revoke execute … from public, anon` sur `is_workspace_member` /
   `is_workspace_editor` (garder `authenticated`, les policies RLS les invoquent), et
   `from public, anon, authenticated` sur `assert_rls_coverage()` et `touch_updated_at()`.
   **Nommer `public`** : le revoke de mai a retiré le grant nominatif à `anon` mais laissé
   celui à `PUBLIC`, dont `anon` héritait — la migration de mai n'a rien changé.
   Les deux révocations sont **mesurées sûres** (`updated_at` bouge toujours après le
   revoke ; `assert_rls_coverage` n'a aucun appelant).
6. **Dettes nommées** : #278 (art. 17, e-mail en clair dans `auth.audit_log_entries`,
   **effectif dès l'armement**), lignes `audit_log` à `user_id: null` non attribuables,
   `completed` inatteignable (code mort dans l'écran de statut), art. 5(2) sans preuve
   d'effacement, `src/lib/supabase/types.ts` généré par une autre version de CLI, test de
   frontière de module aveugle aux imports dynamiques.

### Planchers e2e

| Job                              | Plancher       | Mesuré                                        |
| -------------------------------- | -------------- | --------------------------------------------- |
| `Playwright E2E`                 | **224 passed** | log CI `8923e93` : `224 passed / 193 skipped` |
| `Playwright E2E (authenticated)` | **31 passed**  | log CI `8dacbcc` : `31 passed`                |

Chacun mesuré **deux fois** : en local avant push, puis relevé dans le log du job.

### Liens

- Rapports : `docs/prs/PR-3B-A-report.md`, `docs/prs/PR-3B-B-report.md`
- ADR : `docs/adr/ADR-024-file-de-suppression-de-compte.md` (amendé le 27/07)
- Plan : `docs/plans/step-3b-deletion-queue.md`
- Registre conformité : `docs/compliance/2026-07-27-registre-defaillance-journal-audit.md` §6.5
- Issues : #278 (art. 17), **#285 (blocage de tête de file — bloque l'armement)**
