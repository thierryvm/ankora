import { redirect } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { CancelDeletionButton } from './CancelDeletionButton';

export const metadata = {
  title: 'Statut de suppression',
  description: 'État de la demande de suppression de ton compte Ankora.',
};

export default async function DeletionStatusPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('deletion_requests')
    .select('requested_at, scheduled_for, status, cancelled_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) redirect('/app/settings');

  const scheduled = new Date(data.scheduled_for);
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.ceil((scheduled.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const requestedAt = new Date(data.requested_at).toLocaleString('fr-BE', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const scheduledAt = scheduled.toLocaleDateString('fr-BE', { dateStyle: 'long' });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Suppression du compte</h1>
        <p className="mt-1 text-(--color-muted-foreground)">
          État détaillé de ta demande et période d&apos;annulation.
        </p>
      </header>

      <Card className="border-(--color-danger)/40">
        <CardHeader>
          <CardTitle>
            Statut :{' '}
            <span
              className={
                data.status === 'pending'
                  ? 'text-(--color-warning)'
                  : data.status === 'cancelled'
                    ? 'text-(--color-success)'
                    : 'text-(--color-danger)'
              }
            >
              {data.status === 'pending'
                ? 'En attente'
                : data.status === 'cancelled'
                  ? 'Annulée'
                  : 'Complétée'}
            </span>
          </CardTitle>
          <CardDescription>Demandée le {requestedAt}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.status === 'pending' && (
            <>
              <dl className="grid gap-4 md:grid-cols-3">
                <div>
                  <dt className="text-xs text-(--color-muted-foreground)">Suppression prévue</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{scheduledAt}</dd>
                </div>
                <div>
                  <dt className="text-xs text-(--color-muted-foreground)">Jours restants</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {daysLeft} jour{daysLeft > 1 ? 's' : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-(--color-muted-foreground)">Logs audit</dt>
                  <dd className="mt-1 text-sm">Pseudonymisés, jamais supprimés</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <CancelDeletionButton />
                <Button asChild variant="outline">
                  <Link href="/app/settings">Retour aux paramètres</Link>
                </Button>
              </div>
            </>
          )}

          {data.status === 'cancelled' && (
            <p className="text-sm">
              Demande annulée
              {data.cancelled_at
                ? ` le ${new Date(data.cancelled_at).toLocaleDateString('fr-BE', { dateStyle: 'long' })}`
                : ''}
              . Ton compte est conservé.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
