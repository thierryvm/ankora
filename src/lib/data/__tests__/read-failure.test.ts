import { describe, expect, it } from 'vitest';

import {
  DATA_READ_UNAVAILABLE_DIGEST,
  DataReadUnavailableError,
  assertReadable,
  describeReadFailure,
  isMissingRowError,
} from '../read-failure';

/**
 * One rule, two directions, and both directions have a real cost:
 *
 *   - Let a failed read through as "no row" and an established user is told
 *     their workspace is gone.
 *   - Treat "no row" as a failure and a genuinely new user gets a "service
 *     unavailable" screen instead of onboarding.
 *
 * So neither side is the safe default and both are asserted.
 */

const pgError = (code: string, message = 'boom') => ({ code, message, details: null, hint: null });

describe('assertReadable — a failed read is never an answer', () => {
  it('throws on a connection failure', () => {
    expect(() => assertReadable(pgError('08006', 'connection failure'), 'test')).toThrow(
      DataReadUnavailableError,
    );
  });

  it('throws on an RLS denial', () => {
    // A policy regression is exactly the case that used to read as "this user
    // has no workspace" — the rows exist, we are simply not allowed to see them.
    expect(() => assertReadable(pgError('42501', 'permission denied'), 'test')).toThrow(
      DataReadUnavailableError,
    );
  });

  it('throws on a statement timeout', () => {
    expect(() => assertReadable(pgError('57014', 'canceling statement'), 'test')).toThrow(
      DataReadUnavailableError,
    );
  });

  it('carries the call-site label and the digest the boundary needs', () => {
    const thrown = (() => {
      try {
        assertReadable(pgError('08006'), 'require-user: workspace_members');
        return null;
      } catch (e) {
        return e as DataReadUnavailableError;
      }
    })();

    expect(thrown?.where).toBe('require-user: workspace_members');
    expect(thrown?.digest).toBe(DATA_READ_UNAVAILABLE_DIGEST);
  });
});

describe('assertReadable — a successful read that found nothing IS an answer', () => {
  it('stays silent when there is no error at all', () => {
    // `.maybeSingle()` on zero rows: `{ data: null, error: null }`. The caller
    // must go on to its own `!data` branch — that branch is legitimate.
    expect(() => assertReadable(null, 'test')).not.toThrow();
    expect(() => assertReadable(undefined, 'test')).not.toThrow();
  });

  it('stays silent on PGRST116, which is `.single()` saying "no such row"', () => {
    expect(() =>
      assertReadable(pgError('PGRST116', 'JSON object requested, 0 rows returned'), 'test'),
    ).not.toThrow();
  });
});

describe('isMissingRowError', () => {
  it('recognises PGRST116 and nothing else', () => {
    expect(isMissingRowError(pgError('PGRST116'))).toBe(true);
    expect(isMissingRowError(pgError('PGRST301'))).toBe(false);
    expect(isMissingRowError(pgError('42501'))).toBe(false);
  });

  it.each([null, undefined, 'PGRST116', 42])('is false for the non-object %s', (value) => {
    expect(isMissingRowError(value)).toBe(false);
  });
});

describe('DATA_READ_UNAVAILABLE_DIGEST', () => {
  it('is the exact string the error boundary matches on', () => {
    expect(DATA_READ_UNAVAILABLE_DIGEST).toBe('ANKORA_DATA_READ_UNAVAILABLE');
  });

  it('is distinct from the auth digest, so the two screens cannot merge', () => {
    expect(DATA_READ_UNAVAILABLE_DIGEST).not.toBe('ANKORA_AUTH_BACKEND_UNAVAILABLE');
  });
});

describe('describeReadFailure', () => {
  it('keeps the code and drops the message', () => {
    // PostgREST echoes failing values back in `message`, and `@/lib/log` does
    // not redact free-text message fields.
    const shaped = describeReadFailure(pgError('42501', 'permission denied for user thierry@x.be'));
    expect(shaped).toEqual({ code: '42501' });
    expect(JSON.stringify(shaped)).not.toContain('thierry@x.be');
  });

  it('degrades without throwing on a non-object', () => {
    expect(describeReadFailure('nope')).toEqual({ kind: 'string' });
  });
});
