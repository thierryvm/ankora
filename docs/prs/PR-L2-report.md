# PR L2 — Hero « relevé corrigé » + navigation (rapport)

> @cc-fable — session du 9 août 2026, worktree `ankora-landing`, branche
> `feat/landing-hero-releve` créée depuis `origin/main` à `685d172` (après le
> merge de la PR L1 #338, vérifié `MERGED` avant la première ligne).
> Plan exécuté : `prompts/PR-LAND-refonte-releve-corrige.md` §L2. ADR-039
> approuvé par la relecture cockpit (statut et conditions consignés dans l'ADR).

## Ce que la PR livre

1. **Le wrapper `.mkt-paper`** dans `(public)/page.tsx`, autour de
   MktNav + main + MktFooter — dans la page, jamais dans un layout (une
   décision de route posée dans un layout serait gelée à la navigation).
2. **La parade flex** dans `globals.css` : `body > .mkt-paper` devient le
   maillon flex que `body > main` jouait pour les pages non enveloppées, et
   `body > .mkt-paper > main` reprend la croissance. La règle partagée
   `body > main` n'est **pas modifiée**. Écart assumé vis-à-vis de la lettre
   d'ADR-039 : le second sélecteur est `body > .mkt-paper > main` et non
   `.mkt-paper > main`, parce que `contrast-ratios.test.ts:348` prouve
   qu'aucune règle ne **commence** par le marqueur `.mkt-paper` (c'est la
   falsification qui garde son lecteur de blocs honnête). Même ensemble
   d'éléments ciblés — le wrapper est toujours enfant direct de `body`.
3. **`Hero.tsx` réécrit** : Server Component, zéro JS client, zéro animation
   d'entrée. Kicker laiton, H1 Fraunces deux phrases (28 px mobile — le
   plancher display du design system — 48 px desktop), italique laiton sur
   « déjà engagé », sous-titre qui définit le terme en langage courant, carte
   relevé (`<figure>`/`<dl>`, aria-label en langage clair), filet double,
   « Encore vraiment à toi » : 798,00 €, pied « Exemple illustratif », 2 CTA,
   ligne de confiance. Anti-PSD2 en première ligne de carte (ADR-039).
4. **`constants.ts`** : `RELEVE_DEMO { 1240, 280, 162, 798 }` ; `HERO_KPIS`,
   `HeroKpi` et `HERO_SPARKLINE` supprimés (zéro consommateur restant, vérifié
   par grep) ; `HERO_WATERFALL_DEMO` préservé (consommé par `Feature.tsx:81`) ;
   `HERO_BROWSER_DOTS` préservé par consigne du plan — **note d'écart** : le
   plan le disait consommé par `Feature.tsx`, le grep montre que son seul
   consommateur était l'ancien Hero ; il est donc dormant jusqu'à l'arbitrage
   L3 (documenté dans le fichier).
5. **i18n ×5** : `landing.hero.releve.*` (22 clés) remplace les anciennes clés
   hero dans les cinq bundles ; `landing.hero.waterfall.*` préservé tel quel ;
   nl-BE/de-DE/es-ES en copie FR (convention, dette trackée). Anciennes clés
   supprimées après grep de chaque consommateur (aucun orphelin).
6. **Tests** : `Hero.test.tsx` réécrit (12 cas, dont la typographie NBSP/U+2212
   épinglée par `textContent` brut — le normaliseur de testing-library replie
   les NBSP, un `getByText` ne peut pas les épingler) ;
   `constants.test.ts` créé (arithmétique `1240−280−162=798` + cohérence
   chiffres/bundles ×5 + invariants waterfall) ; le `test.fixme`
   BUG-iOS-HERO-OVERFLOW **levé** dans `e2e/mobile-ios/landing.spec.ts`.
7. `globals.css` : utilitaire `.bg-brand-radial` supprimé — son unique
   consommateur était l'ancien hero (grep : Hero.tsx + son test, rien d'autre).
