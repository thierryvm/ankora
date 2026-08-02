import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { ScrollToTop } from '../ScrollToTop';

beforeEach(() => {
  cleanup();
  // The FAB only renders past the scroll threshold (600px); seed scrollY so
  // the assertions below can target the rendered button.
  Object.defineProperty(window, 'scrollY', { value: 800, writable: true, configurable: true });
});

afterEach(() => {
  cleanup();
});

describe('<ScrollToTop /> — PR-BETA-6 hotfix #4 lift-for-bottom-bar', () => {
  it('uses the default safe-area bottom offset when liftedForBottomBar is omitted', () => {
    render(<ScrollToTop />);
    // Dispatch a scroll event so the component flips `visible` to true.
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    const button = screen.getByTestId('scroll-to-top');
    expect(button).toHaveAttribute('data-lifted-for-bottom-bar', 'false');
    // Default mobile offset uses the safe-area inset only (no lift for bar).
    expect(button.className).toContain('bottom-[max(1rem,env(safe-area-inset-bottom))]');
  });

  it('lifts the FAB above the bar height + safe-area when liftedForBottomBar=true', () => {
    render(<ScrollToTop liftedForBottomBar />);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    const button = screen.getByTestId('scroll-to-top');
    expect(button).toHaveAttribute('data-lifted-for-bottom-bar', 'true');
    // Lifted: 4.5rem (bar h-12 + ~1rem air) + safe-area inset.
    expect(button.className).toContain('bottom-[calc(env(safe-area-inset-bottom)+4.5rem)]');
    // The desktop offset returns exactly where the bar goes away — `lg`, not
    // `md`. Restoring it at `md:` parked the FAB behind the bar for the whole
    // 768–1023 band, which is the same off-by-one-breakpoint mistake that hid
    // every navigation surface there (fixed 2026-08-02).
    expect(button.className).toContain('lg:bottom-');
    expect(button.className).not.toContain('md:bottom-');
  });
});
