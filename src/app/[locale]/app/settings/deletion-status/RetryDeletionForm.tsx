'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { retryAccountDeletionAction } from '@/lib/actions/settings';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { normalizeEmail } from '@/lib/i18n/formatters';

/**
 * Relaunching a quarantined erasure — not one more button, the re-arming of an
 * irreversible destruction.
 *
 * It therefore asks for the SAME gesture as the original request: the person
 * types their own email address. The screen right next to it offers
 * *cancel*, whose consequence is the exact opposite, and one of the two
 * destroys an account. A single misplaced click must not be able to do that.
 *
 * *Cancel* stays a single click on purpose — an undo never costs more than the
 * action it undoes.
 *
 * The server re-validates the address with the same schema. This form guards
 * the gesture, it does not guard the action.
 */
export function RetryDeletionForm({ email }: { email: string }) {
  const t = useTranslations('app.deletionStatus');
  const translateError = useActionErrorTranslator();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();

  const confirmMatches = normalizeEmail(confirm) === normalizeEmail(email);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await retryAccountDeletionAction({ confirm });
      if (res.ok) {
        toast.success(t('toastRetried'));
        setConfirm('');
        router.refresh();
      } else {
        toast.error(translateError(res.errorCode));
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="retry-confirm">
          {t.rich('retryConfirmLabel', {
            email,
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </Label>
        <Input
          id="retry-confirm"
          type="email"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          placeholder={email}
        />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pending || !confirmMatches}>
          {pending ? t('retrying') : t('retryButton')}
        </Button>
      </div>
    </form>
  );
}
