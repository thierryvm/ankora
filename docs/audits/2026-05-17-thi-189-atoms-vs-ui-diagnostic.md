# THI-189 — Diagnostic `atoms/` vs `ui/` (lecture seule)

**Date** : 2026-05-17
**Agent** : @cc-ankora (Opus 4.7)
**Linear** : [THI-189](https://linear.app/) — High priority, bloquant PR-D6/D7
**Scope** : diagnostic factuel + propositions architecturales, **aucune migration ni PR ouverte**.
**Décideurs** : @cowork (ADR) + @thierry (arbitrage final).

---

## TL;DR exécutif (10 lignes)

1. Il n'y a **pas de fragmentation accidentelle**. Le plan [`docs/plans/PR-D4-PHASE2-A.md`](../plans/PR-D4-PHASE2-A.md) (ligne 18) documente explicitement une **cohabitation temporaire** entre shadcn legacy (`ui/`) et le nouveau design system Ankora CD#3 (`atoms/`), avec « cleanup en PR-D / PR-D5 » jamais effectué.
2. **2 doublons réels** : `Button` et `Card`. Les APIs sont **fondamentalement incompatibles** (atoms = props monolithiques `tone | padding | elevation` ; ui = composition shadcn `<Card><CardHeader><CardTitle>`). Pas un simple alias.
3. **Aucun cross-import** atoms↔ui détecté (vérifié sur 101 occurrences dans 51 fichiers).
4. **Asymétrie d'API** : `atoms/` a un barrel (`index.ts`), `ui/` impose un import file-by-file (convention shadcn).
5. **Convention nommage divergente** : PascalCase pour atoms, lowercase pour ui (shadcn standard).
6. **Distribution call-sites** : `ui/` utilisé par **~38 call-sites prod** (dashboard, auth, marketing, settings). `atoms/` utilisé par **14 call-sites** : 12 demos vitrine + 2 widgets admin (`ThemeToggle`, `LangSwitcher`).
7. **Composants exclusifs atoms/** (10) : Avatar, Chip, ColorPicker, Drawer, IconPicker, LangSwitcher, ProgressBar, Tabs, ThemeToggle, icons.
8. **Composants exclusifs ui/** (12) : breadcrumb, dialog, eyebrow, form, glass, input, label, num, row, select, sheet, switch, toast.
9. **Recommandation @cc-ankora** : **Option C** (frontière fonctionnelle stricte, pas migration brutale) avec règle « `atoms/` = primitives Ankora CD#3 réutilisables, `ui/` = composants shadcn-style composables (forms, dialogs, toasts) ». Effort minimal, désambiguïse Button/Card par renommage ciblé.
10. **Pré-requis avant PR-D6** : ADR signée + frontière documentée. Migration physique optionnelle, peut s'étaler en PR-D7+ par lots.

---

## 1. Inventaire factuel

### 1.1 `src/components/atoms/` (11 atoms + 1 barrel + 1 icons)

| Composant           | Fichier                     | Test | Call-sites prod                        | Call-sites vitrine              |
| ------------------- | --------------------------- | ---- | -------------------------------------- | ------------------------------- |
| Avatar              | `Avatar.tsx`                | ✅   | 0                                      | 1 (AvatarDemo)                  |
| Button              | `Button.tsx`                | ✅   | 0                                      | 2 (ButtonDemo, DrawerDemo)      |
| Card                | `Card.tsx`                  | ✅   | 0                                      | 2 (CardDemo, PlaygroundSection) |
| Chip                | `Chip.tsx`                  | ✅   | 0                                      | 1                               |
| ColorPicker         | `ColorPicker.tsx`           | ✅   | 0                                      | 1                               |
| Drawer (EditDrawer) | `Drawer.tsx`                | ✅   | 0                                      | 1                               |
| IconPicker          | `IconPicker.tsx`            | ✅   | 0                                      | 1                               |
| LangSwitcher        | `LangSwitcher.tsx`          | ✅   | **1** (`LangSwitcherClient.tsx` admin) | 1                               |
| ProgressBar         | `ProgressBar.tsx`           | ✅   | 0                                      | 1                               |
| Tabs                | `Tabs.tsx`                  | ✅   | 0                                      | 1                               |
| ThemeToggle         | `ThemeToggle.tsx`           | ✅   | **1** (`AdminTopbar.tsx`)              | 1                               |
| icons.ts            | const lib `ANKORA_ICON_LIB` | —    | indirect via IconPicker                | —                               |
| `index.ts`          | barrel                      | —    | —                                      | —                               |

**Tests** : 11/11 atoms ont leur fichier `__tests__/<Name>.test.tsx`. Couverture présumée OK (à confirmer via `npm run test:coverage` hors scope).

### 1.2 `src/components/ui/` (13 composants, **pas de barrel**)

| Composant  | Fichier          | Test | Call-sites prod (approx)                                              |
| ---------- | ---------------- | ---- | --------------------------------------------------------------------- |
| breadcrumb | `breadcrumb.tsx` | ❌   | 1 (`glossaire/[slug]/page.tsx`)                                       |
| button     | `button.tsx`     | ✅   | **~20** (auth, dashboard, marketing, settings)                        |
| card       | `card.tsx`       | ✅   | **~13** (dashboard, settings, auth, features)                         |
| dialog     | `dialog.tsx`     | ❌   | indirect via sheet                                                    |
| eyebrow    | `eyebrow.tsx`    | ✅   | 3 (Hero, Feature, Pricing)                                            |
| form       | `form.tsx`       | ❌   | (auto-import via Label)                                               |
| glass      | `glass.tsx`      | ✅   | 2 (Hero, WhatIfDemo)                                                  |
| input      | `input.tsx`      | ✅   | **~7** (auth forms, settings, charges, expenses, accounts, simulator) |
| label      | `label.tsx`      | ✅   | **~7** (idem input)                                                   |
| num        | `num.tsx`        | ✅   | 3 (Hero, Feature, Pricing, WhatIfDemoClient)                          |
| row        | `row.tsx`        | ✅   | 1 (Hero)                                                              |
| select     | `select.tsx`     | ✅   | **~4** (charges, expenses, settings, simulator, onboarding)           |
| sheet      | `sheet.tsx`      | ❌   | —                                                                     |
| switch     | `switch.tsx`     | ❌   | —                                                                     |
| toast      | `toast.tsx`      | ❌   | **~6** (layout, settings, features, charges, expenses, accounts)      |

**Asymétrie tests** : `ui/` n'a pas de test pour breadcrumb, dialog, form, sheet, switch, toast (composants Radix-based, possiblement délégués à Radix).

### 1.3 Cross-imports

- **atoms → ui** : aucun (vérifié grep).
- **ui → atoms** : aucun (vérifié grep).
- **ui → ui** : `ui/form.tsx` importe `ui/label.tsx` (OK, interne shadcn).
- **Hors `components/`** : tous les call-sites sont sous `src/app/[locale]/` ou `src/components/{dashboard,features,marketing,layout,auth}/`.

---

## 2. Patterns de fragmentation observés

### 2.1 Pattern A — Doublons à API incompatibles (`Button`, `Card`)

**Symptôme** : même nom de composant, deux fichiers, deux philosophies.

| Aspect      | `atoms/Button.tsx` (CD#3)                   | `ui/button.tsx` (shadcn)                   |
| ----------- | ------------------------------------------- | ------------------------------------------ | ----- | ------------ | -------- | ----------- | ------- | ----- | --------------- |
| Variants    | `primary                                    | secondary                                  | ghost | destructive` | `default | destructive | outline | ghost | link` (via cva) |
| Sizes       | `sm                                         | md                                         | lg`   | `default     | sm       | lg          | icon`   |
| Props extra | `icon`, `iconRight`, `loading`              | `asChild` (Slot Radix)                     |
| Style       | classes statiques `atm-button-*` + Tailwind | cva + tokens shadcn (`bg-brand-700`, etc.) |
| forwardRef  | ✅ custom                                   | ✅ implicite                               |

| Aspect                   | `atoms/Card.tsx` (CD#3)          | `ui/card.tsx` (shadcn)                                                    |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------- | ---- | ------- | ----- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| Modèle                   | **monolithique** (props `padding | elevation                                                                 | tone | eyebrow | title | footer`) | **composable** (`<Card><CardHeader><CardTitle>...</CardTitle></CardHeader><CardContent>...</CardContent></Card>`) |
| Sous-composants exportés | aucun                            | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| Tone/elevation           | props CSS variants               | classes manuelles                                                         |

**Conséquence** : impossible de migrer un call-site `ui/card` → `atoms/Card` sans réécrire le JSX (passage de composition à props).

### 2.2 Pattern B — Convention nommage + barrel divergents (shadcn vs Ankora CD#3)

| Aspect      | `atoms/`                                            | `ui/`                                                  |
| ----------- | --------------------------------------------------- | ------------------------------------------------------ |
| Fichiers    | PascalCase (`Button.tsx`)                           | lowercase (`button.tsx`)                               |
| Imports     | `import { Button } from '@/components/atoms'`       | `import { Button } from '@/components/ui/button'`      |
| Barrel      | ✅ `index.ts` typé (exports nominaux + types)       | ❌ pas de barrel                                       |
| Style code  | function components + `forwardRef` ponctuel         | `forwardRef` systématique (shadcn)                     |
| Dépendances | zéro Radix dans Button/Card/Avatar/Chip/ProgressBar | Radix sur button/select/dialog/sheet/switch/toast/form |

**Conséquence** : pas une simple "préférence de style". `ui/` est ancré dans l'écosystème Radix (form, select, toast nécessitent les primitives Radix). `atoms/` est volontairement Radix-free pour les primitives visuelles.

### 2.3 Pattern C — Surface fonctionnelle distincte (peu de chevauchement réel)

Hors `Button` et `Card`, les deux dossiers ne couvrent **pas les mêmes besoins** :

- `atoms/` couvre : **identité visuelle Ankora CD#3** (Avatar, Chip, ColorPicker, IconPicker, ProgressBar, Tabs, ThemeToggle, LangSwitcher, EditDrawer générique).
- `ui/` couvre : **infrastructure form & feedback** (input, label, select, form, breadcrumb, toast, dialog, sheet, switch + primitives marketing Eyebrow, Glass, Num, Row).

→ **Le vrai chevauchement est limité à 2 composants sur 24 distincts** (~8%). Le reste est complémentaire, pas dupliqué.

---

## 3. Options architecturales

### Option A — Tout migrer vers `ui/` (shadcn-style canonical)

**Principe** : abandonner `atoms/`, normaliser shadcn comme seul layer primitives.

**Pros** :

- Cohérence avec écosystème shadcn (génération CLI, composants tiers, registry).
- Suppression nette de l'ambiguïté.
- Convention bien documentée hors-projet.

**Cons** :

- Perte des 11 atoms Ankora CD#3 livrés en PR-D4-PHASE2-A (pack design Claude Design Session #3 = travail design important).
- Réécriture des 12 demos playground + AdminTopbar + LangSwitcherClient.
- Réécriture du système `atm-*` CSS (`atoms.css` importé dans `globals.css:432`).
- Perte de l'API monolithique (`tone | padding | elevation`) qui correspond aux specs design Ankora.

**Effort estimé** : **4-5 jours** (réécrire atoms en shadcn-compat + tous les tests + tous les call-sites + supprimer atoms.css + auditeurs UI complets).

**Fichiers impactés** : ~30 (11 atoms supprimés + 14 call-sites migrés + 11 tests + globals.css + atoms.css + plan PR-D4-PHASE2-A doc à archiver).

**Risque** : régression design Ankora (retour vers look shadcn générique). Va à contre-courant du travail Cowork sur l'identité visuelle.

---

### Option B — Tout migrer vers `atoms/` (atomic design canonical)

**Principe** : tout passer en Ankora CD#3, supprimer `ui/`.

**Pros** :

- Cohérence avec design system Ankora.
- Barrel propre.
- Identité visuelle 100% Ankora partout.

**Cons** :

- **Très gros effort** : ~38 call-sites prod à migrer.
- Recréer en interne tous les wrappers Radix (form, select, dialog, sheet, toast) sans réutiliser shadcn. Risque a11y/keyboard navigation important.
- Recréer composants marketing (Glass, Num, Eyebrow, Row) en atoms/ alors qu'ils sont déjà alignés Ankora visuellement.
- Réécriture de `Card` composable → monolithique ou inverse (rupture API massive).
- Risque conflit avec workflow handoff @cc-design (qui produit déjà du shadcn dans certains exports).

**Effort estimé** : **10-15 jours** (réécriture infrastructure form/select/dialog + tous call-sites + tests + a11y).

**Fichiers impactés** : ~60 (13 ui/ supprimés + 38 call-sites + 9 tests ui/ + form/select/dialog recréés en atoms/ + toast/sheet/switch).

**Risque** : très élevé (réintroduction bugs a11y déjà résolus par Radix, perte du référentiel shadcn pour futurs handoff cc-design).

---

### Option C ⭐ — Frontière fonctionnelle stricte + désambiguïsation ciblée (RECOMMANDÉE)

**Principe** : formaliser la coexistence par une **règle de séparation fonctionnelle**, et résoudre les 2 vrais doublons par renommage explicite.

**Règle proposée** :

- **`src/components/atoms/`** : **primitives visuelles Ankora CD#3** réutilisables, identité de marque (Avatar, Chip, ColorPicker, IconPicker, ProgressBar, Tabs, ThemeToggle, LangSwitcher, EditDrawer). Pas de dépendance Radix. Barrel `index.ts` obligatoire. PascalCase fichiers. Props monolithiques (`tone | padding | elevation`).
- **`src/components/ui/`** : **infrastructure form, feedback, marketing primitives** (Input, Label, Form, Select, Toast, Dialog, Sheet, Switch, Breadcrumb, Eyebrow, Glass, Num, Row). Convention shadcn (lowercase, cva, Slot, Radix). Imports file-by-file.
- **Doublons Button + Card** : renommer côté atoms/ pour lever l'ambiguïté lexicale :
  - `atoms/Button.tsx` → `atoms/AnkButton.tsx` (export `AnkButton`) **OU** garder le nom mais documenter via ADR + lint-rule que les call-sites prod utilisent `ui/button` et la vitrine `atoms/Button`.
  - Idem `Card` → `AnkCard`.

**Pros** :

- Effort minimal (renommage + 14 imports + docs).
- Préserve les deux systèmes (CD#3 identité + shadcn infrastructure).
- Cohérent avec le plan PR-D4-PHASE2-A original (cohabitation documentée).
- Pas de réécriture form/select/dialog (Radix conservé pour a11y).
- Pas de perte design CD#3.
- Débloque immédiatement PR-D6/D7 (frontière connue).

**Cons** :

- Garde la complexité conceptuelle (2 dossiers).
- Nécessite un ADR + lint-rule pour empêcher la dérive (ex: `eslint-plugin-import` no-restricted-paths).
- Renommage AnkButton/AnkCard peu élégant (préfixe).

**Effort estimé** : **0.5-1 jour** :

- ADR `docs/adr/0001-atoms-vs-ui-frontier.md` (@cowork écrit, @thierry valide).
- Renommage `atoms/Button.tsx` → `atoms/AnkButton.tsx` (2 call-sites vitrine à fixer : ButtonDemo, DrawerDemo).
- Renommage `atoms/Card.tsx` → `atoms/AnkCard.tsx` (2 call-sites vitrine : CardDemo, PlaygroundSection).
- Update barrel `atoms/index.ts`.
- Optionnel : lint-rule `no-restricted-imports` pour `atoms/Button` (forcer `AnkButton`).
- Update CLAUDE.md projet section "Architecture" avec la frontière.

**Fichiers impactés** : 6-8 (2 renames atoms + barrel + 4 call-sites vitrine + ADR + CLAUDE.md + éventuel .eslintrc).

**Risque** : faible. Aucune migration prod. Backward-compatible si on garde des alias exports temporaires.

---

## 4. Recommandation @cc-ankora

**Option C** pour les raisons suivantes :

1. **Aligne avec l'intention design** : le plan PR-D4-PHASE2-A a explicitement choisi la cohabitation. Annuler 11 atoms CD#3 (Option A) ou réécrire toute l'infrastructure Radix (Option B) gaspille du travail acquis.
2. **Débloque PR-D6/D7 sous 1 jour** au lieu de 4-15 jours. Compatible avec la fenêtre Beta serrée (12 semaines depuis 23/04, ~8 restantes).
3. **Anti-risque a11y** : conserver Radix sous `ui/` évite de réintroduire des bugs déjà gérés par shadcn (focus trap, escape key, click outside).
4. **Aligné avec le call-site PROD prévaut** (memory feedback `feedback_callsite_prod_vs_prototype`) : les call-sites prod actuels utilisent `ui/button` et `ui/card`. Les renommer Ank\* respecte la doctrine du call-site prod sans tout réécrire.
5. **Évolutif** : si à long terme une convergence est souhaitée, elle pourra se faire progressivement (composant par composant) sans bloquer la Beta.

**Pré-requis avant PR-D6 (THI-190/192/195)** :

- [ ] ADR `0001-atoms-vs-ui-frontier.md` rédigée (@cowork) et signée (@thierry).
- [ ] Section "Architecture" du CLAUDE.md projet mise à jour avec la frontière fonctionnelle.
- [ ] Renommage `Button` + `Card` côté atoms/ (peut être inclus dans PR-D6 préamble OU PR dédiée THI-189-cleanup).

**Tâches NON nécessaires avant PR-D6** :

- Migration physique des call-sites (peut s'étaler post-Beta).
- Suppression de `atoms.css`.
- Réécriture de Radix-based components.

---

## 5. Effort estimé par option (récap)

| Option                             | Effort      | Fichiers impactés | Risque               | Aligné CD#3 ? | Débloque Beta ? |
| ---------------------------------- | ----------- | ----------------- | -------------------- | ------------- | --------------- |
| A — Tout vers ui/                  | 4-5 j       | ~30               | Moyen (perte design) | ❌            | ⚠️ tardif       |
| B — Tout vers atoms/               | 10-15 j     | ~60               | Élevé (a11y)         | ✅            | ❌              |
| **C — Frontière fonctionnelle** ⭐ | **0.5-1 j** | **6-8**           | **Faible**           | ✅            | ✅              |

---

## 6. Données brutes vérifiées

**Méthode** : `find`, `grep`, `gh pr list`, lecture de [`docs/plans/PR-D4-PHASE2-A.md`](../plans/PR-D4-PHASE2-A.md).

- Total fichiers `.ts/.tsx` dans `atoms/` : 24 (11 composants + 11 tests + barrel + icons).
- Total fichiers `.ts/.tsx` dans `ui/` : 24 (13 composants + 9 tests + dossier `__tests__`).
- Occurrences imports `@/components/{atoms|ui}` : **101 dans 51 fichiers**.
- Imports `@/components/atoms` : **14 fichiers** (12 demos vitrine + AdminTopbar + LangSwitcherClient).
- Imports `@/components/ui/*` : **~37 fichiers** (auth, dashboard, marketing, settings, features).
- Cross-imports atoms↔ui : **0**.

---

## 7. Hors scope (à NE PAS traiter dans THI-189)

- Migration physique des call-sites (THI-189-cleanup ou backlog post-Beta).
- Couverture tests manquante `ui/` (breadcrumb, dialog, form, sheet, switch, toast) — ticket séparé.
- Refactor du système `atm-*` CSS — pas d'urgence si frontière C adoptée.
- Choix d'ajouter ou non un barrel `ui/index.ts` (probablement non, contre-convention shadcn).

---

## 8. Prochaines actions proposées

1. **@cowork** lit ce diagnostic + tranche Option A / B / C.
2. **@cowork + @thierry** valident l'ADR.
3. **@cc-ankora** ouvre PR cleanup mineure (`feat/thi-189-frontier-rename`) si Option C : renommage Button/Card + ADR + CLAUDE.md (effort 0.5-1 j, hors fenêtre sas 48h post-mutuelle 19/05).
4. Une fois la frontière figée, **PR-D6** (THI-190/192/195) peut démarrer en confiance.

---

**Fin du diagnostic.** Aucune modification code dans ce passage. Working tree main inchangé (sauf création de ce fichier markdown).
