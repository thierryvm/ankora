'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signupAction } from '@/lib/actions/auth';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { useFieldErrorTranslator } from '@/lib/i18n/zod-errors';

export function SignupForm() {
  const t = useTranslations('auth.signup');
  const translateError = useActionErrorTranslator();
  const { translateField } = useFieldErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await signupAction(formData);
      if (!result.ok) {
        setError(translateError(result.errorCode));
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const emailError = translateField(fieldErrors, 'email');
  const passwordError = translateField(fieldErrors, 'password');
  const passwordConfirmError = translateField(fieldErrors, 'passwordConfirm');
  const acceptTosError = translateField(fieldErrors, 'acceptTos');
  const acceptPrivacyError = translateField(fieldErrors, 'acceptPrivacy');

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? 'email-error' : undefined}
        />
        {emailError && (
          <p id="email-error" className="text-danger text-xs font-medium">
            {emailError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordError)}
          aria-describedby="password-hint password-error"
        />
        <p id="password-hint" className="text-muted-foreground text-xs">
          {t('passwordHint')}
        </p>
        {passwordError && (
          <p id="password-error" className="text-danger text-xs font-medium">
            {passwordError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="passwordConfirm">{t('passwordConfirmLabel')}</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordConfirmError)}
        />
        {passwordConfirmError && (
          <p className="text-danger text-xs font-medium">{passwordConfirmError}</p>
        )}
      </div>

      <label className="text-muted-foreground flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="acceptTos"
          required
          className="border-border text-brand-700 focus:ring-brand-600 mt-1 h-4 w-4 rounded"
        />
        <span>
          {t('acceptTosPrefix')}{' '}
          <Link href="/legal/cgu" className="text-brand-700 underline">
            {t('acceptTosLink')}
          </Link>
        </span>
      </label>
      {acceptTosError && <p className="text-danger text-xs font-medium">{acceptTosError}</p>}

      <label className="text-muted-foreground flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="acceptPrivacy"
          required
          className="border-border text-brand-700 focus:ring-brand-600 mt-1 h-4 w-4 rounded"
        />
        <span>
          {t('acceptPrivacyPrefix')}{' '}
          <Link href="/legal/privacy" className="text-brand-700 underline">
            {t('acceptPrivacyLink')}
          </Link>
        </span>
      </label>
      {acceptPrivacyError && (
        <p className="text-danger text-xs font-medium">{acceptPrivacyError}</p>
      )}

      {error && (
        <div
          role="alert"
          className="border-danger bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
