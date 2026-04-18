'use client';

import { useTranslations } from 'next-intl';

type FieldErrors = Record<string, string[] | undefined>;

/**
 * Translates stable Zod error codes (e.g. 'charge.label.required') into UI strings.
 *
 * Zod schemas emit stable codes as `.message`; server actions forward them through
 * `fieldErrors`. The hook resolves them via the `errors.validation` namespace. An
 * unknown code is returned verbatim so the UI never renders an empty string.
 */
export function useFieldErrorTranslator() {
  const t = useTranslations('errors.validation');
  const translator = t as unknown as {
    (key: string): string;
    has?: (key: string) => boolean;
  };

  function translate(code: string | undefined): string | undefined {
    if (!code) return undefined;
    if (typeof translator.has === 'function') {
      return translator.has(code) ? translator(code) : code;
    }
    try {
      return translator(code);
    } catch {
      return code;
    }
  }

  function translateFirst(codes: string[] | undefined): string | undefined {
    if (!codes || codes.length === 0) return undefined;
    return translate(codes[0]);
  }

  function translateField(errors: FieldErrors, field: string): string | undefined {
    return translateFirst(errors[field]);
  }

  return { translate, translateFirst, translateField };
}
