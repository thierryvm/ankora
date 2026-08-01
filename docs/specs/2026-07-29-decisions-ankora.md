# Décisions produit — Ankora

**Date** : 29 juillet 2026
**Suite de** : `AUDIT-ANKORA.md` (29/07/2026)
**Base vérifiée** : `github.com/thierryvm/ankora` @ `36680f7` (re-cloné et relu) · `gestion-budget.html` (1 386 lignes, relu intégralement) · veille en ligne datée de juillet 2026.

> **Convention.** **[V]** = vérifié en lisant le fichier, en exécutant une commande, ou en consultant la source citée. **[H]** = hypothèse ou estimation de ma part.

> **Avertissement.** Je suis en désaccord avec l'audit sur **trois points** (Q2, Q1 et Q8) et avec toi sur **quatre** (Q1, Q2, Q4, Q5). Chaque écart est signalé par un bloc **⚠️ Écart**. Tu as demandé deux fois à être challengé ; c'est ici.

---

## 0. Résumé exécutif — les décisions en une page

| #   | Question              | Ta réponse                        | **Décision retenue**                                                                                                 |     Écart     |
| --- | --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | :-----------: |
| Q1  | Vocabulaire           | Adopter la proposition de l'audit | **Rejetée.** Nouveau jeu de 4 mots. « Reste à vivre » **et** « Reste du mois » retirés de l'UI.                      |      ⚠️       |
| Q2  | Chiffre-héros         | Ne tranche pas                    | **Temps réel.** Le grand chiffre descend quand tu dépenses. Le prévisionnel devient une ligne d'ancrage sous lui.    | ⚠️ (vs audit) |
| Q3  | Défaut 500 €          | Supprimer                         | **Supprimer — et supprimer le concept d'enveloppe entièrement.**                                                     |       —       |
| Q4  | Fréquence 9 mois      | Vouloir 1/3/6/9/12                | **Non à 9 mois.** Oui à 1/2/3/4/6/12 pour **0,5 j** au lieu de 4 j.                                                  |      ⚠️       |
| Q5  | Amortissement crédits | Penche 2 + 3                      | **3 maintenant (0,5 j)** + un calculateur _optionnel et non branché_ (1,5 j). Le 2 « intégré au modèle » est refusé. |      ⚠️       |
| Q6  | 5 112 lignes d'atoms  | Tu me laisses décider             | **Supprimer** — après avoir récolté la spec de test de `Drawer.tsx`.                                                 |       —       |
| Q7  | Bouton ⊕ central      | Oui                               | **Oui**, avec une réserve sur le pattern et une spec visuelle pour qu'il ne fasse pas « Android ».                   |       —       |
| Q8  | Ordre de bataille     | Suivre le plan                    | **Réordonné.** Le premier jalon perceptible passe de J+15 à **J+8**. Total 24 j au lieu de 29.                       |      ⚠️       |

---

## 1. Les 8 décisions

### Q1 — Vocabulaire : je rejette la proposition que tu as acceptée

**Ta réponse** : choix 1, adopter la nomenclature de l'audit (« Reste du mois » / « Budget vie courante » / « Disponible aujourd'hui » / « Capacité d'épargne »).

**⚠️ Écart — je la rejette, et l'audit avait tort de la proposer.**

Trois défauts, du plus grave au plus léger :

**1. « Reste du mois » est ambigu en français, et l'ambiguïté est temporelle.** En français, « le reste du mois » signifie d'abord _la période qui reste à courir_, pas _l'argent qui reste_. « Il te reste 1 247 € pour le reste du mois » est une phrase que personne n'écrit. On corrige un mot qui désigne quatre nombres en le remplaçant par un mot qui désigne deux choses différentes. C'est un pas de côté, pas un progrès.

**2. « Disponible aujourd'hui » sera faux dès la décision Q2.** Ce libellé suppose un chiffre journalier. Le chiffre qu'il désigne est mensuel. Avec le chiffre-héros en temps réel (Q2), c'est _lui_ qui devient le chiffre principal — et il ne se rapporte pas à aujourd'hui, il se rapporte au mois.

