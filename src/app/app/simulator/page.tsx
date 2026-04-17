import type { Metadata } from 'next';

import { getWorkspaceSnapshot } from '@/lib/data/workspace-snapshot';
import { SimulatorClient } from './SimulatorClient';

export const metadata: Metadata = { title: 'Simulateur' };

export default async function SimulatorPage() {
  const snapshot = await getWorkspaceSnapshot();
  return <SimulatorClient charges={snapshot.rawCharges} />;
}
