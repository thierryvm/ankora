# Inventaire des parcours — mesuré, 8 août 2026

Base de la refonte 2026. **Tout ce qui suit est mesuré** sur la pile locale semée
avec le profil de test canonique (19 charges, un plan d'apurement, 3 dépenses du
mois), navigateur Chromium en émulation iPhone 14, `fr-BE`.

Sondes : [`scripts/dev/mesure-parcours-refonte.mjs`](../../scripts/dev/mesure-parcours-refonte.mjs),
[`scripts/dev/inspect-nav.mjs`](../../scripts/dev/inspect-nav.mjs),
[`scripts/dev/inspect-comptes.mjs`](../../scripts/dev/inspect-comptes.mjs).

Deux précautions apprises en route, gravées dans les sondes :

- **Chaque exécution porte son propre `x-forwarded-for`.** `rateLimit('auth')`
  autorise 5 connexions par 15 min et par IP ; relancer une sonde trois fois
  pour vérifier sa stabilité épuise le quota, et l'échec se lit « la connexion
  est cassée » alors qu'il dit « tu as trop essayé ».
- **Les noms accessibles sont relevés au DOM, jamais devinés.** Une première
  version cherchait un champ « revenu » sur `/app/accounts` ; il s'appelle
  `« Montant (€) »`. Un `getByRole` posé à côté ne rend pas un résultat vide,
  il rend un faux positif de défaut.

## Le viewport réel est 390 × 664, pas 390 × 844

844 est la hauteur **physique** de l'écran d'un iPhone 14. Ce qu'il reste au
document une fois la barre de Safari posée est **664 px**, et c'est contre ce
chiffre que tout ce qui suit est mesuré. Les specs et les audits qui parlent de
« 390 × 844 » se donnent 27 % de hauteur qu'aucun utilisateur n'a jamais eue.

## 1. La PWA n'ouvre pas sur le cockpit

`src/app/manifest.ts` déclare `start_url: '/'` et **aucun `shortcuts`**.
`src/app/[locale]/(public)/page.tsx` n'a **aucun garde de session** — vérifié.

**Mesuré** : un utilisateur connecté qui demande `/` reste sur `/`, titre `h1`
« Ton ancrage financier. ». Aucune redirection vers `/app`.

|                          |                 |
| ------------------------ | --------------- |
| URL demandée             | `/`             |
| URL finale               | `/` (inchangée) |
| Redirige vers le cockpit | **non**         |

Conséquence : **un geste supplémentaire à chaque ouverture**, sur les deux
intentions quotidiennes. C'est le premier clic à supprimer, et il ne coûte
qu'un garde de session plus un `shortcuts` dans le manifeste.

## 2. Le cockpit demande environ six écrans de défilement

| Mesure                 | Valeur                           |
| ---------------------- | -------------------------------- |
| Hauteur du document    | **3 792 à 4 150 px** (8 relevés) |
| Hauteur de l'écran     | 664 px                           |
| Écrans à faire défiler | **5,7 à 6,3**                    |
| Débordement horizontal | aucun ✅                         |

**Une fourchette, pas un chiffre, et c'est délibéré.** Huit exécutions de la même
sonde sur le même profil rendent des hauteurs différentes : le nombre de factures
tombant dans les fenêtres 7/14/30 jours dépend du jour, et le cockpit n'affiche
que les cinq dernières dépenses. Annoncer « 4 506 px » — la valeur du premier
relevé — donnerait un chiffre que personne ne peut refaire. La conclusion, elle,
ne bouge pas : **il faut six écrans pour lire son mois.**

La sonde attend désormais que la hauteur du document cesse de varier avant de
mesurer (`hauteurStabilisee`). Elle se stabilise en ~1 s dans tous les relevés.

> **Une piste écartée, notée pour qu'on ne la rouvre pas.** Un relevé isolé a
> montré `--consent-height: 358px` et un `padding-bottom` de même valeur
> persistant sur `body`. Six relevés ultérieurs, cette fois avec le contrôle
> « la bannière est-elle encore affichée ? », rendent tous `false` et aucune
> réserve. L'observation est **non reproduite** et il lui manquait ce contrôle :
> une réserve non nulle est correcte tant que la bannière est à l'écran. Aucun
> défaut n'est établi ici. Le contrôle reste dans la sonde.

Position des huit sections sur un relevé représentatif — l'ordre et les états ne
varient pas d'un relevé à l'autre, seules les hauteurs de fin de page bougent :

| Section                        | haut → bas  | état        |
| ------------------------------ | ----------- | ----------- |
| En-tête du cockpit (hero)      | 185 → 924   | **coupée**  |
| Santé des provisions           | 956 → 1290  | sous le pli |
| Mes engagements                | 1306 → 1544 | sous le pli |
| Prochaines factures            | 1576 → 2309 | sous le pli |
| ↳ « Ce mois-ci — 19 factures » | 1875 → 2228 | sous le pli |
| Mes comptes                    | 2341 → 2815 | sous le pli |
| Plan du mois                   | 2847 → 3177 | sous le pli |
| Dépenses du mois               | 3209 → 3707 | sous le pli |

