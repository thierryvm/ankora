import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'admin') => (key: 'pill' | 'zone') => messages[namespace][key],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin',
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin',
}));

import { AdminTopbar } from '../AdminTopbar';

describe('AdminTopbar', () => {
  it('carries the persistent amber « Admin » pill', async () => {
    const ui = await AdminTopbar({ locale: 'fr-BE' });
    render(
      <NextIntlClientProvider locale="fr-BE" messages={messages}>
        {ui}
      </NextIntlClientProvider>,
    );
    const pill = screen.getByText('Admin');
    expect(pill.className).toContain('text-accent-text');
    expect(pill.className).toContain('border-accent-text');
    expect(screen.getByText('Zone réservée au fondateur')).toBeInTheDocument();
  });
});
