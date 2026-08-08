# Token usage — convention Ankora (verrouillée @cowork 2026-04-26)

> **Source canonique** : ce document.
> **Statut** : actif, à respecter sur toutes les PR touchant l'UI.
> **Trigger de création** : bug WCAG AA détecté en PR T1 (#69) — usage de `--color-muted` comme surface dans HeaderNav, contraste 3.36:1 vs 4.5:1 requis. Investigation @cowork du ZIP cc-design source : les valeurs des tokens muted sont **intentionnelles** (commentaire `colors_and_type.css` ligne 222 : _".t-muted = timestamps, helper text, disabled (#94a3b8, 3.6:1 — below AA)"_). Le bug est l'usage, pas le design system.

Ce document définit la **convention d'usage** des tokens CSS d'Ankora. Tous les agents (humains, CC Ankora, CC Design, futurs devs) doivent le respecter pour éviter des régressions WCAG AA silencieuses.

---

## 1. Convention de nommage — règle d'or

Chaque token a un **rôle sémantique unique**. Le nom indique le rôle, pas la valeur.

| Préfixe / suffixe                                                         | Rôle                                                                                                                   | Usage Tailwind typique                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `--color-foreground`                                                      | Texte principal sur background                                                                                         | `text-foreground`                         |
| `--color-muted-foreground`                                                | Texte secondaire (lisible) sur surfaces card/bg                                                                        | `text-muted-foreground`                   |
| `--color-muted`                                                           | **TEXTE DÉCORATIF UNIQUEMENT** (timestamps, helper, disabled, captions) — contraste volontairement faible              | `text-muted` ✅ / `bg-muted` ❌           |
| `--color-background`                                                      | Surface de fond globale (page)                                                                                         | `bg-background`                           |
| `--color-card`                                                            | Surface cards par défaut                                                                                               | `bg-card`                                 |
| `--color-surface-muted`                                                   | Surface atténuée (hovers, sections secondaires) — contraste AAA avec `text-foreground`                                 | `bg-surface-muted`                        |
| `--color-surface-soft`                                                    | Surface soft (encadrés discrets)                                                                                       | `bg-surface-soft`                         |
| `--color-border`                                                          | Bordure standard                                                                                                       | `border-border`                           |
| `--color-border-strong`                                                   | Bordure renforcée                                                                                                      | `border-border-strong`                    |
| `--color-brand-*`                                                         | Famille teal (CTA primaires, focus, success)                                                                           | `bg-brand-500`, `text-brand-700`, etc.    |
| `--color-accent-*`                                                        | Famille laiton signature (CTA différenciants, admin)                                                                   | `bg-accent-400`, `text-accent-text`, etc. |
| `--color-success` / `--color-warning` / `--color-danger` / `--color-info` | Tokens **sémantiques** universels (jamais alignés sur l'accent de marque, cf. doctrine `design-principles-2026.md` §6) | `text-success`, `bg-warning`, etc.        |

---

## 2. Règle critique — `--color-muted` ≠ surface

**`--color-muted` est un token de TEXTE décoratif**, pas de surface.

> **Chiffres recalculés le 8 août 2026 (PR L1).** La règle ci-dessous est juste ;
> sa justification mesurait la mauvaise paire. Les valeurs annoncées ici
> comparaient `--color-muted` à `--color-foreground`, c'est-à-dire **du texte à
> du texte** — une paire sans signification WCAG, et dont les chiffres ne se
> reproduisaient pas (3.36 annoncé → **3.75** mesuré ; 3.6 → **2.08**).
>
> Ce qui échoue réellement, c'est `text-foreground` **posé sur** `bg-muted` :
> **3.75:1**, sous AA. C'est exactement l'anti-pattern montré plus bas, donc
> l'interdiction tient — pour cette raison-là.
>
> Corollaire mesuré, et il contredit le mot « sub-AA » appliqué au token
> lui-même : `--color-muted` en TEXTE passe AA sur toutes les surfaces réelles
> (4.76 sur carte claire, 4.55 sur fond ardoise, 4.52 sur papier, 6.76 sur carte
> sombre). Son contraste est faible **par rapport au texte principal**, ce qui
> est le but ; il n'est pas illisible.

Valeurs actuelles, mesurées :

- Light : `#64748b` (slate-500) → en texte sur carte blanche = **4.76:1** (AA), volontairement en retrait de `--color-foreground`
- Dark : `#94a3b8` (slate-400) → en texte sur carte sombre = **6.76:1** (AA), même intention

**Pour les surfaces**, utiliser `--color-surface-muted` :

- Light : `#f1f5f9` → contraste avec `--color-foreground` = **16.30:1** → **AAA confortable**
- Dark : `#0f172a` → contraste avec `--color-foreground` = **14.48:1** → AAA

### Anti-pattern à reconnaître

```tsx
// ❌ FAUX — bg-muted comme surface, viole WCAG AA
<button className="bg-muted text-foreground">Toggle theme</button>

// ✅ CORRECT — bg-surface-muted comme surface
<button className="bg-surface-muted text-foreground">Toggle theme</button>

// ✅ ALTERNATIVE — bg-card si la surface doit être plus claire
<button className="bg-card text-foreground">Toggle theme</button>
```

---

## 3. Matrice usage autorisé par token

Légende :

- ✅ usage recommandé
- ⚠️ usage conditionnel (lire les notes)
- ❌ usage interdit (viole WCAG AA ou la sémantique)

### Tokens TEXTE

| Token                                              | `text-*`                                                 | `bg-*`               | `border-*`  | Notes                           |
| -------------------------------------------------- | -------------------------------------------------------- | -------------------- | ----------- | ------------------------------- |
| `--color-foreground`                               | ✅ Texte principal                                       | ❌ jamais            | ❌ jamais   |                                 |
| `--color-muted-foreground`                         | ✅ Texte secondaire                                      | ❌ jamais            | ❌ jamais   | Lisible (AAA sur card/bg)       |
| `--color-muted`                                    | ⚠️ Décoratif uniquement (timestamps, captions, disabled) | ❌ Interdit (sub-AA) | ❌ Interdit | Contraste volontairement faible |
| `--color-brand-text` / `--color-brand-text-strong` | ✅ Liens, CTAs textuels                                  | ❌ jamais            | ❌ jamais   |                                 |
| `--color-accent-text`                              | ✅ Highlights, accents textuels                          | ❌ jamais            | ❌ jamais   |                                 |

### Tokens SURFACE

| Token                                                | `text-*`  | `bg-*`                                          | `border-*` | Notes                                |
| ---------------------------------------------------- | --------- | ----------------------------------------------- | ---------- | ------------------------------------ |
| `--color-background`                                 | ❌ jamais | ✅ Page bg                                      | ❌ jamais  |                                      |
| `--color-card`                                       | ❌ jamais | ✅ Cards                                        | ❌ jamais  | Surface par défaut cards             |
| `--color-surface-muted`                              | ❌ jamais | ✅ Hovers, sections atténuées                   | ❌ jamais  | Contraste AAA avec `text-foreground` |
| `--color-surface-soft`                               | ❌ jamais | ✅ Encadrés discrets                            | ❌ jamais  |                                      |
| `--color-brand-surface*` / `--color-accent-surface*` | ❌ jamais | ✅ Surfaces colorées (sections différenciation) | ❌ jamais  |                                      |

### Tokens BORDURE

| Token                   | `text-*`  | `bg-*`    | `border-*`                              | Notes |
| ----------------------- | --------- | --------- | --------------------------------------- | ----- |
| `--color-border`        | ❌ jamais | ❌ jamais | ✅ Bordure standard                     |       |
| `--color-border-strong` | ❌ jamais | ❌ jamais | ✅ Bordure renforcée (focus, sélection) |       |

### Tokens SÉMANTIQUES (success / warning / danger / info)

| Token             | `text-*`                             | `bg-*`                              | `border-*`         | Notes                                                                                   |
| ----------------- | ------------------------------------ | ----------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `--color-success` | ✅ Texte success                     | ⚠️ Surface success (toasts, badges) | ✅ Bordure success | Vérifier contraste 4.5:1 sur `bg-card`                                                  |
| `--color-warning` | ✅ Texte warning                     | ⚠️ Surface warning                  | ✅ Bordure warning | **Jamais aligner sur l'accent de marque** (cf. doctrine `design-principles-2026.md` §6) |
| `--color-danger`  | ✅ Texte erreur, destructive actions | ⚠️ Surface danger                   | ✅ Bordure danger  |                                                                                         |
| `--color-info`    | ✅ Texte info                        | ⚠️ Surface info                     | ✅ Bordure info    |                                                                                         |

### Tokens BRUTS de portée — les pigments papier (ADR-039)

Six valeurs qui n'ont **aucun usage direct** : elles existent uniquement pour
être pointées par le remap `.mkt-paper`. Un composant écrit toujours dans le
vocabulaire sémantique (`text-foreground`, `bg-background`) et hérite du pigment
selon la surface où il est rendu.

| Token                 | `text-*`  | `bg-*`    | `border-*` | Rôle                                    |
| --------------------- | --------- | --------- | ---------- | --------------------------------------- |
| `--color-paper`       | ❌ jamais | ❌ jamais | ❌ jamais  | cible de `--color-background` en portée |
| `--color-paper-line`  | ❌ jamais | ❌ jamais | ❌ jamais  | cible de `--color-border`               |
| `--color-paper-soft`  | ❌ jamais | ❌ jamais | ❌ jamais  | cible de `--color-surface-soft`         |
| `--color-paper-muted` | ❌ jamais | ❌ jamais | ❌ jamais  | cible de `--color-surface-muted`        |
| `--color-ink`         | ❌ jamais | ❌ jamais | ❌ jamais  | cible de `--color-foreground`           |
| `--color-ink-soft`    | ❌ jamais | ❌ jamais | ❌ jamais  | cible de `--color-muted-foreground`     |

Ces ❌ ne reposent pas sur la discipline du prochain auteur : les six sont
déclarés dans un `:root` nu, **pas** dans `@theme`, donc aucune clé de thème
n'existe et Tailwind ne génère aucun utilitaire pour ces noms. Il n'y a pas de
classe à ne pas écrire — il n'y a pas de classe. Cf. ADR-039 §Amendement.

### Le quatrième motif de portée

`globals.css` connaît désormais quatre façons de définir un jeu de variables :

| Portée                                   | Ce qu'elle est                                         |
| ---------------------------------------- | ------------------------------------------------------ |
| `@theme`                                 | le jeu de base (clair) + les échelles de design system |
| `[data-theme='dark']`                    | l'override de thème                                    |
| `[data-accent='admin']`                  | l'échange de pigment teal → laiton                     |
| `.mkt-paper` (+ compagnon `body:has(…)`) | la surface marketing, en thème clair seulement         |

**Il n'existe volontairement PAS de `.app-surface` symétrique.** `:root` **est**
l'identité du produit ; `.mkt-paper` en est un écart, pas un pair. Une portée qui
ne remappe rien deviendrait « l'endroit où l'on met les surcharges de l'app »,
ce qui est le travail de `:root` — et tout wrapper coûte un risque de mise en
page (cf. la note au-dessus de `body > main` dans `globals.css`). Décidé en
relecture cockpit d'ADR-039, le 8 août 2026.

---

## 4. Tests de contraste WCAG AA documentés

**Colonne « Gardé »** : ✅ = la paire est recalculée à chaque `npm run test` par
[`src/app/__tests__/contrast-ratios.test.ts`](../../src/app/__tests__/contrast-ratios.test.ts),
qui échoue sous 4.5:1. ⬜ = valeur documentaire, exacte au moment de la mesure
mais qu'aucune porte ne surveille — un futur changement de token ne la fera pas
rougir.

Cette colonne existe parce que ce tableau a dérivé : quatre de ses six lignes
claires annonçaient des ratios qui ne se reproduisaient pas (recalculés le
8 août 2026, PR L1). Ajouter des lignes à la main sans dire lesquelles sont
tenues par une porte, c'était recréer le même défaut.

### Light mode — fonds ardoise (surfaces produit)

| Avant-plan                        | Arrière-plan                    | Ratio       | Gardé | Verdict                                 |
| --------------------------------- | ------------------------------- | ----------- | ----- | --------------------------------------- |
| `text-foreground` (#0f172a)       | `bg-background` (#f8fafc)       | **17.06:1** | ⬜    | ✅ AAA                                  |
| `text-foreground` (#0f172a)       | `bg-card` (#ffffff)             | **17.85:1** | ⬜    | ✅ AAA                                  |
| `text-foreground` (#0f172a)       | `bg-surface-muted` (#f1f5f9)    | **16.30:1** | ⬜    | ✅ AAA                                  |
| `text-foreground` (#0f172a)       | `bg-muted` (#64748b) — interdit | **3.75:1**  | ⬜    | ❌ FAIL (< 4.5) — cf. §2                |
| `text-muted-foreground` (#475569) | `bg-card`                       | **7.58:1**  | ⬜    | ✅ AAA                                  |
| `text-muted` (#64748b)            | `bg-card`                       | **4.76:1**  | ⬜    | ⚠️ AA juste (texte décoratif seulement) |
| `text-danger` (#dc2626)           | `bg-background` (#f8fafc)       | **4.62:1**  | ✅    | ⚠️ AA à 0.12 près                       |
| `text-success` (#047857)          | `bg-background`                 | **5.24:1**  | ✅    | ✅ AA                                   |
| `text-warning` (#9a3412)          | `bg-background`                 | **6.98:1**  | ✅    | ✅ AA                                   |
| `text-info` (#0369a1)             | `bg-background`                 | **5.67:1**  | ✅    | ✅ AA                                   |

### Light mode — portée papier `.mkt-paper` (landing, ADR-039)

| Avant-plan                          | Arrière-plan                   | Ratio       | Gardé | Verdict          |
| ----------------------------------- | ------------------------------ | ----------- | ----- | ---------------- |
| `text-foreground` → encre (#171d26) | `bg-background` → papier       | **16.08:1** | ✅    | ✅ AAA           |
| `text-muted-foreground` → (#3d4a5c) | papier                         | **8.55:1**  | ✅    | ✅ AAA           |
| `text-brand-text-strong` (#115e59)  | papier                         | **7.20:1**  | ✅    | ✅ AAA           |
| `text-accent-text` (#8b6914)        | papier                         | **4.83:1**  | ✅    | ✅ AA            |
| blanc (#ffffff) — le CTA            | `bg-brand-700` (#0f766e)       | **5.47:1**  | ✅    | ✅ AA            |
| encre                               | `bg-surface-soft` → (#fbfaf7)  | **16.22:1** | ✅    | ✅ AAA           |
| encre                               | `bg-surface-muted` → (#f3f1ea) | **14.98:1** | ✅    | ✅ AAA           |
| (#3d4a5c)                           | (#f3f1ea)                      | **7.97:1**  | ✅    | ✅ AAA           |
| `text-danger` (#dc2626)             | papier                         | **4.59:1**  | ✅    | ⚠️ **AA à 0.09** |
| `text-success` (#047857)            | papier                         | **5.21:1**  | ✅    | ✅ AA            |
| `text-warning` (#9a3412)            | papier                         | **6.94:1**  | ✅    | ✅ AA            |
| `text-info` (#0369a1)               | papier                         | **5.64:1**  | ✅    | ✅ AA            |
| `text-muted` (#64748b) — décoratif  | papier                         | **4.52:1**  | ⬜    | ⚠️ AA à 0.02     |

> **La ligne à surveiller est `text-danger` sur papier : 4.59, soit 0.09 de
> marge.** Tout assombrissement futur de `--color-paper` la fait passer sous AA.
> La porte le dira — c'est précisément pourquoi elle est gardée.

### Dark mode

| Avant-plan                        | Arrière-plan           | Ratio  | Gardé | Verdict                                |
| --------------------------------- | ---------------------- | ------ | ----- | -------------------------------------- |
| `text-foreground` (#e2e8f0)       | `bg-background` (navy) | ≥ 14:1 | ⬜    | ✅ AAA                                 |
| `text-muted-foreground` (#cbd5e1) | `bg-card`              | 9.3:1  | ⬜    | ✅ AAA                                 |
| `text-muted` (#94a3b8)            | `bg-card`              | 3.6:1  | ⬜    | ⚠️ Sub-AA (texte décoratif uniquement) |

> **Ce tableau sombre a été sondé le 8 août 2026 et deux de ses trois lignes ne
> se reproduisent pas** : `text-muted-foreground` sur carte sombre mesure
> **11.68** (annoncé 9.3) et `text-muted` mesure **6.76** (annoncé 3.6 « Sub-AA »).
> Les valeurs annoncées sont **pessimistes**, donc aucun risque d'accessibilité
> vivant. Non corrigées ici : la PR L1 ne touche à aucune valeur sombre, et
> réécrire un tableau qu'elle n'exerce pas serait un changement non vérifié.
> **Propriétaire : session cockpit, à traiter avec la refonte du §2.**

**Source cc-design** (commentaire `colors_and_type.css` ligne 216-222) :

> `color: var(--color-muted-foreground); /* #cbd5e1 on navy — 9.3:1 AAA (was #94a3b8 · 3.6:1 FAIL) */`
> `.t-muted = timestamps, helper text, disabled (#94a3b8, 3.6:1 — below AA;`

→ cc-design a documenté `--color-muted` comme réservé au décoratif. La mesure du
8 août montre que le chiffre cité (3.6) ne correspond pas aux tokens actuels ; la
**consigne** reste bonne, cf. §2.

---

## 5. Anti-patterns détectés en prod (registre vivant)

Ce registre liste les bugs réels trouvés et les fixes appliqués. À chaque nouveau bug détecté, ajouter une ligne.

| Date       | Composant                                                   | Bug                                                                                | Fix appliqué                                                                                                                        | PR        |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2026-04-26 | `src/components/layout/HeaderNav.tsx` (button toggle theme) | `bg-muted` utilisé comme surface → contraste 3.36:1 sur `text-foreground` (sub-AA) | Remplacer par `bg-surface-muted` ou `bg-card`. Aussi ajouter `aria-hidden={!isOpen}` sur le drawer fermé (régression a11y séparée). | PR T1 #69 |

---

## 6. Checklist pré-PR pour @cc-ankora (et tout agent UI)

Avant de pousser une PR qui touche l'UI :

- [ ] Aucun usage de `bg-muted` (à remplacer par `bg-surface-muted` ou `bg-card`)
- [ ] Aucun usage de `border-muted` (utiliser `border-border` ou `border-border-strong`)
- [ ] `text-muted` réservé aux timestamps, captions, disabled, helper text non-essentiel
- [ ] `--color-warning` séparé du laiton accent (cf. doctrine `design-principles-2026.md` §6)
- [ ] Tests axe-core (PR T1+ helper) passent sur les routes touchées
- [ ] Tous les éléments interactifs ont un contraste ≥ 4.5:1 (texte normal) ou ≥ 3:1 (texte large 18pt+ ou 14pt bold)
- [ ] Pas de hardcoded hex hors SVG justifié (utiliser tokens uniquement)
- [ ] Aucun usage direct des six pigments papier (`--color-paper*`, `--color-ink*`) : ils ne se lisent qu'à travers le remap `.mkt-paper` (cf. §3)
- [ ] Si un ratio est ajouté au §4 : il est **calculé**, et sa colonne « Gardé » dit la vérité — une valeur écrite à la main sans porte se marque ⬜

Si tu détectes un cas non couvert par ce doc → STOP escalade @cowork pour décision + ajout au registre §5.

---

## 7. Source de vérité cc-design (ZIP)

Référence complète : `F:\PROJECTS\Apps\ankora-mockups\design-exports\unpacked-v1\colors_and_type.css`

Citation pertinente (ligne 216-222) — à conserver pour future référence :

```css
/* light mode */
--color-muted:            #64748b;  /* slate-500 — TEXT decorative only */
--color-muted-foreground: #475569;  /* slate-600 — secondary text */
--color-surface-muted:    #f1f5f9;  /* slate-100 — muted surface */

/* dark mode */
--color-muted:            #94a3b8;  /* slate-400 — TEXT decorative, 3.6:1 below AA but acceptable for non-essential */
--color-muted-foreground: #cbd5e1;  /* slate-300 — 9.3:1 AAA on navy */
--color-surface-muted:    #0f172a;  /* navy — muted surface in dark mode */

/* usage doc */
.t-muted = timestamps, helper text, disabled (#94a3b8, 3.6:1 — below AA);
.t-secondary { color: var(--color-muted-foreground); } /* lisible AAA */
```

---

## 8. Maintenance et évolution

- Tout ajout de nouveau token CSS dans `src/app/globals.css` doit être documenté ici dans la matrice §3
- Tout nouveau bug WCAG détecté doit être ajouté au registre §5 avec son fix
- Toute évolution majeure (renommage de token, suppression) → ADR dédié si impact > 3 fichiers
- Les futurs briefs Claude Design (`claude-design-brief.md`) doivent exiger explicitement la documentation d'usage des tokens livrés (pas juste les valeurs)

### 8.1. Pre-PR checklist UI (anti-duplication)

Avant d'ouvrir une PR qui touche à l'UI :

- [ ] **Tokens** : aucune nouvelle valeur hex hardcodée dans `src/components/` (`grep -r "#[0-9a-fA-F]\{6\}" src/components/`)
- [ ] **Atomic UI** : aucune classe `_shared/shell.css` (`.glass`, `.eyebrow`, `.num`, `.row`, etc.) dupliquée en JSX — utiliser les composants React du §9
- [ ] **Surface vs texte** : aucun `bg-muted`, `text-muted` n'est utilisé hors de la matrice §3
- [ ] **Variants Button** : pas de bouton stylé manuellement avec `<button className="bg-brand-700 …">` — passer par `<Button variant="…">` (premium pattern Apple/Linear est déjà câblé)

---

## 9. Atomic UI registry — composants React au-dessus des classes CSS

Quand une classe utilitaire `_shared/shell.css` est consommée par > 1 surface JSX,
elle est exposée comme composant React dans `src/components/ui/` pour éviter la
répétition `className="…"` et permettre des props typées.

| Class CSS source                                                                             | Composant React   | Path                                                                 | Notes                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `.glass`                                                                                     | `<Glass>`         | [src/components/ui/glass.tsx](../../src/components/ui/glass.tsx)     | `padding` prop (`none`/`sm`/`md`/`lg`) — wrapper Liquid Glass multi-couche                    |
| `.eyebrow`                                                                                   | `<Eyebrow>`       | [src/components/ui/eyebrow.tsx](../../src/components/ui/eyebrow.tsx) | `tone` prop (`default`/`accent`) — préheader uppercase                                        |
| `.num` / `.num-md` / `.num-lg` / `.num-xl`                                                   | `<Num>`           | [src/components/ui/num.tsx](../../src/components/ui/num.tsx)         | `size` (`sm`/`md`/`lg`/`xl`) + `tone` (`default`/`accent`) — figure tabular-nums              |
| `.row` (cc-design)                                                                           | `<Row>`           | [src/components/ui/row.tsx](../../src/components/ui/row.tsx)         | `gap` / `align` / `justify` — flex row ergonomique                                            |
| `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.btn-secondary`, `.btn-sm`, `.btn-lg` | `<Button>`        | [src/components/ui/button.tsx](../../src/components/ui/button.tsx)   | Premium pattern Apple/Linear (translateY hover, scale active, magnetic shadow) wrappé via cva |
| `.card`                                                                                      | `<Card>` (shadcn) | [src/components/ui/card.tsx](../../src/components/ui/card.tsx)       | Inchangé — quasi-équivalent à shell.css                                                       |

**Règle** : si une nouvelle PR doit consommer une classe `_shared/shell.css`
dans plus d'une surface, créer le composant Atomic UI correspondant **dans la
même PR**, pas plus tard. La duplication JSX cassée par un futur changement
de design est plus coûteuse que d'écrire le wrapper.

**Décision Phase 2 PR-3c-1 (2026-04-27)** : audit Landing.jsx Claude Design vs
`src/app/globals.css` repo → **0 token manquant**. Le fichier
`colors_and_type.css` du ZIP est explicitement marqué _"Lifted 1:1 from
`src/app/globals.css` in thierryvm/ankora@main"_ (cf. ZIP ligne 3). Aucune
addition de token nécessaire pour PR-3c-2 et PR-3c-3.

Modifier ajouté en PR-3c-1 : `.eyebrow-accent { color: var(--color-brand-text-strong); }`
pour supporter le tone="accent" du composant `<Eyebrow>`.

---

> **Pourquoi ce document existe** : un agent (humain ou IA) qui voit `--color-muted` sans contexte va naturellement l'utiliser comme surface. Le commentaire CSS planqué dans le ZIP source ne suffit pas. Cette doc est le filtre anti-régression silencieuse pour toutes les futures PR UI d'Ankora.
