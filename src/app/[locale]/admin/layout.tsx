import * as React from 'react';

import { requireAdmin } from '@/lib/auth/require-admin';

import { AdminTopbar } from './_components/AdminTopbar';

/**
 * Admin section layout — requires admin user.
 *
 * Per CLAUDE.md project: "Admin auth: requireAdmin() basé sur user_id Thierry
 * initialement". The guard is `requireAdmin()` (allow-list ANKORA_ADMIN_USER_IDS).
 * Future PRs may move to workspace_members.role-based RBAC.
 *
 * The topbar is a Server Component (reads cookies + session SSR-side).
 * Client interactivity (locale switching) is wrapped via Client subcomponents.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  await requireAdmin();
  const { locale } = await params;

  return (
    <div className="min-h-svh">
      <AdminTopbar locale={locale} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
