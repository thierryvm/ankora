import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tokens guard test — PR-3a Design System socle (cc-design integration v1).
 *
 * Verifies that `src/app/globals.css` exposes the canonical token surface
 * required by the Ankora Design System (cf. ADR-005 + SKILL `ankora-design-system`).
 *
 * This is a regression guard: if a future refactor accidentally drops a token
 * (e.g. removes `--color-accent-400` or renames `--color-warning`), this test
 * will fail before merge.
 *
 * Strategy: read the CSS file as text and assert presence of each critical
 * token. Lighter than getComputedStyle() in jsdom (which has flaky support
 * for Tailwind v4 `@theme {}` blocks) and faster than a snapshot test
 * (which would break on every cosmetic reformatting by Prettier).
 */
const cssPath = resolve(__dirname, '..', 'globals.css');
const css = readFileSync(cssPath, 'utf8');

describe('globals.css — Design System tokens (PR-3a, cc-design v1)', () => {
  describe('Brand palette (Teal — user accent)', () => {
    const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
    it.each(shades)('exposes --color-brand-%s', (shade) => {
      expect(css).toMatch(new RegExp(`--color-brand-${shade}:\\s*#[0-9a-fA-F]{3,8}`));
    });
  });

  describe('Accent palette (Laiton nautique — admin accent, locked 2026-04-24)', () => {
    const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    it.each(shades)('exposes --color-accent-%s', (shade) => {
      expect(css).toMatch(new RegExp(`--color-accent-${shade}:\\s*#[0-9a-fA-F]{3,8}`));
    });

    it('locks --color-accent-400 to fresh brass #d4a017 (dark-mode anchor)', () => {
      expect(css).toMatch(/--color-accent-400:\s*#d4a017/);
    });

    it('locks --color-accent-600 to aged brass #8b6914 (light-mode anchor, AA on white)', () => {
      expect(css).toMatch(/--color-accent-600:\s*#8b6914/);
    });
  });

  describe('Semantic status colors', () => {
    it('keeps --color-warning as amber #d97706 (separate from laiton accent — @cowork decision 2026-04-25)', () => {
      // Universal UX signal: warning = amber. Aligning with laiton would create
      // semantic confusion (warning vs admin pigment). Decision documented in ADR-005.
      expect(css).toMatch(/--color-warning:\s*#d97706/);
    });

    it('exposes --color-success, --color-danger, --color-info', () => {
      expect(css).toMatch(/--color-success:\s*#059669/);
      expect(css).toMatch(/--color-danger:\s*#dc2626/);
      expect(css).toMatch(/--color-info:\s*#0284c7/);
    });
  });

  describe('Typography families', () => {
    it('exposes --font-sans with Inter as primary + system fallback', () => {
      expect(css).toMatch(/--font-sans:[^;]*'Inter'/);
      expect(css).toMatch(/--font-sans:[^;]*system-ui/);
    });

    it('exposes --font-display with Fraunces + serif fallback', () => {
      expect(css).toMatch(/--font-display:[^;]*'Fraunces'/);
      expect(css).toMatch(/--font-display:[^;]*serif/);
    });

    it('exposes --font-mono with JetBrains Mono + monospace fallback', () => {
      expect(css).toMatch(/--font-mono:[^;]*'JetBrains Mono'/);
      expect(css).toMatch(/--font-mono:[^;]*monospace/);
    });
  });

  describe('Type scale (semantic tokens)', () => {
    const scales = [
      'text-display-1',
      'text-display-2',
      'text-h1',
      'text-h2',
      'text-h3',
      'text-h4',
      'text-body',
      'text-body-lg',
      'text-small',
      'text-micro',
      'text-num-xl',
      'text-num-lg',
      'text-num-md',
    ];
    it.each(scales)('exposes --%s', (scale) => {
      expect(css).toMatch(new RegExp(`--${scale}:`));
    });
  });

  describe('Radius scale', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'full'];
    it.each(sizes)('exposes --radius-%s', (size) => {
      expect(css).toMatch(new RegExp(`--radius-${size}:`));
    });
  });

  describe('Elevation (shadow tokens)', () => {
    const levels = ['xs', 'sm', 'md', 'lg'];
    it.each(levels)('exposes --shadow-%s in @theme', (level) => {
      expect(css).toMatch(new RegExp(`--shadow-${level}:`));
    });
  });

  describe('Motion tokens', () => {
    it('exposes durations (--dur-micro, --dur-default, --dur-structural)', () => {
      expect(css).toMatch(/--dur-micro:\s*120ms/);
      expect(css).toMatch(/--dur-default:\s*200ms/);
      expect(css).toMatch(/--dur-structural:\s*320ms/);
    });

    it('exposes easings (--ease-spring, --ease-out)', () => {
      expect(css).toMatch(/--ease-spring:\s*cubic-bezier/);
      expect(css).toMatch(/--ease-out:\s*cubic-bezier/);
    });
  });

  describe('Tracking helpers', () => {
    it('exposes --tracking-tight and --tracking-micro', () => {
      expect(css).toMatch(/--tracking-tight:\s*-0\.02em/);
      expect(css).toMatch(/--tracking-micro:\s*0\.08em/);
    });
  });

  describe('@font-face declarations (self-hosted variable fonts)', () => {
    it.each(['Inter', 'Fraunces', 'JetBrains Mono'])('declares @font-face for %s', (family) => {
      expect(css).toMatch(new RegExp(`font-family:\\s*'${family}'`));
    });

    it('uses font-display: swap for all three', () => {
      const swapMatches = css.match(/font-display:\s*swap/g);
      expect(swapMatches?.length).toBe(3);
    });

    it('points to /fonts/ public path for all three', () => {
      expect(css).toMatch(/url\('\/fonts\/Inter-Variable\.ttf'\)/);
      expect(css).toMatch(/url\('\/fonts\/Fraunces-Variable\.ttf'\)/);
      expect(css).toMatch(/url\('\/fonts\/JetBrainsMono-Variable\.ttf'\)/);
    });
  });

  describe('Admin accent flip primitive', () => {
    it('exposes [data-accent="admin"] block remapping brand* to accent (laiton)', () => {
      expect(css).toMatch(/\[data-accent='admin'\]/);
      expect(css).toMatch(
        /\[data-accent='admin'\][^}]*--color-brand-400:\s*var\(--color-accent-400\)/s,
      );
    });
  });

  describe('Liquid Glass primitive', () => {
    it('exposes .glass class with multi-layer composition (blur + tint + edge highlights)', () => {
      expect(css).toMatch(/\.glass\s*{/);
      expect(css).toMatch(/backdrop-filter:\s*blur\(20px\)\s*saturate\(180%\)/);
      expect(css).toMatch(/box-shadow:[^;]*inset/);
    });

    it('provides opaque fallback for prefers-reduced-transparency', () => {
      expect(css).toMatch(
        /@media\s*\(prefers-reduced-transparency:\s*reduce\)[^@]*\.glass\s*{[^}]*backdrop-filter:\s*none/s,
      );
    });
  });

  describe('Helper text classes', () => {
    it.each(['eyebrow', 'micro', 't-primary', 't-secondary', 't-muted'])(
      'defines .%s helper class',
      (cls) => {
        expect(css).toMatch(new RegExp(`\\.${cls}\\s*{`));
      },
    );
  });
});
