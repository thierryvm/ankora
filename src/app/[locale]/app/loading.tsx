import { Card, CardContent } from '@/components/ui/card';

/**
 * Dashboard loading skeleton — Next.js App Router Suspense boundary.
 *
 * The dashboard page is a fully-blocking Server Component (it awaits
 * `getWorkspaceSnapshot()` + cockpit math before rendering). Without this
 * file the user saw a blank page during the fetch. This mirrors the real
 * structure (header + Situation hero + provisions gauge) so the perceived
 * load is structured, not empty. Purely decorative: `aria-busy` + an
 * sr-only status, every shimmer block is `aria-hidden`.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de ton cockpit…</span>

      {/* Header */}
      <header className="flex flex-col gap-2">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-9 w-64 max-w-full" />
      </header>

      {/* Situation hero */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-5 py-6">
          <Shimmer className="h-5 w-48 max-w-full" />
          <div className="flex flex-col gap-2">
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-10 w-40 max-w-full" />
            <Shimmer className="h-4 w-72 max-w-full" />
          </div>
          <Shimmer className="h-1.5 w-full rounded-full" />
          <div className="flex flex-col gap-3 pt-2">
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-4 w-5/6" />
            <Shimmer className="h-4 w-4/6" />
          </div>
        </CardContent>
      </Card>

      {/* Provisions gauge */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 py-6">
          <Shimmer className="h-4 w-40 max-w-full" />
          <Shimmer className="h-10 w-28" />
          <Shimmer className="h-2 w-full rounded-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`bg-surface-muted animate-pulse rounded-md ${className ?? ''}`} />
  );
}
