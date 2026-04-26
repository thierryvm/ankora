import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = (messages as Record<string, Record<string, unknown>>)[namespace] ?? {};
    return (key: string, params?: Record<string, unknown>) => {
      const parts = key.split('.');
      let value: unknown = ns;
      for (const part of parts) {
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

import { Footer } from '../Footer';

async function renderFooter() {
  const ui = await Footer();
  return render(ui);
}

describe('<Footer />', () => {
  it('renders the four legal links (CGU, Privacy, Cookies, FAQ)', async () => {
    await renderFooter();
    // Footer-specific link labels come from the `footer` namespace
    const cgu = screen.getByRole('link', { name: messages.footer.cgu });
    const privacy = screen.getByRole('link', { name: messages.footer.privacy });
    const cookies = screen.getByRole('link', { name: messages.footer.cookies });
    const faq = screen.getByRole('link', { name: messages.footer.faq });

    expect(cgu).toHaveAttribute('href', '/legal/cgu');
    expect(privacy).toHaveAttribute('href', '/legal/privacy');
    expect(cookies).toHaveAttribute('href', '/legal/cookies');
    expect(faq).toHaveAttribute('href', '/faq');
  });

  it('renders the copyright with the current year interpolated', async () => {
    await renderFooter();
    const year = new Date().getFullYear();
    // copyrightNotice template contains "{year}" — assert the resolved value appears
    expect(screen.getByText((content) => content.includes(String(year)))).toBeInTheDocument();
  });

  it('exposes the AnkoraLogo for brand recognition', async () => {
    await renderFooter();
    expect(screen.getByRole('img', { name: 'Ankora' })).toBeInTheDocument();
  });

  it('uses an aria-labelled <nav> for the legal navigation', async () => {
    await renderFooter();
    const nav = screen.getByRole('navigation', { name: messages.common.nav.footerLabel });
    expect(nav).toBeInTheDocument();
  });
});
