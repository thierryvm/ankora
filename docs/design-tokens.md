# Design Tokens — Ankora Landing v2

> ## ⛔ DOCUMENT SUPPLANTÉ — 8 août 2026
>
> **Ne rien copier d'ici.** Ce document est une extraction du mockup
> `design-mockup-landing.html` datée du **19 avril 2026** — donc antérieure au
> verrouillage du pigment laiton (24 avril), à ADR-035 et à ADR-036. **Tout son
> corpus est pré-laiton**, pas seulement les lignes qui le disent.
>
> Il porte au moins quatre affirmations aujourd'hui fausses, dont une
> dangereuse : il prescrit `--color-warning → #d97706`, **la valeur exacte
> qu'ADR-036 existe pour interdire** (elle échouait AA à 3.19:1 sur blanc). Il
> annonce aussi une palette d'accent « Amber » là où le produit tient le laiton
> nautique `#8b6914`, `--color-success → #059669` au lieu de `#047857`, et un
> mécanisme de thème par `prefers-color-scheme` alors que le thème se pose par
> `[data-theme='dark']` sur `<html>`.
>
> **Deux successeurs, parce qu'il mélangeait deux autorités :**
>
> | Vous cherchez…                                                 | Allez voir                                                                  |
> | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
> | une **valeur** de token                                        | `src/app/globals.css` — seule source, et la seule que les tests recalculent |
> | l'**usage autorisé** d'un token, les ratios, les anti-patterns | [`docs/design/token-usage.md`](./design/token-usage.md)                     |
>
> Il est conservé, non corrigé : le corriger ligne à ligne maintiendrait en vie
> un quatrième siège d'autorité sur les tokens, et ce n'est pas un manque
> d'information qui a fait dériver ce fichier — c'est le fait qu'il en existait
> un de trop.

**Extracted from:** `design-mockup-landing.html` (landing v2 mockup)  
**Date:** 19 avril 2026 — **périmé, cf. bandeau ci-dessus**

---

## Overview

Ankora uses Tailwind CSS 4 with `@theme inline` to define a semantic, theme-aware design token system. All colors are extracted from the landing mockup v2 and automatically applied across the application via CSS custom properties.

### Key principles

- **Theme-aware:** Colors adapt automatically to light/dark mode via `@media (prefers-color-scheme: dark)`
- **Semantic naming:** Colors describe their function (success, warning, danger) rather than appearance (red, green)
- **Tinted surfaces:** Brand and accent colors have tinted surface variants for chips, badges, and background accents
- **Dark mode priority:** Dark theme text colors are intentionally lighter (brand-300, accent-400) for WCAG AA contrast on dark backgrounds

---

## Color Categories

### Brand Palette (Teal scale)

Used for:

- Primary buttons and CTAs
- Links and interactive elements
- Brand-focused UI components (hero, features, headers)

| Token               | Light   | Dark (if different) | Usage                                            |
| ------------------- | ------- | ------------------- | ------------------------------------------------ |
| `--color-brand-50`  | #f0fdfa | (same)              | Lightest brand surface                           |
| `--color-brand-100` | #ccfbf1 | (same)              | Light brand surface                              |
| `--color-brand-200` | #99f6e4 | (same)              | Medium-light brand                               |
| `--color-brand-300` | #5eead4 | (same)              | Medium brand                                     |
| `--color-brand-400` | #2dd4bf | (same)              | Medium-dark brand                                |
| `--color-brand-500` | #14b8a6 | (same)              | Brand primary (medium)                           |
| `--color-brand-600` | #0d9488 | (same)              | Brand primary (dark) — button default            |
| `--color-brand-700` | #0f766e | #2dd4bf             | Brand dark / Brand text accent (light)           |
| `--color-brand-800` | #115e59 | #5eead4             | Brand darkest / Brand text accent strong (light) |
| `--color-brand-900` | #134e4a | (same)              | Text on brand surface                            |
| `--color-brand-950` | #042f2e | (same)              | Darkest brand (rare)                             |

**Text colors (semantic aliases):**

- `--color-brand-text` → #0f766e (light) / #2dd4bf (dark) — Use for brand-colored text and icons
- `--color-brand-text-strong` → #115e59 (light) / #5eead4 (dark) — Use for strong emphasis text on brand surface

**Surface variants:**

- `--color-brand-surface` → #f0fdfa (light) / rgba(20, 184, 166, 0.1) (dark) — Background for brand-tinted sections
- `--color-brand-surface-border` → #ccfbf1 (light) / rgba(20, 184, 166, 0.22) (dark) — Border for brand-tinted cards

### Accent Palette (Amber scale)

Used for:

- Value-focused elements (cost, savings, transfers)
- Warning/alert states (when not semantic `--color-warning`)
- Secondary CTAs and accents

| Token                | Light   | Dark (if different) | Usage                                    |
| -------------------- | ------- | ------------------- | ---------------------------------------- |
| `--color-accent-50`  | #fffbeb | (same)              | Lightest accent surface                  |
| `--color-accent-100` | #fef3c7 | (same)              | Light accent surface                     |
| `--color-accent-400` | #fbbf24 | (same)              | Medium accent                            |
| `--color-accent-500` | #f59e0b | (same)              | Accent primary                           |
| `--color-accent-600` | #d97706 | (same)              | Accent primary (dark)                    |
| `--color-accent-700` | #b45309 | #fbbf24             | Accent dark / Accent text accent (light) |

**Text colors:**

- `--color-accent-text` → #b45309 (light) / #fbbf24 (dark) — Use for accent-colored text and icons
- `--color-accent-text-strong` → #92400e (light) / #fde68a (dark) — Use for strong emphasis text on accent surface

**Surface variants:**

