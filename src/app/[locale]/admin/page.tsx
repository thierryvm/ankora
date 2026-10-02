import type { Metadata } from 'next';
import * as React from 'react';

import { readAdminMetrics } from '@/lib/admin/metrics';
import { requireAdminOnce } from '@/lib/auth/require-admin-once';

import { AdminDashboard } from './_components/AdminDashboard';

export const metadata: Metadata = {
  title: 'Admin · Ankora',
  description: 'Internal admin area.',
  robots: { index: false, follow: false },
};

/**
 * Admin home: the v1 panel (audit of 1 October 2026, §3.3), four tabs fed by
 * `readAdminMetrics` only. The screen is `AdminDashboard`; why the read uses
 * the privileged client, and why each block fails on its own, is written in
 * `src/lib/admin/metrics.ts`.
 *
 * `requireAdmin()` guards the whole segment (admin/layout.tsx), and the page
 * awaits the same verdict before any read (`requireAdminOnce`): the layout
 * does not hold the page back, they render in parallel.
 */
export default async function AdminHomePage(): Promise<React.JSX.Element> {
  await requireAdminOnce();
  const metrics = await readAdminMetrics();
  return <AdminDashboard metrics={metrics} />;
}
