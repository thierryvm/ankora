/**
 * Waits until a `<Sheet>` has placed its initial focus inside the panel.
 *
 * The primitive moves focus one animation frame after it opens (on iOS,
 * focusing a still-off-screen input makes the layout viewport chase it — see
 * `src/components/primitives/Sheet.tsx`). Under jsdom that frame is a
 * wall-clock timer, so a test that types straight after `render` races it:
 * when the frame lands after `user.type` has clicked a field but before its
 * first key, focus jumps to the sheet's first field and the keys land there.
 * That is how « 705 » ended up in the label field of the charge drawer and the
 * amount stayed empty (CI run 41189853415, 31 October 2026).
 *
 * A person cannot type before the first frame has painted the sheet, so the
 * test waits for the same moment. Call it after `render`, before the first
 * interaction with a field the sheet does not focus by itself.
 *
 * It checks that focus is inside the dialog, not where: a field rendered with
 * `autoFocus` would satisfy it before the frame lands. Such a sheet should pass
 * `initialFocusRef` instead, which the primitive honours in the same frame.
 */
import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export async function waitForSheetFocus(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
  );
}
