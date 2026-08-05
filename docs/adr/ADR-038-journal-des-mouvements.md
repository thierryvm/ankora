# ADR-038 — Le journal des mouvements

- **Statut** : Accepted
- **Date** : 2026-08-05 (révision 2 après revue `plan-reviewer` — v1 rejetée)
- **Accepté le** : 2026-08-05 par @thierry, sur la révision 2 — **y compris D0**, qui migre la clé primaire d'`accounts` sur des données de production
- **Proposé par** : @cc-ankora (relevé factuel du schéma et du domaine, confrontation au modèle Coda de @thierry)
- **Deciders** : @thierry, @cc-ankora
- **Tags** : `domain`, `schema`, `produit`, `cockpit`, `fondation`
- **Amende** : [ADR-002](ADR-002-bucket-model.md) (convention de clé étrangère composite sur `accounts`), [ADR-012](ADR-012-assistant-virements.md) (l'assistant de virements cesse d'être un conseil sans mémoire), [ADR-035](ADR-035-vocabulaire-des-quatre-chiffres.md) (un cinquième nom, nommé)
- **Rend caducs** : [ADR-016](ADR-016-tracking-paiements-multi-sources.md) et [ADR-018](ADR-018-provisions-bidirectionnelles-audit-trail.md), tous deux `Proposed` et jamais implémentés — passés `Superseded` le 2026-08-05, en même temps que l'acceptation de celui-ci

> **Révision 2.** La v1 a été rejetée par `plan-reviewer` sur trois points de fond : D1
> reposait sur une prémisse de schéma fausse, l'invariant central de D5 était inécrivable,
> et deux ADR couvrant le même territoire n'étaient pas cités. Les corrections sont dans le
> texte ; la §Historique de révision en donne la liste.

---

## Contexte & problème

**Ankora ne sait pas ce qui s'est passé. Il sait ce qu'il fallait faire.**

Relevé le 5 août 2026 dans `supabase/migrations/` et `src/lib/` :

| Donnée                  | Stockage réel                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Revenu mensuel          | `workspaces.monthly_income` — **un scalaire**, sans date                           |
| Solde de chaque compte  | `accounts.balance` — **un scalaire saisi à la main**                               |
| `savings_balance`       | **colonne morte** : sélectionnée par `workspace-snapshot.ts`, consommée nulle part |
| Virements entre comptes | **aucune table**                                                                   |
| Mois budgétaire         | `workspaces.fiscal_month_start` — déclaré, typé, validé par Zod, **jamais lu**     |

`computeMonthlyTransferPlan()` (`src/lib/domain/transfer.ts:109-119`) produit un plan de
virements complet et correct, et retourne un objet nu. **Rien n'enregistre si ce plan a
été suivi.** L'écart entre le plan et la réalité n'existe nulle part, donc ne peut être ni
affiché, ni corrigé, ni appris.

Trois conséquences mesurées :

1. **Aucun graphique honnête n'est constructible sur les soldes ou les revenus.** Un
   graphique a besoin d'une série ; le schéma stocke des points.
2. **« Gains et pertes sur l'année » est impossible.** Le revenu est un nombre unique sans
   date : il n'y a rien à agréger par mois.
3. **Le modèle est faux pour un revenu variable.** `monthly_income` est une _prévision_.

Sur ce troisième point, l'état de l'art, daté et sourcé :

- YNAB budgète uniquement l'argent **déjà reçu**, et cette règle est présentée comme ce
  qui tient face aux revenus irréguliers —
  [robberger.com/ynab-vs-monarch](https://robberger.com/ynab-vs-monarch/) (consulté le
  2026-08-05).
