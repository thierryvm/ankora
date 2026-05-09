import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tabs, type TabItem } from '../index';

const baseTabs: readonly TabItem[] = [
  { id: 'tech', label: 'Technique' },
  { id: 'product', label: 'Produit' },
  { id: 'acq', label: 'Acquisition', badge: 12 },
  { id: 'reco', label: 'Recos', badge: 'NEW' },
] as const;

describe('<Tabs /> (atom CD#3)', () => {
  it('renders role="tablist" with aria-label and one tab per item', () => {
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} ariaLabel="Sections admin" />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveAttribute('aria-label', 'Sections admin');
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  it('aria-selected="true" only on active tab; others aria-selected="false"', () => {
    render(<Tabs tabs={baseTabs} activeId="product" onChange={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('Produit');
    const unselected = tabs.filter((t) => t.getAttribute('aria-selected') === 'false');
    expect(unselected).toHaveLength(3);
  });

  it('ArrowRight cycles to next tab and calls onChange with next id', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('product');
  });

  it('ArrowRight from last tab cycles to first', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="reco" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('tech');
  });

  it('ArrowLeft cycles to previous tab', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="product" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('tech');
  });

  it('ArrowLeft from first tab cycles to last', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('reco');
  });

  it('Home key jumps to first tab', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="acq" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('tech');
  });

  it('End key jumps to last tab', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={onChange} />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('reco');
  });

  it('clicking a non-disabled tab fires onChange with its id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: /Acquisition/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('acq');
  });

  it('renders numeric badge when provided', () => {
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} />);
    const acq = screen.getByRole('tab', { name: /Acquisition/ });
    expect(acq.textContent).toContain('12');
  });

  it('renders string badge when provided', () => {
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} />);
    const reco = screen.getByRole('tab', { name: /Recos/ });
    expect(reco.textContent).toContain('NEW');
  });

  it('does not render a badge node when badge is undefined', () => {
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} />);
    const tech = screen.getByRole('tab', { name: /Technique/ });
    expect(tech.querySelector('.atm-tabs-badge')).toBeNull();
  });

  it('variant="pill" → root has class atm-tabs--pill', () => {
    const { container } = render(
      <Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} variant="pill" />,
    );
    const root = container.querySelector('[role="tablist"]');
    expect(root?.className).toContain('atm-tabs--pill');
    expect(root?.className).not.toContain('atm-tabs--underline');
  });

  it('variant="underline" → root has class atm-tabs--underline', () => {
    const { container } = render(
      <Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} variant="underline" />,
    );
    const root = container.querySelector('[role="tablist"]');
    expect(root?.className).toContain('atm-tabs--underline');
    expect(root?.className).not.toContain('atm-tabs--pill');
  });

  it('size="sm" and size="md" map to corresponding root classes', () => {
    const { container: c1 } = render(
      <Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} size="sm" />,
    );
    expect(c1.querySelector('[role="tablist"]')?.className).toContain('atm-tabs--sm');

    const { container: c2 } = render(
      <Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} size="md" />,
    );
    expect(c2.querySelector('[role="tablist"]')?.className).toContain('atm-tabs--md');
  });

  it('default variant is pill and default size is md', () => {
    const { container } = render(<Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} />);
    const root = container.querySelector('[role="tablist"]');
    expect(root?.className).toContain('atm-tabs--pill');
    expect(root?.className).toContain('atm-tabs--md');
  });

  it('clicking a disabled tab does NOT call onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const tabs: readonly TabItem[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta', disabled: true },
      { id: 'c', label: 'Gamma' },
    ] as const;
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />);
    await user.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keyboard nav skips disabled tabs (ArrowRight from a → c, skipping b)', () => {
    const onChange = vi.fn();
    const tabs: readonly TabItem[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta', disabled: true },
      { id: 'c', label: 'Gamma' },
    ] as const;
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('roving tabIndex: active tab has tabIndex=0, others tabIndex=-1', () => {
    render(<Tabs tabs={baseTabs} activeId="product" onChange={vi.fn()} />);
    const active = screen.getByRole('tab', { name: 'Produit' });
    expect(active.getAttribute('tabindex')).toBe('0');
    const others = screen.getAllByRole('tab').filter((t) => t !== active);
    for (const t of others) {
      expect(t.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('all tabs are type="button" (no form submit)', () => {
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} />);
    for (const t of screen.getAllByRole('tab')) {
      expect(t.getAttribute('type')).toBe('button');
    }
  });

  it('passes through className on root', () => {
    const { container } = render(
      <Tabs tabs={baseTabs} activeId="tech" onChange={vi.fn()} className="extra-class" />,
    );
    const root = container.querySelector('[role="tablist"]');
    expect(root?.className).toContain('atm-tabs');
    expect(root?.className).toContain('extra-class');
  });

  it('unrelated keys do not call onChange or preventDefault flow', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="tech" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'a' });
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('activeId not in tabs → keyboard nav is a no-op', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={baseTabs} activeId="ghost" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