**Aucune section n'est entièrement visible sans défiler.** Le hero seul réclame
739 px pour un écran qui en offre 664.

Et le pli utile est plus court encore : l'en-tête de page consomme ~230 px avant
le premier chiffre (logo, « Mon espace », titre du mois), et la barre d'onglets
occupe les 48 px du bas. Il reste **environ 386 px** pour répondre à « j'en suis
où » — soit à peu près une carte.

### Ce que la première carte dit, et pourquoi c'est ambigu

Elle porte **deux montants de périmètres différents**, tous deux en grand :

- un reste-à-vivre du quotidien, présenté comme « il te reste »
- un manque sur les provisions, présenté comme « il manque … rattrapage suggéré »

Un utilisateur peu habitué lit « il me reste » **et** « il me manque » dans la
même carte, sans hiérarchie disant lequel répond à _est-ce que mon mois passe ?_
La cascade qui réconcilierait les deux (revenus → charges → provisions →
reste-à-vivre) **commence sous le pli**, en partie masquée par la barre
d'onglets.

## 3. Les trois gestes, comptés

Taps réellement exécutés par la sonde, depuis le cockpit :

| Intention                  | Taps depuis `/app`                        | + ouverture PWA | Total réel     |
| -------------------------- | ----------------------------------------- | --------------- | -------------- |
| Capturer une dépense       | **1** (⊕ → champ Montant prêt)            | +1              | **2**          |
| Consulter « j'en suis où » | 0 tap, mais **défilement obligatoire**    | +1              | 1 + défilement |
| Modifier les rentrées      | **2** (Plus → Comptes) + 1 enregistrement | +1              | **4**          |

Le ⊕ est bon : **un seul tap** ouvre la feuille avec le champ Montant prêt. C'est
la meilleure chose de l'app aujourd'hui, et la refonte ne doit pas y toucher —
sinon pour la rendre atteignable sans ouvrir l'app (raccourci de manifeste).

## 4. `/app/accounts` — trois défauts mesurés

| Mesure                              | Valeur   |
| ----------------------------------- | -------- |
| Hauteur du document                 | 1 898 px |
| Écrans de défilement                | **2,86** |
| Actions d'enregistrement distinctes | **5**    |

**a. Deux champs portent le même nom accessible.** Les deux cartes du haut
exposent chacune un `input` nommé `« Montant (€) »`. Un lecteur d'écran annonce
deux fois la même chose sans moyen de les distinguer ; le titre de carte
(« Revenu mensuel net », « Virement mensuel vers Vie Courante ») n'est pas relié
au champ.

Le motif correct existe déjà sur la même page — les trois soldes s'appellent
`« Solde actuel de <compte> »`. Il n'a simplement pas été appliqué en haut.

**b. Cinq enregistrements pour un rituel mensuel unique.** Deux « Enregistrer »
et trois « Mettre à jour », chacun sur sa carte, chacun son aller-retour serveur.

**c. Le champ des rentrées vit ici, il s'affiche dans le cockpit.** C'est le grief
d'origine de @thierry, et c'est la troisième règle de conception à verrouiller :
**on modifie là où on lit.**

## 5. Deux défauts du semeur, trouvés en chemin et corrigés ici

**`scripts/dev/seed-profil-test.mjs` insérait `spent_at`** ; la colonne
s'appelle `occurred_on`. Le semis échouait **sur les dépenses seules**, et le
faisait **en silence** : un `console.error` là où les insertions de charges et
d'engagements font un `throw`. Le script imprimait donc son résumé de succès et
rendait un profil sans aucune dépense — la carte « Dépensé ce mois » restait
vide sans que rien ne l'explique.

Corrigé dans les deux dimensions : la bonne colonne, et un `throw` qui aligne
les dépenses sur le reste du fichier. **Vérifié dans les deux sens** — le semis
rend maintenant ses trois dépenses, et en renommant la colonne dans la base
locale le script s'arrête sur `seed dépenses: …` sans jamais atteindre son
résumé. Colonne restaurée après falsification.

**Ce même script portait un revenu mensuel réel en clair**, annoté comme étant
celui de @thierry. Le dépôt est public : ce n'est pas un secret technique, mais
c'est une donnée financière nominative, et la règle du dépôt public la vise
explicitement. Remplacé par une valeur ronde, délibérément fictive — aucun total
de contrôle du fichier n'en dépendait.

## Ce que cet inventaire décide

1. **Supprimer le premier clic** : garde de session sur `/` + `shortcuts` dans le
   manifeste. Coût faible, gain sur 100 % des ouvertures.
2. **Le pli est le budget de conception du cockpit** : ~386 px pour répondre
   « est-ce que mon mois passe ». Une seule réponse, une seule échelle, un seul
   état. Le reste se mérite au défilement.
3. **Un seul montant dominant.** Deux périmètres en gros caractères dans la même
   carte produisent une question, pas une réponse.
4. **`/app/accounts` fusionne dans le cockpit** pour ce qui s'y affiche déjà, et
   ses cinq enregistrements deviennent une édition sur place.
