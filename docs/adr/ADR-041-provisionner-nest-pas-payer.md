# ADR-041 — Provisionner n'est pas payer

- **Statut** : Accepted
- **Date** : 2026-08-10
- **Accepté le** : 2026-08-10 par @thierry, sur délégation explicite — _« je t'ai dit que tu as carte blanche donc merge »_, en réponse au récapitulatif de F1 à F5 et au point de friction signalé (F3). L'arbitrage de fond est donc **délégué**, pas silencieux : il porte sur les cinq décisions telles qu'elles sont écrites ici.
- **Proposé par** : @cc-ankora, sur question de @thierry — recherche réglementaire et bancaire datée du 2026-08-10
- **Deciders** : @thierry (délégation), @cc-ankora
- **Tags** : `domain`, `schema`, `produit`, `fondation`, `belgium`
- **Amende** : [ADR-038](ADR-038-journal-des-mouvements.md) (D1, D3, D6) et [ADR-008](ADR-008-account-naming-and-typing.md)
- **Tranche** : [#366](https://github.com/thierryvm/ankora/issues/366)
- **À lire avant** : J2 (D1 — la table de mouvements)

---

## Contexte & problème

J1 a figé, le 10 août 2026, une attribution de compte sur chaque paiement
(`paid_from_account_type`, ADR-038 D3). La valeur est dérivée de `charges.paid_from`.

**Les deux colonnes ne disent pas la même chose, et personne ne l'avait écrit.**
`charges.paid_from` a été saisi avec le sens « l'enveloppe qui met cet argent de côté ».
`paid_from_account_type` a été nommé, et sera lu en J4, avec le sens « le compte qui a
sorti l'argent ». Tant qu'aucun écran ne lit la colonne, l'écart est théorique. À partir de
D6, il produit **deux soldes faux en sens inverse pendant que le total reste juste** — la
classe d'erreur la plus difficile à repérer, et celle que
[`account-type.ts`](../../src/lib/domain/accounts/account-type.ts) prend déjà la peine de
nommer dans sa JSDoc.

Le geste réel décrit par @thierry le 10 août : _« je ne paie rien depuis le compte épargne
directement, je reverse la somme prévue sur mon compte principal et ensuite, je fais le
paiement. »_ Deux mouvements, un seul enregistré.

**La question ouverte n'était pas là.** Elle était : cette contrainte est-elle une
particularité d'un établissement, ou une règle générale ? Si c'est une particularité,
la coder revient à casser le produit pour tous les autres.

## Les faits, relevés le 2026-08-10

| Dispositif                                             | L'épargne peut-elle payer directement ? | Fondement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Belgique — épargne réglementée**, tout établissement | **Non**                                 | AR du 27/08/1993 (AR/CIR 92), art. 2 : un prélèvement ne peut servir qu'à un remboursement en espèces, un virement ou paiement vers **un compte au nom du titulaire**, un virement vers l'épargne réglementée d'un conjoint ou parent au 2ᵉ degré dans le même établissement, le remboursement d'un crédit du même établissement, ou le règlement de primes, titres et frais de coffre à l'établissement. **Ni domiciliation, ni ordre permanent au départ, ni carte, ni virement vers un tiers.** |
| **Belgique — latitude d'exposition**                   | Variable                                | La loi autorise le virement vers **tout** compte au nom du titulaire, y compris dans une autre banque. Les établissements n'exposent pas tous la même latitude : certains n'offrent que le virement vers le compte à vue maison.                                                                                                                                                                                                                                                                   |
| **France — Livret A / LDDS**                           | **Non**                                 | Aucune carte rattachable, aucun prélèvement automatique, aucune domiciliation de facture ou de crédit. Alimentation et retrait par virement depuis ou vers un compte courant.                                                                                                                                                                                                                                                                                                                      |
| **Allemagne — Tagesgeldkonto**                         | **Non**                                 | `Referenzkonto` obligatoire à l'ouverture ; le retrait ne peut aller **que** vers ce compte. Pas de `Lastschrift`, pas de carte, pas de virement vers un tiers.                                                                                                                                                                                                                                                                                                                                    |
| **Revolut — Instant Access Savings**                   | **Non**                                 | Conditions FR, verbatim : _« your Instant Access Savings is not a payment account »_. Le retrait va au compte personnel Revolut.                                                                                                                                                                                                                                                                                                                                                                   |
| **bunq — Savings Account**                             | **Non**                                 | _« You can't make regular day-to-day payments with your Savings Account »_.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **bunq — Money Pockets**                               | **Oui**                                 | Jusqu'à 25 poches, **chacune son IBAN** : virements reçus, domiciliations, carte rattachable à la poche de son choix.                                                                                                                                                                                                                                                                                                                                                                              |
| **N26 — Spaces avec IBAN**                             | **Oui**                                 | Domiciliations sur le sous-compte, virements SEPA reçus, **carte liée à un Space**. Disponible **en Belgique**, sur les plans payants, 10 IBAN maximum.                                                                                                                                                                                                                                                                                                                                            |
| **Monzo — Bills Pots**                                 | **Oui en apparence, non en mécanique**  | La domiciliation est présentée comme payée depuis la poche. Ce que fait Monzo : _« moves enough money from your Pot into your main account and then pays it for you »_.                                                                                                                                                                                                                                                                                                                            |

### Ce que ces faits disent, et que je croyais autrement il y a une heure

**1. La contrainte n'est pas bancaire, elle est réglementaire — et c'est la norme
européenne.** Trois pays, trois régimes fiscaux sans rapport, même conclusion : un compte
d'épargne fiscalement avantagé **n'est pas un compte de paiement**. Ce n'est pas un défaut
d'un établissement, c'est la contrepartie de l'avantage. Le supposer réparable par un
changement de banque était faux.

**2. Elle n'est pourtant pas universelle, et le contre-exemple est disponible ici.** N26 et
bunq exposent des sous-comptes qui domicilient et portent une carte. Coder « l'épargne ne
paie pas » exclurait ces utilisateurs — **en Belgique**, pas dans un pays hypothétique. La
capacité dépend en plus du **plan tarifaire**, pas seulement de l'établissement.

**3. Le cas le plus instructif est Monzo, parce que c'est déjà le nôtre.** Monzo affiche un
geste et exécute deux mouvements : sortie de la poche vers le compte principal, puis
paiement. C'est exactement le geste décrit par @thierry, automatisé par la banque au lieu
d'être fait à la main.

> **Le modèle à deux mouvements n'est pas le cas particulier belge. C'est le cas général,
> dont « payer directement » est l'effondrement — le cas où les deux comptes se trouvent
> être le même.**

Un modèle qui part du cas général et laisse les deux legs coïncider couvre les deux mondes
avec une seule donnée. Un modèle qui part du cas dégénéré doit inventer une exception pour
la moitié de l'Europe.

## Décision

### F1 — `paid_from` désigne l'enveloppe. Le paiement porte le compte payeur. Les deux peuvent être égaux.

- `charges.paid_from` et `commitments.paid_from` désignent le compte qui **provisionne**.
  C'est le sens dans lequel ils ont été saisis ; il est confirmé, pas réinterprété.
- `charge_payments.paid_from_account_type` et `commitment_payments.paid_from_account_type`
  (J1) désignent le compte qui **a payé**, figé à l'écriture. Leur nom est déjà juste.
- **Rien n'impose que les deux diffèrent.** Sur un compte qui règle directement — N26 Space,
  poche bunq, ou simplement le compte principal — ils sont égaux, et le modèle n'a aucun cas
  particulier à traiter.

Le renommage `paid_from` → `provisioned_from` est décidé ici et **exécuté en J2**. Laisser
une colonne dont le nom affirme le contraire de son sens est précisément le piège que ce
dépôt documente ailleurs.

### F2 — La capacité de régler est une propriété du compte, déclarée par l'utilisateur

`accounts` reçoit deux colonnes :

- `settles_directly boolean not null` — ce compte peut-il régler une sortie vers
  l'extérieur ?
- un **compte de règlement** — sinon, par quel compte l'argent transite. Le droit bancaire
  allemand a déjà un mot pour cette relation : `Referenzkonto`.

Défauts par rôle, **modifiables** : `principal` et `vie_courante` règlent directement ;
`epargne` ne règle pas et pointe vers `principal`.

**Désignation du compte de règlement** : tant que D0 (J6) n'a pas donné de clé de
substitution à `accounts`, la référence se fait par `(workspace_id, account_type)`, exactement
le motif de clé composite employé par J1. Elle devient un `uuid` après D0. Ce n'est pas une
dette : c'est la même contrainte, exprimée avec la clé qui existe au moment où on l'écrit.

Contrainte de base, pas de règle d'affichage : `settles_directly = false` **exige** un compte
de règlement non nul et différent de lui-même. Un compte qui ne peut ni payer ni transiter
nulle part est un cul-de-sac où de l'argent disparaît.

### F3 — Un geste, un ou deux mouvements, et la décomposition reste visible

Cocher « payé » sur une facture provisionnée par un compte qui **ne règle pas directement**
écrit **deux** mouvements : le virement enveloppe → compte de règlement, puis le paiement
compte de règlement → extérieur. Même date, même geste, même annulation.

- **Règle 10 de `CLAUDE.md`** : la ligne dit « payé depuis _<compte de règlement>_,
  provisionné par _<enveloppe>_ » et s'ouvre sur les deux mouvements. Un utilisateur qui voit
  son épargne baisser doit trouver pourquoi au même endroit.
- **Règle 11** : décocher défait **les deux ensemble, ou aucun**. Une annulation partielle
  laisserait de l'argent dans un compte où il n'a jamais séjourné, et le total resterait juste
  — encore la même classe d'erreur.

### F4 — Aucune base de données de banques. Jamais.

Trois raisons, et la troisième est celle qui tranche :

1. **Elle serait fausse en un mois.** N26 a ajouté les IBAN de Spaces ; les établissements
   belges n'exposent pas tous la même latitude légale ; la capacité dépend du plan tarifaire.
   Une table de 200 banques est une dette de maintenance qui ment sans prévenir.
2. **Elle obligerait à demander la banque de l'utilisateur** — une donnée personnelle dont le
   produit n'a par ailleurs **aucun** usage. Minimisation, art. 5(1)(c) RGPD : on ne collecte
   pas ce qu'une case à cocher donne gratuitement.
3. **Elle répond à la mauvaise question.** La question n'est pas « quelle banque ? » mais
   « ce compte-ci peut-il payer ? ». L'utilisateur le sait ; nous ne le saurions qu'approximativement.

### F5 — Rien de tout ceci ne s'approche du conseil

Ankora enregistre ce que l'utilisateur déclare et exécute l'arithmétique qui en découle. Il
n'indique pas quel compte utiliser, ne qualifie aucun arbitrage, ne compare pas deux comptes.
La case « ce compte peut régler directement » est une **description d'un fait bancaire**, pas
une recommandation.

## Alternatives écartées

**A. Un seul compte par paiement, et `paid_from` devient le compte payeur.** C'est le statu
quo lu littéralement. Écarté : il perd l'enveloppe. Le produit est bâti sur des enveloppes
(ADR-002) ; savoir que tout est payé depuis le compte principal est vrai et sans intérêt.
**On perdrait l'information qui a de la valeur pour garder celle qui n'en a pas.**

**B. Deux legs, mais saisis à la main — « gérer chaque transaction dans tous les sens ».**
La direction est retenue ; la forme ne l'est pas. Sans PSD2 (ADR-001), **toute** saisie est
manuelle : un modèle qui réclame deux gestes là où la vie en demande un ne produit pas des
soldes plus précis, il produit des soldes faux, parce que l'oubli devient la règle. ADR-038
l'écrit déjà : _« à compenser par des gestes, pas par des formulaires »_. L'écran de
mouvements existe — pour corriger, contre-passer et traiter les cas hors norme. Jamais comme
chemin nominal.

**C. Déduire la capacité du rôle du compte, en dur.** Écarté par N26 et bunq : un compte
d'épargne qui paie existe, il est disponible en Belgique, et le coder en dur le rendrait
insaisissable — sans message d'erreur, juste une case absente.

**D. Ne rien décider avant J4.** Écarté : J1 a déjà figé une attribution sur des lignes de
production, et J2 écrit la table dont D6 dérivera les soldes. Chaque lot posé sur la
sémantique ambiguë rend la correction plus chère, et J4 est le premier lot où l'erreur
devient visible — c'est-à-dire trop tard.

## Conséquences

**Positives.** #366 est tranché sans avoir à connaître une seule banque. Les cas belge,
français, allemand, Revolut, bunq, N26 et Monzo sont couverts par la même donnée. Le geste
de l'utilisateur ne change pas : une case à cocher reste une case à cocher.

**Négatives, assumées.** `accounts` gagne deux colonnes et une contrainte. La page comptes
gagne un réglage, alors qu'elle n'en porte aucun aujourd'hui.

**Une dette créée par J1, nommée ici plutôt que découverte en J4.** Le backfill de J1 a posé
`paid_from_account_type` égal au compte de **provisionnement**. Pour toute facture provisionnée
par un compte qui ne règle pas directement, cette valeur désigne donc, sous F1, le mauvais
compte. **Rien ne la lit aujourd'hui.** J2 doit ré-attribuer ces lignes en s'appuyant sur F2 —
c'est du travail identifié, borné, et il est écrit ici pour qu'il ne se paie pas au prix d'un
cockpit qui passe à l'orange sans raison.

**Sans effet sur J1b.** La migration `contract` n'assure que la non-nullité de la colonne. Elle
reste exécutable telle quelle, avant ou après cette décision.

## Découpage d'exécution

**Aucune PR dédiée.** F2 (colonnes, contrainte, défauts), le renommage `paid_from` →
`provisioned_from`, la ré-attribution des lignes historiques et l'écriture à deux mouvements
(F3) entrent dans **J2**, dont c'est exactement le territoire — la table de mouvements est
l'endroit où ces deux legs deviennent représentables.

Conséquence sur le plan J2 : il grossit. S'il devait dépasser ce qu'une revue humaine tient
d'une traite, le point de coupe est F2 seul (schéma + réglage + ré-attribution) d'un côté,
l'écriture à deux mouvements de l'autre — dans cet ordre, jamais l'inverse.

## Vérification

Cet ADR est une décision, pas un plan. Son exécution devra prouver, au minimum :

1. Qu'un compte `settles_directly = false` sans compte de règlement est **refusé par la base**,
   pas corrigé au vol.
2. Qu'un compte dont le compte de règlement est lui-même est refusé.
3. Que cocher une facture provisionnée par un compte non réglant écrit **deux** mouvements, et
   que décocher les retire **tous les deux**.
4. Que cocher une facture provisionnée par un compte réglant écrit **un seul** mouvement.
5. Qu'après ré-attribution, **aucune** ligne de paiement ne désigne un compte dont
   `settles_directly` est faux.
6. Qu'un virement interne laisse le patrimoine total inchangé — il déplace de l'argent, il n'en
   crée pas (ADR-038 D6).

## Sources

Consultées le 2026-08-10. Le niveau de vérification est indiqué parce qu'il n'est pas uniforme.

| Source                                                                                                                                                                                                                   | Niveau                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| [AR du 27/08/1993 portant exécution du CIR 92 — ejustice](https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=1993082749&table_name=loi)                                                          | texte légal, art. 2                         |
| [BNP Paribas Fortis — règlement comptes d'épargne réglementés](https://www.bnpparibasfortis.com/docs/default-source/newsroom-documents/savings-accounts-july2023/k03853f.pdf)                                            | reprise de l'art. 2 par un établissement    |
| [Wikifin (FSMA) — domiciliation et ordre permanent](https://www.wikifin.be/fr/budget-payer-emprunter-et-assurer/cartes-de-paiement/autres-moyens-de-paiement/paiements)                                                  | autorité publique belge                     |
| [Revolut — Instant Access Savings, conditions FR](https://www.revolut.com/en-FR/legal/savings-account/)                                                                                                                  | conditions contractuelles, verbatim relevé  |
| [N26 — IBAN pour les Spaces (support EU)](https://support.n26.com/en-eu/app-and-features/spaces/what-are-ibans-for-spaces-subaccounts)                                                                                   | documentation produit                       |
| [N26 — communiqué IBAN pour sous-comptes](https://n26.com/en-de/press/press-release/n26-introduces-individual-ibans-for-its-spaces-sub-accounts-empowering-customers-to-easily-manage-bills-rent-subscriptions-and-more) | communiqué, liste des pays dont la Belgique |
| [bunq — comptes multiples et IBAN par poche](https://www.bunq.com/personal-account/banking-features/bank-accounts)                                                                                                       | documentation produit                       |
| [bunq — domiciliations](https://help.bunq.com/articles/how-can-i-pay-direct-debits-with-bunq)                                                                                                                            | documentation produit                       |
| [Monzo — payer ses factures depuis une poche](https://monzo.com/help/monzo-plus/web-bill-pots)                                                                                                                           | documentation produit, mécanique verbatim   |
| [economie.gouv.fr — LDDS](https://www.economie.gouv.fr/particuliers/gerer-mon-argent/gerer-mon-budget-et-mon-epargne/livret-de-developpement-durable-et-solidaire-ldds-comment-ca-marche)                                | autorité publique française                 |
| [Les clés de la banque (FBF) — LDDS](https://www.lesclesdelabanque.com/particulier/ldds-livret-developpement-durable-solidaire/)                                                                                         | fédération bancaire française               |
| [CHECK24 — Referenzkonto](https://www.check24.de/tagesgeld/lexikon/referenzkonto/) · [tagesgeldvergleich.net](https://www.tagesgeldvergleich.net/tagesgeld-lexikon/referenzkonto.html)                                   | comparateurs, deux sources concordantes     |

**Deux réserves de méthode, dites parce qu'elles changent ce qu'un lecteur croirait.** La
page d'aide de l'établissement qui motive la question initiale n'a **pas** pu être extraite
(la page rendue ne contenait que ses en-têtes) : la ligne « latitude d'exposition variable »
repose sur le texte légal et sur un titre d'article de presse spécialisée annonçant qu'un
établissement belge autorise le virement direct depuis l'épargne vers une autre banque —
**titre relevé, article non lu**, mur de consentement. Cette ligne n'est donc pas au même
niveau de preuve que les autres, et aucune décision de cet ADR n'en dépend : F2 rend la
question sans objet, puisque la capacité est déclarée et non déduite.
