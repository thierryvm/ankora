# ADR-042 — Une file qui ne compte pas ses tentatives finit par ne plus avancer

- **Statut** : Proposed
- **Date** : 2026-08-10 (révision 5, figée — **quatre tours de `plan-reviewer`**, neuf défauts bloquants trouvés avant toute ligne de code, dont un **introduit par une révision précédente**)
- **Proposé par** : @cc-ankora, sur le blocage [#285](https://github.com/thierryvm/ankora/issues/285) ouvert par `silent-failure-auditor` le 27 juillet 2026
- **Deciders** : @thierry, @cc-ankora, second avis `plan-reviewer`
- **Tags** : `rgpd`, `schema`, `fiabilité`, `mécanisme-muet`
- **Amende** : [ADR-024](ADR-024-file-de-suppression-de-compte.md) (D1, D2, D6)
- **Débloque** : la pose de `CRON_SECRET`, donc l'armement du droit à l'effacement
- **Exécution** : session suivante. Cet ADR ne contient **aucun code applicatif** — doctrine projet, décision et exécution ne partagent pas une session.

> **Quatre tours de revue, et le plus instructif est le deuxième.** La v1 livrait un bouton
> d'annulation qui **affirmait avoir annulé sans rien annuler**, et ne positionnait pas le
> statut `failed` vis-à-vis de l'index d'unicité — les deux branches cassaient quelque chose.
> La v2 a corrigé cela, et **a troué son propre garde-fou** : l'action _réessayer_ qu'elle
> introduisait rendait la conjonction temporelle de G3 inerte, sur les lignes-mêmes qu'elle
> devait protéger. Une correction peut créer le défaut qu'elle prétend fermer ; c'est pour ça
> qu'il y a eu deux tours de revue et pas un. La §Historique de révision donne la liste
> complète.

---

## Contexte

Le mécanisme d'effacement de compte est **construit, mergé, et inerte**. `CRON_SECRET`
n'a jamais été posé, délibérément : un défaut a été trouvé avant l'armement.

**Deux faits mesurés le 2026-08-10**, avec la commande qui les rend :

```sql
-- Demandes en file, par statut. Rendu : 0 ligne.
select status, count(*) from public.deletion_requests group by status;
```

```bash
# Noms des variables d'environnement de production. `CRON_SECRET` n'y figure pas.
vercel env ls production
```

Conséquence : la route rend `401` (`route.ts:92-100`) et `executeDeletion` n'a aucun
appelant effectif. Publier l'absence de ce secret dans un dépôt public est sans risque —
elle rend l'endpoint **plus** fermé, ce n'est pas une valeur exploitable.

Le défaut n'est donc **pas** en train de nuire à quelqu'un. Il nuira au premier qui
cliquera, si on arme sans corriger. C'est une réparation avant mise en service.

## Le problème

`claim_pending_deletions` réclame par `order by scheduled_for`, lot de 25. Il n'existe
**aucune colonne de tentative** : une ligne après un échec et une ligne après trois cents
échecs sont **identiques en base**.

Donc **25 lignes qui échouent systématiquement occupent le lot chaque nuit, pour
toujours.** Aucune demande neuve n'est jamais atteinte. Le seul signal est un `log.error`
sur `capped`, dans une plateforme sans drain de logs, sans alerte et sans Sentry actif.

Et la reprise efface la seule trace qu'une tentative a eu lieu
(`20260727000001:106-110`).

**Ce qui rend la personne moins bien traitée qu'avant.** Pendant que sa ligne échoue en
boucle, elle lit « la suppression a commencé, elle ne peut plus être annulée », et le bouton
d'annulation lui est retiré (`deletion-status/page.tsx:117-130`). Le bug d'origine — un
compte à rebours que rien n'exécutait — laissait au moins le bouton.

## Décision

### G1 — Compter à la RÉCLAMATION, en distinguant « réclamée » de « tentée »

`deletion_requests` reçoit :

- `attempts integer not null default 0`
- `last_attempted_at timestamptz`
- `last_error_code text` (vocabulaire fermé, cf. G8)
- `attempt_cycle_started_at timestamptz` — l'ancre temporelle de G3, cf. ci-dessous
- `retried_at timestamptz` — la date de la dernière relance (G5), cf. ci-dessous

**L'incrément se fait dans le `update` de réclamation, en SQL — jamais côté Node.** Si le
processus meurt (dépassement des 60 s, plantage serverless), un compteur incrémenté « à
l'échec » dans le code appelant ne compterait rien. Or **ce sont exactement ces échecs-là qui
bouclent.**

**Mais réclamée ≠ tentée, et l'ADR le nomme au lieu de le confondre.** Trois cas réels
brûlent une tentative sans qu'un seul appel GoTrue ne parte :

1. **La queue du lot.** Que 25 suppressions tiennent en 60 s **n'est pas mesuré** — ADR-024
   §« Ce qui restera non prouvé », point 2, l'écrit déjà.
2. **La réponse du RPC perdue.** L'`update` a commité côté serveur ; un timeout PostgREST
   rend `claim_failed` (`route.ts:113`) et 25 lignes portent une tentative pour zéro travail.
3. **L'invocation manuelle.** Le compteur compte des invocations, pas des jours : cinq appels
   de débogage videraient le budget de tout le monde en une minute.

**Décision** : la quarantaine porte une **conjonction temporelle** (G3), qui rend vraie
l'équivalence « 5 tentatives ≈ 5 jours » au lieu de la supposer. Elle ne dépend d'aucune
discipline humaine. Et `last_error_code = 'not_attempted'` distingue en base une ligne
réclamée sans être tentée d'une ligne réellement tentée et échouée.

**Cette conjonction a besoin d'une ancre, et aucune colonne existante ne la porte.** La
grandeur à mesurer n'est ni « quand c'était dû » ni « quand j'ai essayé la dernière fois » :
c'est **depuis quand le cycle de tentatives en cours a commencé**.

- `scheduled_for` ne glisse **jamais**. Il cesse donc de mesurer quoi que ce soit dès que la
  ligne a plus de cinq jours d'échéance — et devient vrai pour toujours après un
  _réessayer_ (G5), qui remet `attempts` à zéro sans le toucher. La conjonction retomberait
  alors à `attempts >= 5` seul, c'est-à-dire à la version qu'on vient d'écarter. Même
  défaillance sur une ligne affamée par l'afflux (G4), réclamée cinq fois en quelques heures
  après dix jours d'attente : quarantaine immédiate sans qu'aucun délai n'ait couru pour elle.
- `last_attempted_at` glisse **trop** : une ligne tentée chaque jour ne serait jamais
  quarantainée.

D'où `attempt_cycle_started_at`, quatrième colonne assumée : **posée par la réclamation quand
elle est nulle**, jamais touchée ensuite, et **remise à `null` par _réessayer_**. Elle a un
sens et un seul — le même principe qui a fait inverser G2.

**La condition de pose porte sur la NULLITÉ de l'ancre, pas sur `attempts = 0`.** Les deux
sont équivalentes tant que l'invariant n° 4 tient (§Invariants). Si jamais il est rompu, la
version « nullité » **repose** une ancre — on perd cinq jours, la ligne redevient
quarantinable ; la version « `attempts = 0` » ne la repose **jamais** — la ligne est gelée à
vie. C'est la nullité qui fait foi. C'est une expression conditionnelle de plus dans la liste
`set` de la réclamation, sous le même verrou de ligne : **pas de seconde instruction, donc
aucune fenêtre de concurrence nouvelle.**

**Ce que le compteur perd, et où l'histoire survit.** Après une relance, `attempts` compte le
**cycle courant seulement** : une ligne qui a échoué 4 + 4 + 4 fois devient indiscernable
d'une ligne qui a échoué 4 fois — c'est-à-dire, d'un cran plus haut, exactement le défaut sur
lequel cet ADR s'ouvre. L'histoire complète vit dans **l'événement d'audit de relance** imposé
par G5. C'est ce qui rend cet événement **non négociable plutôt que décoratif** : sans lui, on
réintroduit l'amnésie qu'on est en train de corriger.

`last_error_code` **et `last_attempted_at`** sont écrits par l'**appelant, au verdict** — même
écrivain, même instant, même écriture. Ce n'est pas un détail : écrire `last_attempted_at` à
la _réclamation_ en ferait une troisième colonne redisant ce que `claimed_at` et l'ancre
disent déjà, et **contredirait la distinction « réclamée ≠ tentée »** que ce paragraphe
construit. Écrite au verdict, elle date une **tentative réelle**, et devient la seule colonne
qui sépare une ligne réclamée cinq fois sans être tentée d'une ligne tentée cinq fois.

**Le mécanisme d'écriture doit être prouvé, pas supposé** : `deletion_requests` est en
`force row level security`, et J1 a montré qu'une écriture privilégiée peut y rendre zéro
ligne **sans lever d'erreur**.

### G2 — La reprise ne touche AUCUN compteur, et continue de nuller `claimed_at`

**Inversion de la v1.** Elle proposait de ne plus remettre `claimed_at` à `null`. C'est
inutile et nuisible :

- **Inutile** : le motif de #285 — « la reprise efface la seule trace » — est **entièrement
  soldé** par `attempts` et `last_attempted_at`. Une fois ces colonnes posées, nuller
  `claimed_at` n'efface plus aucune histoire.
- **Nuisible** : une valeur non nulle sur une ligne `pending` donnerait deux sens à la
  colonne — « une exécution détient cette ligne » deviendrait « une exécution l'a détenue un
  jour ». C'est ce qui produit, dans six mois, un `where claimed_at is not null` censé
  signifier « en cours » et qui est faux.

**Décision** : `claimed_at` garde un sens et un seul — _une exécution détient cette ligne_.
La reprise continue de le nuller, et **ne touche aucune des quatre autres colonnes** :
`attempts`, `last_attempted_at`, `last_error_code`, `attempt_cycle_started_at`. (L'ancre est
énumérée explicitement : un lecteur littéral d'une liste à trois en conclurait qu'elle peut y
toucher, et une ancre remise à `null` par la reprise rendrait la ligne inquarantinable.)
`retried_at` n'est écrit que par _réessayer_. Le commentaire `20260727000001:98-105` reste
vrai mot pour mot.

### G3 — Quarantaine : 5 tentatives **et** 5 jours écoulés

Une ligne passe au statut `failed` et sort du lot quand :

```
attempts >= 5  ET  attempt_cycle_started_at < now() - interval '5 days'
```

La conjonction est le correctif de G1 : sans elle, cinq invocations en une minute
quarantaineraient une ligne jamais tentée. **L'ancre est `attempt_cycle_started_at`, pas
`scheduled_for`** — le raisonnement est en G1, et il vaut aussi bien pour une ligne réessayée
que pour une ligne affamée par l'afflux.

Pourquoi 5 : le cron tourne une fois par jour (`vercel.json`, `0 3 * * *`). Le délai de grâce
est de 14 jours (ADR-023), l'obligation légale d'un mois (art. 12(3)). Une ligne demandée à
T est réclamable à T+14, quarantainée vers **T+19**, l'échéance légale tombant vers T+30.

**Le nombre qui compte n'est donc pas « 15 jours de marge » mais ≈ 11 jours** : c'est la
fenêtre de réaction humaine entre la mise en quarantaine et le manquement. C'est elle qui
dimensionne le résiduel de G6.

**`failed` est un état de manquement EN ATTENTE, pas un état terminal acceptable.** La
quarantaine n'arrête pas l'horloge de l'art. 12(3) : une ligne `failed` au jour 30 est une
infraction, pas un problème résolu. G3 rend l'échec visible ; il ne le rend pas légal.

Aucune reprise automatique : une boucle de réessai automatique est ce qui a produit le
problème. La sortie est un geste humain — celui de la personne concernée (G5).

### G4 — Les lignes jamais tentées passent devant, à une échelle près

L'ordre de réclamation devient `order by attempts asc, scheduled_for asc`. Sans cela, cinq
jours durant, vingt-cinq lignes en échec continueraient de prendre le lot avant une demande
déposée le matin même.

**Résiduel nommé, avec sa condition de déclenchement** : cette clause supprime la famine
causée par les **échecs** et en crée une autre, causée par l'**afflux**. Une ligne à
`attempts = 1` est indéfiniment doublée par des lignes fraîches à `attempts = 0`, et G3 ne la
borne pas puisqu'elle n'atteindra jamais 5. **Tient tant que l'afflux quotidien échu reste
< `BATCH_SIZE`** ; au-delà (≥ 25 demandes échues par jour, ~400 comptes), l'ancienneté doit
redevenir l'arbitre principal. Avec cinq comptes ce n'est pas un risque, c'est une propriété
à connaître.

Sous la même condition d'échelle : _réessayer_ remet `attempts` à `0`, donc **remet la ligne
en tête du lot**. À l'échelle où la famine de G4 mord, la relance devient aussi un moyen de
doubler la file.

### G5 — L'écran dit la vérité, et le chemin d'annulation doit RÉELLEMENT annuler

Le bouton est masqué aujourd'hui pour `processing`, parce qu'« une exécution possède déjà
cette demande ». Cette justification disparaît en quarantaine.

**Principe** : le bouton est masqué exactement quand une exécution **détient** la ligne.
`pending` et `failed` l'exposent ; `processing` seul le retire.

**Sûreté du principe, et elle repose sur deux invariants que la v1 ne citait pas** : une
ligne n'atteint `failed` que par la quarantaine, qui ne porte **que** sur `status = 'pending'`
(G7) ; et une ligne n'est `pending` que si elle n'a jamais été réclamée ou si elle a été
reprise après ≥ 1 h de silence, alors que `maxDuration = 60 s`. Qui portera `maxDuration` à
300 s touchera donc **aussi** la sûreté de ce bouton, pas seulement la double-suppression.

**Le défaut bloquant de la v1, et sa correction.** `cancelDeletion()` filtre
`.eq('status', 'pending')` (`deletion.ts:139`). Sur une ligne `failed`, il ne touche aucune
ligne, et la chaîne de retour transforme ce « rien fait » en succès affiché : `reason: 'none'`
→ `settings.ts:362` ne rend `false` que sur `in_progress` → l'action retourne `ok: true` →
le bouton annonce « demande annulée » → l'écran affiche toujours `failed`. **Un bouton qui
affirme avoir annulé sans rien annuler** — exactement la classe de défaut art. 12(1) que cet
ADR existe pour fermer.

**Décisions, à écrire dans le code de la session suivante :**

- `cancelDeletion()` accepte les transitions **`pending` → `cancelled`** et
  **`failed` → `cancelled`**.
- **`reason: 'none'` ne peut plus se présenter comme un succès.** Toute issue qui n'a pas
  modifié de ligne rend un échec explicite, avec son message.
- L'écran en `failed` expose **deux** actions : _annuler_ et _réessayer_.
- Le texte de l'état `failed` dit ce qui est vrai — l'effacement n'a pas abouti, la demande
  reste enregistrée — et **ne prétend pas qu'une notification a été envoyée** : l'application
  n'envoie aucun email (ADR-023).

**Le contrat de _réessayer_, qui n'est pas un bouton de plus mais le réarmement d'une
destruction irréversible.** Il remet la ligne en `pending`, `attempts` à `0` et
`attempt_cycle_started_at` à `null` (G1). Ce n'est pas la boucle automatique refusée en G3 —
c'est un geste humain — mais il doit porter les mêmes garanties que le geste qu'il réarme
(`settings.ts:308-343`) :

- **La même confirmation par e-mail saisi** (`makeDeletionRequestSchema`). Un clic ne suffit
  pas : l'écran présente deux boutons aux conséquences opposées, et l'un détruit. Le coût est
  une saisie ; le bénéfice est qu'un clic de travers ne peut rien détruire. _Annuler_, lui,
  reste à **un clic** — règle 11, l'annulation ne se paie pas au prix de l'action.
- **Le même `rateLimit('mutation', …)`.**
- **Un événement d'audit dédié** — règle 4 du `CLAUDE.md` : une action sensible qui n'émet
  rien est une action qui n'a pas eu lieu, pour qui relit. Nouvelle valeur dans `AuditEvent`
  (`audit-log.ts:75-80`), **sans `resource_id`** : `SAFE_METADATA_KEYS` l'autorise
  (`:101-105`), et rien n'empêcherait d'y écrire l'UUID de la personne — ce que
  `deletion.ts:96-99` interdit explicitement pour cette famille d'événements. C'est aussi lui
  qui porte l'historique inter-cycles que `attempts` perd (G1).
- **L'écran porte la DATE de la relance**, pas un simple état : « relancée le 11 août »,
  jamais « en attente ». Règle 11 — une date se vérifie, un état se croit.

**Cette date exige sa propre colonne, `retried_at`, et aucune existante ne peut la porter** :
`requested_at` est la demande initiale ; `scheduled_for` ne bouge pas (G1 le refuse) ;
`claimed_at` est `null` après une relance ; `last_attempted_at` date une **tentative**, pas la
relance ; `attempt_cycle_started_at` est `null` entre la relance et la première réclamation,
soit jusqu'à 24 h d'écran affichant _rien_. Et la lire depuis `audit_log` est exclu : cette
table n'a **aucune policy client** (`20260416000002:107-109`), il faudrait une lecture
`service_role` au rendu d'une page utilisateur — terrain de l'incident H3. Réutiliser l'ancre
serait lui donner deux sens, c'est-à-dire refaire ce que G2 puis l'ancre elle-même ont coûté
deux tours de revue à défaire.

**Et elle s'affiche dans la branche `pending`, pas dans la branche `failed`.** _Réessayer_
remet la ligne en `pending` : le chemin naturel de l'exécution — « j'ajoute le cas `failed`,
je ne touche pas au reste » — écrirait la colonne et ne l'afficherait **jamais**. Une colonne
ajoutée pour être lue, que rien n'oblige à paraître, est le mécanisme muet sur lequel cet ADR
s'ouvre. La preuve 7bis existe pour ça.

**La règle « une issue qui n'a modifié aucune ligne rend un échec explicite » vaut aussi pour
_réessayer_**, pas seulement pour `cancelDeletion()` : deux onglets ouverts, une réclamation
entre-temps, et la relance porte sur une ligne qui n'est plus `failed`. C'est le défaut
bloquant de la v1, qui n'attend qu'une action neuve pour reparaître.

**Politique RLS.** Le chemin produit passe par `createServiceRoleClient()`
(`deletion.ts:134`), qui contourne la RLS ; `deletion_self_update` n'est que de la défense en
profondeur contre un appel PostgREST direct. **Décision : l'élargir malgré tout** en
`using (auth.uid() = user_id and status in ('pending','failed'))`. Le `with check` épingle
déjà `status = 'cancelled'` et `auth.uid() = user_id`, donc rien ne s'ouvre : aucun chemin ne
permet d'écrire `failed` soi-même (`deletion_self_insert` est supprimée,
`20260727000001:164`) ni de toucher la ligne d'autrui. La laisser étroite se défendrait aussi
— c'est le **silence** qui garantirait qu'un futur relecteur « corrige » l'incohérence.

