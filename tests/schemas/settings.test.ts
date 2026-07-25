import { describe, it, expect } from 'vitest';
import {
  profileUpdateSchema,
  mfaVerifySchema,
  makeDeletionRequestSchema,
} from '@/lib/schemas/settings';

describe('profileUpdateSchema', () => {
  it('accepts and trims the display name', () => {
    const res = profileUpdateSchema.parse({ displayName: '  Thierry  ' });
    expect(res.displayName).toBe('Thierry');
  });

  /**
   * The language preference used to travel through this schema, which gave it
   * two writers: this one wrote `users.locale` only, while `setLocaleAction`
   * wrote the cookie AND revalidated the root layout. The Settings selector was
   * the casualty — it offered `fr-FR` / `en-GB`, absent from `LOCALES`, so every
   * choice but `fr-BE` failed validation, and even `fr-BE` changed nothing on
   * screen. `setLocaleAction` is now the single writer.
   *
   * These two specs replace the ones that asserted the opposite (locale
   * accepted, defaulted to `fr-BE`). Deleting them outright would have removed
   * the only trace that this contract changed on purpose.
   */
  it('ignores a locale sent by an older client instead of rejecting the request', () => {
    // Deploy skew: tabs on the previous bundle keep posting `locale`. The schema
    // is a plain `z.object`, so Zod strips unknown keys. Adding `.strict()`
    // would turn those tabs into hard validation failures.
    const res = profileUpdateSchema.parse({ displayName: 'Thierry', locale: 'fr-BE' });
    expect(res.displayName).toBe('Thierry');
    expect(res as Record<string, unknown>).not.toHaveProperty('locale');
  });

  it('never writes a default locale back', () => {
    // The old schema carried `.default('fr-BE')`. Left in place while the client
    // stopped sending the field, it would have silently reset the language on
    // every profile save.
    const res = profileUpdateSchema.parse({ displayName: 'Thierry' });
    expect(res as Record<string, unknown>).not.toHaveProperty('locale');
  });

  it('rejects empty name', () => {
    expect(profileUpdateSchema.safeParse({ displayName: '  ' }).success).toBe(false);
  });

  it('accepts a request whatever the stray locale value, since the field is gone', () => {
    // Formerly "rejects unknown locale". The rejection now belongs to
    // `setLocaleAction`, which validates against `LOCALES` on its own path.
    expect(profileUpdateSchema.safeParse({ displayName: 'N', locale: 'xx-ZZ' }).success).toBe(true);
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

describe('makeDeletionRequestSchema (email-as-keyword)', () => {
  const email = 'thierry@example.com';
  const schema = makeDeletionRequestSchema(email);

  it('accepts the exact user email', () => {
    expect(schema.safeParse({ confirm: 'thierry@example.com' }).success).toBe(true);
  });

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(schema.safeParse({ confirm: 'THIERRY@EXAMPLE.COM' }).success).toBe(true);
    expect(schema.safeParse({ confirm: '  thierry@example.com  ' }).success).toBe(true);
    expect(schema.safeParse({ confirm: 'Thierry@Example.Com' }).success).toBe(true);
  });

  it('rejects a different address', () => {
    expect(schema.safeParse({ confirm: 'someone@example.com' }).success).toBe(false);
    expect(schema.safeParse({ confirm: 'thierry@other.com' }).success).toBe(false);
  });

  it('rejects legacy locale keywords', () => {
    expect(schema.safeParse({ confirm: 'SUPPRIMER' }).success).toBe(false);
    expect(schema.safeParse({ confirm: 'DELETE' }).success).toBe(false);
    expect(schema.safeParse({ confirm: 'LÖSCHEN' }).success).toBe(false);
    expect(schema.safeParse({ confirm: 'ELIMINAR' }).success).toBe(false);
    expect(schema.safeParse({ confirm: 'VERWIJDER' }).success).toBe(false);
    expect(schema.safeParse({ confirm: 'VERWIJDEREN' }).success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(schema.safeParse({ confirm: '' }).success).toBe(false);
    expect(schema.safeParse({ confirm: '   ' }).success).toBe(false);
  });

  it('allows an optional reason, clamped to 500 chars', () => {
    expect(schema.safeParse({ confirm: email, reason: 'ok' }).success).toBe(true);
    const long = 'x'.repeat(501);
    expect(schema.safeParse({ confirm: email, reason: long }).success).toBe(false);
  });
});
