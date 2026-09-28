import type { FocusEvent } from 'react';

/**
 * Keeps the chip that takes the focus fully in view inside a sideways row
 * (`.ankora-rangee`). The row's `scroll-padding-inline` is its fade's width,
 * so `nearest` lands the chip clear of the fade: a focused chip is never
 * veiled. `instant`, because the document sets `scroll-behavior: smooth` and a
 * glide on every Tab would be motion nobody asked for. Engines without
 * `scrollIntoView` (jsdom) are skipped.
 */
export function keepFocusedChipInView(event: FocusEvent<HTMLElement>): void {
  const target = event.target;
  if (target instanceof HTMLElement && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }
}
