# Le modèle source du produit

> **Ce qu'est ce document.** Ankora est la réécriture d'un modèle tableur que son auteur
> tient et fait tourner tous les mois depuis des années. Ce modèle est **antérieur** au
> code et lui sert de référence : quand un chiffre de l'application paraît faux, c'est
> presque toujours qu'il répond à une question que le modèle source pose autrement.
>
> Ce document transcrit le modèle — ses définitions, ses formules, ses règles d'usage —
> **sans aucune donnée réelle**. Les montants qui l'illustrent sont inventés. Ce dépôt est
> public ; la doctrine du `CLAUDE.md` §« Ce dépôt est PUBLIC » interdit d'y porter les
> finances d'une personne identifiable, l'emplacement du document d'origine, ou le nom des
> organismes avec lesquels elle traite.
>
> Rédigé le 5 août 2026, après lecture intégrale du modèle (7 pages, 6 tables).

---

## 1. Trois comptes, trois rôles disjoints

Le modèle ne raisonne pas en « total de mes avoirs ». Il raisonne en **enveloppes**, et
chaque compte a un seul métier :

| Compte           | Reçoit                                        | Paie                                            |
| ---------------- | --------------------------------------------- | ----------------------------------------------- |
| **Principal**    | toutes les rentrées                           | les charges du mois, les échéances d'engagement |
| **Épargne**      | la provision de lissage, plus l'épargne libre | les factures non mensuelles, par reversement    |
| **Vie courante** | le reste à vivre, viré en début de mois       | les dépenses variables du quotidien             |

C'est la même partition que `AccountKind` (`principal` / `epargne` / `vie_courante`). Elle
n'est pas cosmétique : **elle est la raison pour laquelle un total agrégé n'a aucun sens
ici.** Additionner les trois soldes répond à une question que personne ne se pose.

---

## 2. Les quatre postes, et l'ordre dans lequel ils se soustraient

| Poste | Nom dans le modèle source      | Contenu                                               |
| ----- | ------------------------------ | ----------------------------------------------------- |
| ①     | Charges mensuelles récurrentes | les factures qui tombent tous les mois                |
| ②     | Mensualités d'engagements      | dettes, plans de paiement, crédits                    |
| ③     | Provision de lissage           | les charges non mensuelles ramenées au mois           |
| ④     | Dépenses de vie courante       | variables du quotidien — ni montant fixe, ni échéance |

Et les lignes qui s'en déduisent :

```
Budget mensuel total à prévoir  = ① + ② + ③
Reste à vivre réel              = rentrées − (① + ② + ③)
Reste à vivre encore disponible = reste à vivre réel − ④
Solde après charges du mois     = solde principal − ①        (avant ② et ③)
```

**Le poste ④ est délibérément hors de ①②③.** Le modèle l'écrit noir sur blanc : ces
dépenses n'ont ni montant fixe ni échéance, donc « le reste à vivre est un budget de
départ, et la ligne suivante indique ce qu'il en reste réellement pour finir le mois ».
C'est exactement la distinction que porte [ADR-035](../adr/ADR-035-vocabulaire-des-quatre-chiffres.md)
entre **Budget du mois** et **Il te reste**.

> **Correspondance mesurée avec le code.** « Reste à vivre réel » du modèle source et
> `resteDisponible` du domaine sont **le même nombre, à la même formule** — revenus moins
> charges fixes, moins provisions lissées, moins engagements mensuels. Le modèle et le code
> ne divergent pas sur le budget ; ils divergent sur ce qui vient après (§4).

---

## 3. Le lissage : un flux théorique et un stock réel, qui ne sont pas le même nombre

C'est la source de confusion la plus coûteuse du produit, et elle mérite d'être dite en une
phrase : **il y a ce qu'il faudrait avoir mis de côté, et il y a ce qu'on a réellement mis
de côté. Ce sont deux nombres différents, tous deux justes.**

### Le flux — poste ③

Chaque charge non mensuelle est ramenée au mois : `montant ÷ cycleEnMois`. La somme de ces
parts est le poste ③, c'est-à-dire **le virement minimum à faire vers l'épargne ce mois-ci**.

