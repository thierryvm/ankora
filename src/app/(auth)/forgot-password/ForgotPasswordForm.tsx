'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordResetAction } from '@/lib/actions/auth';

export function ForgotPasswordForm() {
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
        setError(result.error);
      }
    });
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-md border border-(--color-success) bg-(--color-success)/10 px-3 py-3 text-sm text-(--color-success)"
      >
        Si cet email existe, un lien de réinitialisation vient d&apos;être envoyé.
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
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
        {isPending ? 'Envoi…' : 'Envoyer le lien'}
      </Button>
    </form>
  );
}
