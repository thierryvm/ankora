import { useRef, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Sheet } from '../Sheet';

/**
 * The primitive's contract, asserted.
 *
 * `docs/specs/sheet-primitive-contract.md` §2 lists four modal obligations that
 * the 634 harvested cases of the dead `atoms/Drawer` never covered — focus
 * trap, `aria-modal`, body scroll lock, `env(safe-area-inset-bottom)` — plus
 * focus restoration, drag-to-dismiss and the bottom/right anchoring. Those are
 * precisely the four that were missing from the three panels users open every
 * day. Untested obligations are how they went missing; so each one gets a case
 * here, and the four from §2 are grouped and named as such.
 *
 * `requestAnimationFrame` is faked to a synchronous call. The primitive defers
 * both its entrance transform and its initial focus by one frame on purpose
 * (focusing a still-off-screen input makes iOS chase it with the layout
 * viewport); under jsdom that deferral would otherwise make every assertion a
 * race.
 */

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  // jsdom implements neither; the primitive guards matchMedia, but scrollTo
  // is called unconditionally on cleanup.
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The real usage shape: a trigger that owns the open state. */
function Harness({
  footer,
  withInput = true,
  autoFocusAmount = false,
  desktop,
}: {
  footer?: boolean;
  withInput?: boolean;
  autoFocusAmount?: boolean;
  desktop?: 'panel' | 'dialog';
}) {
  const [open, setOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle dépense"
        testId="test-sheet"
        desktop={desktop}
        initialFocusRef={autoFocusAmount ? amountRef : undefined}
        footer={
          footer ? (
            <button type="button" data-testid="submit">
              Ajouter
            </button>
          ) : undefined
        }
      >
        {withInput && <input ref={amountRef} data-testid="amount" aria-label="Montant" />}
        <button type="button" data-testid="inner">
          Interne
        </button>
      </Sheet>
    </div>
  );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('trigger'));
  return screen.getByTestId('test-sheet');
}

describe('Sheet — the four obligations the harvested source never covered', () => {
  it('is a real modal dialog: role, aria-modal and an accessible name', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = await open(user);

    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog', { name: 'Nouvelle dépense' })).toBe(panel);
  });

  it('traps Tab and Shift+Tab inside the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    const inside = [
      screen.getByTestId('test-sheet-close'),
      screen.getByTestId('amount'),
      screen.getByTestId('inner'),
    ];

    // Walk forward past the last focusable and land back on the first.
    inside[0]?.focus();
    for (let i = 0; i < inside.length; i++) await user.tab();
    expect(inside).toContain(document.activeElement);
    expect(screen.getByTestId('trigger')).not.toBe(document.activeElement);

    // And backwards off the first.
    inside[0]?.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(inside[inside.length - 1]);
  });

  it('locks body scroll with the iOS-proof technique, and restores the position', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    render(<Harness />);

    await open(user);

    // `overflow: hidden` alone is ignored by iOS Safari rubber-band scrolling
    // (THI-250) — `position: fixed` + a captured offset is the part that holds.
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-420px');
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.body.style.position).toBe(''));
    expect(document.body.style.top).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: 'instant' });
  });

  it('reserves the iPhone home indicator area — issue #152', async () => {
    const user = userEvent.setup();
    render(<Harness footer />);
    const panel = await open(user);

    // The footer owns the inset when there is one, so the primary action is
    // never overlapped by the home indicator.
    const padded = panel.querySelector('[class*="env(safe-area-inset-bottom)"]');
    expect(padded, 'no element reserves env(safe-area-inset-bottom)').not.toBeNull();
    expect(padded?.textContent).toContain('Ajouter');
  });

  it('reserves the safe area even with no footer', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = await open(user);
    expect(panel.querySelector('[class*="env(safe-area-inset-bottom)"]')).not.toBeNull();
  });
});

describe('Sheet — closing', () => {
  it.each([
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'the backdrop',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByTestId('test-sheet-backdrop')),
    ],
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByTestId('test-sheet-close')),
    ],
  ])('closes on %s', async (_name, close) => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    await close(user);

    await waitFor(() => expect(screen.queryByTestId('test-sheet')).not.toBeInTheDocument());
  });

  it('ignores keys that are not Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);

    await user.keyboard('{Enter}');

    expect(screen.getByTestId('test-sheet')).toBeInTheDocument();
  });

  it('gives focus back to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByTestId('trigger');
    await open(user);
    expect(document.activeElement).not.toBe(trigger);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('dismisses on a downward drag past the threshold', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const panel = await open(user);
    const handle = panel.firstElementChild as HTMLElement;

    fireEvent.pointerDown(handle, { clientY: 100, pointerType: 'touch' });
    fireEvent.pointerMove(handle, { clientY: 260, pointerType: 'touch' });
    fireEvent.pointerUp(handle, { pointerType: 'touch' });

    await waitFor(() => expect(screen.queryByTestId('test-sheet')).not.toBeInTheDocument());
  });

  it('springs back when the drag stops short of the threshold', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const panel = await open(user);
    const handle = panel.firstElementChild as HTMLElement;

    fireEvent.pointerDown(handle, { clientY: 100, pointerType: 'touch' });
    fireEvent.pointerMove(handle, { clientY: 140, pointerType: 'touch' });
    fireEvent.pointerUp(handle, { pointerType: 'touch' });

    expect(screen.getByTestId('test-sheet')).toBeInTheDocument();
    // The CSSOM transform is cleared, handing control back to the state class.
    expect(screen.getByTestId('test-sheet').style.transform).toBe('');
    expect(screen.getByTestId('test-sheet').className).toContain('translate-y-0');
  });

  it('follows the finger through the CSSOM, never an inline style attribute', () => {
    render(<Harness />);
    const panel = screen.getByTestId('trigger');
    fireEvent.click(panel);
    const sheet = screen.getByTestId('test-sheet');
    const handle = sheet.firstElementChild as HTMLElement;

    fireEvent.pointerDown(handle, { clientY: 100, pointerType: 'touch' });
    fireEvent.pointerMove(handle, { clientY: 150, pointerType: 'touch' });

    // The strict CSP (`style-src 'self' 'nonce-…'`, no 'unsafe-inline') drops a
    // style ATTRIBUTE rendered by React. A CSSOM write from an event handler is
    // not governed by it. This asserts the panel moves at all — the regression
    // would be invisible in dev and total in production.
    expect(sheet.style.transform).toBe('translateY(50px)');
    fireEvent.pointerUp(handle, { pointerType: 'touch' });
  });

  it('ignores a mouse drag — desktop has the close button and the backdrop', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('trigger'));
    const sheet = screen.getByTestId('test-sheet');
    const handle = sheet.firstElementChild as HTMLElement;

    fireEvent.pointerDown(handle, { clientY: 100, pointerType: 'mouse' });
    fireEvent.pointerMove(handle, { clientY: 400, pointerType: 'mouse' });
    fireEvent.pointerUp(handle, { pointerType: 'mouse' });

    expect(screen.getByTestId('test-sheet')).toBeInTheDocument();
  });
});