C'est ce que calcule `monthlyProvisionTotal()`. Le code et le modèle source concordent.

### Le stock — la provision de lissage disponible

Le modèle source tient un **journal de mouvements**. Chaque virement vers l'épargne y est
ventilé en deux parts :

| Colonne                | Ce que c'est                                   |
| ---------------------- | ---------------------------------------------- |
| **Part lissage**       | ce qui est réservé aux factures non mensuelles |
| **Part épargne libre** | le supplément qu'on a choisi de mettre de côté |

avec l'invariant : `part lissage + part épargne libre = montant du mouvement`. Le modèle
affiche une colonne de contrôle qui vire à ⚠️ dès que l'égalité est rompue.

De ce journal découlent trois soldes, tous des **sommes cumulées**, jamais des formules
sur les charges :

```
solde du compte              = solde initial + Σ versements − Σ retraits
provision de lissage dispo.  = Σ parts lissage (solde initial inclus) − Σ retraits
épargne libre                = solde du compte − provision de lissage disponible
```

Un sens de mouvement supplémentaire, **Solde initial**, déclare l'état d'un compte avant le
premier mouvement enregistré : il entre dans le solde mais ne compte pas comme un versement
du mois. **Une seule ligne de ce type par compte** — une deuxième fausse tous les soldes.

Un **Retrait** s'enregistre quand une facture non mensuelle tombe et qu'on reprend l'argent
sur l'épargne. La provision disponible redescend alors d'elle-même.

### Pourquoi le code ne sait pas produire le stock

**Ankora n'a pas de journal de mouvements** — c'est l'objet de
[ADR-038](../adr/ADR-038-journal-des-mouvements.md), accepté et non implémenté. Sans
journal, l'application ne peut proposer qu'une approximation du stock : la **cible
théorique** d'[ADR-011](../adr/ADR-011-detection-deficit-plan-rattrapage.md),

```
cibleThéorique(charge) = montant − (montant ÷ cycleMois) × moisRestantsAvantÉchéance
```

c'est-à-dire _ce qui devrait déjà être de côté si le plan avait été suivi à la lettre depuis
le début_. C'est un nombre utile, mais il **ne répond pas** à « combien de mon épargne
puis-je dépenser ». Il y répond seulement si l'on suppose que le plan a été suivi
exactement — supposition que rien ne vérifie.

> **Conséquence de conception, à ne pas perdre.** Tout libellé du type « au-delà de la
> cible » porte une hypothèse implicite (« la provision égale la cible »). Tant qu'ADR-038
> n'est pas livré, cette hypothèse doit être **écrite à l'écran**, pas laissée au lecteur.

---

## 4. Le virement vers la vie courante n'est pas le même objet dans les deux modèles

|        | Modèle source                                                          | Ankora                                          |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| Nature | **calculé** : `reste à vivre réel − part épargne libre versée ce mois` | **saisi** : un montant fixe, configuré une fois |

Le modèle source explique pourquoi il ne déduit que la part _libre_ : « la part lissage est
déjà sortie du budget plus haut, dans le poste ③ ; seule l'épargne volontaire est une
dépense en plus du plan ». **Déduire le virement total serait un double comptage du
lissage.**

Ankora, elle, prend un montant fixe. Ce n'est pas une erreur — c'est ce que fait réellement
son auteur, qui vire une somme ronde. Mais cela signifie que le montant fixe et le montant
calculé **divergent chaque mois**, et que l'application ne le signale pas.

---

## 5. Les engagements : le total prime sur la multiplication

Le modèle stocke le **montant total** de l'engagement, pas seulement la mensualité. Et il
avertit explicitement que le produit `mensualité × nombre d'échéances` **ne retombe pas
dessus** : la dernière échéance est un solde, plus petit que les autres.

```
restant dû = montant total − (mensualité × échéances payées)
dernière échéance = montant total − mensualité × (échéances totales − 1)
```

