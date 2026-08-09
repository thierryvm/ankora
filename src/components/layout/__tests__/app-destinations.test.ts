// @vitest-environment node
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  APP_DESTINATIONS,
  MOBILE_SHEET_DESTINATIONS,
  MOBILE_TAB_DESTINATIONS,
  MOBILE_TAB_ITEMS,
  isDestinationActive,
  type AppDestination,
} from '../app-destinations';

/**
 * Anti-drift guard — the whole point of the registry.
 *
 * `/app/commitments` shipped without ever reaching the mobile navigation: it was
 * declared in the desktop header only, so on mobile the page existed but could
 * not be navigated to. Nothing failed, because nothing checked. This suite is
 * that check, in both directions:
 *
 *   route folder → registry   a new route that nobody wired up
 *   registry → route folder   a destination whose route was deleted, which
 *                             would render a 404 link on all three surfaces
 *
 * Runs in the `node` environment (the project default is jsdom) because it
 * reads the filesystem.
 */

const APP_ROUTES_DIR = fileURLToPath(new URL('../../../app/[locale]/app/', import.meta.url));

/** Route folder names Next treats as real segments, at depth 1 only. */
function realRouteSegments(): string[] {
  return (
    readdirSync(APP_ROUTES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // Route groups `(x)`, private folders `_x`, parallel routes `@x` and
      // dynamic segments `[x]` are not navigable destinations.
      .filter((entry) => !/^[([@_]/.test(entry.name))
      // A folder without `page.tsx` is not a route (e.g. a components-only dir).
      .filter((entry) => existsSync(join(APP_ROUTES_DIR, entry.name, 'page.tsx')))
      .map((entry) => entry.name)
  );
}

/**
 * The route folder a destination points at.
 *
 * Compares the SEGMENT, never the id: `bills` lives at `charges` (see the note
 * on `AppDestinationId`). Matching on `id` would fail on it and push someone to
 * rename it, breaking the `data-testid`s the e2e suite asserts on.
 *
 * There used to be a second such case, `simulate` at `simulator`. The route was
 * removed on 2026-08-08 — the rule survives it, because one divergence is
 * already enough to make id-matching wrong.
 */
const segmentOf = (destination: AppDestination) => destination.href.replace('/app/', '');

describe('app destinations — registry and routes cannot drift apart', () => {
  it('declares a destination for every route under /app', () => {
    const segments = realRouteSegments();
    const declared = new Set(APP_DESTINATIONS.map(segmentOf));

    const missing = segments.filter((segment) => !declared.has(segment));
    expect(
      missing,
      `route(s) with no entry in APP_DESTINATIONS — they would be unreachable from ` +
        `the navigation, which is how /app/commitments went missing on mobile`,
    ).toEqual([]);
  });

  it('points every destination at a route that exists', () => {
    const segments = new Set(realRouteSegments());

    const dangling = APP_DESTINATIONS.filter((destination) => {
      // The cockpit root is `src/app/[locale]/app/page.tsx`, not a sub-folder.
      if (destination.href === '/app') return false;
      return !segments.has(segmentOf(destination));
    }).map((destination) => destination.href);

    expect(
      dangling,
      'destination(s) pointing at a deleted route — every surface would render a 404 link',
    ).toEqual([]);
  });

  it('keeps the cockpit root reachable', () => {
    expect(existsSync(join(APP_ROUTES_DIR, 'page.tsx'))).toBe(true);
    expect(APP_DESTINATIONS.some((d) => d.href === '/app')).toBe(true);
  });
});

describe('app destinations — shape invariants', () => {
  it('has unique ids and unique hrefs', () => {
    expect(new Set(APP_DESTINATIONS.map((d) => d.id)).size).toBe(APP_DESTINATIONS.length);
    expect(new Set(APP_DESTINATIONS.map((d) => d.href)).size).toBe(APP_DESTINATIONS.length);
  });

  it('splits into the two mobile placements without losing or duplicating anything', () => {
    expect([...MOBILE_TAB_DESTINATIONS, ...MOBILE_SHEET_DESTINATIONS]).toHaveLength(
      APP_DESTINATIONS.length,
    );
  });

  /**
   * Five slots, Apple HIG hard cap. The composition changed on 2026-07-29
   * (décision Q7): three destinations + the ⊕ action + the « Plus » button,
   * where it used to be four destinations + « Plus ». `simulate` moved to the
   * More sheet to free the slot — and left the navigation entirely on
   * 2026-08-08, when its route was removed in favour of the cockpit drawer.
   */
  it('keeps the bottom bar at three destinations — ⊕ and "Plus" take the other two slots', () => {
    expect(MOBILE_TAB_DESTINATIONS).toHaveLength(3);
  });

  it('renders exactly four registry-driven slots, the fifth being the "more" button', () => {
    expect(MOBILE_TAB_ITEMS).toHaveLength(4);
  });

  it('puts the ⊕ at the CENTRE of the five slots — the whole point of the decision', () => {
    // Index 2 of [tab, tab, ⊕, tab] + the bar's own « Plus » = the middle of 5.
    expect(MOBILE_TAB_ITEMS[2]).toEqual({ kind: 'action', id: 'addExpense' });
  });

  it('loses no tab destination when the ⊕ is spliced in', () => {
    const destinations = MOBILE_TAB_ITEMS.filter((item) => item.kind === 'destination');
    expect(destinations.map((d) => d.id)).toEqual(MOBILE_TAB_DESTINATIONS.map((d) => d.id));
  });

  it('keeps the ⊕ out of APP_DESTINATIONS — it has no route, and the guard must stay total', () => {
    // Giving it a fake href to fit the shape would have meant loosening the
    // filesystem check that exists to stop a route going unreachable.
    expect(APP_DESTINATIONS.map((d) => d.id)).not.toContain('addExpense');
  });

  it('matches the cockpit root exactly so it does not light up on sub-routes', () => {
    const cockpit = APP_DESTINATIONS.find((d) => d.id === 'cockpit');
    expect(cockpit?.match).toBe('exact');
  });

  it('reaches Engagements from the mobile navigation — the reported bug', () => {
    expect(MOBILE_SHEET_DESTINATIONS.map((d) => d.id)).toContain('commitments');
  });
});

describe('isDestinationActive', () => {
  const cockpit = APP_DESTINATIONS.find((d) => d.id === 'cockpit')!;
  const charges = APP_DESTINATIONS.find((d) => d.id === 'bills')!;

  it('matches the cockpit only on its exact path', () => {
    expect(isDestinationActive('/app', cockpit)).toBe(true);
    expect(isDestinationActive('/app/charges', cockpit)).toBe(false);
  });

  it('matches a section on its own path and its sub-routes', () => {
    expect(isDestinationActive('/app/charges', charges)).toBe(true);
    expect(isDestinationActive('/app/charges/123', charges)).toBe(true);
  });

  it('does not match a sibling route sharing a prefix', () => {
    expect(isDestinationActive('/app/charges-archive', charges)).toBe(false);
  });
});
