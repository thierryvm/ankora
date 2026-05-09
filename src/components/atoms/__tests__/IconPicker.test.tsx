import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { IconPicker, ANKORA_ICON_LIB, type AnkoraIconDef, type AnkoraIconName } from '../index';

describe('<IconPicker /> (atom CD#3)', () => {
  it('exports a curated default registry of 25 Ankora icons', () => {
    expect(ANKORA_ICON_LIB).toHaveLength(25);
    for (const def of ANKORA_ICON_LIB) {
      expect(def.name).toBeTruthy();
      expect(def.label).toBeTruthy();
      // lucide-react exports forwardRef objects (typeof "object") OR
      // function components depending on the version — both renderable.
      const t = typeof def.Component;
      expect(t === 'function' || t === 'object').toBe(true);
      expect(def.Component).toBeTruthy();
    }
  });

  it('renders 25 tiles with the default registry', () => {
    render(<IconPicker value="home" onChange={vi.fn()} />);
    const tiles = screen.getAllByRole('radio');
    expect(tiles).toHaveLength(25);
  });

  it('root has role="radiogroup" with default aria-label "Choisir une icône"', () => {
    render(<IconPicker value="home" onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-label', 'Choisir une icône');
  });

  it('uses custom ariaLabel when provided', () => {
    render(<IconPicker value="home" onChange={vi.fn()} ariaLabel="Icône de la catégorie" />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-label', 'Icône de la catégorie');
  });

  it('each tile exposes role="radio" + aria-label matching its def.label', () => {
    render(<IconPicker value="home" onChange={vi.fn()} />);
    for (const def of ANKORA_ICON_LIB) {
      const tile = screen.getByRole('radio', { name: def.label });
      expect(tile).toBeInTheDocument();
    }
  });

  it.each([
    ['home', 'Logement'],
    ['wallet', 'Portefeuille'],
    ['pie-chart', 'Provisions'],
    ['piggy-bank', 'Tirelire'],
  ] as const)('maps icon name "%s" to expected French label "%s"', (name, label) => {
    const def = ANKORA_ICON_LIB.find((d) => d.name === name);
    expect(def).toBeDefined();
    expect(def?.label).toBe(label);
  });

  it('aria-checked="true" only on tile matching value, others "false"', () => {
    const active: AnkoraIconName = 'wallet';
    render(<IconPicker value={active} onChange={vi.fn()} />);
    const tiles = screen.getAllByRole('radio');
    const checked = tiles.filter((t) => t.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAttribute('aria-label', 'Portefeuille');
    const unchecked = tiles.filter((t) => t.getAttribute('aria-checked') === 'false');
    expect(unchecked).toHaveLength(24);
  });

  it('value=undefined → no tile is active (no aria-checked="true")', () => {
    render(<IconPicker value={undefined} onChange={vi.fn()} />);
    const tiles = screen.getAllByRole('radio');
    const checked = tiles.filter((t) => t.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(0);
  });

  it('clicking a tile calls onChange once with that icon name', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<IconPicker value="home" onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Voiture' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('car');
  });

  it('respects custom options prop (3 icons → 3 tiles)', () => {
    const custom: readonly AnkoraIconDef[] = ANKORA_ICON_LIB.slice(0, 3);
    render(<IconPicker value="home" options={custom} onChange={vi.fn()} />);
    const tiles = screen.getAllByRole('radio');
    expect(tiles).toHaveLength(3);
  });

  it('applies custom columns prop to grid-template-columns inline style', () => {
    const { container } = render(<IconPicker value="home" onChange={vi.fn()} columns={4} />);
    const root = container.querySelector('.atm-ipick') as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.getAttribute('style') ?? '').toContain('repeat(4');
  });

  it('defaults columns to 6 when not provided', () => {
    const { container } = render(<IconPicker value="home" onChange={vi.fn()} />);
    const root = container.querySelector('.atm-ipick') as HTMLElement | null;
    expect(root?.getAttribute('style') ?? '').toContain('repeat(6');
  });

  it('maxHeight prop applies inline maxHeight + overflowY:auto', () => {
    const { container } = render(<IconPicker value="home" onChange={vi.fn()} maxHeight={240} />);
    const root = container.querySelector('.atm-ipick') as HTMLElement | null;
    const style = root?.getAttribute('style') ?? '';
    expect(style).toMatch(/max-height:\s*240px/i);
    expect(style.toLowerCase()).toContain('overflow-y: auto');
  });

  it('without maxHeight → no overflow-y rule on root', () => {
    const { container } = render(<IconPicker value="home" onChange={vi.fn()} />);
    const root = container.querySelector('.atm-ipick') as HTMLElement | null;
    const style = (root?.getAttribute('style') ?? '').toLowerCase();
    expect(style).not.toContain('overflow-y');
    expect(style).not.toContain('max-height');
  });

  it('each tile has title attribute equal to its label (tooltip)', () => {
    render(<IconPicker value="home" onChange={vi.fn()} />);
    for (const def of ANKORA_ICON_LIB) {
      const tile = screen.getByRole('radio', { name: def.label });
      expect(tile.getAttribute('title')).toBe(def.label);
    }
  });

  it('applies roving tabIndex: 0 on active tile, -1 on others', () => {
    const active: AnkoraIconName = 'pie-chart';
    render(<IconPicker value={active} onChange={vi.fn()} />);
    const activeTile = screen.getByRole('radio', { name: 'Provisions' });
    expect(activeTile.getAttribute('tabindex')).toBe('0');
    const others = screen.getAllByRole('radio').filter((el) => el !== activeTile);
    for (const el of others) {
      expect(el.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('active tile has class "is-active"; inactive tiles do not', () => {
    render(<IconPicker value="heart" onChange={vi.fn()} />);
    const activeTile = screen.getByRole('radio', { name: 'Santé' });
    expect(activeTile.className).toContain('is-active');
    const others = screen.getAllByRole('radio').filter((el) => el !== activeTile);
    for (const el of others) {
      expect(el.className).not.toContain('is-active');
    }
  });

  it('all tiles are type="button" (no implicit form submit)', () => {
    render(<IconPicker value="home" onChange={vi.fn()} />);
    for (const tile of screen.getAllByRole('radio')) {
      expect(tile.getAttribute('type')).toBe('button');
    }
  });

  it('passes through className on the root', () => {
    const { container } = render(
      <IconPicker value="home" onChange={vi.fn()} className="custom-extra" />,
    );
    const root = container.querySelector('.atm-ipick') as HTMLElement | null;
    expect(root?.className).toContain('atm-ipick');
    expect(root?.className).toContain('custom-extra');
  });
});
