'use client';

import type { AccountKind } from '@/lib/domain/types';

type Props = {
  /** Groups the radios: two sheets open on one page must not share a choice. */
  name: string;
  legend: string;
  accounts: readonly { kind: AccountKind; label: string }[];
  value: AccountKind;
  onChange: (kind: AccountKind) => void;
  disabled?: boolean;
};

/**
 * « Depuis » — the account an expense is paid from (v3 mock-up, rule 25: « LE
 * sélecteur de compte, partout »). One component for the ⊕ sheet and the edit
 * drawer, so the two cannot drift apart.
 *
 * Styled as the category chips, built as the colour chips: a `<fieldset>` of
 * native `<input type="radio">`, which bring arrow-key navigation and a single
 * tab stop for free — a hand-made `role="radiogroup"` promises both and keeps
 * neither.
 */
export function PaidFromChips({ name, legend, accounts, value, onChange, disabled }: Props) {
  return (
    <fieldset className="flex flex-col gap-2" data-testid={`${name}-group`}>
      <legend className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-[0.09em] uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {accounts.map((account) => {
          const selected = account.kind === value;
          return (
            <label
              key={account.kind}
              className={[
                'focus-within:ring-brand-600 flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium transition-colors focus-within:ring-2',
                selected
                  ? 'bg-brand-700 text-primary-foreground'
                  : 'bg-surface-muted text-foreground hover:bg-muted',
              ].join(' ')}
            >
              <input
                type="radio"
                name={name}
                value={account.kind}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(account.kind)}
                data-testid={`${name}-${account.kind}`}
                className="sr-only"
              />
              {account.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
