import Link from 'next/link';

import { AnkoraLogo } from '@/components/brand/AnkoraLogo';
import { Button } from '@/components/ui/button';

type HeaderProps = {
  variant?: 'marketing' | 'app';
  isAuthenticated?: boolean;
};

export function Header({ variant = 'marketing', isAuthenticated = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-(--color-border) bg-(--color-background)/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href={isAuthenticated ? '/app' : '/'}
          aria-label="Accueil Ankora"
          className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-(--color-brand-600) focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <AnkoraLogo className="h-8 w-auto" />
        </Link>

        {variant === 'marketing' ? (
          <nav aria-label="Navigation principale" className="flex items-center gap-1 md:gap-2">
            <Link
              href="/#features"
              className="hidden rounded-md px-3 py-2 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground) md:inline-block"
            >
              Fonctionnalités
            </Link>
            <Link
              href="/faq"
              className="hidden rounded-md px-3 py-2 text-sm text-(--color-muted-foreground) hover:text-(--color-foreground) md:inline-block"
            >
              FAQ
            </Link>
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link href="/app">Mon cockpit</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Se connecter</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Créer un compte</Link>
                </Button>
              </>
            )}
          </nav>
        ) : (
          <nav aria-label="Navigation application" className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/app">Tableau de bord</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/accounts">Comptes</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/charges">Charges</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/settings">Paramètres</Link>
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
