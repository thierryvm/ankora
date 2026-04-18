'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cancelAccountDeletionAction } from '@/lib/actions/settings';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

export function CancelDeletionButton() {
  const t = useTranslations('app.deletionStatus');
  const translateError = useActionErrorTranslator();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await cancelAccountDeletionAction();
      if (res.ok) {
        toast.success(t('toastCancelled'));
        router.refresh();
      } else {
        toast.error(translateError(res.errorCode));
      }
    });
  };

  return (
    <Button type="button" onClick={onClick} disabled={pending}>
      {pending ? t('cancelling') : t('cancelButton')}
    </Button>
  );
}
