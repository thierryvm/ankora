# ADR-039 — Portée des tokens « papier » de la landing (`.mkt-paper`)

- **Statut** : **Accepted le 2026-08-23**, et le GO a **inversé la réponse Q1** — cf. l'addendum daté plus bas. La portée `.mkt-paper` est supprimée : ses six pigments sont devenus les valeurs claires de `@theme`, en production depuis la PR #442.
  > Le statut est resté `Proposed` du 8 au 23 août **délibérément**, alors même que
  > la relecture cockpit était rendue (✅ APPROUVÉ, cf. §Relecture cockpit) et
  > l'implémentation mergée en PR L1. Raison écrite à l'époque : un merge de PR
  > technique ne vaut pas ratification — @thierry mergeait pour le code, pas pour le
  > statut, et faire porter à ce geste une décision qu'il n'avait pas prise serait
  > fabriquer un consentement. La bascule devait être « un commit d'une ligne, le
  > jour où il le dit ».
  >
  > **Il l'a dit le 23 août**, et l'attente s'est révélée justifiée au-delà de la
  > forme : sa réponse n'était pas le oui attendu à Q1, c'était son contraire. Une
  > bascule automatique au merge de PR L1 aurait enregistré `Accepted` sur une
  > décision qui allait être renversée.
- **Date** : 2026-08-08
- **Proposé par** : @cc-fable (session landing, worktree dédié) — suite au choix de direction visuelle « Le relevé corrigé » par @thierry le 8 août 2026
- **Deciders** : @thierry (direction visuelle actée) ; mécanisme de portée soumis à relecture croisée
- **Tags** : `design-system`, `tokens`, `landing`, `theming`
- **Cooldown** : décision banned-list n°2 respectée — cette session (N) écrit l'ADR et le plan ; l'implémentation attend la session N+1, après relecture du présent document du point de vue de l'application

> Contexte produit : la refonte de la page d'accueil suit la direction « Le relevé
> corrigé » — éditorial papier/encre, Fraunces display, teal + laiton conservés.
> Galerie des trois directions comparées (maquettes 390 px, ratios mesurés) :
> artefact Claude « Ankora — Trois directions pour la page d'accueil » du 8 août 2026.

---

## Contexte & problème

