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

  it('CardDescription renders as a <p> for semantic clarity', () => {
    render(<CardDescription>Description text</CardDescription>);
    expect(screen.getByText('Description text').tagName).toBe('P');
  });
});
