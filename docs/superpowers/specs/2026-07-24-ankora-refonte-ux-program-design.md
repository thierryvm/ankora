# Ankora — Refonte UX/UI (programme) — Design

- **Statut** : Design validé (séquençage + Phase 0), 2026-07-24
- **Décideur** : @thierry (vision produit), @cc-ankora (exécution)
- **Nature** : PROGRAMME multi-phases. Chaque phase = son propre cycle spec → plan → PR.

## Vision

Amener Ankora au niveau d'expérience Revolut/Monzo : **mobile-first**, hiérarchie
claire, actions clés à 1-2 taps, « où/quoi faire » évident. Esthétique inspirée
d'Apple **Liquid Glass**, **sans** sacrifier les contraintes verrouillées.

Problème utilisateur (verbatim @thierry) : « je cherche toujours quoi faire et où »,
« pas cohérente visuellement et pas pratique », page Comptes « pas pratique ni
agréable ».

## Contraintes NON négociables (verrouillées)

- **WCAG AA** (contraste ≥ 4.5:1 texte normal, ≥ 3:1 large/graphique) — dans TOUS les états.
- **CSP stricte** (`style-src 'self' 'nonce'`) — aucun style/script inline en prod ; glass = classes CSS.
- **Budget 0 €** — aucune dépendance payante ; polish via Tailwind 4 + CSS maison.
- **Performance** — backdrop-filter GPU-coûteux : glass parcimonieux, jamais empilé.
- **Sécurité / scalabilité** — RLS, Server Actions contractées, pas de régression.
- **FSMA** — pas de conseil en placement ; « actions » = plan de virements (ADR-012).

## Architecture Liquid Glass — réconciliation avec WCAG AA

Recherche 2026 : le glass fait **chuter le contraste sous AA** sur fonds complexes ;
Apple fournit _Reduce Transparency_ / _Increase Contrast_ pour ça. Donc :

> **Le glass est une couche d'ENHANCEMENT, jamais porteuse de sens.**

1. **Base solide opaque** — hiérarchie + contraste garantis à 100 % sans glass.
2. **Glass ajouté** via `@supports (backdrop-filter: blur())` uniquement.
3. **Fallback solide automatique** sur `prefers-reduced-transparency` ET
   `prefers-reduced-motion` (déjà amorcé dans `.glass` de `globals.css`).
4. **Texte ≥ 4.5:1 dans les DEUX états** ; une seule couche de glass par vue ;
   profondeur/frost modérés (blur ≤ 20-24px) ; pas de parallaxe si reduced-motion.

L'app a DÉJÀ : primitive `.glass` (avec fallback), `BottomTabBar` glass, tokens
dark-mode, flip accent admin. On étend cet acquis, on ne repart pas de zéro.

## Décisions structurantes

1. **⚠️ Comptes = invariant DB (décision produit PENDANTE, gate Phase 3).** Le
   modèle « 3 comptes typés » (`income_bills/provisions/daily_card`) est un
   invariant : PK composite `(workspace_id, kind)`, RLS **sans INSERT ni DELETE**
   (« the three accounts are invariants of the workspace »), seedés par trigger.
   « Ajouter/gérer des comptes libres » = migration DB + abandon de l'invariant +
   **remet en cause la philosophie “enveloppes” du NORTH_STAR**. À trancher avec
   @thierry AVANT la Phase 3 : (a) garder 3 comptes mais UX de gestion (renommer,
   ré-ordonner, éditer soldes — actions déjà en partie codées mais non câblées),
   (b) permettre des sous-enveloppes dans les 3 comptes, (c) vrais comptes libres
   (refonte du modèle + FSMA/scalabilité à revalider).
2. **Deux systèmes de composants** (`ui/**` shadcn vs `atoms/**` maison, ADR-020) —
   consolidation en UN seul en **Phase 1** (pas Phase 0 : c'est un refactor, pas
   une suppression).