describe('Sheet — focus on open', () => {
  it('focuses the first editable field by default (harvested contract §1.1)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await open(user);
    expect(document.activeElement).toBe(screen.getByTestId('amount'));
  });

  it('honours an explicit initialFocusRef', async () => {
    const user = userEvent.setup();
    render(<Harness autoFocusAmount />);
    await open(user);
    expect(document.activeElement).toBe(screen.getByTestId('amount'));
  });

  it('falls back to the close button when the sheet has no field', async () => {
    const user = userEvent.setup();
    render(<Harness withInput={false} />);
    await open(user);
    expect(document.activeElement).toBe(screen.getByTestId('test-sheet-close'));
  });
});

describe('Sheet — anchoring', () => {
  it('is bottom-anchored on mobile and right-anchored from md up', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = await open(user);

    expect(panel.className).toContain('bottom-0');
    expect(panel.className).toContain('md:right-0');
    expect(panel.className).toContain('md:inset-y-0');
  });

  it('renders the 36 × 5 grab handle', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = await open(user);
    // w-9 = 36px, h-[5px] = 5px — the contract's stated dimensions.
    expect(panel.querySelector('.w-9.h-\\[5px\\], .h-\\[5px\\].w-9')).not.toBeNull();
  });
});

describe('Sheet — mounting', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByTestId('test-sheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('test-sheet-backdrop')).not.toBeInTheDocument();
  });

  it('portals out of the parent so a backdrop-filter ancestor cannot clip it', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const panel = await open(user);

    // Bug #119: inside a `backdrop-filter` stacking context (the sticky header
    // and the bottom tab bar both create one) no z-index lifts the panel above
    // the bar on iOS WebKit. The portal is the fix, so its absence is a bug.
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });
});

/**
 * La variante bureau, ajoutée le 23 août 2026.
 *
 * Motif MESURÉ, pas esthétique : la colonne pleine hauteur laissait **484 px de
 * vide** entre le dernier champ de la feuille de saisie et son bouton
 * « Ajouter », sur un écran de 1280 × 900 — plus de la moitié du panneau.
 *
 * jsdom ne calcule aucune mise en page, donc ces cas vérifient les CLASSES qui
 * la produisent, jamais des pixels. La mesure en pixels se fait au navigateur
 * avant livraison, et elle a été faite.
 */
describe('Sheet — ce que la feuille devient sur un grand écran', () => {
  it('reste une colonne pleine hauteur par défaut', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const panel = await open(user);
    // Le menu « Plus » dépend de ce défaut : une liste de destinations remplit
    // sa colonne, et l'ancrage au bord droit la rend prévisible. Le changer
    // sans le vouloir est exactement ce que ce cas empêche.
    expect(panel.className).toContain('md:inset-y-0');
    expect(panel.className).toContain('md:right-0');
    expect(panel.className).not.toContain('md:h-fit');
  });

  it('devient une boîte centrée ajustée au contenu en `dialog`', async () => {
    const user = userEvent.setup();
    render(<Harness desktop="dialog" />);
    const panel = await open(user);
    // `md:h-fit` est la clé de tout : sans lui, `inset-0` réétire la boîte et
    // le vide revient sans qu'aucune autre classe ne change.
    expect(panel.className).toContain('md:h-fit');
    expect(panel.className).toContain('md:inset-0');
    expect(panel.className).toContain('md:m-auto');
    expect(panel.className).not.toContain('md:right-0');
  });

  it('la boîte centrée se fond au lieu de glisser hors du bord', async () => {
    const user = userEvent.setup();
    render(<Harness desktop="dialog" />);
    const panel = await open(user);
    // Une boîte centrée n'a aucun bord vers lequel sortir. Sans le fondu, elle
    // resterait entièrement visible, décalée de quelques pixels, pendant toute
    // la durée de la sortie, puis disparaîtrait d'un coup.
    expect(panel.className).toContain('transition-[transform,opacity]');
    expect(panel.className).not.toContain('md:translate-x-full');
  });

  it('le mobile ne bouge pas, quelle que soit la variante', async () => {
    const user = userEvent.setup();
    render(<Harness desktop="dialog" />);
    const panel = await open(user);
    // La feuille monte du bas dans les DEUX cas : la variante ne parle que de
    // ce qui se passe à partir de `md`.
    expect(panel.className).toContain('inset-x-0');
    expect(panel.className).toContain('bottom-0');
    expect(panel.className).toContain('max-h-[92svh]');
  });
});
