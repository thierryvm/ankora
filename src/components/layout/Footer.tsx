import Link from 'next/link';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';

export function Footer() {
  return (
    <footer className="border-t border-(--color-border) bg-(--color-card)">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 md:flex-row md:items-center md:px-6">
        <div className="flex items-center gap-2">
          <AnkoraLogo className="h-7 w-auto" />
          <span className="text-sm text-(--color-muted-foreground)">
            © {new Date().getFullYear()} — Tous droits réservés
          </span>
        </div>
        <nav aria-label="Pied de page" className="flex flex-wrap gap-4 text-sm">
          <Link href="/legal/cgu" className="text-(--color-muted-foreground) hover:underline">
            CGU
          </Link>
          <Link href="/legal/privacy" className="text-(--color-muted-foreground) hover:underline">
            Confidentialité
          </Link>
          <Link href="/legal/cookies" className="text-(--color-muted-foreground) hover:underline">
            Gérer les cookies
          </Link>
          <Link href="/faq" className="text-(--color-muted-foreground) hover:underline">
            FAQ
          </Link>
        </nav>
      </div>
    </footer>
  );
}
