# Architecture cible de l'application — refonte 2026

**Statut** : proposition, à valider par @thierry puis par `plan-reviewer` avant tout code.
**Base factuelle** : [`docs/audits/2026-08-08-inventaire-parcours-refonte.md`](../../audits/2026-08-08-inventaire-parcours-refonte.md).

Ce document ne décide que de l'**architecture** : quelles destinations existent, ce
qu'elles répondent, et où l'on modifie quoi. Le langage visuel est le sujet de la session
Fable 5, sur la page d'accueil, et l'application en héritera ensuite.

> **Convention de lecture.** Chaque affirmation est étiquetée : **MESURÉ** (relevé au
> navigateur ou lu dans le code aujourd'hui), **PROPOSÉ** (une décision de conception, donc
> discutable), **OUVERT** (une question que ce document ne tranche pas).

---

## 1. La question à laquelle l'application répond

> **Ta banque te montre ce qui s'est passé. Ankora te montre ce qui est déjà engagé.**

Tout ce qui suit en découle. Une fonctionnalité qui n'aide pas à répondre à « qu'est-ce qui
est déjà engagé, et que me reste-t-il vraiment ? » n'a pas sa place dans le chemin
principal.

**Deux intentions quotidiennes distinctes**, décrites par @thierry :

- **Capturer** — « je sors du magasin, j'ajoute ma dépense ». Rapide, une main, sans lire.
- **Consulter** — « j'en suis où ». Une réponse, immédiatement.

**PROPOSÉ.** Ces deux intentions ne partagent pas de chemin. La capture ne traverse pas le
cockpit ; la consultation ne traverse pas un formulaire.

---

## 2. Les destinations : sept aujourd'hui, quatre demain

**MESURÉ — l'état actuel** : `/app`, `/app/charges`, `/app/expenses`, `/app/simulator`,
`/app/commitments`, `/app/accounts`, `/app/settings`.

| Aujourd'hui        | Demain                       | Motif                                             |
| ------------------ | ---------------------------- | ------------------------------------------------- |
| `/app`             | **`/app`** — le cockpit      | C'est le produit                                  |
| `/app/charges`     | **`/app/charges`** — élargie | Garde son URL (cf. §5.1)                          |
| `/app/commitments` | ↳ fusionnée dedans, redirige | Même nature : de l'argent déjà engagé             |
| `/app/expenses`    | **`/app/expenses`**          | Geste quotidien distinct, à préserver             |
| `/app/settings`    | **`/app/settings`**          | Compte, RGPD, sécurité — hors chemin financier    |
| `/app/accounts`    | **supprimée**                | Ses cinq valeurs s'affichent déjà dans le cockpit |
| `/app/simulator`   | **supprimée** (tiroir gardé) | Une logique, deux coquilles                       |

Plus deux surfaces qui ne sont **pas** des destinations : la feuille de capture ⊕ et le
tiroir de simulation. Elles s'ouvrent par-dessus, ne changent pas d'URL, et ne prennent pas
de place dans la barre d'onglets.

### 2.1 Pourquoi `/app/simulator` disparaît

**MESURÉ.** `SimulatorClient.tsx` fait 461 lignes et porte tout le calcul.
`simulator/page.tsx` en fait 38 : une coquille de route. `SimulatorDrawer.tsx` en fait 211
et **importe le même `SimulatorClient`**, qui accepte déjà un `hideHeader` pour distinguer
les deux contextes.

Ce n'est donc pas une duplication de logique — c'est **une logique et deux portes**. Le
coût de la route n'est pas le code mort, il est ailleurs : elle occupe une place dans la
navigation, et un simulateur n'est pas un lieu où l'on va. C'est une question qu'on pose à
une situation, donc un tiroir qui s'ouvre par-dessus la situation.

**PROPOSÉ.** Supprimer `page.tsx`, déplacer `SimulatorClient.tsx` hors du dossier de route
(vers `src/components/simulator/`), mettre à jour trois imports. Le tiroir reste, atteignable
depuis le cockpit.

