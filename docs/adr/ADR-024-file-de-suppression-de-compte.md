# ADR-024 — File de suppression de compte : reprise plutôt qu'atomicité

- **Statut** : Accepted
- **Date** : 27 juillet 2026
- **Décideurs** : @cc-ankora, second avis `plan-reviewer` (3 tours), @thierry (validation)
- **Complète** : [ADR-023](ADR-023-delai-de-grace-suppression-de-compte.md) (délai de grâce 30 → 14 jours)
- **Exécution** : session suivante. Cet ADR ne contient **aucun code applicatif** —
  doctrine projet : décision en session N, implémentation en session N+1.

---

## Contexte

`/app/settings/deletion-status` affiche à l'utilisateur une date de suppression et un
décompte de jours restants. **Rien n'exécute cette suppression.** `executeDeletion()`
existe depuis avril et n'a aucun appelant. Au 31ᵉ jour, le compteur affiche
« Aujourd'hui » indéfiniment.

Ce n'est pas une omission : c'est une **affirmation inexacte faite à la personne
concernée** (art. 12(1)) sur un droit garanti par l'art. 17. Cinq comptes réels en
production, dont trois appartiennent à des tiers.

Brancher un exécuteur impose des choix de schéma qui ne se défont pas facilement : un
statut supplémentaire, une file, un verrou de concurrence, et la réécriture de politiques
RLS. D'où cet ADR.

## Le fait qui contraint tout le reste

Deux conceptions successives ont été écrites puis abandonnées, chacune tuée par une
mesure. Elles sont consignées ici parce que **rien n'invite plus sûrement à les réécrire
que leur absence**.

### Conception 1 — une fonction `SECURITY DEFINER` atomique. Rejetée.

`supabase/migrations/20260417000002_rls_hardening.sql:14-33` pose
`FORCE ROW LEVEL SECURITY` sur `audit_log` et `deletion_requests`. **`FORCE` s'applique au
propriétaire de la table.** Seul un rôle portant `BYPASSRLS` passe outre.

Une fonction `SECURITY DEFINER` possédée par `postgres` peut donc **écrire zéro ligne sans
lever la moindre erreur** si le `postgres` **hébergé** n'a pas cet attribut — ce que nous
ne pouvons pas mesurer. Le compte serait supprimé, l'IP et le user-agent conservés, et
plus aucune clé de jointure pour les retrouver.

Le même défaut affecte `purge_audit_log_older_than_12_months()`
(`20260417000002:67-81`), `SECURITY DEFINER` sur une table `FORCE RLS`, jamais appelée
depuis avril — donc jamais observée.

### Conception 2 — la même en `SECURITY INVOKER`, appelée par `service_role`. Rejetée aussi.

Mesuré : `service_role` **n'a aucun privilège sur `auth.users`**, ni sur
`auth.audit_log_entries`. Seul `postgres` en a.

> ```
> select grantee, privilege_type from information_schema.role_table_grants
>  where table_schema='auth' and table_name='users';
> --> postgres uniquement
> ```

Aucune fonction SQL appelée par l'application ne peut atteindre le schéma `auth`. La
suppression du compte d'authentification passe **obligatoirement** par l'API admin GoTrue.

### Conséquence

**L'atomicité SQL de bout en bout est impossible, par toute conception.** Ce n'est pas une
limite de notre code : c'est la frontière entre PostgREST et GoTrue.

## Décision

### D1 — La garantie est l'idempotence et la reprise, pas l'atomicité

Une opération qu'on peut rejouer sans dégât n'a pas besoin d'être atomique. La séquence se
réduit à deux étapes, dont **une seule** est irréversible :

1. **Pseudonymiser `public.audit_log`** (`user_id`, `ip_address`, `user_agent` à `NULL`),
   via `service_role` sur PostgREST. **Idempotente** — un second passage touche 0 ligne.
2. **`auth.admin.deleteUser()`** via GoTrue. La cascade fait le reste.

L'ordre est contraint et non réversible : `audit_log.user_id` est en `on delete set null`
(`20260416000001:145`), donc après la suppression ces lignes sont introuvables.

Le `delete from workspaces` intermédiaire d'aujourd'hui est **mesurément redondant** (la
cascade depuis `users` le couvre) et disparaît : un mode de panne de moins.

**Aucun privilège nouveau n'est demandé.** C'est la propriété qui rend cette conception
défendable, là où les deux précédentes reposaient sur une hypothèse invérifiable.

