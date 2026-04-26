import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Reusable axe-core helper for WCAG 2.1 AA compliance scans on Playwright pages.
 *
 * Used by `e2e/a11y/baseline.spec.ts` (and future a11y specs) to enforce a
 * baseline of 0 violations on critical routes. Tags filter the scan to
 * WCAG A + AA only — best-practice rules are not blocking but are still
 * surfaced via the lighthouse-auditor agent in pre-release runs.
 *
 * Refs: ADR-006 §Phase T1 + docs/testing-strategy.md.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export type AxeScanOptions = {
  /**
   * CSS selectors to exclude from the scan. Use sparingly — every exclusion
   * is a hole in the a11y net. Document the rationale next to the call site.
   */
  exclude?: string[];
  /**
   * Override the WCAG tags. Defaults to WCAG 2.1 A + AA. Pass `[]` to scan
   * all axe rules (best-practice + experimental included).
   */
  tags?: string[];
};

/**
 * Run axe-core on the current page state and assert zero WCAG AA violations.
 * Failure messages list each violation with id, impact, help URL, and the
 * affected element selector — enough to fix the issue from the test report.
 */
export async function expectA11yPass(page: Page, options: AxeScanOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(options.tags ?? WCAG_AA_TAGS);

  if (options.exclude && options.exclude.length > 0) {
    for (const selector of options.exclude) {
      builder = builder.exclude(selector);
    }
  }

  const results = await builder.analyze();

  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `[${v.impact}] ${v.id} — ${v.help}\n  ${v.helpUrl}\n  affected: ${v.nodes
            .map((n) => n.target.join(' '))
            .join('; ')}`,
      )
      .join('\n\n');
    throw new Error(
      `axe-core found ${results.violations.length} WCAG AA violation(s):\n\n${summary}`,
    );
  }

  expect(results.violations).toHaveLength(0);
}
