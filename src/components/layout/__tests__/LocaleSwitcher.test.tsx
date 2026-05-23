import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';
import { setLocaleAction } from '@/lib/actions/locale';

/**
 * LocaleSwitcher is the `<select>` rendered inside the marketing + cockpit
 * headers. Doctrine (CLAUDE.md "Cap v1.0 publique") restricts the visible
 * locales to FR-BE + EN; the wider LOCALES set stays the source of truth for
 * the next-intl middleware so deep-link URLs to /nl-BE etc. keep working.
 *
 * These tests enforce the doctrine at the UI surface: the `<select>` must
 * only render FR + EN, never the partial NL/ES/DE locales currently shipped
 * in `messages/*.json`.
 */

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/actions/locale', () => ({
  setLocaleAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr-BE',
  useTranslations: (namespace: string) => {
    return (key: string) => {
      const ns = (frMessages as Record<string, Record<string, unknown>>)[namespace.split('.')[0]!];
      const parts = namespace.split('.').slice(1);
      let value: unknown = ns;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        }
      }
      const keyParts = key.split('.');
      for (const part of keyParts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

import { LocaleSwitcher } from '../LocaleSwitcher';

beforeEach(() => {
  cleanup();
});

describe('<LocaleSwitcher /> — v1.0 doctrine FR + EN only', () => {
  it('renders exactly two options in the select', () => {
    render(<LocaleSwitcher />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
  });

  it('exposes fr-BE and en as the only option values', () => {
    render(<LocaleSwitcher />);
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const values = options.map((o) => o.value);
    expect(values).toEqual(['fr-BE', 'en']);
  });

  it('does NOT expose nl-BE, es-ES or de-DE (partial translations not yet doctrine-approved)', () => {
    render(<LocaleSwitcher />);
    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    const values = options.map((o) => o.value);
    expect(values).not.toContain('nl-BE');
    expect(values).not.toContain('es-ES');
    expect(values).not.toContain('de-DE');
  });
});

/**
 * THI-252 / THI-255 (PR-FIX-I18N-UX Phase A, 2026-05-23) — pending-state UX.
 *
 * The `<select>` already wraps its onChange in `startTransition`, so the
 * `pending` boolean is React-managed; this suite asserts the visual /
 * a11y contract during the transition:
 *   - select disabled + `aria-busy="true"`
 *   - `Loader2` spinner visible (and gone at rest)
 *   - `role="status"` text reads the i18n `ui.localeSwitcher.switching`
 *     label so screen readers announce the action
 *
 * To exercise the pending window deterministically we override the
 * mocked `setLocaleAction` with a deferred promise — without it the
 * default `.mockResolvedValue(undefined)` flushes too fast for the
 * pending state to be observable from a test.
 *
 * Phase B (next PR) will tackle the architectural side (drawer
 * stay-open + `< 500 ms` propagation budget, cf. audit perf THI-243
 * RC #2 / #4); this PR is visual / a11y only and does NOT change the
 * `startTransition` logic itself.
 */
describe('<LocaleSwitcher /> — THI-252/255 Phase A pending UX', () => {
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('select is enabled, aria-busy=false, spinner hidden at rest', () => {
    render(<LocaleSwitcher />);
    const select = screen.getByRole('combobox');
    expect(select).not.toBeDisabled();
    expect(select).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('locale-switching-spinner')).not.toBeInTheDocument();
    // role="status" node exists but is empty at rest.
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('disables select + sets aria-busy=true + reveals spinner + announces status during transition', async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    vi.mocked(setLocaleAction).mockReturnValueOnce(promise as ReturnType<typeof setLocaleAction>);

    const user = userEvent.setup();
    render(<LocaleSwitcher />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'en');

    // Transition is in flight — setLocaleAction has not resolved yet.
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('locale-switching-spinner')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Changement de langue…');

    // Resolve inside `act` so React can flush the transition before the
    // test exits (avoids "act warning" noise in subsequent tests).
    await act(async () => {
      resolve({ ok: true });
    });
  });

  it('restores at-rest state after the transition completes', async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    vi.mocked(setLocaleAction).mockReturnValueOnce(promise as ReturnType<typeof setLocaleAction>);

    const user = userEvent.setup();
    render(<LocaleSwitcher />);

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'en');
    expect(select).toBeDisabled();

    await act(async () => {
      resolve({ ok: true });
    });

    expect(select).not.toBeDisabled();
    expect(select).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('locale-switching-spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('Loader2 spinner is aria-hidden so only the role="status" text is announced', async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    vi.mocked(setLocaleAction).mockReturnValueOnce(promise as ReturnType<typeof setLocaleAction>);

    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.selectOptions(screen.getByRole('combobox'), 'en');

    const spinner = screen.getByTestId('locale-switching-spinner');
    // Decorative icon — assistive tech reads the role=status text instead.
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    // Status node has `aria-live="polite"` so screen readers announce
    // the label without interrupting the user.
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    await act(async () => {
      resolve({ ok: true });
    });
  });
});
