import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    return (key: string, params?: Record<string, unknown>) => {
      let value: unknown = ns;
      for (const part of key.split('.')) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
          value,
        );
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    const value = ns[key];
    return typeof value === 'string' ? value : key;
  },
}));

vi.mock('@/lib/actions/consent', () => ({
  recordCookieConsentAction: vi.fn().mockResolvedValue({ ok: true, data: { persisted: false } }),
  getCookieConsentAction: vi.fn().mockResolvedValue({ ok: true, data: { snapshot: null } }),
  resetCookieConsentAction: vi.fn().mockResolvedValue({ ok: true, data: { persisted: false } }),
}));

import { AppFooter } from '../AppFooter';

async function renderAppFooter() {
  return render(await AppFooter());
}

/**
 * The footer INSIDE `/app` (decision @thierry, 22 September 2026, option A):
 * nothing below 1024 px — the « Plus » sheet already carries the five entries —
 * and one discreet line from 1024 px up. The line's height and the absence below
 * 1024 are measured in `e2e/pied-de-page-app.spec.ts`; this file pins the
 * content, which a browser measurement cannot name.
 */
describe('<AppFooter />', () => {
  it('is not displayed below 1024 px, and is from 1024 px up', async () => {
    const { container } = await renderAppFooter();
    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    const classes = footer!.className.split(/\s+/);
    expect(classes).toContain('hidden');
    expect(classes).toContain('lg:block');
  });

  it('carries the four legal links and the cookie preferences button (GDPR art. 7(3))', async () => {
    await renderAppFooter();
    const nav = screen.getByRole('navigation');
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/legal/cgu', '/legal/privacy', '/legal/cookies', '/faq']);
    expect(
      within(nav).getByRole('button', { name: messages.footer.cookiePreferences }),
    ).toBeInTheDocument();
  });

  it('shows the copyright with the current year', async () => {
    await renderAppFooter();
    expect(
      screen.getByText(new RegExp(`© ${new Date().getFullYear()} Ankora`)),
    ).toBeInTheDocument();
  });

  it('is a line, not a block: no logo, small text', async () => {
    const { container } = await renderAppFooter();
    expect(container.querySelector('svg, img')).toBeNull();
    expect(screen.queryByRole('link', { name: /accueil ankora/i })).toBeNull();
    expect(container.querySelector('footer > div')!.className.split(/\s+/)).toContain('text-xs');
  });

  it('gives every link and the button a 24 px minimum target (WCAG 2.2 SC 2.5.8)', async () => {
    await renderAppFooter();
    const targets = [
      ...screen.getAllByRole('link'),
      screen.getByRole('button', { name: messages.footer.cookiePreferences }),
    ];
    for (const target of targets) {
      const classes = target.className.split(/\s+/);
      expect(classes, target.textContent ?? '').toContain('min-h-6');
      // « FAQ » in text-xs is 23 px wide: height alone is not a 24 × 24 target.
      expect(classes, target.textContent ?? '').toContain('min-w-6');
    }
  });
});
