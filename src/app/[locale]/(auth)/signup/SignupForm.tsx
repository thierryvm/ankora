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
          <p id="email-error" className="text-xs font-medium text-(--color-danger)">
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
        <p id="password-hint" className="text-xs text-(--color-muted-foreground)">
          {t('passwordHint')}
        </p>
        {passwordError && (
          <p id="password-error" className="text-xs font-medium text-(--color-danger)">
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
          <p className="text-xs font-medium text-(--color-danger)">{passwordConfirmError}</p>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-(--color-muted-foreground)">
        <input
          type="checkbox"
          name="acceptTos"
          required
          className="mt-1 h-4 w-4 rounded border-(--color-border) text-(--color-brand-700) focus:ring-(--color-brand-600)"
        />
        <span>
          {t('acceptTosPrefix')}{' '}
          <Link href="/legal/cgu" className="text-(--color-brand-700) underline">
            {t('acceptTosLink')}
          </Link>
        </span>
      </label>
      {acceptTosError && (
        <p className="text-xs font-medium text-(--color-danger)">{acceptTosError}</p>
      )}

      <label className="flex items-start gap-2 text-sm text-(--color-muted-foreground)">
        <input
          type="checkbox"
          name="acceptPrivacy"
          required
          className="mt-1 h-4 w-4 rounded border-(--color-border) text-(--color-brand-700) focus:ring-(--color-brand-600)"
        />
        <span>
          {t('acceptPrivacyPrefix')}{' '}
          <Link href="/legal/privacy" className="text-(--color-brand-700) underline">
            {t('acceptPrivacyLink')}
          </Link>
        </span>
      </label>
      {acceptPrivacyError && (
        <p className="text-xs font-medium text-(--color-danger)">{acceptPrivacyError}</p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md border border-(--color-danger) bg-(--color-danger)/10 px-3 py-2 text-sm text-(--color-danger)"
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
