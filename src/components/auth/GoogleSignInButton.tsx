'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signInWithGoogleAction } from '@/lib/actions/auth';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

type Props = {
  label?: string;
};

export function GoogleSignInButton({ label }: Props) {
  const t = useTranslations('auth.google');
  const translateError = useActionErrorTranslator();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await signInWithGoogleAction();
      if (!result.ok) setError(translateError(result.errorCode));
    });
  }

  const displayLabel = label ?? t('label');

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClick}
        disabled={isPending}
      >
        <GoogleGlyph />
        <span>{isPending ? t('redirecting') : displayLabel}</span>
      </Button>
      {error && (
        <p role="alert" className="text-danger text-center text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 24 4a20 20 0 1 0 19.6 16.5Z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3A12 12 0 0 1 12.7 28l-6.6 5A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4 5.5l6.3 5.3C41.8 35.6 44 30.2 44 24c0-1.2-.1-2.3-.4-3.5Z"
      />
    </svg>
  );
}
