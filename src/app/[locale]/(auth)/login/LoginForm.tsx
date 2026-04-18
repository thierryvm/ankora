'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/lib/actions/auth';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { useFieldErrorTranslator } from '@/lib/i18n/zod-errors';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const translateError = useActionErrorTranslator();
  const { translateField } = useFieldErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await loginAction(formData);
      if (!result.ok) {
        setError(translateError(result.errorCode));
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const emailError = translateField(fieldErrors, 'email');
  const passwordError = translateField(fieldErrors, 'password');

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
        />
        {emailError && <p className="text-xs font-medium text-(--color-danger)">{emailError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(passwordError)}
        />
        {passwordError && (
          <p className="text-xs font-medium text-(--color-danger)">{passwordError}</p>
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
