import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ScenarioCards } from '../ScenarioCards';

const COPY = {
  steady: { name: 'Économe', tagline: 'Petit pas', description: 'Mettez de côté 50 € par mois.' },
  balanced: { name: 'Standard', tagline: 'Confortable', description: '100 € par mois.' },
  ambitious: { name: 'Ambitieux', tagline: 'Solide', description: '200 € par mois.' },
} as const;

describe('<ScenarioCards />', () => {
  it('renders three scenarios as a radiogroup', () => {
    render(
      <ScenarioCards
        selected="balanced"
        onSelect={vi.fn()}
        copy={COPY}
        groupLabel="Choisissez un scénario"
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Choisissez un scénario' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks the selected scenario with aria-checked=true', () => {
    render(<ScenarioCards selected="balanced" onSelect={vi.fn()} copy={COPY} groupLabel="g" />);
    const balanced = screen.getByRole('radio', { name: /standard/i });
    const steady = screen.getByRole('radio', { name: /économe/i });
    expect(balanced).toHaveAttribute('aria-checked', 'true');
    expect(steady).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onSelect with the scenario key when clicked', () => {
    const onSelect = vi.fn();
    render(<ScenarioCards selected="balanced" onSelect={onSelect} copy={COPY} groupLabel="g" />);
    fireEvent.click(screen.getByRole('radio', { name: /ambitieux/i }));
    expect(onSelect).toHaveBeenCalledWith('ambitious');
  });

  it('renders the localised name, tagline, and description for each scenario', () => {
    render(<ScenarioCards selected="balanced" onSelect={vi.fn()} copy={COPY} groupLabel="g" />);
    expect(screen.getByText('Économe')).toBeInTheDocument();
    expect(screen.getByText('Petit pas')).toBeInTheDocument();
    expect(screen.getByText('Mettez de côté 50 € par mois.')).toBeInTheDocument();
    expect(screen.getByText('Ambitieux')).toBeInTheDocument();
  });
});