**Conséquence à traiter** : `/app/simulator` doit répondre en redirection permanente vers
`/app`, pas en 404 — l'URL a pu être mise en favori.

### 2.2 Pourquoi `/app/accounts` disparaît

**MESURÉ.** La page fait 1 898 px de haut (2,86 écrans), porte **cinq actions
d'enregistrement distinctes**, et deux de ses champs partagent le même nom accessible,
`« Montant (€) »`. Ses cinq valeurs — revenu mensuel, virement vers Vie Courante, et trois
soldes — **s'affichent déjà dans le cockpit** ; seule leur modification vit ailleurs.

**MESURÉ.** Changer son revenu coûte 4 gestes, pour une valeur lisible sur le premier écran.

**PROPOSÉ.** Chaque valeur s'édite là où elle s'affiche, dans le cockpit. La page disparaît,
et avec elle ses cinq boutons : une valeur se corrige sur place, et l'enregistrement suit la
saisie.

C'est la troisième règle de conception du projet, à verrouiller dans `CLAUDE.md` au même
titre que les deux existantes :

> **On modifie là où on lit.** Un chiffre affiché s'édite depuis l'endroit où il s'affiche.
> Elle complète « tout total s'ouvre sur sa décomposition » et « toute action d'un clic se
> défait d'un clic ».

### 2.3 Pourquoi charges et engagements fusionnent — et ce qui ne fusionne PAS

Une charge et un plan d'apurement sont **de même nature** : de l'argent déjà engagé qui
sortira, que la banque ne montre pas. Les séparer en deux destinations oblige l'utilisateur
à savoir dans quelle catégorie ranger « mon crédit voiture » avant de pouvoir le retrouver —
un tri que quelqu'un de peu habitué ne sait pas faire.

Mais leur **arithmétique diffère**, et cette différence porte la seule information qui rende
une dette intéressante :

|                    | Charge                   | Engagement              |
| ------------------ | ------------------------ | ----------------------- |
| Durée              | perpétuelle              | **finie**               |
| Total connaissable | non                      | **oui** (restant dû)    |
| Information clé    | quand tombe la prochaine | **quand ça se termine** |

**PROPOSÉ.** Une seule destination, deux groupes nommés à l'intérieur, chacun avec son
arithmétique visible. On fusionne la **présentation**, jamais le modèle.

**OUVERT — et délibérément non tranché ici.** Faut-il un jour fusionner les deux notions
dans le schéma ? Cette question reste un ADR ouvert, que la refonte doit **alimenter en
preuves** : si, une fois les deux groupes réunis sur un écran, la distinction continue de
perdre les gens, on saura quelle notion changer et pourquoi, avec un écran réel à montrer.
Une migration décidée aujourd'hui le serait sur une hypothèse.

---

## 3. Le cockpit : le pli est le budget de conception

**MESURÉ.** L'écran utile d'un iPhone 14 fait **664 px**, pas 844. L'en-tête de page en
consomme ~230 (logo, « Mon espace », titre du mois) et la barre d'onglets 48. Il reste
**~386 px** — à peu près une carte — pour répondre à la question du jour.

**MESURÉ.** Aujourd'hui, aucune des huit sections ne tient entièrement au-dessus du pli, et
il faut environ six écrans de défilement pour lire son mois.

### 3.1 Une seule réponse au-dessus du pli

**MESURÉ.** La première carte porte aujourd'hui **deux montants de périmètres différents,
tous deux en grand** : un reste-à-vivre du quotidien (« il te reste ») et un manque sur les
provisions (« il manque … rattrapage suggéré »). Un utilisateur peu habitué lit _il me
reste_ **et** _il me manque_ dans le même bloc, sans hiérarchie.

Deux grands nombres ne font pas une réponse : ils font une question.

**PROPOSÉ.** Le pli porte exactement trois choses, et rien d'autre :

1. **Un état**, en mots avant d'être en couleur — _ça passe_ / _c'est juste_ / _ça ne passe
   pas_. La couleur double le mot, elle ne le remplace jamais (daltonisme, contraste).
