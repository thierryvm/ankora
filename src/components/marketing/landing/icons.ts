/**
 * Landing icon proxy.
 *
 * Re-exports the subset of `lucide-react` icons consumed by the public
 * landing components (Hero, Principles, Feature, WhatIfDemo, Pricing,
 * FooterCTA, MktNav). Importing through this proxy:
 *
 * - Documents the contract — exactly nine glyphs match the cc-design
 *   `_shared/icons.jsx` set; any addition here is a deliberate landing
 *   surface change.
 * - Isolates landing from a future `lucide-react` swap (e.g. tree-shaking
 *   regression, fork, or migration) — only this file changes.
 * - Lets tests assert the contract via a single import path.
 *
 * Mirror: `design-exports/unpacked-v1/design_handoff_ankora_v1/ui_kits/_shared/icons.jsx`.
 */

export {
  ArrowRight,
  Check,
  Globe,
  Lock,
  PiggyBank,
  Shield,
  Sliders,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
