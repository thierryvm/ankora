import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';
import { AddExpenseSheet, parseAmountInput } from '../AddExpenseSheet';
import { todayInAnkoraTz } from '@/lib/date/tz';

/**
 * The entry flow, held to the two promises it was built for:
 * **2 taps**, and **`category_id` actually reaching the database**.
 *
 * The second one is the reported defect. `createExpenseAction` has written
 * `category_id` since it was first shipped; `ExpensesClient.tsx:71` passed
 * `categoryId: null` hardcoded, so a table, a foreign key and an Accepted ADR
 * (ADR-022) sat disconnected from the product by one line. Nothing failed,
 * because nothing asserted. Hence `sends the selected categoryId`.
 */

const createExpenseAction = vi.fn();
const getExpenseEntryContextAction = vi.fn();
const announceSpend = vi.fn();
const settleSpend = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/lib/actions/expenses', () => ({
  createExpenseAction: (...args: unknown[]) => createExpenseAction(...args),
}));

vi.mock('@/lib/actions/expense-entry', () => ({
  getExpenseEntryContextAction: () => getExpenseEntryContextAction(),
}));

vi.mock('@/lib/expenses/optimistic-spend', () => ({
  announceSpend: (...args: unknown[]) => announceSpend(...args),
  settleSpend: () => settleSpend(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr-BE',
  useTranslations: (namespace: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const parts = `${namespace}.${key}`.split('.');
      let value: unknown = frMessages;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? `{${name}}`));
    };
    return translate;
  },
}));

vi.mock('@/lib/i18n/action-errors', () => ({
  useActionErrorTranslator: () => (code?: string) => code ?? 'error',
}));

const COURSES = { id: 'cat-courses', name: 'Courses', colorToken: 'emerald' };
const CARBURANT = { id: 'cat-carburant', name: 'Carburant', colorToken: 'cyan' };
const RESTO = { id: 'cat-resto', name: 'Restaurant', colorToken: 'amber' };

function context(over: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      chips: [COURSES, CARBURANT, RESTO],
      overflow: [],
      preselectedId: COURSES.id,
      ilTeReste: 448.39,
      budgetDuMois: 736.79,
      incomplet: false,
      todayIso: '2026-07-18',
      ...over,
    },
  };
}

/**
 * Real timers on purpose. Faking them to pin a date would have meant driving
 * `userEvent` through `advanceTimers`, and the component reads the wall clock in
 * two places (the default date, and the current-month check) — so the assertions
 * below compare against `todayInAnkoraTz()` rather than a hardcoded day. A test
 * that only passes in July is not a test.
 */
beforeEach(() => {
  vi.clearAllMocks();
  // The primitive defers its entrance transform and its initial focus by one
  // frame (focusing a still-off-screen input makes iOS chase it); collapsing
  // rAF to a synchronous call is what makes those assertions deterministic.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  window.scrollTo = vi.fn();
  getExpenseEntryContextAction.mockResolvedValue(context());
  createExpenseAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Open the sheet and wait for its context to land. */
async function openSheet() {
  const onClose = vi.fn();
  render(<AddExpenseSheet open onClose={onClose} />);
  await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());
  return { onClose };
}

describe('parseAmountInput — what a francophone actually types', () => {
  it.each([
    ['18,50', 18.5],
    ['18.50', 18.5],
    ['1.234,56', 1234.56],
    ['1 234,56', 1234.56],
    ['60', 60],
    ['0,05', 0.05],
    ['18,', 18],
  ])('reads %s as %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-5', '0', '1,2,3', '€18', '18€'])('rejects %s', (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });

  it('reads a comma as a decimal separator, not as thousands', () => {
    // `type="number"` would have discarded the comma outright and left the
    // field looking accepted with an empty value — which is why the input is
    // `type="text"` with `inputMode="decimal"`.
    expect(parseAmountInput('18,50')).toBe(18.5);
    expect(parseAmountInput('18,50')).not.toBe(1850);
  });
});

