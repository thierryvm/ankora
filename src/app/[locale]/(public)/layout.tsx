import { ScrollToTop } from '@/components/layout/ScrollToTop';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ScrollToTop />
    </>
  );
}
