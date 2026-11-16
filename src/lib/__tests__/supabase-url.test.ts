import { describe, it, expect } from 'vitest';

import { isPlainHttpUrl, supabaseUrlSchema } from '@/lib/supabase-url';

describe('supabaseUrlSchema', () => {
  it.each([
    'https://abcdefghijklmnopqrst.supabase.co',
    'https://abcdefghijklmnopqrst.supabase.co/',
    'http://127.0.0.1:54421',
    'https://db.example.org:8443/rest',
  ])('accepts %s', (value) => {
    expect(supabaseUrlSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['a directive separator in the host', 'https://abcdefghijklmnopqrst.supabase.co;script-src'],
    ['a non-http scheme', 'ftp://abcdefghijklmnopqrst.supabase.co'],
    ['an IPv6 literal, which a CSP cannot name', 'http://[::1]:54421'],
    ['a value that is not a URL', 'abcdefghijklmnopqrst.supabase.co'],
  ])('rejects %s', (_label, value) => {
    expect(supabaseUrlSchema.safeParse(value).success).toBe(false);
    expect(isPlainHttpUrl(value)).toBe(false);
  });
});
