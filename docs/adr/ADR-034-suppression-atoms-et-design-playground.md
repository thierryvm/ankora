# ADR-034 — Suppression de `src/components/atoms/` et de `/design-playground`

- **Statut** : Accepted
- **Date** : 2026-07-29
- **Accepté le** : 2026-07-29 par Thierry vanmeeteren — décision Q6 de [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md), approuvée explicitement avant ouverture du chantier
- **Proposé par** : @cowork (arbitrage produit `DECISIONS-ANKORA.md`) + @cc-ankora (relevé factuel des call-sites)
- **Deciders** : Thierry vanmeeteren, @cowork, @cc-ankora
- **Tags** : `architecture`, `design-system`, `components`, `dead-code`
- **Portée** : Chantier 1 « nettoyage + vocabulaire » (C1)
- **Supersède** : [ADR-020](ADR-020-atoms-vs-ui-canonical-frontier.md) (Accepted, 2026-05-18)

> **Glossaire des handles** (@cowork, @cc-design, @cc-ankora, @thierry) — source canonique : [`docs/design/trio-agents.md`](../design/trio-agents.md).

---

## Contexte & problème

ADR-020 avait tranché, le 18 mai 2026, une **frontière fonctionnelle** entre deux dossiers de composants :

- `src/components/atoms/` = identité visuelle Ankora CD#3 (11 composants livrés par @cc-design le 9 mai, PR #147) ;
- `src/components/ui/` = infrastructure form/feedback Radix (shadcn).

Cette décision était juste **au moment où elle a été prise** : elle a débloqué PR-D6/D7 pour la Beta du 10 juin sans jeter le travail design. Deux mois et demi plus tard, le constat mesuré est différent.

### Ce qui est mesuré au 29 juillet 2026

