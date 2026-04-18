import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { requireUser } from '@/lib/auth/require-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <Header variant="app" isAuthenticated />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 md:py-12">
        {children}
      </main>
      <Footer />
    </>
  );
}
