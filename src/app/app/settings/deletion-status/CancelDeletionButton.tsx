'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cancelAccountDeletionAction } from '@/lib/actions/settings';

export function CancelDeletionButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await cancelAccountDeletionAction();
      if (res.ok) {
        toast.success('Demande annulée — ton compte est conservé');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Button type="button" onClick={onClick} disabled={pending}>
      {pending ? 'Annulation…' : 'Annuler la suppression'}
    </Button>
  );
}
