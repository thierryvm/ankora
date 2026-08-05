# ADR-038 — Le journal des mouvements

- **Statut** : Proposed
- **Date** : 2026-08-05
- **Proposé par** : @cc-ankora (relevé factuel du schéma et du domaine, confrontation au modèle Coda de @thierry)
- **Deciders** : @thierry, @cc-ankora
- **Tags** : `domain`, `schema`, `produit`, `cockpit`, `fondation`
- **Amende** : [ADR-012](ADR-012-assistant-virements.md) (l'assistant de virements cesse d'être un conseil sans mémoire)

---

## Contexte & problème

**Ankora ne sait pas ce qui s'est passé. Il sait ce qu'il fallait faire.**

Relevé le 5 août 2026 dans `supabase/migrations/` et `src/lib/domain/` :

| Donnée                  | Stockage réel                                            |
| ----------------------- | -------------------------------------------------------- |
| Revenu mensuel          | `workspaces.monthly_income` — **un scalaire**            |
| Solde de chaque compte  | `accounts.balance` — **un scalaire saisi à la main**     |
| Solde d'épargne         | `workspace_settings.savings_balance` — **un deuxième**   |
| Virements entre comptes | **aucune table**                                         |
| Mois budgétaire         | `workspaces.fiscal_month_start` — **déclaré, jamais lu** |

`computeMonthlyTransferPlan()` (`src/lib/domain/transfer.ts`) produit un plan de virements
complet et correct. **Rien n'enregistre si ce plan a été suivi.** L'écart entre le plan et
la réalité n'existe nulle part, donc ne peut pas être affiché, ni corrigé, ni appris.

Trois conséquences mesurées, pas supposées :

1. **Aucun graphique honnête n'est constructible sur les soldes ou les revenus.** Un
   graphique a besoin d'une série ; le schéma stocke des points. Habiller ce modèle de
   courbes produirait une décoration, pas une information.
2. **« Gains et pertes sur l'année » est impossible.** Le revenu est un nombre unique sans
   date. Il n'y a rien à agréger par mois.
3. **Le modèle est faux pour un revenu variable.** `monthly_income` est une _prévision_.
   Les comparatifs 2026 des outils de budget rangent cette approche (EveryDollar, Monarch)
   parmi les approches risquées pour les revenus irréguliers, par opposition à la règle
   fondatrice de YNAB : ne budgéter que l'argent **réellement reçu**. L'unique utilisateur
   d'Ankora a un revenu variable.

### Ce que le modèle manque le plus : l'arbitrage mensuel

Relevé auprès de @thierry le 5 août 2026, sur son fonctionnement réel :

> « Ce mois-ci j'ai envoyé 500 € sur Revolut et pas la somme totale que j'aurais pu.
> J'ai préféré épargner 301 € + 59 € envoyés sur le compte épargne que d'avoir 801 €
> de disponible. »

Le virement vers le compte de vie courante **n'est pas un paramètre. C'est la décision du
mois.** Ankora le modélise aujourd'hui comme un réglage fixe
(`vieCouranteMonthlyTransfer`), c'est-à-dire comme la seule chose qui, en pratique, change
tous les mois.

Et le mouvement inverse existe tout autant : _« s'il y a un souci sur le mois, je récupère
un montant pour finir le mois »_. Une reprise d'épargne non prévue, qui doit se tracer
comme le reste — sinon le solde affiché ment jusqu'à la prochaine saisie manuelle.

## Décision

Introduire un **journal des mouvements** : le flux devient une suite d'événements datés,
et non plus un état que l'on retape.

### D1 — Un mouvement référence des comptes physiques, jamais un rôle

Une ligne de mouvement porte : date, montant, compte source, compte destination
(l'un des deux peut être absent pour une entrée ou une sortie externe), nature, et une
note libre.

**Référencer le compte physique, et non son `kind`, est la décision structurante de cet
ADR.** C'est elle qui rendra possible le découplage rôle/compte (2 comptes, 1 compte —
ADR à venir) sans réécrire l'historique : un journal qui dirait « vers l'épargne » se
casserait le jour où l'épargne et le principal sont le même compte.

### D2 — Les rentrées deviennent des lignes datées

`workspaces.monthly_income` cesse d'être la source de vérité du revenu. Une rentrée est un
mouvement entrant : date, montant, libellé, compte crédité.

Cela couvre sans cas particulier : salaire en deux fois, paie le 15, prime annuelle, mois
creux, revenu qui change en cours d'année.

Le libellé porte la nature de la rentrée (salaire, prime, remboursement, vente…) pour que
le cockpit puisse distinguer le récurrent de l'exceptionnel — une prime annuelle ne doit
pas gonfler la base de calcul du mois suivant.

`monthly_income` reste, mais change de sens : il devient une **hypothèse de départ**
utilisée tant qu'aucune rentrée n'est enregistrée, et son nom doit le dire.

### D3 — Ce qui est versé se ventile, et la ventilation est contrôlée

Un versement vers l'épargne se décompose en **part de lissage** (le poste de provision
dû) et **part d'épargne libre**. Les deux parts doivent égaler le montant ; l'écart est
affiché, jamais toléré en silence.

La raison n'est pas cosmétique : seule la part libre réduit ce qui reste à virer vers le
compte de vie courante, parce que le lissage est **déjà** sorti du budget au poste de
provision. Confondre les deux fausse le reste à vivre — c'est l'erreur nº 4 du mode
d'emploi de @thierry, et elle est facile à commettre.