| Mesure                                              | Valeur                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Fichiers sous `src/components/atoms/`               | **25** (4 788 lignes, dont 1 042 de `atoms.css` et 2 054 de tests) |
| Fichiers sous `src/app/[locale]/design-playground/` | **14** (368 lignes)                                                |
| Atoms sur 11 ayant **zéro** call-site de production | **8 / 11**                                                         |
| Écrans du cockpit (`/app/*`) important un atom      | **1 / 8** (`ProvisionHealthGaugeCard` → `ProgressBar`)             |
| Issues GitHub P0/P1 ouvertes sur ces composants     | **7** (#150-#152, #154-#157), ouvertes depuis ~80 jours            |

**Les 3 call-sites réels** — et c'est le point que l'audit technique du 29/07 avait sous-estimé (il en annonçait 2, « dans l'admin ») :

| Composant         | Call-site                                                             | Zone                       |
| ----------------- | --------------------------------------------------------------------- | -------------------------- |
| `ThemeToggle`     | `src/app/[locale]/admin/_components/AdminTopbar.tsx:4`                | admin                      |
| `LangSwitcher`    | `src/app/[locale]/admin/_components/_client/LangSwitcherClient.tsx:5` | admin                      |
| **`ProgressBar`** | **`src/components/dashboard/ProvisionHealthGaugeCard.tsx:5`**         | **production utilisateur** |

Le troisième n'est pas anodin : le « Pattern d'usage canonique » d'ADR-020 (l.122-144) montre précisément `<ProgressBar tone="success">` à l'intérieur d'une `Card` de `ui/`, et `ProvisionHealthGaugeCard.tsx:174-177` est ce code **au mot près**. **ADR-020 ne décrit donc pas de la doctrine périmée : il décrit du code vivant.** Le superséder est un renversement d'architecture assumé, pas du ménage.

### Le problème que la frontière d'ADR-020 n'a pas résolu

Une bibliothèque qu'aucun écran n'importe ne peut pas produire d'incohérence entre écrans — mais elle coûte : CI, typecheck, bundle, revue, et surtout **7 issues P0/P1 qui signalent un incendie dans une pièce vide**, masquant les vraies priorités du backlog. Le cleanup annoncé par `docs/plans/PR-D4-PHASE2-A.md:18` (« Cleanup en PR-D / PR-D5 ») n'a jamais été exécuté.

## Decision drivers

| Driver                                    | Pourquoi c'est décisif                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Coût de maintenance d'un code non exécuté | 4 788 + 368 lignes traversent chaque CI, chaque typecheck, chaque revue, pour zéro valeur utilisateur                                   |
| Backlog lisible                           | 7 issues P0/P1 sur des composants morts rendent la priorisation impossible                                                              |
| Git est déjà la référence visuelle        | `git show <sha>:src/components/atoms/Drawer.tsx` restitue le fichier en une seconde, pour toujours                                      |
| Le contrat vaut plus que l'implémentation | Les 634 lignes de `Drawer.test.tsx` valent comme **spécification** de la future primitive `<Sheet>`, pas comme test d'un composant mort |
| Ne pas casser la production               | Les 3 call-sites réels doivent être migrés proprement, pas contournés                                                                   |

## Considered options

### Option A — Garder `atoms/` comme référence visuelle, sortir seulement `/design-playground` du bundle

**Rejetée.** C'est l'option 2 de la question Q6 de `DECISIONS-ANKORA.md`, explicitement réfutée : garder du code mort dans `main` pour « pouvoir le regarder » paie un coût de maintenance permanent contre un bénéfice que le contrôle de version fournit gratuitement.

### Option B — Brancher les atoms pour de vrai

**Rejetée.** ≈ +10 jours, et ne règle aucune des trois douleurs produit identifiées par l'audit (vocabulaire, absence de primitive de surface, couche plateforme Next 16).

### Option C — Supprimer `atoms/` et `/design-playground`, après migration des 3 call-sites et récolte du contrat de `Drawer` ⭐

**Retenue.**

## Decision

**Supprimer `src/components/atoms/` et `src/app/[locale]/design-playground/`.**

Conditions d'exécution, non négociables :

1. **Migrer les 3 call-sites réels avant suppression**, vers `src/components/ui/` :
   - `ProgressBar` → `src/components/ui/progress.tsx`, **réduit à l'API réellement consommée** (`value`, `max`, `tone`, `size`, `label`, `showValue`). Les modes `split`, `sub`, `valueLabel`, `showCap` ont zéro usage et ne sont pas portés.
   - `ThemeToggle` → `src/components/ui/theme-toggle.tsx`
   - `LangSwitcher` → `src/components/ui/lang-switcher.tsx`
2. **Conserver la contrainte CSP de `ProgressBar` telle quelle** : la géométrie de remplissage passe par un `<rect>` SVG en unités viewBox, **jamais** par un `style={{ width }}` inline — la CSP stricte `style-src 'self' 'nonce-…'` le bloquerait (THI-322).
3. **Récolter le contrat comportemental de `atoms/__tests__/Drawer.test.tsx`** (634 lignes) dans `docs/specs/sheet-primitive-contract.md` **avant** destruction. Ce qui est jeté, c'est l'implémentation ; ce qui est gardé, c'est le contrat — y compris ses **quatre trous mesurés** (le test ne couvre ni focus trap, ni `aria-modal`, ni scroll-lock, ni safe-area), qui deviennent des exigences explicites de la future primitive.
4. **Zéro règle CSS réinjectée.** L'`@import '../components/atoms/atoms.css'` de `src/app/globals.css:560` disparaît sans compensation : les classes `.atm-*` n'apparaissent que sous `atoms/`, à l'unique exception d'une chaîne-fixture de `cn()` dans `src/lib/__tests__/utils.test.ts:35,40`. Jalon de sortie : `grep -r "atm-" src/` → 0 hors cette fixture. Sans cette règle, les 1 042 lignes reviendraient une règle à la fois.
5. **Fermer les 7 issues P0/P1** (#150-#152, #154-#157) en référençant cet ADR.

### Ce qui n'est PAS supprimé, et pourquoi

**`src/components/ui/{dialog,form,sheet,switch}.tsx`** ont 0 call-site de production, mais **restent**. `docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md:976` exige pour eux « une décision explicite en ADR-028, pas une suppression silencieuse — sans arbitrage : les garder ». @thierry n'a pas rendu cet arbitrage, et le brief du chantier 1 ne les mentionne pas. On les garde. (`src/components/ui/form.tsx:14` importe encore `react-hook-form`, gelé et non mort pour cette raison.)

## Conséquences positives

- ≈ **−5 150 lignes** de code non exécuté
- Backlog : 7 issues P0/P1 fantômes fermées
- `ProgressBar` reste disponible, dans le dossier canonique survivant, avec une surface d'API réduite à ce qui sert
- Le contrat de la future primitive `<Sheet>` est écrit et daté, au lieu d'être un test à exhumer

## Conséquences négatives / risques

- ⚠️ **Renversement d'une décision consignée.** `2026-07-26-ankora-refonte-v2-plan.md:977` classait `design-playground` en « non-suppression documentée (étape 5) », comme outil de validation visuelle d'une étape 17 à venir. Cet ADR renverse cette position sur arbitrage @thierry du 29/07. La raison qui emporte la décision : les 14 fichiers du playground importent **exclusivement** depuis `atoms/` — une fois `atoms/` supprimé, le playground n'a plus rien à montrer. Les deux décisions sont une seule.
- ⚠️ **Le plancher e2e public baisse.** `e2e/design-playground.spec.ts` (1 cas, `test.skip` sur webkit) disparaît, soit 2 exécutions perdues sur les projets `chromium-desktop` et `mobile-chrome`. `CLAUDE.md` autorise la suppression d'une spec obsolète **à condition qu'elle soit déclarée** : elle l'est ici, et le nouveau plancher est **mesuré, pas déduit**.
- ⚠️ **Dette assumée sur `ci.yml`.** `.github/workflows/ci.yml:88` porte `ANKORA_PLAYGROUND_ENABLED: 'true'` pour cette seule spec. Modifier un workflow GHA dans une PR feature est **banni** (`CLAUDE.md`, banned list du 2026-05-27, item 3). La variable est donc laissée inerte — sans danger, `src/lib/env.ts` validant un objet non-strict — et son retrait est **une dette explicite pour une PR d'infrastructure dédiée**. En revanche `src/lib/env.ts:39` et `.env.example:17` sont des fichiers ordinaires, non bannis : la variable y est supprimée maintenant.
- ⚠️ Perte de la vitrine visuelle des composants. Mitigation : `git show`, et la primitive `<Sheet>` à venir portera sa propre couverture.

## Conformité doctrinale — pourquoi ce n'est pas la banned-list §2

`CLAUDE.md` (banned list du 2026-05-27, item 2) interdit « une décision architecturale prise **dans la même session** que l'implémentation » et impose : _session N, décision écrite dans un ADR ; session N+1, exécution. Cooldown forcé._

Cet ADR est écrit et committé dans la même série de commits que le code qu'il gouverne. Ce n'en est pas une violation, pour une raison précise : **la décision n'a pas été prise ici.** Elle a été arbitrée par @thierry le 29/07/2026 dans un acte distinct et antérieur — [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md), question Q6 — au terme d'un audit technique lui aussi antérieur. Cet ADR **transcrit** cette décision dans le dépôt ; il ne l'invente pas.

Deux garde-fous rendent la distinction vérifiable plutôt que déclarative :

1. Le document d'arbitrage est **committé dans le même commit que l'ADR** (`docs/specs/2026-07-29-decisions-ankora.md`, `docs/audits/2026-07-29-audit-ankora.md`). Un ADR qui cite une autorité introuvable ne vaut rien — c'est précisément le reproche que ce chantier adresse par ailleurs au commentaire de `src/app/__tests__/globals-tokens.test.ts:47`, qui invoque un ADR-005 ne contenant aucune des valeurs qu'il prétend justifier.
2. Le commit qui porte les ADR ne contient **aucun** fichier `src/`, `supabase/` ou `messages/` — critère de sortie repris de `docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md:514`. La décision et son exécution restent séparables et révertibles indépendamment.

## Refs

- **Arbitrage produit** : [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md) §Q6
- **Audit technique** : [`docs/audits/2026-07-29-audit-ankora.md`](../audits/2026-07-29-audit-ankora.md) §1 et §2
- ADR supersédé : [ADR-020](ADR-020-atoms-vs-ui-canonical-frontier.md)
- Décision renversée : `docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md:977`
- Diagnostic interne antérieur jamais suivi d'effet : `docs/audits/2026-05-17-thi-189-atoms-vs-ui-diagnostic.md`
- Contrat récolté : [`docs/specs/sheet-primitive-contract.md`](../specs/sheet-primitive-contract.md)
