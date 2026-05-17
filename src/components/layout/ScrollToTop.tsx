'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

const THRESHOLD = 600;

export function ScrollToTop() {
  const t = useTranslations('ui');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t('scrollToTop')}
      // PR-D5 mobile-iOS: `bottom-4`/`bottom-6` overlapped the iPhone home
      // indicator (~34px reserved area). `max(…,env(safe-area-inset-bottom))`
      // lifts the FAB above the safe area on devices that report it, and
      // falls back to the original 1rem/1.5rem on devices without insets.
      className="bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:right-6 md:bottom-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