**Résiduel à nommer, pas à corriger** : une ligne peut atteindre `failed` après que la
pseudonymisation du journal d'audit a réussi et que GoTrue a échoué
(`deletion-core.ts:84-93`). La personne annule, son compte survit, sa piste d'audit reste
anonymisée définitivement. ADR-024 D1 accepte déjà ce dégât en cas de crash ; G5 le rend
**déclenchable par l'utilisateur**.

### G6 — Quelqu'un doit pouvoir le voir sans lire un log

Le corps de réponse du cron gagne **`stuck`** — le total des lignes `failed`, lu après
l'exécution. Il ne porte que des nombres.

**`quarantined` (« passées `failed` pendant CETTE exécution ») est délibérément abandonné.**
Il n'est pas exprimable sans toucher au contrat du RPC : `claim_pending_deletions` rend
`table(request_id, target_user_id)` (`20260727000001:77`), consommé tel quel par
`deletion-core.ts:113-116` et asserté par `e2e/gdpr-deletion-queue.spec.ts:213-224`. Un
comptage postérieur depuis la route donnerait le total, c'est-à-dire `stuck`. Changer le type
de retour, ou calculer un delta avant/après, pour un nombre publié dans un corps JSON que
**personne ne lit** — il n'y a ni drain de logs ni alerte — serait payer un contrat cassé
pour une information que la surface durable porte déjà. `stuck` est un **état**, et c'est un
état qu'on surveille.

