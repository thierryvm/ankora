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
  // `price` a remplace la section Tarifs (2026-08-05). Il est EN TETE parce que
  // c'est la question qu'on se pose en premier, et parce que l'information ne
  // doit pas disparaitre avec la section.
  // `bank` (PR L3) est l'objection frontale, en 2e position — la decision
  // « price first » n'est pas rouverte.
  it('exports FAQ_KEYS with the price question first and the bank objection second', () => {
    expect(FAQ_KEYS).toEqual(['price', 'bank', 'advice', 'storage', 'sharing']);
  });

  it('renders the heading and 5 question/answer pairs in a <dl>', async () => {
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

  it('renders the bank objection with its anti-PSD2 clause, without the reserved cockpit names', async () => {
    await renderFAQ();
    expect(
      screen.getByText(/Pourquoi une deuxième app alors que j'ai déjà celle de ma banque/i),
    ).toBeInTheDocument();
    // The answer IS the thesis — and this is exactly where a reader assumes
    // « donc Ankora lit mon compte », so the denial must live in the answer
    // itself (plan-reviewer, 11 Aug 2026), phrased about DATA (not money).
    expect(screen.getByText(/aucune donnée n'est lue sur ton compte/i)).toBeInTheDocument();
    // Same negative guard as Hero.test.tsx: the landing never borrows the
    // four reserved cockpit names (ADR-035 / ADR-039).
    expect(screen.queryByText(/Il te reste/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Budget du mois/i)).not.toBeInTheDocument();
  });
});
