import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card';

describe('<Card /> composition', () => {
  it('renders a complete card with header, title, description, content, and footer', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Provision santé</CardTitle>
          <CardDescription>Lissée sur 12 mois</CardDescription>
        </CardHeader>
        <CardContent>250 € / mois</CardContent>
        <CardFooter>Prochaine échéance : avril</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('Provision santé')).toBeInTheDocument();
    expect(screen.getByText('Lissée sur 12 mois')).toBeInTheDocument();
    expect(screen.getByText('250 € / mois')).toBeInTheDocument();
    expect(screen.getByText('Prochaine échéance : avril')).toBeInTheDocument();
  });

  it('Card forwards className while keeping default tokens', () => {
    render(
      <Card className="custom-card-class" data-testid="card">
        content
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('custom-card-class');
    expect(card.className).toContain('rounded-xl');
  });

  it('CardTitle is an h3 by default', () => {
    render(<CardTitle>Provision santé</CardTitle>);
    expect(screen.getByRole('heading', { level: 3, name: 'Provision santé' })).toBeInTheDocument();
  });

  it.each([1, 2, 4] as const)('CardTitle renders the requested level h%i', (level) => {
    render(<CardTitle as={`h${level}`}>Se connecter</CardTitle>);
    const heading = screen.getByRole('heading', { level, name: 'Se connecter' });
    expect(heading.tagName).toBe(`H${level}`);
    expect(screen.queryAllByRole('heading')).toHaveLength(1);
  });

  it('CardDescription renders as a <p> for semantic clarity', () => {
    render(<CardDescription>Description text</CardDescription>);
    expect(screen.getByText('Description text').tagName).toBe('P');
  });
});
