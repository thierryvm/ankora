import type { Metadata } from 'next';
import * as React from 'react';

export const metadata: Metadata = {
  title: 'Admin · Ankora',
  description: 'Internal admin area.',
  robots: { index: false, follow: false },
};

/**
 * Admin home — minimal placeholder for PR-D4-PHASE2-B.
 *
 * Real admin panel V1 (Santé technique + Santé produit + Acquisition +
 * Recommandations rule-based) lands in PR-D4-PHASE2-B follow-up or PR-B2
 * per ROADMAP.md. This page exists so the topbar consumer integration has
 * a canvas (allows E2E tests to navigate `/[locale]/admin`).
 */
export default function AdminHomePage(): React.JSX.Element {
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted-foreground text-sm">
          Zone admin · réservée fondateur. Panel V1 livré dans une PR ultérieure.
        </p>
      </header>
    </section>
  );
}