La direction retenue demande un fond **papier** (#FAF9F6) et une encre bleutée
(#171D26) sur la landing publique, sans toucher au cockpit. Or :

1. `src/app/globals.css` ne connaît aujourd'hui que trois motifs de portée :
   `@theme` (l. 69), `[data-theme='dark']` (l. 207) et `[data-accent='admin']`
   (l. 256). Introduire une portée **par surface** (marketing vs produit) est un
   motif nouveau dans la fondation partagée — d'où cet ADR.
2. `globals.css:469` peint `body { background: var(--color-background) }` en
   règle non-layered. Un wrapper qui remappe la variable pour ses descendants ne
   change **pas** la résolution faite par `body` : le viewport, l'overscroll iOS
   et le `min-height:100svh` resteraient ardoise sous un contenu crème.
3. Cinq surfaces `fixed` vivent HORS de tout wrapper de page :
   `ConsentBannerSlot`, `Toaster`, `BottomTabBarSlot`, `UpdateBannerSlot`
   (`src/app/[locale]/layout.tsx:229-235`) et `ScrollToTopSlot`
   (`src/app/[locale]/(public)/layout.tsx:16`). La bannière de consentement
   recouvre le hero de **tout nouveau visiteur** (cf.
   `e2e/consent-first-visit.spec.ts`).
4. Le layout racine n'est **pas** re-rendu à la navigation client
   (`layout.tsx:158-169`) : toute décision de route calculée serveur y serait
   gelée. Poser un attribut « surface » depuis le layout est donc exclu.

## Décision

### Mécanisme : classe de portée + compagnon `body:has()`

Même grammaire que `[data-accent='admin']` : un bloc de remap de variables,
hors `@layer`, dans `globals.css`.

1. **Nouveaux tokens bruts** dans `@theme` (documentés, testables, réutilisables) :
   `--color-paper: #faf9f6`, `--color-paper-line: #e7e4dc`,
   `--color-ink: #171d26`, `--color-ink-soft: #3d4a5c`,
   `--color-paper-soft: #fbfaf7`, `--color-paper-muted: #f3f1ea` — aucune
   valeur du remap n'est un hex anonyme : chaque cible est un token nommé.
2. **Portée `.mkt-paper`**, posée sur le wrapper racine de la landing dans
   `(public)/page.tsx` (qui enveloppe MktNav + main + MktFooter — les trois sont
   rendus par la page, donc re-rendus à chaque navigation ; la décision de
   route est prise au bon endroit, contrairement à un layout). Le bloc remappe,
   **en thème clair uniquement** (`html:not([data-theme='dark'])`) :
   - `--color-background` → `--color-paper`
   - `--color-border` → `--color-paper-line`
   - `--color-foreground` → `--color-ink`
   - `--color-muted-foreground` → `--color-ink-soft`
   - `--color-surface-soft` → `--color-paper-soft` et `--color-surface-muted` →
     `--color-paper-muted` (les gris froids actuels jureraient sur papier chaud)
   - **Conservés tels quels** : `--color-card` (blanc), `--color-muted`
     (décoratif, hors AA par convention), `--color-brand-*`, `--color-accent-*`,
     `--color-brand-surface*`, `--color-accent-surface*` (les teintes teal/laiton
     lisent bien sur papier — capture exigée aux gates d'implémentation), tokens
     sémantiques (`success/warning/danger/info` — jamais alignés sur un accent).
3. **Compagnon** `html:not([data-theme='dark']) body:has(.mkt-paper)` : redéclare
   les **mêmes** variables au niveau `body`. Conséquences mécaniques :
   - `body { background: var(--color-background) }` résout alors le papier —
     viewport et overscroll compris — sans toucher à la règle de `globals.css:469` ;
   - les cinq slots `fixed`, descendants de `body`, héritent des variables
     remappées : la bannière de consentement rend sa carte blanche avec bordure
     papier et encre — cohérente par-dessus le hero. Capture 390×664 avec
     bannière affichée exigée aux gates.
4. **Thème sombre : aucun remap.** La landing garde le navy existant — pas de
   « papier nuit » (une seconde palette non demandée serait du scope creep).
   L'identité papier est claire-première ; la version nuit reste celle des
   tokens sombres actuels, déjà couverts par `contrast-ratios.test.ts`.

### Dégradation navigateur

`:has()` : Chrome 105+, Safari 15.4+, Firefox 121+. La baseline projet
(Chrome 111+ / Safari 16.2+ / Firefox 113+, cf. skill design system §1) laisse
Firefox 113–120 sans compagnon : le contenu de page rend papier (la portée
`.mkt-paper` peint son propre `background`), `body` et les slots `fixed`
restent ardoise/tokens froids. **Raisonnement accepté, non mesuré** : les slots
restent alors sur le jeu ardoise complet, cohérent en interne, donc aucune
paire ne devrait descendre sous AA — mais `playwright.config.ts:38-82` ne
contient aucun projet Firefox, cette branche n'est donc vérifiée par aucune CI.
Non bloquant — Firefox 121 date de décembre 2023.

### Ce que cet ADR ne décide PAS (relecture demandée à la session cockpit)

La relecture cockpit porte sur **deux** questions, pas une :

1. **La symétrie** : l'application garde-t-elle `:root` nu, ou reçoit-elle sa
   propre portée (`.app-surface` ?) pour rendre l'asymétrie explicite ? Le
   présent ADR n'ajoute **aucun** mécanisme côté `/app` et laisse `:root`
   inchangé.
2. **Le sort de `body > main`** (cf. §Conséquences, premier point) : la parade
   proposée n'édite pas la règle partagée, mais c'est une règle de la fondation
   commune aux deux surfaces — la session cockpit valide qu'aucun de ses
   parcours n'en dépend autrement.

C'est l'objet du cooldown : l'implémentation n'ouvre pas avant cette relecture.

## Relecture cockpit — 2026-08-08, ✅ APPROUVÉ (2 conditions, 3 ajouts)

Rendue par la session cockpit (@cc-ankora / Opus), postée sur la PR #334.
Consignée ici parce qu'un commentaire de PR mergée n'est lu par personne.

**Q1 — Symétrie : NON, pas de `.app-surface`.** `:root` **est** l'identité du
produit ; `.mkt-paper` en est un **écart**, pas un pair. Rendre les deux
explicites suggérerait qu'ils sont de même rang. Et une portée qui ne remappe
rien deviendrait « l'endroit où l'on met les surcharges de l'app », ce qui est le
travail de `:root` — en payant au passage le risque de mise en page que le
§Conséquences documente lui-même.

**Q2 — `body > main` : le cockpit en dépend, la parade est juste.** Mesuré :
`[locale]/layout.tsx` ne rend **aucun élément DOM** autour de `{children}`
(uniquement des providers et les cinq slots `fixed` en frères) et
`app/layout.tsx` retourne un fragment. Donc `<main>` **est** enfant direct de
`<body>` côté cockpit, et `body { display:flex; min-height:100svh }` +
`body > main { flex:1 1 auto }` est **ce qui tient le pied de page en bas** sur
une page d'app courte. La parade n'édite pas la règle → **impact nul sur le
cockpit**. Approuvée telle quelle.

**Condition 1** — l'asymétrie est nommée dans `globals.css`, à côté du bloc de
portée. _(Faite en L1.)_

**Condition 2** — un commentaire au-dessus de `body > main` nomme ses **deux**
consommateurs : l'app qui en dépend, la landing qui la contournera. Le danger
n'est pas le changement, c'est l'unification que quelqu'un tentera en voyant deux
mécanismes de flex. _(Faite en L1 ; la règle elle-même n'est pas modifiée.)_

**Ajout 1 — les deux chiffres ne sont pas le même calcul.** Le choix d'une phrase
descriptive (« Encore vraiment à toi ») plutôt qu'un nom de métrique évite la
collision au lieu de la gérer — c'est plus juste que ce que la relecture
demandait. Mais il faut l'écrire, sinon quelqu'un « alignera » les deux et
cassera l'un : la landing montre `solde relevé en banque − engagements datés`
(objet pédagogique), le cockpit montre `revenus − charges − provisions −
engagements` (un mois réel). **Ils s'accordent sur la thèse, pas sur la formule.**
C'est volontaire.

**Ajout 2 — `blockAfter()` est un helper partagé**, son durcissement exige la
preuve **dans les deux sens** : que les blocs historiques matchent toujours les
mêmes cibles après le strip. _(Fait en L1 : un témoin par bloc, plus une
falsification mesurée montrant que l'ancienne implémentation perd le bloc sombre
dès qu'une règle est insérée avant lui.)_

**Ajout 3 — Firefox 113-120 : rendre l'angle mort visible là où on le
rencontre**, c'est-à-dire en commentaire dans `globals.css`, pas seulement dans
un ADR que le prochain lecteur n'ouvrira pas. _(Fait en L1, avec la formulation
plus actionnable : les trois projets Playwright — Chromium desktop, mobile
Safari, mobile Chrome — supportent tous `:has()`, donc **chemin compagnon 3/3,
chemin de repli 0/3**.)_

## Amendement du 2026-08-08 (PR L1) — les six bruts vont dans `:root`, pas `@theme`

Le §Décision point 1 prescrivait `@theme`. **L'implémentation les déclare dans un
`:root` nu.** Le motif, et il rend l'ADR plus fidèle à lui-même :

Une clé `--color-*` dans `@theme` fait générer par Tailwind toute une famille
d'utilitaires (fond, texte, bordure, anneau, séparateur, contour, curseur,
étapes de dégradé, remplissage, tracé). Autrement dit, elle **met à portée de
chaque composant un second vocabulaire de couleurs** — précisément l'alternative
que le §Alternatives écartées rejette (« divergence garantie »). Déclarés hors
`@theme`, aucune clé de thème n'existe : le mauvais chemin est fermé **par
construction**, pas par une règle de revue qu'on peut contourner.

Effet de bord favorable, **raisonné et non mesuré** : documenter ces noms dans un
tableau Markdown ne peut plus créer la classe qu'il interdit — le scanner de
sources de Tailwind lit aussi les fichiers de doc.

**Une hypothèse écartée, parce qu'elle a été mesurée et qu'elle est fausse.** La
relecture du plan avançait un second motif : Tailwind v4 n'émettrait que les
variables `@theme` réellement utilisées, donc les six auraient risqué d'être
élaguées — rendant `var(--color-paper)` invalide et la landing sans fond. **Ce
n'est pas le comportement de ce projet.** Mesuré sur le CSS compilé après
`npm run build` (fichier unique `.next/static/chunks/*.css`, 107 684 octets) :
`--color-success-300` et `--color-accent-100` sont déclarés dans `@theme`,
consommés par **aucun** utilitaire, et **présents** dans la sortie. Instrument
validé par un témoin positif (`--color-brand-500`, lui consommé).

L'amendement ne repose donc **que** sur le motif vérifiable ci-dessus. C'est écrit
ici pour que personne ne rouvre le sujet en croyant qu'un risque d'élagage
justifiait quoi que ce soit.

**Ce que la même mesure confirme, côté positif** : les six pigments arrivent dans
le CSS compilé, **une déclaration chacun** ; les deux blocs de portée y sont ;
et **aucun utilitaire de couleur** n'est généré pour ces noms.

**Ce que ça coûte**, pour que l'amendement ne dise pas que les bénéfices : les
six sont émis sur toutes les pages et dans les deux thèmes, `/app` compris
(~200 octets inertes). Accepté.

Conséquence sur les tests : les six ne se lisent pas par bloc (`globals.css` a
déjà un autre `:root`) mais par regex fichier-entier, avec l'assertion **déclaré
exactement une fois** — plus forte, puisqu'elle épingle l'unicité et pas
seulement l'adresse. Elle s'**enclenche** avec l'assertion « aucun token papier
dans le bloc sombre » : sans cette dernière, un déplacement (et non une
duplication) vers le bloc sombre resterait vert.

## Décisions de vocabulaire liées (ADR-035)

1. **La carte hero n'emploie aucun des quatre noms réservés du cockpit.** Son
   chiffre (solde relevé en banque − engagements datés à venir) n'est pas
   « Il te reste » (`resteDisponible − depensesDuMois`) ni aucun des trois
   autres. Libellé retenu : **« Encore vraiment à toi »**, sous-texte « une fois
   l'assurance et la taxe comptées » — une phrase descriptive, pas un nom de
   métrique. La passe de réconciliation vocabulaire landing ↔ cockpit ↔
   glossaire se fait après les PR landing (propriétaire : @thierry + session
   cockpit, cf. arbitrage du 8 août).
2. **Anti-PSD2 dès la première ligne de la carte** : « Le solde que tu lis à ta
   banque », sous-texte « recopié par toi — Ankora ne se connecte à aucune
   banque ». La réassurance ne vit pas seulement au pied du hero.

## Alternatives écartées

| Option                                                                       | Pourquoi non                                                                                                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attribut posé par le layout racine (`data-surface`)                          | Le layout n'est pas re-rendu à la navigation client — décision de route gelée (`layout.tsx:158-169`, mémoire projet « un layout partagé fige les décisions de route ») |
| Portée sur le groupe `(public)` entier                                       | Rayon d'explosion : FAQ, `/legal/*`, `/glossaire` basculeraient papier sans validation visuelle ; extension possible en PR dédiée après constat sur la landing         |
| Second jeu de tokens dupliqués (`--paper-foreground`, …) dans les composants | Divergence garantie : chaque composant devrait choisir son jeu ; le remap conserve la grammaire unique (`text-foreground`, `bg-background`) partout                    |
| Éditer `body { background }` pour pointer un token « par surface »           | Touche la fondation pour toutes les surfaces, y compris `/app` — exactement ce que le cooldown doit protéger                                                           |

## Conséquences

- **Le wrapper `.mkt-paper` casse `body > main`.** `globals.css:493-495` donne
  `flex: 1 1 auto` à `body > main` ; or `<main>` est aujourd'hui un enfant
  DIRECT de `<body>` (les providers du layout ne rendent aucun élément DOM, la
  page retourne un fragment). Envelopper MktNav + main + MktFooter dans un div
  fait perdre la distribution de hauteur du `body` flex (`min-height:100svh`) :
  pied de page qui remonte sur page courte. **Parade** (même PR que la pose du
  wrapper) : le wrapper devient lui-même le maillon flex —
  `body > .mkt-paper { flex: 1 1 auto; display: flex; flex-direction: column; }`
  et `.mkt-paper > main { flex: 1 1 auto; }` — la règle `body > main` existante
  n'est PAS modifiée (les autres pages ne sont pas enveloppées). Preuve exigée :
  `getBoundingClientRect()` du footer à 390×664 sur une page courte. Cette
  règle étant une fondation partagée par les deux surfaces, elle fait partie de
  la relecture cockpit (cf. ci-dessous).
- `globals.css` gagne un quatrième motif de portée, documenté ici et dans
  `docs/design/token-usage.md` + le skill `ankora-design-system` (mis à jour
  dans la même PR que les tokens — le skill liste encore « Pricing », supprimé
  en #307 ; la péremption se corrige au passage).
- `contrast-ratios.test.ts` gagne les paires papier (calculées, seuil 4.5:1) :
  encre/papier 16,08 · ink-soft/papier 8,55 · brand-text-strong/papier 7,20 ·
  accent-text/papier 4,83 · blanc/brand-700 5,47 · encre/paper-soft 16,22 ·
  encre/paper-muted 14,98 · ink-soft/paper-muted 7,97. Le helper `blockAfter()`
  (l. 28-41) fait `indexOf` sur le CSS brut, commentaires compris : il sera
  durci (strip des commentaires avant recherche) dans la même PR, sinon la
  convention « un commentaire descriptif au-dessus de chaque bloc » suffirait à
  lui faire attraper le mauvais `{`.
- Les valeurs sombres restent inchangées et déjà testées ; les paires papier
  n'existent qu'en clair par construction (garde `html:not([data-theme='dark'])`).

---

## Addendum du 23 août 2026 — la portée est supprimée, le papier descend dans l'app

**Statut** : cette section **renverse la réponse Q1 de la relecture cockpit du
8 août** (« NON, pas de `.app-surface` — `:root` EST l'identité du produit,
`.mkt-paper` en est un écart »). La conclusion tenait sur une prémisse que la
mesure a démentie.

### Le constat

@thierry, en regardant l'application : « je ne vois rien niveau des couleurs
prévues ».

### Ce que la mesure a montré, et qui n'avait pas été vu le 8 août

La relecture supposait que `.mkt-paper` portait une **voix éditoriale** propre à
la vitrine, dont le produit n'avait pas à hériter — donc une asymétrie assumée
entre deux identités distinctes.

Relevé le 23 août, au navigateur :

|             | mode clair                         | mode sombre    |
| ----------- | ---------------------------------- | -------------- |
| vitrine     | papier `#faf9f6` / encre `#171d26` | navy `#0b1120` |
| application | **slate `#f8fafc` / `#0f172a`**    | navy `#0b1120` |

Le fond sombre `#0b1120` est **littéralement** ce que la maquette Fable nomme
« Nuit — fond (**navy existant**) » dans sa direction B : Fable a repris le navy
de l'application. Les deux surfaces parlaient donc **déjà** la même langue la
nuit.

Il n'y avait pas deux identités. Il y en avait **une**, et le mode clair de
l'application n'en faisait pas partie : il portait le slate par défaut de
Tailwind, qui n'a jamais été un choix de conception.

### La décision

Les six pigments deviennent les valeurs claires de `@theme`. La portée
`.mkt-paper` et son compagnon `body:has(.mkt-paper)` sont **supprimés**.

Le mouvement **retire** du code plutôt qu'il n'en ajoute, et referme trois
pièges que l'ADR d'origine documentait lui-même :

1. **Les cinq surfaces `fixed` hors wrapper** (bannière de consentement,
   toaster, barre d'onglets, bandeau de mise à jour, retour-en-haut) exigeaient
   un compagnon `body:has()` pour recevoir le papier. Elles l'héritent
   maintenant de `:root`.
2. **Le plancher navigateur de `:has()`** (Firefox 121+, contre 113+ accepté par
   le projet) n'a plus d'objet — la branche de repli n'existe plus.
3. **La duplication des deux blocs**, qu'un test devait comparer pour qu'aucun
   ne soit édité seul, disparaît avec eux.

### Ce que ça coûte, dit honnêtement

- **Le contraste du texte secondaire MONTE** : 8,55:1 contre 7,24 en slate.
  Aucune paire ne descend sous AA — 45 cas le vérifient.
- **`--color-danger` reste le point de vigilance** : 4,59 sur papier, soit 0,09
  au-dessus de la barre. Tout assombrissement du papier la fait passer dessous,
  et le test le dit.
- **Le fichier de test perd 15 cas.** Ils vérifiaient le CÂBLAGE d'une
  substitution qui n'existe plus — que les deux blocs ne divergent pas, que le
  remappage porte sa garde de thème clair, que les pigments soient
  mono-déclarés. Supprimer le mécanisme supprime ses gardiens. Les assertions
  qui portaient sur la LISIBILITÉ sont toutes conservées, et deux paires
  nouvelles ont été ajoutées (texte sur carte). Une ancre de valeurs littérales
  remplace la garde de câblage : elle échoue si quelqu'un remet du slate, ce
  qu'un test de contraste ne saurait pas voir — le slate passe AA lui aussi.

### Ce que cet addendum ne fait PAS

Le `<div class="mkt-paper">` **existe toujours** dans la vitrine et ne sert plus
qu'à la mise en page (`body > .mkt-paper` porte le rôle de lien flex que
`body > main` joue ailleurs). Son retrait rendrait `<main>` enfant direct de
`<body>` et supprimerait ces règles avec lui — c'est un chantier de **mise en
page**, délibérément séparé de celui des **couleurs**, pour qu'une régression
éventuelle reste attribuable.
