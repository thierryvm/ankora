'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signupAction } from '@/lib/actions/auth';

export function SignupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await signupAction(formData);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-xs font-medium text-(--color-danger)">
            {fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby="password-hint password-error"
        />
        <p id="password-hint" className="text-xs text-(--color-muted-foreground)">
          Au moins 12 caractères, 1 majuscule, 1 minuscule, 1 chiffre.
        </p>
        {fieldErrors.password && (
          <p id="password-error" className="text-xs font-medium text-(--color-danger)">
            {fieldErrors.password[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="passwordConfirm">Confirmer le mot de passe</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldErrors.passwordConfirm)}
        />
        {fieldErrors.passwordConfirm && (
          <p className="text-xs font-medium text-(--color-danger)">
            {fieldErrors.passwordConfirm[0]}
          </p>
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
          J&apos;accepte les{' '}
          <Link href="/legal/cgu" className="text-(--color-brand-700) underline">
            CGU
          </Link>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-(--color-muted-foreground)">
        <input
          type="checkbox"
          name="acceptPrivacy"
          required
          className="mt-1 h-4 w-4 rounded border-(--color-border) text-(--color-brand-700) focus:ring-(--color-brand-600)"
        />
        <span>
          J&apos;accepte la{' '}
          <Link href="/legal/privacy" className="text-(--color-brand-700) underline">
            politique de confidentialité
          </Link>
        </span>
      </label>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-(--color-danger) bg-(--color-danger)/10 px-3 py-2 text-sm text-(--color-danger)"
        >
          {error}
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Création…' : 'Créer mon compte'}
      </Button>
    </form>
  );
}
