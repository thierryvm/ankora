import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Row } from '../row';

describe('<Row />', () => {
  it('renders a div with flex + default gap-3 + items-center + justify-start', () => {
    render(<Row data-testid="row">x</Row>);
    const cls = screen.getByTestId('row').className;
    expect(cls).toContain('flex');
    expect(cls).toContain('gap-3');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-start');
  });

  it.each([
    [1, 'gap-1'],
    [2, 'gap-2'],
    [4, 'gap-4'],
    [6, 'gap-6'],
    [8, 'gap-8'],
  ] as const)('applies gap=%s', (gap, expected) => {
    render(
      <Row data-testid="row" gap={gap}>
        x
      </Row>,
    );
    expect(screen.getByTestId('row').className).toContain(expected);
  });

  it.each([
    ['start', 'items-start'],
    ['end', 'items-end'],
    ['baseline', 'items-baseline'],
    ['stretch', 'items-stretch'],
  ] as const)('applies align=%s', (align, expected) => {
    render(
      <Row data-testid="row" align={align}>
        x
      </Row>,
    );
    expect(screen.getByTestId('row').className).toContain(expected);
  });

  it.each([
    ['center', 'justify-center'],
    ['end', 'justify-end'],
    ['between', 'justify-between'],
    ['around', 'justify-around'],
    ['evenly', 'justify-evenly'],
  ] as const)('applies justify=%s', (justify, expected) => {
    render(
      <Row data-testid="row" justify={justify}>
        x
      </Row>,
    );
    expect(screen.getByTestId('row').className).toContain(expected);
  });

  it('merges a custom className without dropping the base classes', () => {
    render(
      <Row data-testid="row" className="mt-2 px-4">
        x
      </Row>,
    );
    const cls = screen.getByTestId('row').className;
    expect(cls).toContain('flex');
    expect(cls).toContain('mt-2');
    expect(cls).toContain('px-4');
  });
});
