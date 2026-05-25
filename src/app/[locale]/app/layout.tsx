import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AppBreadcrumbs } from '@/components/layout/AppBreadcrumbs';
import { requireUser } from '@/lib/auth/require-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  // PR-BETA-6 Hotfix Option A v3 (THI-277, 2026-05-25): the BottomTabBar is
  // now mounted ONCE at the locale root `src/app/[locale]/layout.tsx` so it
  // stays mounted across in-app navigation (cockpit → admin → faq → legal).
  // The mount + isAdmin gating both live there; this layout only needs to
  // keep the cockpit chrome (Header, breadcrumbs, footer) and the
  // `pb-24 md:py-12` main padding that reserves space below the bar on
  // mobile (the bar is `md:hidden`, so desktop keeps the original `py-12`).
  return (
    <>
      <Header variant="app" isAuthenticated />
      <AppBreadcrumbs />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-24 md:px-6 md:py-12">
        {children}
      </main>
      <Footer />
    </>
  );
}
