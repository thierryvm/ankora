# PR L3 — Sections au ton « relevé » + 5ᵉ FAQ + migration waterfall + SEO (rapport)

> @cc-fable — session du 11 août 2026, worktree `ankora-landing`, branche
> `feat/landing-l3-sections` créée depuis `origin/main` à `b0d634e` (L1 #338 et
> L2 #339 vérifiées `MERGED` avant la première ligne). Plan-cadre :
> `prompts/PR-LAND-refonte-releve-corrige.md` §L3. Plan d'exécution passé par
> `plan-reviewer` en DEUX tours le 11 août : 🟡 APPROVED WITH CHANGES
> (17 éditions, toutes intégrées) puis 🟡 « quatre corrections d'une ligne,
> pas de nouveau tour de revue » (intégrées aussi). Deux vrais défauts SEO
> trouvés par la revue AVANT le code — détail au §Metadata.

## Ce que la PR livre

1. **`Feature.tsx` — la cascade devient un relevé.** Carte blanche sur papier
   (`bg-card` + `shadow-md`, l'ombre EST la frontière — trade-off mesuré en L2),
   3 rangées séparées par des filets, **filet double avant la ligne de solde**
   (« Argent disponible ») — la grammaire exacte de la carte hero. Les flèches
   SVG connecteurs disparaissent (grammaire dashboard, pas relevé). Le conteneur
   dégradé brand→accent disparaît. **Montants en encre neutre** : la couleur
   était redondante avec le signe déjà porté par les chaînes i18n, et un codage
   couleur-seule est un défaut WCAG 1.4.1 — même doctrine que la carte hero et
   ADR-035 §3. Le signe devient l'unique porteur, donc il gagne sa propre garde
   (`constants.test.ts`, même commit — exigence plan-reviewer).
2. **`<h3>` orphelin de Feature → `<h2>`** (WCAG 1.3.1, dette ui-auditor L2).
   Outline final : h1 hero → h2 ×5 sections → h3 titres de cartes. Clés i18n
   renommées `h3Line1/h3Line2` → `titleLine1/titleLine2` (un nom de clé ne doit
   pas mentir sur le niveau). Eyebrow « Cashflow waterfall » (jargon EN) →
   « La cascade du mois ». Les 2 CTA de la section passent à `min-h-11`
   (44 px — ils mesuraient 36, sous le standard que ce dépôt s'impose partout).
3. **Migration i18n** : `landing.hero.waterfall.*` → `landing.feature.waterfall.*`
   ×5 bundles ; **NBSP posés sur les montants** (dette i18n-auditor L2 :
   U+00A0 séparateur de milliers + avant €, U+2212 pour le moins — convention
   binaire identique à la carte hero, par locale) ; nouvelle clé
   `provisionsDefinition` — « provisions » expliqué au premier contact, en
   langage descriptif (FSMA). Greps de sortie : `landing.hero.waterfall` → **0**
   dans `messages/` et `src/` (la porte de parité compare les locales entre
   elles et ne voit pas une clé orpheline présente dans les 5 — le grep est la
   garde) ; jalon de ban ADR-035 sur `messages/` → **0** avant ET après.
4. **`constants.ts`** : `HERO_WATERFALL_DEMO` → `FEATURE_WATERFALL_DEMO`
   (3 consommateurs, tous dans le diff, JSDoc réécrit) ; **`HERO_BROWSER_DOTS`
   supprimé** — l'arbitrage « dormant » du L2 est tranché : zéro consommateur
   depuis la réécriture du hero, et la direction papier n'a de mockup
   navigateur nulle part.
5. **FAQ : 5ᵉ entrée `bank`** — « Pourquoi une deuxième app alors que j'ai déjà
   celle de ma banque ? » L'objection frontale ; la réponse est la thèse, avec
   la **clause anti-PSD2 dans la réponse même** (« aucune donnée n'est lue sur
   ton compte » — reformulée sur demande plan-reviewer : le premier jet avait
   un second sens monétaire). En 2ᵉ position : la décision « price first » du
   2026-08-05 est verrouillée par un test nommé, pas rouverte. Le JSON-LD
   FAQPage suit `FAQ_KEYS` → 5 questions.
6. **`FooterCTA`** : « déjà à toi. » → **« déjà engagé. »** — le premier geste
   dans Ankora est de saisir ses charges engagées ; le bookend hero ↔ footer se
   referme sur le mot de la thèse. Écart vs plan-cadre §L3.7 : la sonde e2e
   `:37` ne bouge PAS (elle vise `h2Lead`, délibérément inchangé — commentaire
   ajouté dans la spec) ; le mot exact est épinglé par `FooterCTA.test.tsx`.
7. **Cartes Principles et FAQ en `shadow-md`** (frontière sur papier, même
   motif mesuré que la carte hero ; `h-full` conservé sur Principles — c'est
   lui qui égalise les hauteurs de la grille).
8. **Metadata SEO** — cf. section dédiée ci-dessous.
9. **`public/llms.txt`** : thèse ajoutée au blockquote + nom de section aligné ;
   **`public/llms-full.txt` committé régénéré CETTE fois** — sa source est
   éditée par la PR (le script l'inline en entier), la politique
   « git checkout -- » de L1/L2 ne valait que pour un delta réduit au tampon
   de date. Diff relu : 3 lignes (date + les 2 éditions de source).

## Metadata (§H) — deux défauts trouvés par la revue, deux mesurés par moi

**Avant** (mesuré sur le build local pré-L3 ET visible en prod) :
`<title>` = « Ankora — Ton ancrage financier · Ankora » — **marque doublée** :
la page posait `Ankora — <tagline>` dans un layout dont le `title.template`
ajoute « · Ankora ». Défaut préexistant, corrigé au passage.

**Après** (build prod local, `/` et `/en`, fichiers de preuve
`.playwright-mcp/l3-head-{BEFORE,AFTER}.txt`) :

| Balise                                              | `/`                                  | `/en`                                 |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------- |
| `<title>`                                           | Vois ce qui est déjà engagé · Ankora | See what's already committed · Ankora |
| `og:title` / `twitter:title`                        | Ankora — Vois ce qui est déjà engagé | Ankora — See what's already committed |
| `og:type` / `og:locale` / `og:url` / `og:site_name` | ✅ tous présents                     | ✅ tous présents                      |
| `og:image` (+type/width/height/alt)                 | ✅                                   | ✅                                    |
| description                                         | 159 car.                             | 153 car.                              |

Trois pièges Next.js rencontrés, dont deux que la revue n'avait pas vus :

1. **Un `openGraph` de page REMPLACE celui du layout** (fusion par champ
   exporté, pas profonde) — vu par plan-reviewer, l'objet est redéclaré
   COMPLET.
2. **La métadonnée fichier (`opengraph-image.tsx`) ne survit PAS à une
   déclaration `openGraph` de page** — la revue affirmait le contraire
   (« priorité supérieure ») ; mesuré : **0 occurrence de og:image** après la
   redéclaration. Parade : lire le parent résolu (2ᵉ argument de
   `generateMetadata`) et reporter ses images explicitement.
3. **`twitter.images` du parent résolu est vide** (pas de `twitter-image.tsx` ;
   le repli twitter→og ne joue que quand la page ne déclare aucun objet
   `twitter`) — mesuré : 0 `twitter:image` après la première parade. Les urls
   des images og sont reportées vers twitter.

Longueur des descriptions par locale, mesurée : fr-BE/nl-BE/de-DE/es-ES
**159** (la marge sous 160 est de 1 caractère — assumé, recompté deux fois),
en **153**. La duplication des champs og invariants entre layout et page est
un risque de divergence connu : le layout racine est hors périmètre L3, la
factorisation est rangée avec la passe de réconciliation.

## Écarts assumés vs plan-cadre §L3

- **Principles : copy NON révisée.** Elle porte déjà la thèse (« Ce qui reste
  vraiment à toi, après les engagements »). Le vrai sujet est ailleurs : la
  landing porte **deux noms pour la même idée** — « Réserve libre »
  (Principles + WhatIfDemo) vs « Encore vraiment à toi » (hero). Ce doublon
  relève de la passe de réconciliation vocabulaire landing ↔ cockpit ↔
  glossaire (ADR-039 §Décisions de vocabulaire, propriétaire @thierry +
  session cockpit) — pas d'un correctif local.
- **MktFooter : intouché.** Liens et copyright déjà justes ; le papier vient
  des tokens.
- **WhatIfDemo : intouché.** Tokens partout, zéro hex hardcodé — le remap
  `.mkt-paper` fait le travail (vérifié aux mesures).
- **Nom de branche** : `feat/landing-l3-sections` (prompt délégué du 11 août)
  et non `feat/landing-sections-releve` (plan-cadre) — nominal.
- **Divergence FAQ nommée** : la landing gagne `landing.faq.bank` pendant que
  `/faq` porte déjà `faq.items.bankConnection` — deux surfaces, deux réponses,
  pas de propagation (namespaces distincts, vérifié). Propriétaire : la même
  passe de réconciliation.
- **Taille** : squelette final mesuré à **450 insertions / 269 suppressions**
  (19 fichiers, hors rapport et hors llms-full.txt — retouches agents QA
  comprises), sous le précédent accepté : L2 a mergé en une PR à **717/455**
  (squash `c378978`). Pas de scission — le seuil « 600 » du plan-cadre, lu
  contre son propre précédent, porte sur un ordre de grandeur que ce diff ne
  dépasse pas, et scinder la migration i18n laisserait la cascade dans un
  état intermédiaire dans les deux PR.

## Sonde e2e durcie (#344) — mesurée AVANT d'entrer

`documentElement.scrollWidth` est une sonde aveugle (mesuré au ticket #344 en
falsifiant les sondes : un élément 200 px trop large ne la fait pas bouger ;
`body.scrollWidth` détecte). La sonde du test 375 px de
`landing-sections.spec.ts` passe à `body.scrollWidth` — **mesurée VERTE sur
`main` avant toute édition** (delta 0 à 375 px, build prod local), condition
posée par le plan : rouge, elle serait retournée au ticket. **#344 est
rétréci, pas fermé** : le second cas aveugle (la sonde `window.scrollX` du
projet iPhone SE dans `e2e/mobile-ios/landing.spec.ts`) reste entier.

## Portes locales — sorties

| Porte                              | Résultat                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run lint`                     | 0 erreur (10 warnings préexistants, aucun dans les fichiers du diff)                       |
| `npm run lint:use-server`          | ✅                                                                                         |
| `npm run typecheck`                | ✅ (relancé après chaque retouche metadata)                                                |
| `npx vitest run --maxWorkers=4`    | **2269/2269** (165 fichiers) — plein-workers évité d'office, piège machine documenté en L2 |
| `npm run build`                    | ✅ (×3 — les deux parades og/twitter ont chacune été rebâties et re-mesurées)              |
| `next start -p 3200`               | `/` → 200, `/en` → 200, zéro erreur de compilation                                         |
| `prettier --check messages/*.json` | ✅                                                                                         |

## Mesures DOM — serveur **prod** local (`next build` + `next start -p 3200`)

Harnais : `.playwright-mcp/measure-l3.mjs` (gitignoré), Chromium mobile
390 × 664, thème piloté par `prefers-color-scheme` (le chemin exact que
`ThemeBootScript` lit).

| Mesure                                        | Clair                                    | Sombre                 |
| --------------------------------------------- | ---------------------------------------- | ---------------------- |
| `getComputedStyle(body).backgroundColor`      | `rgb(250,249,246)` = papier              | `rgb(11,17,32)` = navy |
| Débordement (page + enfants de `main`)        | 0 offender                               | 0 offender             |
| Titre Feature                                 | `H2` (id conservé)                       | `H2`                   |
| Carte cascade : présence / ombre / bord droit | ✅ / ✅ / 374 ≤ 390                      | ✅ / ✅ / 374          |
| `<ol>` : items / SVG                          | 3 / **0**                                | 3 / 0                  |
| Couleur des 3 montants                        | `rgb(23,29,38)` = encre ×3               | `rgb(226,232,240)` ×3  |
| Définition « provisions » rendue              | ✅                                       | ✅                     |
| FAQ : cartes / ombre                          | **5** / ✅                               | 5 / ✅                 |
| Principles : ombres                           | ✅ ×3                                    | ✅ ×3                  |
| FooterCTA h2                                  | « Commence par ce qui est déjà engagé. » | idem                   |
| CTA Feature (largeur × hauteur)               | 155×**44**, 174×**44**                   | idem                   |
| Largeurs 360 / 320 px                         | 0 débordement, 0 offender                | — (clair seul)         |

Captures 390 × 844 (`.playwright-mcp/`) : `l3-top-{light,dark}` (bannière de
consentement affichée par-dessus le hero papier — premier écran réel),
`l3-feature-{light,dark}`, `l3-faq-light`, `l3-footercta-light`.

## Planchers e2e

- **A/B de découverte, mesuré dans les deux sens** (`npx playwright test
--list`, avec le diff puis avec la spec restaurée de HEAD) : **462 cas dans
  41 fichiers, identique** — le diff n'ajoute ni ne retire aucun cas ; seul le
  contenu d'assertions change (`mainEntity` 5, sonde body, commentaire :37).
  Delta structurel : **0**.
- **Suite publique complète, locale** (6 projets, serveur prod, 1,7 min) :
  **239 passed / 221 skipped / 2 failed.** Les 2 échecs sont le MÊME cas
  (`consent-first-visit.spec.ts:55`, chromium-desktop + mobile-safari), la
  famille d'environnement documentée au rapport L2 : l'assertion post-submit
  du parcours login tourne ici contre le **vrai** Supabase/Upstash de
  `.env.local` (rate-limit fail-closed), là où le job CI public tourne sur des
  valeurs factices. Reproduit à l'identique en solo (1 failed / 1 passed).
  La spec n'est pas modifiée par ce diff, qui ne touche ni `/login`, ni
  l'auth, ni la bannière.
- **Planchers de référence** : **241 (public) / 50 (authentifié)** — tableau
  canonique `CLAUDE.md` (« OBSERVÉ ») + `docs/reference/planchers-e2e-historique.md`
  (le 231 → 241 du 10/08 y est journalisé ; contrairement à ce que le plan v2
  affirmait, l'entrée L2 y figure déjà — seule la lecture L3 sera ajoutée).
  Attendu : inchangés. **Les nombres réels sont relevés sur les jobs CI du
  dernier commit** (`gh run view <id> --log`) et consignés au commentaire DoD
  de la PR avec l'id du run — un rapport committé ne peut pas contenir les
  chiffres de la CI qui le suit.
- e2e:auth non lancé localement (cible la production réelle ; diff 100 %
  public) — le job CI éphémère mesure.

## Agents QA — verdicts et traitement

| Agent                            | Verdict                                                   | Traité dans la PR                                                                                                                                                                                                                   | Consigné (hors L3, avec propriétaire)                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-reviewer` (×2, avant code) | 🟡 → 🟡 « quatre corrections, pas de nouveau tour »       | 17 + 4 éditions intégrées ; ses 2 défauts metadata vérifiés et corrigés                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ui-auditor`                     | 🟡 PASS_WITH_NOTES                                        | JSDoc FAQ « three pairs » → « five » corrigé                                                                                                                                                                                        | CTA « Comment ça marche ? » pointe `#principles`, au-DESSUS de Feature dans le DOM (préexistant — intention à confirmer par @thierry) ; extraction d'une classe carte-papier si 4ᵉ occurrence ; `CardTitle` non utilisé dans Principles (préexistant)                                                                                                                                                     |
| `mobile-ios-auditor`             | 🟡 PASS_WITH_NOTES                                        | `break-words` posé derrière `min-w-0` (Feature ×3 + Hero ×4 — le filet que `min-w-0` seul n'est pas contre un composé insécable)                                                                                                    | `-webkit-tap-highlight-color` jamais déclaré (systémique) ; renommage du test « hero section: no element overflows » (couvre en fait tout `main`) — au prochain passage sur ce fichier                                                                                                                                                                                                                    |
| `i18n-auditor`                   | 🟡 PASS_WITH_NOTES                                        | Commentaire faux de `constants.ts` (« NBSP fr-BE only ») corrigé ; glossaire **1.6** : « déjà engagé » + « La cascade du mois » verrouillés §Brand (règle du glossaire : tout terme AVANT les bundles — L2/L3 l'avaient contournée) | **La dette FR-verbatim nl/de/es couvre les 6 items du diff**, pas seulement `faq.bank` — et `provisionsDefinition` est de la dette NEUVE (clé créée non traduite dans 3/5 locales). Propriétaire : passe `i18n-translator` pré-activation NL/DE/ES (dette trackée). Typographie du signe hero (« − 280,00 € », espace après le signe) ≠ waterfall (« −1 959 € », collé) — préexistant, à trancher un jour |
| `seo-geo-auditor`                | 🟡 PASS_WITH_NOTES                                        | — (les 6 changements vérifiés conformes, y c. non-régression duplicate content : nl/de/es non indexables par construction)                                                                                                          | Clause FSMA absente de `meta.description` (marge 1 car. — dette assumée) ; `llms-full.txt` « v1 skeleton » : §2 placeholder + §4 sans la question `bank` — passe GEO dédiée                                                                                                                                                                                                                               |
| `lighthouse-auditor`             | 🔴 sur les seuils — **causes hors diff** (cf. ci-dessous) | a11y **100** et SEO **100** des deux côtés — les surfaces que L3 touche (outline h2, JSON-LD ×5, metadata) sont propres                                                                                                             | 2 tickets dédiés ouverts (perf mobile : bannière consentement candidate LCP/CLS ; BP 93 : style inline `sonner` sans nonce CSP)                                                                                                                                                                                                                                                                           |

### Lighthouse — mesuré, et pourquoi le 🔴 ne bloque pas CETTE PR

Build prod local `:3200`, binaire `lighthouse` déjà vendu par `@lhci/cli`
(zéro dépendance) : **desktop 98 / 100 / 93 / 100 · mobile 68 / 100 / 93 / 100**
(mobile reproduit ×2). Seuils du plan-cadre : ≥ 95 / 100 / 100 / 100.

Les deux échecs sont attribués, et **aucun ne vit dans ce diff** (READ IN
CODE — le périmètre du diff ne contient ni composant, la mécanique est lue
dans les rapports Lighthouse ; pas re-mesuré sur main) :

1. **Best Practices 93 (les deux formats)** : `sonner` (`src/components/ui/toast.tsx`,
   monté globalement) injecte un `<style>` runtime sans nonce → violation CSP
   consignée en console. Règle 6 du CLAUDE.md, correctif dédié.
2. **Perf mobile 68** : sous throttling mobile, l'élément LCP devient le
   paragraphe de la **bannière de consentement** (hydratée tard, grande à
   390 px) — LCP 5,3 s dont 88 % de render delay, et CLS 0,103 porté en
   totalité par son apparition. Le hero, lui, peint tôt (LCP desktop = le H1,
   1,1 s). TBT = **0 ms** — cohérent avec « L3 n'ajoute aucun JS client ».
   `src/components/gdpr/ConsentBanner.tsx` est hors périmètre landing (et
   RGPD — voie lourde), correctif dédié.

Élargir L3 pour les corriger serait le scope creep que la banned list n°1
interdit ; les deux partent en tickets avec l'analyse complète. Ce que L3
pouvait dégrader — a11y, SEO, poids de page — est à 100/100 et TBT 0.

**Contrôles visuels iPhone réel demandés à @thierry** (s'ajoutent aux 5 de L2,
runbook `docs/runbooks/dev-on-iphone.md`) : (1) filet double sur les DEUX
cartes — hero « Encore vraiment à toi » ET Feature « Argent disponible »
(largeurs de colonne différentes, l'arrondi WebKit peut diverger) ; (2) carte
Feature à 320 px, deux thèmes — « Dépenses courantes » wrap sans pousser le
montant ; (3) cartes Principles + FAQ : l'ombre-frontière sur papier tient à
l'œil ; (4) tap des 2 CTA Feature (44 px de zone sous un visuel `sm`) ;
(5) 5ᵉ carte FAQ (la plus longue) sur SE, aucune ligne ne déborde.

## DoD — état

1. CI verte : ⏳ à relever après push (`gh pr checks <N> --watch`).
2. Sourcery **et Codex** muets ou traités sur le dernier commit : ⏳ relus
   après chaque push, tout écart traité DANS le fil.
3. Fils résolus : ⏳ (piège connu : `check-sourcery-resolved` rougit au push
   d'avant-résolution → résoudre puis `gh run rerun`).
4. `mergeStateStatus` = `CLEAN` : ⏳.
5. Ce rapport : mesures locales complètes ci-dessus ; planchers CI, scores
   Lighthouse et état des revues consignés au commentaire DoD après lecture
   de la CI.
