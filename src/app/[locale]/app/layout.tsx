import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AppBreadcrumbs } from '@/components/layout/AppBreadcrumbs';
import { BottomTabBar } from '@/components/layout/BottomTabBar';
import { requireUser } from '@/lib/auth/require-user';
import { isAdmin } from '@/lib/auth/is-admin';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  // PR-BETA-6 (THI-277) — admin flag flows into BottomTabBar so the More
  // sheet exposes the admin entry to privileged sessions only. Same
  // server-side gate as Header.tsx — never trusted to the client.
  const userIsAdmin = await isAdmin();
  return (
    <>
      <Header variant="app" isAuthenticated />
      <AppBreadcrumbs />
      {/*
       * PR-BETA-6 (THI-277): the mobile BottomTabBar adds 48px + the iPhone
       * safe-area-inset-bottom at the foot of the viewport. Without an
       * equivalent bottom-padding the last row of cockpit content (CTA
       * buttons, transactions list) sits behind the bar. `pb-24` on mobile
       * (~96px = 48 bar + 32 air + ~16 safe-area) clears the bar even on
       * notched devices; `md:pb-12` restores the original desktop padding
       * (the bar is hidden ≥ 768px).
       */}
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-24 md:px-6 md:py-12">
        {children}
      </main>
      <Footer />
      <BottomTabBar isAdmin={userIsAdmin} />
    </>
  );
}
