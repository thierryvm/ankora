import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { requireUser } from '@/lib/auth/require-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // `requireUser()` already runs the (cookie-deduped) Supabase session lookup
  // and the redirect guard. Capture its User so the Header's AccountButton can
  // show the signed-in identity without a second round-trip (PR-A).
  const user = await requireUser();
  // PR-BETA-6 Hotfix Option A v3 (THI-277, 2026-05-25): the BottomTabBar is
  // now mounted ONCE at the locale root `src/app/[locale]/layout.tsx` so it
  // stays mounted across in-app navigation (cockpit → admin → faq → legal).
  // The mount + isAdmin gating both live there; this layout only needs to
  // keep the cockpit chrome (Header, breadcrumbs, footer) and the bottom
  // padding that reserves space below the bar. That reserve now releases at
  // `lg:` rather than `md:` (2026-08-02): the bar hides at 1024px, so releasing
  // it at 768px put the last section of every page behind the bar for the
  // whole 768–1023 band.
  return (
    <>
      {/* AppBreadcrumbs removed (@thierry 2026-07-19): with the header nav
          already marking the active page, the breadcrumb bar read as a
          confusing "double menu" on every app page. The public glossary keeps
          its own breadcrumb (deep SEO pages, different context). */}
      <Header variant="app" isAuthenticated userEmail={user.email ?? null} />
      <main
        id="main"
        className="mx-auto w-full max-w-6xl px-4 pt-8 pb-24 md:px-6 md:pt-12 lg:py-12"
      >
        {children}
      </main>
      <Footer />
    </>
  );
}
