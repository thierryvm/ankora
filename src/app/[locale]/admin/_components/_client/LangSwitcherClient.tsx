'use client';

import * as React from 'react';

import { LangSwitcher } from '@/components/atoms';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * Client wrapper for the LangSwitcher atom — wires `onChange` to next-intl's
 * router. Required because the handler closes over `useRouter()` /
 * `usePathname()` hooks (Client-only) and cannot be defined Server-side
 * (function not serializable to RSC).
 *
 * Architecture (locked PR-D4-PHASE2-A C1 / verrouillé @thierry 2026-05-09):
 * the locale canonical lives in the URL (next-intl App Router), NOT in any
 * useState fallback. `router.replace(pathname, { locale: id })` rewrites the
 * URL with the new locale prefix and triggers a full re-render server-side
 * (so Server Components pick up the new `getTranslations()` namespace).
 *
 * The atom's `current` prop drives the visible flag/label and aria-checked
 * state; the consumer is fully controlled.
 */
export function LangSwitcherClient({
  currentLocale,
}: {
  readonly currentLocale: string;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (id: string): void => {
    // next-intl's typed router infers the locale enum from routing.ts —
    // the cast is safe because LangSwitcher's value list is constrained
    // to ANKORA_V1_LOCALES (FR-BE + EN), both members of LOCALES.
    router.replace(pathname, { locale: id as 'fr-BE' | 'nl-BE' | 'en' | 'es-ES' | 'de-DE' });
  };

  return <LangSwitcher current={currentLocale} onChange={handleChange} />;
}
