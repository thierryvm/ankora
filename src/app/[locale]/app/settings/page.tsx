import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { getCookieConsentAction } from '@/lib/actions/consent';
import { SettingsClient } from './SettingsClient';
import { CookiesPreferencesSection } from './CookiesPreferencesSection';

type Factor = { id: string; friendlyName: string | null; status: string };
type Deletion = { scheduledFor: string; status: string } | null;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.settings');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default async function SettingsPage() {
  const t = await getTranslations('app.settings');
  const user = await requireUser();
  const supabase = await createClient();

  const [profileRes, factorsRes, deletionRes, consentRes] = await Promise.all([
    supabase.from('users').select('display_name, email').eq('id', user.id).maybeSingle(),
    supabase.auth.mfa.listFactors(),
    supabase
      .from('deletion_requests')
      .select('scheduled_for, status')
      .eq('user_id', user.id)
      // ALL THREE active statuses. Filtering on 'pending' alone made `deletion`
      // null the moment a run claimed the request, so the danger zone re-showed
      // the REQUEST FORM and dropped the only link to the status screen —
      // exactly when the erasure had become irreversible. `failed` joins them
      // for the same reason (ADR-042 G7): a quarantined request is still a
      // request, and the screen where it can be cancelled or relaunched is only
      // reachable from here. `.maybeSingle()` stays safe precisely because
      // `deletion_requests_one_active_idx` covers those same three statuses.
      .in('status', ['pending', 'processing', 'failed'])
      .maybeSingle(),
    getCookieConsentAction(),
  ]);

  // `.all`, NOT `.totp`. The SDK only puts VERIFIED factors in the typed
  // buckets (`GoTrueClient._listFactors`), so reading `.totp` made an
  // unverified factor — an enrolment started and never confirmed — invisible
  // to this screen. Invisible, it could not be resumed OR removed, while it
  // still blocked every new enrolment with a name conflict. A state the
  // interface cannot see is a state the user cannot leave.
  const factors: Factor[] = (factorsRes.data?.all ?? [])
    .filter((f) => f.factor_type === 'totp')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status,
    }));

  const deletion: Deletion = deletionRes.data
    ? { scheduledFor: deletionRes.data.scheduled_for, status: deletionRes.data.status }
    : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('description')}</p>
      </header>

      <SettingsClient
        email={profileRes.data?.email ?? user.email ?? ''}
        displayName={profileRes.data?.display_name ?? ''}
        factors={factors}
        deletion={deletion}
        cookiesSection={
          <CookiesPreferencesSection
            initialServerSnapshot={consentRes.ok ? consentRes.data.snapshot : null}
          />
        }
      />
    </div>
  );
}
