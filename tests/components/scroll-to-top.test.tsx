import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { ScrollToTop } from '@/components/layout/ScrollToTop';
import messages from '../../messages/fr-BE.json';

function renderWithIntl(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      {children}
    </NextIntlClientProvider>,
  );
}

describe('<ScrollToTop />', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('is hidden when scrolled near the top', () => {
    renderWithIntl(<ScrollToTop />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('appears after scrolling past 600px', () => {
    renderWithIntl(<ScrollToTop />);
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 700 });
      window.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('scrolls to top with smooth behavior by default', () => {
    renderWithIntl(<ScrollToTop />);
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 });
      window.dispatchEvent(new Event('scroll'));
    });
    fireEvent.click(screen.getByRole('button'));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('respects prefers-reduced-motion', () => {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    renderWithIntl(<ScrollToTop />);
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 });
      window.dispatchEvent(new Event('scroll'));
    });
    fireEvent.click(screen.getByRole('button'));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