Le panneau d'administration affiche **deux** compteurs, pas un :

1. les lignes `failed` — « à regarder » ;
2. **toute ligne non terminale** — `pending`, `processing` **ou** `failed` — dont
   `requested_at < now() - interval '25 days'`, c'est-à-dire à moins de cinq jours du
   manquement (G3).

Le second ne se restreint **pas** aux lignes `failed` : une ligne `pending` affamée par
l'afflux (résiduel G4) court au manquement sans jamais passer `failed`, et un compteur
restreint afficherait `0` pendant ce temps. **C'est le manquement qu'on surveille, pas l'une
de ses causes.**

**Et cette largeur est une dépendance, pas un confort.** _Réessayer_ permet à quelqu'un de
repousser indéfiniment sa propre quarantaine (relancer tous les quatre jours) : sa ligne ne
passe jamais `failed`, donc le compteur n° 1 affiche `0` pendant que son effacement échoue en
boucle. Seul le compteur n° 2, **parce qu'il couvre les lignes non terminales**, la voit — et
l'horloge de l'art. 12(3) court quand même, `requested_at` ne bougeant pas. Qui « simplifiera »
un jour ce compteur en le restreignant aux `failed` rouvrira cet angle mort sans s'en
apercevoir.

**Contrainte technique, et c'est le terrain de l'incident H3** : `deletion_requests` est en
`FORCE RLS` avec des policies self-only, donc la session de @thierry ne voit **que ses propres
lignes**. Le comptage exige une lecture `service_role` dans un Server Component. Décision :
client scellé, `count: 'exact', head: true`, **zéro identifiant sélectionné**. Le garde
`requireAdmin()` est déjà en place (`admin/layout.tsx:48`). À noter : `admin/page.tsx` est
aujourd'hui un placeholder sans aucune requête — ce lot y ajoute la première.

