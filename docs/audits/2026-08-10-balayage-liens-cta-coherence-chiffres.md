# Balayage de tous les liens et CTA, et cohérence des chiffres entre écrans

**10 août 2026.** Second volet du parcours de bout en bout
([premier volet](2026-08-10-parcours-bout-en-bout-vie-complete.md)), sur le même profil semé
et la même base Supabase locale éphémère. WebKit, iPhone 14 (390 × 664).

Deux questions, posées par @thierry :

1. « Vérifier tous les CTA, liens sur toutes les pages, footer compris, menu principal,
   secondaire, admin. »
2. « Un chiffre doit pouvoir être démontré, prouvé d'où il vient et à quoi il sert. »

La première est mécanique. La seconde ne l'est pas : elle ne demande pas si l'application
affiche des nombres justes — elle l'est — mais si **le même mot désigne la même chose d'un
écran à l'autre**. C'est là qu'est le défaut de ce rapport.

---

## 0. Méthode, et le garde-fou qu'elle porte

Balayage de **17 pages** — 9 publiques hors session, 8 connectées dont `/admin` — en
relevant pour chaque `<a>`, `<button>`, `[role=button]` et `[role=link]` : nom accessible
calculé (`aria-label` → `aria-labelledby` → texte → `alt` → `title` → `<title>` SVG),
`href`, `target`, `rel`, état désactivé, visibilité calculée et **géométrie réelle**
(`getBoundingClientRect`). Puis requête HTTP sur chaque destination interne distincte,
redirections suivies.

**Garde-fou d'instrument** : une page qui rend zéro action fait échouer la sonde plutôt que
compter zéro. Une suite qui trouve « rien à signaler » parce qu'elle regarde ailleurs est
pire qu'une suite absente — c'est la leçon du premier volet, appliquée avant d'avoir été
payée une seconde fois.

Les cinq soldes de `/app/accounts` sont lus par `element.value`, jamais par `innerText` :
un `<input>` n'expose pas sa valeur au texte. Ce point avait déjà coûté un faux rapport le
31 juillet.

---

## 1. La navigation tient — et c'est mesuré, pas supposé

| Mesure                                  | Valeur  |
| --------------------------------------- | ------- |
| Pages balayées                          | 17      |
| Actions relevées                        | **510** |
| Destinations internes distinctes        | 34      |
| **Destinations cassées (4xx/5xx)**      | **0**   |
| Liens `<a>` sans `href`                 | 0       |
| Actions visibles sans nom accessible    | 0       |
| `target="_blank"` sans `rel="noopener"` | 0       |

Les 20 fiches du glossaire répondent toutes, les six pages légales aussi, les huit routes
applicatives aussi. `/login` et `/signup` redirigent vers `/app` quand la session existe —
comportement attendu.

**Zéro action anonyme sur 510.** Chaque bouton d'icône porte son intitulé complet
(« Marquer _Charges immeuble_ comme payée », « Annuler la dernière échéance payée pour… »),
y compris les 4 × 19 boutons de la liste des factures. C'est rare et ça mérite d'être dit :
la plupart des interfaces perdent leurs noms accessibles exactement là, dans les listes
générées.

---

## 2. ⛔ « Reste à payer » désigne deux choses, et le cockpit montre la mauvaise

Le défaut central de ce rapport. Trois emplacements, deux valeurs, un seul libellé
quasi identique :

| Écran            | Position | Libellé affiché           | Montant        |
| ---------------- | -------- | ------------------------- | -------------- |
| `/app/charges`   | y = 824  | « Reste à payer ce mois » | **1 369,21 €** |
| `/app/charges`   | y = 2588 | « Reste à payer »         | **969,21 €**   |
| `/app` (cockpit) | carte    | « Reste à payer »         | **969,21 €**   |

Les deux blocs de `/app/charges` sont **visibles sur la même page**, 1 764 px d'écart.

**Ce que chaque nombre calcule**, lu dans le code plutôt que déduit de l'arithmétique :

- [`ChargesClient.tsx:700-706`](../../src/app/[locale]/app/charges/ChargesClient.tsx) —
  `remainingThisMonth` additionne les **factures impayées du mois** _et_ les **échéances
  d'engagement impayées**. Clé i18n `remainingLabel` → « Reste à payer ce mois ».
- [`ChargesClient.tsx:1122-1128`](../../src/app/[locale]/app/charges/ChargesClient.tsx) —
  `groupRemaining` est le sous-total **du groupe de fréquence** affiché. Clé
  `groupRemainingLabel` → « Reste à payer ». Les 969,21 € sont ceux du groupe **Mensuel**.