8. Deux retouches issues des agents QA, appliquées avant push : `shadow-md`
   sur la carte (sa frontière ne tient que par l'ombre sur papier — ui-auditor)
   et `min-w-0` sur les quatre `dt` (mobile-ios-auditor).

## Portes locales — sorties

| Porte                          | Résultat                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                 | 0 erreur (9 warnings préexistants, inchangés)                                                                                                                                                                                                               |
| `npm run lint:use-server`      | ✅                                                                                                                                                                                                                                                          |
| `npm run typecheck`            | ✅                                                                                                                                                                                                                                                          |
| `npm run test`                 | **2188/2188** — via `npx vitest run --maxWorkers=4` : le premier passage plein-workers a rougi 2 cas de `settings-mfa.test.ts` qui passent seuls (11/11) et en pool réduit — contention de workers sur la machine, pas le code (signalée ici comme demandé) |
| `npm run build`                | ✅                                                                                                                                                                                                                                                          |
| `npm run dev -- -p 3200`       | `/` et `/en` en HTTP 200, zéro erreur de compilation (2 lignes INFO `AuthSessionMissingError` de visiteur anonyme, normales)                                                                                                                                |
| `npm run spell`                | 0 faute dans mes fichiers (8 préexistantes dans 3 docs hors diff ; aucun job spell en CI — vérifié dans `.github/workflows/`)                                                                                                                               |
| `prettier --check` (5 bundles) | ✅                                                                                                                                                                                                                                                          |

## Mesures DOM — serveur **prod** local (`next build` + `next start -p 3200`)

Harnais : `.playwright-mcp/measure-l2.mjs` (gitignoré), Chromium mobile
390 × 664, thème piloté par `prefers-color-scheme` (le chemin exact que
`ThemeBootScript` lit pour poser `data-theme`).

| Mesure                                                              | Clair                                                                           | Sombre                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| `data-theme` sur `<html>`                                           | absent                                                                          | `dark`                                        |
| `getComputedStyle(body).backgroundColor`                            | `rgb(250,249,246)` = papier                                                     | `rgb(11,17,32)` = navy (aucun papier de nuit) |
| Débordement horizontal (page + tous les enfants de `main`)          | 0 offender                                                                      | 0 offender                                    |
| **Payoff de la carte (bas) vs pli 664**                             | **611 px**                                                                      | **611 px**                                    |
| H1                                                                  | 28 px Fraunces                                                                  | 28 px Fraunces                                |
| `em` du H1                                                          | `#8b6914` (laiton patiné)                                                       | `#d4a017` (laiton frais)                      |
| Wrapper `body > .mkt-paper`                                         | enfant direct de body, `flex-grow:1`, colonne                                   | idem                                          |
| **Parade pied de page, page raccourcie** (sections masquées au DOM) | `pinned:true` — footer à 354 + réserve consentement 310 = 664                   | idem                                          |
| Bannière consentement                                               | par-dessus le hero, carte **blanche sur papier** (compagnon `body:has()` actif) | carte navy                                    |
| Largeurs 360 px et 320 px                                           | 0 débordement, 0 offender                                                       | — (clair seul)                                |

Cibles tactiles : les 2 CTA du hero à **48 px** ✅. Restent < 44 px des cibles
**préexistantes hors diff** : logo nav (32), hamburger (40), boutons de la
bannière consentement (38), liens « Voir un exemple »/« Comment ça marche ? »
des sections L3 (36) — aucune n'est introduite ni touchée par cette PR.

Captures (règle : capture 390 × **844**, mesures au pli **664**) :
`.playwright-mcp/l2-hero-{light,dark}-390x844.png` + `l2-hero-light-390x664.png`,
prises sur le serveur prod, bannière de consentement affichée par-dessus le
hero papier. Vérifiées à l'œil en plus des mesures : papier/encre, Fraunces,
filet double et carte blanche rendent comme la direction A le demande.

## Planchers e2e

### A/B de la spec levée — mesuré dans les deux sens, serveur prod local

| État                          | Résultat `e2e/mobile-ios/landing.spec.ts` (3 projets iPhone) |
| ----------------------------- | ------------------------------------------------------------ |
| AVEC `test.fixme` (état main) | 8 passed / 13 skipped                                        |
| SANS (cette PR)               | **11 passed / 10 skipped**                                   |

**Delta : +3 passed / −3 skipped — un par projet, lignes `hero section` vertes
sur iPhone 14 (6,4 s), 15 Pro Max (7,0 s) et SE (2,8 s).** BUG-iOS-011
(débordement page à 320 px, env-dépendant CI) ne touche pas ce test-ci sur
build prod local ; le test page-entière SE reste sous son fixme conditionnel,
inchangé.

### Suite publique complète, locale (6 projets, serveur prod)

**221 passed / 198 skipped / 10 failed en 4,1 min.** Les 10 échecs sont
triangulés et **aucun n'est de ce diff** :

- `consent-first-visit` ×3 — le clic « Se connecter » est **reçu** (ligne 130),
  c'est l'assertion post-submit qui échoue : le serveur local tourne sur le
  **vrai** Supabase/Upstash de `.env.local` (`rateLimit()` fail-closed en
  production, cf. en-tête de `scripts/e2e-auth.mjs`), là où le job CI public
  tourne sur des valeurs factices. Reproduit à l'identique en solo. Ce diff ne
  touche ni `/login`, ni l'auth, ni la bannière, ni leurs messages.
- `admin-security-headers` ×2 — `X-Robots-Tag: noindex` absent en local (posé
  par l'infra de prod), chaîne vide reçue. Headers/proxy hors diff.
- `i18n-locale-switcher` ×5 — purs timeouts (goto `/en/faq` > 15 s, teardown
  > 30 s) pendant le run parallèle à 6 workers ; **5/5 verts en 3,3 s** relancés
  > seuls sur machine calme. Aucune assertion sur une surface de ce diff.

### Planchers par job — la CI de cette PR arbitre

Planchers observés au moment du plan : **228** (public) / **41** (authentifié).
Attendu d'après le delta mesuré : public ≥ 231, authentifié inchangé (aucune
spec authentifiée, fixture, ni quarantaine touchée — `authenticated-specs.json`
intact). **Ces deux nombres seront relevés sur les jobs CI de cette PR**
(`gh run view <id> --log | grep -E "passed|skipped"`) et consignés ici avant
toute déclaration de DONE — mesurés, jamais déduits.

> **Non fait, et pourquoi** : le job authentifié n'a pas été exécuté
> localement. L'outil local (`npm run e2e:auth`) cible la **production** réelle
> (schéma + comptes éphémères + Upstash réel) — le lancer depuis cette session
> pour un diff qui ne touche aucune surface authentifiée coûte plus de risque
> qu'il n'apporte d'information ; le job CI `e2e-authenticated` (Supabase local
> éphémère) mesure exactement ce plancher sur la PR.