2. **Un seul montant dominant** : ce qui est réellement libre une fois tout ce qui est
   engagé retiré. C'est la fin de la cascade, pas une de ses étapes.
3. **Une ligne de contexte** qui dit ce qui reste à venir ce mois-ci.

Le montant s'ouvre sur sa décomposition — règle déjà verrouillée du projet, et ici elle
n'est pas une option : **c'est ce qui remplace les six écrans**.

### 3.2 La cascade est l'explication, pas la réponse

Le hero « cashflow waterfall » du NORTH_STAR (jamais construit) trouve ici sa place exacte :
**juste sous le pli**, comme justification du chiffre unique affiché au-dessus.

Revenus → charges fixes → provisions → engagements → **ce qui reste**.

C'est la forme qui matérialise la thèse du produit : on voit l'argent se faire réserver
avant d'arriver. Une banque ne peut pas dessiner ça, faute de connaître l'avenir.

### 3.3 Ce que le cockpit ne doit PAS emprunter aux applications bancaires

@thierry a demandé « des graphiques comme Revolut, Belfius ». **Écarté, et il a suivi.**

Ce sont des applications _bancaires_ : leurs graphiques sont **rétrospectifs par
construction** — camembert par catégorie, barres du mois, comparaison au mois dernier — parce
qu'une banque ne connaît que les transactions déjà passées. Les copier ferait d'Ankora un
Belfius moins bon, faute du flux de transactions : la rétrospective serait tapée à la main et
incomplète.

**PROPOSÉ.** On leur emprunte le **métier** — qualité de rendu, lisibilité à 390 px,
animation qui explique au lieu de décorer, chiffres tabulaires — et jamais le **sujet**. Les
graphiques d'Ankora regardent devant.

Contrainte : **SVG écrit à la main, aucune bibliothèque de graphiques** (budget 0 €).

---

## 4. Les deux gestes, après

**MESURÉ — aujourd'hui** (ouverture de la PWA comprise) :

| Intention             | Gestes | Détail                                   |
| --------------------- | ------ | ---------------------------------------- |
| Capturer une dépense  | **2**  | la PWA ouvre sur la vitrine, puis ⊕      |
| Consulter             | 1      | mais **six écrans de défilement**        |
| Modifier ses rentrées | **4**  | vitrine → tiroir → Comptes → enregistrer |

**PROPOSÉ — après** :

| Intention             | Gestes | Ce qui change                                           |
| --------------------- | ------ | ------------------------------------------------------- |
| Capturer une dépense  | **1**  | raccourci de manifeste : l'icône mène droit à la saisie |
| Consulter             | **1**  | la réponse tient au-dessus du pli                       |
| Modifier ses rentrées | **2**  | ouvrir, corriger sur place                              |

### 4.1 Le premier clic à supprimer

**MESURÉ.** `src/app/manifest.ts` déclare `start_url: '/'` et **aucun `shortcuts`**. La page
d'accueil n'a **aucun garde de session** : un utilisateur connecté qui demande `/` y reste,
sur la page marketing.

**CORRECTION du 8 août 2026, sur vérification.** Une première rédaction de cette section
proposait un tableau `shortcuts` dans le manifeste « appui long sur l'icône, iOS et Android ».
**C'est faux pour iOS** : Safari ne supporte pas les raccourcis de manifeste, ni le menu
contextuel d'une web app installée, et cela reste vrai en 2026. @thierry étant sur iPhone, ce
raccourci ne lui aurait rien apporté — l'affirmation avait été écrite sans être vérifiée.

**PROPOSÉ**, dans l'ordre décroissant de valeur réelle :

1. **`start_url: '/app'`** — la seule mesure qui marche sur **iOS et Android**, et la plus
   simple. L'icône installée mène au cockpit, plus à la vitrine. Elle supprime à elle seule le
   geste superflu sur les deux intentions quotidiennes.
   Un visiteur non connecté est alors renvoyé vers `/login` par les gardes existants, ce qui
   est le comportement attendu d'une application installée.
