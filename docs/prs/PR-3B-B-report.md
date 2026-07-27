# PR-3B-B — l'armement

**PR** : [#284](https://github.com/thierryvm/ankora/pull/284) · **Branche** :
`feat/3b-b-cron-arming` · **Base** : `main` @ `d386aae` (PR-A mergée)
**Décisions** : [ADR-024](../adr/ADR-024-file-de-suppression-de-compte.md) et
[ADR-023](../adr/ADR-023-delai-de-grace-suppression-de-compte.md) ·
**Plan** : [step-3b](../plans/step-3b-deletion-queue.md) §B1-B5
**Agent** : @cc-ankora (Claude Opus 5) · **Date** : 27 juillet 2026

---

## 1. Ce que ce merge rend possible

`src/app/api/cron/gdpr/route.ts` devient le **seul appelant de `executeDeletion`** dans
tout le système, donc le seul endroit capable de détruire un compte. Toute la revue tient
en une question : **est-ce que ça peut partir quand il ne faut pas ?**

## 2. Le verrou que je n'avais pas vu — et qui bloque le premier run

`security-auditor` a rendu **BLOCK** sur un point que ni moi ni les trois lectures
production n'avions couvert.

`claim_pending_deletions` ne filtre **que** sur l'échéance. Toute demande formulée sous la
promesse « 30 jours », dont la fenêtre s'est écoulée **pendant que rien n'exécutait**
(avril → juillet), sera réclamée et détruite à 03:00 le lendemain de la pose du secret.
Ces personnes ont vu « Aujourd'hui » indéfiniment ; certaines ont pu continuer à utiliser
leur compte.

Ce n'est pas une objection juridique — elles ont demandé l'effacement. C'est qu'une PR dont
la thèse est « mesurer avant d'affirmer » s'apprêtait à détruire un **nombre inconnu** de
comptes tiers.

**Lecture production n° 5, à faire AVANT de poser `CRON_SECRET` dans Vercel** :

```sql
select count(*) as due_now,
       min(scheduled_for) as oldest,
       max(scheduled_for) as newest
from public.deletion_requests
where status = 'pending' and scheduled_for <= now();
```

`due_now > 0` n'est pas un détail d'exploitation : c'est une **décision produit** à porter
à @thierry. Aucun code n'en dépend — le verrou est humain, et il est en amont du secret,
pas du merge.

## 3. Le défaut que j'avais introduit moi-même

`.env.example` disait : `openssl rand -base64 32`. **Cette commande émet un saut de ligne.**

- `z.string().min(32)` acceptait `"secret\n"` ;
- la spécification fetch **rogne** la valeur d'un en-tête reçu ;
- donc `expected !== provided`, **pour toujours**.

Symptôme : un 401 par nuit, aucune alerte, et le droit à l'effacement inexécuté
indéfiniment. Le défaut exact que cette PR existe pour supprimer, réintroduit par un
caractère blanc que j'avais écrit de ma main.

**Corrigé aux deux bouts** : `z.string().trim().min(32).regex(/^\S+$/)` — une valeur
blanche fait désormais **échouer le build** au lieu d'échouer à 03:00 — et
`.env.example` documente `openssl rand -base64 32 | tr -d '\n'` avec la raison.

## 4. Les autres constats de l'audit, et ce qui en a été fait

| #        | Constat                                                  | Décision                                                         |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| HIGH-1   | Volume du premier run jamais compté                      | **Lecture n° 5** (§2), verrou humain avant le secret             |
| HIGH-2   | Saut de ligne dans `CRON_SECRET` → 401 permanent         | **Corrigé** (§3)                                                 |
| HIGH-3   | Aucun drain de logs, aucune alerte                       | **Inscrit au DoD** (§6) — pas corrigeable à budget 0 €           |
| MEDIUM-4 | `BATCH_SIZE > 100` tuerait l'alarme `capped` en silence  | **Test ajouté** — le SQL borne à 100, le TS ne le savait pas     |
| MEDIUM-5 | Amplification de logs sur endpoint non compté            | **Corrigé** — une ligne par démarrage à froid, testée            |
| MEDIUM-6 | `error_message` ni borné ni nettoyé                      | **Corrigé** — `safeErrorMessage()`, 200 caractères, UUID masqués |
| LOW-7    | Garde « Supabase local » contournable                    | **Corrigé** — `new URL().hostname` au lieu d'une regex           |
| LOW-8    | `Bearer` sensible à la casse                             | **Laissé** — échoue fermé, et Vercel envoie `Bearer`             |
| LOW-9    | `logAuditEvent` en meilleur effort vs compteur `deleted` | **Nommé** — asymétrie réelle, art. 5(2) déjà reconnu             |
| LOW-10   | `search_path` divergent entre les deux fonctions         | **Laissé** — sans impact en `SECURITY INVOKER`                   |

**MEDIUM-6 mérite d'être explicité** : la route promet « `request_id`, jamais `user_id` »,
et le test le prouve pour les liaisons structurées. Mais `error.message` vient de GoTrue ou
de PostgREST — il est écrit par quelqu'un d'autre. La redaction de pino travaille **par
chemin** (`*.email`, `headers.authorization`) : elle ne verra jamais un identifiant enfoui
dans une chaîne libre. La promesse était donc vraie sur le chemin que le test regarde, et
fausse sur celui qu'il ne regardait pas.

**MEDIUM-4 est du même genre** : une alarme qui _ressemble_ à un garde-fou est pire que pas
d'alarme. `least(coalesce(batch_size,1),100)` côté SQL contre `claimed.length >= BATCH_SIZE`
côté TS — porter `BATCH_SIZE` à 150 aurait fait disparaître l'alarme sans bruit.

## 5. Falsification

**4 mutations de la route, 4 rouges sur le test qui les garde** :

| Mutation                                | Test devenu rouge                                     |
| --------------------------------------- | ----------------------------------------------------- |
| Comparaison sans SHA-256 des deux côtés | _401s on a wrong secret of a DIFFERENT length_        |
| `log.error` du secret manquant retiré   | _401s when CRON_SECRET is missing — and SCREAMS once_ |
| `user_id` ajouté au journal d'échec     | _never puts a user id in the failure log_             |
| Plafond testé avec `>` au lieu de `>=`  | _flags `capped` AND logs an error_                    |

Restauré : **16 passed**, puis **18** après les correctifs d'audit. Suite complète
**1761 passed**.

Le correctif LOW-7 est vérifié contre le contournement exact que l'audit avait mesuré :

```
OK    true   http://127.0.0.1:54421
OK    true   http://localhost:54421
OK    false  http://127.0.0.1:5442@fkscfvoouwufyjwnfvhb.supabase.co
OK    false  https://fkscfvoouwufyjwnfvhb.supabase.co
OK    false  http://localhost@evil.com
```

## 6. Definition of DONE — avec un critère de plus

Aux cinq critères habituels s'ajoute la **vérification d'armement** (§B5), parce qu'un cron
qu'on n'a jamais vu répondre 200 en production n'est pas livré :

1. `CRON_SECRET` posé dans Vercel — généré **localement**, `| tr -d '\n'`, jamais dans une
   URL ni via un outil MCP.
2. `vercel crons ls` → la tâche apparaît **réellement** armée.
3. Déclenchement manuel **file vide** → `{ claimed: 0 }` et 200.

### HIGH-3 — ce que la vérification d'armement ne prouve pas

Elle prouve le jour J. Elle ne prouve **rien** le jour J+40. `log.error` écrit sur stdout
Vercel : il n'y a **ni drain de logs, ni alerte, ni Sentry actif**. Trois états peuvent donc
durer des mois sans que personne ne le sache — `CRON_SECRET` divergent (401 quotidien),
`claim_pending_deletions` en échec (500 quotidien), ou `capped` durable.

Dit franchement : **cette PR répare une panne muette en installant un mécanisme qui peut,
lui aussi, s'arrêter en silence.** C'est la famille H3, transposée sur le correctif de H3.

Détecteur proposé, sans dépendance ni budget — une lecture qui ne peut être verte que si le
cron a réellement tourné :

```sql
select count(*) from public.deletion_requests
 where status = 'pending' and scheduled_for < now() - interval '2 days';
```

Non nul ⇒ le cron n'a pas tourné, ou tourne en 401. À poser en contrôle mensuel, ou mieux,
à faire remonter par le panneau admin existant. **Suivi hors de cette PR**, mais l'écart
art. 32(1)(d) est réel et il est écrit ici plutôt que découvert dans six mois.

## 7. Ce que ce merge rend vrai — l'écart art. 17 naît aujourd'hui

`auth.audit_log_entries` conserve **l'e-mail en clair** (`payload.actor_username`) et l'IP,
sans clé étrangère vers `auth.users`, et **survit à l'effacement**. `service_role` ne peut
même pas la lire.

Une personne qui exerce son droit à l'effacement verra son compte supprimé et **son adresse
e-mail rester en base, en clair, indéfiniment**. Ce n'était pas vrai hier — rien n'effaçait.
Ça l'est à partir du premier run. Issue **#278**.

La copie utilisateur a été corrigée en conséquence dans les 5 locales : « après, **tout**
est effacé » devient faux le jour de l'armement, et dit désormais ce qui est réellement
effacé **et ce qui subsiste**.

## 8. Planchers e2e

| Job                              | Avant      | Après                                    |
| -------------------------------- | ---------- | ---------------------------------------- |
| `Playwright E2E`                 | 215 passed | **227 passed** (+12 = 4 cas × 3 projets) |
| `Playwright E2E (authenticated)` | 31 passed  | **31 passed** (inchangé)                 |

Mesurés en local avant push. La spec publique exerce les refus **contre un vrai serveur
HTTP**, pas seulement en import de fonction.
