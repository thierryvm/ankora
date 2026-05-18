import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AnkCard } from '../AnkCard';

describe('<AnkCard />', () => {
  it('renders children inside <section>', () => {
    const { container } = render(<AnkCard>Content</AnkCard>);
    expect(container.querySelector('section')).toBeTruthy();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('applies default padding=md, elevation=flat, tone=default', () => {
    const { container } = render(<AnkCard>X</AnkCard>);
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
    const { container } = render(<AnkCard padding={p}>X</AnkCard>);
    expect(container.querySelector('section')!.className).toContain(cls);
  });

  it.each([
    ['flat', 'atm-card--flat'],
    ['raised', 'atm-card--raised'],
  ] as const)('applies elevation %s', (e, cls) => {
    const { container } = render(<AnkCard elevation={e}>X</AnkCard>);
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
    const { container } = render(<AnkCard tone={t}>X</AnkCard>);
    expect(container.querySelector('section')!.className).toContain(cls);
  });

  it('renders eyebrow + title in <header>', () => {
    render(
      <AnkCard eyebrow="EYEBROW" title="Title">
        Body
      </AnkCard>,
    );
    expect(screen.getByText('EYEBROW')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
  });

  it('does not render <header> when neither eyebrow nor title', () => {
    const { container } = render(<AnkCard>X</AnkCard>);
    expect(container.querySelector('header')).toBeNull();
  });

  it('renders footer in <footer>', () => {
    render(<AnkCard footer={<span>Foot</span>}>X</AnkCard>);
    expect(screen.getByText('Foot')).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<AnkCard className="custom">X</AnkCard>);
    expect(container.querySelector('section')!.className).toContain('custom');
  });
});
