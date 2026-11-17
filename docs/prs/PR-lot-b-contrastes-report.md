# @cc-ankora — Rapport de PR : lot B, titres et contrastes (WCAG 2.2 AA)

Programme ADR-049, lot B. Branche `fix/lot-b-titres-contrastes`. Préparé le 15 novembre 2026, poussé le 16 novembre 2026.

## Ce que la PR corrige

Le lot se justifie par WCAG 2.2 AA seul. L'ADR-049 n'en donne que le contexte.

| Défaut mesuré                                                                                                                                                 | Critère              | Correctif                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`, `/signup` et quatre autres pages d'auth sans h1 : leur premier titre était le h3 de la carte                                                        | 1.3.1, 2.4.6         | `CardTitle` accepte `as="h1"` ; h1 sur les 6 pages d'auth                                                                                   |
| `/app/settings` passe du h1 aux h3                                                                                                                            | 1.3.1                | h2 sur les 5 cartes, la carte cookies et `deletion-status`                                                                                  |
| Le glossaire n'a pas de `id="main"` : le lien d'évitement ne mène nulle part                                                                                  | 2.4.1                | `id="main"` sur les deux `<main>`                                                                                                           |
| `text-brand-700` (19 usages) : #0f766e n'est pas redéclaré en sombre, 2,63:1 sur la carte sombre                                                              | 1.4.3                | `text-brand-text` (#0f766e en clair, #2dd4bf en sombre)                                                                                     |
| Jetons fantômes `text-primary-foreground` (6), `bg-secondary`, `border-input` : Tailwind ne génère rien, le texte garde l'encre, environ 3:1 sur l'aplat teal | 1.4.3                | `text-on-accent`, `bg-control`, `border-border-control`                                                                                     |
| Survol du bouton principal en `brand-600` sous du blanc : 3,75:1                                                                                              | 1.4.3                | survol en `brand-800`, appui en `brand-900` (appui toujours distinct du survol)                                                             |
| Badge « En retard » : blanc sur le rouge clair du thème sombre, 2,77:1, taille arbitraire de 11 px                                                            | 1.4.3                | `text-on-danger`, `text-xs`                                                                                                                 |
| Curseur du simulateur en `brand-400` : environ 1,65:1 sur le papier                                                                                           | 1.4.11               | utilitaire natif `accent-brand-text`                                                                                                        |
| Cases à cocher : une classe inerte (sans plugin forms) ou le bleu natif                                                                                       | 1.4.11 et cohérence  | `accent-brand-text` sur les 9 cases                                                                                                         |
| Contraste élevé : l'en-tête reste translucide à 82 % avec son flou                                                                                            | préférence système   | `@media (prefers-contrast: more)` : surface opaque, les deux préfixes du flou à `none`, bord `--color-border-control`, `.glass` sans ombres |
| Couleurs forcées : un état actif porté par un fond ou un anneau disparaît                                                                                     | 1.4.11 en mode forcé | contour `Highlight` intérieur, jamais pendant le focus                                                                                      |

S'y ajoutent trois correctifs connexes :

- La JSDoc de `Button` décrivait encore le translate et le scale retirés en septembre (ADR-049, décision 1).
- La puce du glossaire passe à 44 px de haut.
- La dette du ROADMAP « `CardTitle` rend une `<div>` » est marquée close. Elle l'était depuis le 29 juillet 2026 (6358f76).

## Preuves

### Contrastes mesurés au DOM

Mesures prises avec `getComputedStyle` à 390 × 844 dans Chromium, contre le fond composé sous l'élément. Le thème est posé par `localStorage('theme')`, c'est-à-dire le script de boot réel.

| Paire                                                                                          | Clair | Sombre |
| ---------------------------------------------------------------------------------------------- | ----- | ------ |
| Lien « Créer un compte » de `/login`                                                           | 5,47  | 7,73   |
| Lien CGU du formulaire `/signup`                                                               | 5,47  | 7,73   |
| Bouton principal au repos                                                                      | 5,47  | 5,47   |
| Bouton principal survolé (`brand-800`)                                                         | 7,58  | 7,58   |
| Bouton principal appuyé (`brand-900`)                                                          | 9,48  | 9,48   |
| Badge « En retard », à 12 px (sonde de classe)                                                 | 6,47  | 6,66   |
| `bg-brand-700` + `text-on-accent` (sonde : bannière de mise à jour, puces, feuille de dépense) | 5,47  | 5,47   |
| `text-brand-text` sur carte (sonde : nom de compte)                                            | 5,47  | 7,73   |
| Case à cocher de `/signup` (couleur d'accent)                                                  | 5,47  | 7,73   |
| Curseur du simulateur sur `/` (couleur d'accent)                                               | 5,28  | 8,46   |
| Puce du glossaire au repos                                                                     | 14,06 | 10,06  |
| Puce du glossaire survolée                                                                     | 7,58  | 7,58   |

Les écrans authentifiés (comptes, charges, réglages, feuille de dépense) ont été mesurés par **sonde de classe**. Le même jeu de classes est injecté dans une carte de `/login`, et la sonde prouve la résolution des jetons dans les deux thèmes, pas le rendu du composant. Aucune pile Supabase locale n'était disponible (Docker arrêté), et `e2e:auth` vise la production : je ne l'ai pas lancé.

### Gardes ajoutées

- **`contrast-ratios.test.ts`** :
  - les paires peintes : `on-accent` sur `brand-800` et `brand-900`, `brand-text` sur la carte et sur la page, l'accent à 3:1 ;
  - deux témoins qui doivent rester rouges : `brand-700` sur la carte sombre, et le blanc sur `brand-600` ;
  - le remap admin ;
  - les blocs `prefers-contrast` et `forced-colors`.
- **`classes-de-contraste.test.ts`** :
  - il refuse dans `src/` les familles retirées, après retrait des commentaires par un scanner qui reconnaît les chaînes ;
  - chaque famille a un témoin qui prouve que la garde peut échouer ;
  - les commentaires, `decoration-brand-700` et `shadow-brand-700` passent.
- **`card.test.tsx`** : h3 par défaut, puis h1, h2 et h4 sur demande.
- **Falsification** : avec un préfixe de flou retiré et `:not(:focus-visible)` retiré dans une copie, 3 cas rougissent. La feuille a été restaurée.

### Portes locales (arbre fusionné avec `origin/main`)

- `npm run lint` : 0 erreur. Les 26 avertissements existent déjà ; aucun n'est sur une ligne modifiée.
- `npm run lint:use-server` : vert.
- `npm run typecheck` : 0 erreur.
- `npm run test` : 274 fichiers, **4011 cas**.
  - Sous charge, quelques tests de balayage du dépôt dépassent leur délai (`depot-public-sans-budget-reel`, `RythmeDuMois`, `Sheet.keyboard`, `brand`).
  - Chacun passe seul. Ce défaut existe déjà, il n'a pas été introduit ici.
  - Ma garde dépassait aussi. Elle est optimisée : 251 ms au lieu de 5,7 s.
- `npm run build` : succès.
  - Au premier essai, Next.js a bloqué le build une fois pour signaler un avis de sécurité (voir plus bas). Il prévoit lui-même une relance, qui a abouti.
- Serveur de production local sur un port dédié : `/`, `/login`, `/signup`, `/forgot-password`, `/glossaire` et `/glossaire/budget-de-lissage` répondent 200 ; `/app/settings` répond 307, la redirection vers la connexion.

### Planchers e2e

- **Public**, mesuré en local contre le serveur de production de l'arbre fusionné, avec `--workers=1` comme en CI : **323 réussis**, 1 échec, 336 sautés.
  - La nouvelle spec y compte pour **13** : 3 h1 × 3 projets, plus 2 cas d'émulation × 2 projets Chromium.
  - Sans elle, le même arbre donne donc 310.
  - L'échec, `consent-first-visit:110` sous Safari mobile, est intermittent (2 sur 3 en le répétant seul). La capture montre l'alerte « Service temporairement indisponible » : en local, Upstash est factice, et en production le limiteur échoue fermé. Cette spec et le formulaire de connexion ne sont pas touchés, et le premier passage complet, avant la fusion de `main`, donnait 0 échec.
  - Le plancher qui fait foi est celui du job CI : celui du job `Playwright E2E` (attendu : plancher de `main` + 13, relevé dans le commentaire de DoD).
- **Authentifié** : non mesurable en local (pas de Docker) et non lancé contre la production. Le plancher se lit dans le job CI `Playwright E2E (authenticated)`. La quarantaine `e2e/authenticated-specs.json` est inchangée.

La nouvelle spec `e2e/a11y-headings-contrast.spec.ts` est publique et importe le `test` de base, pas la fixture partagée.

- Un seul h1, qui nomme la page, sur `/login`, `/signup` et `/forgot-password` : 3 cas × 3 projets.
- L'en-tête de la landing devient opaque sous contraste élevé émulé. Le cas mesure d'abord sans émulation, pour ne pas passer à vide.
- Un état actif garde un contour en couleurs forcées émulées, également après une mesure de départ.
- Les deux cas d'émulation tournent sous Chromium (desktop et Pixel). Ils sont sautés sous WebKit, qui n'émule pas ces préférences.

## Audits

- **`plan-reviewer`** (Opus) : premier verdict 🔴, sur la forme seulement (DoD incomplète). Les 7 corrections ont été appliquées, puis le verdict est passé à 🟡 avec une modification : le cas de contraste élevé vise `/`, avec une mesure de départ. La modification est intégrée.
- **`mobile-liquid-glass-auditor`** : PASS, 0 bloquant. Les ombres de `.glass` sous contraste élevé ont été retirées. Une preuve e2e en couleurs forcées a été ajoutée.
- **`ui-auditor`** : PASS avec remarques, 0 bloquant.
  - Appliqué : l'accent sur les 5 cases restantes, et 44 px pour la puce du glossaire.
  - En suivi :
    - `tabIndex={-1}` sur les `<main>` ;
    - la taille du h1 d'auth (18 px, choix de design à confirmer) ;
    - l'état d'appui des boutons faits à la main (`offline`, `ScrollToTop`, `toast`, `AccountButton`) ;
    - `HeaderNav`, hors périmètre, que réécrit le lot D-a.

## Hors périmètre, avec propriétaire

- **`docs/design/token-usage.md:26`** cite encore `text-brand-700` en exemple. Propriétaire : le lot de documentation de l'ADR-049 (Thierry).
- **En couleurs forcées**, les contrôles en `focus-visible:outline-none` + anneau perdent leur focus, car l'anneau est une ombre, que le mode forcé retire. Ce défaut existe déjà ; suivi à part.
- **Avis de sécurité GHSA-mfr8-8qww-v76h** (modéré) : Next 16.3.0 à 16.4.4, divulgation d'informations entre paramètres racine quand une fonction `use cache` passe par `unstable_cache()`. Le correctif est en 16.4.6, un patch. Il relève d'une **PR sécurité dédiée** depuis `main`, pas de ce lot.
- **La coche de `ChargesClient`** (aplat `brand-600` sous du blanc) est un élément non textuel, au-dessus de 3:1 : non touchée.

## Diff

```
 docs/ROADMAP.md                                    |  10 +-
 e2e/a11y-headings-contrast.spec.ts                 |  91 +++++++++++
 src/app/[locale]/(auth)/forgot-password/page.tsx   |   2 +-
 src/app/[locale]/(auth)/login/2fa/page.tsx         |   2 +-
 src/app/[locale]/(auth)/login/page.tsx             |   4 +-
 src/app/[locale]/(auth)/reset-password/page.tsx    |   2 +-
 src/app/[locale]/(auth)/signup/SignupForm.tsx      |   8 +-
 .../[locale]/(auth)/signup/check-email/page.tsx    |   4 +-
 src/app/[locale]/(auth)/signup/page.tsx            |   4 +-
 .../[locale]/(public)/glossaire/[slug]/page.tsx    |   4 +-
 src/app/[locale]/(public)/glossaire/page.tsx       |   2 +-
 src/app/[locale]/app/accounts/AccountsClient.tsx   |   2 +-
 src/app/[locale]/app/charges/ChargesClient.tsx     |   2 +-
 src/app/[locale]/app/page.tsx                      |   2 +-
 .../app/settings/CookiesPreferencesSection.tsx     |   6 +-
 src/app/[locale]/app/settings/SettingsClient.tsx   |  12 +-
 .../[locale]/app/settings/deletion-status/page.tsx |   2 +-
 src/app/[locale]/onboarding/OnboardingWizard.tsx   |   2 +-
 src/app/__tests__/classes-de-contraste.test.ts     | 175 +++++++++++++++++++++
 src/app/__tests__/contrast-ratios.test.ts          | 174 ++++++++++++++++++++
 src/app/global-error.tsx                           |   4 +-
 src/app/globals.css                                |  66 +++++++-
 src/app/not-found.tsx                              |   6 +-
 .../dashboard/ProvisionHealthGaugeCard.tsx         |   4 +-
 src/components/expenses/AddExpenseSheet.tsx        |   6 +-
 src/components/expenses/MergeCategoriesSheet.tsx   |   6 +-
 src/components/expenses/PaidFromChips.tsx          |   2 +-
 src/components/features/AccountCard.tsx            |   2 +-
 src/components/layout/BottomTabBar.tsx             |   2 +-
 src/components/layout/Prose.tsx                    |   2 +-
 .../landing/sections/WhatIfDemoClient.tsx          |   2 +-
 .../sections/__tests__/WhatIfDemoClient.test.tsx   |   2 +-
 src/components/operations/AmountSheet.tsx          |   2 +-
 src/components/operations/IncomeButton.tsx         |   2 +-
 src/components/pwa/UpdateBanner.tsx                |   2 +-
 src/components/ui/__tests__/card.test.tsx          |  12 ++
 src/components/ui/button.tsx                       |  30 ++--
 src/components/ui/card.tsx                         |   8 +-
 38 files changed, 593 insertions(+), 77 deletions(-)
(+ ce rapport et la ligne B du ROADMAP)
```

## Définition de DONE

Relevée après le dernier push, en commentaire de la PR #551. Ce rapport est figé avant la CI pour ne pas relancer une seconde fois toute la chaîne.

1. CI verte (Lint, Typecheck, Tests, E2E public et authentifié, Security, Build), avec les deux planchers lus dans les journaux.
2. Sourcery et Codex silencieux sur le dernier commit, fils résolus ou refusés dans le fil.
3. Revue humaine approuvée.
4. Aucun conflit avec `main`, `mergeStateStatus` CLEAN.
5. Ce rapport.