- La carte du cockpit lit une troisième clé, `app.dashboard.…remainingLabel`, dont
  l'indice publié dit « Factures du mois encore à payer » : **les engagements en sont
  exclus**.

**Piège d'analyse, et je suis tombé dedans.** L'écart vaut exactement 400 €, soit le total
des engagements — j'en ai conclu « l'un les inclut, l'autre non ». C'est faux : le second
nombre est un sous-total de groupe. L'égalité n'est vraie **qu'en août**, où seules les
charges mensuelles échoient. En octobre, la S.W.D.E trimestrielle rejoint le mois et les
deux nombres cesseront de différer de 400 € — sans que rien ne change au code. Une
coïncidence de calendrier qui ressemble à une règle est la pire forme de fausse piste :
elle se vérifie.

**Pourquoi c'est grave.** Le cockpit est l'écran où l'on décide. Il annonce **969,21 € à
payer** alors qu'il reste **1 369,21 €** à sortir du compte ce mois-ci. L'écart — 400 € —
n'est pas une nuance de présentation : c'est deux échéances d'engagement, qui partiront
bel et bien. Un utilisateur qui se fie au cockpit sous-estime sa sortie de **29 %**.

Et le second volet du défaut est linguistique : sur `/app/charges`, distinguer le total de
la page du sous-total d'un groupe repose entièrement sur les deux mots « ce mois ». Deux
mots pour 400 €.

---

## 3. Les cibles tactiles, avec l'exception que la norme prévoit

49 relevés sous 24 × 24 px, seuil du critère **WCAG 2.2 AA 2.5.8 (Target Size Minimum)**.
Mais 2.5.8 porte une exception explicite pour les liens **en ligne dans une phrase**, dont
la hauteur est contrainte par l'interligne du texte porteur. L'appliquer honnêtement divise
la liste en deux.

**Exemptés — liens en ligne dans un texte** (aucune action requise) :

- `/signup` — « CGU » (27 × 15) et « politique de confidentialité » (150 × 15), dans la
  phrase de la case à cocher
- `/legal/privacy` — « politique cookies » (130 × 20), « thierryvm@gmail.com » (169 × 20)
- Bandeau de consentement — « la politique cookies » (127 × 17), dans sa phrase

**Non exemptés — contrôles autonomes, sur leur propre ligne** (défaut réel) :

| Emplacement                 | Contrôle                             | Mesure       |
| --------------------------- | ------------------------------------ | ------------ |
| `/login`                    | « Mot de passe oublié ? »            | 308 × **20** |
| `/login`                    | « Créer un compte »                  | 112 × **17** |
| `/forgot-password`          | « ← Retour à la connexion »          | 160 × **17** |
| Pied de page (toutes pages) | « Modifier mes préférences cookies » | 226 × **20** |
| Tiroir « Plus » (app)       | « Modifier mes préférences cookies » | 226 × **20** |

Ces cinq-là sont les chemins de récupération du tunnel d'authentification et le retrait du
consentement — exactement les gestes qu'on fait une fois, sous contrainte, et souvent mal.
Les élargir est un `py-2` sur cinq éléments.

**Ce qui est déjà bon** : les 76 boutons d'action de la liste des factures font tous
**44 × 44**, le tiroir de l'app **358 × 44**, la barre d'onglets **78 × 48**. Le soin est
là où le volume est ; il manque là où le geste est rare.

---

## 4. Deux pieds de page, deux vocabulaires pour les mêmes pages

| Page                             | Ce que le pied de page affiche                   |
| -------------------------------- | ------------------------------------------------ |
| `/` (vitrine)                    | Conditions · Confidentialité · Cookies · Contact |
| `/faq`, `/glossaire`, `/legal/*` | CGU · Confidentialité · Politique cookies · FAQ  |

Mêmes destinations (`/legal/cgu`, `/legal/cookies`), **noms différents** : « Conditions »
ici, « CGU » là ; « Cookies » ici, « Politique cookies » là. Et « Contact » n'existe que
sur la vitrine, « FAQ » que sur les autres.

Ce n'est pas une faute de rendu, c'est **deux composants de pied de page** entretenus
séparément. Le coût n'est pas esthétique : un utilisateur qui cherche les conditions
générales apprend un mot sur une page et ne le retrouve pas sur la suivante.

