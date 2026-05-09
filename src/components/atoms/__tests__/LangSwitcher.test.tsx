import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LangSwitcher, ANKORA_V1_LOCALES, type LangSwitcherLocale } from '../LangSwitcher';

const customLocales: readonly LangSwitcherLocale[] = [
  { id: 'fr-BE', code: 'FR', flag: '🇧🇪', label: 'Français (Belgique)' },
  { id: 'en', code: 'EN', flag: '🇬🇧', label: 'English' },
  { id: 'nl-BE', code: 'NL', flag: '🇧🇪', label: 'Nederlands (België)' },
  { id: 'de-DE', code: 'DE', flag: '🇩🇪', label: 'Deutsch' },
];

describe('<LangSwitcher /> (atom CD#3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closed by default → no listbox in DOM', () => {
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('click trigger → opens listbox (role="listbox" appears)', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('trigger has aria-haspopup="listbox" + aria-expanded reflects open state', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /changer de langue/i });
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // aria-controls only set when open
    expect(trigger.getAttribute('aria-controls')).not.toBeNull();
  });

  it('each locale renders as role="option" with aria-selected reflecting current', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    // FR-BE = current → aria-selected=true
    const frOption = options.find((o) => o.textContent?.includes('Français'));
    const enOption = options.find((o) => o.textContent?.includes('English'));
    expect(frOption?.getAttribute('aria-selected')).toBe('true');
    expect(enOption?.getAttribute('aria-selected')).toBe('false');
  });

  it('click option → onChange called with locale id, listbox closes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LangSwitcher current="fr-BE" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    const enOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('English'));
    expect(enOption).toBeDefined();
    if (enOption) {
      await user.click(enOption);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('en');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ESC keydown when open → closes listbox', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('mousedown outside trigger+listbox → closes', async () => {
    const user = userEvent.setup();
    render(
      <>
        <div data-testid="outside" style={{ width: 200, height: 200 }} />
        <LangSwitcher current="fr-BE" onChange={vi.fn()} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('mousedown INSIDE trigger does NOT close (re-toggle path)', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /changer de langue/i });
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // mousedown on trigger itself → listener short-circuits (no setOpen(false))
    fireEvent.mouseDown(trigger);
    // After mousedown, click handler still runs and toggles. We just assert
    // mousedown alone (no click) does NOT close from the listener path:
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('default locales = ANKORA_V1_LOCALES (FR-BE + EN, length 2)', async () => {
    const user = userEvent.setup();
    expect(ANKORA_V1_LOCALES).toHaveLength(2);
    expect(ANKORA_V1_LOCALES[0]?.id).toBe('fr-BE');
    expect(ANKORA_V1_LOCALES[1]?.id).toBe('en');
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('custom locales prop respected (4 locales → 4 options)', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" locales={customLocales} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByText('Nederlands (België)')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
  });

  it('trigger displays current flag + code (FR-BE)', () => {
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /changer de langue/i });
    expect(trigger.textContent).toContain('🇧🇪');
    expect(trigger.textContent).toContain('FR');
  });

  it('trigger displays current flag + code (EN)', () => {
    render(<LangSwitcher current="en" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /changer de langue/i });
    expect(trigger.textContent).toContain('🇬🇧');
    expect(trigger.textContent).toContain('EN');
  });

  it('unknown current locale → fallback globe + raw id', () => {
    render(<LangSwitcher current="zz-ZZ" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /changer de langue/i });
    expect(trigger.textContent).toContain('🌐');
    expect(trigger.textContent).toContain('zz-ZZ');
  });

  it('cleanup listeners on unmount → outside click after unmount is harmless', async () => {
    const user = userEvent.setup();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    unmount();
    // Both listeners removed (mousedown + keydown)
    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain('mousedown');
    expect(removedTypes).toContain('keydown');
  });

  it('custom ariaLabel respected on trigger + listbox', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} ariaLabel="Switch language" />);
    const trigger = screen.getByRole('button', { name: 'Switch language' });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole('listbox', { name: 'Switch language' })).toBeInTheDocument();
  });

  it('passes through className on root', () => {
    const { container } = render(
      <LangSwitcher current="fr-BE" onChange={vi.fn()} className="extra-class" />,
    );
    const root = container.querySelector('.atm-lang-switcher');
    expect(root?.className).toContain('atm-lang-switcher');
    expect(root?.className).toContain('extra-class');
  });

  it('toggle close via second click on trigger', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="fr-BE" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /changer de langue/i });
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selected option carries is-selected class', async () => {
    const user = userEvent.setup();
    render(<LangSwitcher current="en" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /changer de langue/i }));
    const enOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('English'));
    expect(enOption?.className).toContain('is-selected');
    const frOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('Français'));
    expect(frOption?.className).not.toContain('is-selected');
  });
});
