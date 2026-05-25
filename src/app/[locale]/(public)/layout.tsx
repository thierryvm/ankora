import { ScrollToTop } from '@/components/layout/ScrollToTop';
import { shouldMountBottomTabBar } from '@/lib/layout/bottom-tab-bar-state';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // PR-BETA-6 hotfix #4 (THI-277, 2026-05-25, @thierry iPhone smoke): the
  // ScrollToTop FAB was hidden behind the persistent BottomTabBar on iPhone
  // Safari for authenticated visitors on `/faq`, `/legal/*`, `/glossaire`.
  // Lift the FAB above the bar when the bar will mount; otherwise keep the
  // original safe-area-only offset.
  const liftedForBottomBar = await shouldMountBottomTabBar();
  return (
    <>
      {children}
      <ScrollToTop liftedForBottomBar={liftedForBottomBar} />
    </>
  );
}