**Panne entre 1 et 2** : piste d'audit anonymisée en avance sur un compte vivant. La ligne
repasse `pending`, l'étape 1 rejouée touche 0 ligne, l'étape 2 aboutit. Le pire cas dégrade
la piste d'audit — pas les données de la personne — et se répare seul.

**Panne « GoTrue réussit, la réponse se perd »** : inoffensive, et pour une raison précise
qui doit être écrite plutôt que redécouverte — `deletion_requests.user_id` cascade depuis
`public.users`, elle-même depuis `auth.users`. **La ligne de demande disparaît avec le
compte.** Le run suivant ne trouve rien.

Trois corollaires en découlent, tous contre-intuitifs :

- `status='completed'` et `completed_at` sont **inatteignables**. La contrainte les
  accepte ; rien ne les écrira jamais. La branche « Complétée » de l'écran de statut est
  du code mort.
- Un `deleteUser` répondant « user not found » compte comme un **succès**. Sinon toute
  ligne dont l'utilisateur a disparu par un autre chemin devient une pilule empoisonnée,
  réclamée et échouée chaque jour, pour toujours.
- Une pseudonymisation touchant **0 ligne est un succès** (cas légitime : un compte sans
  événement d'audit). Seule une `error` bloque. Exiger `count > 0` gèlerait la file pour
  ces comptes — précisément la classe de panne muette que ce chantier corrige.

### D2 — La réclamation du lot se fait en SQL, et son verrou repose sur `claimed_at`

`update … limit … for update skip locked … returning` n'est pas exprimable via PostgREST →
fonction `SECURITY INVOKER` appelée par `service_role`, ne touchant que le schéma `public`.

Elle remet d'abord en file les lignes bloquées, puis réclame. **Le test de reprise porte
sur une nouvelle colonne `claimed_at`, jamais sur `requested_at`.** Une ligne n'étant
réclamable qu'à `scheduled_for <= now()`, soit 14 jours après `requested_at`, un test sur
`requested_at` serait **toujours vrai** : chaque exécution remettrait en file toutes les
lignes en cours — y compris celles qu'une exécution concurrente traite, sa transaction de
réclamation ayant déjà commité avant l'appel GoTrue. **Le même compte serait supprimé deux
fois.**

**Invariant à écrire dans la migration ET dans la route** : `seuil_de_reprise (1 h) >
maxDuration (60 s)`. Les deux valeurs forment un couple. Qui portera `maxDuration` à 300 s
dans six mois doit savoir qu'il touche à la protection anti-double-suppression.

`for update skip locked` est un **confort, pas la correction** : sous READ COMMITTED une
seconde invocation bloquerait puis verrait `processing`. Consigné pour que personne ne
croie plus tard que la sûreté en dépend.

Un index unique partiel sur `(user_id) where status in ('pending','processing')` garantit
une seule demande active par personne — et couvre les deux statuts, sinon la remise en
file violerait sa propre contrainte.

### D3 — `deletion_self_insert` est supprimée, pas durcie

La politique actuelle laisse un client insérer sa propre ligne avec `scheduled_for` dans le
passé, ou `status='completed'`. Inerte aujourd'hui ; **armée, c'est une auto-suppression
immédiate**, alors que la grâce de 14 jours est précisément la mitigation contre le vol de
session.

Le premier réflexe — exiger une date future — ne ferme rien : « futur » autorise
`now() + 1 seconde`. Un seuil en dur (`now() + 13 jours`) fonctionnerait, mais dupliquerait
dans une politique RLS une valeur que l'ADR-023 fixe ailleurs, avec la divergence
silencieuse garantie le jour de sa révision.

**Vérifié** : `deletion_requests` n'est écrit qu'en un seul endroit du code
(`src/lib/gdpr/deletion.ts:28`), via `createServiceRoleClient()`, qui contourne la RLS.
**Aucune insertion client n'existe.** La politique accorde donc une capacité que le produit
n'utilise pas — et c'est cette capacité, pas sa date, qui est le vecteur. La retirer ferme
le vecteur entièrement et fait disparaître le seuil en dur avec elle.

`deletion_self_update` est réécrite en `using (status='pending')` /
`with check (status='cancelled')` : **seule transition possible `pending → cancelled`**. Le
`with check` ne voyant pas `OLD`, il ne peut pas figer `scheduled_for` — mais une ligne
annulée ne peut plus revenir en file, donc une date modifiée au passage est inerte.

### D4 — `purge_audit_log_older_than_12_months()` passe en `SECURITY INVOKER`

Même classe de défaut que la conception 1, sur une fonction qui existe depuis avril. En
`INVOKER` appelée par `service_role`, elle fonctionne de façon **mesurée**. Corps inchangé.

### D5 — L'orchestration destructrice sort de l'enveloppe `server-only`

`src/lib/gdpr/deletion.ts` importe `@/lib/supabase/admin`, qui porte `import 'server-only'`
— lequel **lève inconditionnellement**. Vitest l'aliase, **Playwright non**. Une spec
end-to-end ne peut donc pas importer le chemin destructeur, et il ne serait prouvé nulle
part contre un schéma réel.

Décision : extraire l'orchestration dans un module **sans** le marqueur, recevant le client
Supabase en paramètre ; `deletion.ts` reste l'enveloppe `server-only` qui injecte le client
privilégié. Le job e2e authentifié construit déjà un vrai client admin et exerce déjà
l'API GoTrue — le chemin scrub → GoTrue → cascade devient exécutable de bout en bout sur un
utilisateur jetable.

Le garde-fou n'est pas affaibli : `npm run lint:use-server` continue de refuser tout import
client, et l'enveloppe reste marquée. Le coût est un fichier ; le bénéfice est que **la
seule instruction irréversible du système** cesse d'être un angle mort.

### D6 — Livraison en deux PR

|          | Contenu                                                                                  | Peut détruire ?          |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| **PR-A** | Migration, orchestration extraite, annulation honnête, branche `processing`, i18n, tests | **Non** — aucun appelant |
| **PR-B** | Route de cron, `vercel.json`, `CRON_SECRET`, 30 → 14 jours, vérification d'armement      | Oui, c'est son objet     |

La revue de PR-B ne porte alors que sur une question : **est-ce que ça peut partir quand il
ne faut pas ?**

Le passage à 14 jours part avec PR-B, jamais seul : raccourcir la fenêtre publiée **sans**
exécuteur serait pire que la situation actuelle.

## Ce qui est écarté, et pourquoi

- **`auth.audit_log_entries`** conserve l'email en clair et l'IP, n'a aucune clé étrangère
  vers `auth.users`, et survit à l'effacement. `service_role` ne peut même pas la lire.
  Manquement art. 17 mesuré → **issue #278**, ADR et session distincts : la corriger
  demande d'atteindre le schéma `auth`, donc une autre décision d'architecture.
  **L'écart existe à partir du jour où le cron s'arme, pas avant.**
- **Aucun canal de confirmation d'effacement.** L'app n'envoie aucun email (ADR-023).
  Décision produit.
- **Aucun registre de preuve d'effacement.** Après suppression, plus rien ne démontre
  qu'une demande précise a été honorée. Trou art. 5(2) réel ; sa correction (table de reçus
  indexée par HMAC salé) est une décision d'architecture à part entière.
