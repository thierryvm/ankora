# Navigation mobile — « Plus » quitte la barre du bas

> **Statut : spec validée, NON passée par `plan-reviewer`.** Rédigée le 25 août 2026
> par `spec-translator` sur demande informelle de @thierry. Deux arbitrages tranchés
> par @thierry le 25/08, notés §3.
> **Gate avant code : `plan-reviewer` obligatoire** — le chantier touche `Header.tsx`,
> lit une primitive partagée (`Sheet.tsx`) et modifie un garde-fou de test.

## 1. La demande

Le bouton « Plus » quitte la barre du bas et remonte **en haut à droite du header**,
façon GitHub. Le créneau libéré devient une vraie destination : **Comptes**.

Nouvel ordre : `Cockpit · Factures · ⊕ · Dépenses · Comptes` — présent, futur,
saisie, passé, patrimoine.

## 2. Faits mesurés — ne pas re-dériver

| Fait                                                                                          | Preuve                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts` est aujourd'hui `mobilePlacement: 'sheet'`                                         | `app-destinations.ts:82`                                                                                                                                                                                                                                                                                                                                               |
| **Passer `accounts` à `'tab'` suffit** à produire l'ordre demandé                             | `MOBILE_TAB_ITEMS` (`:128-138`) : 4 tabs → `middle = 2` → `[cockpit,bills] + ⊕ + [expenses,accounts]`. Aucune logique à toucher.                                                                                                                                                                                                                                       |
| « Plus » n'est **pas** une destination — c'est un 5e créneau codé en dur                      | `BottomTabBar.tsx:280-296` (`data-testid="bottom-tab-more"`)                                                                                                                                                                                                                                                                                                           |
| **`MoreSheet.tsx` est entièrement fait main** : portail, verrou iOS, piège de focus           | `MoreSheet.tsx:4,128-175,137-158,412`                                                                                                                                                                                                                                                                                                                                  |
| Il figure **littéralement** dans `PANELS_AWAITING_MIGRATION`                                  | `src/components/primitives/__tests__/sheet-is-the-only-modal.test.ts:39-42`. ADR-037 §6 : « la liste ne peut que rétrécir » → **le migrer retire une entrée**                                                                                                                                                                                                          |
| **PIÈGE** : `<Sheet>` se portalise dans `document.body`                                       | `Sheet.tsx:480`. Un `xl:hidden` sur le JSX **n'a aucun effet** sur le nœud portalisé. On ne peut pas masquer la feuille mobile en CSS — il faut choisir la forme **avant** d'ouvrir.                                                                                                                                                                                   |
| `<Sheet>` bascule en forme bureau à `md:` (768px), codé en dur                                | `Sheet.tsx:169,386-393`                                                                                                                                                                                                                                                                                                                                                |
| Le nav bureau rend **déjà** toutes les destinations à ≥1280px                                 | `Header.tsx:127-139` — Comptes, Engagements, Paramètres y sont déjà des liens directs. Le commentaire `:129-134` interdit d'y filtrer sur `mobilePlacement` : ce serait recréer le bug `/app/commitments`. **Il n'existe donc aujourd'hui aucun équivalent de « Plus » à ≥1280px.**                                                                                    |
| `AccountButton.tsx` est le seul menu ancré bureau existant, **fait main par choix documenté** | `:24-44,63-118,121`. Pas de portail : la CSP `style-src` sans `'unsafe-inline'` interdit un positionnement inline, donc pas de Radix. Sémantique APG complète. **C'est le patron du dropdown bureau — ne pas le réinventer.**                                                                                                                                          |
| `shouldMountBottomTabBar()` est déjà le prédicat serveur unique du même public                | `src/lib/layout/bottom-tab-bar-state.ts`, consommé `Header.tsx:87`, `React.cache()`                                                                                                                                                                                                                                                                                    |
| **BUG LATENT** : `showAdminLink` est lié à `variant === 'app'`                                | `Header.tsx:72`. Sur `/faq`, un admin voit le lien Admin **via `MoreSheet`** (monté par `BottomTabBarSlot`, `[locale]/layout.tsx:245`, indépendamment du `variant`). Déplacer le menu **dans** `Header` le lui retirerait, en silence. Même classe que l'incident du 25/07.                                                                                            |
| Tests qui verrouillent l'état actuel                                                          | `app-destinations.test.ts:115-121` (`toHaveLength(3)` / `(4)`) · `BottomTabBar.test.tsx` ~250 lignes testent `MoreSheet` **au travers de** `BottomTabBar` (pas de fichier dédié) · `e2e/mobile-ios/bottom-tab-bar.spec.ts:59-70` (ordre exact des 5 créneaux), `:100-143`, `:211-312` · `e2e/mobile-ios/auth-flow.spec.ts:305-306` (déconnexion via `bottom-tab-more`) |
| `bottom-tab-bar.spec.ts` compte pour le **plancher 62**                                       | `e2e/authenticated-specs.json:25`                                                                                                                                                                                                                                                                                                                                      |
| Précédent direct et récent                                                                    | `entete-menu-atteignable.spec.ts` (23/08) : un bouton de header à 0/40px atteignable en prod faute de règle responsive. Le nouveau bouton entre dans **exactement** ce groupe (`Header.tsx:197`).                                                                                                                                                                      |
| i18n : `layout.bottomTab.*` et `layout.moreSheet.*` existent dans les **5** locales           | `fr-BE.json:85-123` ; `tests/i18n/messages-parity.test.ts` exige des jeux de clés identiques                                                                                                                                                                                                                                                                           |

## 3. Arbitrages @thierry — 25 août 2026

| #   | Question                                | Décision                                                                                                                                                |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Forme du menu                           | **Les deux selon la taille** : panneau bas-d'écran (`<Sheet>`) sur mobile, dropdown ancré en bureau. Deux composants, accepté en connaissance de cause. |
| N2  | En bureau, il s'ajoute ou il remplace ? | **Il s'ajoute (Option A).** Coexiste avec le nav bureau et `AccountButton`, **même contenu aux deux formes**. Doublon Paramètres/Déconnexion assumé.    |

**Pourquoi le même contenu aux deux formes** : la base de code a déjà été mordue
par des contenus divergents entre surfaces (`MoreSheet.tsx:76-86`, le bug
`simulate`→`'accounts'` presque expédié en prod — un `Record` garantit
l'exhaustivité des clés, jamais la justesse des valeurs). Un contenu, deux
coquilles, élimine la classe.

**Option B écartée pour l'instant** (le menu absorbe `AccountButton` et réduit le
nav bureau — vrai GitHub) : réécrit des composants déjà audités, dépasse presque
sûrement 600 lignes, et exige **son propre ADR + une session dédiée**.

### Sous-décision restant à confirmer par `plan-reviewer`

Puisque `<Sheet>` se portalise, choisir la forme côté client. **Recommandé (i)** :
`useSyncExternalStore` sur `matchMedia('(min-width: 1280px)')`, snapshot serveur
`false` (mobile par défaut, cohérent avec le fail-closed déjà pris pour `isAdmin`).
Patron **déjà éprouvé deux fois dans ce même dossier** (`MoreSheet.tsx:43-58`,
`HeaderNav.tsx:11-26` pour le thème). Option (ii) — étendre `<Sheet>` d'un point de
rupture — touche une primitive gouvernée par ADR-037 et 5+ call-sites : coût de
revue supérieur pour un gain marginal.

## 4. Découpage

- **PR-NAV-1** — registre, barre, panneau mobile sur `<Sheet>`, retrait de « Plus »,
  tests unitaires + e2e mobile. **Se révoque seule** (revert = `accounts` repasse en
  `'sheet'`, `MoreSheet` réapparaît).
- **PR-NAV-2** — dropdown bureau + détection de largeur + son e2e. Peut suivre :
  entre les deux, le contenu de « Plus » est temporairement absent à ≥1280px, pour
  un besoin qui **n'existe déjà pas** à cette largeur (§2). Donc pas de régression.

17 fichiers pour PR-NAV-1, proche du plafond de 600 lignes → garder le split par
défaut.

### Fichiers PR-NAV-1

**[MODIFY]** `app-destinations.ts:82` (`'sheet'`→`'tab'`) · `BottomTabBar.tsx`
(retirer `:280-296` et le montage `:300` ; activer `TAB_LABELS.accounts`, aujourd'hui
`null` `:117`) · `Header.tsx` (insérer le déclencheur dans le groupe `ml-auto` `:197` ;
**corriger `showAdminLink`** §2) · `sheet-is-the-only-modal.test.ts:42` (retirer
`MoreSheet.tsx`) · `app-destinations.test.ts:116,120,149-155` · `BottomTabBar.test.tsx`
(retirer `:265-411`, `:496-541` ; ajuster `:95-129,149-155`) · `Header.test.tsx` ·
`e2e/mobile-ios/bottom-tab-bar.spec.ts` · `e2e/mobile-ios/auth-flow.spec.ts:305-306` ·
`e2e/mobile-ios/entete-menu-atteignable.spec.ts` (ajouter le nouveau bouton) ·
`e2e/authenticated-specs.json` · les **5** `messages/`.

**[CREATE]** `src/components/layout/HeaderMenu.tsx` · son test (reprend le contenu
retiré de `BottomTabBar.test.tsx`) · `e2e/header-menu-desktop.spec.ts` (PR-NAV-2).

**[DELETE]** `MoreSheet.tsx` — contenu migré sur `<Sheet>`, ~150 lignes de portail /
verrou / piège de focus supprimées.

### i18n

Nouveau `layout.headerMenu.*` repris de `layout.moreSheet.*` (`fr-BE.json:94-123`),
**moins** `links.accounts` qui migre vers `layout.bottomTab.accounts` (à créer).
Ajouter `triggerAria` (le déclencheur n'a plus de label visible d'onglet) et
reformuler `title` (« Plus » n'est plus un libellé d'onglet → « Menu »).
`links.simulate` / `bottomTab.simulate` sont **orphelins depuis le 8 août** — à
nettoyer ici puisqu'on touche déjà le namespace.

Parité 5 locales obligatoire ; FR-verbatim acceptable en nl/de/es (dette déjà
tracée, ne pas l'aggraver ni la résoudre ici).

## 5. Accessibilité

Piège de focus, `Escape`, restitution du focus : **gratuits** via `<Sheet>` pour le
mobile (ADR-037, 19 cas dans `Sheet.test.tsx`). Pour le dropdown bureau, reprendre
le patron **exact** d'`AccountButton.tsx:63-118` — `role="menu"`/`menuitem`, flèches,
Home/End, `Tab` qui referme, `pointerdown` extérieur. Cible tactile : même gabarit
`h-11 w-11` qu'`AccountButton` (≥44px, couvert par construction) ; ce qu'il faut
ajouter c'est un cas dans `entete-menu-atteignable.spec.ts` — un test de **position**,
pas de taille.

## 6. Planchers e2e

Public **268**, authentifié **62**. `bottom-tab-bar.spec.ts` reste listée, ses cas
sont **réécrits, pas supprimés**. Si des cas fusionnent (« Plus → FAQ » devient
« Menu → FAQ »), recompter et **justifier par écrit** dans le rapport de PR. Le
nouveau cas e2e du dropdown bureau est un **ajout net** — le plancher monte, ce qui
est le mouvement sain. Mesurer le delta en local **dans les deux sens** avant le
premier push.

## 7. QA agents

`ui-auditor` · `dashboard-ux-auditor` · `mobile-ios-auditor` · `i18n-auditor` ·
`gdpr-compliance-auditor` (le menu porte « Modifier mes préférences cookies »,
art. 7(3), et les liens légaux — leur atteignabilité est déjà auditée) ·
`test-quality-auditor` (**beaucoup de tests déplacés, pas seulement ajoutés** :
risque réel d'assertions qui migrent en perdant leur valeur probante) ·
`silent-failure-auditor` (la correction de `showAdminLink` touche un contrôle
d'accès) · `test-runner`. Ajouter `mobile-liquid-glass-auditor` si le déclencheur
voisine `backdrop-blur-xl` (`BottomTabBar.tsx:189`) ou `surface-overlay`
(`Header.tsx:95`).

## 8. Hors périmètre

Option B · la dette de traduction nl/de/es au-delà de la parité de clés ·
`.claude/settings.local.json`, `.husky/`, workflows GHA · le contenu des cartes du
cockpit (ce chantier est le **chrome** de navigation, orthogonal aux PR 2a/2b/3 du
plan cockpit, qui vivent dans `docs/plans/cockpit-refonte-e-plan.md` et **pas** dans
`ROADMAP.md` — écart de nommage signalé, ROADMAP à resynchroniser).

## 9. Smoke test @thierry

1. iPhone (Safari + PWA) sur `/app` : `Cockpit · Factures · ⊕ · Dépenses · Comptes`
   en bas, plus de « Plus ».
2. Taper le bouton en haut à droite → Engagements, Paramètres, Admin (si
   applicable), ressources, préférences, déconnexion — et **« Comptes » n'y figure
   plus**.
3. Bureau ≥1280px (si PR-NAV-2 livrée) : un dropdown ancré, pas un panneau.