describe('the 2-tap promise', () => {
  it('puts the caret in the amount field on open, before anything is fetched', () => {
    render(<AddExpenseSheet open onClose={vi.fn()} />);
    // Not awaited on purpose: the field must be live BEFORE the context lands,
    // otherwise "2 taps" costs a round-trip in practice.
    expect(document.activeElement).toBe(screen.getByTestId('add-expense-amount'));
  });

  it('shows skeletons rather than an empty box while the context loads', () => {
    render(<AddExpenseSheet open onClose={vi.fn()} />);
    expect(screen.getAllByTestId('add-expense-chip-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByTestId('add-expense-projection-skeleton')).toBeInTheDocument();
  });

  it('pre-selects the most-used category, so the common case costs no tap', async () => {
    await openSheet();
    expect(screen.getByTestId(`add-expense-chip-${COURSES.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('defaults the date to today', async () => {
    await openSheet();
    expect(screen.getByTestId('add-expense-date')).toHaveValue(todayInAnkoraTz());
  });

  it('refuses to submit until an amount is a real amount', async () => {
    const user = userEvent.setup();
    await openSheet();
    expect(screen.getByTestId('add-expense-submit')).toBeDisabled();

    await user.type(screen.getByTestId('add-expense-amount'), 'abc');
    expect(screen.getByTestId('add-expense-submit')).toBeDisabled();

    await user.clear(screen.getByTestId('add-expense-amount'));
    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    expect(screen.getByTestId('add-expense-submit')).toBeEnabled();
  });
});

describe('the category actually reaches the database — the reported defect', () => {
  it('sends the selected categoryId, never null', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CARBURANT.id, amount: 18.5 }),
    );
  });

  it('sends the pre-selected category when the user changes nothing', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '60');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ categoryId: COURSES.id });
  });

  it('falls back to the category name when the label is left empty', async () => {
    // This fallback is what keeps the flow at 2 taps — typing a label would be
    // a third.
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '60');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ label: 'Courses' });
  });

  it('prefers a typed label over the fallback', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '60');
    await user.type(screen.getByTestId('add-expense-label'), 'Delhaize');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ label: 'Delhaize' });
  });
});

describe('« Il te restera X € » — the consequence, before the commit', () => {
  it('shows what is left today before anything is typed', async () => {
    await openSheet();
    expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('448,39');
  });

  it('subtracts the amount being typed', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');

    // 448,39 − 18,50 = 429,89 — the figure on the approved mockup.
    expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('429,89');
  });

  it('shows no figure at all when income is not configured (THI-335)', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ incomplet: true, ilTeReste: 0 }));
    render(<AddExpenseSheet open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.queryByTestId('add-expense-projection-skeleton')).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('add-expense-projection')).not.toBeInTheDocument();
  });
});

describe('the hero moves before the server answers (ADR-010)', () => {
  it('announces the spend optimistically', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    expect(announceSpend).toHaveBeenCalledWith(45);
  });

  it('reverts the optimistic descent when the insert is rejected', async () => {
    // Leaving the hero down on a rejected insert is the one failure worse than
    // the round-trip delay the optimism exists to hide.
    createExpenseAction.mockResolvedValue({ ok: false, errorCode: 'errors.expenses.createFailed' });
    const user = userEvent.setup();
    const { onClose } = await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(settleSpend).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reverts when the action throws, too', async () => {
    createExpenseAction.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(settleSpend).toHaveBeenCalled());
  });

  it('does NOT move the hero for an expense dated outside the current month', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.clear(screen.getByTestId('add-expense-date'));
    await user.type(screen.getByTestId('add-expense-date'), '2026-06-15');
    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    // Recorded, and correctly changes nothing on this month's figure.
    expect(announceSpend).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-expense-past-month')).toBeInTheDocument();
  });

  it('closes and confirms on success', async () => {
    const user = userEvent.setup();
    const { onClose } = await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
    expect(settleSpend).not.toHaveBeenCalled();
  });
});

describe('the chip row', () => {
  it('reveals the overflow behind the ＋ chip', async () => {
    const extra = { id: 'cat-cadeaux', name: 'Cadeaux', colorToken: 'pink' };
    getExpenseEntryContextAction.mockResolvedValue(context({ overflow: [extra] }));
    const user = userEvent.setup();
    await openSheet();

    expect(screen.queryByTestId(`add-expense-chip-${extra.id}`)).not.toBeInTheDocument();
    await user.click(screen.getByTestId('add-expense-chip-more'));
    expect(screen.getByTestId(`add-expense-chip-${extra.id}`)).toBeInTheDocument();
  });

  it('hides the ＋ chip when there is nothing behind it', async () => {
    await openSheet();
    expect(screen.queryByTestId('add-expense-chip-more')).not.toBeInTheDocument();
  });

  it('explains itself rather than showing an empty row when there is no category', async () => {
    getExpenseEntryContextAction.mockResolvedValue(
      context({ chips: [], overflow: [], preselectedId: null }),
    );
    render(<AddExpenseSheet open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-no-categories')).toBeInTheDocument(),
    );
  });

  it('is a radiogroup, so a screen reader reads it as one choice', async () => {
    await openSheet();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

describe('when the context cannot be read', () => {
  it('still lets the amount be recorded, and says why the chips are missing', async () => {
    getExpenseEntryContextAction.mockResolvedValue({ ok: false, errorCode: 'errors.generic' });
    const user = userEvent.setup();
    render(<AddExpenseSheet open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-context-failed')).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    // No category to send, so null — which is honest here, unlike the hardcoded
    // null this whole flow replaces.
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ categoryId: null });
  });
});
