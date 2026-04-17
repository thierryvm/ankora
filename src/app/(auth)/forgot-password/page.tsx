import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>
          Renseigne ton email. Si un compte existe, tu recevras un lien de réinitialisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm text-(--color-muted-foreground)">
          <Link href="/login" className="hover:text-(--color-foreground)">
            ← Retour à la connexion
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
