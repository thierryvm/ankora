import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Glass } from '../glass';

describe('<Glass />', () => {
  it('renders a div with the .glass class and rounded-xl', () => {
    render(<Glass data-testid="glass">child</Glass>);
    const el = screen.getByTestId('glass');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain('glass');
    expect(el.className).toContain('rounded-xl');
  });

  it('applies the default md padding (p-5)', () => {
    render(<Glass data-testid="glass">x</Glass>);
    expect(screen.getByTestId('glass').className).toContain('p-5');
  });

  it.each([
    ['none', ''],
    ['sm', 'p-3'],
    ['md', 'p-5'],
    ['lg', 'p-8'],
  ] as const)('applies the %s padding', (padding, expected) => {
    render(
      <Glass data-testid="glass" padding={padding}>
        x
      </Glass>,
    );
    if (expected) {
      expect(screen.getByTestId('glass').className).toContain(expected);
    } else {
      expect(screen.getByTestId('glass').className).not.toMatch(/\bp-\d/);
    }
  });

  it('merges a custom className without dropping the base classes', () => {
    render(
      <Glass data-testid="glass" className="bg-card/40">
        x
      </Glass>,
    );
    const cls = screen.getByTestId('glass').className;
    expect(cls).toContain('glass');
    expect(cls).toContain('bg-card/40');
  });

  it('forwards arbitrary HTML props (id, role, aria-label)', () => {
    render(
      <Glass id="hero-card" role="region" aria-label="Aperçu">
        x
      </Glass>,
    );
    const el = screen.getByRole('region', { name: 'Aperçu' });
    expect(el).toHaveAttribute('id', 'hero-card');
  });
});