2. **Un garde de session sur `/`** — pour qui arrive par le web plutôt que par l'icône.
3. **Un tableau `shortcuts`** — **bonus Android uniquement**, à documenter comme tel. Il exige
   par ailleurs qu'une URL puisse ouvrir la feuille de saisie, ce qui n'existe pas aujourd'hui
   (cf. ci-dessous).

**MESURÉ — et ça dissout l'objection qui bloquait le point 2.** Le commentaire de
`redirectIfSignedIn()` explique que le garde n'a pas été posé sur la landing pour éviter un
aller-retour réseau sur la page au budget Lighthouse le plus serré. Or `MktNav` **appelle déjà**
`getOptionalUser()` (`MktNav.tsx:36`), et `src/lib/supabase/server.ts` ne mémoïse rien : il n'y
a aucun `cache()`. Mémoïser la lecture par requête rend donc le garde **gratuit** — il réutilise
l'appel que la landing paie déjà.

**MESURÉ — la feuille de saisie n'a aucune URL.** Elle est pilotée par un `useState` dans
`BottomTabBar.tsx` (`isAddExpenseOpen`, ligne 147). Lui donner une URL est un préalable au
point 3, et la forme retenue doit rester un paramètre de recherche sur `/app` — surtout pas une
route dédiée, qui ferait de la capture une destination et contredirait le §2.

---

## 5. Les trois questions ouvertes, tranchées

@thierry a délégué ces arbitrages le 8 août 2026 : « je n'ai pas vraiment de réponses, je te
laisse challenger et décider ». Voici les décisions et ce qui les fonde.

### 5.1 Le nom de la destination fusionnée

**MESURÉ — le vocabulaire actuel est déjà incohérent**, et c'est lui qui tranche :

| Surface                  | Mot employé                                          |
| ------------------------ | ---------------------------------------------------- |
| Onglet de `/app/charges` | **« Factures »**                                     |
| Titre de la même page    | **« Mes charges »**                                  |
| Page `/app/commitments`  | « Crédits, échéanciers et **factures ponctuelles** » |
| Page `/app/expenses`     | « Les **sorties** hors charges récurrentes »         |

Trois mots pour deux notions, et « factures » désigne déjà **les deux côtés** de la frontière
qu'on veut supprimer. Deux candidats tombent d'eux-mêmes :

- **« Sorties »** est éliminé : le produit l'a déjà réservé aux dépenses. Le reprendre ici
  créerait la collision qu'on cherche à défaire.
- **« À payer »** est éliminé : la destination montre aussi ce qui est **déjà payé** ce
  mois-ci, avec sa date. L'étiquette mentirait sur la moitié de son contenu.

**MESURÉ** : les boutons de la barre d'onglets font 78 × 48 px, et les libellés actuels
tiennent en 7 à 8 caractères (`Cockpit`, `Factures`, `Dépenses`). **NON MESURÉ** : qu'un
libellé de 11 caractères comme « Engagements » y tienne sans se couper. C'est un risque, pas
un fait — mais c'est une raison de plus de préférer un mot déjà éprouvé à cet endroit.

**DÉCIDÉ.**

| Élément          | Valeur                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| Libellé d'onglet | **« Factures »** — inchangé, donc zéro réapprentissage                                |
| Titre de la page | **« Mes factures et crédits »**                                                       |
| Sous-titre       | Ce qui partira de ton compte, régulier ou à échéances — avec la date de chaque sortie |
| Groupe 1         | **« Sans date de fin »**                                                              |
| Groupe 2         | **« Avec une date de fin »** — avec l'échéance en cours et le restant dû              |

Le raisonnement tient en une phrase : **l'étiquette reste simple, le titre enseigne.**
« Factures » est le mot que les gens emploient, y compris de travers pour un crédit ; le titre
de page rétablit la précision au premier contact, ce qui est exactement la règle qu'on s'est
donnée pour une cible peu habituée.

Et les noms de groupes disent la **vraie** différence — celle de l'arithmétique — sans employer
un seul mot de jargon. C'est aussi ce qui rend visible la seule information qui compte sur une
dette : sa fin.