Même famille, côté en-tête : **la vitrine est la seule page publique qui ne montre pas
« Se connecter »**. Les 15 actions visibles de `/` n'en contiennent aucune ; l'entrée
existe, mais derrière le bouton « Menu » (vérifié en ouvrant le tiroir : « Produit,
Simulateur, FAQ, **Se connecter**, Créer un compte », 287 × 36 chacun). `/faq`,
`/glossaire` et les trois pages légales, elles, l'exposent directement dans l'en-tête
(113 × 36).

La page qui reçoit le plus de visiteurs est donc celle qui cache le plus la connexion.

---

## 5. Ce qui tient, et qu'il faut dire

**La règle « un chiffre qu'on ne peut pas ouvrir est une injonction » est réellement
appliquée**, et vérifiée au centime :

| Total affiché              | Décomposition offerte                                         | Vérification           |
| -------------------------- | ------------------------------------------------------------- | ---------------------- |
| Charges fixes − 1 804,21 € | les 14 lignes, chacune avec son montant                       | somme = 1 804,21 ✅    |
| Lissage − 59 €             | 15 € (« 45 € tous les 3 mois »), 25 €, 4,58 €, 10 €, 4,42 €   | somme = 59,00 ✅       |
| Engagements − 400 €        | 220 € + 180 €                                                 | somme = 400 ✅         |
| Effort lissé 2 263,21 €    | « charges mensuelles + provisions lissées + mensualités »     | 1 804,21 + 59 + 400 ✅ |
| À payer ce mois 2 204,21 € | « ce qui quitte réellement le compte, factures et échéances » | 1 804,21 + 400 ✅      |

La ligne du lissage est le meilleur exemple : elle n'affiche pas « 15 € » mais
« 15 € — 45 € tous les 3 mois ». Le chiffre porte **sa provenance et sa périodicité**,
donc il se vérifie de tête.

Et dans les deux sens, comme la règle l'exige : « À virer vers l'épargne **59 €** — 59 € à
mettre de côté − 0 € de factures ce mois ».

**L'application détecte elle-même le doublon que le profil semé lui a tendu.**
« Impôt » existe en facture (220 €) et « SPF Impôt — plan d'apurement » en engagement
(220 €). Sur `/app/charges`, l'app affiche spontanément : « Une obligation semble saisie
deux fois — « Impôt » (facture) et « SPF Impôt — plan d'apurement » (engagement) portent le
même montant de 220 € ». Elle ne double-compte pas, **et elle le dit**. C'est mieux que
correct : c'est explicable.

**La projection d'épargne est en vraies `<table>` HTML** — 0 SVG de taille graphique, 11
tableaux sur le cockpit. Les 17 montants de la trajectoire sont donc lisibles au lecteur
d'écran et sélectionnables. Un choix qui coûte à l'écriture et rapporte à l'usage.

**Les cinq champs de `/app/accounts`** portent chacun une étiquette explicite — « Solde
actuel de Compte Principal » = `1240`, « Solde actuel de Vie Courante » = `385.5`. La page
est un formulaire d'édition, pas un écran de lecture ; les totaux vivent au cockpit.

---

## 6. Le bruit de console, et pourquoi deux tiers n'en sont pas

Le balayage relève **201 erreurs de console** sur 17 pages. Trois familles, trois verdicts
différents — et deux d'entre elles auraient fait un faux rapport.

**a) « Refused to apply a stylesheet » (CSP `style-src`) — délibéré, pas un défaut.**
[`globals.css:14`](../../src/app/globals.css) le dit noir sur blanc : « Toast styling
served as a `'self'` stylesheet instead of relying on the runtime `<style>` that sonner
injects ». La feuille refusée est **redondante** ; le style des toasts est déjà servi par la
feuille compilée. Preuve de rendu à l'appui : `document.styleSheets` contient bien la
feuille applicative (110 règles), `body` calcule `rgb(248, 250, 252)` en fond et `Inter` en
police, `<main>` fait 390 px. Rien n'est cassé. Le reste du volume vient de l'injection de
styles du serveur de développement.

**b) `TypeError: Type error` sur `/app/settings/deletion-status` — outillage de dev.**
La pile tombe dans `flushComponentPerformance` de
`node_modules_next_dist_compiled_react-server-dom-turbopack` : c'est l'instrumentation de
performance RSC du mode développement, pas du code applicatif.

**c) Divergence d'hydratation sur TOUTES les pages — réel, et à corriger.**
Le message complet nomme l'attribut :

```text
<script
+   nonce="bVluWXNGZEM4eUdlcngyLXFic3Ja"     ← ce que React attend
-   nonce=""                                  ← ce que porte le DOM
>
```

