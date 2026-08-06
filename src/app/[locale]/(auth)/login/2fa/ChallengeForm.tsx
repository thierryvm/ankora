'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { verifierDefiMfaAction } from '@/lib/actions/mfa-challenge';
import { logoutAction } from '@/lib/actions/auth';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

/**
 * The sign-in second-factor challenge.
 *
 * The sign-out button is not decoration: without it, someone who cannot produce
 * a code is stranded on this screen with no way even to leave. `logoutAction`
 * is one of the few actions deliberately left reachable at aal1 for that reason.
 */
export function ChallengeForm() {
  const t = useTranslations('auth.mfaChallenge');
  const router = useRouter();
  const translateError = useActionErrorTranslator();
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    startTransition(async () => {
      const res = await verifierDefiMfaAction({ code });
      if (res.ok) {
        // `router.refresh()` before navigating: the elevated session was written
        // to cookies by the action, and the guard that sent us here reads it
        // server-side. Pushing without refreshing would race a cached RSC
        // payload rendered while the session was still aal1.
        router.refresh();
        router.push('/app');
        return;
      }
      setCode('');
      setErreur(translateError(res.errorCode));
    });
  };

  return (
    // Two SIBLING forms, never nested: a <form> inside a <form> is invalid HTML
    // and the inner one is dropped by the parser, which would have left the
    // sign-out button inert — the one control that must never fail here.
    <div className="flex flex-col gap-4">
      <form onSubmit={soumettre} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="mfaChallengeCode">{t('codeLabel')}</Label>
          <Input
            id="mfaChallengeCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>

        {erreur && (
          <p role="alert" className="text-danger text-sm">
            {erreur}
          </p>
        )}

        <Button type="submit" disabled={pending || code.length !== 6}>
          {pending ? t('verifying') : t('submit')}
        </Button>
      </form>

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" className="w-full">
          {t('signOut')}
        </Button>
      </form>
    </div>
  );
}
