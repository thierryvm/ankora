import type { Metadata } from 'next';

import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';

import { requireUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './OnboardingWizard';

export const metadata: Metadata = { title: 'Bienvenue' };

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.onboarded_at) return redirect({ href: '/app', locale: await getLocale() });

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-8 md:py-16">
      <OnboardingWizard />
    </div>
  );
}
