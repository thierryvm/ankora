import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { ChargesClient } from './ChargesClient';

// PR-D5 i18n: was a hardcoded FR string — broke <title> on EN/NL/DE/ES locales.
// Mirrors the pattern already in `accounts/page.tsx` and `settings/page.tsx`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app.charges');
  return { title: t('title') };
}

export default async function ChargesPage() {
  const snapshot = await getWorkspaceSnapshot();
  return <ChargesClient charges={snapshot.rawCharges} />;
}