- EveryDollar et Monarch partent d'un revenu mensuel _projeté_ ; les comparatifs 2026
  qualifient cette approche de risquée pour les revenus variables —
  [fincomparelab.com/comparisons/ynab-vs-monarch](https://www.fincomparelab.com/comparisons/ynab-vs-monarch/)
  et [ramseysolutions.com — Budgeting Apps Comparison 2026](https://www.ramseysolutions.com/budgeting/budgeting-apps-comparison)
  (consultés le 2026-08-05).
- La période budgétaire calée sur le cycle de paie plutôt que sur le mois civil est un
  motif établi (hebdomadaire, quinzaine, bimensuel, personnalisé) —
  [koody.com/budget-by-paycheck-app](https://koody.com/budget-by-paycheck-app) (consulté
  le 2026-08-05).

Ankora est aujourd'hui dans le camp du revenu projeté, et son unique utilisateur a un
revenu variable.

### Ce que le modèle manque le plus : l'arbitrage mensuel

Relevé auprès de @thierry le 5 août 2026, sur son fonctionnement réel :

> « Ce mois-ci j'ai envoyé 500 € sur Revolut et pas la somme totale que j'aurais pu.
> J'ai préféré épargner 301 € + 59 € envoyés sur le compte épargne que d'avoir 801 €
> de disponible. »

Le virement vers le compte de vie courante **n'est pas un paramètre. C'est la décision du
mois.** Ankora le modélise comme un réglage fixe (`vieCouranteMonthlyTransfer`),
c'est-à-dire comme la seule chose qui change à chaque fois.

Le mouvement inverse existe autant : _« s'il y a un souci sur le mois, je récupère un
montant pour finir le mois »_. Une reprise d'épargne non prévue, qui doit se tracer comme
le reste — sinon le solde affiché ment jusqu'à la prochaine saisie manuelle.

## Décision

Introduire un **journal des mouvements** : le flux devient une suite d'événements datés,
et non plus un état que l'on retape.

### D0 — Prérequis de schéma : `accounts` reçoit une clé de substitution

**Mesuré** : `create table public.accounts (…) primary key (workspace_id, kind)`
(`20260417000004_three_accounts_model.sql:20-27`). La table n'a **aucune colonne `id`**, et
aucune migration ultérieure n'en ajoute.

Conséquence : **dans ce schéma, l'identité d'un compte EST son rôle.** Il n'existe aucun
moyen de désigner un compte physique.

Décision : ajouter `accounts.id uuid primary key default uuid_generate_v4()`, conserver un
index `unique (workspace_id, kind)` le temps de la transition, et migrer les références.

Cela **renverse la convention posée par ADR-002** (`foreign key (workspace_id,
account_kind) references public.accounts(workspace_id, kind)`,
`ADR-002-bucket-model.md:185-189`). L'amendement est déclaré en en-tête, pas subi.

Deux ajouts liés, sans lesquels la flexibilité visée n'arrive jamais :

- `accounts` n'a **ni policy INSERT ni policy DELETE** (« the three accounts are invariants
  of the workspace »). Le mode « 1 ou 2 comptes » exige les deux.
- `commitments` n'a **aucun `paid_from`** : une échéance d'engagement est aujourd'hui
  inattribuable à un compte. La colonne est ajoutée ici.

**C'est la décision la plus lourde de cet ADR** : une migration de clé primaire sur une
table portant des données de production. Elle est isolée dans sa propre PR, avant tout le
reste, et se vérifie sur une base restaurée avant d'être appliquée.

### D1 — Un mouvement référence un compte physique, jamais un rôle

Une ligne porte : date, montant, `from_account_id`, `to_account_id` (l'un des deux nul
pour une entrée ou une sortie externe), nature, note libre.

**Pas de montant signé.** ADR-016 avait choisi un `amount` signé (négatif = sortie,
`ADR-016:83`) ; les deux conventions ne cohabitent pas. Source et destination portent le
sens : c'est plus verbeux et ça supprime une classe entière d'erreurs de signe.

Restent des rôles, assumés et documentés : `expenses.paid_from` et `charges.paid_from`
sont des `text` contraints à `principal | vie_courante | epargne`. Ils ne sont **pas**
migrés ici — ils désignent une intention de configuration, pas un événement. Leur
conversion en `account_id` est traitée par D3.

### D2 — Les rentrées deviennent des lignes datées, et `monthly_income` disparaît

Une rentrée est un mouvement entrant : date, montant, libellé, compte crédité, nature
(salaire, prime, remboursement…). Cela couvre sans cas particulier : salaire en deux fois,
paie le 15, prime annuelle, mois creux, revenu qui change en cours d'année.

`workspaces.monthly_income` est **supprimé**, pas réinterprété. La v1 proposait d'en faire
une « hypothèse de départ » : c'est précisément ce que cet ADR condamne par ailleurs — deux
sources de vérité pour un même nombre divergent toujours.

**La sémantique de `null` doit être remplacée, pas héritée.** Aujourd'hui, un
`monthly_income` nul pilote l'état `incomplet` du cockpit
(`src/lib/data/month-situation.ts:132-134`, THI-335) tandis qu'un autre appelant le
coerce en `0` (`app/page.tsx:75`). Après bascule :

> `statut = 'incomplet'` quand **aucune rentrée n'est enregistrée pour la période
> courante**. Ce n'est plus une valeur absente, c'est un journal vide — et le cockpit le
> dit avec ces mots.

Les 8 appelants de production (2 écritures, 6 lectures) et les 2 schémas Zod sont repris
dans la même PR que la suppression. L'onboarding demande une **première rentrée** au lieu
d'un revenu mensuel.

### D3 — Les paiements reçoivent une attribution de compte

**Mesuré** : `charge_payments` (`20260503000004:24-37`) et `commitment_payments`
(`20260719000001:55-68`) n'ont **aucune colonne de compte**. L'attribution ne peut
aujourd'hui être qu'héritée de `charges.paid_from`, un champ **mutable** : éditer une
charge réécrirait rétroactivement tous les soldes dérivés, en silence.

Décision : les deux tables reçoivent `paid_from_account_id`, renseigné à l'écriture,
**figé ensuite**. Un paiement enregistre le compte qui a payé au moment où il a payé.

Corollaire d'immuabilité amont : `charges.amount` et `charges.paid_from` restent
modifiables, mais leur modification ne touche **aucune** ligne de paiement déjà écrite.

`paid_amount` existe déjà dans les deux tables et n'est aujourd'hui lu qu'en booléen
(`PaymentLedger = Map<key, boolean>`, `workspace-snapshot.ts:329-335`). La dérivation le lit
comme un montant.

### D4 — Ce qui est versé se ventile, et la ventilation est contrôlée

Un versement vers l'épargne se décompose en **part de lissage** et **part d'épargne
libre**. Les deux parts doivent égaler le montant : l'écart est **refusé**, pas arrondi.

La raison n'est pas cosmétique : seule la part libre réduit ce qui reste à virer vers le
compte de vie courante, parce que le lissage est _déjà_ sorti du budget au poste de
provision. C'est l'erreur nº 4 du mode d'emploi de @thierry.

**Quel lissage Ankora propose-t-il ?** Deux candidats existent et ne valent pas la même
chose : `provisionsMensuellesLissees` (`assistant-virements.ts:76`, brut) et
`epargneTransferNet` (`transfer.ts:91`, **déjà net des factures du mois**). La valeur
pré-remplie est `max(epargneTransferNet, 0)` — c'est ce qui doit réellement partir vers
l'épargne ce mois-ci. L'utilisateur corrige.

### D5 — Deux plans comptables, nommés, qui ne s'additionnent jamais

La v1 posait « chaque euro n'est compté qu'une fois ». **C'est faux.** Le dépôt fait
tourner deux plans, et une facture de 150 € par trimestre existe légitimement dans les deux
sous deux valeurs :

| Plan                    | Valeur de la facture            | Où                                              |
| ----------------------- | ------------------------------- | ----------------------------------------------- |
| **Budgétaire (lissé)**  | 50 € **chaque mois**            | `situation-mois.ts:105-113` — `resteDisponible` |
| **Trésorerie (caisse)** | 150 € **le mois de l'échéance** | `transfer.ts:86-96` — soldes, mouvements réels  |

`src/lib/domain/cockpit/__tests__/pas-de-double-comptage.test.ts:118-135` verrouille déjà
le premier : pointer une facture payée ne doit **pas** bouger `ilTeReste`. Un solde dérivé,
lui, **doit** compter les 150 €.

**L'invariant est donc :** chaque euro apparaît une fois **par plan**, et les deux plans ne
s'additionnent jamais. Aucun écran, aucun total, aucun graphique ne mélange une valeur
lissée et une valeur de caisse — et tout chiffre affiché déclare auquel des deux il
appartient.

### D6 — Les soldes se dérivent ; ils ne se saisissent plus

`accounts.balance` cesse d'être une vérité saisie. Un compte porte un **solde d'ouverture
daté**, et son solde courant est ce solde plus les flux postérieurs — plan trésorerie
uniquement.

Sources de flux, exhaustives à ce jour : mouvements (D1), `expenses`, `charge_payments`,
`commitment_payments`. Toutes lues par **une seule** fonction de domaine pure, qui reçoit
des lignes et jamais un client Supabase (règle 1 de `CLAUDE.md`).

- **Une seule ligne d'ouverture par compte.** Une seconde fausse tout, silencieusement.
- **Une reprise d'épargne n'est pas un revenu.** ADR-018 l'avait déjà tranché
  (`ADR-018:298` — les entrées ne s'ajoutent pas aux revenus) ; cette règle est reprise,
  pas contredite. Un virement interne déplace de l'argent, il n'en crée pas.
- **Un solde périmé ne s'affiche pas comme courant.** Si aucun flux n'est enregistré depuis
  N jours, le cockpit affiche l'ancienneté au lieu du nombre. Un journal qu'on ne remplit
  pas est pire que pas de journal : il donne un solde faux avec l'autorité d'un solde
  calculé.

Six surfaces changent, dont une critique : `soldeEpargneActuel` alimente
`calculerSanteProvisions` et pilote **la couleur du héros du cockpit**
(`app/page.tsx:133-150`). Une dérivation fausse ne se voit pas comme un solde faux, elle se
voit comme un cockpit qui passe à l'orange.

`workspace_settings.savings_balance`, colonne morte, est supprimée au passage.

### D7 — Rien ne se supprime

Une ligne fausse se corrige ou se contre-passe. Aucune suppression physique. Règle 11 de
`CLAUDE.md` appliquée aux données.

**Dérogation art. 17 RGPD, explicite** : « rien ne se supprime » vaut pour la correction
d'une erreur de saisie, **jamais** contre un droit à l'effacement. La suppression de compte
efface les mouvements comme le reste, par cascade sur le workspace. La règle est une
discipline de tenue de livre, pas une politique de rétention.

### D8 — L'arbitrage du mois est une décision affichée, puis enregistrée

Le cockpit expose le montant disponible après charges et provisions, et laisse répartir
entre **garder pour vivre** et **épargner en plus**. Les deux montants somment au
disponible. C'est la décision du mois ; elle est enregistrée comme telle.

**Vocabulaire — amendement d'ADR-035.** Cet ADR interdit d'introduire un cinquième nom et
bannit « reste disponible ». Le montant réparti par l'arbitrage **est** le chiffre nº 2
d'ADR-035 (« Budget du mois ») : il en garde le nom, sans variante.

En revanche l'arbitrage introduit bien un nouveau chiffre, et il faut le nommer plutôt que
le laisser se confondre : `epargneEstimee` existe déjà comme **projection**
(`situation-mois.ts:120-125`). L'arbitrage produit une **épargne décidée**. Deux nombres,
deux noms, jamais le même mot.

**Limite FSMA** : le cockpit affiche un arbitrage et ses conséquences arithmétiques. Il ne
recommande aucun montant, ne qualifie aucun choix, ne projette aucun rendement.

### D9 — Contraintes transverses, non négociables

- **RLS** : `enable` + `force row level security` sur la table de mouvements, policies
  SELECT/INSERT/UPDATE portées par `workspace_id`. **Aucune policy DELETE** — D7 au niveau
  du schéma, pas seulement de l'UI.
- **Export art. 20** : la table entre dans `src/lib/gdpr/export.ts`. Cet export omet déjà
  `accounts`, `charge_payments`, `commitments` et `commitment_payments` — son propre test le
  constate (`export.test.ts:124-134`). Ajouter une table sans l'exporter élargirait une
  dette de conformité connue ; les quatre manquantes entrent avec elle.
- **Decimal jamais à travers une frontière RSC** : la dérivation calcule en `Decimal` et
  expose des `number` aux composants client, comme `app/page.tsx:136-144` le fait déjà.
- **Budget 0 €** : aucune dépendance nouvelle.

## Alternatives écartées

**Garder les soldes saisis et n'ajouter qu'un journal d'information.** Deux sources de
vérité pour un même nombre divergent toujours, et c'est le solde saisi qui gagnerait —
c'est lui qui s'affiche. Le journal deviendrait décoratif.

**Migrer dépenses, paiements et échéances dans une table de flux unique.** Séduisant,
écarté : migration lourde sur des tables vivantes pour un gain de forme. D6 obtient la même
garantie par une fonction unique. Reste ouvert.

**Garder la clé primaire composite et référencer `(workspace_id, kind)`.** C'est
l'alternative honnête à D0, et elle est rejetée : le journal référencerait alors un rôle,
D1 tomberait, et le mode « 1 ou 2 comptes » deviendrait impossible sans réécrire
l'historique déjà accumulé.

**Continuer à prévoir le revenu plutôt que l'enregistrer.** Écarté sur sources datées
(cf. §Contexte).

## Conséquences

**Positives.** Le plan devient vérifiable. Les graphiques deviennent honnêtes parce qu'il
existe une série. Les gains et pertes par mois et par an se calculent comme une différence
de flux — sans valorisation, donc sans zone grise réglementaire. Les revenus irréguliers
cessent d'être un cas particulier. La reprise d'épargne imprévue se trace.

**Négatives, assumées.** La saisie augmente : trois à quatre lignes par mois contre zéro.
C'est le prix d'un cockpit qui sait. À compenser par des gestes, pas par des formulaires —
un versement pré-rempli depuis le plan se valide en un geste et se corrige en un autre
(règle 11).

**Risque principal.** Une migration de clé primaire sur des données de production (D0). Il
est traité par l'isolement : sa propre PR, vérifiée sur une base restaurée, avant tout le
reste.

## Découpage d'exécution

Chaque étape est une PR autonome, dans cet ordre. Aucune ne dépasse le périmètre d'une
revue humaine raisonnable.

1. **D0** — clé de substitution `accounts.id`, policies INSERT/DELETE, `commitments.paid_from`.
2. **D3** — attribution de compte sur les deux tables de paiements + figeage.
3. **D1** — table de mouvements, RLS, export art. 20 (et rattrapage des 4 tables absentes).
4. **D2** — rentrées datées, suppression de `monthly_income`, nouvelle sémantique d'`incomplet`.
5. **D6** — dérivation des soldes, suppression de `savings_balance`, ancienneté affichée.
6. **D4 + D8** — ventilation contrôlée et arbitrage mensuel.

## Hors périmètre (ADR à venir)

- **Rôles de comptes découplés** du nombre de comptes physiques. D0 le rend possible ; la
  refonte de la page comptes se décide seule.
- **Provisions libres** — voiture, chaudière, dentiste : montant _et_ date incertains. Ni
  charge, ni dépense, ni engagement. Probablement à généraliser en une obligation unique
  portant deux niveaux de précision (montant connu ou estimé × date connue ou estimée)
  plutôt qu'en une énième catégorie.
- **Valorisation d'un patrimoine** (épargne-pension, placements). Le flux d'abord ; la
  valorisation frôle la frontière FSMA et se décide seule.

## Vérification

Cet ADR est une décision, pas un plan. Son exécution devra prouver, au minimum :

1. Qu'un solde dérivé égale le solde attendu sur un jeu de mouvements connu, et qu'il
   **change** quand une ligne est corrigée ou contre-passée.
2. Que la règle des deux plans tient : pointer une facture payée ne bouge pas le chiffre
   budgétaire (le test existant reste vert) **et** bouge le solde de caisse du compte payeur.
3. Qu'un versement dont les deux parts ne somment pas au montant est **refusé**.
4. Qu'un compte sans flux depuis N jours affiche son ancienneté au lieu d'un solde présenté
   comme courant.
5. Qu'un membre d'un workspace ne voit **aucun** mouvement d'un autre workspace, et
   qu'aucun rôle ne peut effacer une ligne (RLS, les deux sens).
6. Que l'export art. 20 contient les mouvements **et** les quatre tables aujourd'hui
   absentes.
7. Qu'éditer une charge après paiement ne modifie **aucun** solde historique.

## Historique de révision

**v1 → v2**, après verdict `🔴 REJECTED` de `plan-reviewer` :

| Correction                                                                     | Origine                  |
| ------------------------------------------------------------------------------ | ------------------------ |
| `savings_balance` requalifié : colonne morte, pas source concurrente           | constat v1 faux          |
| D0 créé — la table `accounts` n'a pas de clé de substitution                   | prémisse v1 fausse       |
| Amendement d'ADR-002 déclaré                                                   | conflit non vu           |
| D5 — « chaque euro une fois » remplacé par la règle des deux plans             | invariant v1 faux        |
| D3 créé — sans attribution de compte, la dérivation est inécrivable            | trou bloquant            |
| D2 — suppression franche de `monthly_income` + sémantique d'`incomplet`        | double source résiduelle |
| ADR-016 et ADR-018 cités et proposés `Superseded`                              | ADR non recherchés       |
| Convention de signe tranchée contre ADR-016                                    | conflit non vu           |
| D7 — dérogation art. 17 écrite                                                 | absent                   |
| D9 créé — RLS, export art. 20, Decimal/RSC                                     | absent                   |
| D8 réconcilié avec ADR-035 ; « épargne décidée » distinguée d'`epargneEstimee` | conflit de vocabulaire   |
| Sources YNAB / Monarch / Koody datées et liées                                 | affirmation non sourcée  |
| Découpage d'exécution en 6 PR ordonnées                                        | absent                   |
