'use client';

import { useId, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Edit2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { renameAccountByTypeAction } from '@/lib/actions/accounts';
import { accountDisplayNameSchema, type AccountType } from '@/lib/schemas/account';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { toast } from '@/components/ui/toast';

type Props = {
  accountType: AccountType;
  displayName: string;
  subLabel: string;
};

/**
 * Inline-editable account title. Click → input; Enter/blur → save; Esc → cancel.
 *
 * Pattern (cf. ADR-010 — same idiom transposed from QuotidienCard):
 *   - useOptimistic for the snappy update (sub-100ms perceived latency)
 *   - useTransition to serialise concurrent submissions
 *   - Server Action revalidatePath('/[locale]/app','page') re-syncs
 *   - On error: revert + toast + log
 *
 * Validation runs both client-side (instant feedback) and server-side
 * (defense in depth, RLS still applies).
 */
export function AccountCardEditableTitle({ accountType, displayName, subLabel }: Props) {
  const t = useTranslations('app.accounts.rename');
  const translateError = useActionErrorTranslator();
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [optimisticName, setOptimisticName] = useOptimistic(
    displayName,
    (_prev, next: string) => next,
  );
  const [isPending, startTransition] = useTransition();
  // Draft is created on entering edit mode and discarded on exit, so it
  // never needs to track `displayName` updates outside that window.
  const [draft, setDraft] = useState(displayName);

  function enterEdit() {
    setDraft(optimisticName);
    setIsEditing(true);
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function exitEdit() {
    setIsEditing(false);
  }

  function submit() {
    const trimmed = draft.trim();
    // No-op if unchanged.
    if (trimmed === optimisticName) {
      setIsEditing(false);
      return;
    }
    const parsed = accountDisplayNameSchema.safeParse(trimmed);
    if (!parsed.success) {
      toast.error(t('errorInvalid'));
      inputRef.current?.focus();
      return;
    }
    const next = parsed.data;
    setIsEditing(false);
    startTransition(async () => {
      setOptimisticName(next);
      const result = await renameAccountByTypeAction({
        accountType,
        displayName: next,
      });
      if (!result.ok) {
        toast.error(translateError(result.errorCode));
        // useOptimistic only snaps back when the component re-renders. The
        // failed Server Action did NOT call revalidatePath, so we trigger
        // an explicit refresh to re-fetch the Server Component tree and
        // restore the canonical displayName from the DB.
        router.refresh();
      }
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      exitEdit();
    }
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="sr-only">
          {t('inputLabel')}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submit}
          onKeyDown={handleKeyDown}
          maxLength={50}
          required
          autoComplete="off"
          spellCheck={false}
          className="border-border bg-background focus-visible:ring-brand-700 w-full rounded-md border px-2 py-1 text-base font-semibold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
          placeholder={t('placeholder')}
          aria-describedby={`${inputId}-sub`}
        />
        <p id={`${inputId}-sub`} className="text-muted-foreground text-xs">
          {subLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={enterEdit}
        title={t('tooltip')}
        className="group hover:bg-muted/50 focus-visible:bg-muted/50 -mx-1 -my-0.5 flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-base font-semibold tracking-tight transition-colors hover:underline hover:decoration-zinc-500 hover:decoration-dotted hover:underline-offset-4 focus-visible:outline-none"
        aria-label={t('editLabel', { name: optimisticName })}
        disabled={isPending}
      >
        <span className="truncate">{optimisticName}</span>
        <Edit2
          className="h-3.5 w-3.5 shrink-0 opacity-30 transition-opacity group-hover:opacity-70 focus-visible:opacity-70"
          aria-hidden
          strokeWidth={1.5}
        />
      </button>
      <p className="text-muted-foreground text-xs">{subLabel}</p>
    </div>
  );
}
