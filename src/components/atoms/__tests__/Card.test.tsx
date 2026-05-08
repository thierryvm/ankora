import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Card } from '../Card';

describe('<Card />', () => {
  it('renders children inside <section>', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.querySelector('section')).toBeTruthy();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies default padding=md, elevation=flat, tone=default', () => {
    const { container } = render(<Card>X</Card>);
    const section = container.querySelector('section')!;
    expect(section.className).toContain('atm-card--p-md');
    expect(section.className).toContain('atm-card--flat');
    expect(section.className).toContain('atm-card--tone-default');
  });

  it.each([
    ['none', 'atm-card--p-none'],
    ['sm', 'atm-card--p-sm'],
    ['md', 'atm-card--p-md'],
    ['lg', 'atm-card--p-lg'],
  ] as const)('applies padding %s', (p, cls) => {
    const { container } = render(<Card padding={p}>X</Card>);
    expect(container.querySelector('section')!.className).toContain(cls);
  });

  it.each([
    ['flat', 'atm-card--flat'],
    ['raised', 'atm-card--raised'],
  ] as const)('applies elevation %s', (e, cls) => {
    const { container } = render(<Card elevation={e}>X</Card>);
    expect(container.querySelector('section')!.className).toContain(cls);
  });

  it.each([
    ['default', 'atm-card--tone-default'],
    ['soft', 'atm-card--tone-soft'],
    ['brand', 'atm-card--tone-brand'],
    ['accent', 'atm-card--tone-accent'],
    ['warning', 'atm-card--tone-warning'],
    ['danger', 'atm-card--tone-danger'],
  ] as const)('applies tone %s', (t, cls) => {
    const { container } = render(<Card tone={t}>X</Card>);
    expect(container.querySelector('section')!.className).toContain(cls);
  });

  it('renders eyebrow + title in <header>', () => {
    render(
      <Card eyebrow="EYEBROW" title="Title">
        Body
      </Card>,
    );
    expect(screen.getByText('EYEBROW')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
  });

  it('does not render <header> when neither eyebrow nor title', () => {
    const { container } = render(<Card>X</Card>);
    expect(container.querySelector('header')).toBeNull();
  });

  it('renders footer in <footer>', () => {
    render(<Card footer={<span>Foot</span>}>X</Card>);
    expect(screen.getByText('Foot')).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<Card className="custom">X</Card>);
    expect(container.querySelector('section')!.className).toContain('custom');
  });
});
