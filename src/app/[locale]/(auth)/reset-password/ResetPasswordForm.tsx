'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmPasswordResetAction } from '@/lib/actions/auth';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { useFieldErrorTranslator } from '@/lib/i18n/zod-errors';

export function ResetPasswordForm() {
  const t = useTranslations('auth.reset');
  const translateError = useActionErrorTranslator();
  const { translateField } = useFieldErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await confirmPasswordResetAction(formData);
      if (!result.ok) {
        setError(translateError(result.errorCode));
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const passwordError = translateField(fieldErrors, 'password');
  const passwordConfirmError = translateField(fieldErrors, 'passwordConfirm');

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordError)}
        />
        {passwordError && (
          <p className="text-xs font-medium text-(--color-danger)">{passwordError}</p>
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
