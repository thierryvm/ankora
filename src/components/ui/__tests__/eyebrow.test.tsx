import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Eyebrow } from '../eyebrow';

describe('<Eyebrow />', () => {
  it('renders a <p> with the .eyebrow class', () => {
    render(<Eyebrow>Trois principes</Eyebrow>);
    const el = screen.getByText('Trois principes');
    expect(el.tagName).toBe('P');
    expect(el.className).toContain('eyebrow');
  });

  it('does not apply the accent modifier by default', () => {
    render(<Eyebrow>Section</Eyebrow>);
    expect(screen.getByText('Section').className).not.toContain('eyebrow-accent');
  });

  it('applies .eyebrow-accent when tone="accent"', () => {
    render(<Eyebrow tone="accent">Accent</Eyebrow>);
    expect(screen.getByText('Accent').className).toContain('eyebrow-accent');
  });

  it('merges a custom className without dropping .eyebrow', () => {
    render(<Eyebrow className="mb-4">Title</Eyebrow>);
    const cls = screen.getByText('Title').className;
    expect(cls).toContain('eyebrow');
    expect(cls).toContain('mb-4');
  });

  it('forwards arbitrary HTML props (id, aria-hidden)', () => {
    render(
      <Eyebrow id="section-eyebrow" aria-hidden="true">
        Hidden
      </Eyebrow>,
    );
    const el = screen.getByText('Hidden');
    expect(el).toHaveAttribute('id', 'section-eyebrow');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });
});
