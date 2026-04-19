'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordResetAction } from '@/lib/actions/auth';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const translateError = useActionErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction(formData);
      if (result.ok) {
        setSent(true);
      } else {
        setError(translateError(result.errorCode));
      }
    });
  }

  if (sent) {
    return (
      <div
        role="status"
        className="border-success bg-success/10 text-success rounded-md border px-3 py-3 text-sm"
      >
        {t('sentMessage')}
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

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
