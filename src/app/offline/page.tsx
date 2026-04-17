import Link from 'next/link';

export const metadata = {
  title: 'Hors-ligne',
  description: 'Tu es actuellement hors-ligne. Reconnecte-toi pour accéder à Ankora.',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center"
    >
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Tu es hors-ligne</h1>
      <p className="mt-3 text-(--color-muted-foreground)">
        Reconnecte-toi pour accéder à ton cockpit. Tes données restent intactes.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-md bg-(--color-brand-700) px-5 py-2.5 text-sm font-medium text-white hover:bg-(--color-brand-800)"
      >
        Réessayer
      </Link>
    </main>
  );
}
