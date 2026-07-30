'use server';

import { headers } from 'next/headers';
import { redirect as redirectToExternalUrl } from 'next/navigation';
import { getLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';

import { env } from '@/lib/env';
import { describeReadFailure } from '@/lib/data/read-failure';
import { createClient } from '@/lib/supabase/server';
import {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from '@/lib/schemas/auth';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit, mapRateLimitErrorToErrorCode } from '@/lib/security/rate-limit';
import { log } from '@/lib/log';
import type { ActionResult } from '@/lib/actions/types';

async function contextFromHeaders(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  return { ip, userAgent: h.get('user-agent') };
}

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const { ip, userAgent } = await contextFromHeaders();
  const identifier = ip ? `ip:${ip}` : 'anon';

  const rl = await rateLimit('auth', identifier);
  if (!rl.success) {
    await logAuditEvent(AuditEvent.AUTH_RATE_LIMITED, {
      userId: null,
      ipAddress: ip,
      userAgent,
    });
    return { ok: false, errorCode: mapRateLimitErrorToErrorCode(rl.reason) };
  }

  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
    acceptTos: formData.get('acceptTos') === 'on',
    acceptPrivacy: formData.get('acceptPrivacy') === 'on',
  });

  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    log.error('Signup failed', { error_code: error.code ?? 'unknown' });
    return { ok: false, errorCode: 'errors.auth.signupFailed' };
  }

  await logAuditEvent(AuditEvent.AUTH_SIGNUP, {
    userId: data.user?.id ?? null,
    ipAddress: ip,
    userAgent,
  });

  return redirect({ href: '/signup/check-email', locale: await getLocale() });
}

export async function signInWithGoogleAction(): Promise<ActionResult> {
  const { ip, userAgent } = await contextFromHeaders();
  const identifier = ip ? `ip:${ip}` : 'anon';

  const rl = await rateLimit('auth', identifier);
  if (!rl.success) {
    await logAuditEvent(AuditEvent.AUTH_RATE_LIMITED, { userId: null, ipAddress: ip, userAgent });
    return { ok: false, errorCode: mapRateLimitErrorToErrorCode(rl.reason) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error || !data?.url) {
    log.error('Google sign-in failed', { error_message: error?.message ?? 'no url' });
    return { ok: false, errorCode: 'errors.auth.googleFailed' };
  }

  // EXTERNAL URL — Google's consent screen. It must never go through the
  // locale-aware `redirect`: that one prefixes its `href`, which would turn an
  // absolute third-party URL into a broken same-origin path. Hence the explicit
  // alias — the distinction is load-bearing, not stylistic.
  redirectToExternalUrl(data.url);
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const { ip, userAgent } = await contextFromHeaders();
  const identifier = ip ? `ip:${ip}` : 'anon';

  const rl = await rateLimit('auth', identifier);
  if (!rl.success) {
    await logAuditEvent(AuditEvent.AUTH_RATE_LIMITED, {
      userId: null,
      ipAddress: ip,
      userAgent,
    });
    return { ok: false, errorCode: mapRateLimitErrorToErrorCode(rl.reason) };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.auth.invalidCredentials',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, errorCode: 'errors.auth.invalidCredentials' };
  }

  await logAuditEvent(AuditEvent.AUTH_LOGIN, { userId: data.user.id, ipAddress: ip, userAgent });

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', data.user.id)
    .maybeSingle();

  // A failed read must not be answered with "you have not onboarded". Sending a
  // returning user to /onboarding right after they signed in is how a blip on
  // one SELECT turns into "my budget is gone" — and this is the exact moment a
  // user is most likely to believe it, since they just proved who they are.
  //
  // So on a read failure we decline to conclude and route to /app instead. That
  // is self-correcting rather than optimistic: /app runs its own guard, which
  // now either finds the workspace, honestly reports it cannot read, or — for a
  // genuinely new user — redirects to /onboarding on a clean answer.
  // Truthiness, not `!== null`: a client with nothing to report may hand back
  // `undefined`, and treating that as a failure would route every sign-in to
  // /app — silently disabling onboarding for genuinely new users.
  const readFailed = Boolean(profileError);

  if (readFailed) {
    log.error('loginAction: users.onboarded_at unreadable, deferring to /app', {
      ...describeReadFailure(profileError),
    });
  }

  const onboarded = readFailed || profile?.onboarded_at != null;

  return redirect({
    href: onboarded ? '/app' : '/onboarding',
    locale: await getLocale(),
  });
}

export async function logoutAction(): Promise<void> {
  const { ip, userAgent } = await contextFromHeaders();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.auth.signOut();

  if (user) {
    await logAuditEvent(AuditEvent.AUTH_LOGOUT, { userId: user.id, ipAddress: ip, userAgent });
  }

  // Prefixed on purpose. The @thierry arbitration of 2026-07-25 ("`/` always
  // renders French") is about Accept-Language detection on an unprefixed URL,
  // not about an explicit redirect from a context where the locale is known.
  // Dropping an English user on the French landing right after logout is the
  // very bug this PR closes.
  return redirect({ href: '/', locale: await getLocale() });
}

export async function requestPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const { ip, userAgent } = await contextFromHeaders();
  const identifier = ip ? `ip:${ip}` : 'anon';

  const rl = await rateLimit('auth', identifier);
  if (!rl.success) {
    return { ok: false, errorCode: mapRateLimitErrorToErrorCode(rl.reason) };
  }

  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get('email'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  // Always succeed silently — never reveal if an email exists.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  await logAuditEvent(AuditEvent.AUTH_PASSWORD_RESET, { userId: null, ipAddress: ip, userAgent });

  return { ok: true };
}

export async function confirmPasswordResetAction(formData: FormData): Promise<ActionResult> {
  const { ip, userAgent } = await contextFromHeaders();

  const parsed = passwordResetConfirmSchema.safeParse({
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, errorCode: 'errors.auth.linkExpired' };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    log.error('Password reset confirmation failed', { error_code: error.code ?? 'unknown' });
    return { ok: false, errorCode: 'errors.auth.passwordResetFailed' };
  }

  await logAuditEvent(AuditEvent.AUTH_PASSWORD_RESET, {
    userId: user.id,
    ipAddress: ip,
    userAgent,
  });

  return redirect({ href: '/login?reset=done', locale: await getLocale() });
}
