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
    // Mobile lift only — desktop md:bottom override is preserved either way.
    expect(button.className).toContain('md:bottom-');
  });
});
