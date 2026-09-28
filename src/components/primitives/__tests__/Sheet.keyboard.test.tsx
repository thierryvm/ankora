import { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Sheet } from '../Sheet';

/**
 * The sheet and the phone keyboard.
 *
 * On iOS the keyboard does not shrink the LAYOUT viewport: a panel fixed at
 * `bottom: 0` stays anchored to the bottom of the screen, under the keyboard,
 * and its footer — the « Ajouter » button — goes with it. Only the VISUAL
 * viewport knows the keyboard is there. So the sheet follows it: it sits on
 * top of the keyboard and never grows taller than what is left.
 *
 * jsdom has no `visualViewport`; each case installs a minimal one.
 */

type FakeViewport = EventTarget & { height: number; offsetTop: number; scale: number };

function installViewport(height: number, scale = 1): FakeViewport {
  const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, scale }) as FakeViewport;
  vi.stubGlobal('visualViewport', vv);
  return vv;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('innerHeight', 800);
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle dépense"
        testId="kb-sheet"
        footer={
          <button type="button" data-testid="submit">
            Ajouter
          </button>
        }
      >
        <input aria-label="Description" />
      </Sheet>
    </div>
  );
}

async function openSheet() {
  render(<Harness />);
  await userEvent.click(screen.getByTestId('trigger'));
  return screen.findByTestId('kb-sheet');
}

describe('Sheet — le clavier du téléphone', () => {
  it('se pose au-dessus du clavier : le bouton du pied reste dans la zone visible', async () => {
    const vv = installViewport(800);
    const panel = await openSheet();
    expect(panel.style.bottom).toBe('');

    // The keyboard takes 380 px: 420 px of screen are left.
    vv.height = 420;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });

    expect(panel.style.bottom).toBe('380px');
    // Never taller than what is left, so its top stays on screen too.
    expect(panel.style.maxHeight).toBe('412px');
    expect(panel.contains(screen.getByTestId('submit'))).toBe(true);
  });

  it('rend la place quand le clavier se referme', async () => {
    const vv = installViewport(800);
    const panel = await openSheet();
    vv.height = 420;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    vv.height = 800;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    expect(panel.style.bottom).toBe('');
    expect(panel.style.maxHeight).toBe('');
  });

  it("ne suit pas un zoom au pincement : c'est la personne qui a agrandi, pas un clavier", async () => {
    const vv = installViewport(800);
    const panel = await openSheet();
    vv.height = 400;
    vv.scale = 2;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    expect(panel.style.bottom).toBe('');
  });

  it('se désabonne à la fermeture', async () => {
    const vv = installViewport(800);
    const remove = vi.spyOn(vv, 'removeEventListener');
    await openSheet();
    await userEvent.keyboard('{Escape}');
    // Once the exit slide is over and the panel leaves the tree.
    await waitFor(() => expect(screen.queryByTestId('kb-sheet')).toBeNull());
    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['resize', 'scroll']),
    );
  });

  it('garde sa place au-dessus du clavier pendant sa sortie', async () => {
    const vv = installViewport(800);
    const panel = await openSheet();
    vv.height = 420;
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    await userEvent.keyboard('{Escape}');
    // Still mounted for its exit slide: it must not drop by the keyboard's height.
    expect(panel.isConnected).toBe(true);
    expect(panel.style.bottom).toBe('380px');
  });

  it('ne fait rien quand visualViewport est absent', async () => {
    vi.stubGlobal('visualViewport', undefined);
    const panel = await openSheet();
    expect(panel.style.bottom).toBe('');
    expect(screen.getByTestId('submit')).toBeTruthy();
  });
});
