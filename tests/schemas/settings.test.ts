import { describe, it, expect } from 'vitest';
import {
  profileUpdateSchema,
  mfaVerifySchema,
  deletionRequestSchema,
} from '@/lib/schemas/settings';

describe('profileUpdateSchema', () => {
  it('accepts trimmed display name and known locale', () => {
    const res = profileUpdateSchema.parse({
      displayName: '  Thierry  ',
      locale: 'fr-BE',
    });
    expect(res.displayName).toBe('Thierry');
    expect(res.locale).toBe('fr-BE');
  });

  it('defaults locale to fr-BE when omitted', () => {
    const res = profileUpdateSchema.parse({ displayName: 'Name' });
    expect(res.locale).toBe('fr-BE');
  });

  it('rejects empty name', () => {
    expect(profileUpdateSchema.safeParse({ displayName: '  ' }).success).toBe(false);
  });

  it('rejects unknown locale', () => {
    expect(profileUpdateSchema.safeParse({ displayName: 'N', locale: 'xx-ZZ' }).success).toBe(
      false,
    );
  });
});

describe('mfaVerifySchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts 6-digit code with valid uuid', () => {
    expect(mfaVerifySchema.safeParse({ factorId: validUuid, code: '123456' }).success).toBe(true);
  });

  it('rejects non-numeric or wrong-length codes', () => {
    expect(mfaVerifySchema.safeParse({ factorId: validUuid, code: '12345' }).success).toBe(false);
    expect(mfaVerifySchema.safeParse({ factorId: validUuid, code: '1234567' }).success).toBe(false);
    expect(mfaVerifySchema.safeParse({ factorId: validUuid, code: 'abcdef' }).success).toBe(false);
  });

  it('rejects malformed factorId', () => {
    expect(mfaVerifySchema.safeParse({ factorId: 'not-a-uuid', code: '123456' }).success).toBe(
      false,
    );
  });
});

describe('deletionRequestSchema', () => {
  it('requires the exact confirmation literal', () => {
    expect(deletionRequestSchema.safeParse({ confirm: 'SUPPRIMER' }).success).toBe(true);
    expect(deletionRequestSchema.safeParse({ confirm: 'supprimer' }).success).toBe(false);
    expect(deletionRequestSchema.safeParse({ confirm: 'DELETE' }).success).toBe(false);
  });

  it('allows an optional reason, clamped to 500 chars', () => {
    const long = 'x'.repeat(501);
    expect(deletionRequestSchema.safeParse({ confirm: 'SUPPRIMER', reason: 'ok' }).success).toBe(
      true,
    );
    expect(deletionRequestSchema.safeParse({ confirm: 'SUPPRIMER', reason: long }).success).toBe(
      false,
    );
  });
});
