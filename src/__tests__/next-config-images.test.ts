// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

/**
 * The image optimizer stays closed. No component renders `next/image` (measured
 * on 31 October 2026), so `/_next/image` has nothing to serve; with
 * `unoptimized` it answers 404 instead of transforming images on demand.
 * The endpoint itself is covered by `e2e/security-headers.spec.ts`.
 */

// `createNextIntlPlugin(path)` returns `withNextIntl(config)`. Only the config
// literal is under test.
vi.mock('next-intl/plugin', () => ({ default: () => (config: unknown) => config }));

import nextConfig from '../../next.config';

describe('next.config images', () => {
  it('disables the optimizer and allows no remote source', () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
    expect(nextConfig.images?.remotePatterns).toBeUndefined();
    expect(nextConfig.images?.domains).toBeUndefined();
  });
});
