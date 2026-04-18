import type { Metadata } from 'next';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { ChargesClient } from './ChargesClient';

export const metadata: Metadata = { title: 'Mes charges' };

export default async function ChargesPage() {
  const snapshot = await getWorkspaceSnapshot();
  return <ChargesClient charges={snapshot.rawCharges} />;
}
