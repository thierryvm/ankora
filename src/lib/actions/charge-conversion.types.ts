import type { PorteKind } from '@/lib/domain/commitments';

/**
 * Transport types for `charge-conversion.ts`.
 *
 * A file carrying `'use server'` may only export `async` functions (repo rule
 * 9, enforced by `npm run lint:use-server`), so the shape its action returns
 * lives here — same split as `expense-entry.types.ts`.
 */
export type ConversionResult = {
  commitmentId: string;
  installmentsTotal: number;
  totalAmount: number;
  /** Which door Ankora recorded. */
  porteRetenue: PorteKind;
  /**
   * Doors that were filled in and disagree with the retained one. Reported so
   * the UI can name them; never arbitrated — both values stay as typed.
   */
  ecarts: readonly { porte: PorteKind; installmentsTotal: number }[];
  /** Derived end period, so the UI can confirm « fin : juin 2029 ». */
  endYear: number;
  endMonth: number;
};