3. **Ampleur Liquid Glass** — à caler sur la page pilote de Phase 1/2 (glass sur
   nav + cartes-clés d'abord, généralisation ensuite).

## Décomposition — phases ordonnées (séquençage validé)

| Phase | Sous-projet                                       | Livrable                                                                                                                                                                        |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | **Nettoyage** (ci-dessous)                        | Repo débarrassé du code/docs morts                                                                                                                                              |
| **1** | **Fondation design-system + shell mobile**        | Système glass unifié (progressive enhancement), consolidation ui/atoms, grammaire mobile-first, nav cohérente (bottom-tab + more repensés), agent `mobile-liquid-glass-auditor` |
| **2** | **Dashboard `/app`**                              | Cockpit hiérarchisé, quick-actions 1-2 taps, glass appliqué                                                                                                                     |
| **3** | **Comptes**                                       | Selon décision #1 ci-dessus                                                                                                                                                     |
| **4** | **Charges · Engagements · Dépenses · Simulateur** | Polish page-par-page sur la grammaire Phase 1                                                                                                                                   |
| **5** | **Landing `/`**                                   | Vitrine publique refondue                                                                                                                                                       |

Agents/skills : créer `mobile-liquid-glass-auditor` (WebKit + contraste glass +
reduced-transparency), réutiliser `frontend-design`, `ankora-design-system`,
`mobile-ios-auditor`, `ui-auditor`, `dashboard-ux-auditor` à chaque phase.

---

## Phase 0 — Nettoyage (périmètre validé)

**Objectif** : retirer le code/assets/docs morts pour partir d'un terrain propre.
Purement soustractif — aucune modification de comportement runtime.

### À SUPPRIMER (vérifié : 0 référence applicative)

**Assets boilerplate Next** (0 référence) :

- `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg`

**Docs/artefacts obsolètes** :

- `docs/prs/` (rapports de PR post-merge)
- `docs/audits/` datés > 6 mois
- `docs/design/archive/`, `docs/plans/_archive/`
- `prompts/` (13 prompts de PR historiques)
- `design-snapshots/` (quasi vide)

### À GARDER (canonique + doctrine)

`docs/adr/`, `docs/NORTH_STAR.md`, `docs/ROADMAP.md`, `docs/design/` (hors archive),
`docs/runbooks/`, `docs/handoffs/` (doctrine cross-session), `docs/superpowers/`.

### À NE PAS toucher (reporté / protégé)

- **Primitives Radix `ui/{dialog,form,sheet,switch}`** — bien que 0-importées, elles
  sont **délibérément conservées** comme couche a11y canonique (focus trap, ARIA,
  clavier) par **ADR-020 Accepted** (« Préserver l'infrastructure Radix de `ui/` »).
  Leur retrait éventuel est une **décision d'amendement d'ADR-020** (Phase 1
  consolidation avec @thierry), pas une suppression de nettoyage. (Codex #245.)
- Consolidation `ui/**` ↔ `atoms/**` → **Phase 1** (refactor, pas suppression).
- 2 locale switchers, 2 actions de renommage compte → Phase 1/3.

### Méthode (mécanique, low-risk)

1. Re-vérifier chaque candidat non référencé (`grep`), supprimer par lots.
2. `npm run typecheck && npm run lint && npm run test && npm run build` verts.
3. PR `chore/phase0-cleanup`, DoD5. Aucun changement de comportement.

### Hors périmètre (YAGNI)

Pas de refactor, pas de renommage, pas de nouveau composant. Que du `rm`.

---

## Défauts constatés à traiter en Phase 1 (nav mobile)

Signalés par @thierry le 25 juillet 2026 en production, **volontairement non corrigés à
chaud** : la nav mobile est refondue d'un bloc en Phase 1, un patch isolé serait jeté.
Tracés ici pour qu'ils entrent dans le périmètre plutôt que d'être redécouverts.

### 1. `/app/commitments` est inatteignable depuis la nav mobile

La route existe, la page fonctionne, mais elle n'est référencée par **aucune** surface de
navigation mobile :

| Surface                                                                                | Contient Engagements ?                                      |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Header.tsx` — nav applicative (7 destinations)                                        | oui, mais `hidden … lg:flex` → desktop ≥ 1024 px uniquement |
| `BottomTabBar` — 4 onglets (`/app`, `/app/charges`, `/app/expenses`, `/app/simulator`) | non                                                         |
| `MoreSheet` — comptes, réglages, admin, faq, glossaire, légal                          | **non**                                                     |
| `EngagementsCard` (cockpit)                                                            | oui — **seul point d'entrée mobile**                        |

Conséquence : hors du cockpit, Engagements n'existe plus sur mobile.

### 2. Cause structurelle — aucune source unique de destinations

C'est le vrai défaut, et celui que la Phase 1 doit fermer. Les destinations sont
**dupliquées à trois endroits** (`Header.tsx`, `BottomTabBar.tsx`, `MoreSheet.tsx`), sans
contrat commun. Rien n'empêche aujourd'hui d'ajouter une route et d'oublier une ou deux
surfaces — c'est précisément ce qui s'est produit pour Engagements.

Attendu Phase 1 : un registre unique de destinations (id, href, libellé i18n, icône,
surface(s) d'affichage), consommé par les trois surfaces, plus un test qui échoue si une
route de `src/app/[locale]/app/**` n'y figure pas. La répartition tabs / sheet devient
alors une décision de données, pas de duplication.

### 3. Incohérence des segments d'URL (à arbitrer, pas un bug)

`/glossaire` est en français, `/app/commitments`, `/app/expenses`, `/app/charges`,
`/app/settings` sont en anglais. Les segments d'URL sont du code, donc en anglais par
convention projet — mais la convention n'est pas appliquée uniformément. Aucune table
`pathnames` next-intl n'existe, donc aucune URL n'est localisée.

Ce n'est pas cassé et les libellés affichés sont bien traduits (`nav.commitments`). En
faire des URLs françaises est une **décision à part entière** : impact SEO, redirections
permanentes des URLs existantes, table `pathnames` à maintenir sur 5 locales. À arbitrer
avec @thierry, hors Phase 1 sauf décision explicite.
