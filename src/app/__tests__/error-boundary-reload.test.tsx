import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * The two error boundaries share one promise since the version-skew fix: an
 * error born in the browser (no `digest`) is not something `reset()` can cure,
 * because re-rendering with the same stale chunk manifest fails the same way.
 * « Réessayer » must therefore reload the page, and an error that has the
 * signature of a missing chunk reloads it once, on its own.
 */

const { reloadSpy, sendSpy } = vi.hoisted(() => ({ reloadSpy: vi.fn(), sendSpy: vi.fn() }));

vi.mock('@/lib/browser/reload', () => ({ reloadPage: reloadSpy }));
vi.mock('@/lib/browser/client-error-report', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/browser/client-error-report')>()),
  sendClientErrorReport: sendSpy,
}));
vi.mock('../globals.css', () => ({}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import GlobalError from '../global-error';
import LocaleError from '../[locale]/error';

const chunkError = () =>
  Object.assign(new Error('Loading chunk 12 failed.'), { name: 'ChunkLoadError' });
const plainError = () => new TypeError("Cannot read properties of undefined (reading 'x')");
const serverError = () => Object.assign(new Error(''), { digest: '4242424242' });

type Boundary = typeof GlobalError;
const boundaries: Array<[string, Boundary, string]> = [
  ['global-error', GlobalError, 'Réessayer'],
  ['[locale]/error', LocaleError as Boundary, 'ctaRetry'],
];

function mount(Component: Boundary, error: Error & { digest?: string }, reset = vi.fn()) {
  document.documentElement.lang = 'fr-BE';
  render(<Component error={error} reset={reset} />, {
    container: document.body.appendChild(document.createElement('div')),
  });
  return reset;
}

describe.each(boundaries)('%s — recovery from a browser-side error', (_name, Component, retry) => {
  beforeEach(() => {
    reloadSpy.mockReset();
    sendSpy.mockReset();
    window.sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reloads the current page once, by itself, on a missing-chunk error', () => {
    mount(Component, chunkError());
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does not reload by itself a second time inside the guard window', () => {
    mount(Component, chunkError());
    document.body.innerHTML = '';
    mount(Component, chunkError());
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does not reload by itself on an ordinary bug', () => {
    mount(Component, plainError());
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('« Réessayer » reloads the page, not reset(), for an error without digest', () => {
    const reset = mount(Component, plainError());
    fireEvent.click(screen.getByRole('button', { name: retry }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it('« Réessayer » keeps reset() for a server error (digest present)', () => {
    const reset = mount(Component, serverError());
    fireEvent.click(screen.getByRole('button', { name: retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('sends one report with no message in it', () => {
    mount(Component, Object.assign(new Error('Montant 505 € refusé'), { name: 'TypeError' }));
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const report = sendSpy.mock.calls[0]?.[0];
    expect(report).toMatchObject({ name: 'TypeError', skew: false });
    expect(JSON.stringify(report)).not.toMatch(/505|Montant/);
  });
});