**Et l'URL suit la même logique : `/app/charges` ne bouge pas.** Inventer `/app/engagements`
coûterait une redirection de plus, casserait les favoris, et introduirait un quatrième mot dans
un vocabulaire qui en compte déjà trois de trop. C'est `/app/commitments` qui redirige vers
elle, une seule fois, définitivement.

> **Conséquence** : ce nommage doit être confronté à celui que retiendra la session Fable 5 sur
> la page d'accueil. Deux surfaces d'un même produit ne peuvent pas nommer différemment la même
> chose.

### 5.2 Les trois soldes saisis à la main

**MESURÉ.** `public.accounts` porte déjà `updated_at timestamptz not null default now()`, avec
un trigger `accounts_touch` qui le met à jour à chaque écriture
(`20260417000004_three_accounts_model.sql`). **La date existe déjà : aucune migration.**

**DÉCIDÉ.** Les trois soldes rejoignent la section « Mes comptes » du cockpit — là où ils
s'affichent déjà — et s'éditent sur place. Chaque ligne porte **la date de sa dernière
saisie** : « saisi le 3 août ».

Le motif n'est pas esthétique. La page actuelle le dit elle-même : « les soldes sont saisis à
la main : Ankora ne les met pas à jour tout seul ». Un nombre que l'application ne peut pas
vérifier, affiché sans date, est un nombre auquel on croit sans raison. La règle du projet le
dit déjà pour les échéances de dette :

> l'affichage porte la date de l'action, jamais un simple état : **une date se vérifie, une
> coche se croit.**

Elle s'applique ici mot pour mot. Un solde de trois mois se signale alors tout seul.

La **forme** (une carte de trois lignes, ou trois lignes dans une carte) dépend du langage
visuel et reste ouverte — mais elle ne bloque rien : la décision porte sur _quoi_ afficher.

### 5.3 L'ADR de fusion des notions dans le schéma

**DÉCIDÉ : il reste ouvert — mais avec un déclencheur écrit**, parce qu'un ADR sans
déclencheur n'est pas une décision différée, c'est une décision oubliée.

**Le déclencheur.** Après la livraison du chantier 5, @thierry utilise l'écran fusionné
pendant **un mois complet** — assez pour qu'y tombent au moins une charge récurrente et une
échéance de crédit. Une seule question tranche ensuite :

> Les deux groupes t'ont-ils **aidé à trouver** quelque chose, ou as-tu dû **réfléchir au
> groupe** avant de chercher ?

- « Ils m'ont aidé » → la séparation du modèle est justifiée. **L'ADR se ferme en “aucun
  changement”**, et on cesse d'y penser.
- « J'ai dû réfléchir » → les notions fusionnent, dans une session dédiée, avec migration et
  revue — jamais dans une PR d'interface.

C'est le seul protocole qui produit une décision fondée : aujourd'hui, la question ne peut être
tranchée que par intuition, et une migration décidée par intuition est le plus mauvais achat
possible pour ce projet.

### 5.4 Ce qui reste hors périmètre

- **HORS PÉRIMÈTRE** — le langage visuel. Il vient de la session Fable 5 et descend ensuite
  dans l'application.

---

## 6. Découpage proposé

Chaque étape est une PR autonome de moins de 600 lignes, dans cet ordre.

| #   | Chantier                                                                 | Dépend de      |
| --- | ------------------------------------------------------------------------ | -------------- |
| 1   | Point d'entrée : garde de session sur `/` + `shortcuts` du manifeste     | —              |
| 2   | Simulateur : suppression de la route, redirection, déplacement du client | —              |
| 3   | Étiquettes accessibles de `/app/accounts` (dette a11y, avant fusion)     | —              |
| 4   | Édition sur place dans le cockpit, puis suppression de `/app/accounts`   | 3              |
| 5   | Fusion charges + engagements en une destination, deux groupes            | —              |
| 6   | Pli du cockpit : état, montant unique, décomposition                     | langage visuel |
| 7   | Cascade sous le pli                                                      | 6              |

Les chantiers 1 à 3 ne dépendent d'aucune décision visuelle : ils peuvent démarrer
immédiatement, pendant que la session Fable 5 travaille.