## Agents QA

| Agent                | Verdict                                                                                                                                                                                                                                  | Suites données                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18n-auditor`       | ✅ conforme — parité 5×(22+8) clés vérifiée clé par clé, mapping 1:1 avec les composants, NBSP/U+2212 confirmés au binaire, zéro terme banni ADR-035, anti-PSD2 présent                                                                  | 2 notes hors diff : NBSP absent des montants `waterfall` (préexistant → L3) ; couverture e2e des testids `hero-releve-card`/`hero-payoff` (transmise ici)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ui-auditor`         | 🟡 PASS_WITH_NOTES                                                                                                                                                                                                                       | **Traité** : frontière de la carte quasi invisible sur papier (carte 1,05:1, bordure 1,27:1 — paire non couverte par `contrast-ratios.test.ts`) → `shadow-sm` remplacé par `shadow-md` (sa recommandation (a)), trade-off documenté dans le composant ; renforcer le token `paper-line` serait un changement L1, hors périmètre. **Mesuré en plus** : 360 px et 320 px sans débordement (sa remarque 3). Hors diff : `<h3>` orphelin de `Feature.tsx` (→ L3), `<dl>` à groupes `<div>` (HTML5 valide, à passer VoiceOver réel — runbook iPhone)                                                                                                                                       |
| `mobile-ios-auditor` | 🟡 PASS_WITH_NOTES — wrapper confirmé **transparent** aux 5 slots `fixed` et au safe-area (chemin DOM tracé, aucun contexte de positionnement introduit) ; cibles/focus ✅ ; `text-balance`/`text-pretty`/pile mono : dégradations sûres | **Traité** : `min-w-0` ajouté aux quatre `dt` de la carte (garde structurelle contre le mot insécable — l'arithmétique tient à 320 px avec la copie du jour, la garde couvre celle que personne n'a mesurée : composés allemands à l'activation DE). **Suivis hors L2** : `overflow-x` sans `overflow-y` sur html/body promeut deux conteneurs de défilement (préexistant, ticket dédié + vérif iPhone réel — Playwright WebKit ment sur `getComputedStyle` ici, cf. fixme BUG-iOS-006) ; Fraunces sans fonte italique → l'italique du mot-clé est synthétique (motif préexistant, `FooterCTA` idem — suivi design system) ; filet `border-double` 3 px à confirmer à l'œil sur verre |

**Contrôles visuels iPhone réel demandés à @thierry** (runbook
`docs/runbooks/dev-on-iphone.md`) : (1) la ligne payoff sur SE 320 px, deux
thèmes ; (2) le filet double au zoom — deux traits, pas un trait épais ;
(3) l'italique « déjà engagé » — pas visiblement penché-synthétique ;
(4) défilement lent complet en surveillant la nav sticky (c'est le test qui
révélerait le double-scroller F1 si réel) ; (5) A2HS sur SE, l'en-tête doit
dégager la barre de statut.

## DoD — état

1. CI verte : ⏳ à relever après push (`gh pr checks <N> --watch`).
2. Sourcery : cap hebdomadaire de diff atteint depuis le 8 août — s'il n'a pas
   tourné, « silencieux » ≠ « rien trouvé » et ce sera dit tel quel ; s'il a
   tourné, chaque remarque traitée ou écartée **dans le fil**.
3. Fils résolus : ⏳.
4. `mergeStateStatus` : ⏳.
5. Ce rapport : mesures locales complètes ci-dessus ; planchers CI et état
   Sourcery consignés après lecture de la CI.

**@thierry merge. Jamais l'agent.**
