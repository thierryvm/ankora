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

## 7bis. `silent-failure-auditor` — SILENT_FAILURE_CONFIRMED, et il ne parle pas au conditionnel

### La mesure qui décide de tout

```
vercel env ls production  →  pas de CRON_SECRET
vercel crons ls           →  /api/cron/gdpr   0 3 * * *   not deployed
```

**`CRON_SECRET` n'existe pas en production aujourd'hui.** Mergée et déployée telle quelle,
cette PR arme un cron qui tire à 03:00, prend un 401, et **n'efface rien** — pendant que la
politique de confidentialité et les CGU annoncent désormais « suppression effective 14 jours
après la demande ». Rien dans le dépôt ne fait remonter cet état.

**Corollaire de séquencement, plus vicieux que l'absence elle-même** : les variables Vercel
sont figées dans un déploiement. Poser `CRON_SECRET` **après** le déploiement, ou la faire
tourner sans redéployer, donne un émetteur et un récepteur désaccordés → **401 quotidien
sans aucun log**, puisque `expected` est alors défini, juste faux. Ordre obligatoire :

> **poser la variable → redéployer → vérifier**

### F6 — mes propres cas e2e passaient à vide

`CRON_SECRET` n'est défini dans **aucun** bloc `env` de `ci.yml` ni dans `.env.local`. Les
4 specs × 3 projets sortaient donc par `if (!expected)` et **n'atteignaient jamais**
`secretMatches`. Mutation décrite par l'audit, non appliquée : remplacer le corps de
`secretMatches` par `return true` les laissait toutes vertes.

Pire, le cas « ne dit jamais laquelle des deux refus » : en CI les deux refus **sont
littéralement la même branche**. L'assertion ne pouvait pas échouer.

J'avais donc relevé un plancher de 215 à 227 sur douze cas affirmant une seule chose :
« une route non configurée refuse ». C'est exactement le défaut que je reprochais ailleurs
dans cette même session.

**Corrigé** : le cas tautologique est **retiré**, les commentaires disent maintenant ce que
les cas prouvent et ce qu'ils ne prouvent pas, et le plancher est **redescendu à +9**.
Poser `CRON_SECRET` dans l'environnement du job e2e — un faux de 32 caractères, pas un
secret — transformerait neuf cas vains en neuf cas réels, plus celui qui manque partout :
**un 200 sur HTTP avec le bon secret**. Éditer `.github/workflows/` est une action bannie
en PR feature, donc **PR dédiée**.

### Corrigé aussi

- **F9 — mon commentaire se trompait d'un facteur 24.** Il disait qu'une ligne bloquée est
  « re-queued an hour later ». L'heure est un **âge minimum**, pas un horaire : la remise en
  file a lieu au **prochain appel**, et l'unique appelant tourne **une fois par jour**. Qui
  dimensionnerait un incident sur cette phrase se tromperait d'un facteur 24.
- **F2 — `purged: 0` est aussi la réponse saine**, et le restera jusqu'à ~avril 2027 :
  `audit_log` naît le 16 avril 2026, rien ne peut y avoir 12 mois avant. Une purge cassée et
  une purge sans travail s'écrivaient identiquement, pour neuf mois. La réponse porte
  désormais `purgeOk`, et `purged: null` en cas d'échec.

### Nommé, pas construit — et le plus grave d'entre eux

**F3 — blocage de tête de file.** `order by scheduled_for` réclame les plus anciennes
d'abord, et il n'existe **aucune colonne `attempts`** : une ligne après 1 échec et après
300 sont identiques en base. **25 lignes empoisonnées suffisent donc à affamer la file pour
toujours** — elles occupent le lot entier chaque nuit, aucune demande neuve n'est jamais
traitée, et `capped: true` émet un `log.error` que personne ne lit.

Pendant ce temps l'écran affiche « La suppression de ton compte a commencé. Elle ne peut
plus être annulée », **et le bouton d'annulation est retiré pour ce statut**. La personne
est enfermée entre les deux issues, définitivement, et l'app le lui dit avec aplomb.

Correctif : colonne `attempts` + `last_error_code`, incrémentée à chaque échec, avec un
seuil de mise en quarantaine. C'est une **migration**, donc un élargissement de scope en
cours de PR — banni sans nouveau plan écrit. Ouvert comme suite immédiate.

**F5 — `capped` détecte une rafale, jamais une stagnation.** Trois demandes en souffrance
depuis 40 jours → `capped: false` tout du long. Le nombre qui manque est
`oldest_pending_age_days` : il rend `{claimed: 0}` interprétable — 0 réclamé avec 0 jour
d'ancienneté est sain, 0 réclamé avec 31 jours est une panne.

**F4 / F8 — personne ne regarde.** Zéro surface admin ne lit `deletion_requests` ni
`audit_log`. Aucun runbook n'existe pour ce cron. Le moins cher à budget 0 € : une requête
dans le panneau admin existant, plus un rituel écrit.

### Ce que l'audit crédite, et qu'il faut lire à côté du reste

L'échec de `claimPendingDeletions` rend **500** au lieu d'un zéro tranquille — c'est la
seule panne du dispositif qui se voit sans lire un log. `isAlreadyGone` neutralise la pilule
empoisonnée la plus probable. Les 6 cas `gdpr-deletion-queue` s'exécutent **réellement** en
CI contre un vrai schéma. L'invariant `maxDuration < seuil de reprise` est écrit dans les
deux fichiers et gardé par un test.

> « Le défaut n'est pas dans la conception de la route. Il est dans le fait que **tout ce
> qu'elle sait de ses propres pannes, elle l'écrit à 03:00 dans un journal auquel personne
> n'est abonné** — et que la variable qui la fait fonctionner n'est pas encore posée. »

## 8. Planchers e2e

| Job                              | Avant      | Après                                   |
| -------------------------------- | ---------- | --------------------------------------- |
| `Playwright E2E`                 | 215 passed | **224 passed** (+9 = 3 cas × 3 projets) |
| `Playwright E2E (authenticated)` | 31 passed  | **31 passed** (inchangé)                |

Annoncé à +12, **redescendu à +9** après §7bis. Un plancher bâti sur un cas qui ne peut pas
échouer est pire qu'un plancher plus bas : il inspire confiance sans la mériter. Les neuf
qui restent prouvent une chose vraie et non triviale — **la route refuse par défaut, sur un
vrai socket** — et leurs commentaires disent désormais ce qu'ils ne prouvent pas.
