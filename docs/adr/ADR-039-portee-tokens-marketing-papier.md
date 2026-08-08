# ADR-039 — Portée des tokens « papier » de la landing (`.mkt-paper`)

- **Statut** : Proposed — en attente de relecture par la session cockpit (@cc-ankora / Opus) AVANT toute implémentation
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
