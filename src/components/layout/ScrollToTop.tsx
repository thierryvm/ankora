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
      className="fixed right-4 bottom-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-(--color-brand-700) text-white shadow-lg transition-colors hover:bg-(--color-brand-800) focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:ring-offset-2 focus-visible:outline-none md:right-6 md:bottom-6"
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