Le navigateur **vide** l'attribut `nonce` une fois l'élément inséré, par conception (le
nonce ne doit pas être lisible par un script tiers). React compare donc sa valeur au vide et
signale une divergence sur chaque `<script>` porteur d'un nonce — ici `ThemeBootScript` et
le JSON-LD `ld-software`. Fonctionnellement inoffensif : les scripts ont déjà été validés à
l'analyse.

Le coût n'est pas là. Il est qu'une **vraie** divergence d'hydratation, le jour où elle
arrivera, sera indiscernable de ce bruit permanent. Le remède documenté est
`suppressHydrationWarning` sur ces deux éléments — ce que `<html>` porte déjà, mais qui ne
descend pas aux enfants.

---

## 7. L'espace admin

`/admin` répond 200, est correctement gardé (`ANKORA_ADMIN_USER_IDS`, promotion locale
nécessaire pour ce balayage), et est atteignable depuis le tiroir « Plus » (358 × 44).

Son contenu tient en une ligne : **« Zone admin · réservée fondateur. Panel V1 livré dans
une PR ultérieure. »** — H1 « Admin », 77 caractères dans `<main>`, aucun tableau.

Ce n'est pas un défaut : la page annonce elle-même son état. C'est en revanche l'écart le
plus large entre le `CLAUDE.md` — qui déclare le panneau admin obligatoire, avec santé
technique, santé produit, acquisition et recommandations — et ce qui existe.

---

## 8. Mes fautes d'instrument, dans CE balayage

Quatre constats ⛔ produits par ma sonde, aucun par l'application. Consignés parce qu'ils
se rejoueront :

1. **L'espace fine insécable.** Ma comparaison cherchait `2 500` avec une espace ordinaire ;
   le formatage français produit **U+202F**. Trois montants pourtant affichés — 2 500 €,
   1 240 €, 2 150 € — ont été annoncés introuvables. Même famille que la faute au format à
   deux décimales du premier volet : je normalisais ` ` mais pas ` `.
2. **`innerText` sur un formulaire, de nouveau.** `/app/accounts` a été relevée à « 0
   montant » alors qu'elle en porte cinq, dans des `<input type=number>`. Cette faute est
   documentée depuis le 31 juillet ; je l'ai refaite.
3. **La correspondance par sous-chaîne.** Chercher `63,21` a « trouvé » le reste dans
   `2 263,21 €`. Un montant se compare bornes comprises, jamais par inclusion.
4. **La coïncidence arithmétique prise pour une règle** (§2). L'écart de 400 € entre les
   deux « Reste à payer » se vérifiait parfaitement — et n'expliquait rien. Il a fallu
   lire le code pour voir que le second nombre était un sous-total de groupe.

Le rapport aurait annoncé quatre bugs inexistants et manqué la vraie nature du seul qui
compte.

---

## 9. Suites, par gravité

| #   | Constat                                                        | Gravité                   | Suite                                                              |
| --- | -------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| 1   | Le cockpit annonce 969,21 € là où 1 369,21 € sortiront (§2)    | **fausse une décision**   | Décision de conception : que compte « reste à payer » au cockpit ? |
| 2   | « Reste à payer » = total de page ET sous-total de groupe (§2) | trompe l'utilisateur      | Renommer le sous-total (« Reste dans ce groupe »)                  |
| 3   | Cinq contrôles autonomes sous 24 px (§3)                       | WCAG 2.2 AA · 2.5.8       | PR ciblée, ~5 lignes                                               |
| 4   | Deux pieds de page divergents (§4)                             | cohérence                 | Unifier en un composant, un vocabulaire                            |
| 5   | La vitrine cache « Se connecter » derrière le burger (§4)      | conversion                | Arbitrage @thierry : est-ce délibéré ?                             |
| 6   | Divergence d'hydratation permanente sur le `nonce` (§6c)       | masque les vraies erreurs | `suppressHydrationWarning` sur les deux `<script>`                 |
| —   | ~~CSP qui refuse une feuille de style~~                        | **retiré**                | Délibéré et documenté ; le style est servi autrement (§6a)         |
| —   | ~~`TypeError` sur deletion-status~~                            | **retiré**                | Instrumentation de dev de Next, pas du code applicatif (§6b)       |
| —   | ~~`/app/accounts` n'affiche aucun montant~~                    | **retiré**                | Faute d'instrument : les valeurs sont dans des `<input>` (§8.2)    |