- **Aucune sauvegarde touchée** (ADR-023 §2).
- **Pas de `rateLimit()` sur la route de cron.** `rate-limit.ts:87-90` et `:113-115`
  échouent **fermé** en production : une panne Upstash bloquerait l'exercice d'un droit
  RGPD, pour protéger un endpoint déjà couvert par un secret de 32 octets à comparaison
  constante et invoqué une fois par jour. Résidu accepté et nommé : endpoint public non
  compté, sur un plan où l'invocation est la ressource rare — le 401 avant toute E/S borne
  le coût.

## Conséquences

### À vérifier en production **avant** PR-B — trois lectures, aucune écriture

```sql
-- 1. Un workspace a-t-il plus d'un membre ? (rayon de destruction)
select workspace_id, count(*) from public.workspace_members group by 1 having count(*) > 1;

-- 2. Des demandes `pending` en double ? (verrou du push de la migration)
select user_id, count(*) from public.deletion_requests
 where status='pending' group by 1 having count(*) > 1;

-- 3. Le journal d'audit enregistre-t-il depuis la PR #273 ?
select event_type, count(*) from public.audit_log group by 1 order by 2 desc;
```

La n° 3 est un **NO-GO de PR-B** si elle reste non concluante : toute la conception repose
sur un chemin PostgREST `service_role` **jamais re-vérifié en production** depuis le
correctif du 27 juillet.