Ankora connaît déjà le lissage dû du mois : **il propose la ventilation, l'utilisateur la
corrige.** On ne demande pas de calculer ce que la machine sait.

### D4 — Rien ne se supprime

Une ligne fausse se corrige ou se contre-passe. Aucune suppression physique.

C'est la règle 11 de `CLAUDE.md` appliquée aux données, et c'est ce qui rend l'historique
auditable : un solde qui a bougé doit pouvoir s'expliquer par les lignes qui l'ont fait
bouger, y compris les erreurs et leurs corrections.

### D5 — Les soldes se dérivent ; ils ne se saisissent plus

`accounts.balance` cesse d'être une vérité saisie. Un compte porte un **solde d'ouverture
daté**, et son solde courant est la somme de ce solde et des flux postérieurs.

Deux exigences non négociables qui accompagnent cette décision :

- **Une seule ligne d'ouverture par compte.** Une seconde fausse tout, silencieusement.
- **Aucun double comptage.** Les paiements de charges, les échéances d'engagement et les
  dépenses de vie courante sont déjà des flux datés dans leurs propres tables. La
  dérivation du solde lit **une seule** fonction de domaine, qui connaît toutes les
  sources et garantit que chaque euro n'est compté qu'une fois. Une somme partielle en
  amont d'un widget de solde est un mensonge — le dépôt en a déjà fait l'expérience.

L'unification physique de ces tables en une seule n'est **pas** décidée ici : elle serait
une migration lourde pour un gain de forme. Elle reste ouverte.

### D6 — L'arbitrage du mois est une décision affichée, puis enregistrée

Le cockpit expose le montant réellement disponible après charges et provisions, et laisse
répartir entre **garder pour vivre** et **épargner en plus**. Les deux montants somment au
disponible.

C'est la décision du mois ; elle est enregistrée comme telle, et le mois suivant peut
donc dire ce qui avait été décidé, pas seulement ce qui aurait dû l'être.

**Limite FSMA explicite** : le cockpit affiche un arbitrage et ses conséquences
arithmétiques. Il ne recommande pas un montant, ne qualifie pas un choix de bon ou de
mauvais, et ne projette aucun rendement.

## Alternatives écartées

**Garder les soldes saisis et n'ajouter qu'un journal d'information.** Écarté : deux
sources de vérité pour un même nombre divergent toujours, et c'est le solde saisi qui
gagnerait, puisque c'est lui qui s'affiche. Le journal deviendrait décoratif — exactement
le défaut que cet ADR corrige.

**Dériver les soldes depuis une table unique de flux, en y migrant dépenses, paiements de
charges et échéances.** Séduisant sur le papier, écarté pour l'instant : migration lourde
sur des tables vivantes, pour un gain de cohérence de forme. La dérivation par une
fonction unique donne la même garantie sans la migration.

**Continuer à prévoir le revenu plutôt que l'enregistrer.** Écarté sur données : c'est
l'approche que les comparatifs 2026 signalent comme risquée pour les revenus variables, et
l'unique utilisateur est dans ce cas.

## Conséquences

**Positives.** Le plan devient vérifiable. Les graphiques deviennent honnêtes parce qu'il
existe enfin une série. Les gains et pertes par mois et par an se calculent comme une
différence de flux, sans valorisation et donc sans zone grise réglementaire. Les revenus
irréguliers cessent d'être un cas particulier. La reprise d'épargne imprévue se trace.

**Négatives, et assumées.** La saisie augmente : trois à quatre lignes par mois, contre
zéro aujourd'hui. C'est le prix d'un cockpit qui sait. À compenser par des gestes rapides,
pas par des formulaires — un versement pré-rempli à partir du plan doit se valider en un
geste et se corriger en un autre.

**Risque principal.** Un journal qu'on ne remplit pas est pire que pas de journal : il
donne un solde faux avec l'autorité d'un solde calculé. Le cockpit doit donc afficher
**depuis quand** il n'a rien reçu, et se taire sur les soldes plutôt que d'afficher un
chiffre périmé.

## Hors périmètre (ADR à venir)

- **Rôles de comptes découplés** du nombre de comptes physiques (1, 2 ou 3 comptes).
  Dépend de D1, décidé séparément.
- **Provisions libres** — voiture, chaudière, dentiste : montant _et_ date incertains.
  Ni charge, ni dépense, ni engagement. Probablement à généraliser en une obligation unique
  portant deux niveaux de précision (montant connu ou estimé × date connue ou estimée)
  plutôt qu'en une énième catégorie.
- **Valorisation d'un patrimoine** (épargne-pension, placements). Le flux d'abord ; la
  valorisation touche à la frontière FSMA et se décide seule.

## Vérification

Cet ADR est une décision, pas un plan. Son exécution devra prouver, au minimum :

1. Qu'un solde dérivé égale le solde attendu sur un jeu de mouvements connu — et qu'il
   **change** quand une ligne est corrigée ou contre-passée.
2. Qu'aucun euro n'est compté deux fois quand une dépense, un paiement de charge et un
   mouvement coexistent sur le même mois.
3. Qu'un versement dont les deux parts ne somment pas au montant est **refusé**, pas
   arrondi.
4. Qu'un compte sans mouvement depuis N jours affiche son ancienneté au lieu d'un solde
   présenté comme courant.
