import type { Metadata } from 'next';
import Link from 'next/link';

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
