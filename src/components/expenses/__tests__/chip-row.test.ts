import { describe, it, expect, vi } from 'vitest';
import type { FocusEvent } from 'react';

import { keepFocusedChipInView } from '../chip-row';

describe('keepFocusedChipInView', () => {
  it('scrolls the focused chip to the nearest edge, instantly', () => {
    const chip = document.createElement('button');
    const scroll = vi.fn();
    chip.scrollIntoView = scroll;
    keepFocusedChipInView({ target: chip } as unknown as FocusEvent<HTMLElement>);
    // `nearest` so the row's scroll-padding (its fade's width) is honoured;
    // `instant` so no glide is played on each Tab, reduced motion or not.
    expect(scroll).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    });
  });

  it('does nothing on an engine without scrollIntoView', () => {
    const chip = document.createElement('button');
    Object.defineProperty(chip, 'scrollIntoView', { value: undefined });
    expect(() =>
      keepFocusedChipInView({ target: chip } as unknown as FocusEvent<HTMLElement>),
    ).not.toThrow();
  });
});
