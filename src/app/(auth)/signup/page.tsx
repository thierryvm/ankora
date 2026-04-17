import type { Metadata } from 'next';
import Link from 'next/link';

import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer mon cockpit</CardTitle>
        <CardDescription>Quelques secondes. Aucune carte bancaire.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex flex-col gap-3">
          <GoogleSignInButton label="Créer mon compte avec Google" />
          <p className="text-center text-xs text-(--color-muted-foreground)">
            En continuant avec Google, tu acceptes nos{' '}
            <Link href="/legal/cgu" className="underline hover:text-(--color-foreground)">
              CGU
            </Link>{' '}
            et notre{' '}
            <Link href="/legal/privacy" className="underline hover:text-(--color-foreground)">
              politique de confidentialité
            </Link>
            .
          </p>
          <div className="flex items-center gap-3 text-xs text-(--color-muted-foreground)">
            <span className="h-px flex-1 bg-(--color-border)" />
            <span>ou avec ton email</span>
            <span className="h-px flex-1 bg-(--color-border)" />
          </div>
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-(--color-muted-foreground)">
          Déjà un compte ?{' '}
          <Link href="/login" className="font-medium text-(--color-brand-700) hover:underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
