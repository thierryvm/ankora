# PR-3B-A — la file de suppression, inerte

**PR** : [#282](https://github.com/thierryvm/ankora/pull/282) · **Branche** :
`feat/3b-a-deletion-queue` · **Base** : `main` @ `72f9fa6`
**Décisions** : [ADR-024](../adr/ADR-024-file-de-suppression-de-compte.md) ·
**Plan** : [step-3b](../plans/step-3b-deletion-queue.md)
**Agent** : @cc-ankora (Claude Opus 5) · **Date** : 27 juillet 2026

---

## 1. L'invariant, et comment il est tenu

`executeDeletion` **n'acquiert aucun appelant**. Rien ne peut supprimer un compte à
l'issue de ce merge.

Vérifiable en une commande — la seule occurrence hors définition et hors tests est
l'export du module :

```bash
grep -rn "executeDeletion" src/ --include=*.ts --include=*.tsx | grep -v __tests__
src/lib/gdpr/deletion-core.ts:  export async function executeDeletionWith(…)
src/lib/gdpr/deletion.ts:       export async function executeDeletion(…)
```

La route de cron part en **PR-B**. Sa revue ne portera alors que sur une question :
_est-ce que ça peut partir quand il ne faut pas ?_

## 2. Les trois lectures production

Faites par @thierry sur `ankora-prod` (`fkscfvoouwufyjwnfvhb`), le 27 juillet 2026.
Aucune écriture.

| #   | Question                                         | Résultat      | Conséquence                                                          |
| --- | ------------------------------------------------ | ------------- | -------------------------------------------------------------------- |
| 1   | Un workspace a-t-il plus d'un membre ?           | **0 ligne**   | Le rayon de destruction par paternité reste théorique                |
| 2   | Des demandes `pending` en double ?               | **0 ligne**   | Le collapse de la migration touche **0 ligne** — verrou du push levé |
| 3   | Le journal d'audit enregistre-t-il depuis #273 ? | **Concluant** | NO-GO de PR-B levé                                                   |

### La n° 3 mérite d'être racontée, parce que la première mesure ne prouvait rien

Le premier relevé, avant toute connexion, a rendu des chiffres **identiques** à ceux de
la veille : 22 `auth.rate_limited`, 21 `admin.access.rate_limited`, 2 `auth.signup`,
1 `auth.password_reset`. Cette mesure **ne discriminait pas** « le correctif est cassé »
de « personne ne s'est connecté depuis ».

C'est @thierry qui l'a vu, et qui a refait la mesure autrement : déconnexion puis
reconnexion réelle sur `https://ankora.be` → `auth.login` = 1 et `auth.logout` = 1
apparaissent. Le chemin PostgREST `service_role` écrit donc bien en production.

Une mesure incapable de départager deux hypothèses n'est pas une preuve. C'est exactement
l'erreur que le handoff du 27 juillet s'était reprochée (« prouvé en production alors que
ça ne l'était pas ») — et elle a failli être recommise sous une autre forme.

**Registre de conformité mis à jour** :
[`docs/compliance/2026-07-27-registre-defaillance-journal-audit.md`](../compliance/2026-07-27-registre-defaillance-journal-audit.md)
§6.5. Sa clôture affirmait « contresigné par le merge de la PR #273 » — un merge ne
démontre que le départ d'un code, jamais qu'une écriture atterrit. Corrigé.

## 3. Migration appliquée en production

```
npm run preflight            → GO (thierryvm sur GitHub, Vercel, Supabase)
supabase db push --dry-run   → Would push these migrations: 20260727000001_deletion_queue.sql
supabase db push --linked    → Applying migration 20260727000001_deletion_queue.sql… Finished
supabase migration list      → local 20260727000001 = remote 20260727000001
```

**Lignes affectées par le collapse défensif des doublons : 0**, conformément à la lecture
n° 2. Aucune demande d'effacement n'a été annulée par cette migration.

Validée d'abord contre la pile Supabase **locale** (`supabase_db_ankora`), où les
17 instructions passent et le collapse rend `UPDATE 0`. Le local a servi de banc d'essai
pour tout ce qui suit — la production n'a reçu que la migration, jamais un test.

### Régénération des types — ce qui a été fait, et ce qui a été refusé

`npm run supabase:types` (qui lit la **production**) confirme mes deux ajouts **au
caractère près** :

```
claim_pending_deletions: { Args: { batch_size: number }; Returns: { request_id: string; target_user_id: string }[] }
deletion_requests.claimed_at: string | null    (Row, Insert, Update)
```

Le fichier régénéré **n'a pas** été committé tel quel : la version de CLI disponible
(2.84.2) produit une forme globalement différente de celle qui a produit le fichier
committé — bloc `graphql_public` supplémentaire, guillemets doubles, pas de point-virgule.
L'adopter aurait ajouté ~1 700 lignes de diff sans aucun rapport avec cette PR.

**Résidu nommé** : cet écart de forme signifie que `src/lib/supabase/types.ts` a été
généré par une autre version de CLI que celle installée. C'est une dette préexistante,
pas introduite ici, mais elle mérite une PR d'hygiène — parce qu'aujourd'hui personne ne
peut régénérer ce fichier sans produire un diff illisible, ce qui est la meilleure façon
de ne plus jamais le régénérer.

## 4. Falsification — 10 mutations, 10 rouges

Discipline : chaque test rejoué **contre le code non corrigé**. Un test qui n'a jamais été
vu rouge ne garde rien.

### Code (Vitest)

| #   | Mutation                                                | Rouge sur                                                            |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| M1  | `pseudonymiseAuditLog` sans `{ count: 'exact' }`        | 1 test — _returns the row count and asks PostgREST for an exact one_ |
| M2  | « user not found » traité comme une erreur              | 2 tests — les deux cas 404 / message                                 |
| M3  | 0 ligne pseudonymisée traitée comme un échec            | 3 tests                                                              |
| M4  | `cancelDeletion` renvoie toujours `{ cancelled: true }` | 2 tests — `in_progress` et `none`                                    |
| M5  | `requestDeletion` sans rattrapage du `23505`            | 1 test — l'échéance existante                                        |
| M6  | Retour du `delete from workspaces` redondant            | 6 tests                                                              |
| M7  | `logAuditEvent` inconditionnel dans l'action            | 1 test — _stays silent when there was nothing to cancel_             |

Après restauration : **33 passed** sur les 4 fichiers concernés, **1743 passed / 135
fichiers** sur la suite complète.

**Aveu sur M7.** La mutation ne tue **qu'un** des deux tests de silence. Le cas
`in_progress` reste vert parce que l'action fait un `return` anticipé **avant** le bloc
d'audit : son silence est garanti par ce `return`, pas par le `if (result.cancelled)` que
le test prétend garder. Le test reste utile — il deviendrait rouge si quelqu'un retirait
le retour anticipé — mais il ne garde pas ce que son intitulé annonce. Dit ici plutôt que
découvert plus tard.

### Schéma (Playwright, contre un vrai Postgres)

| #   | Mutation du schéma                                          | Rouge sur                                                         |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| S1  | Verrou de reprise testant `requested_at` (le bug d'origine) | _claims what is due, ignores what is not, and never claims twice_ |
| S2  | `deletion_self_insert` restaurée                            | _an authenticated JWT cannot create a request…_                   |
| S3  | Index unique partiel retiré                                 | _refuses a second active request for the same person_             |

Chaque mutation tue **exactement un** cas, et le bon. Après restauration du schéma :
**5 passed**.

## 5. Le chemin destructeur, exercé de bout en bout pour la première fois

`e2e/gdpr-deletion-queue.spec.ts`, job `Playwright E2E (authenticated)`.

**Pourquoi c'était impossible avant.** `src/lib/gdpr/deletion.ts` importe
`@/lib/supabase/admin`, qui porte `import 'server-only'` — lequel lève
inconditionnellement. Vitest l'aliase, Playwright non.

**Mesuré ici même**, par import jetable puis contrôle négatif — le contrôle négatif étant
ce qui distingue une preuve d'une supposition :

```
import { pseudonymiseAuditLog } from '@/lib/gdpr/deletion-core'  → 3 tests listés
import { executeDeletion }      from '@/lib/gdpr/deletion'       → ✖ server-only/index.js:1
                                                                    at src/lib/supabase/admin.ts:1:1
                                                                    at src/lib/gdpr/deletion.ts:1:1
```

Cela prouve deux choses d'un coup : que Playwright résout bien les alias `@/*` dans ce
dépôt (ce qu'aucune spec n'avait jamais fait — le seul import `@/` sous `e2e/` était un
`import type`, effacé à la compilation), et que le marqueur bloque réellement.

**Ce que la spec assure**, comptes de lignes exacts avant et après :

| Table                           | Avant | Après |
| ------------------------------- | ----- | ----- |
| `charges` (`created_by`)        | 1     | 0     |
| `workspaces` (`owner_id`)       | 1     | 0     |
| `workspace_members`             | 1     | 0     |
| `users`                         | 1     | 0     |
| `deletion_requests`             | 1     | 0     |
| `audit_log` (lignes conservées) | 2     | **2** |

L'assertion qui compte est la dernière ligne, et elle porte sur `ip_address` et
`user_agent` à `NULL`, **pas** sur `user_id`. `user_id` seul ne prouverait rien : `on
delete set null` l'efface comme effet de bord de la cascade. L'IP et le user-agent ne sont
effacés par **rien d'autre** que la pseudonymisation — ce sont eux qui distinguent « on a
nettoyé » de « la clé étrangère l'a fait à notre place ».

### Le garde-fou que la revue de plan a exigé

`claim_pending_deletions()` **n'est pas scopée par utilisateur** : elle réclame **toutes**
les lignes dues de la table. `test.skip(!admin, …)` ne suffisait pas — `adminClientOrNull()`
rend un client utilisable dès que la clé fait 40 caractères, et le job **public** câble
`SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.E2E_SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role' }}`
(`ci.yml:79`). Le jour où ce secret existerait, la spec destructrice tournerait contre ce
qu'il désigne.

D'où un second garde : l'URL Supabase doit être `127.0.0.1` / `localhost`. C'est aussi ce
qui rend déterministe l'assertion « second appel → 0 ligne », fausse sur toute base portant
d'autres lignes dues.

## 6. Planchers e2e — mesurés, jamais annoncés

| Job                              | Avant      | Après                     | Mesure                                       |
| -------------------------------- | ---------- | ------------------------- | -------------------------------------------- |
| `Playwright E2E`                 | 215 passed | **215 passed** (inchangé) | +15 **sautés**, +0 passé — 5 cas × 3 projets |
| `Playwright E2E (authenticated)` | 25 passed  | **30 passed**             | +5, dans **un** seul projet                  |

Le plancher authentifié a été obtenu **deux fois, indépendamment** : mesuré en local avant
le premier push, puis relevé dans le log du job CI —
`gh api repos/thierryvm/ankora/actions/jobs/89996571728/logs` → `30 passed (1.7m)`.
Ce n'est donc pas une estimation confirmée après coup.

Le +5 et non +10 est mesuré, pas déduit : le job authentifié lance deux projets, mais
`iPhone 14` porte `testMatch: '**/mobile-ios/**'`, donc n'atteint pas cette spec.
`npx playwright test gdpr-deletion-queue --project=chromium-desktop --project="iPhone 14" --list`
→ **Total: 5 tests in 1 file**.

`e2e/authenticated-specs.json` : 15 specs, 9 exécutées, **6 en quarantaine — inchangé**.
Aucune entrée ajoutée. `node scripts/e2e-auth-specs.mjs` → exit 0.

`CLAUDE.md` mis à jour avec le nouveau plancher et la raison du +5.

## 7. Ce qui reste faux, ou non prouvé, après ce merge

### L'écart art. 17 de l'issue #278 — sans euphémisme

`auth.audit_log_entries` conserve **l'adresse e-mail en clair** (`payload.actor_username`)
et l'adresse IP de chaque événement d'authentification. Cette table **n'a aucune clé
étrangère vers `auth.users`** : la cascade ne l'atteint pas, et elle **survit intégralement
à l'effacement du compte**. `service_role` ne peut même pas la lire.

Dit sans détour : **une personne qui exerce son droit à l'effacement verra son compte
supprimé et son adresse e-mail rester en base, en clair, indéfiniment.** Ce n'est pas un
détail d'implémentation, c'est un manquement à l'art. 17 — et il **existera à partir du
jour où le cron s'arme**, c'est-à-dire avec PR-B, pas avec celle-ci.

Sa correction demande d'atteindre le schéma `auth`, donc des privilèges qu'aucun client
applicatif ne détient, donc une autre décision d'architecture. Issue **#278**.

### Le rayon de destruction

`charges`, `expenses`, `categories`, `charge_payments`, `commitments`,
`commitment_payments` portent toutes `created_by … on delete cascade` ; `workspaces` porte
`owner_id … on delete cascade`. **Supprimer une personne détruit tout ce qu'elle a créé**,
y compris dans un workspace qu'elle ne possède pas.

Théorique aujourd'hui — lecture n° 1 : **0 workspace partagé**. L'invariant est inscrit
dans l'en-tête de `src/lib/gdpr/deletion.ts` pour que le premier partage de workspace le
retrouve, plutôt que de le redécouvrir.

### `completed` est inatteignable

`deletion_requests.user_id` cascade depuis `public.users`, elle-même depuis `auth.users` :
**la ligne de demande disparaît avec le compte**. `status='completed'` et `completed_at`
sont donc acceptés par la contrainte et ne seront **jamais écrits**. La branche
« Complétée » de l'écran de statut est du code mort — laissée en place, à retirer dans une
PR d'hygiène séparée.

Corollaire : après une suppression, plus rien ne démontre qu'une demande précise a été
honorée. Trou art. 5(2) réel, écarté par ADR-024, sa correction étant une décision
d'architecture à part entière.

### Non prouvé

- **Les mesures de privilèges restent locales.** La conception suppose que `service_role`
  garde `BYPASSRLS` en production tout en refusant de le supposer pour `postgres`.
  L'asymétrie est prudente dans le bon sens ; elle n'est pas démontrée. La lecture n° 3 en
  est le seul test réel, et il est positif.
- **`maxDuration = 60 s` suffit-il ?** Non mesuré — question de PR-B.

## 8. Agents QA — ce qu'ils ont trouvé, et ce qui n'a pas eu lieu

| Agent                     | État                                                            | Verdict                                             |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| `i18n-auditor`            | rendu                                                           | **PASS_WITH_NOTES** — aucun défaut bloquant         |
| `gdpr-compliance-auditor` | rendu                                                           | **COMPLIANT_WITH_NOTES** — 3 défauts réels chez moi |
| `rls-flow-tester`         | **échec** — limite de session                                   | **non exécuté**                                     |
| `test-quality-auditor`    | **échec** — limite de session                                   | **non exécuté**                                     |
| `test-runner`             | non lancé — suite déjà exécutée intégralement en local et en CI | —                                                   |

Deux des cinq agents prévus par le plan **n'ont pas tourné**. Ce n'est pas un vert par
défaut : `rls-flow-tester` est précisément celui qui devait auditer les deux politiques
réécrites et le sens privilégié. J'ai repris ses points à la main (§9) plutôt que de
laisser le trou implicite — mais une vérification faite par l'auteur du code n'a pas la
valeur d'une vérification indépendante, et il faut le dire.

### Les trois défauts réels trouvés par `gdpr-compliance-auditor`, et corrigés

1. **Un commentaire qui promettait une garantie inexistante.** `deletion-status/page.tsx`
   affirmait que lister les statuts explicitement ferait apparaître « le prochain statut
   ajouté au CHECK comme un cas manquant ». **Faux** : `status` est typé `string`, pas une
   union, et une chaîne de ternaires n'a aucun contrôle d'exhaustivité. Un cinquième
   statut se serait affiché **« Complétée », en rouge** — on aurait annoncé à quelqu'un que
   son compte est effacé alors qu'il ne l'est pas.
   C'est exactement le défaut que ce chantier corrige, écrit de ma main dans un commentaire
   censé rassurer. Remplacé par une table de correspondance et un repli neutre
   (`statusUnknown`, 5 locales).
2. **`migration:92` disait « 14 jours » quand le code en écrit 30.** Le raisonnement tenait
   _a fortiori_, mais le chiffre était faux dans le commentaire qui fera autorité pour qui
   touchera au seuil. Rendu indépendant de la valeur.
3. **`docs/ARCHITECTURE.md` décrivait un flux qui n'existe pas** — deux e-mails jamais
   envoyés, et **deux affirmations rendues fausses par cette PR même** (`delete cascade
workspaces`, retiré ; « marque la requête `completed` », désormais inatteignable).
   Section réécrite sur ce que le code fait.

### Ce que je n'ai pas retenu, et pourquoi

- **« Étendre le scrub aux lignes `user_id NULL` »** — l'agent la qualifie d'atteignable
  sans privilège nouveau. C'est vrai techniquement et faux en pratique : ces lignes sont
  **non attribuables**. Rien ne dit quelle ligne `auth.rate_limited` appartient à qui, et
  nettoyer par IP effacerait les lignes d'autres personnes (NAT, IP partagées). Reste un
  résidu documenté dans `deletion.ts`, pas un correctif à portée de main.
- **« Nuancer _ne peut plus être annulée_ au regard de la reprise à 1 h »** — la phrase
  décrit l'**état courant**, et l'état courant est vrai quand elle s'affiche. Si un run
  plante et que la ligne repasse `pending`, l'écran repasse à `pending` avec son bouton.
  Une formulation hésitante (« ne peut probablement plus ») serait moins honnête dans le
  cas normal, qui est le cas de tous les jours. Choix assumé, pas oubli.
- **« `danger.description` : _tout est effacé_ »** — surévaluation réelle, **antérieure** à
  cette PR et vraie dans les 5 locales. Elle relève de la dette documentaire que le plan
  fait porter à PR-B (§B3), avec les huit autres sites. La corriger ici élargirait le scope
  d'une PR dont l'invariant est de ne rien armer.

## 9. Le défaut que personne n'a trouvé, sauf la mesure

En reprenant à la main le point que `rls-flow-tester` n'a pas atteint — **lire les
privilèges réels en base plutôt que le texte de la migration** :

```
claim_pending_deletions :: postgres=X | anon=X | authenticated=X | service_role=X
POST /rest/v1/rpc/claim_pending_deletions   avec la clé ANON   →  HTTP 200
```

`revoke execute … from public` retire le grant du pseudo-rôle `PUBLIC` que Postgres pose à
la création. Il **ne retire pas** les grants **explicites** que les privilèges par défaut
de Supabase accordent à `anon` et `authenticated` sur toute nouvelle fonction de `public`.
Deux choses différentes qui se lisent pareil. `20260528000001` avait déjà appris la leçon
pour les fonctions plus anciennes ; la nouvelle ne l'a pas héritée.

Et mon commentaire de migration affirmait que le `revoke` suffisait — **une deuxième
garantie annoncée qui n'existait pas, dans la même PR.**

**Impact mesuré aujourd'hui : nul.** La fonction est `SECURITY INVOKER`, donc un appelant
`anon` s'exécute avec les privilèges d'`anon` contre une table en `FORCE ROW LEVEL
SECURITY` dont aucune politique ne lui accorde quoi que ce soit : les deux `UPDATE`
touchent zéro ligne et l'appel rend `[]`. Aucune ligne mutée, aucune donnée exposée.

**Fermé quand même**, pour deux raisons qui ne dépendent pas de cette mesure : le moindre
privilège (un appelant non authentifié n'a rien à faire dans une mutation RGPD), et le
fait que c'est un endpoint non authentifié, non compté, qui émet deux `UPDATE` sur
`deletion_requests`. La sûreté repose aujourd'hui **entièrement** sur des politiques
inchangées ; une future édition de politique ne doit pas pouvoir transformer un grant que
personne ne se rappelle en exposition.

→ Migration `20260727000002_claim_grants_hardening.sql`, appliquée en production.

**Après correctif, les deux sens mesurés :**

| Appelant       | Avant          | Après                                   |
| -------------- | -------------- | --------------------------------------- |
| `anon`         | HTTP 200, `[]` | **42501 — permission denied**, HTTP 401 |
| `service_role` | 200            | **200, 5 lignes réclamées**             |

### Et la purge, enfin observée

`purge_audit_log_older_than_12_months()` n'avait **jamais été appelée depuis avril**, donc
jamais observée. En `SECURITY DEFINER` sur une table `FORCE RLS`, elle pouvait rendre 0
sans lever. Passée en `INVOKER` et appelée par `service_role` :

```
2 lignes semées à −13 et −14 mois  →  la fonction rend 2  →  0 ligne restante
```

Elle supprime réellement. C'est la première fois que cette fonction est vue faire quelque
chose.

**Ce qui reste dû** : elle n'a toujours **aucun appelant**. La rétention de 12 mois
annoncée dans les 5 politiques de confidentialité n'est donc toujours pas implémentée
(art. 5(1)(e)). PR-B l'arme (plan §B1.5). D'ici là, la fonction est correcte et inerte —
réparée, pas branchée.

## 10. Un incident de process, à consigner

`test-quality-auditor`, qui dispose de Bash, a injecté un import dynamique de
`@/lib/supabase/admin` dans `src/lib/gdpr/deletion-core.ts` pour éprouver mon test de
frontière de module. L'expérience était légitime et sa conclusion est retenue : **le test
lit les imports de premier niveau et n'aurait pas attrapé un import dynamique.**

Mais la ligne s'est retrouvée **dans le commit `43b8ec8`**, parce que je committais depuis
le même répertoire de travail que celui où l'agent opérait. Retirée en `2a2d032`.

Cause : la règle « un seul agent par répertoire de travail, worktree sinon » n'a pas été
appliquée. Un agent QA doté de Bash sur l'arbre de travail depuis lequel on commite est un
risque que je connaissais et que j'ai quand même pris.

## 11. Definition of DONE

| #   | Critère                                   | État                          |
| --- | ----------------------------------------- | ----------------------------- |
| 1   | 4 checks obligatoires verts               | _à compléter au dernier push_ |
| 2   | Sourcery silencieux sur le dernier commit | **⚠️ voir ci-dessous**        |
| 3   | Reviews humaines résolues                 | —                             |
| 4   | `mergeStateStatus: CLEAN`                 | _à vérifier_                  |
| 5   | Rapport livré                             | ce document                   |

### Critère 2 — un plafond atteint n'est pas un silence approbateur

`gh pr checks 282` rend `Sourcery review — skipping`. Le plafond hebdomadaire de
500 000 caractères était atteint le 27 juillet. **Sourcery n'a donc pas relu cette PR.**

Ce n'est pas un vert. C'est une absence de revue, et elle est dite ici plutôt que comptée
comme une approbation — ce qui serait exactement le genre de silence pris pour un accord
que ce chantier passe son temps à corriger.
