import { requireUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';

type Factor = { id: string; friendlyName: string | null; status: string };
type Deletion = { scheduledFor: string; status: string } | null;

export const metadata = {
  title: 'Paramètres',
  description: 'Gère ton profil, la sécurité 2FA et tes données personnelles.',
};

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [profileRes, factorsRes, deletionRes] = await Promise.all([
    supabase.from('users').select('display_name, locale, email').eq('id', user.id).maybeSingle(),
    supabase.auth.mfa.listFactors(),
    supabase
      .from('deletion_requests')
      .select('scheduled_for, status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle(),
  ]);

  const factors: Factor[] = (factorsRes.data?.totp ?? []).map((f) => ({
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
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Paramètres</h1>
        <p className="mt-1 text-(--color-muted-foreground)">
          Profil, sécurité et données personnelles.
        </p>
      </header>

      <SettingsClient
        email={profileRes.data?.email ?? user.email ?? ''}
        displayName={profileRes.data?.display_name ?? ''}
        locale={profileRes.data?.locale ?? 'fr-BE'}
        factors={factors}
        deletion={deletion}
      />
    </div>
  );
}
