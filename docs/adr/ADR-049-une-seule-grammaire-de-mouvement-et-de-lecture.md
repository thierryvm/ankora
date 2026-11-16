# ADR-049 — Une seule grammaire de mouvement, de chiffres et de lecture

- **Statut** : Accepté (décision du pilote sur mandat de @thierry, 15 novembre 2026 :
  « je te laisse décider pour que mon application soit digne des design apple, menus
  compris »). Exécution dans des sessions suivantes, lot par lot.
- **Relu par** : `plan-reviewer`, 15 novembre 2026 — 🟡 approuvé avec onze changements,
  tous intégrés dans cette version.
- **Cite** : ADR-037 (la primitive `Sheet`), ADR-039 (jetons papier de la landing),
  ADR-044 (mesure d'audience sur consentement), ADR-048 (pages publiques en cache),
  rapport de la PR-A (`docs/prs/PR-A-account-button-report.md`), PR-3c-2 Q4 (deux
  en-têtes), `docs/design/design-principles-2026.md`, `docs/design/token-usage.md`.

## Contexte

Un audit du 15 novembre 2026 a mesuré le site public en production et les pages `/app` à
390 × 664 au DOM, avec pour grille principale l'approche d'Apple pour les interfaces
fluides (réponse immédiate, interruptibilité, cohérence spatiale, matériaux, typographie,
préférences d'accessibilité). Le rapport complet reste hors du dépôt. Ce qui fonde les
décisions ci-dessous :

- **Trois façons d'ouvrir un détail.** Un chiffre du cockpit s'ouvre par un bouton de
  44 px. Celui des engagements s'ouvre par un `<summary>` gris de 12 px, haut de 16 px.
  Les comptes du cockpit s'ouvrent par des boutons de 28 px.
- **Deux voix pour un montant.** JetBrains Mono sur `/app/accounts`, Inter sur le
  cockpit et les engagements, les deux sur `/app/expenses`. Et
  `design-principles-2026.md` demande en plus un serif pour les gros montants.
- **La règle 10 tenue sur le fond, pas sur la lecture.** Le panneau « D'où vient ce
  chiffre » compte 45 textes en 12 px. L'explication de « Il te reste » est une
  phrase-équation en 12 px.
- **Les repliables s'ouvrent d'un bloc**, seul leur chevron s'anime, sur la courbe par
  défaut de Tailwind et non sur `--ease-spring`. Les feuilles se ferment au geste à la
  distance seulement, jamais à la vitesse.
- **Trois hauteurs d'en-tête** entre la landing, les pages publiques et
  l'authentification (73, 57 et 65 px).
- **À la première visite sur mobile**, ni le résultat de la carte « relevé » ni une
  action d'inscription ne sont visibles : la bannière de consentement couvre la carte,
  et l'inscription est sous le pli.
- **`prefers-reduced-motion` retire aussi le verre**, alors que c'est le rôle de
  `prefers-reduced-transparency` ; et `prefers-contrast` n'est traité nulle part.

## Décisions

Le design system reste la référence. Cet ADR tranche là où il se tait ou se contredit.

1. **L'appui se dit par la teinte, jamais par une mise à l'échelle.** C'est ce que fait
   le code depuis le lot 1 du socle v3 (`button.tsx`). `token-usage.md` est corrigé dans la PR de cet ADR ; la JSDoc de `button.tsx`, qui décrit encore
   translation et mise à l'échelle, l'est dans le lot B (qui touche déjà ce fichier).
2. **Tout ce qui se superpose passe par `primitives/Sheet.tsx`, menus compris.** C'est
   ADR-037, déjà décidé. Cet ADR l'ordonne : le menu public mobile et la feuille « Plus »
   sortent de `PENDING_MIGRATION`, comme les deux éditeurs restants.
   « Ce qui se superpose » vise les panneaux qui recouvrent le contenu (feuilles, tiroirs, menus
   plein écran). Les **popovers ancrés à leur déclencheur** (menu de compte sur ordinateur,
   `Select`) restent hors de `Sheet` : ils suivent la règle d'origine ancrée sur le déclencheur
   (`transform-origin`), sans migration.
3. **La feuille « Plus » garde l'ordre de la PR-A** : « Se déconnecter » reste atteignable
   **sans défiler** à 390 × 664, et une garde e2e le vérifie. Seuls changent la cible de
   fermeture (44 px), l'unité de hauteur (`svh`) et le confinement du défilement.
   Afficher l'e-mail en tête sera une décision séparée, qui touche
   `[locale]/layout.tsx`.
4. **Une seule voix pour les montants.** Tout montant isolé (carte, ligne, total, héros)
   passe par `<Num>` : jetons `--text-num-*`, JetBrains Mono, chiffres tabulaires. Un
   montant pris dans une phrase reste en Inter avec `tabular-nums`. **Aucun serif sur un
   chiffre** : Fraunces est réservée aux titres éditoriaux. `<Num>` ne reçoit jamais de
   `Decimal` (frontière RSC).
5. **Un seul motif « chiffre ouvrable »** : `Repli` (bouton d'au moins 44 px, libellé en
   16 px) ou sa variante compacte. Plus de `<summary>` natif non stylé pour ouvrir un
   montant.
6. **Lire avant de croire.** Une explication de chiffre dans un panneau ouvert est en
   `--text-body` (15 px, interlignage 1,55). Une explication visible au-dessus du pli est
   au minimum en `--text-small` (13 px, interlignage 1,5). Les 12 px (`text-xs`) sont
   réservés aux métadonnées (date, source, unité). Une décomposition s'écrit en **cascade
   alignée** (libellé à gauche, montant tabulaire à droite), jamais en phrase-équation.
   La cascade garde le `data-testid="cockpit-formule"` et les éléments que
   `e2e/il-te-reste-formule.spec.ts` additionne. Aucune taille hors de l'échelle de
   `globals.css`.
7. **Le mouvement suit le geste.**
   - Un repliable anime sa hauteur (`grid-template-rows` de `0fr` à `1fr`, `--dur-default`,
     `--ease-spring`). Fermé, son contenu est `inert` puis caché en fin de transition :
     il reste invisible aux tests et aux lecteurs d'écran.
   - Une feuille se ferme si la distance **ou** la vitesse projetée le justifie (fonction
     de projection d'Apple, décélération d ≈ 0,99). Elle résiste par élasticité au-delà
     de son bord haut.
   - Le contrat de la primitive (ADR-037 §3) est **étendu**, jamais affaibli.
   - `prefers-reduced-motion` garde son effet global.
   - `prefers-reduced-transparency` est **seul** à retirer le verre : le mouvement réduit
     ne retire plus le flou.
8. **Une seule hauteur d'en-tête** sur les pages publiques et d'authentification, quels
   que soient les composants (la coexistence de PR-3c-2 Q4 reste permise). Le filet sous
   l'en-tête n'apparaît qu'au défilement, par une animation liée au défilement en CSS,
   avec repli sur le filet actuel. Le reflet de bord (« edge highlight ») reste propre au
   verre (`.glass`), il ne sert pas de séparateur d'en-tête.
9. **Les préférences système sont traitées toutes les trois.** `prefers-contrast: more`
   donne des surfaces opaques et une bordure pleine. `forced-colors: active` exprime les
   états actifs par `outline`.
10. **Le premier écran public tient sa promesse.** À 390 × 664, **bannière de consentement
    affichée**, le résultat de la carte « relevé » et une action d'inscription sont
    visibles sans défiler, et une garde e2e le mesure. La bannière garde ses deux boutons
    de même poids et de 44 px (ADR-044). Toute modification de la bannière passe par
    `gdpr-compliance-auditor` et par `e2e/consent-first-visit.spec.ts`.

## Conséquences

- **Documents amendés dans la même PR que cet ADR** :
  - `design-principles-2026.md` §1 critère 4, §2 et §Typographies (décisions 4 et 8) ;
  - `token-usage.md` : ligne `<Button>` (décision 1) et règle des tailles (décision 6).
- **Exécution en lots**, une PR et une préoccupation par lot, dans l'ordre du ROADMAP
  (« Programme — une seule grammaire »). Chaque lot :
  - passe par `spec-translator` puis `plan-reviewer` ;
  - travaille dans un worktree ;
  - nomme sa porte de démarrage (`npm run dev`, une page chargée, code HTTP lu) ;
  - mesure les deux planchers e2e en local (294 public, 81 authentifié) et dit si la
    quarantaine bouge.
- **Les lots D et G ajoutent des cas e2e** : la déconnexion visible sans défilement, le
  premier écran mesuré bannière comprise, la feuille fermée au geste. Les planchers
  montent.
- **Hors périmètre, nommés** (propriétaire @cc-ankora, à re-mesurer après le lot G) :
  - l'espacement des lettres selon la taille ;
  - le reflet de bord hors en-tête ;
  - les cibles de 36 à 40 px ;
  - `.glass` utilisé sur une carte de contenu ;
  - le rayon imposé au focus visible ;
  - la longueur de `/app/accounts` (environ 2 800 px) ;
  - les libellés de navigation (« Cockpit » contre « Tableau de bord »).

## Alternatives écartées

- **Une mise à l'échelle à l'appui** (`scale(0.97)`, l'usage Apple sur les boutons
  libres) : écartée, parce qu'un contrôle qui rétrécit déplace sa propre cible sous le
  doigt et fait bouger ses voisins dans une liste. La raison est écrite dans
  `button.tsx`.
- **La déconnexion en bas de la feuille « Plus »** (convention iOS) : écartée, parce
  qu'elle défait une demande explicite de @thierry (PR-A) et imposerait un défilement à
  390 × 664.
- **Fraunces sur les gros montants** (tendance « serif chiffres » 2026) : écartée. Elle
  aurait donné un troisième rendu à un même objet, et la police servie en production
  depuis le 19 mai 2026 ne contient aucun chiffre.
- **Une taille de 14 px pour les explications** : écartée, car hors de l'échelle de
  `globals.css`. Le corps de 15 px existe déjà.
