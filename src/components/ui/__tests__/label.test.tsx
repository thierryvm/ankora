import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Label } from '../label';

describe('<Label />', () => {
  it('renders the label text', () => {
    render(<Label>Email address</Label>);
    expect(screen.getByText('Email address')).toBeInTheDocument();
  });

  it('forwards htmlFor to associate with an input', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" type="email" />
      </>,
    );
    const label = screen.getByText('Email');
    expect(label).toHaveAttribute('for', 'email');
  });

  it('merges custom className with default classes', () => {
    render(<Label className="custom-test-class">Test</Label>);
    const label = screen.getByText('Test');
    expect(label.className).toContain('custom-test-class');
    expect(label.className).toContain('text-sm');
  });
});
