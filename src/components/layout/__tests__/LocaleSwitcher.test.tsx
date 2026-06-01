import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';
import { setLocaleAction } from '@/lib/actions/locale';

/**
 * LocaleSwitcher is the iOS-style segmented control (FR | EN) rendered in the
 * marketing + cockpit headers (replaced the native `<select>` 2026-06-01).
 * Doctrine (CLAUDE.md "Cap v1.0 publique") restricts the VISIBLE locales to
 * FR-BE + EN; the wider LOCALES set stays the source of truth for the
 * next-intl middleware so deep-link URLs to /nl-BE etc. keep working.
 *
 * These tests enforce: (1) only FR + EN segments render, (2) the active
 * segment reflects the current locale, (3) the pending-state a11y contract,
 * (4) the THI-266 no-refresh switch contract.
 */

const { replaceMock, refreshMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
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
  replaceMock.mockClear();
  refreshMock.mockClear();
  // Clear call history between specs (keeps the default resolved impl) so the
  // "does nothing" assertion isn't tripped by 'en' clicks from earlier tests.
  vi.mocked(setLocaleAction).mockClear();
});

describe('<LocaleSwitcher /> — v1.0 doctrine FR + EN only', () => {
  it('renders exactly two segments (radios)', () => {
    render(<LocaleSwitcher />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('renders the short codes FR + EN, with the full locale name as accessible name', () => {
    render(<LocaleSwitcher />);
    const fr = screen.getByTestId('locale-option-fr-BE');
    const en = screen.getByTestId('locale-option-en');
    expect(fr).toHaveTextContent('FR');
    expect(en).toHaveTextContent('EN');
    // Full name stays the accessible name (aria-label) for screen readers.
    expect(fr).toHaveAttribute('aria-label', frMessages.ui.localeSwitcher.options['fr-BE']);
    expect(en).toHaveAttribute('aria-label', frMessages.ui.localeSwitcher.options.en);
  });

  it('marks the current locale (fr-BE) as the checked segment', () => {
    render(<LocaleSwitcher />);
    expect(screen.getByTestId('locale-option-fr-BE')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('locale-option-en')).toHaveAttribute('aria-checked', 'false');
  });

  it('does NOT expose nl-BE, es-ES or de-DE (partial translations not yet doctrine-approved)', () => {
    render(<LocaleSwitcher />);
    expect(screen.queryByTestId('locale-option-nl-BE')).not.toBeInTheDocument();
    expect(screen.queryByTestId('locale-option-es-ES')).not.toBeInTheDocument();
    expect(screen.queryByTestId('locale-option-de-DE')).not.toBeInTheDocument();
  });
});

describe('<LocaleSwitcher /> — pending-state a11y', () => {
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('at rest: segments enabled, radiogroup aria-busy=false, status empty', () => {
    render(<LocaleSwitcher />);
    expect(screen.getByTestId('locale-option-en')).not.toBeDisabled();
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('during transition: segments disabled, aria-busy=true, status announces switching', async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    vi.mocked(setLocaleAction).mockReturnValueOnce(promise as ReturnType<typeof setLocaleAction>);

    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.click(screen.getByTestId('locale-option-en'));

    expect(screen.getByTestId('locale-option-en')).toBeDisabled();
    expect(screen.getByTestId('locale-option-fr-BE')).toBeDisabled();
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'true');
    const expectedStatus = (frMessages as { ui: { localeSwitcher: { switching: string } } }).ui
      .localeSwitcher.switching;
    expect(screen.getByRole('status')).toHaveTextContent(expectedStatus);
    expect(screen.getByRole('status').textContent?.trim()).not.toBe('');

    await act(async () => {
      resolve({ ok: true });
    });
  });

  it('restores at-rest state after the transition completes', async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    vi.mocked(setLocaleAction).mockReturnValueOnce(promise as ReturnType<typeof setLocaleAction>);

    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.click(screen.getByTestId('locale-option-en'));
    expect(screen.getByTestId('locale-option-en')).toBeDisabled();

    await act(async () => {
      resolve({ ok: true });
    });

    expect(screen.getByTestId('locale-option-en')).not.toBeDisabled();
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});

describe('<LocaleSwitcher /> — THI-266 no-refresh switch contract', () => {
  it('calls setLocaleAction(next) THEN router.replace(pathname, {locale}); never router.refresh', async () => {
    const callOrder: string[] = [];
    vi.mocked(setLocaleAction).mockImplementationOnce(async () => {
      callOrder.push('setLocaleAction');
      return { ok: true };
    });
    replaceMock.mockImplementationOnce(() => {
      callOrder.push('replace');
    });

    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.click(screen.getByTestId('locale-option-en'));

    expect(setLocaleAction).toHaveBeenCalledWith('en');
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/', { locale: 'en' });
    expect(refreshMock).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['setLocaleAction', 'replace']);
  });

  it('clicking the already-active segment does nothing (no switch)', async () => {
    const user = userEvent.setup();
    render(<LocaleSwitcher />);
    await user.click(screen.getByTestId('locale-option-fr-BE'));

    expect(setLocaleAction).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
