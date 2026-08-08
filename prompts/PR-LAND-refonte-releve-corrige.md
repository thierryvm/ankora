# PR-LAND — Refonte landing « Le relevé corrigé » (plan d'exécution, 3 PR)

> **Statut** : plan validé par `plan-reviewer` le 8 août 2026 — v2 après un
> 🔴 (16 éditions traitées), puis 🟡 APPROVED WITH CHANGES dont les 6 éditions
> et 3 points mineurs sont intégrés à cette version ; le reviewer n'exige pas
> de nouvelle revue. **Exécution en session N+1 uniquement** (cooldown
> banned-list n°2), après relecture d'ADR-039 par la session cockpit — sur
> DEUX questions : symétrie `.app-surface` et sort de `body > main`.
> Direction visuelle actée par @thierry : « Le relevé corrigé » (galerie des
> trois directions : artefact Claude du 8 août 2026).
>
> **Session d'exécution** : worktree `F:\PROJECTS\Apps\ankora-landing`, port dev
> **3200**, référence viewport **390 × 664**. Ne jamais sortir du worktree.
> `messages/` appartient à ce chantier jusqu'à la fin des 3 PR (accord
> @thierry 8 août — la session cockpit n'y touche pas).

## Phase 0 — au démarrage de CHAQUE session d'exécution

1. **Model check** : Opus requis (alias `opus`). L'exception Fable 5 accordée
   par @thierry le 8 août 2026 couvre le travail **visuel** — donc **L2 et L3
   seulement**. **La PR L1 s'exécute sous Opus** : elle introduit un quatrième
   motif de portée dans la fondation partagée (`globals.css`) et modifie de la
   doctrine d'agent (`.claude/skills/`) — c'est de l'architecture au sens de la
   banned list n°5, hors du périmètre de l'exception. Tout autre modèle sur
   L1 → STOP.
2. **Phase 0bis comptes** : `work perso -NoCd; npm run preflight` → **GO exigé**
   (les 11 lignes vertes). Le worktree porte son `supabase/.temp/project-ref`
   (sinon NO-GO Supabase — cf. mémoire projet). Re-lancer le préflight avant
   CHAQUE commande `gh` qui écrit — la bascule de compte arrive en cours de
   session (mesurée 26/07 et 05/08).
