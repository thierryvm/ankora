import { describe, expect, it } from 'vitest';

import { cn } from '../utils';

/**
 * Contract tests for the `cn()` utility.
 *
 * Born from PR-D4-PHASE2-A C2 (Drawer + Tabs deterministic className concat
 * bugs — `${cond ? 'is-X' : ''}` without leading space) and C3 (tech debt:
 * 11 atoms duplicated `[...].filter(Boolean).join(' ')` patterns).
 *
 * The atom call sites pass:
 *   cn('atm-X', className)                  // optional className passthrough
 *   cn('drw-Y', cond && 'is-Z')             // conditional modifier
 *   cn('atm-X', cond ? 'is-Z' : '')         // ternary modifier
 *
 * These tests pin the contract so a future refactor (replacing clsx+twMerge,
 * narrowing the signature, etc.) cannot silently break the 12 atom call sites.
 */
describe('cn() — class-name utility', () => {
  it('joins multiple string args with a single space', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops boolean false segments', () => {
    expect(cn('a', false, 'b')).toBe('a b');
  });

  it('drops null and undefined segments (optional className passthrough)', () => {
    expect(cn('a', null, undefined, 'b')).toBe('a b');
  });

  it('keeps conditional class when truthy (ternary atom pattern)', () => {
    const isActive = true;
    expect(cn('atm-tab', isActive ? 'is-active' : '')).toBe('atm-tab is-active');
  });

  it('drops conditional class when falsy (ternary atom pattern)', () => {
    const isActive = false;
    expect(cn('atm-tab', isActive ? 'is-active' : '')).toBe('atm-tab');
  });

  it('returns empty string when given no truthy input', () => {
    expect(cn()).toBe('');
    expect(cn(false, null, undefined, '')).toBe('');
  });
});
