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

Valeurs actuelles (cohérentes avec ZIP cc-design source) :

- Light : `#64748b` (slate-500) → contraste avec `--color-foreground` = 3.36:1 → **sub-AA, intentionnel pour texte non-essentiel**
- Dark : `#94a3b8` (slate-400) → contraste avec `--color-foreground` = 3.6:1 → idem

**Pour les surfaces**, utiliser `--color-surface-muted` :

- Light : `#f1f5f9` → contraste avec `--color-foreground` = 15.79:1 → **AAA confortable**
- Dark : `#0f172a` → contraste avec `--color-foreground` = AAA

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

---

## 4. Tests de contraste WCAG AA documentés

Les paires les plus utilisées, vérifiées au moment de la rédaction de ce doc :

### Light mode

| Avant-plan                        | Arrière-plan                   | Ratio   | Verdict                                   |
| --------------------------------- | ------------------------------ | ------- | ----------------------------------------- |
| `text-foreground` (#0f172a)       | `bg-background` (#ffffff)      | 18.59:1 | ✅ AAA                                    |
| `text-foreground` (#0f172a)       | `bg-card` (#ffffff ou variant) | ≥ 15:1  | ✅ AAA                                    |
| `text-foreground` (#0f172a)       | `bg-surface-muted` (#f1f5f9)   | 15.79:1 | ✅ AAA                                    |
| `text-foreground` (#0f172a)       | `bg-muted` (#64748b)           | 3.36:1  | ❌ FAIL (< 4.5)                           |
| `text-muted-foreground` (#475569) | `bg-card`                      | ≥ 7:1   | ✅ AAA                                    |
| `text-muted` (#64748b)            | `bg-card`                      | 4.61:1  | ⚠️ Limite AA (texte décoratif uniquement) |

### Dark mode

| Avant-plan                        | Arrière-plan           | Ratio  | Verdict                                |
| --------------------------------- | ---------------------- | ------ | -------------------------------------- |
| `text-foreground` (#e2e8f0)       | `bg-background` (navy) | ≥ 14:1 | ✅ AAA                                 |
| `text-muted-foreground` (#cbd5e1) | `bg-card`              | 9.3:1  | ✅ AAA                                 |
| `text-muted` (#94a3b8)            | `bg-card`              | 3.6:1  | ⚠️ Sub-AA (texte décoratif uniquement) |

**Source cc-design** (commentaire `colors_and_type.css` ligne 216-222) :

> `color: var(--color-muted-foreground); /* #cbd5e1 on navy — 9.3:1 AAA (was #94a3b8 · 3.6:1 FAIL) */`
> `.t-muted = timestamps, helper text, disabled (#94a3b8, 3.6:1 — below AA;`

→ cc-design a documenté explicitement que `--color-muted` est volontairement sub-AA pour usage décoratif uniquement.

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
