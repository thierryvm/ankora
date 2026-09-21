# ADR-045 — Le relevé de solde est une série, et il porte son écart

- **Statut** : Accepted
- **Date** : 2026-09-20
- **Accepté le** : 2026-09-20 par @thierry, sur deux questions posées avant toute ligne de SQL
- **Proposé par** : @cc-ankora (lot J2 du journal, refonte v3)
- **Deciders** : @thierry, @cc-ankora
- **Tags** : `schema`, `domain`, `fondation`, `journal`
- **Amende** : [ADR-038](ADR-038-journal-des-mouvements.md) §D6 (le solde d'ouverture devient une série de relevés)
- **Confirme sans l'amender** : [ADR-038](ADR-038-journal-des-mouvements.md) §D1 (une table de mouvements, pas deux), §D4 (ventilation refusée si elle ne somme pas), §D7 (rien ne se supprime), [ADR-040](ADR-040-ordre-execution-du-journal.md) §E2 (le journal se clé sur `account_type`)

---

## Contexte

Le lot J2 donne au journal sa table. Trois questions n'étaient pas tranchées par
ADR-038 ni par ADR-040, et les trois changent le schéma. Elles ont été posées à
@thierry le 2026-09-20, **avant** la migration.

## D13 — Une table `movements`, pas deux tables spécialisées

Le découpage en deux tables (virements d'un côté, argent reçu de l'autre) rendait les
contraintes plus simples : la ventilation n'existe que pour un virement, la description
n'est obligatoire que pour une rentrée, donc chaque `CHECK` aurait été inconditionnel.

**Écarté.** ADR-038 D1 (`:114-120`) décide une ligne unique portant `from` et `to`, l'un
des deux nul pour une entrée externe. Trois endroits du dépôt l'annoncent déjà :
`20260810000001_d3_attribution_paiements_expand.sql:228-229` (« ce qui portera la
sémantique entrée/sortie externe de la table de mouvements en J2 »), ADR-040 E1, et
`docs/audits/2026-09-12-etat-avant-refonte.md:391-399`.

Décider autrement aurait amendé un ADR `Accepted` **dans la session qui l'implémente** —
ce que la liste bannie d'ADR-040 / `CLAUDE.md` §2 interdit précisément.

Prix assumé : quatre `CHECK` conditionnels. @thierry pose la contrepartie, et elle est
dans les critères de la PR : **chacun a un test qui le fait échouer** — une ventilation
posée sur un virement qui ne va pas vers les provisions, une somme des parts différente du
montant, `from` et `to` nuls ensemble, `from` égal à `to`. Un `CHECK` jamais vu refuser
n'est pas un garde-fou, c'est une intention.

## D14 — Le relevé de solde est une série, et chaque relevé porte son écart

ADR-038 D6 (`:208-215`) décide un **ancre** : « un solde d'ouverture daté », « une seule
ligne d'ouverture par compte. Une seconde fausse tout, silencieusement ».

Le danger nommé est réel : avec « dernier relevé + flux postérieurs », un second relevé
**absorbe** l'écart entre ce qui est dérivé et ce qui est déclaré. Le solde redevient
juste, et ce qui manquait disparaît.

**Décision : garder la série, et retourner le danger en mesure.** Ce qu'autorise ADR-040
D11 (`:148-168`) : « le rapprochement interne ne sert pas à vérifier la justesse (elle
l'est par construction) : il sert à **mesurer ce qui manque** ».

Trois conditions, sans lesquelles cette décision livre exactement ce que D6 interdisait :

1. Le **premier** relevé d'un compte est l'ancre au sens de D6 — le plus ancien, il n'y en
   a qu'un.
2. Tout relevé porte `derived_balance` : **le solde dérivé à l'instant du relevé**.
   L'écart est donc une colonne, pas un calcul qu'on peut oublier de faire. Un relevé qui
   n'expose pas son écart est un effaceur silencieux.
3. Aucun relevé ne supprime ni ne réécrit le précédent (D7, règle 11 de `CLAUDE.md`).

`derived_balance` est **nullable** : ce lot n'a aucun écran, donc rien n'écrit encore, et
une colonne remplie par une migration qui ne sait pas dériver mentirait. Les relevés du
backfill font exception et portent `derived_balance = balance` : avant eux, **aucun flux
n'existe dans la base** — les deux tables naissent vides —, donc l'écart est nul par
définition, pas par commodité.

`accounts.balance` n'est ni lu, ni réécrit, ni supprimé par ce lot. Conséquence à dire
plutôt qu'à découvrir en J4 : **le dépôt porte deux sources pour le même nombre** pendant
toute la durée du programme. `balance` reste écrit par `src/lib/actions/accounts.ts` et lu
par le cockpit ; le relevé du backfill est un instantané qui se périme à la première
édition manuelle. D6 lève cette dualité ; J2 ne le fait pas, et ne prétend pas le faire.

## D15 — Une opération s'annule, elle ne s'efface pas

ADR-038 D9 (`:255-258`) interdit toute policy `DELETE`, et D7 (`:236-243`) pose « rien ne
se supprime ». La maquette v3 promet pourtant « Défaire », « Modifier » et « supprimer »
une opération écrite par erreur : sans mécanisme d'annulation **dans cette migration**, la
PR des écrans en demanderait une de plus.

**Décision** (règle 11 de `CLAUDE.md` : « l'annulation laisse une trace datée plutôt que
d'effacer la ligne ») : les deux tables portent `cancelled_at` et `cancelled_by`. Annuler
est un `UPDATE`, jamais un `DELETE`. Le domaine ignore une ligne annulée ; rien ne la
retire de l'export art. 20, parce qu'une opération annulée reste une donnée de la personne.

Deux conséquences, décidées ici pour ne pas l'être au call-site :

- **Ce qu'un `UPDATE` ne peut pas toucher** : `workspace_id`, `created_by` et
  `recorded_at`. Les deux premiers déplaceraient une ligne hors de son propriétaire ; le
  troisième est l'instant d'écriture, et toute la règle de l'heure (ci-dessous) repose sur
  lui. Un trigger les fige — une policy `with check` ne suffit pas, un éditeur du même
  workspace passerait à travers.
- **Une ligne annulée ne se modifie plus**, à une exception : la ré-ouverture
  (`cancelled_at` repassé à `NULL`). Annuler par erreur doit se réparer — sans quoi le
  « défaire » devient lui-même un piège à un clic —, mais le contenu d'une ligne annulée ne
  dérive pas en silence.

## D16 — La règle de l'heure

Un flux compte dans le solde dérivé d'un relevé si :

- sa date d'événement est **postérieure** à la date du relevé ; **ou**
- elle est **le même jour**, et son instant d'écriture est postérieur à celui du relevé.

Un flux **sans instant d'écriture** ne compte pas le jour même. Cette branche existe pour
les données d'avant le journal : les tables neuves ont toutes `recorded_at not null`, mais
la dérivation de J4 lira aussi `expenses`, `charge_payments` et `commitment_payments`.

Relevé au passage, et **non traité ici** : `charge_payments` et `commitment_payments`
n'ont **aucune date d'événement** — ni `occurred_on`, ni date d'échéance, seulement
`(period_year, period_month)` et `paid_at` (`20260503000004:28-30`,
`20260719000001:58-65`). Leur date d'événement devra être arbitrée par J4/D6 (prendre
`paid_at::date` ? la reconstruire depuis la période et `charges.payment_day` ?). Le
domaine de J2 prend des flux déjà datés et ne tranche pas pour eux.

## Ce que la clé `(workspace_id, account_type)` interdit — et ce que coûtera d'en sortir

ADR-040 E2 clé le journal sur `(workspace_id, account_type)`, parce qu'ADR-040 E1 renvoie
`accounts.id` (ADR-038 D0) en fin de programme. C'est accepté pour ce lot. Ce qu'il faut
avoir en tête au moment de décider « Ajouter un compte » — @thierry, 2026-09-20 :

**Ce que cette clé interdit, aujourd'hui, mécaniquement :**

- **Deux comptes du même type dans un workspace.** L'index unique
  `accounts_workspace_account_type_unique` (`20260503000001:56-57`) est la cible des clés
  étrangères du journal : deux comptes `daily_card` ne sont pas « déconseillés », ils sont
  **impossibles**. Deux comptes courants dans deux banques, un second livret d'épargne :
  inatteignables.
- **Nommer le compte qui a reçu.** Une opération désigne un **rôle**, pas un compte
  physique. « Viré vers Belfius » et « viré vers Revolut » sont la même ligne si les deux
  portent le même rôle.
- **Changer le rôle d'un compte.** `on update restrict` sur les FK du journal : dès qu'une
  opération référence la paire, `account_type` est verrouillé.

**Ce que coûtera le passage à `accounts.id`, pour ces deux tables précisément :**

1. Une migration qui ajoute `from_account_id` / `to_account_id` / `account_id`, les remplit
   par jointure sur `(workspace_id, account_type)` — **sans perte, la paire est unique** —,
   puis bascule les FK. ADR-040 E4 en fixe les deux conditions : le backfill tourne dans la
   **même** migration que l'ajout d'`id` et **avant tout relâchement de l'unicité**
   (après, la jointure devient ambiguë) ; et l'historique est attribué au **détenteur
   courant du rôle**, ce qui ne perd aucune granularité — elle n'a jamais existé.
2. Les FK composites deviennent `(workspace_id, id)`, **jamais `id` seul** : la mine posée
   par `20260810000001:270-279` vaut mot pour mot ici. Avec `workspace_id` dans la clé, les
   seules paires sondables par un canal d'intégrité sont celles de son propre workspace ;
   sur `id` seul, la vérification de clé étrangère devient un canal de sondage de lignes
   qu'on n'a pas le droit de lire.
3. Le domaine et le rapprochement changent de granularité, pas de forme : ils prennent
   aujourd'hui un `accountType` là où ils prendraient un identifiant.

Ce coût est **connu et borné**. Il est écrit ici pour que « Ajouter un compte » se décide
en le sachant, et non contre une surprise.

## Alternatives écartées

- **Deux tables spécialisées** — cf. D13.
- **Un seul relevé d'ouverture par compte, conforme à D6 à la lettre** — écarté : @thierry
  relève ses soldes, il ne les ouvre pas une fois pour toutes. La garantie de D6 est
  récupérée par `derived_balance`, pas abandonnée.
- **Effacer une opération fausse** — écarté par D7 et la règle 11. `DELETE` n'est ouvert à
  personne côté client ; le `service_role` le peut, comme pour `audit_log`, et ça s'assume.
- **Référencer une ligne de plan du mois** — il n'y en a aucune à référencer :
  `computeMonthlyTransferPlan` (`src/lib/domain/transfer.ts:39-75`) prend un mois, sans
  année, et ses quatre entrées sont mutables. Un couple `(année, mois)` désignerait un
  **recalcul** dont le résultat change quand une charge est éditée — la rétroactivité
  silencieuse que D3 existe pour fermer. Les chiffres du plan sont donc **copiés, figés**
  sur la ligne au moment du geste.

## Conséquences

**Positives.** Le journal existe ; un virement de 360 € se retient en entier, avec ses deux
parts ; de l'argent reçu s'écrit ; un solde a une date. L'écart entre déclaré et dérivé
devient mesurable au lieu d'être absorbé.

**Négatives, assumées.** Deux sources pour le solde jusqu'à J4. Quatre `CHECK`
conditionnels à maintenir. Une clé par rôle, dont le coût de sortie est chiffré ci-dessus.

**Reporté, nommé** : ADR-041 F2 (`settles_directly` et compte de règlement) n'entre pas
dans J2. ADR-041 `:190-199` fixe l'ordre — « F2 seul d'un côté, l'écriture à deux
mouvements de l'autre, dans cet ordre, jamais l'inverse » —, et J2 ne livre aucune
écriture. Le report ne contrarie donc rien.

## D17 — ce qu'un UPDATE peut changer sur une opération vivante

Décidé par @thierry le 2026-09-20, en réponse aux points laissés ouverts par la
première version de ce document.

Son auteur **corrige** : le montant, la date, la description, la note, la nature
d'argent reçu et la ventilation. C'est le « Modifier » de la maquette, et rien
d'autre n'a besoin d'exister pour lui — Ankora garantit la **cohérence**, pas
l'exhaustivité (ADR-040 D11).

Restent **figés** : `id`, `workspace_id`, `created_by`, `recorded_at`, `kind`,
et les comptes source et cible. Changer de compte n'est pas une correction :
c'est une autre opération, et la corriger en place déplacerait deux soldes
dérivés sans qu'aucune trace ne le dise. On annule, et on réécrit.

Conséquence sur le message du trigger : il cesse de dire que « corriger passe
par une annulation » — c'était faux pour cinq colonnes sur sept. Il **nomme la
colonne figée** qu'on vient de toucher, et liste ce qui se corrige. Pour un
relevé de solde, `account_type` est figé au même titre : l'identité de la ligne
— et, depuis D20, ce que le relevé mesure.

## D18 — `cancelled_at` et `cancelled_by` sont imposés par la base

Le client **demande** l'annulation ; il ne la déclare pas. Le trigger pose
l'instant (`now()`) et l'auteur (`auth.uid()`), quoi que le client ait envoyé.
La ré-ouverture, confirmée comme un droit (annuler par erreur doit se réparer,
sinon « défaire » devient lui-même le piège à un clic que la règle 11 combat),
remet les **deux** colonnes à NULL ensemble.

Raison : l'anon key est publique, PostgREST est joignable avec le JWT de la
personne, donc « annulé le 3 août par X » serait sinon une déclaration du
client. La règle 11 veut une date qui se **vérifie** ; une date que l'écrivain
choisit n'en est pas une. Mesuré le 2026-09-20 sur la base locale : avec la
version précédente du trigger, un `cancelled_at` forgé à 2020 était stocké tel
quel.

**Ce que la ré-ouverture coûte, et qui est assumé (@thierry, 2026-09-20).**
Remettre les deux colonnes à NULL **efface la trace de l'annulation** : après
ré-ouverture, plus rien dans la ligne ne dit qu'elle a été annulée le 3 août
par X. Un historique exhaustif aurait demandé une table d'événements par
opération — c'est-à-dire le modèle que D15 a écarté.

Le pilote tranche : **Ankora garantit la cohérence, pas l'exhaustivité**
(ADR-040 D11). Ce qui doit être vrai à tout instant, c'est que l'état affiché
soit celui de la base et qu'aucun chiffre ne se recalcule dans le dos ; pas que
chaque geste défait reste lisible pour toujours. Conséquences acceptées, écrites
pour que personne n'ait à les redécouvrir :

- une annulation puis ré-ouverture est **indiscernable** d'une ligne jamais
  annulée, dans l'application comme dans l'export art. 20 ;
- `updated_at` bouge, donc quelque chose s'est passé — mais quoi, ça ne se
  déduit pas de la ligne ;
- seul `audit_log` pourrait porter cette mémoire, et **il ne le fait pas
  aujourd'hui** : aucun chemin de J2 n'appelle `logAuditEvent()` (vérifié sur
  `src/lib/domain/accounts/` et la migration ; le seul appel du périmètre est
  celui de l'export art. 20, qui journalise l'export, pas l'annulation), parce
  que l'annulation est une écriture ordinaire du client, sans Server Action. Si
  l'exhaustivité
  devient un besoin (litige, obligation), c'est là qu'elle se posera, pas dans
  la table.

## D19 — l'argent reçu sur les provisions, le vocabulaire, et le sous-centime

1. **De l'argent reçu directement sur le compte de provisions ne se ventile
   pas.** De l'argent reçu n'est pas un versement de provisions : la ventilation
   (part lissée / part libre) décrit le partage d'un **virement** interne, et
   elle reste interdite partout ailleurs. Le CHECK `movements_ventilation` la
   conditionne donc à `kind = 'transfer' and to_account_type = 'provisions'`.
2. **`regular` / `extra` restent les valeurs en base** ; les libellés visibles
   sont ceux de la maquette (« mon revenu du mois », « en plus de mon revenu »).
   Le vocabulaire d'écran change sans migration.
3. **Le domaine refuse plus de deux décimales à sa frontière**, il ne les
   arrondit pas en silence : `validateTransferAllocation` rend le motif
   `sub-cent-precision`, `deriveAccountBalance` lève. Les colonnes sont
   `numeric(12,2)` et `numeric(14,2)` — PostgreSQL arrondirait de toute façon,
   mais **après** que l'écran a montré autre chose. Le refus rend le désaccord
   visible du seul côté où il peut encore se corriger. Contrôlé aussi sur chaque
   **part** : 200,005 + 75,445 = 275,45 exactement, donc une vérification par la
   somme seule laisserait passer deux parts inécrivables.
   `measureStatementGap` porte le même refus depuis le 2026-09-20, sur le solde
   relevé **et** sur celui de son ancre : un écart mesuré contre un solde au
   dix-millième rendrait un « il manque 0,004 € » qu'aucune ligne ne peut
   expliquer — l'écart deviendrait un artefact de la mesure. Test d'abord
   (rouge le 2026-09-20, `solde.test.ts`), correctif ensuite.
4. **L'export art. 20 vérifie le CONTENU** des deux tables neuves, et elles
   entrent dans le `it.each` de pagination : une table exportée vide passerait
   sinon pour une table exportée.

## D20 — un relevé de solde est une mesure : il s'annule et se réécrit

Décidé par @thierry le 2026-09-21, sur la relecture Sécurité du diff J2.

D17 décrit ce qu'une **opération** laisse corriger. Un **relevé** n'est pas une
opération : c'est ce que la banque affichait tel jour. Le corriger en place
déplacerait l'ancre de chaque solde dérivé après lui, sans qu'aucune ligne ne
garde ce qui était relevé auparavant — exactement l'effacement silencieux que
D14 retourne en mesure.

Sur `account_balance_statements`, `balance`, `stated_on` et `derived_balance`
rejoignent donc les colonnes figées, avec un message qui **nomme la colonne**.
Restent possibles l'annulation (écrite par la base, D18) et la ré-ouverture.
Une saisie fausse se répare en annulant le relevé et en en écrivant un autre —
deux relevés du même jour sont permis, l'ordre total (`stated_on`,
`recorded_at`, `id`) les départage.

Sur `movements`, rien ne change : D17 tient. Les trois noms n'existent pas dans
cette table, et le trigger partagé ne compare que les colonnes présentes.

Conséquence : sur un relevé, le gel des lignes **annulées** (D15) n'a plus de
colonne à protéger — toutes celles qu'il couvrait sont figées d'emblée. Il reste
prouvé côté opérations (`e2e/journal-mouvements.spec.ts`).

## Constat — les privilèges hérités par `authenticated` (relecture Sécurité, 2026-09-21)

Mesuré sur la pile locale (CLI 2.84.2), et vrai partout où les privilèges par
défaut de l'image Supabase s'appliquent au rôle qui crée les tables :

- `authenticated` hérite de **DELETE et TRUNCATE** sur `movements` et
  `account_balance_statements`, comme sur toutes les tables du schéma `public`.
  Les `grant select, insert, update` de J2 n'enlèvent rien : un GRANT ajoute.
- **DELETE est sans effet** : les deux tables sont en `force row level
security` et n'ont aucune policy DELETE, donc un DELETE du client ne voit
  aucune ligne.
- **TRUNCATE n'est pas filtré par RLS**, mais aucun chemin d'accès n'a été
  trouvé par la relecture : PostgREST n'émet pas TRUNCATE, et aucune migration
  ne définit de fonction qui l'exécute (recherche du mot dans `supabase/migrations/`).

**Décision (@thierry, 2026-09-21) : aucun `revoke` dans J2.** Le resserrer sur
ces deux tables seulement créerait un écart invisible entre tables d'un même
schéma. C'est une décision globale — resserrer les privilèges par défaut du
schéma `public`, toutes tables —, suivie par l'issue #478.
