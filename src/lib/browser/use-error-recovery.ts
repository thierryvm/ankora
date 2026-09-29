import { useCallback, useEffect } from 'react';

import {
  buildClientErrorReport,
  currentBuild,
  sendClientErrorReport,
  type ReportSource,
} from './client-error-report';
import { reloadPage } from './reload';
import { isVersionSkewError, sessionStorageOrNull, shouldAutoReload } from './version-skew';

/**
 * What both error boundaries do with the error they caught.
 *
 * 1. Report it — the shape only, cf. `client-error-report.ts`.
 * 2. If it has the signature of a stale build, reload the CURRENT page once,
 *    by itself (`location.reload()` keeps the URL; it never goes home). Only
 *    this tab is affected; a form open in another tab is untouched. What is
 *    lost is whatever this page held in memory — and the boundary has already
 *    replaced this page with the error screen, so nothing typed is still shown.
 * 3. Give « Réessayer » the right cure. An error with a digest came from the
 *    server: `reset()` re-renders and re-asks the server, which is the right
 *    retry. Without a digest the error was born in the browser, where a
 *    re-render reuses the same stale code — only a full reload changes it.
 */
export function useErrorRecovery(
  error: Error & { digest?: string },
  reset: () => void,
  source: ReportSource,
): () => void {
  useEffect(() => {
    sendClientErrorReport(
      buildClientErrorReport(error, {
        source,
        pathname: typeof window === 'undefined' ? '/' : window.location.pathname,
        build: currentBuild(),
      }),
    );
    if (isVersionSkewError(error) && shouldAutoReload(sessionStorageOrNull(), Date.now())) {
      reloadPage();
    }
  }, [error, source]);

  return useCallback(() => {
    if (error.digest) reset();
    else reloadPage();
  }, [error.digest, reset]);
}
