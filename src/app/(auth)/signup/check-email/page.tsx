import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Vérifie ton email' };

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--color-brand-100)">
          <Mail className="h-6 w-6 text-(--color-brand-700)" aria-hidden />
        </div>
        <CardTitle>Vérifie ta boîte mail</CardTitle>
        <CardDescription>
          Un lien de confirmation vient d&apos;être envoyé. Clique dessus pour activer ton compte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Retour à la connexion</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