**3. « Reste à vivre » est un terme juridiquement chargé en Belgique.** En médiation de dettes et en règlement collectif de dettes, le « reste à vivre » (ou _pécule de médiation_) est **le montant qu'un juge garantit au débiteur** pour vivre dignement — logement, nourriture, santé — avant tout remboursement de créancier. **[V]** ([CPAS Berchem-Sainte-Agathe](https://cpasberchem.brussels/actualite/a-quoi-sert-service-de-mediation-de-dettes/), [Tribunaux de Belgique — brochure RCD](https://www.tribunaux-rechtbanken.be/sites/default/files/media/artt/brabant_wallon/documents/brochure/brochure_le_rcd_en_10_questions_mise_a_jour_09-2019_0.pdf)). En crédit, c'est _revenus − charges fixes_, avec des seuils de référence (≈ 700 €/mois pour un isolé, 1 100 € pour un couple) **[V]** ([Econono, 2026](https://econono.com/blog/calculer-reste-a-vivre-formule-officielle-vs-realite/)).

Ces deux sens sont proches de ta définition mais pas identiques, et surtout : **ils appartiennent à quelqu'un d'autre.** Ton app n'a pas à se battre avec une définition bancaire et une définition judiciaire pour le même mot. Le mot a déjà perdu — il désigne quatre nombres dans ton propre code.

#### Décision : quatre noms, dont deux sont des phrases, pas des termes

| Nom affiché             | Rôle                        | Formule exacte                                                       |
| ----------------------- | --------------------------- | -------------------------------------------------------------------- |
| **« Il te reste »**     | Chiffre-héros, temps réel   | `Budget du mois − Dépensé ce mois`                                   |
| **« Budget du mois »**  | Ancre, prévisionnel, stable | `revenus − chargesFixes − provisionsLissées − engagementsMensuels`   |
| **« Dépensé ce mois »** | Contexte                    | `Σ expenses.amount` où `occurred_on` ∈ [1er du mois ; aujourd'hui]   |
| **« Épargne estimée »** | Projection                  | `Budget du mois − (Dépensé ce mois × jours_du_mois / jours_écoulés)` |

**Pourquoi « Il te reste » et pas un nom.** Un chiffre-héros est lu en une demi-seconde, en caisse, le pouce sur l'écran. La question dans ta tête est _« je peux dépenser ces 60 € ? »_. Une **phrase verbale** répond à cette question ; un **terme** oblige à se rappeler sa définition. Aucun glossaire n'est nécessaire pour lire « Il te reste 448,39 € ». C'est la seule des quatre lignes qui doit être compréhensible sans avoir lu la doc.

**Ce que tu ne perds pas.** « Budget du mois » **est** exactement ton reste à vivre — `revenus − (factures du mois + lissage) − engagements`, la définition bancaire, ton chiffre. Il reste affiché, en ancre, sous le héros. Je ne te retire pas ton chiffre ; je lui retire un nom qui en désignait quatre.

**Mots retirés de l'UI** : « Reste à vivre », « Reste disponible », « Budget vie courante », « Disponible aujourd'hui », « Capacité d'épargne », « Reste du mois ».
**Nom interne conservé** : `resteDisponible` reste le nom de code de « Budget du mois ». **Zéro renommage dans `src/lib/domain/`** — ce qui économise le risque le plus cher de tout le chantier vocabulaire.

---

### Q2 — Le chiffre-héros : temps réel. Fermement.

**Ta réponse** : tu ne tranches pas. « Tout doit être clair et facile à interpréter. »
**Recommandation de l'audit** : option 3 — grand chiffre **prévisionnel**, ligne dessous « dont X dépensés ».

**⚠️ Écart vs l'audit — je prends l'option 3 et je l'inverse. Le grand chiffre est le temps réel ; le prévisionnel devient la ligne du dessous.**

#### Le raisonnement d'interprétabilité

Un chiffre-héros n'est pas un chiffre : c'est **la réponse à une question**. Il faut donc d'abord fixer la question. La tienne, celle que tu poses cinquante fois par mois, c'est : _« est-ce que je peux dépenser ça ? »_

Un chiffre prévisionnel — revenus moins charges moins lissage — **ne répond pas à cette question**. Il répond à : _« qu'est-ce que j'aurais pu dépenser au 1er du mois ? »_ Cette réponse est vraie exactement **un jour sur trente**. Le 20 juillet, si tu as déjà dépensé 600 €, un héros à 736,79 € ne se trompe pas de calcul : il se trompe de question. Il est arithmétiquement exact et pratiquement mensonger. **Un chiffre qui n'est utilisable qu'au 1er du mois ne peut pas être le chiffre principal d'une app qu'on ouvre tous les jours.**

Et c'est déjà le diagnostic central de l'audit : _« Tu peux dépenser 400 € en courses, le grand chiffre du cockpit ne bouge pas d'un centime. »_ L'audit a identifié la boucle ouverte, puis a recommandé de la laisser ouverte au niveau du héros. Je pense que c'est une reculade.

#### Le contre-argument, et pourquoi il ne tient pas

_« Un chiffre qui bouge tout le temps est anxiogène et on ne peut pas s'y ancrer. »_

C'est vrai **quand le chiffre bouge pour des raisons que l'utilisateur ne contrôle pas** — un solde bancaire qui varie au gré des prélèvements en est l'exemple. Ce n'est pas le cas ici : ce chiffre ne bouge **que** quand tu saisis une dépense. Il ne bouge jamais tout seul. Ce n'est pas du bruit, c'est de la **causalité** — et c'est précisément la boucle de rétroaction que l'audit désigne comme le trou central du produit. Une jauge de carburant bouge aussi ; personne n'a jamais demandé qu'elle affiche le niveau du plein.

Le besoin d'ancrage est réel — et il est satisfait par la ligne juste dessous : _« sur 736,79 € de budget pour juillet »_. Ce nombre-là, lui, ne bouge pas du mois. Tu as les deux, hiérarchisés dans le bon sens.

#### Ce que fait la concurrence en 2026 (détail en §2)

Sur les six acteurs vérifiés qui affichent un chiffre principal de dépense, **cinq mettent en avant un chiffre qui intègre les dépenses déjà faites** — Copilot, Emma, Bankin', PiloteBudget franchement ; Monarch de façon hybride (son _flex number_ est une enveloppe prévisionnelle, mais l'écran d'accueil affiche la consommation contre cette enveloppe). Le seul qui ne le fasse pas est YNAB — et son « Ready to Assign » n'est pas « ce qu'il te reste à dépenser », c'est « l'argent qui n'a pas encore de mission », un chiffre conçu pour atteindre zéro. Ce n'est pas le même produit.

Copilot Money nomme le sien **« Free to Spend »** et l'affiche comme _« $1 380 left »_ en tête de son graphe de dépenses **[V]** ([Copilot Help, avril 2026](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview)). C'est exactement la décision prise ici.

#### Le piège technique que ni l'audit ni toi ne nommez : le double comptage

Si une échéance de charge est pointée « payée » **et** ressaisie comme dépense, elle est déduite deux fois. Le héros devient faux et personne ne comprend pourquoi.

Copilot résout ça de la même manière : _« Any recurring transactions expected to post in the current month are not included in the chart »_ **[V]** (même source). Ils vont plus loin et l'expliquent : sans cette règle, un loyer payé le 2 fait exploser le rythme de dépense et rend le graphe illisible.

**Invariant à figer dans le domaine, avec un test dédié** :

> Une occurrence de `charge` ou de `commitment` n'est **jamais** une `expense`. Les deux univers sont disjoints. La table `expenses` ne contient que du variable saisi à la main.

Corollaire UX : le Sheet de saisie de dépense **ne doit pas** proposer de catégorie « Loyer », « Assurance », « Crédit » — les catégories de dépense et les catégories de charge doivent être deux taxonomies distinctes, ou au minimum les catégories de charge doivent être masquées dans le sélecteur de dépense.

#### Spécification du héros

```
IL TE RESTE
448,39 €                                    ← 46 px, tabulaire, encre neutre
sur 736,79 € de budget · 288,40 € dépensés  ← 13 px
▓▓▓▓▓▓▓▓░░░░░│░░░░░░░░░░░░                  ← barre + repère « rythme idéal »
34,49 € / jour jusqu'au 31
```

- **Couleur du héros : encre neutre**, pas vert. Le vert transforme chaque mois en récompense et sature l'échelle : quand tout est vert, plus rien ne signale. **Rouge (`--color-danger`) uniquement si le chiffre est négatif.** Cette décision règle aussi, au passage, le seul usage réellement critique des tokens de statut cassés (§Q6/C1).
- **Barre** : dénominateur = Budget du mois · remplissage = Dépensé ce mois.
- **Repère (tick)** : à `jours_écoulés / jours_du_mois` du budget. Remplissage à gauche du repère = tu es en avance ; à droite = tu dépenses trop vite. C'est la ligne pointillée de Copilot, réduite à un trait de 2 px. **Elle ne demande aucune saisie utilisateur** — c'est ce qui la rend supérieure à une enveloppe.
- **Statut `incomplet`** (revenus non configurés) : le héros n'affiche **aucun chiffre**, seulement une invite. Le garde-fou THI-335 déjà présent dans `situation-mois.ts` **[V]** est conservé et étendu.

---

### Q3 — Le budget de 500 € par défaut : supprimé, et le concept avec

**Ta réponse** : choix 1, le supprimer, invite à la place. **Décision : d'accord — et je vais plus loin.**

Une fois le héros en temps réel, **l'enveloppe « budget vie courante » n'a plus de travail**. Elle répondait à « puis-je dépenser ? » ; le héros y répond désormais mieux, et sans demander à l'utilisateur d'inventer un nombre. Garder les deux, c'est réinstaller exactement la maladie qu'on soigne : deux réponses à une même question, sur deux écrans.

Et la seule chose que l'enveloppe produisait encore — la capacité d'épargne — se dérive mieux du comportement réel :

```
Épargne estimée = Budget du mois − (Dépensé ce mois × jours_du_mois / jours_écoulés)
```

Affichée seulement à partir du 7ᵉ jour du mois (sinon la projection est du bruit) ; sinon « — ».

**Conséquences techniques**

- `reste_a_vivre_default numeric not null default 500.00` → passe `nullable`, cesse d'être lue, est supprimée dans une migration ultérieure. **[V]** (`supabase/migrations/20260526000001`)
- `capaciteEpargneReelle()` change de signature : elle ne prend plus `resteAVivre` mais le total des dépenses du mois et la date de référence.
- `SituationDuMois.budgetVieCourante` et `.capacite` disparaissent ; `.ilTeReste`, `.depensesDuMois` et `.epargneEstimee` apparaissent.
- `AjusterResteAVivreDrawer.tsx` (306 lignes) est **supprimé**, pas migré. C'est un des 3 drawers sans piège de focus ni safe-area : le chantier `<Sheet>` (C4) a un fichier de moins à traiter.

---

### Q4 — La fréquence « tous les 9 mois » : non. Et j'ai la preuve dans tes propres données.

**Ta réponse** : tu veux 1/3/6/9/12, en demandant à être challengé.

**⚠️ Écart — non à 9 mois. Voici pourquoi, et ce n'est pas un avis.**

#### Preuve 1 — aucune de tes 19 charges n'est à 9 mois

J'ai relu les données réelles du prototype **[V]** (`gestion-budget.html`, lignes 203–231) :

| Cadence     | Nb de charges | Lesquelles                                                                                                                                                            |
| ----------- | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 mois**  |            14 | Loyer, Charges immeuble, Pension alimentaire, Assurance auto, Orange, Belfius, Impôt (plan), Solidaris ×2, EnergyVision, PlayStation, FGTB, Crédit voiture, Apple One |
| **3 mois**  |             1 | S.W.D.E. (eau)                                                                                                                                                        |
| **12 mois** |             4 | Taxe voiture, Taxe égout, Taxe poubelle, Dashlane                                                                                                                     |
| **6 mois**  |             0 | —                                                                                                                                                                     |
| **9 mois**  |         **0** | —                                                                                                                                                                     |

Le prototype **propose** « Tous les 9 mois » dans sa liste `FREQS` (ligne 164) — mais **aucune charge ne l'utilise**. C'est une option de menu, pas un besoin. L'audit avait raison de la signaler ; il avait tort de ne pas vérifier si elle servait.

#### Preuve 2 — un cycle de 9 mois n'existe quasiment pas dans la facturation belge

Les institutions facturent sur des cycles **qui bouclent sur l'année civile**, parce que leur comptabilité est annuelle : 1, 2, 3, 4, 6, 12 mois. 9 n'est pas un diviseur de 12 — un cycle de 9 mois dérive dans le calendrier (janvier → octobre → juillet → avril…). Aucun fournisseur d'eau, d'énergie, d'assurance, ni aucune commune belge ne facture ainsi.

**Mon hypothèse sur l'origine de ta demande [H]** : « tous les 9 mois » est presque certainement une lecture de **« étalé sur 9 mois »** — un plan de paiement, typiquement fiscal. Or ça, ce n'est **pas** une charge périodique : c'est 9 mensualités consécutives, puis c'est fini. Ankora modélise déjà exactement ça, proprement, sous `commitments` avec `kind = 'installment_plan'` et `installments_total = 9` **[V]** (`supabase/migrations/20260719000001_commitments.sql`). Ton « Impôt (plan de paiement) 220 €/mois » du prototype **est** ce cas, et il est déjà couvert.

#### Preuve 3 — le coût réel n'est pas 4 jours, il est bien plus élevé

L'audit chiffrait 4 j. J'ai mesuré la surface **[V]** : `payment_months` / `paymentMonths` apparaît dans **26 fichiers source hors tests** et **53 fichiers au total**, dont tout le domaine `charges/`, `cockpit/previsions`, `sante-provisions`, `assistant-virements`, les schémas Zod, les types Supabase et 4 écrans. Passer de « quels mois de l'année » à « date d'ancrage + pas en mois » touche tout ça et invalide une part des 501 tests du domaine. **J'estime 5 à 7 jours [H]**, pas 4 — pour débloquer une cadence qui n'existe pas.

#### Décision : la version à 0,5 jour qui te donne 90 % du bénéfice

**Étendre l'énumération aux diviseurs de 12 : 1, 2, 3, 4, 6, 12.** Tous bouclent sur l'année civile, donc `payment_months[]` continue de fonctionner **sans aucun changement d'ancrage**. Le coût :

| Modification                                         | Fichiers                                   |
| ---------------------------------------------------- | ------------------------------------------ |
| `check (frequency in (...))` + 2 valeurs             | 1 migration SQL                            |
| `CYCLE_MONTHS` : `bimonthly: 2`, `quadrimestrial: 4` | `cockpit/types.ts`                         |
| Cas supplémentaires                                  | `charges/payment-months-from-frequency.ts` |
| Libellés « Tous les 2 mois » / « Tous les 4 mois »   | `messages/*.json` × 5 locales              |
| Mise à jour des tests d'exhaustivité                 | ~3 fichiers de test                        |

**≈ 0,5 jour [H]**, contre 5–7 j pour la refonte d'ancrage.

Et **libeller l'UI en « Tous les N mois »** plutôt qu'en « Trimestriel / Semestriel » : le modèle reste restreint aux diviseurs de 12, mais le champ _lit_ comme un champ générique. Tu obtiens la sensation « je choisis ma cadence » sans en payer le prix.

**Honnêteté sur le minimum** : au vu de tes 19 charges, la décision strictement rationnelle est **0 jour, on ne touche à rien**. Je recommande quand même les 0,5 j : c'est une assurance bon marché contre le jour où une facture bimestrielle apparaît, et ça enlève l'irritation « le modèle m'interdit quelque chose ».

**Ce que fait la concurrence** : les outils qui gèrent réellement la cadence libre utilisent tous un modèle **générique « tous les N »**, jamais une énumération. Actual Budget : _« every month, every 2 months, every 2 years »_ **[V]** ([docs Actual](https://github.com/actualbudget/actual/blob/master/packages/docs/docs/schedules.md)). Lunch Money : une option **« Custom »** en plus des cadences standard **[V]** ([Lunch Money KB](https://github.com/lunch-money/support/blob/master/finances/recurring-items.md)). PocketSmith : intervalles personnalisés en mois **[V]** ([PocketSmith Learn](https://learn.pocketsmith.com/article/245-repeating-budgets-and-how-to-delete-or-make-changes-to-them)). **Aucun d'eux n'énumère « 9 mois ».** Le générique est la bonne cible à terme ; il n'est simplement pas prioritaire aujourd'hui.

---

### Q5 — L'amortissement des crédits : option 3 maintenant, et un calculateur séparé

**Ta réponse** : tu penches pour 2 + 3, en notant que le prototype faisait « quelque chose de pas mal ».

**J'ai lu le module. Il est effectivement bon. Et tu ne t'en es jamais servi.**

#### Ce que le prototype fait bien [V] (`gestion-budget.html` l. 397–432, 843–909)

- Mensualité théorique par la formule d'annuité exacte : `M = C·i / (1 − (1+i)^−n)`, avec dégénérescence propre en `C/n` si le taux est nul.
- Tableau d'amortissement ligne à ligne : n° · date · mensualité · intérêts · capital · **capital restant dû**.
- La **dernière mensualité absorbe les arrondis** (`if (capPart > crd || k === n-1) capPart = crd`) — c'est le détail qui distingue un vrai tableau d'amortissement d'un tableau approximatif.
- Garde-fou explicite : si la mensualité saisie ne couvre pas les intérêts du premier mois, il affiche _« le crédit ne s'amortit jamais »_ au lieu de boucler.
- Dégradation gracieuse : paramètres incomplets → un encadré « Paramètres incomplets », pas une erreur.
- 4 KPI en tête : Mensualité · **Coût total du crédit** · Total remboursé · **Date de fin**.

#### Ce qui invalide l'option 2 : tu n'as jamais rempli les champs

L'état initial de ton prototype, tel qu'il est écrit dans le fichier **[V]** (l. 250) :

```js
{ libelle: "Crédit voiture", capital: null, taux: null, duree: null,
  mensualite: 250, debut: null, actif: true,
  note: "Paramètres exacts à compléter (capital, taux, durée, date de début)." }
```

Et le plan de paiement, l. 253 : `total: null, nbMens: null` — même note.

**Le module d'amortissement que tu trouves « pas mal » n'a, dans ton propre fichier, jamais affiché une seule ligne.** Il affiche l'encadré « Paramètres incomplets ». Ce que tu as apprécié, ce sont les 4 KPI et la promesse — pas le tableau, que tu n'as jamais vu avec tes données.

Ce n'est pas un reproche, c'est une donnée produit de premier ordre : **capital d'origine + taux annuel + durée d'origine + date de début, ce sont quatre informations qui ne sont pas dans ta tête et qu'il faut aller chercher dans un contrat de crédit.** Une fonctionnalité qui exige quatre saisies d'archives pour se réveiller a un taux d'adoption structurellement faible — et tu viens d'en faire la démonstration sur toi-même pendant plusieurs mois.

#### Le second obstacle, plus grave : ça contredit le modèle de données d'Ankora

`commitments.total_amount` porte ce commentaire dans la migration **[V]** :

> _« Amount still engaged at creation (D3 locked: the user types the REMAINING balance from their statement, not the original borrowed amount). »_

Ankora a **délibérément** choisi le solde restant plutôt que le capital d'origine, parce que c'est le chiffre qu'on lit sur un relevé. Un amortissement capital/intérêts exige le capital d'origine. Brancher l'option 2 sur `commitments`, c'est soit renverser cette décision (migration + re-saisie de tous les engagements existants), soit maintenir deux montants de référence sur le même objet. **Ce n'est pas 4 jours de code, c'est un changement de sémantique du modèle** — le genre de chose qui produit précisément les incohérences dont tu te plains.

#### Décision : 3 maintenant, et le 2 sous forme détachée et facultative

**Immédiat — option 3 (≈ 0,5 j), intégré au chantier C5.**
Sur la fiche d'un engagement, en haut : **Mensualité · Reste à payer · Échéances restantes (17 sur 24) · Dernière échéance (15/12/2027, dans 17 mois)**. Ces quatre valeurs sont **déjà calculées** par le domaine — le travail est un travail d'affichage, pas de calcul.

**Détaché (C7, ≈ 1,5 j) — « Coût du crédit », facultatif et non branché.**
Trois colonnes _nullables_ sur `commitments` (`original_capital`, `annual_rate`, `original_term_months`) + un portage de la fonction `amortissement()` du prototype dans `src/lib/domain/credits/` (fonction pure, testable, ~60 lignes) + un panneau en lecture seule.

**Contrat non négociable — et c'est ce qui fait passer le coût de 4 j à 1,5 j :**

> Le calculateur **ne participe à aucun calcul du cockpit**. Il n'entre ni dans « Budget du mois », ni dans « Il te reste », ni dans les engagements lissés. Il est purement informatif. Trois colonnes nulles = aucune conséquence, exactement comme dans le prototype.

Le libellé de l'UI doit le dire, mot pour mot : _« N'affecte ni ton budget ni ton reste. »_ Cette phrase est ce qui autorise à ne jamais remplir les champs sans culpabilité — et donc ce qui rend l'option acceptable.

**Piège de libellé repéré en fabriquant la maquette C**, à traiter dès l'option 3 : « **Reste à payer** » (somme des mensualités restantes — 17 × 250 = 4 250 €, ce que dérive Ankora aujourd'hui) et « **Capital restant dû** » (principal seul — ≈ 4 028 € au même instant) sont **deux nombres différents** et le second est toujours plus petit. Les afficher côte à côte sans les distinguer explicitement recréerait exactement la maladie qu'on soigne. Le KPI de l'option 3 doit s'appeler « **Reste à payer** » et porter la sous-ligne « _somme des mensualités restantes_ » ; le tableau d'amortissement de C7 garde « Capital restant dû ».

**Ce que je refuse explicitement** : que le taux et la répartition capital/intérêts remontent dans le modèle financier central. C'est l'option 2 « pleine », et elle coûte 4 j de code plus un risque permanent sur un domaine qui affiche aujourd'hui 0 correctif en 233 commits.

---

### Q6 — Les 5 112 lignes d'atoms : supprimer, mais récolter d'abord

**Tu me laisses décider. Décision : supprimer `src/components/atoms/` et `/design-playground`.**

Les raisons de l'audit sont solides et je n'y ajoute rien : 9 atoms sur 11 à zéro call-site, 0/8 écrans du cockpit les importent, 7 issues P0/P1 ouvertes depuis 80 jours sur du code que personne n'exécute. Le backlog signale un incendie dans une pièce vide.

Je réfute le seul argument de l'option 2 (« les garder comme référence visuelle ») : **git est la référence.** `git show <sha>:src/components/atoms/Drawer.tsx` récupère le fichier en une seconde, pour toujours. Garder du code mort dans `main` pour « pouvoir le regarder », c'est payer un coût de maintenance permanent — CI, typecheck, bundle, revue, bruit dans le backlog — contre un bénéfice que le contrôle de version fournit gratuitement.

**Précision que l'audit ne fait pas.** Avant de supprimer, **récolter `atoms/__tests__/Drawer.test.tsx` (634 lignes)**. Ces tests ne valent rien en tant que tests d'un composant mort, mais ils sont une **spécification comportementale écrite** de ce qu'un drawer doit faire. Ils deviennent le cahier des charges de la primitive `<Sheet>` du chantier C3. Coût : une demi-journée de lecture, incluse dans C1. Ce qui est jeté, c'est l'implémentation ; ce qui est gardé, c'est le contrat.

**Jalon vérifiable** : `−5 112 lignes` · 35 → 28 issues ouvertes · `tsc --noEmit` et `vitest run` restent à 0 erreur.

---

### Q7 — Le bouton ⊕ central : oui, avec une réserve nommée

**Ta réponse** : choix 1. **Décision : d'accord.** Mais je dois nommer deux tensions, parce que tu demandes une expérience « d'inspiration Apple ».

**Tension 1 — le ⊕ central n'est pas un pattern Apple.** Aucune app système iOS n'a d'action au centre de sa tab bar ; les Human Interface Guidelines traitent les onglets comme des _destinations persistantes_, pas comme des actions. Le ⊕ central vient d'Instagram, TikTok, X, YouTube — des apps sociales, pas des apps Apple.

**Tension 2 — il casse le contrat de la tab bar.** Quatre onglets changent de vue et conservent leur état ; le cinquième ouvre une modale. C'est une incohérence réelle.

**Je le retiens quand même**, pour une raison qui l'emporte : **la fréquence d'usage.** L'ajout de dépense est l'action la plus fréquente de l'app et coûte aujourd'hui 4 taps + un défilement **[V]**. Aucune autre position ne donne 2 taps depuis n'importe quel écran. Et le pattern est devenu si répandu que l'attente des utilisateurs a bougé : personne ne se trompe plus sur ce que fait un ⊕ au milieu d'une barre.

**Spécification visuelle — pour qu'il ne fasse pas « Android » :**

| Ce qu'on ne fait pas                                                | Ce qu'on fait                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Un cercle flottant qui déborde au-dessus de la barre (FAB Material) | Un bloc **contenu dans la barre**, `46 × 33 px`, rayon 11 px                   |
| Une ombre portée marquée                                            | Ombre très légère (`0 2px 8px` à 35 % d'opacité)                               |
| Une icône « + » fine et centrée dans un cercle                      | Un glyphe `+` en `SF Symbols plus`, poids _regular_, sur aplat `--color-brand` |
| Un label « Ajouter » sous le bouton                                 | **Pas de label** — c'est ce qui le distingue visuellement des 4 destinations   |

Ainsi il occupe le 3ᵉ des 5 emplacements, à la même hauteur que les autres, mais son traitement (aplat plein, pas de label) dit sans ambiguïté « je suis une action, pas une destination ». Rendu vérifié en 390×844 dans `maquette-ankora-mobile.html` (écrans A et C).

---

### Q8 — Ordre de bataille : réordonné. Le premier jalon perceptible passe de J+15 à J+8.

**Ta réponse** : choix 1, suivre le plan, en demandant à être challengé.

**⚠️ Écart — le plan de l'audit a un défaut de séquencement qui coûte une semaine.**

L'ordre proposé était : nettoyage → vocabulaire → **primitive `<Sheet>` (5 j)** → Dépenses → cockpit → e2e. Deux problèmes :

**1. Cinq jours de valeur utilisateur nulle sur le chemin critique.** La primitive `<Sheet>` est indispensable, mais elle ne produit **rien de perceptible** : à la fin, six drawers font exactement ce qu'ils faisaient. L'audit le reconnaît lui-même — « premier jalon utilisateur perceptible : ~15 jours ouvrés ». Pour un développeur seul, quinze jours sans rien voir bouger, c'est un risque réel d'abandon.

**2. Plus grave : on construirait le châssis avant d'avoir testé le moteur.** La décision Q2 (héros en temps réel) est le pari central de ce document. Si elle est fausse pour toi, tout ce qui suit change. Il faut la mettre entre tes mains **le plus tôt possible**, pas après 15 jours de plomberie.

**3. Une primitive s'extrait, elle ne se décrète pas.** L'audit en fournit la preuve involontaire : les trois drawers **corrects** (`SimulatorDrawer`, `MoreSheet`, `HeaderNav`) sont ceux écrits **en dernier** — ils ont appris des précédents. Une primitive conçue _a priori_ depuis six call-sites existants a de bonnes chances d'être mal découpée, et se tromper coûte 5 jours. Une primitive **extraite du meilleur call-site**, écrit avec le plus grand soin (celui de la saisie de dépense), est structurellement plus juste.

**Décision : le `<Sheet>` naît dans le chantier Dépenses (C3), puis est généralisé (C4).**

Le plan révisé complet est en §4.

---

## 2. Veille concurrentielle — juillet 2026

### 2.1 Le chiffre-héros de l'écran d'accueil

| App                                  | Chiffre principal                                                                                                        | Nature                                                                                                                     |                      Vérifié ?                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------: |
| **Copilot Money**                    | **« Free to Spend »** (_« $1 380 left »_) en tête du graphe de dépenses du mois                                          | **Temps réel.** Budget − dépensé. Ligne pointillée = rythme idéal. **Les récurrences ne sont pas comptées dans le graphe** |                       **[V]**                        |
| **Emma**                             | **« True balance »** — _« how much you really have left to spend each month »_                                           | **Temps réel**, après engagements                                                                                          | **[V]** (fonction), **[H]** (place exacte à l'écran) |
| **Bankin'**                          | **Prévision de solde en fin de mois** = `solde actuel + entrées à venir − dépenses à venir`                              | **Hybride ancré sur le réel** — part du solde actuel, qui intègre déjà ce que tu as dépensé                                |                       **[V]**                        |
| **Monarch Money**                    | **« Flex number »** = `revenus − fixes − non-mensuels − objectifs`, puis suivi des dépenses flex contre ce nombre        | **Prévisionnel** pour l'enveloppe, **temps réel** pour le suivi                                                            |                       **[V]**                        |
| **YNAB**                             | **« Ready to Assign »**, bandeau vert en haut de l'onglet Home (remanié en 2026)                                         | **Ni l'un ni l'autre** — argent sans mission, conçu pour atteindre zéro                                                    |                       **[V]**                        |
| **PocketSmith**                      | Prévision de solde de compte sur calendrier / graphe                                                                     | **Prévisionnel** (outil de forecast, pas de suivi quotidien)                                                               |                       **[V]**                        |
| **Lunch Money**                      | Pas de chiffre-héros unique — vue budget par catégorie                                                                   | s. o.                                                                                                                      |                       **[V]**                        |
| **Actual Budget**                    | Enveloppes façon YNAB, « To Budget »                                                                                     | Prévisionnel                                                                                                               |                       **[V]**                        |
| **PiloteBudget** (FR/BE, hors-ligne) | **« Reste à vivre »** hebdo ou mensuel, _« les ressources qui vous restent pour régler vos dépenses durant la période »_ | **Temps réel**                                                                                                             |                       **[V]**                        |

**Ce qu'on en retient.** Cinq des six apps qui affichent réellement « ce qu'il te reste à dépenser » affichent un chiffre **qui descend quand tu dépenses**. Les deux exceptions (YNAB, Actual) ne posent pas la même question : ce sont des systèmes d'**affectation** d'enveloppes, pas des systèmes de **consommation**. Ankora est, par sa définition même — lissage, provisions, reste à vivre — un système de consommation.

Le plus proche d'Ankora est **Copilot** : même séparation entre récurrences (fixes, exclues du suivi de rythme) et dépenses (variables, suivies), même chiffre-héros en temps réel, même repère de rythme. Sa règle d'exclusion des récurrences est reprise telle quelle comme invariant (§Q2).

Le plus proche d'Ankora sur le **modèle**, c'est **Monarch** : ses trois seaux — _fixed · non-monthly recurring · flex_ — sont, à un mot près, `chargesFixes · provisionsLissées · dépenses variables` **[V]**. C'est une validation externe forte de la modélisation d'Ankora, qui n'a rien à envier à personne sur ce point.

### 2.2 Le vocabulaire français

| Terme                                                             | Sens établi                                                                                         | Source                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reste à vivre** (crédit)                                        | `revenus − charges fixes`. Seuils de référence ≈ 700 €/mois (isolé), 1 100 € (couple)               | **[V]** [Econono 2026](https://econono.com/blog/calculer-reste-a-vivre-formule-officielle-vs-realite/)                                                                                                                                                                                      |
| **Reste à vivre / pécule de médiation** (BE, médiation de dettes) | **Montant garanti par le juge** pour vivre dignement avant remboursement des créanciers             | **[V]** [CPAS Berchem](https://cpasberchem.brussels/actualite/a-quoi-sert-service-de-mediation-de-dettes/), [brochure RCD](https://www.tribunaux-rechtbanken.be/sites/default/files/media/artt/brabant_wallon/documents/brochure/brochure_le_rcd_en_10_questions_mise_a_jour_09-2019_0.pdf) |
| **Disponible** (BE, médiation)                                    | `revenus − pécule de médiation` — **exactement l'inverse** du sens que lui donne Ankora aujourd'hui | **[V]** même source                                                                                                                                                                                                                                                                         |
| **Solde prévisionnel de fin de mois**                             | `solde actuel + entrées à venir − dépenses à venir`                                                 | **[V]** [Bankin' Support](https://support.bankin.com/hc/fr/articles/32452208391953-Pr%C3%A9vision-de-solde-en-fin-de-mois)                                                                                                                                                                  |

**Ce qu'on en retient.** Deux constats gênants pour le vocabulaire actuel d'Ankora :

1. **« Reste à vivre » a deux propriétaires en Belgique** — le secteur du crédit et la justice. Aucun des deux sens ne correspond exactement à celui d'Ankora.
2. **« Reste disponible » — le nom actuel du chiffre-héros — signifie en médiation de dettes belge le contraire** de ce qu'Ankora lui fait dire : chez le médiateur, le « disponible » est ce qui part aux créanciers, pas ce qui reste au ménage. Pour un utilisateur belge qui a déjà croisé ce vocabulaire, c'est un contresens direct.

Ces deux constats fondent la décision Q1. **Aucun terme du glossaire retenu n'est un terme technique appartenant à un tiers.**

Aucun acteur consulté ne fait de « provision lissée » un terme d'interface : Monarch parle de _non-monthly expenses_, Copilot de _recurrings_. **Aucun mot français consacré n'existe pour ce concept** — « provision » est donc conservé, c'est le moins mauvais et il est déjà compris.

### 2.3 Les cadences réellement proposées

| App                 | Cadences                                                                                                 | Modèle                                                              | Vérifié ? |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | :-------: |
| **Actual Budget**   | _every month · every 2 months · every 2 years · every week · every 2 weeks · nᵉ jour du mois · « Last »_ | **Générique « tous les N »**                                        |  **[V]**  |
| **Lunch Money**     | mensuel, bi-mensuel, bi-hebdo, trimestriel, annuel + **« Custom »**                                      | **Générique**                                                       |  **[V]**  |
| **PocketSmith**     | quotidien, hebdo, quinzaine, mensuel, + intervalles personnalisés en mois                                | **Générique**                                                       |  **[V]**  |
| **Monarch**         | _fixed monthly_ vs _non-monthly recurring_ (annuel, semestriel…)                                         | Catégoriel, pas de cadence libre                                    |  **[V]**  |
| **Ankora (actuel)** | `monthly · quarterly · semiannual · annual`                                                              | **Énumération** ancrée sur `payment_months[]`                       |  **[V]**  |
| **Prototype HTML**  | 1 · 3 · 6 · **9** · 12 mois                                                                              | **Générique** : `addMonthsISO(prochaine, k × freq)` — ancrage + pas |  **[V]**  |

**Ce qu'on en retient — trois choses.**

1. **Personne n'énumère « 9 mois ».** Les outils qui offrent une cadence libre offrent « tous les N », et 9 n'est jamais un préréglage.
2. **Le prototype utilise déjà le modèle générique** (date d'ancrage + pas en mois, l. 352–377 **[V]**) — ce qui explique pourquoi « 9 mois » y était gratuit et ne l'est pas dans Ankora. Ce n'est pas une différence de fonctionnalité, c'est une différence d'ancrage.
3. **`commitments` d'Ankora utilise déjà le bon modèle** (`start_year` + `start_month` + `frequency`) **[V]**. Seule la table `charges` est restée sur `payment_months[]`. Le jour où la cadence libre deviendra un vrai besoin, le patron existe déjà dans le dépôt.

---

## 3. Architecture UX cible — mobile d'abord

> Maquettes rendues et **contrôlées en viewport 390 × 844** (iPhone 14/15, `device_scale_factor: 2`) :
> `maquette-ankora-mobile.html` · captures `A-accueil.png`, `B-saisie.png`, `C-credit.png`.

### 3.1 Glossaire figé — les 4 chiffres, leur nom définitif et leur formule exacte

Ce tableau est la **source de vérité**. Il doit devenir un ADR (`ADR-0xx-vocabulaire-des-quatre-chiffres`) et aucune clé i18n ne doit introduire un cinquième nom.

| #   | Nom affiché (fr-BE) | Clé i18n               | Nom de code                    | Formule exacte                                                                                                                          |
| --- | ------------------- | ---------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Il te reste**     | `cockpit.hero.label`   | `ilTeReste`                    | `budgetDuMois − depensesDuMois`                                                                                                         |
| 2   | **Budget du mois**  | `cockpit.hero.anchor`  | `resteDisponible` _(inchangé)_ | `revenus − chargesFixes − provisionsLissees − engagementsMensuels`                                                                      |
| 3   | **Dépensé ce mois** | `cockpit.hero.spent`   | `depensesDuMois`               | `Σ expenses.amount` où `occurred_on` ∈ [1er du mois ; aujourd'hui]                                                                      |
| 4   | **Épargne estimée** | `cockpit.mois.epargne` | `epargneEstimee`               | `budgetDuMois − depensesProjetees`, où `depensesProjetees = depensesDuMois × joursDuMois / joursEcoules` ; `null` si `joursEcoules < 7` |

**Composantes de la formule 2** (déjà implémentées, inchangées) **[V]** :

- `chargesFixes` = `Σ amount` des charges actives à `frequency = 'monthly'` — `totalChargesMensuelles()`
- `provisionsLissees` = `Σ (amount / CYCLE_MONTHS[frequency])` sur les charges actives **non mensuelles** — `provisionsMensuellesLissees()`
- `engagementsMensuels` = mensualités lissées des engagements actifs (ADR-021) — `engagementsMensuelsLisses()`

> **Pourquoi il n'y a pas de double comptage entre 2 et 3** : `chargesFixes` ne compte que les charges mensuelles ; `provisionsLissees` ne compte que les non-mensuelles. Leur somme est l'_effort financier lissé_ (ADR-009), sans recouvrement. Et l'invariant Q2 garantit qu'aucune de ces échéances ne peut se retrouver dans `expenses`.

**Mots bannis de toute l'UI et de tous les fichiers de messages** : _reste à vivre · reste disponible · budget vie courante · disponible aujourd'hui · capacité d'épargne · reste du mois_.

**Jalon vérifiable** :

```bash
grep -ric "reste à vivre\|reste disponible\|vie courante\|disponible aujourd'hui\|capacité d'épargne" messages/
# → 0
```

### 3.2 Navigation — barre d'onglets

```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│   Mois   │ Factures │    ⊕     │ Dépenses │   Plus   │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

| Slot | Destination                 | Contenu                                                                                          |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | **Mois** _(ex-Cockpit)_     | Écran d'accueil, §3.3                                                                            |
| 2    | **Factures** _(ex-Charges)_ | Liste + pointage 2 taps — **ne pas y toucher**, c'est déjà le meilleur parcours de l'app **[V]** |
| 3    | **⊕**                       | _Action_, pas destination. Ouvre le Sheet de saisie (§3.4)                                       |
| 4    | **Dépenses**                | Historique, filtres, répartition par catégorie                                                   |
| 5    | **Plus**                    | Crédits & échéanciers _(ex-Engagements)_ · Comptes · Simuler · Réglages                          |

**Renommages** : `Cockpit → Mois` · `Charges → Factures` · `Engagements → Crédits & échéanciers`. Motif : ce sont les mots du prototype, ce sont les tiens, et ils ne demandent pas de traduction mentale. _Engagements_ est le terme du modèle de données et recouvre à la fois un crédit voiture et un échéancier fiscal sans que rien dans le mot ne le laisse deviner.

**Contraintes techniques**

- Hauteur : `49 px` + `env(safe-area-inset-bottom)` (34 px sur iPhone à encoche) = **83 px**.
- Fond translucide `rgba(249,249,251,.94)` + `backdrop-filter: saturate(180%) blur(20px)`.
- Le registre `app-destinations.ts` et son test qui lit le disque sont **conservés et étendus** au ⊕ (avec un marqueur `kind: 'action'` distinct de `kind: 'destination'`, pour que le test ne le confonde pas avec une route).

### 3.3 Écran d'accueil « Mois » — hiérarchie stricte

**Contrainte** : viewport 390 × 844, moins 47 px de status bar, moins 83 px de tab bar → **≈ 714 px de contenu au-dessus de la ligne de flottaison**.

| Ordre | Bloc                                                    |       Hauteur | Condition                                                          |
| ----: | ------------------------------------------------------- | ------------: | ------------------------------------------------------------------ |
|     0 | Titre « Juillet » + « 13 jours restants »               |         44 px | toujours                                                           |
| **1** | **HÉROS**                                               |      ≈ 200 px | toujours                                                           |
| **2** | **ALERTES**                                             | 0 ou ≈ 130 px | **uniquement s'il y a lieu**                                       |
| **3** | **CE MOIS** (3 lignes)                                  |      ≈ 180 px | toujours                                                           |
|     4 | **DERNIÈRES DÉPENSES** (2–3 lignes)                     |      ≈ 160 px | coupé par la flottaison — **c'est voulu**, ça invite au défilement |
|     — | _(sous la flottaison)_ Comptes · Plan du mois · Simuler |             — | écrans de configuration, consultés une fois par mois               |

**Rendu contrôlé** : avec le bloc Alertes présent, les quatre chiffres du glossaire + le compteur de factures + l'état des provisions sont **tous visibles sans défiler**. La flottaison tombe dans le bloc 4. ✅

#### Bloc 1 — Héros (spec au pixel)

```
IL TE RESTE                      ← 11 px · 700 · +0.09em · uppercase · --color-text-3
448,39 €                         ← 46 px · 700 · −0.035em · tabulaire · encre neutre
                                   (décimales à 26 px / 600, teinte --color-text-2)
sur 736,79 € de budget · 288,40 € dépensés    ← 13 px · montants en 600
[▓▓▓▓▓▓▓▓░░░░│░░░░░░░░]          ← barre 7 px, r=99px ; repère 2×15 px, opacité .35
34,49 € / jour jusqu'au 31        ← 12 px
```

- **Couleur** : encre neutre par défaut ; `--color-danger` si le chiffre est **négatif** ; jamais de vert.
- **Barre** : dénominateur = Budget du mois ; remplissage = Dépensé ce mois ; repère à `joursEcoules / joursDuMois`.
- **Correction issue du rendu** : la sous-ligne passe à deux lignes sur 390 px. La raccourcir en `sur 736,79 € · 288,40 € dépensés` pour tenir sur une ligne.
- **Animation** : au retour du Sheet de saisie, le nombre s'anime de l'ancienne à la nouvelle valeur sur **≈ 400 ms**, courbe `--ease-spring`, chiffres tabulaires (pas de saut de largeur). _Cette animation est la fonctionnalité_, pas une décoration : c'est elle qui rend la boucle de rétroaction sensible.
- **`prefers-reduced-motion`** : transition directe, sans compte à rebours.

#### Bloc 2 — Alertes (conditionnel, ordre de priorité)

Emprunt direct au prototype : _« Le prototype dit "regarde ça" ; Ankora dit "voici tout" »_. **Le bloc n'existe pas s'il n'y a rien à signaler** — pas de carte vide, pas d'état « tout va bien ».

Ordre, une seule alerte à la fois (la plus prioritaire) :

1. **Factures en retard** — `⚠︎ 2 factures en retard · 195,00 €` + 2 lignes max + « Tout voir »
2. **Échéances sous 7 jours** — même forme, ton neutre
3. **Provisions en déficit** — `Déficit 240 € · rattrapage +40 €/mois`

Fond `--color-warning-surface`, texte `--color-warning-ink`, **jamais** de rouge pour un retard de facture (le rouge est réservé au héros négatif — un seul niveau d'alarme maximum par écran).

#### Bloc 3 — « Ce mois » (3 lignes, chacune tappable)

| Libellé         | Valeur                        | Cible        |
| --------------- | ----------------------------- | ------------ |
| Factures payées | `8/14` + mini-barre 54 × 6 px | → Factures   |
| Provisions      | `à jour ✓` ou `déficit 240 €` | → Provisions |
| Épargne estimée | `+ 240,10 €` ou `—`           | → Simuler    |

_(Vérification du calcul de la maquette : au 18 juillet, `288,40 × 31/18 = 496,69` de dépenses projetées ; `736,79 − 496,69 = 240,10 €`.)_

Lignes de 52 px (> 44 px), séparateurs 1 px, chevron `›`. Le calibrage vient de la liste système iOS.

### 3.4 Parcours « ajouter une dépense » en 2 taps

**État actuel [V]** : 4 taps + 1 défilement (onglet Dépenses → champ Libellé → champ Montant → Ajouter), sans retour sur le cockpit.

**Cible : 2 taps depuis n'importe quel écran.**

| Étape     | Action            | Détail d'implémentation                                                                                                                                                                                                                                                                     |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —         | _(état initial)_  | N'importe quel écran de l'app                                                                                                                                                                                                                                                               |
| **TAP 1** | ⊕                 | Le Sheet monte du bas en ≈ 350 ms. Le clavier **numérique système** (`inputMode="decimal"`) est déjà levé, le curseur est dans le champ Montant. La date est préremplie à _Aujourd'hui_. La catégorie la plus utilisée sur 30 jours est **présélectionnée**. Le libellé est **facultatif**. |
| —         | Frappe du montant | Pas un tap : le clavier est déjà ouvert et focalisé. C'est ce qui rend le « 2 taps » réel et non comptable.                                                                                                                                                                                 |
| **TAP 2** | **Ajouter**       | Bouton pleine largeur, `50 px`, **ancré juste au-dessus du clavier** — atteignable au pouce sans repositionner la main. `useOptimistic` : la dépense apparaît instantanément.                                                                                                               |
| —         | Retour            | Le Sheet redescend, le héros s'anime vers sa nouvelle valeur.                                                                                                                                                                                                                               |

**Le détail qui fait la différence** : sous le montant saisi, en 12 px, **« Il te restera 429,89 € »**. La conséquence est montrée _avant_ la validation. Ça transforme la saisie d'une corvée comptable en une décision informée — et c'est ce qui distingue Ankora d'un carnet de dépenses.

**Contenu du Sheet, dans l'ordre :**

1. **Montant** — 44 px, tabulaire, centré, curseur teinté marque. Sous-ligne « Il te restera X € ».
2. **Puces de catégorie** — **5 maximum sur une seule ligne, défilement horizontal, jamais de retour à la ligne** _(correction issue du rendu : à 6 puces elles passent sur deux rangs et repoussent le bouton)_. Ordre : les 5 plus utilisées sur 30 jours, la 1ʳᵉ présélectionnée. 6ᵉ élément « ＋ » → liste complète. **Les catégories de charge (Loyer, Assurance, Crédit…) sont exclues du sélecteur** — invariant Q2.
3. **Date** (« Aujourd'hui ») et **Libellé (facultatif)** sur une ligne, deux champs 50/50. Si le libellé est vide → il prend le nom de la catégorie. C'est ce qui permet de rester à 2 taps.
4. **Ajouter**.

**Changer de catégorie coûte un 3ᵉ tap. C'est assumé** : la catégorie modale est juste dans la grande majorité des saisies, et une saisie mal catégorisée reste corrigeable en 2 taps depuis la liste.

### 3.5 La primitive `<Sheet>` — contrat

Née en C3 (saisie de dépense), généralisée en C4 aux 5 drawers restants (`AjusterResteAVivreDrawer` étant supprimé par Q3).

| Obligation                           | Aujourd'hui                           |
| ------------------------------------ | ------------------------------------- |
| Piège de focus (`focus trap`)        | **absent de 3 drawers sur 6** **[V]** |
| Fermeture par `Escape`               | 6/6 ✅                                |
| Verrou de défilement du corps        | 6/6 ✅                                |
| `env(safe-area-inset-bottom)`        | **absent de 3 drawers sur 6** **[V]** |
| `aria-modal` + `role="dialog"`       | 6/6 ✅                                |
| Restitution du focus à la fermeture  | à vérifier                            |
| Ancrage bas (mobile) / droite (≥ md) | ad hoc                                |
| Poignée (`grab handle`) 36 × 5 px    | ad hoc                                |
| Fermeture par glissement vers le bas | absent partout                        |

**Jalon vérifiable** — le patron d'`app-destinations.test.ts`, qui a déjà fait ses preuves : un test qui parcourt `src/**/*{Drawer,Sheet}*.tsx` et **échoue si un fichier implémente son propre `keydown` sur `Escape`** ou son propre verrou de défilement. La régression devient impossible, pas seulement corrigée.

### 3.6 Contrastes — valeurs à appliquer

Les 5 combinaisons sous AA de l'audit sont confirmées par recalcul **[V]**. Le point aveugle : **chaque couleur a besoin d'une valeur différente par thème**, un seul jeu ne peut pas passer dans les deux.

| Token               | Clair (sur `#ffffff`)                |    Ratio | Sombre (sur `#111a2e`) | Ratio |
| ------------------- | ------------------------------------ | -------: | ---------------------- | ----: |
| `--color-danger`    | `#dc2626` _(inchangé)_               |     4,83 | `#f87171`              |  6,27 |
| `--color-success`   | `#047857` _(était `#059669` → 3,77)_ | **5,48** | `#34d399`              |  9,02 |
| `--color-warning`   | `#a35a06` _(était `#d97706` → 3,19)_ | **5,22** | `#fbbf24`              | 10,39 |
| `--color-info`      | `#0369a1` _(était `#0284c7` → 4,10)_ | **5,93** | `#38bdf8`              |  8,09 |
| `--color-brand-600` | `#0f766e` _(était `#0d9488` → 3,74)_ | **5,47** | `#2dd4bf`              |  9,32 |

**Jalon** : un test unitaire qui calcule le ratio de chaque paire token/surface et échoue sous 4,5:1.

### 3.7 Ce qu'on emprunte au prototype — et ce qu'on n'emprunte pas

| #   | Emprunt                             | Transposition précise                                                                                                                                                        | Coût       |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Un mot, un nombre**               | Le glossaire §3.1, gravé dans un ADR, avec un `grep` en jalon                                                                                                                | inclus C2  |
| 2   | **Les alertes avant les données**   | Bloc 2 de l'écran d'accueil, conditionnel, une seule alerte à la fois                                                                                                        | inclus C5  |
| 3   | **Le vocabulaire de l'utilisateur** | `Cockpit → Mois`, `Charges → Factures`, `Engagements → Crédits & échéanciers`                                                                                                | inclus C2  |
| 4   | **Les 4 KPI de crédit**             | Mensualité · Reste à payer · Échéances restantes · Dernière échéance (Q5, option 3)                                                                                          | 0,5 j (C5) |
| 5   | **La fonction `amortissement()`**   | Portée telle quelle dans `domain/credits/`, avec l'absorption d'arrondi sur la dernière échéance et le garde-fou « ne s'amortit jamais ». **Non branchée au cockpit**        | 1,5 j (C7) |
| 6   | **Le taux d'endettement vs 33 %**   | `(engagements mensuels) / revenus`, en ligne dans « Plus → Crédits & échéanciers ». **Pas sur l'accueil** — c'est un indicateur d'emprunteur, pas un indicateur du quotidien | 0,5 j (C7) |
| 7   | **La dégradation gracieuse**        | « Paramètres incomplets, renseignez au minimum X et Y » plutôt qu'un champ vide ou un `—` muet. À généraliser                                                                | transverse |

**Ce qu'on n'emprunte pas, et pourquoi :**

| Ce que fait le prototype                                | Pourquoi on ne le prend pas                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Barre d'onglets horizontale en haut (`overflow-x-auto`) | Le pire endroit pour un pouce. La barre basse d'Ankora est objectivement meilleure. **[V]**                                                 |
| Donut de répartition sur le tableau de bord             | Bon graphique, mauvais emplacement. Il descend dans l'onglet **Dépenses** ; l'accueil doit répondre à une question, pas en illustrer quatre |
| Simulateur « et si… » sur l'accueil                     | Reste sur son écran dédié — outil de décision mensuelle, pas de consultation quotidienne                                                    |
| `localStorage` seul, Tailwind par CDN                   | Régressions frontales sur la persistance et la CSP                                                                                          |
| Graphe de projection du fonds sur 12 mois               | Excellent, mais 12 mois glissants sur 390 px sont illisibles. Le porter sur l'écran **Provisions**, pas sur l'accueil                       |
| « Tous les 9 mois »                                     | §Q4                                                                                                                                         |

---

## 4. Plan de refonte révisé

**Total chemin critique : 24 jours** (audit : 29). **Premier jalon perceptible : J+8** (audit : J+15).
_Estimations en jours-développeur seul assisté d'agents, calibrées sur le rythme observé (233 commits en 3,5 mois)_ **[H]**.

### C1 — Socle propre · **4 j** · _aucun risque produit, débloque tout_

Fusion des étapes 0 et 5 de l'audit : ce sont deux chantiers de conciergerie, ils se font ensemble.

- Récolter `atoms/__tests__/Drawer.test.tsx` comme spec de la future primitive, puis supprimer `src/components/atoms/`, `/design-playground` et les 4 composants `ui/` à 0 usage.
- Fermer les 7 issues P0/P1 fantômes en les référençant.
- Mettre le README à jour (il décrit un état du monde faux depuis 2,5 mois).
- Appliquer les 10 valeurs de tokens du §3.6 + le test de contraste automatisé.

**Jalons** : `−5 112 lignes` · 35 → 28 issues · `tsc --noEmit` = 0 · `vitest run` = 1 699/1 699 · test de contraste vert.

### C2 — Le chiffre juste · **4 j** · ⭐ _premier jalon perceptible, J+8_

- ADR du vocabulaire (§3.1) + purge des 5 locales / 1 009 clés.
- Supprimer le défaut de 500 € ; `budgetVieCourante` et `capacite` disparaissent du domaine ; `AjusterResteAVivreDrawer.tsx` est supprimé.
- `calculerSituationDuMois` : ajout de `depensesDuMois`, `ilTeReste`, `epargneEstimee`.
- **Invariant du non-double-comptage** figé par un test dédié.
- Héros de l'accueil recâblé sur `ilTeReste` + ligne d'ancrage + barre + repère de rythme.

**Jalons** : `grep -ric "reste à vivre\|reste disponible\|vie courante\|capacité d'épargne" messages/` → **0** · un test prouve que saisir une dépense de 45 € fait descendre `ilTeReste` de 45 € · un test prouve qu'une échéance pointée ne peut pas être comptée deux fois.

> **À la fin de C2, tu ouvres l'app, tu saisis une dépense, et le grand chiffre bouge.** C'est le pari central de ce document, et il est testable au huitième jour.

### C3 — Saisie en 2 taps · **5 j** · _le cœur du quotidien_

- ⊕ central dans la barre (spec visuelle §Q7), enregistré dans `app-destinations.ts` avec `kind: 'action'`.
- Le Sheet de saisie (§3.4) — **écrit dès le départ comme la primitive**, pas comme un composant local : contrat du §3.5 respecté intégralement, API générique, tests portés depuis la récolte de C1.
- `category_id` réellement transmis (aujourd'hui `null` en dur, `ExpensesClient.tsx:73` **[V]**), puces des 5 catégories les plus utilisées, exclusion des catégories de charge.
- `useOptimistic` sur les dépenses — le patron existe déjà dans `ChargesClient` **[V]**, à trois fichiers de distance.
- Animation du héros au retour.

**Jalons** : une spec Playwright compte les taps depuis chacun des 5 onglets et échoue au-delà de 2 · la répartition par catégorie de l'écran Dépenses n'est plus vide.

### C4 — Généralisation de la primitive `<Sheet>` · **4 j**

Migrer les 5 drawers restants sur la primitive née en C3. `ChargeEditDrawer` et `ExpenseEditDrawer` gagnent au passage le piège de focus et le `safe-area` qui leur manquent **[V]**.

**Jalon** : le test qui échoue si un fichier réimplémente `Escape` ou le verrou de défilement. **−4 j vs l'audit**, parce que la primitive est extraite au lieu d'être décrétée.

### C5 — L'accueil passe de 7 sections à 3 blocs · **4 j**

- Ordre du §3.3, alertes conditionnelles, blocs 4+ sous la flottaison.
- Renommages de navigation.
- **Q5 option 3** : les 4 KPI de la fiche engagement (0,5 j inclus).

**Jalons** : capture Playwright en 390 × 844 prouvant que les 4 chiffres du glossaire sont visibles sans défiler, avec **et** sans bloc d'alerte · `CardTitle` rend un `<h3>` (préparé pour C6).

### C6 — Réarmer le filet e2e · **3 j** · _après C3 et C5, jamais avant_

Réécrire les 6 specs en quarantaine contre le cockpit réel. 3 des 6 échouaient à cause de `CardTitle` rendant un `<div>` au lieu d'un `<h*>` **[V]** — corrigé en C5.

**Jalon** : le bloc `quarantine` d'`e2e/authenticated-specs.json` est vide.

### C7 — Détachables · **2,5 j** · _à tout moment, hors chemin critique_

|                                                               |  Coût |
| ------------------------------------------------------------- | ----: |
| Cadences 1/2/3/4/6/12 + libellés « tous les N mois » (Q4)     | 0,5 j |
| Calculateur « Coût du crédit », optionnel et non branché (Q5) | 1,5 j |
| Taux d'endettement vs 33 % dans « Crédits & échéanciers »     | 0,5 j |

### Vue d'ensemble

```
J   0    4         8            13              17           21        24
    ├─C1─┼───C2────┼─────C3─────┼──────C4───────┼────C5──────┼───C6────┤
    socle  chiffre   2 taps       primitive      accueil       e2e
           juste ⭐                généralisée     3 blocs
                    ↑
              tu sens la différence
```

|                           | Audit |   Révisé |  Écart |
| ------------------------- | ----: | -------: | -----: |
| Chemin critique           |  29 j | **24 j** |   −5 j |
| Premier jalon perceptible |  J+15 |  **J+8** |   −7 j |
| Détachables               |   4 j |    2,5 j | −1,5 j |

**D'où viennent les 5 jours** : `<Sheet>` extrait au lieu d'être décrété (−4 j), fusion nettoyage + contrastes (−0,5 j), Q4 ramené de 4 j à 0,5 j et sorti du chemin critique (−0,5 j sur le total, −4 j sur les optionnels).

---

## 5. Ce qui reste à décider

Cinq choix, tous réversibles, aucun ne bloque C1 ni C2.

### R1 — Le repère de rythme sur la barre du héros

Le repère à `joursEcoules / joursDuMois` compare ton rythme de dépense à un rythme linéaire. Mais les dépenses ne sont pas linéaires (courses le samedi, plein en début de mois).

1. **Rythme linéaire simple** — lisible, un peu faux. _(défaut retenu)_
2. Rythme lissé sur tes 3 derniers mois — plus juste, mais inexpliquable en une ligne, et inutilisable les 3 premiers mois.
3. Pas de repère du tout — la barre montre seulement la proportion consommée.

### R2 — L'objectif de dépenses facultatif

La décision Q3 supprime l'enveloppe. Certaines personnes veulent quand même se fixer un plafond.

1. **Rien.** Le repère de rythme suffit. _(défaut retenu)_
2. Un « objectif de dépenses » **facultatif** (`null` par défaut, jamais inventé) qui, s'il est renseigné, remplace le repère de rythme. _(+0,5 j)_
3. Le déduire automatiquement de la moyenne de tes 3 derniers mois, sans le demander.

### R3 — Le sort de l'onglet « Dépenses » face au ⊕

Le ⊕ ouvre la saisie ; l'onglet Dépenses ne sert plus qu'à consulter l'historique. Est-ce assez pour un onglet sur cinq ?

1. **Le garder** — historique + répartition par catégorie + filtres. _(défaut retenu)_
2. Le fusionner dans « Mois » (les dépenses deviennent un bloc de l'accueil) et libérer le slot pour **Provisions**, qui n'a aujourd'hui aucune place de premier niveau.
3. Le remplacer par **Provisions** et déplacer l'historique dans « Plus ».

### R4 — Que fait le ⊕ en appui long ?

1. **Rien.** _(défaut retenu)_
2. Menu contextuel : _Dépense · Revenu exceptionnel · Facture ponctuelle_. _(+1 j)_
3. Raccourci vers la dernière dépense saisie, pour la dupliquer.

### R5 — Le calculateur de coût de crédit (C7) — quand ?

1. **Après C6**, quand tout le reste est stable. _(défaut retenu)_
2. Tout de suite après C2, parce que c'est la fonctionnalité que tu attends le plus.
3. Jamais — tu n'as pas rempli ces champs en plusieurs mois dans le prototype, on assume que c'est un faux besoin.

---

## Annexe — méthode et limites

**Ce que j'ai fait** : relecture intégrale de `AUDIT-ANKORA.md` · re-clone de `thierryvm/ankora` @ `36680f7` et lecture de `situation-mois.ts`, `effort-financier-lisse.ts`, `cockpit/types.ts`, des migrations `20260416000001`, `20260503000002`, `20260605000001`, `20260719000001` · comptage de la surface `payment_months` (26 fichiers source, 53 avec les tests) · lecture intégrale de `gestion-budget.html` incluant `FREQS`, `seedCharges`, `defaultState`, `amortissement`, `viewDashboard`, `viewCredits`, `viewPlans` · recalcul en Python des 15 ratios de contraste WCAG · 10 recherches et 6 fetches sur la concurrence · fabrication et **rendu réel en Chromium headless à 390 × 844 (DPR 2)** des trois maquettes.

**Ce que je n'ai pas pu faire** :

- **Aucune capture de l'app réelle.** Toujours pas de variables Supabase ; l'analyse d'Ankora reste statique, comme dans l'audit.
- **Je n'ai pas vu les apps concurrentes de mes yeux.** Tout ce qui est marqué **[V]** en §2 vient de leur documentation officielle ou d'un support éditeur, pas d'une session dans l'app. Emma en particulier : la fonction « true balance » est documentée, son emplacement exact à l'écran est une inférence **[H]**.
- **Les revenus de la maquette sont inventés** (2 600 €/mois). Les 19 charges, elles, sont tes vraies données : charges fixes mensuelles 1 334,21 € · engagements 470,00 € · provisions lissées 59,00 € — dont la somme redonne exactement l'effort lissé de 1 863,21 € établi par l'audit **[V]**.
- **Les chiffrages en jours sont des ordres de grandeur [H]**, pas des mesures. Le seul chiffrage que je qualifierais de solide est celui de Q4, parce qu'il repose sur un comptage de fichiers.

**Aucune modification, aucune branche, aucun commit, aucun push sur le dépôt Ankora.** Le clone a été fait dans un espace jetable.

---

### Sources

**Dépôt et fichiers locaux**

- [thierryvm/ankora](https://github.com/thierryvm/ankora) @ `36680f7`
- `AUDIT-ANKORA.md` (29/07/2026) · `gestion-budget.html` (1 386 lignes)

**Veille — chiffre-héros**

- [Copilot Money — Dashboard Tab Overview](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview) (avril 2026)
- [YNAB — The Plan Header](https://support.ynab.com/en_us/the-plan-header-BkmiuJ_C9) · [YNAB — What's New](https://www.ynab.com/whats-new?339368af_page=2)
- [Monarch — Using Flex Budgeting](https://help.monarch.com/hc/en-us/articles/32125337244052-Using-Flex-Budgeting) · [Monarch — Flex Budgeting: one number](https://www.monarch.com/blog/flex-budgeting-simplify-your-spending-with-just-one-number)
- [Bankin' — Prévision de solde en fin de mois](https://support.bankin.com/hc/fr/articles/32452208391953-Pr%C3%A9vision-de-solde-en-fin-de-mois)
- [Emma — Budgeting help](https://help.emma-app.com/en/category/budgeting-1s6usi4/)
- [Cofidis Belgique — applications de gestion de budget](https://www.cofidis.be/fr/blog-apps.html) (PiloteBudget, Bankin', Spendee…)

**Veille — vocabulaire français**

- [Econono — Reste à vivre 2026 : calcul officiel et pièges](https://econono.com/blog/calculer-reste-a-vivre-formule-officielle-vs-realite/)
- [CPAS Berchem-Sainte-Agathe — service de médiation de dettes](https://cpasberchem.brussels/actualite/a-quoi-sert-service-de-mediation-de-dettes/)
- [Tribunaux de Belgique — Le règlement collectif de dettes en 10 questions (PDF)](https://www.tribunaux-rechtbanken.be/sites/default/files/media/artt/brabant_wallon/documents/brochure/brochure_le_rcd_en_10_questions_mise_a_jour_09-2019_0.pdf)
- [Empruntis — meilleures applications de gestion de budget 2026](https://www.empruntis.com/rachat-credits/simulation-rachat-credits/reste-a-vivre/applications-gestion-budget/)

**Veille — cadences**

- [Actual Budget — Schedules (source docs)](https://github.com/actualbudget/actual/blob/master/packages/docs/docs/schedules.md)
- [Lunch Money — Recurring Items (source docs)](https://github.com/lunch-money/support/blob/master/finances/recurring-items.md)
- [PocketSmith — Repeating budgets](https://learn.pocketsmith.com/article/245-repeating-budgets-and-how-to-delete-or-make-changes-to-them) · [Budget forms](https://learn.pocketsmith.com/article/1456-budget-forms-for-creating-or-editing-budgets)
