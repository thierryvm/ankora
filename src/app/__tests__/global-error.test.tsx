import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../globals.css', () => ({}));

import GlobalError from '../global-error';

const renderInDoc = (lang: string, reset = vi.fn()) => {
  document.documentElement.lang = lang;
  // global-error.tsx renders <html><body> — render mounts to a detached div
  // and React just produces those tags as children. We don't wrap in another
  // <html>, we just verify the visible content.
  return render(
    <GlobalError error={Object.assign(new Error('boom'), { digest: 'd-9' })} reset={reset} />,
    { container: document.body.appendChild(document.createElement('div')) },
  );
};

describe('<GlobalError /> — root html/body error boundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('renders the FR fallback when document.lang is fr-BE', () => {
    renderInDoc('fr-BE');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "Quelque chose s'est cassé",
    );
    expect(screen.getByText(/Tes données sont en sécurité/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('renders the EN fallback when document.lang starts with en', () => {
    renderInDoc('en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something broke');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('falls back to FR when document.lang is unknown', () => {
    renderInDoc('zz-ZZ');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "Quelque chose s'est cassé",
    );
  });

  it('calls reset() when retry is clicked', () => {
    const reset = vi.fn();
    renderInDoc('fr-BE', reset);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('exposes a working "back to home" link to /', () => {
    renderInDoc('en');
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });

  it('logs only the digest, never the raw error message (PII safety)', () => {
    const spy = vi.spyOn(console, 'error');
    document.documentElement.lang = 'fr-BE';
    render(
      <GlobalError
        error={Object.assign(new Error('payload-with-pii@test'), { digest: 'fatal-42' })}
        reset={vi.fn()}
      />,
      { container: document.body.appendChild(document.createElement('div')) },
    );
    const haystack = JSON.stringify(spy.mock.calls.flat());
    expect(haystack).toContain('fatal-42');
    expect(haystack).not.toContain('payload-with-pii@test');
  });

  it('marks the main element as role="alert"', () => {
    renderInDoc('fr-BE');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('emits <html lang="fr"> when the FR copy is shown (a11y/SEO — Sourcery #1)', () => {
    document.documentElement.lang = 'fr-BE';
    const html = renderToStaticMarkup(
      <GlobalError error={Object.assign(new Error('boom'), { digest: 'd-fr' })} reset={vi.fn()} />,
    );
    expect(html).toMatch(/<html[^>]*lang="fr"/);
    expect(html).not.toMatch(/<html[^>]*lang="en"/);
  });

  it('emits <html lang="en"> when the EN copy is shown (a11y/SEO — Sourcery #1)', () => {
    document.documentElement.lang = 'en-US';
    const html = renderToStaticMarkup(
      <GlobalError error={Object.assign(new Error('boom'), { digest: 'd-en' })} reset={vi.fn()} />,
    );
    expect(html).toMatch(/<html[^>]*lang="en"/);
    expect(html).not.toMatch(/<html[^>]*lang="fr"/);
  });
});