**Résiduel accepté** : une personne dont l'effacement échoue reste en attente jusqu'à ce
qu'elle agisse (G5) ou que @thierry le voie. Avec cinq comptes, tenable ; plus du tout avec
cent. L'action de remise en file **par l'administration** n'est pas dans ce lot.

### G7 — `failed` est un statut ACTIF

Il entre dans `deletion_requests_one_active_idx` (`20260727000001:66-68`). **Un utilisateur a
au plus une demande active, quel qu'en soit le statut.**

C'était la seconde omission bloquante de la v1 : les deux branches cassaient quelque chose.

- **Si `failed` n'était PAS actif** : une personne cumulerait une ligne `failed` et une
  nouvelle `pending`. Or `settings/page.tsx:35` fait
  `.in('status', ['pending','processing']).maybeSingle()`, et son commentaire justifie le
  `maybeSingle()` **par cet index**. Deux lignes correspondantes → erreur PostgREST → la page
  de réglages tombe pour la personne concernée.
- **Si `failed` est actif, sans autre correctif** : `requestDeletion()` prend un `23505`,
  cherche la ligne existante avec `.in(['pending','processing'])` (`deletion.ts:74`), ne
  trouve rien, et **jette** (`:81`). La personne ne pourrait **plus jamais** redemander son
  effacement — blocage art. 17 pur.

**Décisions, indissociables :**

1. `failed` entre dans l'index d'unicité. **Sa reconstruction n'exige aucune passe d'écrasement
   préalable**, contrairement à celle de `20260727000001:51-61` : le statut `failed` n'existe
   pas encore, donc aucune ligne ne peut entrer en collision. Écrit ici pour que personne
   n'ajoute « par prudence » un `update` qui écrirait en production sans raison.
