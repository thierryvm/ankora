export type ParseAmountOptions = {
  allowZero?: boolean;
};

/**
 * Parse what a francophone actually types into an amount field.
 *
 * `1.234,56` and `1234.56` are both meant as the same amount; a bare `Number()`
 * reads the first as 1.234. And behind a `type="number"` field the browser
 * blanks a comma-typed « 5,90 » to an empty string, which `Number('')` turns
 * into 0 — which is why every amount field of the app is a text field with a
 * decimal keypad, read by this one function.
 *
 * Returns `null` for anything that is not a single amount: empty, letters,
 * a sign, a typo in the grouping. By default the amount must be strictly
 * positive; `allowZero` admits 0 for the fields whose rule is « 0 or more »
 * (an income, a transfer, a commitment total).
 */
export function parseAmountInput(raw: string, options: ParseAmountOptions = {}): number | null {
  // `\s` covers every Unicode space separator, so the no-break space (U+00A0)
  // and the narrow no-break space (U+202F) that a formatted « 1 234,56 € »
  // carries are stripped with the ordinary ones.
  const trimmed = raw.trim().replace(/\s/g, '');
  if (trimmed === '') return null;
  // Whichever separator appears LAST is the decimal one; earlier ones group.
  const decimalAt = Math.max(trimmed.lastIndexOf(','), trimmed.lastIndexOf('.'));
  const integerPart = decimalAt === -1 ? trimmed : trimmed.slice(0, decimalAt);
  const decimalPart = decimalAt === -1 ? '' : trimmed.slice(decimalAt + 1);
  // Security review, tour 56 — never more than two decimals. The base rounds
  // a third one (numeric(12,2)): « 0,001 » became 0 EUR and « 1.234 », a
  // thousand written the Belgian way, 1,23 EUR. Ambiguous: refused.
  if (decimalPart.length > 2) return null;

  // Grouping, if present, must actually BE grouping: `1.234,56` is an amount,
  // `1,2,3` is a typo. Without this check the latter silently became 12,30 € —
  // a wrong figure accepted without a word, on the one field that matters.
  const groups = integerPart.split(/[.,]/);
  if (groups.length > 1 && !groups.slice(1).every((group) => /^\d{3}$/.test(group))) return null;

  const normalised = decimalAt === -1 ? groups.join('') : `${groups.join('')}.${decimalPart}`;
  // Digits only past this line: no sign can get through, so the one rule left
  // is whether zero is an answer.
  if (!/^\d+(\.\d*)?$/.test(normalised)) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  if (value === 0 && !options.allowZero) return null;
  return value;
}
