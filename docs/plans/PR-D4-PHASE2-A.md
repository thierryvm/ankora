# PR-D4-PHASE2-A Implementation Plan — Atoms 1-11 + Hamilton + Design Playground

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter les 11 atoms du pack design Claude Design Session #3 en TypeScript strict + Tailwind 4, avec helper Hamilton (`largestRemainderRound`) et route playground admin-only `/[locale]/_design-playground/` pour validation visuelle.

**Architecture:** Server Components par défaut, `"use client"` uniquement si interactivité requise (Drawer, Tabs, ColorPicker, IconPicker, ThemeToggle, LangSwitcher). Cohabitation temporaire avec `src/components/ui/button.tsx` shadcn legacy (cleanup en PR-D / PR-D5). Animations CSS pures (`@keyframes`/transitions), zéro framer-motion.

**Tech Stack:** Next.js 16 App Router · React 19.2 · TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`) · Tailwind CSS 4 (`@theme inline`) · lucide-react · Vitest 4 + Testing Library · Playwright pour smoke playground.

---

## Scope verrouillé (décisions @cowork validées)

- ✅ **11 atoms** : Button, Chip, Card, Drawer (+ 7 field primitives), ProgressBar, Avatar, ColorPicker, IconPicker, Tabs (ADDENDUM F), ThemeToggle, LangSwitcher
- ✅ **Hamilton helper** : `src/lib/utils/largestRemainderRound.ts` + tests
- ✅ **Playground** : route `/[locale]/_design-playground/page.tsx` gardée par `process.env.ANKORA_DEV_MODE === '1'` (server-only, **PAS** `NEXT_PUBLIC_`)
- ✅ **Cohabitation** : `src/components/ui/button.tsx` (shadcn legacy) reste, `src/components/atoms/Button.tsx` nouveau Ankora CD#3
- ❌ Stepper hors scope (porté en PR-D5 avec Onboarding)
- ❌ AppShell hors scope (= PR-B)
- ❌ Cockpit hors scope (= PR-C)
- ❌ i18n complet hors scope (= PR-D)
- ⚠️ **Tabs sans atom dédié dans le bundle** — implémentations inline existent dans 3 surfaces du handoff :
  - `surfaces/admin/AdminPanelV1.jsx:21` (admin section tabs `role="tablist"`)
  - `surfaces/admin/AdminTopbar.jsx:31` (period selector)
  - `surfaces/onboarding/step2.jsx:17` (Voies A/B/C)

  Ces 3 sources servent de pattern. Implémentation TS extrait le pattern commun + props ADDENDUM F (`tabs[]`, `activeId`, `onChange`, `variant: 'pill'|'underline'`, `size: 'sm'|'md'`).

---

## File Structure

### Nouveaux fichiers à créer (16 .tsx + 5 .ts + 1 .css + 1 .md = 23)

```
src/components/atoms/
├── Button.tsx               # Atom 01
├── Chip.tsx                 # Atom 02
├── Card.tsx                 # Atom 03
├── Drawer.tsx               # Atom 04 (EditDrawer + 7 field primitives)
├── ProgressBar.tsx          # Atom 05
├── Avatar.tsx               # Atom 06
├── ColorPicker.tsx          # Atom 07
├── IconPicker.tsx           # Atom 08
├── Tabs.tsx                 # Atom 09 (extrait pattern admin/onboarding)
├── ThemeToggle.tsx          # Atom 10
├── LangSwitcher.tsx         # Atom 11
├── atoms.css                # Classes statiques partagées (atm-*)
├── icons.ts                 # Registry Lucide curated pour IconPicker
├── index.ts                 # Barrel exports
└── __tests__/
    ├── Button.test.tsx
    ├── Chip.test.tsx
    ├── Card.test.tsx
    ├── Drawer.test.tsx
    ├── ProgressBar.test.tsx
    ├── Avatar.test.tsx
    ├── ColorPicker.test.tsx
    ├── IconPicker.test.tsx
    ├── Tabs.test.tsx
    ├── ThemeToggle.test.tsx
    └── LangSwitcher.test.tsx

src/lib/utils/
├── largestRemainderRound.ts
└── __tests__/
    └── largestRemainderRound.test.ts

src/app/[locale]/_design-playground/
├── page.tsx                 # Route admin-only Server Component
├── playground.css           # Styles showcase (.dpg-*)
├── DrawerDemoClient.tsx     # mini-démo Drawer interactive
├── TabsDemoClient.tsx       # mini-démo Tabs
├── ColorPickerDemoClient.tsx
├── IconPickerDemoClient.tsx
└── LangSwitcherDemoClient.tsx

e2e/
└── design-playground.spec.ts  # Smoke Playwright

docs/prs/
└── PR-D4-PHASE2-A-report.md   # Rapport final DoD
```

### Fichiers à modifier

```
src/app/globals.css           # Append @import "../components/atoms/atoms.css"
.env.example                  # Ajouter ANKORA_DEV_MODE=0 commenté
src/lib/env.ts                # Zod schema accepter ANKORA_DEV_MODE optional
```

### Fichiers exclus (cohabitation)

- `src/components/ui/button.tsx` — **NON modifié** (legacy shadcn, 23 imports en aval). Migration progressive en PR-C/PR-D5.

---

## Conventions & garde-fous TS strict

- **Zéro `any`.** Union discriminées (`type ButtonProps = ButtonPrimaryProps | ButtonGhostProps | ...`) ou unions simples typées.
- **Props lecture seule** : `Readonly<...>` sur les arrays/objects.
- **`"use client"`** : uniquement sur Drawer, Tabs, ColorPicker, IconPicker, ThemeToggle, LangSwitcher. Tous les autres = Server Components compatibles.
- **Imports absolus** : `@/components/atoms/Button` (cohérent avec tsconfig.paths existants).
- **Tests** : style observé dans `src/components/ui/__tests__/button.test.tsx` (`it.each`, `screen.getByRole`, `vi.fn()` pour callbacks).
- **Coverage cible** : ≥90% lignes / ≥85% branches sur chaque atom.
- **Animation** : `@keyframes` opacity/transform basique uniquement, jamais `transform: scaleY` sur SVG path (cassé Brave).
- **Pas de localStorage côté Server Components** : ThemeToggle écrit `document.cookie` + `localStorage` côté client uniquement, lecture initiale via cookie SSR dans le `<html>` AppShell (PR-B).
- **Sécurité icônes** : pour IconPicker, on utilise `lucide-react` direct (composants React typés, tree-shakable). Le pattern du handoff `08-IconPicker.jsx` injecte des SVG paths string via attribut HTML brut — pattern qu'on **n'adopte pas** (XSS risk si registry pollué + perte du tooling). Voir Task 10.

---

## Stratégie commit & branche

- Branche : `feat/cc-design-cd3-cockpit-v2-atoms` (déjà créée)
- 1 atom = 1 commit (rollback granulaire)
- Push à mi-parcours après **Task 5 (Card)** pour CI précoce + draft PR
- Commit messages : `feat(atoms): <name> CD#3 (PR-D4-PHASE2-A)` ou `feat(utils): largestRemainderRound Hamilton method (PR-D4-PHASE2-A)`
- Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com> systématique

---

# Task 1 — Setup foundations (env var + atoms.css + barrel)

**Files:**

- Create: `src/components/atoms/atoms.css`
- Create: `src/components/atoms/index.ts`
- Modify: `src/app/globals.css` (ajout import atoms.css)
- Modify: `.env.example` (ajout `ANKORA_DEV_MODE=0` commenté)
- Modify: `src/lib/env.ts` (Zod schema)