2. La recherche de `requestDeletion()` inclut `failed`. **Et sa signature doit changer** :
   elle rend aujourd'hui `Promise<{ scheduledFor: string }>` (`deletion.ts:53`), or sur une
   ligne `failed` il n'existe **aucune échéance honorable** — la ligne est en quarantaine, elle
   ne sera jamais réclamée. Rendre `scheduledFor` serait exactement ce que sa branche `23505`
   existe pour empêcher (`:69-72` — « ne pas annoncer une échéance que la file n'honorera
   pas »). Décision : un retour discriminé, `{ kind: 'scheduled', scheduledFor }` ou
   `{ kind: 'already_failed' }`, l'appelant renvoyant vers l'écran de statut où _réessayer_
   attend. Sans cette décision, la session d'exécution improviserait un mensonge de plus.

   **Changer la signature est nécessaire mais PAS suffisant.** `settings.ts:330` fait
   `await requestDeletion(…)` et **jette le retour** : un type discriminé compilerait sans
   erreur et l'action continuerait de rendre `ok: true` sur une ligne en quarantaine — la
   forme exacte du défaut bloquant de la v1, déplacée d'une fonction. L'action **consomme
   `kind`**, et un **Vitest** le fige (la preuve e2e n° 10 ne suffit pas : elle passerait par
   hasard tant que l'action rend un succès et que l'écran redirige).

   Deux effets de bord à connaître avant de chercher longtemps :
   `src/lib/gdpr/__tests__/deletion.test.ts:174,199-201` destructure `{ scheduledFor }` et
   **cassera au typecheck** — bruyamment, c'est bien. Mais
   `settings-mfa.test.ts:93` et `settings-deletion.test.ts:67` posent `requestDeletion:
vi.fn()` **non typé** : ils ne cassent pas au typecheck et rendront `undefined`, donc
   l'action qui lit `.kind` **échouera à l'exécution**. Et
   `e2e/gdpr-deletion-queue.spec.ts:251-253` porte un commentaire (« answers with the EXISTING
   deadline ») devenu faux — à corriger, sans impact sur le code.

3. `settings/page.tsx` inclut `failed` dans son `.in(...)`, faute de quoi la zone de danger
   **réafficherait le formulaire de demande** et perdrait le lien vers l'écran de statut — la
   régression exacte que documente `e2e/gdpr-deletion-queue.spec.ts:290-300`.

**Sortie de `failed`** : _annuler_ → `cancelled`, _réessayer_ → `pending` (G5). `stuck` peut
donc redescendre. Un compteur qui ne redescend jamais devient du bruit, puis n'est plus
regardé — mécanisme muet, deuxième couche.

### G8 — `last_error_code` est un vocabulaire fermé, jamais un message

L'appelant ne dispose que d'un `unknown`. Y écrire `safeErrorMessage(error)`
(`route.ts:53`) persisterait un message GoTrue brut — susceptible de contenir une adresse
e-mail — **dans la table de la demande d'effacement**, lisible par la personne via
`deletion_self_select`. La vérification « aucun identifiant » d'ADR-024 porte sur les
journaux et le corps de réponse, **pas sur la base**.

Énumération, close par un `check` : `gotrue_error`, `pseudonymise_error`, `unknown`,
`not_attempted` — **et `null`**, qu'il faut admettre explicitement : une ligne jamais réclamée
a `attempts = 0` et aucun code, donc une énumération à quatre valeurs seule ferait échouer
l'insertion de `requestDeletion()`.

**Et le code actuel ne sait pas produire ce vocabulaire.** `deletion-core.ts:49` et `:92`
lèvent tous deux un `Error` nu à message interpolé ; `route.ts:125` n'attrape qu'un `unknown`.
Rien ne distingue les deux premières valeurs. Trois issues, une seule acceptable :

- une **expression régulière sur le message d'erreur** — refusée : le `CLAUDE.md` global range
  explicitement ce genre de raccourci parmi les manières de « faire passer » ;
- **abandonner la distinction**, `unknown` couvrant les deux — refusé aussi, et c'est le point
  qui tranche : savoir **lequel des deux** a échoué a une conséquence réelle pour la personne.
  Si la pseudonymisation échoue, rien n'a été détruit ; si GoTrue échoue **après** elle, la
  piste d'audit est déjà anonymisée définitivement (résiduel nommé en G5). Écraser les deux
  sous un même code, c'est perdre l'information qui dit à quel point on lui doit une
  explication ;
- **une erreur typée portant son code, levée par `deletion-core.ts`** — retenu. Elle entre au
  découpage (point 3bis), et l'appelant se contente de la lire.

**Qui l'efface** : la réclamation le remet à `not_attempted` en même temps qu'elle incrémente
`attempts`. Sans cela, un code d'échec du jour 3 resterait collé à une tentative du jour 4
morte avant d'agir.

### G9 — Le seuil 5 a une source unique

Il apparaîtrait sinon à trois endroits : la quarantaine, le filtre de réclamation, et le texte
d'interface. ADR-024 D3 a explicitement refusé de dupliquer un seuil entre deux couches.

**Décision** : la valeur vit dans la migration (SQL). L'interface ne la répète **pas** dans
`messages/*.json` — elle formule sans nombre, ou reçoit la valeur en variable. Le filtre
`attempts < 5` de la réclamation est une **ceinture redondante** avec la quarantaine : à
garder, mais le commentaire de la migration doit dire que c'en est une, sinon le prochain
lecteur en supprimera une des deux.

## Invariants à inscrire dans la migration

Au même endroit que l'invariant `1 h > maxDuration` existant :

1. **L'ordre des trois opérations est reprise → quarantaine → réclamation, et c'est le seul
   correct.** `Q→R→C` : la ligne reprise après la quarantaine y échappe un jour entier, en
   boucle. `R→C→Q` : la ligne à 5 tentatives est réclamée avant d'être vue, et la quarantaine
   — qui ne touche que `pending` — ne la voit plus jamais.
