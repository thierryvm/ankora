import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { elevationDue } from '@/lib/auth/require-elevated';
import { ChallengeForm } from './ChallengeForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfaChallenge');
  return { title: t('metaTitle') };
}

/**
 * The screen that asks for the second factor at sign-in.
 *
 * It calls NEITHER `requireUser()` NOR `redirectIfSignedIn()`, and that is
 * load-bearing: `requireUser()` is what sends people here, so using it would
 * bounce this page against itself, and `redirectIfSignedIn()` would push an
 * aal1 session straight back to `/app`. Its guard is written out below instead
 * — three lines, and each one is a route out of this screen rather than into it.
 */
export default async function MfaChallengePage() {
  const t = await getTranslations('auth.mfaChallenge');
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Nobody signed in: this screen has nothing to challenge.
  // `return` is not cosmetic — it is what narrows `user` for the call below.
  if (!user) return redirect({ href: '/login', locale });

  // Signed in and nothing owed — either no factor at all, or already elevated.
  // Without this branch the screen would be a dead end for anyone who typed the
  // URL, and a loop for anyone who just passed the challenge.
  if (!(await elevationDue(supabase, user))) redirect({ href: '/app', locale });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChallengeForm />
      </CardContent>
    </Card>
  );
}
