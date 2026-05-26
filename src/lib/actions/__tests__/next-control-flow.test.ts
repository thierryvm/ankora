import { describe, expect, it } from 'vitest';

import { isNextControlFlowError } from '../next-control-flow';

/**
 * Guard the contract that all Server Actions and Client Components rely on
 * to keep Next.js `redirect()` / `notFound()` flows working under a generic
 * try/catch. A regression here would silently swallow auth bounces across
 * the whole app — much higher blast radius than the unit-test suggests.
 */
describe('isNextControlFlowError', () => {
  it('detects errors whose digest starts with NEXT_REDIRECT', () => {
    const err = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    expect(isNextControlFlowError(err)).toBe(true);
  });

  it('detects errors whose digest starts with NEXT_NOT_FOUND', () => {
    const err = Object.assign(new Error('NEXT_NOT_FOUND'), {
      digest: 'NEXT_NOT_FOUND',
    });
    expect(isNextControlFlowError(err)).toBe(true);
  });

  it('falls back to the canonical message when no digest is attached', () => {
    expect(isNextControlFlowError(new Error('NEXT_REDIRECT'))).toBe(true);
    expect(isNextControlFlowError(new Error('NEXT_NOT_FOUND'))).toBe(true);
  });

  it('does not flag arbitrary application errors', () => {
    expect(isNextControlFlowError(new Error('boom'))).toBe(false);
    expect(isNextControlFlowError(new Error('Failed to fetch'))).toBe(false);
    expect(
      isNextControlFlowError(Object.assign(new Error('boom'), { digest: 'something-else' })),
    ).toBe(false);
  });

  it('does not flag non-Error throwables', () => {
    expect(isNextControlFlowError('NEXT_REDIRECT')).toBe(false);
    expect(isNextControlFlowError(null)).toBe(false);
    expect(isNextControlFlowError(undefined)).toBe(false);
    expect(isNextControlFlowError({ digest: 'NEXT_REDIRECT;...' })).toBe(false);
  });
});