2. **La quarantaine ne porte QUE `status = 'pending'`** — c'est ce qui rend sûr le bouton
   d'annulation de G5. Sous READ COMMITTED, deux invocations concurrentes sont sûres
   uniquement grâce à ce prédicat : l'`update` de la seconde le réévalue après libération du
   verrou, voit `processing`, et passe. Écrire la quarantaine en `attempts >= 5` seul mettrait
   en `failed` une ligne **dont l'appel GoTrue est en vol**, et G5 rendrait alors le bouton.
3. **Toute ligne `failed` porte `claimed_at is null`.** La chaîne le garantit déjà — seule la
   reprise produit une ligne `pending` avec `attempts >= 5`, et elle nulle `claimed_at` juste
   avant que la quarantaine ne passe (G2). L'écrire comme invariant transforme la sûreté du
   bouton de G5 d'un **argument** en une **assertion vérifiable en base**.
4. **`check (attempts = 0 or attempt_cycle_started_at is not null)`** — une CONTRAINTE, pas un
   espoir. Si l'ancre n'était pas posée alors que `attempts > 0`, le conjoint de G3 vaudrait
   `NULL`, donc jamais vrai : la ligne deviendrait **inquarantinable pour toujours** tout en
   continuant d'occuper un créneau du lot chaque nuit — le gel silencieux de #285, à
   l'identique, produit par le garde-fou censé le fermer. Avec la contrainte, la même erreur
   échoue à l'écriture, bruyamment. C'est le seul des quatre invariants qui soit
   **mécaniquement** vérifié plutôt que seulement testable.

## Alternatives écartées

**Un simple `and attempts < 5` dans la réclamation, sans statut `failed`.** Moins de code, et
c'est son défaut : la ligne devient invisible sans que rien ne le dise. Un état qui n'existe
que comme absence dans une clause `where` est le mécanisme muet type.

**Un backoff exponentiel plutôt qu'un plafond.** Avec un cron quotidien, un backoff se compte
en jours et pousse mécaniquement la ligne au-delà du délai légal d'un mois.

**Remettre le bouton d'annulation aussi en `processing`.** L'appel GoTrue peut être parti.
Offrir une commande qui ne peut pas aboutir est la faute d'origine, pas sa correction.

**Ne plus nuller `claimed_at` (proposition de la v1).** Écartée, cf. G2.

**Ne rien changer et armer quand même.** Avec la file vide, l'armement fonctionnerait —
jusqu'au premier échec durable, qui figerait la file sans bruit.

## Conséquences

**Positives.** La file avance quoi qu'il arrive à une ligne. Une ligne en échec porte
pourquoi. L'écran cesse d'affirmer un irréversible qui n'arrive pas, et la personne garde une
sortie **et** un recours. `CRON_SECRET` devient posable.

**Négatives, assumées.** **Cinq** colonnes, un statut de plus dans deux `check` et un index,
deux cas de plus dans l'écran, une action de plus, une erreur typée dans le domaine, une
première requête dans le panneau d'administration.