3. Vérifier l'état de branche annoncé plus bas : `git status -sb` et
   `git log --oneline main..HEAD` (constaté le 8 août : branche
   `feat/landing-refonte-2026` à 0 commit d'avance, 2 de retard → `git merge
--ff-only origin/main` avant tout commit).

## Contraintes transverses (toutes PR)

- Périmètre : `src/components/marketing/`, `src/app/[locale]/(public)/`,
  `src/app/globals.css`, `messages/`, plus — accord @thierry 8 août —
  `.claude/skills/ankora-design-system/SKILL.md` (doc des tokens) et les tests
  associés (`src/app/__tests__/contrast-ratios.test.ts`,
  `src/components/marketing/**/__tests__/`, `e2e/` pour les specs landing).
- INTERDITS inchangés : `src/app/[locale]/app/`, auth, migrations, `.husky/`,
  workflows GHA, `package.json`. Budget 0 € : aucune dépendance.
- **Hors scope nommé, avec propriétaire** :
  - `content/glossary/fr-BE.json` (« reste à vivre » y est une définition
    légitime, pas un terme banni — vérifié) → passe de réconciliation
    vocabulaire post-PR, propriétaire @thierry + session cockpit ;
  - `public/llms-full.txt` → fichier **GÉNÉRÉ** par
    `scripts/build-llms-full.mjs` (sources : `public/llms.txt`,
    `messages/fr-BE.json`, `content/glossary/fr-BE.json`). Ne JAMAIS éditer
    l'artefact ; il suivra ses sources.
  - La relecture cockpit d'ADR-039 porte sur DEUX questions : la symétrie app
    (`.app-surface` ?) ET le sort de `body > main` (règle de fondation
    partagée, cf. ADR-039 §Conséquences) → session cockpit.
- CSP nonce, tokens sémantiques only, parité FR/EN stricte (5 fichiers :
  `fr-BE.json`, `en.json`, `nl-BE.json`, `de-DE.json`, `es-ES.json` — les trois
  derniers en copie FR ; la porte qui la fait respecter est
  `tests/i18n/messages-parity.test.ts`, c'est elle qui rougira, pas une
  relecture), vocabulaire ADR-035 + ADR-039 §vocabulaire, FSMA, anti-PSD2,
  piège Tailwind v4 (jamais épeler une classe arbitraire en commentaire).
- **Aucune animation d'entrée sur le hero** (arbitrage plan-reviewer : un état
  de repos `opacity:0` fait d'un hero invisible le mode de défaillance ; et la
  direction dit « le calme est l'argument »). Si une transition est un jour
  souhaitée : `@starting-style` uniquement (état par défaut visible), justifiée
  par mesure Lighthouse avant/après.
- **Branches** : une branche par PR, créée `git checkout -b <nom>` **depuis
  `main` à jour** dans ce worktree (git refuse de sortir une branche déjà tenue
  par un autre worktree — protection structurelle). Jamais deux PR sur la même
  branche.

## PR L1 — Couche MARQUE : tokens papier (branche `feat/landing-tokens-papier`)

Contenu (≈ 250-350 lignes, à re-mesurer par `git diff --stat` avant push) :

1. `globals.css` : tokens bruts `--color-paper`, `--color-paper-line`,
   `--color-ink`, `--color-ink-soft`, `--color-paper-soft`,
   `--color-paper-muted` dans `@theme` (aucun hex anonyme dans le remap) ;
   bloc de portée
   `html:not([data-theme='dark']) .mkt-paper { … }` + compagnon
   `html:not([data-theme='dark']) body:has(.mkt-paper) { … }` — remaps et
   justifications EXACTEMENT selon ADR-039 (qui paint le viewport, sort des
   cinq slots `fixed`, dégradation Firefox 113-120, aucun remap sombre).
   Le commentaire du bloc ne cite PAS le sélecteur `.mkt-paper` en toutes
   lettres ailleurs que dans le bloc lui-même (piège `blockAfter`).
2. `contrast-ratios.test.ts` : durcir `blockAfter()` (strip des commentaires
   `/* … */` avant `indexOf`), en **re-validant** les blocs déjà consommés
   (`@theme`, `[data-theme='dark']`) dont le strip décale les offsets ;
   ajouter les 8 paires papier (16,08 / 8,55 / 7,20 / 4,83 / 5,47 / 16,22 /
   14,98 / 7,97 — recalculées par le test, seuil 4.5) ; assertion explicite
   que le bloc sombre ne définit AUCUN token papier (remap clair-seul par
   construction) ; **garde de synchronisation** : les blocs `.mkt-paper` et
   `body:has(.mkt-paper)` déclarent les MÊMES noms de propriétés (comparaison
   de `Set` sur le CSS lu en texte) — la duplication est délibérée (repli
   Firefox 113-120), la garde empêche qu'on édite l'un sans l'autre.
3. `docs/design/token-usage.md` : matrice §3 + paires §4 + motif de portée.
4. `.claude/skills/ankora-design-system/SKILL.md` : §tokens à jour (motif
   `.mkt-paper`), retrait de « Pricing » de la liste des sections landing
   (supprimée en #307) — le skill périmé repousse mécaniquement le prochain
   auteur sur l'ancienne convention.

Gates : lint, lint:use-server, typecheck, test, build, `npm run dev -- -p 3200`
puis `/` et `/en` en HTTP 200 et zéro erreur de compilation. La portée n'étant
posée sur aucune page en L1, zéro changement visuel attendu — le vérifier
(capture avant/après identiques).

## PR L2 — Hero + navigation (branche `feat/landing-hero-releve`)

Contenu (≈ 500-550 lignes — si `git diff --stat` du squelette dépasse 600,
scinder : L2a hero+messages, L2b adaptations e2e) :

1. `(public)/page.tsx` : wrapper `.mkt-paper` autour de MktNav + main +
   MktFooter (les trois sont rendus par la page — décision de route au bon
   endroit, jamais dans un layout). **Attention** : ce wrapper casse le
   sélecteur `body > main` (`globals.css:493` — `<main>` est aujourd'hui
   enfant direct de `body`, les providers ne rendent aucun élément DOM) ;
   appliquer la parade d'ADR-039 §Conséquences dans la MÊME PR
   (`body > .mkt-paper` devient le maillon flex, `.mkt-paper > main` reprend
   `flex: 1 1 auto` ; la règle `body > main` existante n'est pas modifiée) et
   la prouver au footer sur page courte.
2. `Hero.tsx` réécrit (Server Component, zéro JS client, zéro animation) :
   kicker laiton, H1 Fraunces deux phrases (« Ta banque te montre ce qui s'est
   passé. / Ankora te montre ce qui est _déjà engagé_. », italique laiton sur le
   terme-clé), sous-titre définissant « déjà engagé » en langage courant, carte
   relevé : « Le solde que tu lis à ta banque » (sous-texte « recopié par toi —
   Ankora ne se connecte à aucune banque ») − assurance auto datée − taxe datée,
   filet double, **« Encore vraiment à toi » : 798,00 €** (ADR-039 §vocabulaire
   — aucun des quatre noms ADR-035), pied « Exemple illustratif — dans Ankora,
   ce sont tes chiffres, saisis par toi », 2 CTA, ligne de confiance.
3. `constants.ts` : `RELEVE_DEMO { bankBalance: 1240, insurance: 280, tax: 162,
trulyYours: 798 }` + test unitaire de cohérence arithmétique.
   **`HERO_WATERFALL_DEMO` et `HERO_BROWSER_DOTS` restent intacts** —
   consommés par `Feature.tsx:81` et `Feature.test.tsx:106` jusqu'à la PR L3.
   `HERO_KPIS` / `HERO_SPARKLINE` : supprimés SEULEMENT si plus aucun
   consommateur (vérifier par grep, sinon L3).
4. i18n : nouvelles clés sous `landing.hero.releve.*` ; **le sous-arbre
   `landing.hero.waterfall.*` est PRÉSERVÉ tel quel** (consommé par
   `Feature.tsx:75` jusqu'à L3). Anciennes clés hero remplacées seulement si
   aucun autre consommateur (grep chaque clé). 5 fichiers de messages.
5. `MktNav.tsx` : quasi inchangé (il lit les tokens remappés).
6. Tests : `Hero.test.tsx` réécrit ; adaptations e2e listées :
   - `e2e/mobile-ios/landing.spec.ts:85` — **lever le
     `test.fixme(BUG-iOS-HERO-OVERFLOW)`** : le nouveau hero est conçu sans
     débordement ; le lever fait MONTER le plancher public (mouvement sain).
     **Aucun delta annoncé d'avance** : le `fixme` est inconditionnel et le
     fichier tourne sur TROIS projets (iPhone 14, 15 Pro Max, SE —
     `playwright.config.ts:17`), donc le lever libère jusqu'à +3 ; et l'iPhone
     SE porte un débordement documenté à 320 px (BUG-iOS-011, même fichier
     l. 39) qui peut laisser SE rouge quand 14/15 passent. Delta MESURÉ par
     projet, avec et sans la spec, avant le premier push ; si SE reste rouge à
     cause de BUG-iOS-011, la décision (correction du débordement SE ou levée
     conditionnelle par projet) se documente dans le rapport de PR.
   - toute spec qui asserte l'ancienne copie hero (grep `h1Highlight`,
     `ancrage`, etc.).

Gates : les 6 portes + **mesures DOM à 390 × 664 dans LES DEUX thèmes**
(`data-theme='dark'` compris — le toggle est sur la landing) : zéro
débordement horizontal, cibles ≥ 44 px, payoff de la carte au-dessus du pli
(664 px). **Capture 390 × 844** (doctrine CLAUDE.md — l'écran physique) **et
mesures au pli 664** (la hauteur réellement utile une fois la barre Safari
posée, mesurée le 8 août) : les deux références coexistent, aucune n'écrase
l'autre. **Capture avec la bannière de consentement affichée par-dessus le
hero papier** + `getComputedStyle(document.body).backgroundColor` = papier en
clair. Vérifier aussi le pied de page sur page courte
(`getBoundingClientRect()` du footer — parade `body > .mkt-paper`, cf. ADR-039
§Conséquences). Agents QA : ui-auditor, mobile-ios-auditor, i18n-auditor.

## PR L3 — Sections (branche `feat/landing-sections-releve`)

Contenu (≈ 550-650 lignes — la migration `landing.hero.waterfall.*` →
`landing.feature.waterfall.*` touche les 5 fichiers de messages ; si
`git diff --stat` dépasse 600, scinder la migration i18n en L3b) :

1. `Principles.tsx` : ton « relevé » (cartes papier, copy révisée).
2. `Feature.tsx` : cascade restylée papier + définitions inline (« provisions »
   expliqué au premier contact) ; migration des clés `landing.hero.waterfall.*`
   vers `landing.feature.waterfall.*` ET de `HERO_WATERFALL_DEMO` /
   `HERO_BROWSER_DOTS` (renommage ou suppression selon usage résiduel).
3. `WhatIfDemo.tsx` : restylage tokens uniquement.
4. `FAQ.tsx` : 5e entrée — « Pourquoi une deuxième app alors que j'ai déjà
   celle de ma banque ? » (l'objection frontale, réponse = la thèse).
5. `FooterCTA.tsx` + `MktFooter.tsx` : ton « relevé ».
6. Metadata SEO alignées.
7. Adaptations e2e/vitest **connues d'avance** :
   - `e2e/landing-sections.spec.ts:37` (h2 FooterCTA `/commence par ce qui
est/i`) → nouvelle copie ;
   - `e2e/landing-sections.spec.ts:66` (`mainEntity` = 4) → 5 ;
   - `FAQ.test.tsx:39` (FAQ_KEYS figé à 4) → 5.

Gates : les 6 portes + mesures DOM 390 × 664 deux thèmes + agents QA :
ui-auditor, mobile-ios-auditor, i18n-auditor, seo-geo-auditor,
lighthouse-auditor (≥ 95 perf, 100 a11y/BP/SEO).

## Planchers e2e (critère permanent)

Planchers observés au moment du plan : **228 passed (public) / 41 passed
(authentifié)**. Chaque PR : mesure locale AVANT premier push
(`E2E_BASE_URL` + port dédié, `--workers=1` pour les specs seedées — mémoires
projet), annonce des deux planchers post-changement par job avec le delta
expliqué ligne à ligne — **mesuré, jamais annoncé d'avance** (cf. §L2.6 pour
le cas du fixme multi-projets). La quarantaine `e2e/authenticated-specs.json`
ne grossit pas.

## DoD — 5 critères, PAR PR (aucun push n'est « terminé »)

1. CI verte : `work perso -NoCd; gh pr checks <N> --watch` (Lint, Typecheck,
   Tests, E2E ×2, Security, Build).
2. Sourcery muet sur le DERNIER commit :
   `gh api repos/thierryvm/ankora/pulls/<N>/comments --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'`
   (vide) **et** remarques générales :
   `gh api repos/thierryvm/ankora/pulls/<N>/reviews --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'`
   — re-lire après CHAQUE push (Sourcery est asynchrone), un commentaire écarté
   l'est DANS le fil avec sa raison.
3. Fils résolus :
   `gh api graphql -f query='query { repository(owner:"thierryvm", name:"ankora") { pullRequest(number:<N>) { reviewThreads(first:50) { nodes { isResolved path line } } } } }'`
   → tous `isResolved` (piège connu : `check-sourcery-resolved` rougit au push
   qui précède la résolution — résoudre puis `gh run rerun`).
4. Pas de conflit : `gh pr view <N> --json mergeStateStatus` → `CLEAN`.
5. Rapport `docs/prs/PR-L{1,2,3}-report.md` : sortie de chaque porte, mesures
   DOM (deux thèmes), captures (bannière comprise en L2), planchers e2e
   avant/après, verdicts agents QA, ce qui n'a pas été fait et pourquoi.

@thierry merge. Jamais l'agent.
