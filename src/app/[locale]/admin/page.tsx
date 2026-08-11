import type { Metadata } from 'next';
import * as React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { countDeletionsNearBreach, countStuckDeletions } from '@/lib/gdpr/deletion';
import { log } from '@/lib/log';

export const metadata: Metadata = {
  title: 'Admin · Ankora',
  description: 'Internal admin area.',
  robots: { index: false, follow: false },
};

/**
 * Admin home. Until now a pure placeholder with no query at all — this is the
 * first one.
 *
 * ## Why this reads with the privileged client
 *
 * `deletion_requests` carries FORCE ROW LEVEL SECURITY with self-only policies,
 * so @thierry's own session sees ONLY @thierry's rows. Counting the queue is
 * therefore impossible from a normal session, and a founder-only screen that
 * silently showed `0` would be worse than no screen at all.
 *
 * The read is SEALED: `count: 'exact', head: true` selects zero columns, so no
 * identifier can reach this page — not a user id, not an email, not a request
 * id. `requireAdmin()` already guards the whole segment (admin/layout.tsx).
 *
 * ## Why the second counter is wider than the first
 *
 * Counter 1 answers "what should I look at". Counter 2 answers "what is about
 * to become a breach", and it covers EVERY non-terminal row — not just the
 * failed ones. A request starved by influx never becomes `failed`, and anyone
 * relaunching their own erasure every four days keeps it out of quarantine
 * indefinitely: in both cases counter 1 reads 0 while the art. 12(3) clock
 * keeps running. Narrowing counter 2 to `failed` would re-open that blind spot
 * without anyone noticing. See ADR-042 G6.
 */
export default async function AdminHomePage(): Promise<React.JSX.Element> {
  // Read independently, and a failure is DISPLAYED rather than folded into a
  // zero: an alarm that cannot distinguish "nothing to see" from "I could not
  // look" is the mute mechanism these counters exist to remove.
  const [stuck, nearBreach] = await Promise.all([
    countStuckDeletions().catch((error: unknown) => {
      log.error('Admin: failed to count stuck deletion requests', {
        error_message: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }),
    countDeletionsNearBreach().catch((error: unknown) => {
      log.error('Admin: failed to count deletion requests near breach', {
        error_message: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }),
  ]);

  const display = (value: number | null) => (value === null ? '—' : String(value));

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted-foreground text-sm">
          Zone admin · réservée fondateur. Panel V1 livré dans une PR ultérieure.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">File de suppression (RGPD art. 17)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demandes en quarantaine</CardTitle>
              <CardDescription>
                Cinq tentatives sur au moins cinq jours. Elles ne sont plus reprises automatiquement
                — la personne concernée peut annuler ou relancer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-semibold tabular-nums ${
                  stuck && stuck > 0 ? 'text-danger' : ''
                }`}
              >
                {display(stuck)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">À moins de 5 jours du manquement</CardTitle>
              <CardDescription>
                Toute demande non terminée déposée il y a plus de 25 jours, quel que soit son
                statut. L&apos;échéance légale est d&apos;un mois et elle ne s&apos;arrête jamais.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-semibold tabular-nums ${
                  nearBreach && nearBreach > 0 ? 'text-danger' : ''
                }`}
              >
                {display(nearBreach)}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </section>
  );
}
