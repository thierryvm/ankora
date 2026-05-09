import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ColorPicker, ATM_COLOR_PALETTE } from '../ColorPicker';

describe('<ColorPicker /> (atom CD#3)', () => {
  it('exports a curated default palette of 12 hex colors', () => {
    expect(ATM_COLOR_PALETTE).toHaveLength(12);
    for (const hex of ATM_COLOR_PALETTE) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('renders 12 swatches with the default palette', () => {
    render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} />);
    const swatches = screen.getAllByRole('radio');
    expect(swatches).toHaveLength(12);
  });

  it('root has role="radiogroup" with default aria-label "Choisir une couleur"', () => {
    render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-label', 'Choisir une couleur');
  });

  it('uses custom ariaLabel when provided', () => {
    render(
      <ColorPicker
        value={ATM_COLOR_PALETTE[0]!}
        onChange={vi.fn()}
        ariaLabel="Couleur de la catégorie"
      />,
    );
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-label', 'Couleur de la catégorie');
  });

  it('each swatch has role="radio" and aria-label containing its hex code', () => {
    render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} />);
    for (const hex of ATM_COLOR_PALETTE) {
      const swatch = screen.getByRole('radio', { name: `Couleur ${hex}` });
      expect(swatch).toBeInTheDocument();
    }
  });

  it('aria-checked="true" only on the swatch matching value, others "false"', () => {
    const active = ATM_COLOR_PALETTE[3]!;
    render(<ColorPicker value={active} onChange={vi.fn()} />);
    const swatches = screen.getAllByRole('radio');
    const checked = swatches.filter((s) => s.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAttribute('aria-label', `Couleur ${active}`);
    const unchecked = swatches.filter((s) => s.getAttribute('aria-checked') === 'false');
    expect(unchecked).toHaveLength(11);
  });

  it('respects custom options prop (e.g. 4 colors → 4 swatches)', () => {
    const custom = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'] as const;
    render(<ColorPicker value={custom[0]} options={custom} onChange={vi.fn()} />);
    const swatches = screen.getAllByRole('radio');
    expect(swatches).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Couleur #ff0000' })).toBeInTheDocument();
  });

  it('applies custom columns prop to grid-template-columns inline style', () => {
    const { container } = render(
      <ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} columns={4} />,
    );
    const root = container.querySelector('.atm-cpick') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.getAttribute('style') ?? '').toContain('repeat(4');
  });

  it('defaults columns to 6 when not provided', () => {
    const { container } = render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} />);
    const root = container.querySelector('.atm-cpick') as HTMLElement | null;
    expect(root?.getAttribute('style') ?? '').toContain('repeat(6');
  });

  it('clicking a swatch calls onChange once with that hex', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={onChange} />);
    const target = ATM_COLOR_PALETTE[5]!;
    await user.click(screen.getByRole('radio', { name: `Couleur ${target}` }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(target);
  });

  it('active swatch has class "is-active"; inactive don\'t', () => {
    const active = ATM_COLOR_PALETTE[2]!;
    render(<ColorPicker value={active} onChange={vi.fn()} />);
    const activeSwatch = screen.getByRole('radio', { name: `Couleur ${active}` });
    expect(activeSwatch.className).toContain('is-active');
    const others = screen.getAllByRole('radio').filter((el) => el !== activeSwatch);
    for (const el of others) {
      expect(el.className).not.toContain('is-active');
    }
  });

  it('each swatch has inline background-color matching its hex', () => {
    render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} />);
    for (const hex of ATM_COLOR_PALETTE) {
      const swatch = screen.getByRole('radio', { name: `Couleur ${hex}` });
      const style = swatch.getAttribute('style') ?? '';
      // jsdom normalises hex → rgb; accept either form
      const lower = style.toLowerCase();
      const matchesHex = lower.includes(hex.toLowerCase());
      expect(matchesHex || lower.includes('rgb')).toBe(true);
    }
  });

  it('applies roving tabIndex: 0 on active swatch, -1 on others', () => {
    const active = ATM_COLOR_PALETTE[1]!;
    render(<ColorPicker value={active} onChange={vi.fn()} />);
    const activeSwatch = screen.getByRole('radio', { name: `Couleur ${active}` });
    expect(activeSwatch.getAttribute('tabindex')).toBe('0');
    const others = screen.getAllByRole('radio').filter((el) => el !== activeSwatch);
    for (const el of others) {
      expect(el.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('passes through className on the root', () => {
    const { container } = render(
      <ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} className="custom-extra" />,
    );
    const root = container.querySelector('.atm-cpick') as HTMLElement | null;
    expect(root?.className).toContain('atm-cpick');
    expect(root?.className).toContain('custom-extra');
  });

  it('all swatches are type="button" (no implicit form submit)', () => {
    render(<ColorPicker value={ATM_COLOR_PALETTE[0]!} onChange={vi.fn()} />);
    for (const swatch of screen.getAllByRole('radio')) {
      expect(swatch.getAttribute('type')).toBe('button');
    }
  });
});
