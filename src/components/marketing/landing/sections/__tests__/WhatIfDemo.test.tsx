import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../../../messages/fr-BE.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    let cursor: unknown = messages;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)?.[part];
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

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    let cursor: unknown = messages;
    for (const part of namespace.split('.')) {
      cursor = (cursor as Record<string, unknown>)?.[part];
    }
    return (key: string, params?: Record<string, string | number>) => {
      const parts = key.split('.');
      let value: unknown = cursor;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value === 'string' && params) {
        return value.replace(/\{(\w+)\}/g, (_, k: string) =>
          k in params ? String(params[k]) : `{${k}}`,
        );
      }
      return typeof value === 'string' ? value : key;
    };
  },
}));

import { WhatIfDemo } from '../WhatIfDemo';

async function renderWhatIfDemo() {
  return render(await WhatIfDemo());
}

describe('<WhatIfDemo />', () => {
  it('exposes the section anchor #simulator (referenced by MktNav + Hero CTA)', async () => {
    const { container } = await renderWhatIfDemo();
    const section = container.querySelector('section#simulator');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('aria-labelledby')).toBe('whatif-heading');
  });

  it('renders the localised badge + title + subtitle in the header', async () => {
    await renderWhatIfDemo();
    expect(screen.getByText(messages.landing.whatif.badge)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: messages.landing.whatif.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.landing.whatif.subtitle)).toBeInTheDocument();
  });

  it('hands off to <WhatIfDemoClient /> (3 scenario buttons appear)', async () => {
    await renderWhatIfDemo();
    expect(screen.getAllByRole('button', { name: /Renégocier|Changer|Couper/i })).toHaveLength(3);
  });
});