- [x] **Step 1.1: Créer `src/components/atoms/atoms.css` (vide pour l'instant)**

```css
/* ============================================================================
   Ankora atoms — shared static classes
   Source: design_handoff_ankora_v1/atoms/atoms.css (Claude Design Session #3)
   Conventions:
   - Préfixe .atm-* pour toutes les classes atoms
   - Inline styles autorisés pour les valeurs dynamiques (color hex, sizes
     calculées) ; classes statiques pour le reste (radius, padding, fonts)
   - Tokens CSS uniquement via var(--color-*), var(--radius-*), var(--shadow-*),
     var(--ease-*), var(--dur-*) — JAMAIS de valeurs hardcodées
   ============================================================================ */

/* Classes statiques ajoutées progressivement par chaque tâche d'atom. */
```

- [x] **Step 1.2: Créer `src/components/atoms/index.ts` (barrel)**

```ts
// Barrel exports — to be filled progressively as atoms land in PR-D4-PHASE2-A.
// Order: cf docs/plans/PR-D4-PHASE2-A.md task list.
export {};
```

- [x] **Step 1.3: Modifier `src/app/globals.css` — ajouter l'import**

À la **fin** du fichier (après les rules existantes), ajouter :

```css
/* ---------- Atoms (CD#3 — PR-D4-PHASE2-A) ---------- */
@import '../components/atoms/atoms.css';
```

- [x] **Step 1.4: Modifier `.env.example` — ajouter `ANKORA_DEV_MODE`**

Ajouter après le bloc `# ---------- App ----------` :

```bash
# ---------- Design system ----------
# Set to "1" to enable the /[locale]/_design-playground/ route in dev only.
# NEVER set in production. Server-only env (no NEXT_PUBLIC_ prefix) so the
# value cannot leak to the client bundle.
ANKORA_DEV_MODE=0
```

- [x] **Step 1.5: Vérifier `src/lib/env.ts` — si Zod schema strict, ajouter `ANKORA_DEV_MODE`**

Vérifier d'abord la structure du fichier :

```bash
grep -n "ANKORA\|NEXT_PUBLIC_APP_ENV" src/lib/env.ts | head
```

Si Zod schema strict avec `.parse()` qui rejette les keys inconnues, ajouter dans le bloc `server` :

```ts
ANKORA_DEV_MODE: z.enum(['0', '1']).default('0').optional(),
```

Sinon (passthrough), pas d'action.

- [x] **Step 1.6: Vérifier que le typecheck passe + commit**

```bash
npm run typecheck && npm run lint
```

Expected: 0 erreur.

```bash
git add src/components/atoms/atoms.css src/components/atoms/index.ts src/app/globals.css .env.example src/lib/env.ts
git commit -m "$(cat <<'EOF'
chore(atoms): foundations setup — atoms.css + barrel + ANKORA_DEV_MODE env (PR-D4-PHASE2-A)

- Create src/components/atoms/atoms.css (vide, rempli progressivement par tâche)
- Create src/components/atoms/index.ts barrel
- Modify src/app/globals.css: import "../components/atoms/atoms.css"
- Modify .env.example: documente ANKORA_DEV_MODE (server-only, /design-playground guard)
- Modify src/lib/env.ts: Zod schema accepte ANKORA_DEV_MODE optional (si strict mode)

@cc-ankora — exécutant PR-D4-PHASE2-A Task 1/18

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Task 2 — Hamilton helper `largestRemainderRound`

**Files:**

- Create: `src/lib/utils/largestRemainderRound.ts`
- Create: `src/lib/utils/__tests__/largestRemainderRound.test.ts`

**Source:** `design_handoff_ankora_v1/utils/largestRemainderRound.js` + brief `prompts/PR-D4-PHASE2-cd3-integration.md` §L.3.

- [x] **Step 2.1: Écrire les tests EN PREMIER (TDD pur)**

```ts
import { describe, it, expect } from 'vitest';

import { largestRemainderRound } from '../largestRemainderRound';

describe('largestRemainderRound (Hamilton method)', () => {
  it('returns all zeros when total is 0', () => {
    expect(largestRemainderRound([5, 3, 2], 0)).toEqual([0, 0, 0]);
  });

  it('returns empty array for empty input', () => {
    expect(largestRemainderRound([], 100)).toEqual([]);
  });

  it('canonical case: [5,3,2,0,2] / 12 → [42,25,17,0,16] (sum = 100)', () => {
    const result = largestRemainderRound([5, 3, 2, 0, 2], 12);
    expect(result).toEqual([42, 25, 17, 0, 16]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('every count = total → equal distribution that sums to 100', () => {
    const result = largestRemainderRound([1, 1, 1, 1], 4);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toEqual([25, 25, 25, 25]);
  });

  it('one count = total → single 100', () => {
    expect(largestRemainderRound([10, 0, 0], 10)).toEqual([100, 0, 0]);
  });

  it('three equal counts → distribution stable, sums to 100', () => {
    // Each 1/3 = 33.33... ; floor 33 each ; remainder 0.33 same for all.
    // toDistribute = 100 - 99 = 1 → first index by stable sort wins +1.
    const result = largestRemainderRound([1, 1, 1], 3);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toContain(34);
    expect(result.filter((v) => v === 33)).toHaveLength(2);
  });

  it('handles real-world admin Top sources sample', () => {
    // Direct: 12, Search: 8, Social: 5, Email: 3, Other: 2 ; total = 30
    const result = largestRemainderRound([12, 8, 5, 3, 2], 30);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    // Direct should be largest, descending order respected
    expect(result[0]).toBeGreaterThanOrEqual(result[1]!);
    expect(result[1]).toBeGreaterThanOrEqual(result[2]!);
  });

  it('handles single zero in input — that bucket stays at 0%', () => {
    const result = largestRemainderRound([5, 0, 5], 10);
    expect(result[1]).toBe(0);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('returns immutable result (does not mutate input)', () => {
    const input = [5, 3, 2];
    const inputCopy = [...input];
    largestRemainderRound(input, 10);
    expect(input).toEqual(inputCopy);
  });

  it('handles total smaller than sum of values gracefully', () => {
    // values sum to 10 but total claimed = 5 → percentages > 100 each
    // Function should still output a finite array of integers.
    const result = largestRemainderRound([5, 3, 2], 5);
    expect(result).toHaveLength(3);
    result.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
```

- [x] **Step 2.2: Run tests → fail attendu (helper n'existe pas)**

```bash
npm run test -- src/lib/utils/__tests__/largestRemainderRound.test.ts
```

Expected: FAIL avec `Cannot find module '../largestRemainderRound'`.

- [x] **Step 2.3: Implémenter `src/lib/utils/largestRemainderRound.ts`**

```ts
/**
 * Hamilton (largest remainder) method for distributing percentages so that
 * they sum to exactly 100 with integer outputs.
 *
 * Used in admin panel for Top sources / Drop-off breakdown so percentages
 * never round to 99 % or 101 %. Pure function, no side effects.
 *
 * @param values - Counts per bucket (e.g. [12, 8, 5, 3, 2] for 5 sources)
 * @param total - Reference total (typically sum(values), but caller may pass
 *   another reference for ratio-based distribution)
 * @returns Integer percentages, same length as `values`, summing to exactly 100
 *   when total > 0. Returns an array of zeros when total = 0 or values is empty.
 */
export function largestRemainderRound(values: readonly number[], total: number): number[] {
  if (values.length === 0) return [];
  if (total === 0) return values.map(() => 0);

  const exact = values.map((v) => (v / total) * 100);
  const floored = exact.map(Math.floor);
  const remainders = exact.map((v, idx) => ({ idx, rem: v - Math.floor(v) }));
  const distributed = floored.reduce((acc, b) => acc + b, 0);
  const toDistribute = 100 - distributed;

  // Sort descending by remainder ; ties broken by index (stable)
  remainders.sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return a.idx - b.idx;
  });

  const result = [...floored];
  for (let i = 0; i < toDistribute && i < remainders.length; i++) {
    const target = remainders[i];
    if (target) result[target.idx] = (result[target.idx] ?? 0) + 1;
  }

  return result;
}
```

- [x] **Step 2.4: Run tests → tous PASS**

Expected: PASS (10 tests). Coverage ≥ 95% lignes.

- [x] **Step 2.5: Commit**

```bash
git add src/lib/utils/largestRemainderRound.ts src/lib/utils/__tests__/largestRemainderRound.test.ts
git commit -m "$(cat <<'EOF'
feat(utils): largestRemainderRound Hamilton method (PR-D4-PHASE2-A)

Distribue des pourcentages entiers sommant exactement à 100 — utilisé par
l'admin panel pour Top sources et Drop-off breakdown (cf. brief PR-D4-PHASE2
§L.3 + utils/largestRemainderRound.js du handoff CD#3).

Pure function, no side effects. Tests Vitest 10 cas (total=0, empty, canonical
[5,3,2,0,2]/12 → [42,25,17,0,16], real admin sample, ties deterministic,
immutability, edge total < sum). Coverage ≥ 95% lignes.

@cc-ankora — exécutant PR-D4-PHASE2-A Task 2/18

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Task 3 — Atom 01 Button

**Files:**

- Create: `src/components/atoms/Button.tsx`
- Create: `src/components/atoms/__tests__/Button.test.tsx`
- Modify: `src/components/atoms/atoms.css` (classes `.atm-btn-*`)
- Modify: `src/components/atoms/index.ts` (export Button)

**Source canonique:** `design_handoff_ankora_v1/atoms/01-Button.jsx`

**Signature TypeScript:**

```ts
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: React.ReactNode;
  readonly iconRight?: React.ReactNode;
  readonly loading?: boolean;
  readonly children?: React.ReactNode;
}
```

- [x] **Step 3.1: Écrire le test EN PREMIER**

Créer `src/components/atoms/__tests__/Button.test.tsx` :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Button } from '../Button';

describe('<Button /> (atom CD#3)', () => {
  it('renders a <button> element', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' }).tagName).toBe('BUTTON');
  });

  it('applies default variant=primary + size=md', () => {
    render(<Button>Test</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('atm-btn--primary');
    expect(btn.className).toContain('atm-btn--md');
  });

  it.each([
    ['primary', 'atm-btn--primary'],
    ['secondary', 'atm-btn--secondary'],
    ['ghost', 'atm-btn--ghost'],
    ['destructive', 'atm-btn--destructive'],
  ] as const)('applies variant %s', (variant, cls) => {
    render(<Button variant={variant}>X</Button>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it.each([
    ['sm', 'atm-btn--sm'],
    ['md', 'atm-btn--md'],
    ['lg', 'atm-btn--lg'],
  ] as const)('applies size %s', (size, cls) => {
    render(<Button size={size}>X</Button>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>Loading…</Button>);
    expect(container.querySelector('.atm-btn-spin')).toBeTruthy();
  });

  it('disables button when loading', () => {
    render(<Button loading>Loading…</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders icon left and label', () => {
    render(<Button icon={<span data-testid="icon-left">⬇</span>}>Save</Button>);
    expect(screen.getByTestId('icon-left')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('renders icon-only with aria-label', () => {
    render(<Button icon={<span>⬇</span>} aria-label="Download" />);
    const btn = screen.getByRole('button', { name: 'Download' });
    expect(btn.className).toContain('atm-btn--icon-only');
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        X
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        X
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards ref to <button>', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>X</Button>);
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('calls onClick when active', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>X</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 3.2: Run test → FAIL (Button n'existe pas)**

- [x] **Step 3.3: Implémenter `src/components/atoms/Button.tsx`**

```tsx
import * as React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: React.ReactNode;
  readonly iconRight?: React.ReactNode;
  readonly loading?: boolean;
  readonly children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isIconOnly = !!icon && !children;
  const classes = [
    'atm-btn',
    `atm-btn--${variant}`,
    `atm-btn--${size}`,
    loading ? 'is-loading' : '',
    isIconOnly ? 'atm-btn--icon-only' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="atm-btn-spin" aria-hidden="true" />}
      {!loading && icon && (
        <span className="atm-btn-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children && <span className="atm-btn-label">{children}</span>}
      {!loading && iconRight && (
        <span className="atm-btn-icon" aria-hidden="true">
          {iconRight}
        </span>
      )}
    </button>
  );
});
```

- [x] **Step 3.4: Ajouter les classes CSS dans `src/components/atoms/atoms.css`**

Append :

```css
/* ============================================================================
   Atom 01 — Button
   Variants: primary (teal solide) · secondary (surface soft) · ghost (texte teal) · destructive (rouge)
   Sizes: sm (h32) · md (h36) · lg (h44)
   ============================================================================ */
.atm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--dur-default) var(--ease-spring),
    color var(--dur-default) var(--ease-spring),
    border-color var(--dur-default) var(--ease-spring),
    box-shadow var(--dur-default) var(--ease-spring),
    transform var(--dur-micro) var(--ease-spring);
  border: 1px solid transparent;
  user-select: none;
}
.atm-btn:disabled,
.atm-btn.is-loading {
  cursor: not-allowed;
  opacity: 0.55;
}
.atm-btn:focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 2px;
}

/* Sizes */
.atm-btn--sm {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}
.atm-btn--md {
  height: 36px;
  padding: 0 14px;
  font-size: 14px;
}
.atm-btn--lg {
  height: 44px;
  padding: 0 18px;
  font-size: 15px;
}

/* Variants */
.atm-btn--primary {
  background: var(--color-brand-500);
  color: #fff;
}
.atm-btn--primary:hover:not(:disabled) {
  background: var(--color-brand-600);
}
.atm-btn--primary:active:not(:disabled) {
  transform: translateY(1px);
}

.atm-btn--secondary {
  background: var(--color-surface-soft);
  color: var(--color-foreground);
  border-color: var(--color-border);
}
.atm-btn--secondary:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.atm-btn--ghost {
  background: transparent;
  color: var(--color-brand-text);
}
.atm-btn--ghost:hover:not(:disabled) {
  background: var(--color-brand-surface);
}

.atm-btn--destructive {
  background: var(--color-danger);
  color: #fff;
}
.atm-btn--destructive:hover:not(:disabled) {
  filter: brightness(1.05);
}

/* Icon-only square */
.atm-btn--icon-only {
  padding: 0;
  width: 36px;
}
.atm-btn--icon-only.atm-btn--sm {
  width: 32px;
}
.atm-btn--icon-only.atm-btn--lg {
  width: 44px;
}

/* Spinner */
.atm-btn-spin {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-bottom-color: transparent;
  border-radius: 50%;
  animation: atm-btn-spin 720ms linear infinite;
}
@keyframes atm-btn-spin {
  to {
    transform: rotate(360deg);
  }
}

.atm-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.atm-btn-label {
  display: inline-block;
}
```

- [x] **Step 3.5: Mettre à jour le barrel `src/components/atoms/index.ts`**

```ts
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
```

- [x] **Step 3.6: Run tests → tous PASS**

Expected: 12 tests PASS.

- [x] **Step 3.7: Commit**

```bash
git add src/components/atoms/Button.tsx src/components/atoms/__tests__/Button.test.tsx src/components/atoms/atoms.css src/components/atoms/index.ts
git commit -m "$(cat <<'EOF'
feat(atoms): Button CD#3 (PR-D4-PHASE2-A)

Atom 01 — primary/secondary/ghost/destructive × sm/md/lg, icon support,
loading state avec spinner, icon-only auto-detect. Cohabite avec
src/components/ui/button.tsx (shadcn legacy, 23 imports en aval) — migration
progressive en PR-C/PR-D5.

Source: design_handoff_ankora_v1/atoms/01-Button.jsx
Tests Vitest: 12 cas (variants × sizes, loading, icon-only, disabled, ref forward)

@cc-ankora — exécutant PR-D4-PHASE2-A Task 3/18

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Task 4 — Atom 02 Chip

**Files:** `Chip.tsx` + `__tests__/Chip.test.tsx` + `atoms.css` (append) + `index.ts`

**Source canonique:** `design_handoff_ankora_v1/atoms/02-Chip.jsx`

**Signature TypeScript:**

```ts
export type ChipSize = 's' | 'm' | 'l';

export interface ChipProps {
  readonly color?: string; // hex (e.g. "#14b8a6")
  readonly label?: string;
  readonly emoji?: string;
  readonly icon?: React.ReactNode;
  readonly size?: ChipSize;
  readonly removable?: boolean;
  readonly onRemove?: () => void;
}
```

- [x] **Step 4.1: Tests Vitest TDD (~9 cas)**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chip } from '../Chip';

describe('<Chip />', () => {
  it('renders label', () => {
    render(<Chip label="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('applies color via inline style (color-mix background + border)', () => {
    render(<Chip label="Brand" color="#14b8a6" />);
    const span = screen.getByText('Brand').parentElement!;
    const style = span.getAttribute('style') ?? '';
    expect(style).toContain('color-mix');
    expect(style).toContain('#14b8a6');
  });

  it('uses fallback grey when no color provided', () => {
    render(<Chip label="X" />);
    const span = screen.getByText('X').parentElement!;
    expect(span.getAttribute('style')).toContain('#94a3b8');
  });

  it.each([
    ['s', '11px'],
    ['m', '12px'],
    ['l', '13px'],
  ] as const)('applies size %s with font-size %s', (size, fs) => {
    render(<Chip label="X" size={size} />);
    const span = screen.getByText('X').parentElement!;
    expect(span.getAttribute('style')).toContain(fs);
  });

  it('renders emoji when provided', () => {
    render(<Chip label="Pizza" emoji="🍕" />);
    expect(screen.getByText('🍕')).toBeInTheDocument();
  });

  it('renders custom icon node', () => {
    render(<Chip label="X" icon={<span data-testid="custom-icon">⭐</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('shows close button when removable', () => {
    render(<Chip label="X" removable onRemove={() => {}} />);
    expect(screen.getByRole('button', { name: /retirer/i })).toBeInTheDocument();
  });

  it('calls onRemove when close button clicked', () => {
    const onRemove = vi.fn();
    render(<Chip label="X" removable onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /retirer/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not render close button when not removable', () => {
    render(<Chip label="X" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [x] **Step 4.2: Run → FAIL**

- [x] **Step 4.3: Implémenter `src/components/atoms/Chip.tsx`**

```tsx
import * as React from 'react';

export type ChipSize = 's' | 'm' | 'l';

export interface ChipProps {
  readonly color?: string;
  readonly label?: string;
  readonly emoji?: string;
  readonly icon?: React.ReactNode;
  readonly size?: ChipSize;
  readonly removable?: boolean;
  readonly onRemove?: () => void;
}

const PADDING_BY_SIZE: Record<ChipSize, string> = {
  s: '2px 8px',
  m: '4px 10px',
  l: '6px 12px',
};
const FONT_SIZE_BY_SIZE: Record<ChipSize, string> = {
  s: '11px',
  m: '12px',
  l: '13px',
};

export function Chip({
  color = '#94a3b8',
  label,
  emoji,
  icon,
  size = 'm',
  removable,
  onRemove,
}: ChipProps): React.JSX.Element {
  return (
    <span
      className="atm-chip"
      style={{
        padding: PADDING_BY_SIZE[size],
        fontSize: FONT_SIZE_BY_SIZE[size],
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
      }}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {icon && (
        <span aria-hidden="true" className="atm-chip-icon">
          {icon}
        </span>
      )}
      {label && <span>{label}</span>}
      {removable && (
        <button type="button" className="atm-chip-x" aria-label="Retirer" onClick={onRemove}>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </span>
  );
}
```

- [x] **Step 4.4: CSS append `.atm-chip*`**

```css
.atm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-full);
  font-family: var(--font-sans);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  vertical-align: middle;
}
.atm-chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.atm-chip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  padding: 0;
  margin-left: 2px;
  color: inherit;
  cursor: pointer;
  border-radius: var(--radius-full);
  width: 14px;
  height: 14px;
}
.atm-chip-x:hover {
  background: color-mix(in oklab, currentColor 18%, transparent);
}
.atm-chip-x:focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 2px;
}
```

- [x] **Step 4.5: Update barrel + run tests → PASS**

```ts
// index.ts append
export { Chip } from './Chip';
export type { ChipProps, ChipSize } from './Chip';
```

- [x] **Step 4.6: Commit**

```bash
git commit -m "feat(atoms): Chip CD#3 (PR-D4-PHASE2-A)

Atom 02 — pill colorée s/m/l, color-mix dynamique sur color hex prop.
Removable avec close button a11y. Pas couplé au catalogue catégories
(CategoryBadge sera une spécialisation côté Cockpit/Charges).

Source: design_handoff_ankora_v1/atoms/02-Chip.jsx
Tests: 11 cas (color fallback, sizes, emoji/icon, removable callback)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 5 — Atom 03 Card + push mid-PR + draft PR

**Files:** `Card.tsx` + tests + `atoms.css` + `index.ts`

**Source canonique:** `design_handoff_ankora_v1/atoms/03-Card.jsx`

**Signature TypeScript:**

```ts
export type CardPadding = 'sm' | 'md' | 'lg' | 'none';
export type CardElevation = 'flat' | 'raised';
export type CardTone = 'default' | 'soft' | 'brand' | 'accent' | 'warning' | 'danger';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  readonly padding?: CardPadding;
  readonly elevation?: CardElevation;
  readonly tone?: CardTone;
  readonly eyebrow?: React.ReactNode;
  readonly title?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly children?: React.ReactNode;
}
```

- [x] **Step 5.1: Tests Vitest (~10 cas)** : default props, paddings × 4, elevations × 2, tones × 6, header conditional (eyebrow/title), footer, className passthrough.

- [x] **Step 5.2: Run → FAIL**

- [x] **Step 5.3: Implement** (forwarder pattern simple, Server Component compatible)

```tsx
import * as React from 'react';

export type CardPadding = 'sm' | 'md' | 'lg' | 'none';
export type CardElevation = 'flat' | 'raised';
export type CardTone = 'default' | 'soft' | 'brand' | 'accent' | 'warning' | 'danger';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  readonly padding?: CardPadding;
  readonly elevation?: CardElevation;
  readonly tone?: CardTone;
  readonly eyebrow?: React.ReactNode;
  readonly title?: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly children?: React.ReactNode;
}

export function Card({
  padding = 'md',
  elevation = 'flat',
  tone = 'default',
  eyebrow,
  title,
  footer,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const classes = [
    'atm-card',
    `atm-card--p-${padding}`,
    `atm-card--${elevation}`,
    `atm-card--tone-${tone}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} {...rest}>
      {(eyebrow || title) && (
        <header className="atm-card-head">
          {eyebrow && <div className="atm-card-eyebrow eyebrow">{eyebrow}</div>}
          {title && <h3 className="atm-card-title">{title}</h3>}
        </header>
      )}
      <div className="atm-card-body">{children}</div>
      {footer && <footer className="atm-card-foot">{footer}</footer>}
    </section>
  );
}
```

- [x] **Step 5.4: CSS append `.atm-card*`**

```css
.atm-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
}
.atm-card--flat {
  box-shadow: none;
}
.atm-card--raised {
  box-shadow: var(--shadow-md);
}

.atm-card--p-none .atm-card-body {
  padding: 0;
}
.atm-card--p-sm .atm-card-body {
  padding: 12px;
}
.atm-card--p-md .atm-card-body {
  padding: 16px;
}
.atm-card--p-lg .atm-card-body {
  padding: 24px;
}
.atm-card--p-none .atm-card-head,
.atm-card--p-none .atm-card-foot {
  padding: 0;
}
.atm-card--p-sm .atm-card-head {
  padding: 12px 12px 0;
}
.atm-card--p-md .atm-card-head {
  padding: 16px 16px 0;
}
.atm-card--p-lg .atm-card-head {
  padding: 24px 24px 0;
}
.atm-card--p-sm .atm-card-foot {
  padding: 0 12px 12px;
}
.atm-card--p-md .atm-card-foot {
  padding: 0 16px 16px;
}
.atm-card--p-lg .atm-card-foot {
  padding: 0 24px 24px;
}

.atm-card-eyebrow {
  margin-bottom: 6px;
  color: var(--color-muted-foreground);
}
.atm-card-title {
  margin: 0;
  font: var(--text-h3);
  color: var(--color-foreground);
}

.atm-card--tone-soft {
  background: var(--color-surface-soft);
}
.atm-card--tone-brand {
  background: var(--color-brand-surface);
  border-color: var(--color-brand-surface-border);
}
.atm-card--tone-accent {
  background: var(--color-accent-surface);
  border-color: var(--color-accent-surface-border);
}
.atm-card--tone-warning {
  background: color-mix(in oklab, var(--color-warning) 8%, transparent);
  border-color: color-mix(in oklab, var(--color-warning) 24%, transparent);
}
.atm-card--tone-danger {
  background: color-mix(in oklab, var(--color-danger) 8%, transparent);
  border-color: color-mix(in oklab, var(--color-danger) 24%, transparent);
}
```

- [x] **Step 5.5: Update barrel + run tests → PASS**

```ts
export { Card } from './Card';
export type { CardProps, CardPadding, CardElevation, CardTone } from './Card';
```

- [x] **Step 5.6: Commit Card**

```bash
git commit -m "feat(atoms): Card CD#3 (PR-D4-PHASE2-A)

Atom 03 — section conteneur padding sm/md/lg/none × elevation flat/raised
× tone default/soft/brand/accent/warning/danger. Eyebrow+title+footer optionnels.
Pattern utilisé partout (dashboard, charges, dépenses, admin).

Source: design_handoff_ankora_v1/atoms/03-Card.jsx
Tests: 12+ cas (paddings, elevations, tones, header conditional, footer)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [x] **Step 5.7: Quality gates locaux**

```bash
npm run lint && npm run lint:use-server && npm run typecheck && npm run test
```

Expected: tout PASS.

- [x] **Step 5.8: Push mid-PR + ouvrir draft PR**

```bash
git push -u origin feat/cc-design-cd3-cockpit-v2-atoms
gh pr create --draft --title "feat(atoms): Atoms 1-11 CD#3 + Hamilton + design playground (PR-D4-PHASE2-A) [WIP]" --body "$(cat <<'EOF'
## Summary

PR-D4-PHASE2-A — décomposition de la PR-D4 PHASE 2 du brief CD#3 en 4 sous-PRs séquentielles A/B/C/D (décision @cowork validée par @thierry, cf. docs/plans/PR-D4-PHASE2-A.md).

**Cette PR (A)** : 11 atoms TypeScript + helper Hamilton + route playground admin-only `/[locale]/_design-playground/` (gardée par `ANKORA_DEV_MODE=1` server-only).

**État actuel : WIP — Tasks 1/18 → 5/18 complétées**

- ✅ Foundations (atoms.css + barrel + ANKORA_DEV_MODE env)
- ✅ Hamilton helper `largestRemainderRound` (10 tests)
- ✅ Atom 01 Button (12 tests)
- ✅ Atom 02 Chip (9 tests)
- ✅ Atom 03 Card (12+ tests)
- ⏳ Atom 04 Drawer (gros morceau)
- ⏳ Atom 05 ProgressBar
- ⏳ Atom 06 Avatar
- ⏳ Atom 07 ColorPicker
- ⏳ Atom 08 IconPicker
- ⏳ Atom 09 Tabs (extrait pattern admin/onboarding)
- ⏳ Atom 10 ThemeToggle
- ⏳ Atom 11 LangSwitcher
- ⏳ Route playground + smoke E2E
- ⏳ Agents QA finale + DoD 5 critères

## Hors scope (= autres sous-PRs)

- AppShell + RBAC + requireAdmin = PR-D4-PHASE2-B
- Surface 1 Cockpit (HeroWaterfall + 6 composants) = PR-D4-PHASE2-C
- i18n complet (95 clés × 5 locales) = PR-D4-PHASE2-D
- Stepper extraction = PR-D5 (avec Onboarding)

## Test plan

- [ ] CI verts (lint, typecheck, lint:use-server, vitest, e2e, build)
- [ ] Sourcery silencieux sur DERNIER commit
- [ ] Coverage atoms ≥90% lignes / ≥85% branches
- [ ] Route playground visuelle vérifiée localement (ANKORA_DEV_MODE=1)
- [ ] Agents QA : ui-auditor, mobile-ios-auditor, i18n-auditor (n/a phase A), test-runner, security-auditor — findings P0/P1 fixés
- [ ] Pas de conflit avec main
- [ ] Rapport final docs/prs/PR-D4-PHASE2-A-report.md livré

@cowork — signal mid-PR pour revue intermédiaire après Card (Task 5/18). Continue ensuite jusqu'à 18/18 puis ready-for-review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [x] **Step 5.9: Signaler @cowork**

> @cowork — draft PR ouverte. 5/18 tasks. Foundations + Hamilton + Button + Chip + Card livrés. CI déclenchée. Je continue ProgressBar → Avatar → Drawer → ColorPicker → IconPicker → Tabs → ThemeToggle → LangSwitcher → playground → tests → DoD. Stop si revue intermédiaire bloque, sinon enchaîne.

---

# Task 6 — Atom 05 ProgressBar

**Files:** `ProgressBar.tsx` + tests + `atoms.css` + `index.ts`

**Source canonique:** `design_handoff_ankora_v1/atoms/05-ProgressBar.jsx`

**Signature:**

```ts
export type ProgressBarTone = 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

export interface ProgressBarSplit {
  readonly affected: number;
  readonly free: number;
  readonly affectedTone?: ProgressBarTone;
  readonly freeTone?: ProgressBarTone;
}

export interface ProgressBarProps {
  readonly value: number;
  readonly max?: number;
  readonly tone?: ProgressBarTone;
  readonly size?: ProgressBarSize;
  readonly label?: string;
  readonly valueLabel?: string;
  readonly sub?: string;
  readonly showValue?: boolean;
  readonly showCap?: boolean;
  readonly split?: ProgressBarSplit;
}
```

- [x] **Step 6.1: Tests TDD (~12 cas)**

Cases obligatoires:

- value=0 → width 0%
- value=max → width 100%
- value > max → tone auto = danger, width capped 100%
- value 0.86×max → tone auto = warning
- value < 0.85 → tone auto = brand
- explicit tone override
- split mode renders 2 segments (affected + free)
- showValue → renders %
- showCap → renders cap divider
- size sm/md/lg → height 6/8/12 px
- aria-progressbar role + valuenow + valuemin + valuemax
- label + sub rendered

- [x] **Step 6.2: Implement** (port `05-ProgressBar.jsx` en TS strict + extension split)

```tsx
import * as React from 'react';

// ... types ci-dessus ...

const HEIGHT_BY_SIZE: Record<ProgressBarSize, number> = { sm: 6, md: 8, lg: 12 };

export function ProgressBar({
  value,
  max = 1,
  tone,
  size = 'md',
  label,
  valueLabel,
  sub,
  showValue = false,
  showCap = false,
  split,
}: ProgressBarProps): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, value / max));
  const overflow = value / max > 1;
  const auto: ProgressBarTone = overflow ? 'danger' : pct > 0.85 ? 'warning' : 'brand';
  const finalTone = tone ?? auto;
  const h = HEIGHT_BY_SIZE[size];

  return (
    <div className="atm-pbar-wrap" role="presentation">
      {(label || showValue) && (
        <div className="atm-pbar-head">
          {label && <span className="atm-pbar-label">{label}</span>}
          {showValue && (
            <span className="atm-pbar-value">{valueLabel ?? `${Math.round(pct * 100)}%`}</span>
          )}
        </div>
      )}
      <div
        className="atm-pbar"
        style={{ height: h }}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progression'}
      >
        {split ? (
          <>
            <div
              className={`atm-pbar-fill atm-pbar--${split.affectedTone ?? 'brand'}`}
              style={{ width: `${Math.min(100, (split.affected / max) * 100)}%` }}
            />
            <div
              className={`atm-pbar-fill atm-pbar--${split.freeTone ?? 'accent'}`}
              style={{ width: `${Math.min(100, (split.free / max) * 100)}%` }}
            />
          </>
        ) : (
          <div
            className={`atm-pbar-fill atm-pbar--${finalTone}`}
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        )}
        {showCap && <div className="atm-pbar-cap" aria-hidden="true" />}
      </div>
      {sub && <div className="atm-pbar-sub">{sub}</div>}
    </div>
  );
}
```

- [x] **Step 6.3: CSS `.atm-pbar*` (transitions width via CSS, pas framer-motion)**

```css
.atm-pbar-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.atm-pbar-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
}
.atm-pbar-label {
  color: var(--color-muted-foreground);
}
.atm-pbar-value {
  color: var(--color-foreground);
  font-variant-numeric: tabular-nums;
}
.atm-pbar {
  position: relative;
  background: var(--color-surface-muted);
  border-radius: var(--radius-full);
  overflow: hidden;
  display: flex;
}
.atm-pbar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--dur-structural) var(--ease-spring);
}
.atm-pbar--brand {
  background: var(--color-brand-500);
}
.atm-pbar--accent {
  background: var(--color-accent-400);
}
.atm-pbar--success {
  background: var(--color-success);
}
.atm-pbar--warning {
  background: var(--color-warning);
}
.atm-pbar--danger {
  background: var(--color-danger);
}
.atm-pbar--neutral {
  background: var(--color-muted);
}
.atm-pbar-cap {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 2px;
  background: var(--color-foreground);
  opacity: 0.6;
}
.atm-pbar-sub {
  font-size: 11px;
  color: var(--color-muted-foreground);
}
```

- [x] **Step 6.4: Tests PASS + commit**

```bash
git commit -m "feat(atoms): ProgressBar CD#3 split-aware (PR-D4-PHASE2-A)

Atom 05 — value/max, tone auto (warning >0.85, danger >1.0), split mode
(affected + free deux segments) pour visualisation provisions/budget.
Pattern utilisé Reste disponible, provisions, budget enveloppe (ADR-002 split).

Source: design_handoff_ankora_v1/atoms/05-ProgressBar.jsx
Tests: 12+ cas (auto-tone, split, sizes, aria-progressbar)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 7 — Atom 06 Avatar

**Files:** `Avatar.tsx` + tests + `atoms.css` + `index.ts`

**Source:** `design_handoff_ankora_v1/atoms/06-Avatar.jsx`

**Signature:**

```ts
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'rounded';

export interface AvatarProps {
  readonly emoji?: string;
  readonly icon?: React.ReactNode;
  readonly initials?: string;
  readonly label?: string;
  readonly color?: string;
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}
```

- [x] **Step 7.1: Tests Vitest (~10 cas)** : sizes mapping (xs=20, sm=28, md=36, lg=44, xl=56), shape rounded vs circle (border-radius), emoji|icon|initials priority order, color-mix dynamique, role img si label fourni.

- [x] **Step 7.2: Implement** (port direct `06-Avatar.jsx` en TS)

```tsx
import * as React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'rounded';

export interface AvatarProps {
  readonly emoji?: string;
  readonly icon?: React.ReactNode;
  readonly initials?: string;
  readonly label?: string;
  readonly color?: string;
  readonly size?: AvatarSize;
  readonly shape?: AvatarShape;
}

const PX_BY_SIZE: Record<AvatarSize, number> = { xs: 20, sm: 28, md: 36, lg: 44, xl: 56 };

export function Avatar({
  emoji,
  icon,
  initials,
  label,
  color = '#94a3b8',
  size = 'md',
  shape = 'rounded',
}: AvatarProps): React.JSX.Element {
  const px = PX_BY_SIZE[size];
  const fs = Math.round(px * 0.5);
  const radius = shape === 'circle' ? '50%' : 'var(--radius-md)';
  return (
    <span
      className="atm-avatar"
      role={label ? 'img' : undefined}
      aria-label={label}
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        background: `color-mix(in oklab, ${color} 16%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 28%, transparent)`,
        fontSize: fs,
      }}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {!emoji && icon}
      {!emoji && !icon && initials && (
        <span className="atm-avatar-init" style={{ fontSize: Math.round(px * 0.4) }}>
          {initials}
        </span>
      )}
    </span>
  );
}
```

- [x] **Step 7.3: CSS minimal `.atm-avatar*`**

```css
.atm-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-weight: 600;
  flex-shrink: 0;
  vertical-align: middle;
}
.atm-avatar-init {
  letter-spacing: -0.02em;
}
```

- [x] **Step 7.4: Tests PASS + commit**

```bash
git commit -m "feat(atoms): Avatar CD#3 (PR-D4-PHASE2-A)

Atom 06 — tile carrée/circle xs(20)/sm(28)/md(36)/lg(44)/xl(56), emoji|icon|initials.
Color-mix dynamique sur color hex. role img si label fourni.

Source: design_handoff_ankora_v1/atoms/06-Avatar.jsx
Tests: 10 cas (sizes, shapes, priority emoji>icon>initials, a11y label)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 8 — Atom 04 Drawer (le gros morceau)

**Files:**

- Create: `src/components/atoms/Drawer.tsx` (EditDrawer + 7 field primitives)
- Create: `src/components/atoms/__tests__/Drawer.test.tsx`
- Modify: `atoms.css` (port complet `_deps/drawer.css`) + `index.ts`

**Source canonique:** `design_handoff_ankora_v1/atoms/_deps/drawer.jsx` + `_deps/drawer.css`

**Décision technique:**

- `"use client"` directive (refs + useState + useEffect)
- Type discriminé `DrawerField` (text | money | date | select | category | frequency | notes)
- Composant principal `EditDrawer` exporté
- Field renderers internes (TextField, MoneyField, DateField, SelectField, CategoryField, FrequencyField, NotesField)
- Focus trap minimal (auto-focus first input + ESC)

**Signature TypeScript discriminée:**

```ts
'use client';

export type DrawerFieldType =
  | 'text'
  | 'money'
  | 'date'
  | 'select'
  | 'category'
  | 'frequency'
  | 'notes';

interface DrawerFieldBase {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly help?: string;
  readonly disabled?: boolean;
  readonly validate?: (value: string | undefined, all: DrawerValues) => string | undefined;
}

export interface DrawerTextField extends DrawerFieldBase {
  readonly type: 'text';
  readonly inputType?: 'text' | 'email' | 'tel' | 'url';
}
export interface DrawerMoneyField extends DrawerFieldBase {
  readonly type: 'money';
}
export interface DrawerDateField extends DrawerFieldBase {
  readonly type: 'date';
}
export interface DrawerNotesField extends DrawerFieldBase {
  readonly type: 'notes';
}
export interface DrawerSelectField extends DrawerFieldBase {
  readonly type: 'select';
  readonly options: ReadonlyArray<{ value: string; label: string }>;
}
export interface DrawerCategoryField extends DrawerFieldBase {
  readonly type: 'category';
  readonly options: ReadonlyArray<{ value: string; label: string; emoji?: string; color?: string }>;
}
export interface DrawerFrequencyField extends DrawerFieldBase {
  readonly type: 'frequency';
  readonly options?: ReadonlyArray<{ value: string; label: string }>;
}

export type DrawerField =
  | DrawerTextField
  | DrawerMoneyField
  | DrawerDateField
  | DrawerSelectField
  | DrawerCategoryField
  | DrawerFrequencyField
  | DrawerNotesField;

export type DrawerValues = Readonly<Record<string, string | undefined>>;

export interface EditDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly fields: readonly DrawerField[];
  readonly initial?: DrawerValues;
  readonly onSave: (values: DrawerValues) => void;
  readonly onCancel: () => void;
  readonly onDelete?: (values: DrawerValues) => void;
  readonly deleteLabel?: string;
}
```

- [ ] **Step 8.1: Tests TDD (~18 cas)**

Critical cases:

- `open=false` → `aria-hidden="true"` + drawer not visible
- `open=true` → focus auto sur premier input (requestAnimationFrame)
- ESC → `onCancel` called
- Backdrop click → `onCancel` called
- Save click avec required vide → setErrors + `onSave` NOT called
- Save click avec valid → `onSave` called avec values complets
- Delete click 1ère fois → state confirmDel = true (pas onDelete)
- Delete click "Oui, supprimer" → `onDelete` called
- Field type=text → renders `<input type="text">`
- Field type=money → renders avec suffix "€" + filter regex 0-9,.-
- Field type=date → renders `<input type="date">`
- Field type=select → renders `<select>` avec placeholder option
- Field type=category → renders pill grid avec onClick set value
- Field type=frequency → renders 4 boutons segmented
- Field type=notes → renders `<textarea>`
- onChange un champ vide les errors associées
- Validation money → "Montant invalide" si NaN ou < 0
- Custom validate function → message custom retourné

- [ ] **Step 8.2: Implement Drawer.tsx** (port complet `_deps/drawer.jsx` en TS strict). 7 sub-renderers internes au fichier. ~280 lignes TS.

- [ ] **Step 8.3: CSS** — port complet `_deps/drawer.css` dans `atoms.css` (préfixe `.drw-*`)

- [ ] **Step 8.4: Tests PASS + commit**

```bash
git commit -m "feat(atoms): Drawer + 7 field primitives CD#3 (PR-D4-PHASE2-A)

Atom 04 — EditDrawer slide-in 480px desktop / full-screen mobile bottom→top
(iOS Settings pattern). Single source of truth pour Surfaces 1-4 (charges,
dépenses, catégories, comptes). 7 field primitives (text/money/date/select/
category/frequency/notes). Focus trap minimal + ESC + backdrop click.
'use client' (refs + useState).

Source: design_handoff_ankora_v1/atoms/_deps/drawer.jsx + drawer.css
Tests: 18+ cas (open/close, focus auto, validation, 7 field types, delete confirm)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 9 — Atom 07 ColorPicker

**Files:** `ColorPicker.tsx` + tests + `atoms.css` + `index.ts`

**Source:** `design_handoff_ankora_v1/atoms/07-ColorPicker.jsx`

**Signature:**

```ts
'use client';

export const ATM_COLOR_PALETTE: readonly string[] = [
  '#2dd4bf',
  '#10b981',
  '#60a5fa',
  '#3b82f6',
  '#a78bfa',
  '#c084fc',
  '#f87171',
  '#fb7185',
  '#facc15',
  '#fb923c',
  '#22d3ee',
  '#94a3b8',
];

export interface ColorPickerProps {
  readonly value: string;
  readonly options?: readonly string[];
  readonly onChange: (color: string) => void;
  readonly columns?: number;
}
```

- [ ] **Step 9.1: Tests (~8 cas)** : default palette 12 colors, role=radiogroup + radio per swatch, aria-checked sur active, custom options, custom columns, onChange callback, swatch labels "Couleur #XXX", focus visible.

- [ ] **Step 9.2: Implement** + CSS `.atm-cpick*`

- [ ] **Step 9.3: Commit `feat(atoms): ColorPicker CD#3 (PR-D4-PHASE2-A)`**

---

# Task 10 — Atom 08 IconPicker

**Files:**

- Create: `src/components/atoms/IconPicker.tsx`
- Create: `src/components/atoms/icons.ts` (registry Lucide curated Ankora)
- Create: `src/components/atoms/__tests__/IconPicker.test.tsx`
- Modify: `atoms.css` + `index.ts`

**Décision sécurité:**

- Le pattern handoff `08-IconPicker.jsx` injecte des SVG paths string via attribut HTML brut — pattern qu'on **n'adopte pas** (XSS risk si registry pollué + perte du tooling typé).
- Implémentation Ankora : `lucide-react` direct (déjà dans le repo, components React typés, tree-shakable).
- `icons.ts` exporte un curated set Ankora de ~25 icônes mappées aux catégories budget belges typiques.

**Signature:**

```ts
'use client';
import * as Lucide from 'lucide-react';

export type AnkoraIconName =
  | 'home'
  | 'wallet'
  | 'pie-chart'
  | 'trending-up'
  | 'shield-check'
  | 'utensils'
  | 'car'
  | 'zap'
  | 'wifi'
  | 'phone'
  | 'shopping-cart'
  | 'gift'
  | 'heart'
  | 'gamepad-2'
  | 'plane'
  | 'book-open'
  | 'graduation-cap'
  | 'briefcase'
  | 'piggy-bank'
  | 'banknote'
  | 'receipt'
  | 'calendar'
  | 'bell'
  | 'settings'
  | 'help-circle';

export interface AnkoraIconDef {
  readonly name: AnkoraIconName;
  readonly label: string;
  readonly Component: React.ComponentType<{ size?: number; className?: string }>;
}

export const ANKORA_ICON_LIB: readonly AnkoraIconDef[] = [
  { name: 'home', label: 'Logement', Component: Lucide.Home },
  { name: 'wallet', label: 'Portefeuille', Component: Lucide.Wallet },
  { name: 'pie-chart', label: 'Provisions', Component: Lucide.PieChart },
  { name: 'trending-up', label: 'Épargne', Component: Lucide.TrendingUp },
  { name: 'shield-check', label: 'Sécurité', Component: Lucide.ShieldCheck },
  { name: 'utensils', label: 'Courses', Component: Lucide.Utensils },
  { name: 'car', label: 'Voiture', Component: Lucide.Car },
  { name: 'zap', label: 'Énergie', Component: Lucide.Zap },
  { name: 'wifi', label: 'Internet', Component: Lucide.Wifi },
  { name: 'phone', label: 'Téléphone', Component: Lucide.Phone },
  { name: 'shopping-cart', label: 'Achats', Component: Lucide.ShoppingCart },
  { name: 'gift', label: 'Cadeaux', Component: Lucide.Gift },
  { name: 'heart', label: 'Santé', Component: Lucide.Heart },
  { name: 'gamepad-2', label: 'Loisirs', Component: Lucide.Gamepad2 },
  { name: 'plane', label: 'Voyages', Component: Lucide.Plane },
  { name: 'book-open', label: 'Lecture', Component: Lucide.BookOpen },
  { name: 'graduation-cap', label: 'Études', Component: Lucide.GraduationCap },
  { name: 'briefcase', label: 'Travail', Component: Lucide.Briefcase },
  { name: 'piggy-bank', label: 'Tirelire', Component: Lucide.PiggyBank },
  { name: 'banknote', label: 'Espèces', Component: Lucide.Banknote },
  { name: 'receipt', label: 'Factures', Component: Lucide.Receipt },
  { name: 'calendar', label: 'Calendrier', Component: Lucide.Calendar },
  { name: 'bell', label: 'Notifications', Component: Lucide.Bell },
  { name: 'settings', label: 'Paramètres', Component: Lucide.Settings },
  { name: 'help-circle', label: 'Aide', Component: Lucide.HelpCircle },
];

export interface IconPickerProps {
  readonly value: AnkoraIconName | undefined;
  readonly options?: readonly AnkoraIconDef[];
  readonly onChange: (name: AnkoraIconName) => void;
  readonly columns?: number;
  readonly maxHeight?: number;
}
```

- [ ] **Step 10.1: Tests (~8 cas)** : default lib (25 icons), role radiogroup, aria-checked, click → onChange, custom options, columns, maxHeight scrollable, label tooltip.

- [ ] **Step 10.2: Implement IconPicker.tsx** + `icons.ts` registry

- [ ] **Step 10.3: CSS `.atm-ipick*`**

- [ ] **Step 10.4: Commit `feat(atoms): IconPicker CD#3 + Ankora icon registry (PR-D4-PHASE2-A)`**

---

# Task 11 — Atom 09 Tabs (extrait pattern admin/onboarding)

**Files:** `Tabs.tsx` + tests + `atoms.css` + `index.ts`

**Sources de référence (3 implémentations inline dans le bundle):**

- `design_handoff_ankora_v1/surfaces/admin/AdminPanelV1.jsx:21-28` (admin section tabs `role="tablist"`, variant pill)
- `design_handoff_ankora_v1/surfaces/admin/AdminTopbar.jsx:31-33` (period selector compact, variant pill sm)
- `design_handoff_ankora_v1/surfaces/onboarding/step2.jsx:11-21` (Voies A/B/C onboarding, variant underline)

**Spec ADDENDUM F:** props `tabs: { id, label, badge? }[]`, `activeId`, `onChange`, `variant: 'pill'|'underline'`, `size: 'sm'|'md'`. Tokens `--color-brand-500`, `--color-brand-surface`, `--color-border`, `--color-foreground`, `--radius-full`, `--ease-spring`.

- [ ] **Step 11.1: Lire les 3 implémentations existantes**

```bash
grep -n -A 8 'role="tablist"' design_handoff_ankora_v1/surfaces/admin/AdminPanelV1.jsx
grep -n -A 8 'role="tablist"' design_handoff_ankora_v1/surfaces/admin/AdminTopbar.jsx
grep -n -A 12 'role="tablist"' design_handoff_ankora_v1/surfaces/onboarding/step2.jsx
```

Extraire le pattern commun (button avec `role="tab"`, `aria-selected`).

**Signature:**

```ts
'use client';
import * as React from 'react';

export type TabsVariant = 'pill' | 'underline';
export type TabsSize = 'sm' | 'md';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly badge?: string | number;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly activeId: string;
  readonly onChange: (id: string) => void;
  readonly variant?: TabsVariant;
  readonly size?: TabsSize;
  readonly ariaLabel?: string;
}
```

- [ ] **Step 11.2: Tests (~10 cas)**
  - role="tablist" + tab per item
  - aria-selected sur tab actif (true/false sur tous les autres)
  - clavier : ArrowLeft/Right cyclic, Home → first, End → last
  - click → `onChange` called avec id
  - badge rendu si fourni (non rendu si undefined)
  - variants pill vs underline appliquent classes différentes
  - sizes sm vs md
  - tab disabled non navigable au clavier ni clic
  - focus visible sur tab actif
  - ariaLabel sur tablist

- [ ] **Step 11.3: Implement avec keyboard navigation**

```tsx
'use client';
import * as React from 'react';

// types ci-dessus

export function Tabs({
  tabs,
  activeId,
  onChange,
  variant = 'pill',
  size = 'md',
  ariaLabel,
}: TabsProps): React.JSX.Element {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIdx = tabs.findIndex((t) => t.id === activeId);
    if (currentIdx < 0) return;
    let nextIdx = currentIdx;
    switch (e.key) {
      case 'ArrowLeft':
        nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
        nextIdx = (currentIdx + 1) % tabs.length;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = tabs.length - 1;
        break;
      default:
        return;
    }
    while (tabs[nextIdx]?.disabled && nextIdx !== currentIdx) {
      nextIdx = (nextIdx + 1) % tabs.length;
    }
    e.preventDefault();
    const next = tabs[nextIdx];
    if (next && !next.disabled) onChange(next.id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`atm-tabs atm-tabs--${variant} atm-tabs--${size}`}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => {
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={t.disabled || undefined}
            tabIndex={isActive ? 0 : -1}
            disabled={t.disabled}
            className={`atm-tabs-tab${isActive ? 'is-active' : ''}`}
            onClick={() => !t.disabled && onChange(t.id)}
          >
            <span className="atm-tabs-label">{t.label}</span>
            {t.badge !== undefined && <span className="atm-tabs-badge">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 11.4: CSS `.atm-tabs*`**

```css
.atm-tabs {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.atm-tabs--pill {
  background: var(--color-surface-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 4px;
}
.atm-tabs--underline {
  border-bottom: 1px solid var(--color-border);
  gap: 0;
}
.atm-tabs-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--color-muted-foreground);
  font-family: var(--font-sans);
  font-weight: 500;
  transition: all var(--dur-default) var(--ease-spring);
  white-space: nowrap;
}
.atm-tabs--sm .atm-tabs-tab {
  padding: 4px 10px;
  font-size: 12px;
}
.atm-tabs--md .atm-tabs-tab {
  padding: 6px 14px;
  font-size: 13px;
}
.atm-tabs--pill .atm-tabs-tab {
  border-radius: var(--radius-full);
}
.atm-tabs--underline .atm-tabs-tab {
  border-bottom: 2px solid transparent;
  border-radius: 0;
  margin-bottom: -1px;
}
.atm-tabs-tab.is-active {
  color: var(--color-foreground);
}
.atm-tabs--pill .atm-tabs-tab.is-active {
  background: var(--color-card);
  box-shadow: var(--shadow-xs);
}
.atm-tabs--underline .atm-tabs-tab.is-active {
  border-bottom-color: var(--color-brand-500);
}
.atm-tabs-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.atm-tabs-tab:focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 2px;
}
.atm-tabs-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-muted);
  color: var(--color-muted-foreground);
}
.atm-tabs-tab.is-active .atm-tabs-badge {
  background: var(--color-brand-surface);
  color: var(--color-brand-text);
}
```

- [ ] **Step 11.5: Commit**

```bash
git commit -m "feat(atoms): Tabs CD#3 (PR-D4-PHASE2-A)

Atom 09 — extrait du pattern utilisé dans 3 surfaces du handoff (AdminPanelV1,
AdminTopbar, onboarding step2). Props ADDENDUM F: tabs/activeId/onChange ×
variant pill|underline × size sm|md. Keyboard nav (ArrowLeft/Right/Home/End).
Badge optionnel. Consommé par CompteEpargne en PR-C (onglet Mouvements ADR-018).

Sources patterns:
- surfaces/admin/AdminPanelV1.jsx:21
- surfaces/admin/AdminTopbar.jsx:31
- surfaces/onboarding/step2.jsx:17

Tests: 10 cas (role tablist, aria-selected, keyboard nav, click, variants, badge)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 12 — Atom 10 ThemeToggle

**Files:** `ThemeToggle.tsx` + tests + `atoms.css` + `index.ts`

**Source:** `design_handoff_ankora_v1/atoms/10-ThemeToggle.jsx`

**Décision SSR:** `"use client"`. Lecture initiale du theme via prop `initialTheme` (sera passée par AppShell en PR-B après lecture du cookie SSR). Pour PR-A, default `light` si non fourni.

**Signature:**

```ts
'use client';
import * as React from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeToggleProps {
  readonly initialTheme?: Theme;
  readonly cookieKey?: string;
  readonly onChange?: (theme: Theme) => void;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}
```

- [ ] **Step 12.1: Tests (~10 cas)**
  - Initial theme rendered correctly (light icon = sun, dark icon = moon)
  - Click → toggle theme
  - aria-pressed reflète l'état (false=light, true=dark)
  - aria-label dynamique ("Activer le thème sombre" / "Activer le thème clair")
  - Cookie set on toggle (`document.cookie` write contient `theme=...`)
  - `[data-theme]` attr on `<html>` updated
  - onChange callback called avec nouveau theme
  - SSR-safe (no localStorage at render time, no document access avant useEffect)
  - Custom cookieKey respecté
  - sizes sm vs md → 28×28 vs 36×36

- [ ] **Step 12.2: Implement (cookie-first)**

```tsx
'use client';
import * as React from 'react';

export type Theme = 'light' | 'dark';
export interface ThemeToggleProps {
  readonly initialTheme?: Theme;
  readonly cookieKey?: string;
  readonly onChange?: (theme: Theme) => void;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}

export function ThemeToggle({
  initialTheme = 'light',
  cookieKey = 'theme',
  onChange,
  className,
  size = 'md',
}: ThemeToggleProps): React.JSX.Element {
  const [theme, setTheme] = React.useState<Theme>(initialTheme);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
    document.cookie = `${cookieKey}=${theme}; max-age=31536000; path=/; SameSite=Lax`;
  }, [theme, cookieKey]);

  const isDark = theme === 'dark';
  const toggle = React.useCallback(() => {
    const next: Theme = isDark ? 'light' : 'dark';
    setTheme(next);
    onChange?.(next);
  }, [isDark, onChange]);

  const classes = ['atm-theme-toggle', `atm-theme-toggle--${size}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Activer le thème clair' : 'Activer le thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
    >
      {isDark ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M4.93 19.07l1.41-1.41" />
          <path d="M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 12.3: CSS `.atm-theme-toggle*` (rotation 180° via @keyframes au toggle)**

```css
.atm-theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-soft);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    background var(--dur-default) var(--ease-spring),
    transform var(--dur-structural) var(--ease-spring);
}
.atm-theme-toggle--sm {
  width: 28px;
  height: 28px;
}
.atm-theme-toggle--md {
  width: 36px;
  height: 36px;
}
.atm-theme-toggle:hover {
  background: var(--color-surface-muted);
}
.atm-theme-toggle:focus-visible {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 2px;
}
.atm-theme-toggle[aria-pressed='true'] svg {
  transform: rotate(0deg);
}
.atm-theme-toggle[aria-pressed='false'] svg {
  transform: rotate(0deg);
}
.atm-theme-toggle svg {
  transition: transform var(--dur-structural) var(--ease-spring);
}
```

- [ ] **Step 12.4: Commit `feat(atoms): ThemeToggle CD#3 cookie-first SSR-safe (PR-D4-PHASE2-A)`**

---

# Task 13 — Atom 11 LangSwitcher

**Files:** `LangSwitcher.tsx` + tests + `atoms.css` + `index.ts`

**Source:** `design_handoff_ankora_v1/atoms/11-LangSwitcher.jsx`

**Décision Next.js:** dropdown listbox a11y. `onChange` callback consumer-side (en PR-B sera wired sur next-intl router). Pour PR-A : composant headless.

**Signature:**

```ts
'use client';
import * as React from 'react';

export interface LangSwitcherLocale {
  readonly id: string;
  readonly code: string;
  readonly flag: string;
  readonly label: string;
}

export interface LangSwitcherProps {
  readonly current: string;
  readonly locales?: readonly LangSwitcherLocale[];
  readonly onChange: (localeId: string) => void;
  readonly className?: string;
}

export const ANKORA_V1_LOCALES: readonly LangSwitcherLocale[] = [
  { id: 'fr-BE', code: 'FR', flag: '🇧🇪', label: 'Français (Belgique)' },
  { id: 'en', code: 'EN', flag: '🇬🇧', label: 'English' },
];
```

- [ ] **Step 13.1: Tests (~12 cas)**
  - Closed by default
  - Click trigger → opens listbox (role="listbox")
  - aria-haspopup="listbox" + aria-expanded
  - Each locale has role="option" + aria-selected on current
  - Click option → onChange called + close
  - ESC key → close + return focus to trigger
  - mousedown outside → close
  - Default locales = ANKORA_V1_LOCALES (FR-BE + EN)
  - Custom locales prop respected
  - Trigger displays current flag + code
  - Cleanup listeners on unmount
  - keyboard nav within listbox (Arrow up/down)

- [ ] **Step 13.2: Implement** (port `11-LangSwitcher.jsx` en TS strict, ajouter cleanup useEffect explicite)

- [ ] **Step 13.3: CSS `.atm-lang-switcher*` (dropdown menu, scale-up on open)**

- [ ] **Step 13.4: Commit `feat(atoms): LangSwitcher CD#3 a11y dropdown (PR-D4-PHASE2-A)`**

---

# Task 14 — Route playground `/[locale]/_design-playground/`

**Files:**

- Create: `src/app/[locale]/_design-playground/page.tsx`
- Create: `src/app/[locale]/_design-playground/playground.css`
- Create: `src/app/[locale]/_design-playground/DrawerDemoClient.tsx`
- Create: `src/app/[locale]/_design-playground/TabsDemoClient.tsx`
- Create: `src/app/[locale]/_design-playground/ColorPickerDemoClient.tsx`
- Create: `src/app/[locale]/_design-playground/IconPickerDemoClient.tsx`
- Create: `src/app/[locale]/_design-playground/LangSwitcherDemoClient.tsx`

**Pattern Server Component avec garde server-only:**

```tsx
// src/app/[locale]/_design-playground/page.tsx
import { notFound } from 'next/navigation';
import * as React from 'react';
import { Avatar, Button, Card, Chip, ProgressBar, ThemeToggle } from '@/components/atoms';
import { DrawerDemoClient } from './DrawerDemoClient';
import { TabsDemoClient } from './TabsDemoClient';
import { ColorPickerDemoClient } from './ColorPickerDemoClient';
import { IconPickerDemoClient } from './IconPickerDemoClient';
import { LangSwitcherDemoClient } from './LangSwitcherDemoClient';

import './playground.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function DesignPlaygroundPage(): React.JSX.Element {
  if (process.env.ANKORA_DEV_MODE !== '1') {
    notFound();
  }

  return (
    <main className="dpg-root">
      <header className="dpg-head">
        <h1>Ankora Design Playground</h1>
        <p className="t-secondary">
          11 atoms CD#3 — visible only when <code>ANKORA_DEV_MODE=1</code> (server-only env, never
          deployed).
        </p>
      </header>

      <section className="dpg-section">
        <h2>01 — Button</h2>
        <div className="dpg-row">
          <Button>Primary md</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="dpg-section">
        <h2>02 — Chip</h2>
        <div className="dpg-row">
          <Chip label="Brand" color="#14b8a6" />
          <Chip label="Accent" color="#d4a017" />
          <Chip label="Danger" color="#dc2626" />
          <Chip label="Avec emoji" emoji="🍕" color="#f87171" />
          <Chip label="Removable" color="#60a5fa" removable onRemove={() => {}} />
        </div>
      </section>

      <section className="dpg-section">
        <h2>03 — Card</h2>
        <div className="dpg-grid">
          <Card title="Default" padding="md">
            Body content
          </Card>
          <Card title="Brand tone" tone="brand" padding="md">
            Body
          </Card>
          <Card title="Warning tone" tone="warning" padding="md">
            Body
          </Card>
          <Card title="Raised elevation" elevation="raised" padding="md">
            Body
          </Card>
        </div>
      </section>

      <section className="dpg-section">
        <h2>05 — ProgressBar</h2>
        <div className="dpg-stack">
          <ProgressBar value={0.3} max={1} label="Provisions" showValue />
          <ProgressBar value={0.86} max={1} label="Auto-warning" showValue />
          <ProgressBar value={1.2} max={1} label="Overflow" showValue />
          <ProgressBar
            value={0.9}
            max={1}
            label="Split"
            split={{ affected: 0.6, free: 0.3, affectedTone: 'brand', freeTone: 'accent' }}
          />
        </div>
      </section>

      <section className="dpg-section">
        <h2>06 — Avatar</h2>
        <div className="dpg-row">
          <Avatar emoji="🏠" color="#14b8a6" size="xs" />
          <Avatar emoji="🚗" color="#d4a017" size="sm" />
          <Avatar initials="TV" color="#60a5fa" size="md" />
          <Avatar initials="TV" color="#a78bfa" size="lg" shape="circle" />
          <Avatar initials="TV" color="#fb7185" size="xl" />
        </div>
      </section>

      <section className="dpg-section">
        <h2>04 — Drawer (interactive)</h2>
        <DrawerDemoClient />
      </section>

      <section className="dpg-section">
        <h2>07 — ColorPicker (interactive)</h2>
        <ColorPickerDemoClient />
      </section>

      <section className="dpg-section">
        <h2>08 — IconPicker (interactive)</h2>
        <IconPickerDemoClient />
      </section>

      <section className="dpg-section">
        <h2>09 — Tabs (interactive)</h2>
        <TabsDemoClient />
      </section>

      <section className="dpg-section">
        <h2>10 — ThemeToggle</h2>
        <ThemeToggle />
      </section>

      <section className="dpg-section">
        <h2>11 — LangSwitcher (interactive)</h2>
        <LangSwitcherDemoClient />
      </section>
    </main>
  );
}
```

**5 mini-démos client interactives** : chacune importe son atom + utilise `useState` pour un state demo simple.

```tsx
// Exemple ColorPickerDemoClient.tsx
'use client';
import * as React from 'react';
import { ColorPicker } from '@/components/atoms';

export function ColorPickerDemoClient(): React.JSX.Element {
  const [color, setColor] = React.useState('#14b8a6');
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        Selected: <code>{color}</code>
      </div>
      <ColorPicker value={color} onChange={setColor} />
    </div>
  );
}
```

CSS playground :

```css
/* src/app/[locale]/_design-playground/playground.css */
.dpg-root {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}
.dpg-head {
  margin-bottom: 32px;
}
.dpg-head h1 {
  font: var(--text-h1);
  margin: 0 0 8px;
}
.dpg-section {
  margin-bottom: 40px;
  padding: 24px;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
.dpg-section h2 {
  font: var(--text-h2);
  margin: 0 0 16px;
}
.dpg-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.dpg-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dpg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
```

- [ ] **Step 14.1: Implementer Page Server Component avec garde**

- [ ] **Step 14.2: Créer 5 mini-démos client interactifs**

- [ ] **Step 14.3: Manuel local : `ANKORA_DEV_MODE=1 npm run dev` → ouvrir `http://localhost:3000/fr-BE/_design-playground/` → vérifier visuellement les 11 atoms**

- [ ] **Step 14.4: Vérifier prod-safe : `npm run build` (sans `ANKORA_DEV_MODE`) puis `npm run start` → la route doit répondre 404**

- [ ] **Step 14.5: Commit**

```bash
git commit -m "feat(playground): /[locale]/_design-playground/ admin-only route (PR-D4-PHASE2-A)

Route Server Component gardée par process.env.ANKORA_DEV_MODE === '1'
(env server-only, PAS NEXT_PUBLIC_ → pas de leak bundle client).
Showcase des 11 atoms CD#3 + 5 démos client interactives (Drawer, Tabs,
ColorPicker, IconPicker, LangSwitcher).

En prod (ANKORA_DEV_MODE absent ou !== '1') → 404 via notFound().
En local : ANKORA_DEV_MODE=1 npm run dev pour activer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 15 — Smoke E2E Playwright

**Files:** `e2e/design-playground.spec.ts`

**Décision:** smoke minimal — unit Vitest couvre les atoms. E2E vérifie : route 404 sans flag, route 200 avec flag (skip si flag absent), atoms rendus dans le DOM.

```ts
import { test, expect } from '@playwright/test';

test.describe('Design Playground (PR-D4-PHASE2-A)', () => {
  test('returns 404 in production-like mode without ANKORA_DEV_MODE', async ({ page }) => {
    if (process.env.ANKORA_DEV_MODE === '1') {
      test.skip();
    }
    const response = await page.goto('/fr-BE/_design-playground/');
    expect(response?.status()).toBe(404);
  });

  test('renders atoms when ANKORA_DEV_MODE=1', async ({ page }) => {
    if (process.env.ANKORA_DEV_MODE !== '1') {
      test.skip();
    }
    await page.goto('/fr-BE/_design-playground/');
    await expect(page.getByRole('heading', { name: 'Ankora Design Playground' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Primary md' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '01 — Button' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '11 — LangSwitcher (interactive)' }),
    ).toBeVisible();
  });
});
```

- [ ] **Step 15.1: Implement spec**

- [ ] **Step 15.2: Run `npm run e2e -- design-playground.spec.ts`**

- [ ] **Step 15.3: Commit**

```bash
git commit -m "test(e2e): smoke design-playground (PR-D4-PHASE2-A)

E2E Playwright minimaliste pour route /[locale]/_design-playground/.
Test 1: returns 404 sans ANKORA_DEV_MODE (CI mode, prod-like)
Test 2: renders atoms si ANKORA_DEV_MODE=1 (local dev)

Coverage atoms = unit Vitest. Ce smoke garantit juste l'intégration route + garde.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

# Task 16 — Quality gates locaux finaux

- [ ] **Step 16.1: Linter + types + tests + build**

```bash
npm run lint && npm run lint:use-server && npm run typecheck && npm run test:coverage && npm run build
```

Expected: 0 erreur, coverage atoms ≥90%, build succès.

- [ ] **Step 16.2: Vérifier `npm run e2e` (sans ANKORA_DEV_MODE) → smoke 404 PASS**

- [ ] **Step 16.3: Lighthouse mobile (régression check)**

```bash
npm run lhci
```

Expected: pas de régression vs baseline.

---

# Task 17 — Agents QA finale

- [ ] **Step 17.1: ui-auditor** — atoms a11y WCAG 2.2 AA (focus rings, contrast, keyboard, semantic HTML)

- [ ] **Step 17.2: mobile-ios-auditor** — atoms responsive 375×812 iPhone SE (Drawer full-screen mobile, Tabs scroll horizontal si overflow)

- [ ] **Step 17.3: i18n-auditor** — vérifier que le playground n'a pas de string hardcodée non-i18n (dev-only mais hygiène)

- [ ] **Step 17.4: test-runner** — Vitest + Playwright dernière passe + parse failures

- [ ] **Step 17.5: security-auditor** — focus sur la garde `ANKORA_DEV_MODE` (pas de `NEXT_PUBLIC_*` leak), `notFound()` correct, aucun secret dans le playground

Pour chaque agent : capturer findings, fix P0/P1 dans des commits séparés (`fix(atoms): ui-auditor P1 contrast Card warning tone`), marquer DONE quand 0 P0/P1 résiduel.

---

# Task 18 — DoD 5 critères + rapport final

- [ ] **Step 18.1: Vérifier CI verts**

```bash
gh pr checks <NUMBER>
```

Expected: tous PASS.

- [ ] **Step 18.2: Vérifier Sourcery silencieux sur DERNIER commit**

```bash
gh api repos/thierryvm/ankora/pulls/<NUMBER>/comments --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
```

Expected: empty output. Si non vide, fix les findings, push, re-vérifier.

- [ ] **Step 18.3: Vérifier reviews humaines approuvées**

```bash
gh pr view <NUMBER> --json reviews --jq '.reviews[]'
```

Expected: au moins 1 approval, 0 changes-requested non résolu.

- [ ] **Step 18.4: Vérifier pas de conflit avec main**

```bash
gh pr view <NUMBER> --json mergeStateStatus
```

Expected: `"CLEAN"`.

- [ ] **Step 18.5: Capturer un screenshot du playground en dev mode (preuve visuelle archive)**

```bash
# En local, ANKORA_DEV_MODE=1 npm run dev
# Puis manuellement (ou Playwright headed) → screenshot /fr-BE/_design-playground/
# Sauvegarder dans : design-snapshots/2026-05-XX-PR-D4-PHASE2-A-playground.png
# (pattern aligné design-snapshots/README.md)
```

Embed le screenshot dans le rapport final (Step 18.6) via markdown `![Screenshot playground](../../design-snapshots/2026-05-XX-PR-D4-PHASE2-A-playground.png)`.

- [ ] **Step 18.6: Rédiger `docs/prs/PR-D4-PHASE2-A-report.md`**

Template:

```markdown
# PR-D4-PHASE2-A — Atoms 1-11 + Hamilton + Playground (Rapport final)

**Date** : 2026-05-XX
**Branche** : feat/cc-design-cd3-cockpit-v2-atoms
**PR GitHub** : #XXX
**Statut** : ✅ MERGED / 🟡 READY / 🔴 BLOCKED

## Résumé exécutif

PR-D4 PHASE 2 décomposée par @cowork en 4 sous-PRs (A/B/C/D). Cette PR (A) livre :

- 11 atoms CD#3 (~1 800 lignes TS)
- Helper Hamilton (1 fonction pure + 10 tests)
- Route playground admin-only (server guard ANKORA_DEV_MODE)
- Cohabitation avec ui/button.tsx legacy (cleanup en PR-C/PR-D5)

## Métriques

| Critère               | Cible            | Réalisé |
| --------------------- | ---------------- | ------- |
| Coverage Vitest atoms | ≥ 90 % lignes    | XX %    |
| Coverage Vitest atoms | ≥ 85 % branches  | XX %    |
| Tests Vitest atoms    | ~110 cas         | XX cas  |
| Tests E2E Playwright  | smoke playground | 2 specs |
| Lighthouse mobile     | ≥ 95             | XX      |
| Lighthouse a11y       | 100              | XX      |
| Files changed         | ~25              | XX      |
| Lines added           | ~3 000           | XX      |
| Sourcery findings     | 0 P0/P1          | XX      |

## DoD 5 critères

1. ✅ CI verts
2. ✅ Sourcery silencieux sur DERNIER commit (vérifié `gh api ...`) : 0 commentaire
3. ✅ Reviews humaines : 1 approval @thierry
4. ✅ Pas de conflit avec main : `mergeStateStatus = CLEAN`
5. ✅ Rapport final livré : ce document

## Agents QA exécutés

- ui-auditor : 0 P0/P1
- mobile-ios-auditor : 0 P0/P1
- i18n-auditor : N/A phase A (i18n complet en PR-D)
- test-runner : tous tests PASS
- security-auditor : 0 P0/P1, ANKORA_DEV_MODE garde validée

## Décisions architecturales prises

- **Cohabitation Button** : `src/components/ui/button.tsx` (shadcn legacy, 23 imports) reste. `src/components/atoms/Button.tsx` = nouveau Ankora CD#3. Migration progressive PR-C/PR-D5.
- **Tabs from-pattern** : ADDENDUM F mentionne Tabs sans atom dédié dans le bundle. Implémentation extraite des 3 surfaces du bundle (admin × 2 + onboarding step2). Test Playwright en PR-C valide visuellement.
- **ANKORA_DEV_MODE server-only** : pas de `NEXT_PUBLIC_*` (préviendrait leak valeur en bundle client). Route 404 en prod, 200 en dev avec flag.
- **Stepper différé** : extraction `surfaces/onboarding/stepper.jsx` reportée en PR-D5 (avec Onboarding 3 étapes intégré).
- **lucide-react direct pour IconPicker** : on n'adopte pas le pattern raw HTML attribute du handoff (XSS risk + perte tooling). Registry curated 25 icônes Ankora.

## Hors scope (suite à venir)

- PR-D4-PHASE2-B : AppShell user/admin + RBAC + requireAdmin() + ThemeToggle/LangSwitcher branchés cookie SSR + nav conditionnelle admin
- PR-D4-PHASE2-C : Surface 1 Cockpit (HeroWaterfall + 6 composants) + refonte CapaciteEpargneCard/EffortFinancierCard + tests Vitest cockpit + e2e cockpit
- PR-D4-PHASE2-D : i18n complet (95 clés × 5 locales) + SectionCard loadingState + audit final 6 agents QA + Lighthouse

## Liens

- Branche : `feat/cc-design-cd3-cockpit-v2-atoms`
- Plan d'exécution : `docs/plans/PR-D4-PHASE2-A.md`
- Brief canonique : `prompts/PR-D4-PHASE2-cd3-integration.md`

@cowork — DoD validé
@cc-ankora — exécutant terminé
@thierry — merge ready
```

- [ ] **Step 18.7: Marker draft → ready-for-review**

```bash
gh pr ready <NUMBER>
```

- [ ] **Step 18.8: Annoncer @cowork pour merge final**

> @cowork — PR-D4-PHASE2-A ready-for-review. DoD 5 critères validés. Rapport final dans docs/prs/PR-D4-PHASE2-A-report.md. Merge attend ton approval + @thierry merge.

---

## Self-review (post-rédaction)

**Spec coverage check** :

| Spec section                         | Couverte par task                                                           |
| ------------------------------------ | --------------------------------------------------------------------------- |
| 11 atoms TS strict                   | Tasks 3-13 (11 atoms × 1 task)                                              |
| Hamilton helper                      | Task 2                                                                      |
| Tests Vitest ≥90%                    | Tasks 3-13 (chacun) + Task 16 (coverage check)                              |
| Route playground admin-only          | Task 14                                                                     |
| Smoke E2E                            | Task 15                                                                     |
| ANKORA_DEV_MODE server-only          | Task 1 (env), Task 14 (guard), Task 15 (404 test), Task 17 (security audit) |
| Cohabitation ui/button.tsx           | Task 3 (commit message explicite) + décisions §                             |
| Tabs from-pattern (extrait surfaces) | Task 11 (3 sources documentées + signature complète)                        |
| Stepper différé                      | Décisions § (out of scope)                                                  |
| 6 agents QA                          | Task 17 (5 pertinents pour PR-A)                                            |
| DoD 5 critères                       | Task 18 (1 step par critère)                                                |
| Mid-PR draft + signal @cowork        | Task 5 (Step 5.8 + 5.9)                                                     |
| Trio agents convention               | Tous les commits + rapport final                                            |
| 1 atom = 1 commit                    | Tasks 3-13 (chacun ses commits)                                             |
| Anti-pattern transform: scaleY       | Documenté en Conventions §, jamais utilisé en CSS atoms                     |
| 'use server' async-only              | Aucun atom n'utilise 'use server'                                           |
| Decimal.js pour montants             | N/A pour atoms (Decimal.js consommé en PR-C cockpit)                        |

**Placeholders scan** : 0 placeholder restant. Toutes les signatures TS, tests critiques, commit messages, commandes shell sont écrits.

**Type consistency** : signatures cohérentes (préfixe `Atm*Props`, `readonly` partout, types unions discriminés). Hamilton `(values: readonly number[], total: number) => number[]` cohérente.

**Caveats acceptés** :

- Tasks 6-13 ont des "Step ~10 cas" résumés au lieu d'écrire 100% des tests inline (le plan ferait 5000+ lignes). L'exécutant lit la source `.jsx` du handoff + adapte le pattern Button/Chip/Card des tasks 3-5 (full code écrit). C'est un compromis raisonnable car les patterns sont uniformes.
- Task 8 (Drawer) volontairement haut-niveau : ~310 lignes JSX → portée fidèlement avec types stricts. Le plan donne la signature TypeScript complète + liste de cas tests obligatoires.
- Tasks 9, 10, 11, 12, 13 même approche : signatures complètes + liste tests, code détaillé via lecture source.

---

## Execution Handoff

Plan complet et sauvegardé dans `docs/plans/PR-D4-PHASE2-A.md`. Deux options :

**1. Subagent-Driven (recommandée)** — un fresh subagent par task, review entre chaque, fast iteration. Idéal pour PR-A (18 tâches indépendantes ou faiblement couplées).

**2. Inline Execution** — exécution dans la session courante, batch avec checkpoints. Idéal si peu d'overhead souhaité.

**Quelle approche ?**
