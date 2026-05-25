'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

const THRESHOLD = 600;

export type ScrollToTopProps = {
  /**
   * PR-BETA-6 hotfix #4 (THI-277, 2026-05-25): when the persistent
   * BottomTabBar is mounted for this request (cf.
   * `shouldMountBottomTabBar()`), the FAB's default `bottom-4` puts it
   * BEHIND the bar on iPhone Safari (smoke report @thierry 2026-05-25).
   * Pass `liftedForBottomBar={true}` from the parent layout to push the
   * FAB above the bar (h-12 + safe-area + a bit of air). The lift only
   * matters on mobile — desktop (≥ md) keeps the original offset
   * because the bar is `md:hidden`.
   */
  liftedForBottomBar?: boolean;
};

export function ScrollToTop({ liftedForBottomBar = false }: ScrollToTopProps) {
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

  // PR-D5 mobile-iOS: `bottom-4`/`bottom-6` overlapped the iPhone home
  // indicator (~34px reserved area). `max(…,env(safe-area-inset-bottom))`
  // lifts the FAB above the safe area on devices that report it.
  //
  // PR-BETA-6 hotfix #4: when the BottomTabBar mounts, add ~4.5rem (the
  // bar's h-12 + visual breathing room) to the bottom offset so the FAB
  // sits above the bar. Mobile lift only — `md:bottom-…` keeps the
  // original desktop offset because the bar is `md:hidden`.
  const mobileBottom = liftedForBottomBar
    ? 'bottom-[calc(env(safe-area-inset-bottom)+4.5rem)]'
    : 'bottom-[max(1rem,env(safe-area-inset-bottom))]';

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t('scrollToTop')}
      data-testid="scroll-to-top"
      data-lifted-for-bottom-bar={String(liftedForBottomBar)}
      className={`bg-brand-700 hover:bg-brand-800 focus-visible:ring-brand-600 ${mobileBottom} fixed right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:right-6 md:bottom-[max(1.5rem,env(safe-area-inset-bottom))]`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
