import Link from 'next/link';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-(--color-border) bg-(--color-card)">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 md:px-6">
          <Link
            href="/"
            aria-label="Accueil Ankora"
            className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <AnkoraLogo className="h-8 w-auto" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 md:py-20">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
