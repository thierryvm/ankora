import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Connexion' };

type LoginPageProps = {
  searchParams: Promise<{ reset?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const resetDone = params.reset === 'done';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Se connecter</CardTitle>
        <CardDescription>Accède à ton cockpit financier.</CardDescription>
      </CardHeader>
      <CardContent>
        {resetDone && (
          <div
            role="status"
            className="mb-4 rounded-md border border-(--color-success) bg-(--color-success)/10 px-3 py-2 text-sm text-(--color-success)"
          >
            Mot de passe mis à jour. Tu peux te connecter.
          </div>
        )}
        <LoginForm />
        <div className="mt-6 flex flex-col gap-2 text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-(--color-muted-foreground) hover:text-(--color-foreground)"
          >
            Mot de passe oublié ?
          </Link>
          <p className="text-(--color-muted-foreground)">
            Pas encore de compte ?{' '}
            <Link href="/signup" className="font-medium text-(--color-brand-700) hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