- `--color-accent-surface` → #fffbeb (light) / rgba(245, 158, 11, 0.1) (dark) — Background for accent-tinted sections
- `--color-accent-surface-border` → #fef3c7 (light) / rgba(245, 158, 11, 0.24) (dark) — Border for accent-tinted cards

### Neutral Palette (Semantic tokens)

#### Background & Surface

- `--color-background` → #f8fafc (light) / #0b1120 (dark) — Page background
- `--color-card` → #ffffff (light) / #111a2e (dark) — Card / elevated surface
- `--color-surface-soft` → #fbfcfe (light) / #0f172a (dark) — Subtle background (forms, code blocks)
- `--color-surface-muted` → #f1f5f9 (light) / #0f172a (dark) — Muted background (disabled states)

#### Text & Foreground

- `--color-foreground` → #0f172a (light) / #e2e8f0 (dark) — Primary text
- `--color-muted` → #64748b (light) / #94a3b8 (dark) — Secondary text (labels, hints)
- `--color-muted-foreground` → #475569 (light) / #cbd5e1 (dark) — Tertiary text (placeholders, captions)

#### Borders & Dividers

- `--color-border` → #e2e8f0 (light) / #1e293b (dark) — Default border color

### Semantic Status Colors

- `--color-success` → #059669 — Healthy status, successful actions, positive balance
- `--color-warning` → #d97706 — Warning states, caution alerts
- `--color-danger` → #dc2626 — Error states, critical balance, delete actions

---

## Spacing & Radius

### Border Radius

Used for rounding corners on buttons, cards, inputs, and overlays.

| Token          | Value          | Usage                              |
| -------------- | -------------- | ---------------------------------- |
| `--radius-sm`  | 0.375rem (6px) | Small buttons, small inputs        |
| `--radius-md`  | 0.5rem (8px)   | Default button radius, form inputs |
| `--radius-lg`  | 0.75rem (12px) | Medium cards, popovers             |
| `--radius-xl`  | 1rem (16px)    | Large cards, modals                |
| `--radius-2xl` | 1.25rem (20px) | Extra large surfaces (hero cards)  |

---

## Typography

- `--font-sans` — Primary font stack (Inter + system fallbacks for UI)
- `--font-mono` — Monospace stack (SF Mono + system fallbacks for code)

Font sizes and weights are not tokenized — use Tailwind's default scales or define size utilities in `tailwind.config.ts` if needed.

---

## Usage Examples

### Light Mode (Default)

```html
<!-- Brand primary button -->
<button class="bg-(--color-brand-600) text-white">Save</button>

<!-- Success badge -->
<span class="rounded-(--radius-md) bg-(--color-success) text-white">Healthy</span>

<!-- Muted text -->
<p class="text-(--color-muted-foreground)">Optional field</p>

<!-- Card with brand-tinted surface -->
<div
  class="rounded-(--radius-xl) border border-(--color-brand-surface-border) bg-(--color-brand-surface)"
>
  Feature highlight
</div>
```

### Dark Mode (Automatic)

The same HTML automatically adjusts colors via `@media (prefers-color-scheme: dark)`:

- `--color-background` → #0b1120
- `--color-brand-700` → #2dd4bf
- `--color-brand-surface` → rgba(20, 184, 166, 0.1)
- etc.

---

## Design Decisions

### Why hex colors (not oklch)?

Current tokens use hex notation for **pixel-perfect fidelity** to the landing mockup v2 design. Conversion to `oklch()` for perceptually uniform interpolation can be done in a separate refactor (e.g., PR #27) to avoid scope creep and maintain visual consistency during the landing port.

### Why semantic color names?

- `--color-brand-text` describes **intent** (use this for brand-colored text)
- `--color-gray-700` describes **appearance** (unhelpful when dark mode flips it to gray-300)
- Semantic names survive design changes and theme switches without refactoring callsites

### Why translucent overlays in dark mode?

Dark mode surfaces use `rgba(...)` for tinted backgrounds (e.g., `rgba(20, 184, 166, 0.1)`) to preserve visual hierarchy and prevent "pure black" surfaces from flattening the interface. This technique is inspired by iOS Human Interface Guidelines and modern design systems (Figma, Apple Design System).

---

## Maintenance

> ⛔ **Procédure abrogée le 8 août 2026. Ne pas la suivre.**
>
> C'est elle, et non les valeurs périmées plus haut, qui faisait le danger de ce
> document : une valeur fausse est inerte tant que personne ne la copie, mais une
> instruction impérative en quatre étapes se suit jusqu'au bout — et son étape 2
> demandait d'écrire ici, ce qui perpétuait le fichier à chaque changement de
> token. Un bandeau en tête n'aurait pas désarmé une consigne située 185 lignes
> plus bas.
>
> **La procédure à jour** vit dans
> [`docs/design/token-usage.md`](./design/token-usage.md) §6 et §8.1. En résumé :
> on édite `src/app/globals.css`, on ajoute la paire de contraste au test qui la
> **recalcule** (`src/app/__tests__/contrast-ratios.test.ts`), et on met à jour
> le tableau du §4 en disant si la ligne est gardée par une porte ou non.
> Rien n'est plus à écrire ici.

~~Ancienne procédure, abrogée : mettre à jour le bloc `@theme` de
`src/app/globals.css`, puis ajouter une entrée dans ce fichier, puis tester dans
les deux thèmes via `prefers-color-scheme: dark` en DevTools, puis committer sous
`chore(design): update design tokens [reason]`.~~

---

## Related files

- `src/app/globals.css` — Tailwind v4 @theme configuration
- `design-mockup-landing.html` — Source mockup (lines 13–127)
- `tailwind.config.ts` — Tailwind framework configuration (extends @theme if needed)