Exemple neutre : un plan de 2 400 € en 11 échéances de 220 € donne 10 × 220 + 200 = 2 400 €.
La onzième vaut 200 €, pas 220 €.

Le domaine d'Ankora sait le faire — `installmentAmountAt` existe et calcule exactement ce
solde. **Elle n'a aucun appelant en production**, donc le cockpit soustraira la mensualité
pleine le mois de la dernière échéance, et se trompera de l'écart, sans le moindre signal.

---

## 6. Les cinq règles d'usage — ce sont des règles de produit

Le mode d'emploi du modèle source liste cinq erreurs à ne pas commettre. Quatre d'entre
elles sont, en réalité, des contraintes de conception pour Ankora.

1. **Ne jamais saisir un chiffre à la main sur le tableau de bord.** « Tout y est calculé :
   si un montant semble faux, c'est la donnée source qu'il faut corriger. »
   → Un tableau de bord qui expose un champ de saisie enseigne le contraire. Le solde de
   compte saisi à la main est, aujourd'hui, exactement cette faute.

2. **Ne jamais oublier de ventiler un versement.** L'invariant `lissage + libre = montant`
   est surveillé par une colonne de contrôle visible.
   → Un invariant qu'on n'affiche pas est un invariant qu'on ne tient pas.

3. **Une seule ligne « Solde initial » par compte.**
   → Contrainte d'unicité à porter en base, pas dans l'interface.

4. **Ne pas confondre le total viré vers l'épargne et l'épargne volontaire.** Seule la part
   libre réduit ce qu'il reste à virer vers la vie courante (§4).

5. **Rien ne se supprime : on décoche, on modifie, ou on ajoute un retrait.**
   → C'est mot pour mot la règle 11 du `CLAUDE.md`, et c'est ce qui rend un historique
   auditable.

À quoi s'ajoute, sur l'action à un clic qui fait avancer un compteur de dette : « Cliqué par
erreur ? Ne supprime rien : remets le bon nombre à la main. Tout se recalcule dans l'autre
sens. » **L'annulation fait partie de l'action**, elle n'est pas un rattrapage.

---

## 7. Ce que le modèle source a et qu'Ankora n'a pas

| Capacité                                  | Modèle source       | Ankora                                 | Suite                                               |
| ----------------------------------------- | ------------------- | -------------------------------------- | --------------------------------------------------- |
| Journal de mouvements entre comptes       | oui                 | **non**                                | [ADR-038](../adr/ADR-038-journal-des-mouvements.md) |
| Ventilation lissage / épargne libre       | oui                 | **non**                                | ADR-038                                             |
| Provision réellement disponible (stock)   | oui                 | **non** — seulement la cible théorique | ADR-038, §3                                         |
| Solde de compte dérivé plutôt que saisi   | oui                 | **non**                                | ADR-038 D6                                          |
| Écart « versé − dû » du mois              | oui                 | **non**                                | ADR-038                                             |
| Dernière échéance de dette au bon montant | oui                 | code présent, **jamais appelé**        | §5                                                  |
| Décomposition d'un total en ses lignes    | oui                 | partiellement                          | règle 10 du `CLAUDE.md`                             |
| Date de dernière saisie d'un solde        | sans objet (dérivé) | colonne présente, **jamais lue**       | ADR-038 D6                                          |

Ce tableau est la file d'attente réelle du cockpit. Il se lit dans un sens : **presque tout
ce qui manque manque pour la même raison — l'application connaît le plan, pas les faits.**

---

## 8. Comment se servir de ce document

- Avant d'affirmer qu'un chiffre du cockpit est faux, **vérifier ici à quelle question il
  répond**. Trois des trois écarts signalés le 5 août 2026 étaient arithmétiquement exacts
  et sémantiquement mal nommés.
- Avant de nommer un nouveau montant à l'écran, **reprendre le nom du modèle source** s'il
  en a un. Le vocabulaire est déjà stabilisé par l'usage, sur des années.
- Si le modèle source évolue, **ce document est mis à jour avant le code**. Un écart entre
  les deux se résout en faveur du modèle, jamais en faveur de ce qui est déjà écrit.
