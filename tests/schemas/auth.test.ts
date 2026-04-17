import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  passwordSchema,
  emailSchema,
} from '@/lib/schemas/auth';

describe('emailSchema', () => {
  it('accepts valid email and lowercases it', () => {
    const parsed = emailSchema.parse('  User@Example.COM ');
    expect(parsed).toBe('user@example.com');
  });

  it('rejects empty / invalid strings', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('requires 12+ chars, mixed case, digit', () => {
    expect(passwordSchema.safeParse('Short1A').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase12').success).toBe(false);
    expect(passwordSchema.safeParse('ALLUPPERCASE12').success).toBe(false);
    expect(passwordSchema.safeParse('NoDigitsEver').success).toBe(false);
    expect(passwordSchema.safeParse('ValidPass1234').success).toBe(true);
  });

  it('rejects 129+ characters', () => {
    const tooLong = 'Aa1' + 'x'.repeat(126);
    expect(passwordSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('signupSchema', () => {
  const baseValid = {
    email: 'user@example.com',
    password: 'ValidPass1234',
    passwordConfirm: 'ValidPass1234',
    acceptTos: true,
    acceptPrivacy: true,
  };

  it('accepts a valid signup payload', () => {
    expect(signupSchema.safeParse(baseValid).success).toBe(true);
  });

  it('rejects mismatched password confirmation', () => {
    const res = signupSchema.safeParse({ ...baseValid, passwordConfirm: 'Different1234' });
    expect(res.success).toBe(false);
  });

  it('rejects unchecked TOS or privacy', () => {
    expect(signupSchema.safeParse({ ...baseValid, acceptTos: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...baseValid, acceptPrivacy: false }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid email + non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: 'anything' }).success).toBe(
      true,
    );
  });

  it('rejects empty password', () => {
    expect(loginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
  });
});

describe('passwordReset schemas', () => {
  it('request: requires valid email', () => {
    expect(passwordResetRequestSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    expect(passwordResetRequestSchema.safeParse({ email: '' }).success).toBe(false);
  });

  it('confirm: matches + meets policy', () => {
    const ok = passwordResetConfirmSchema.safeParse({
      password: 'ValidPass1234',
      passwordConfirm: 'ValidPass1234',
    });
    expect(ok.success).toBe(true);

    const mismatch = passwordResetConfirmSchema.safeParse({
      password: 'ValidPass1234',
      passwordConfirm: 'DifferentX999',
    });
    expect(mismatch.success).toBe(false);
  });
});
