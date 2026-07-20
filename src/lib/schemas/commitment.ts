import { z } from 'zod';

/**
 * Validation for commitments (épic « Dettes & échéanciers »). Mirrors the
 * `charge.ts` conventions: error strings are i18n keys resolved by
 * `useActionErrorTranslator`.
 *
 * Bounds vs `20260719000001_commitments.sql`: every rule the DB enforces is
 * ALSO enforced here (ranges, the one-off/single-instalment invariant, the
 * instalment-amount requirement), so the DB can never reject what this schema
 * accepted. The reverse is not true by design — the amount ceilings
 * (10 000 000) are UI-side sanity guards with no SQL counterpart (Sourcery
 * #233).
 */
export const commitmentKindSchema = z.enum(['debt', 'installment_plan', 'one_off'], {
  error: 'commitment.kind.invalid',
});

export const commitmentFrequencySchema = z.enum(['monthly', 'quarterly', 'semiannual', 'annual'], {
  error: 'commitment.frequency.invalid',
});

const amountSchema = (key: string) =>
  z
    .number({ error: key })
    .finite({ message: key })
    .min(0, { message: `${key}.negative` })
    .max(10_000_000, { message: `${key}.tooHigh` });

/**
 * Unrefined shape. Kept separate because Zod v4 forbids `.partial()` on a
 * refined schema — the update variant derives from THIS and re-applies the
 * cross-field rules on the fields it actually carries.
 */
const commitmentBaseSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { message: 'commitment.label.required' })
    .max(120, { message: 'commitment.label.tooLong' }),
  kind: commitmentKindSchema,
  /** Amount still engaged (locked decision D3: the REMAINING balance). */
  totalAmount: amountSchema('commitment.totalAmount.invalid'),
  /** One instalment; omitted for a one-off (the total is due at once). */
  installmentAmount: amountSchema('commitment.installmentAmount.invalid').optional(),
  installmentsTotal: z
    .number({ error: 'commitment.installmentsTotal.invalid' })
    .int({ message: 'commitment.installmentsTotal.invalid' })
    .min(1, { message: 'commitment.installmentsTotal.min' })
    .max(600, { message: 'commitment.installmentsTotal.max' }),
  /** Anchor = the NEXT instalment. */
  startYear: z
    .number({ error: 'commitment.startYear.invalid' })
    .int({ message: 'commitment.startYear.invalid' })
    .min(2000, { message: 'commitment.startYear.invalid' })
    .max(2100, { message: 'commitment.startYear.invalid' }),
  startMonth: z
    .number({ error: 'commitment.startMonth.invalid' })
    .int({ message: 'commitment.startMonth.invalid' })
    .min(1, { message: 'commitment.startMonth.invalid' })
    .max(12, { message: 'commitment.startMonth.invalid' }),
  paymentDay: z
    .number({ error: 'commitment.paymentDay.invalid' })
    .int({ message: 'commitment.paymentDay.invalid' })
    .min(1, { message: 'commitment.paymentDay.invalid' })
    .max(31, { message: 'commitment.paymentDay.invalid' })
    .default(1),
  frequency: commitmentFrequencySchema.default('monthly'),
  categoryId: z
    .string()
    .uuid({ message: 'commitment.categoryId.invalid' })
    .nullable()
    .default(null),
  notes: z.string().max(500, { message: 'commitment.notes.tooLong' }).nullable().default(null),
  isActive: z.boolean().default(true),
});

export const commitmentInputSchema = commitmentBaseSchema
  // Mirrors `commitments_one_off_single`: a one-off is exactly one instalment.
  .refine((v) => v.kind !== 'one_off' || v.installmentsTotal === 1, {
    message: 'commitment.oneOff.singleInstallment',
    path: ['installmentsTotal'],
  })
  // Mirrors `commitments_installment_amount_required`.
  .refine((v) => v.installmentsTotal === 1 || v.installmentAmount !== undefined, {
    message: 'commitment.installmentAmount.required',
    path: ['installmentAmount'],
  });

/**
 * Partial variant for edits. Cross-field rules only fire when the patch
 * actually carries both sides — a lone `label` edit must never be rejected for
 * a rule about fields it does not touch (the stored row already satisfies it).
 * The DB CHECKs remain the backstop.
 */
export const commitmentUpdateSchema = commitmentBaseSchema.partial().superRefine((v, ctx) => {
  if (v.kind === 'one_off' && v.installmentsTotal !== undefined && v.installmentsTotal !== 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'commitment.oneOff.singleInstallment',
      path: ['installmentsTotal'],
    });
  }
  // Mirrors `commitments_installment_amount_required` for the patch case:
  // raising the instalment count above 1 in the SAME patch that nulls the
  // instalment amount would be accepted by Zod and rejected by the DB
  // (Sourcery #233). Only checked when both sides travel together — a lone
  // `installmentsTotal` bump keeps the row's existing amount.
  if (
    v.installmentsTotal !== undefined &&
    v.installmentsTotal > 1 &&
    'installmentAmount' in v &&
    v.installmentAmount === undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'commitment.installmentAmount.required',
      path: ['installmentAmount'],
    });
  }
});

export type CommitmentInput = z.infer<typeof commitmentInputSchema>;
