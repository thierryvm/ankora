import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns = messages as Record<string, unknown>;
    let cursor: unknown = ns;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)[part];
    }
    return (key: string) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
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

import { FAQ, FAQ_KEYS } from '../FAQ';

async function renderFAQ() {
  return render(await FAQ());
}

describe('<FAQ />', () => {
  it('exports FAQ_KEYS as the canonical 3-question list (advice/storage/sharing)', () => {
    expect(FAQ_KEYS).toEqual(['advice', 'storage', 'sharing']);
  });

  it('renders the heading and 3 question/answer pairs in a <dl>', async () => {
    const { container } = await renderFAQ();
    expect(
      screen.getByRole('heading', { level: 2, name: /questions fréquentes/i }),
    ).toBeInTheDocument();

    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    expect(dl?.querySelectorAll('dt')).toHaveLength(FAQ_KEYS.length);
    expect(dl?.querySelectorAll('dd')).toHaveLength(FAQ_KEYS.length);
  });

  it('exposes the section as a named landmark via aria-labelledby="faq-heading"', async () => {
    await renderFAQ();
    const section = screen.getByRole('heading', { level: 2 }).closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'faq-heading');
    expect(section).toHaveAttribute('id', 'faq');
  });

  it('renders the localised "Ankora est-il un outil de conseil financier ?" question', async () => {
    await renderFAQ();
    expect(screen.getByText(/Ankora est-il un outil de conseil financier/i)).toBeInTheDocument();
  });
});