La n° 2 verrouille le `supabase db push` de PR-A, dont la migration **écrit** (elle annule
les doublons `pending` avant de créer l'index unique).

### Invariant à inscrire — le rayon de destruction est celui de la paternité

`charges`, `expenses`, `categories`, `charge_payments`, `commitments`,
`commitment_payments` portent toutes `created_by … on delete cascade` ; `workspaces` porte
`owner_id`. **Supprimer une personne détruit tout ce qu'elle a créé**, y compris dans un
workspace qu'elle ne possède pas. Dans un workspace partagé, l'art. 17 exercé par un membre
efface des données pour les autres.

Théorique tant que la lecture n° 1 renvoie zéro ligne. Si elle en renvoie une, ce n'est
plus un invariant à documenter mais **une décision produit à porter à @thierry**.

### Dette documentaire à solder avec PR-B

Le délai de 30 jours est annoncé sur **huit** sites hors i18n, dont deux publics :
`README.md:65`, `SECURITY.md:54`, `docs/ARCHITECTURE.md:85,115,116`,
`docs/ankora-product-quality-bar-v1.md:193`, `src/lib/gdpr/deletion.ts:5,26`, plus
`public/llms-full.txt:146` (régénéré par `prebuild`). Laisser un dépôt public annoncer
30 jours pendant que le cron efface à 14 recréerait exactement le défaut que ce chantier
corrige — dans le sens le plus défavorable à la personne.

**Correction d'ADR-023** : son §Conséquences annonce « sept chaînes dans `messages/*.json`,
× 5 locales ». La mesure en donne **cinq** (lignes 359, 423, 467, 946, 952 de chacun des
5 fichiers). ADR-023 s'est trompé sur ce compte ; le total réel de sites à modifier est
plus élevé, mais ailleurs.

### Amendement du 27 juillet 2026 — la conception 1 n'est plus une inférence

`rls-flow-tester`, lancé sur PR-A (#282), a **fabriqué le mode de panne** au lieu de le
raisonner : rôle dédié sans `BYPASSRLS`, propriétaire d'une fonction de purge, 7 lignes
semées dans `audit_log` (`FORCE RLS`).

```
DEFINER, propriétaire SANS bypassrls, appelée par service_role  →  rows_deleted = 0, survivants = 7
INVOKER,                              appelée par service_role  →  rows_deleted = 7, survivants = 0
```

**Zéro ligne supprimée, aucune erreur levée, retour « succès ».** Le rejet de la
conception 1 et la décision D4 reposent donc désormais sur une mesure reproductible, plus
sur un principe.

Mesuré au passage, et plus inquiétant que le reste : **`postgres` porte `rolbypassrls = t`
sur une pile Supabase locale.** La version `SECURITY DEFINER` d'avril de
`purge_audit_log_older_than_12_months()` **aurait donc passé un test local avec un
compteur correct**. Ce défaut n'a pas survécu trois mois faute de test — il a survécu
parce qu'un test local vert n'aurait rien prouvé. À garder en tête pour toute vérification
future d'un privilège : la seule chose qu'une pile locale démontre sur les privilèges de
l'hébergé, c'est qu'elle ne les démontre pas.

Deux imprécisions rédactionnelles relevées dans les migrations livrées, corrigées ici
plutôt que dans les fichiers — `supabase_migrations.schema_migrations` enregistre une
colonne `statements`, et éditer un fichier déjà appliqué le ferait diverger de ce qui a
tourné :

1. `20260727000002` lignes 21-24 — « both UPDATE statements match zero rows ». Vrai pour
   `anon` ; **faux pour un `authenticated` propriétaire d'une ligne échue**, où l'appel
   lève `42501` / HTTP 403 sur le `with check` de `deletion_self_update` (mesuré 5/5). La
   conclusion tient, le mécanisme non — et la correction renforce l'argument, puisqu'elle
   montre que la sûreté reposait entièrement sur une policy.
2. `20260727000001` lignes 51-61 — l'écrasement des doublons teste `requested_at >`
   **strict** : deux `pending` au même instant se protègent mutuellement et le
   `create unique index` échoue en `23505`. Échec **bruyant**, jamais silencieux.

### Ce qui restera non prouvé après l'implémentation

1. **Les mesures de privilèges sont locales, jamais faites sur l'hébergé.** La conception
   suppose que `service_role` garde `BYPASSRLS` en production, tout en refusant de le
   supposer pour `postgres`. L'asymétrie est prudente dans le bon sens ; elle n'est pas
   démontrée. La lecture n° 3 est le seul test réel.
2. **`maxDuration = 60 s` suffit-il pour 25 comptes ?** Non mesuré. Le pire cas dégrade
   proprement (reprise à 1 h) ; le premier run réel sur file non vide sera la seule mesure
   qui vaudra.
3. **Le chemin destructeur complet** ne sera exercé en CI qu'après D5. Si l'extraction se
   révèle casser autre chose, l'aveu écrit vaut mieux qu'un test en trompe-l'œil.
