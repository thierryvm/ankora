import { describe, expect, it } from 'vitest';

import { safeNextPath } from '../safe-next';

describe('safeNextPath — where a sign-in may send you back to', () => {
  it('keeps an internal app path, with its query and hash', () => {
    expect(safeNextPath('/app/accounts?month=2026-09#soldes')).toBe(
      '/app/accounts?month=2026-09#soldes',
    );
  });

  it('strips a locale prefix: the redirect re-applies the current locale itself', () => {
    expect(safeNextPath('/en/app/accounts')).toBe('/app/accounts');
    expect(safeNextPath('/fr-BE/app')).toBe('/app');
    expect(safeNextPath('/nl-BE/app/expenses?x=1')).toBe('/app/expenses?x=1');
  });

  it.each([
    ['protocol-relative', '//evil.example.com'],
    ['backslash host (browsers read it as //)', '/\\evil.example.com'],
    ['mixed slashes', '/\\/evil.example.com'],
    ['absolute URL', 'https://evil.example.com/app'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative path', 'app/accounts'],
    ['encoded protocol-relative', '/%2F%2Fevil.example.com'],
    ['tab inside the host', '/\t/evil.example.com'],
    ['empty', ''],
  ])('refuses %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });

  it('refuses a non-string (missing form field)', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it('refuses the auth pages themselves (no loop back to the sign-in form)', () => {
    expect(safeNextPath('/login')).toBeNull();
    expect(safeNextPath('/en/login?next=/app')).toBeNull();
    expect(safeNextPath('/signup')).toBeNull();
    expect(safeNextPath('/auth/callback?code=x')).toBeNull();
  });

  it('refuses an overlong value', () => {
    expect(safeNextPath(`/app/${'a'.repeat(600)}`)).toBeNull();
  });
});
