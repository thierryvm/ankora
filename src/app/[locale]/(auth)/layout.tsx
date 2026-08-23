import { Link } from '@/i18n/navigation';
import { AnkoraLogo } from '@/components/brand/AnkoraLogo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // `svh` et non `dvh` : la hauteur du conteneur ne doit pas suivre la barre
    // d'URL de Safari, sans quoi la page se reflowe à chaque défilement. Même
    // raison que les tiroirs (cf. ExpenseEditDrawer, mesuré le 2026-08-23), et
    // même unité que `body { min-height: 100svh }` dans globals.css.
    <div className="flex min-h-svh flex-col">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 md:px-6">
          <Link
            href="/"
            aria-label="Accueil Ankora"
            className="focus-visible:ring-brand-600 flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <AnkoraLogo className="h-8 w-auto" />
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-12 md:py-20">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