**Risque de migration.** Il est nul **indépendamment du contenu de la table**, et c'est ainsi
qu'il faut l'énoncer : `attempts` arrive avec `default 0`, les **quatre autres** colonnes sont
nullables, le nouveau statut n'invalide aucune ligne existante, et l'invariant n° 4
(`attempts = 0 or ancre is not null`) est satisfait par toute ligne préexistante puisque
`attempts` y vaut 0. (La table est vide aujourd'hui — mais cette mesure se périme d'ici au
`db push`, donc l'argument ne doit pas reposer dessus.)

## Découpage d'exécution

Une seule PR :

1. **Migration** : **cinq** colonnes (`attempts`, `last_attempted_at`, `last_error_code`,
   `attempt_cycle_started_at`, `retried_at`), `check` de statut élargi à `failed`, index
   d'unicité élargi (G7), `check` sur `last_error_code` admettant `null` (G8), **`check` de
   l'invariant d'ancre** (§Invariants n° 4), réécriture de `claim_pending_deletions` (reprise
   sans toucher aucune des quatre colonnes, quarantaine conjonctive ancrée, incrément, pose de
   l'ancre **quand elle est nulle**, nouvel ordre), policy `deletion_self_update` élargie
   (G5), les **quatre** invariants en commentaire.
2. **`src/lib/supabase/types.ts`** régénéré — sans quoi une écriture de `last_error_code` ne
   compile pas.
3. **`deletion-core.ts`** : erreur typée portant son code, pour que `gotrue_error` et
   `pseudonymise_error` soient **produisibles** (G8) — sans elle, seule une expression
   régulière sur un message les distinguerait, et c'est refusé.
4. **Route de cron** : écriture de `last_error_code` **et `last_attempted_at`** (même
   écriture, au verdict), champ **`stuck`** (pas `quarantined`, cf. G6) ; commentaire de
   `maxDuration` amendé — il garde désormais **deux** invariants, la double-suppression **et**
   la sûreté du bouton de G5.
5. **Chemin d'annulation** : `cancelDeletion()` accepte `failed`, et `reason: 'none'` cesse de
   pouvoir se présenter comme un succès.
6. **Action _réessayer_** : confirmation par e-mail saisi, `rateLimit('mutation', …)`,
   nouvel événement d'audit **sans `resource_id`**, remise à zéro de `attempts` **et** de
   l'ancre, écriture de `retried_at`, et **échec explicite si aucune ligne n'a bougé** (G5).
7. **`requestDeletion()`** : `failed` dans son `.in(...)`, **retour discriminé**, et
   **`settings.ts:330` qui le consomme** (G7) — plus les deux mocks non typés à corriger.
   **`settings/page.tsx`** : `failed` dans son `.in(...)`.
8. **Écran de statut** : cas `failed` avec ses deux actions, **et la date de relance dans la
   branche `pending`** — les deux branches, pas seulement la nouvelle (G5). Texte honnête,
   **cinq locales**.
9. **Panneau d'administration** : les deux compteurs, en lecture scellée.
10. **Tests** : cf. §Vérification.

**Puis l'armement, qui n'est PAS une PR mais un runbook** — il ne contient aucun code, et
ADR-024 D6 en faisait une PR à une époque où il en contenait. Il est **indivisible** : les
deux lectures de production dues par ADR-024, puis `CRON_SECRET` → **redéploiement** →
`vercel crons ls` → exécution manuelle sur file vide. Poser la variable sans redéployer donne
un `401` quotidien **silencieux** : `expected` devient défini, juste faux.

## Vérification — chaque preuve avec son instrument

| #     | Ce qu'il faut prouver                                                                                                                                                                       | Instrument                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1     | `attempts` **augmente** à l'échec et **survit** à la remise en file                                                                                                                         | SQL sur pile locale                              |
| 2     | Une tentative interrompue **avant** traitement compte quand même                                                                                                                            | SQL sur pile locale                              |
| 3     | À 5 tentatives **et** 5 jours d'ancre, la ligne passe `failed`, **disparaît des lots**, et porte `claimed_at is null` ; une 26ᵉ demande saine est servie                                    | SQL sur pile locale                              |
| 4     | 5 invocations en une minute ne quarantainent **rien** — sur une ligne fraîche **ET sur une ligne réessayée**. La seconde variante est celle qui échouerait si l'ancre était `scheduled_for` | SQL sur pile locale                              |
| 5     | 25 lignes en échec n'empêchent pas une demande du jour d'être traitée (G4)                                                                                                                  | SQL sur pile locale                              |
| 6     | `last_error_code` est **réellement écrit** — `FORCE RLS`, donc jamais un mock                                                                                                               | e2e authentifiée, lecture après coup             |
| 7     | L'écran en `failed` expose annuler **et** réessayer, et ne dit pas « ne peut plus être annulée »                                                                                            | e2e authentifiée                                 |
| 7bis  | **Après une relance**, l'écran (branche `pending`) affiche la **date** de la relance, pas un état                                                                                           | e2e authentifiée                                 |
| 8     | _Annuler_ en `failed` **modifie réellement la ligne** ; un `none` ne rend jamais `ok: true`                                                                                                 | Vitest sur l'action + e2e                        |
| 9     | Le bouton reste masqué en `processing`                                                                                                                                                      | e2e authentifiée                                 |
| 10    | Une personne dont la demande est `failed` **peut** en redéposer une (art. 17, G7)                                                                                                           | e2e authentifiée                                 |
| 10bis | L'action **consomme `kind`** et ne rend pas `ok: true` sur `already_failed`                                                                                                                 | Vitest sur l'action — l'e2e passerait par hasard |
| 10ter | Une ligne à `attempts > 0` **sans ancre** est refusée par la base (invariant n° 4)                                                                                                          | SQL sur pile locale                              |
| 11    | La page de réglages ne tombe pas et n'affiche pas le formulaire quand une ligne `failed` existe                                                                                             | e2e authentifiée                                 |
| 12    | Aucun identifiant dans les journaux, le corps de réponse **ni la base** (G8)                                                                                                                | relecture + assertion                            |

**Planchers e2e.** 241 et 45 sont les planchers **actuels**, pas ceux attendus après ce lot —
la §Vérification ci-dessus ajoute six cas authentifiés, donc annoncer 45 serait faux.

- **Public : inchangé à 241.** `gdpr-deletion-queue.spec.ts` **saute** dans le job public
  (`test.skip`, lignes 66-71), et un cas `skipped` ne sort pas de `N passed`.
- **Authentifié : > 45, valeur MESURÉE en local dans les deux sens avant le premier push.**
  Un plancher qui monte parce qu'un trou a été trouvé est le mouvement sain ; l'annoncer
  stable serait le seul faux pas.

`gdpr-deletion-queue.spec.ts` n'est **pas** en quarantaine (`e2e/authenticated-specs.json:24`)
et la liste ne doit pas grossir.

## Points laissés ouverts, délibérément

- **`completed` reste dans le `check`** de statut. Inatteignable par D1 (la ligne cascade avec
  le compte), l'écran garde sa branche : la retirer serait un changement sans bénéfice.
- **La remise en file par l'administration** n'existe pas. Elle se décidera quand le nombre de
  comptes la rendra nécessaire (cf. résiduel G6).

## Historique de révision

**v1 → v2**, après verdict `🟡 APPROVED WITH CHANGES` de `plan-reviewer` :

| Correction                                                                                                   | Origine               |
| ------------------------------------------------------------------------------------------------------------ | --------------------- |
| G5 — `cancelDeletion()` ne touchait aucune ligne en `failed` et rendait pourtant un succès                   | **défaut bloquant**   |
| G7 créé — `failed` non positionné vis-à-vis de l'index d'unicité, les deux branches cassaient                | **défaut bloquant**   |
| G2 **inversé** — continuer de nuller `claimed_at`, la colonne garde un sens unique                           | décision v1 nuisible  |
| G1 — conflation « réclamée » / « tentée » nommée ; trois cas de fausse tentative                             | omission              |
| G3 — conjonction temporelle ajoutée ; ≈ 11 jours au lieu de « quinzaine » ; `failed` = manquement en attente | nombre trompeur       |
| G4 — résiduel de famine par afflux, avec sa condition d'échelle                                              | propriété non nommée  |
| G6 — deux compteurs au lieu d'un ; contrainte `FORCE RLS` / lecture scellée                                  | H3 non anticipé       |
| G8 créé — vocabulaire fermé, sinon un message GoTrue atterrit en base                                        | fuite potentielle     |
| G9 créé — source unique du seuil 5, ceinture redondante déclarée                                             | ADR-024 D3            |
| Invariants d'ordre et de prédicat de quarantaine, à inscrire dans la migration                               | couplage non écrit    |
| Régénération de `types.ts` ajoutée au découpage                                                              | oubli                 |
| §Vérification répartie par instrument ; planchers e2e annoncés                                               | preuve inopérante     |
| Armement requalifié en runbook, pas en PR                                                                    | contradiction interne |
| Faits mesurés accompagnés de leur commande ; risque de migration énoncé sans dépendre de la mesure           | doctrine              |

**v2 → v3**, après second verdict `🟡 APPROVED WITH CHANGES` :

| Correction                                                                                                                                                                                                                                                                                                                                                        | Origine                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **G1/G3 — l'ancre du conjoint temporel devient `attempt_cycle_started_at`.** _Réessayer_ remettait `attempts` à 0 sans toucher `scheduled_for`, figé dans le passé : la conjonction devenait **vraie pour toujours** et la quarantaine retombait à `attempts >= 5` seul — la version que G1 venait d'écarter. Même défaillance sur une ligne affamée par l'afflux | **défaut bloquant, introduit par la v2 elle-même** |
| **G6 — `quarantined` abandonné.** Inexprimable sans casser le contrat du RPC et sa spec ; `stuck` seul est conservé                                                                                                                                                                                                                                               | **non exprimable**                                 |
| G5 — contrat de _réessayer_ écrit : confirmation par e-mail saisi, `rateLimit`, événement d'audit, date affichée (règles 4 et 11)                                                                                                                                                                                                                                 | action sans contrat                                |
| G7 — `requestDeletion()` change de signature : retour discriminé, sinon elle annonce une échéance que la file n'honorera jamais                                                                                                                                                                                                                                   | mensonge résiduel                                  |
| G6 — le second compteur porte sur **toute** ligne non terminale, pas sur les seules `failed` : une `pending` affamée court au manquement sans jamais passer `failed`                                                                                                                                                                                              | alarme aveugle                                     |
| §Vérification — preuve n° 4 dédoublée (ligne fraîche **et** réessayée) ; `claimed_at is null` ajouté à la n° 3                                                                                                                                                                                                                                                    | preuve qui ne prouvait pas                         |
| Planchers e2e — public inchangé à 241 (la spec **saute** dans le job public), authentifié **> 45 à mesurer**, au lieu d'annoncer 45                                                                                                                                                                                                                               | plancher faux                                      |
| G8 — `null` explicitement admis par le `check`                                                                                                                                                                                                                                                                                                                    | insertion impossible                               |
| §Invariants — troisième invariant : toute ligne `failed` porte `claimed_at is null`                                                                                                                                                                                                                                                                               | argument non assertable                            |
| G7 — la reconstruction de l'index n'exige aucune passe d'écrasement                                                                                                                                                                                                                                                                                               | écriture inutile évitée                            |

**v3 → v4**, après troisième verdict `🟡` (« plus rien à revoir dans la conception ») :

| Correction                                                                                                                                                                                                                                                          | Origine                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **`retried_at`, cinquième colonne.** La date de relance imposée par la règle 11 n'avait **aucune colonne pour la porter** — et `audit_log` n'a aucune policy client, donc la lire au rendu d'une page utilisateur serait le terrain de l'incident H3                | **décision de schéma manquante**        |
| **`check (attempts = 0 or attempt_cycle_started_at is not null)`.** Sans cette contrainte, une ancre non posée rend le conjoint `NULL` : la ligne devient **inquarantinable à vie** tout en occupant un créneau — le gel de #285 reproduit par son propre correctif | **invariant qui n'était qu'un espoir**  |
| G1 — la pose de l'ancre porte sur la **nullité**, pas sur `attempts = 0` : la première répare un invariant rompu, la seconde gèle la ligne à vie                                                                                                                    | choix non tranché                       |
| G1 — l'amnésie inter-cycles nommée ; l'événement d'audit de relance devient **non négociable** puisqu'il porte seul l'historique                                                                                                                                    | défaut d'origine, réintroduit d'un cran |
| G2 — l'ancre **énumérée** parmi les colonnes que la reprise ne touche pas (liste de trois → quatre)                                                                                                                                                                 | lecture littérale dangereuse            |
| G7 — changer la signature ne suffit pas : `settings.ts:330` **jette le retour**, donc l'action rendrait `ok: true` sur une quarantaine. Consommation de `kind` + Vitest exigés ; deux mocks non typés et un commentaire e2e signalés                                | défaut v1 déplacé d'une fonction        |
| G6 — la largeur du compteur n° 2 déclarée comme **dépendance** : _réessayer_ permet de repousser sa quarantaine indéfiniment, et seul un compteur non restreint aux `failed` le voit                                                                                | angle mort futur                        |
| G4 — une ligne réessayée repart en **tête** du lot                                                                                                                                                                                                                  | propriété non nommée                    |
| G5 — l'événement d'audit précisé **sans `resource_id`**                                                                                                                                                                                                             | fuite d'identifiant possible            |
| §Vérification — deux preuves ajoutées (consommation de `kind` en Vitest, refus de la base sans ancre)                                                                                                                                                               | preuves manquantes                      |

**v4 → v5**, après quatrième verdict — trois décisions qui restaient à la charge de l'exécution :

| Correction                                                                                                                                                                                                                                                                                            | Origine                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **`last_attempted_at` est écrit par l'appelant, AU VERDICT**, jamais à la réclamation — sinon elle redit ce que `claimed_at` et l'ancre disent déjà, et **contredit** la distinction « réclamée ≠ tentée » que G1 construit                                                                           | colonne à deux sens, la faute récurrente de ce document |
| **G8 — le vocabulaire n'était pas produisible.** `deletion-core.ts` lève deux `Error` nus indiscernables. Décision : **erreur typée portant son code**, contre l'expression régulière (raccourci interdit) et contre l'abandon de la distinction (elle dit si la piste d'audit a déjà été anonymisée) | valeur imposée sans source                              |
| **`retried_at` s'affiche dans la branche `pending`, pas `failed`** — le chemin naturel de l'exécution l'aurait écrite sans jamais l'afficher. Preuve **7bis** ajoutée                                                                                                                                 | mécanisme muet en formation                             |
| G5 — « une issue qui n'a modifié aucune ligne rend un échec explicite » généralisé à _réessayer_                                                                                                                                                                                                      | défaut v1 en embuscade                                  |
| §Conséquences — trois colonnes → **cinq**, dont quatre nullables ; invariant n° 4 satisfait par toute ligne préexistante                                                                                                                                                                              | compte périmé                                           |
