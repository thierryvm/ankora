'use client';

import { useTranslations } from 'next-intl';

/**
 * Translates server-action `errorCode` strings (e.g. 'errors.auth.invalidCredentials')
 * into UI messages. Unknown codes fall back to the generic error label.
 */
export function useActionErrorTranslator() {
  const t = useTranslations('errors');
  const translator = t as unknown as {
    (key: string): string;
    has?: (key: string) => boolean;
  };

  return function translate(errorCode: string | undefined): string {
    if (!errorCode) return translator('generic');
    const relative = errorCode.startsWith('errors.')
      ? errorCode.slice('errors.'.length)
      : errorCode;
    if (typeof translator.has === 'function' && !translator.has(relative)) {
      return translator('generic');
    }
    try {
      return translator(relative);
    } catch {
      return translator('generic');
    }
  };
}
