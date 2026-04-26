import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { createIntlServerMock, createNavigationMock } from '../../../../tests/helpers/intl-mocks';

vi.mock('next-intl/server', () => createIntlServerMock());
vi.mock('@/i18n/navigation', () => createNavigationMock());

import { Footer } from '../Footer';

async function renderFooter() {
  const ui = await Footer();
  return render(ui);
}

describe('<Footer />', () => {
  it('renders the four legal links (CGU, Privacy, Cookies, FAQ)', async () => {
    await renderFooter();
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
