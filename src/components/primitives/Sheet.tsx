'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { useIsClient } from '@/lib/hooks/useIsClient';

/**
 * `<Sheet>` — the single modal-panel primitive (ADR-037).
 *
 * ## Why it exists
 *
 * Six sliding panels shipped in this app and no two shared a line of code. The
 * three written LAST (`SimulatorDrawer`, `MoreSheet`, `HeaderNav`) have a focus
 * trap and honour `env(safe-area-inset-bottom)`; the three written FIRST — the
 * ones opened every day — have neither. Quality tracked the file's WRITE DATE
 * rather than a contract. That is the defect this file removes.
 *
 * ## Why it was extracted here rather than decreed up front
 *
 * The plan of 2026-07-26 put a 5-day `<Sheet>` chantier BEFORE the expense
 * flow. `DECISIONS-ANKORA.md` §Q8 inverted it, and the evidence is in the table
 * above: the three correct panels are correct because they learned from their
 * predecessors. A primitive designed from six existing call-sites guesses at
 * the seams; one extracted from the call-site written with the most care finds
 * them. So this is born inside `AddExpenseSheet` and generalised afterwards.
 *
 * ## Scope — a modal shell, deliberately not a form generator
 *
 * `docs/specs/sheet-primitive-contract.md` §1 records 35 harvested cases, most
 * of which describe the *form generator* the dead `atoms/Drawer` also was:
 * seven field types, money filtering, two-step delete. Rebuilding that would be
 * writing a framework for five call-sites that each already have their own,
 * different, body. What generalises is §2 — the modal a11y contract — and that
 * is exactly what lives here. Children own their content.
 *
 * ## The contract this file guarantees (all of it tested)
 *
 * | Obligation                     | Where                                      |
 * | ------------------------------ | ------------------------------------------ |
 * | `role="dialog"` + `aria-modal` | the panel element                          |
 * | `Escape` closes                | `keydown` on `document`, once, here         |
 * | Backdrop tap closes            | the backdrop element                       |
 * | Focus trap (Tab / Shift+Tab)   | `handleKeyDown`                            |
 * | Initial focus inside the panel | `initialFocusRef` → first field → close btn |
 * | Focus RESTORED to the trigger  | captured on open, refocused on unmount      |
 * | Body scroll lock (iOS-proof)   | `position: fixed` + captured scrollY        |
 * | `env(safe-area-inset-bottom)`  | the footer, and the panel when there is none |
 * | Bottom on mobile, right on md  | panel classes                              |
 * | Grab handle 36 × 5             | rendered when bottom-anchored               |
 * | Drag down to dismiss           | pointer handlers on the header zone         |
 *
 * ## Two implementation choices worth defending
 *
 * **Not Radix.** `@radix-ui/react-dialog` is already a dependency and gives the
 * trap, `aria-modal` and focus restoration for free. It is not used because of
 * the scroll lock: THI-250 established in this codebase that iOS Safari ignores
 * `overflow: hidden` on `<body>` for rubber-band scrolling, and the fix that
 * actually held is `position: fixed` + a captured `scrollY`, restored with
 * `behavior: 'instant'` (the document sets `scroll-behavior: smooth`). That,
 * plus safe-area, drag-to-dismiss and the bottom/right anchoring, is most of
 * this file — Radix would have supplied the easy third.
 *
 * **Portalled into `<body>`.** Both the sticky header and the bottom tab bar
 * use `backdrop-filter`, which creates a stacking context. Inside one, no
 * `z-index` can lift the panel above the bar on iOS WebKit (bug #119, fixed the
 * same way in `HeaderNav`). The portal is not tidiness, it is the fix.
 *
 * ## The CSP constraint, and how the movement is done
 *
 * `proxy.ts` sets `style-src 'self' 'nonce-…'` with no `'unsafe-inline'` and no
 * `'unsafe-hashes'`, so **an inline `style` attribute is blocked** — the repo
 * has that written down in three places (`AllocationBar`, `progress.tsx`,
 * `Hero.tsx`). A `style={{ transform }}` prop here would be dropped in
 * production while working perfectly in every test: the sheet would simply
 * appear instead of sliding, and drag-to-dismiss would be dead. Exactly the
 * silent-failure class this codebase keeps an agent for.
 *
 * So movement is split by nature:
 *   - **enter / exit** are two discrete states → Tailwind translate classes;
 *   - **the drag** is continuous → written through the CSSOM
 *     (`panel.style.transform = …` from an event handler), which CSP does not
 *     govern. It also avoids a React re-render per frame.
 * Clearing the CSSOM transform on release hands control back to the classes.
 */

/** Slide duration. Mirrors `--dur-structural` (320ms) in `globals.css`. */
const TRANSITION_MS = 320;

/** Past this many pixels of downward drag, releasing dismisses the sheet. */
const DRAG_DISMISS_PX = 96;

/**
 * Focusable descendants, in DOM order. `:not([disabled])` and the negative
 * tabindex filter matter: a trap that cycles onto a disabled control strands
 * the keyboard user on an element that cannot be activated.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  // jsdom has no matchMedia; guard rather than mock it in every suite.
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type SheetProps = {
  open: boolean;
  /** Called by Escape, backdrop tap, drag-dismiss and the close button. */
  onClose: () => void;
  /** Accessible name. Rendered in the header unless `hideTitle`. */
  title: string;
  children: ReactNode;
  /**
   * Pinned to the bottom of the panel, above the safe area. This is where the
   * primary action belongs on mobile: reachable by the thumb without moving
   * the hand, and never scrolled away by the content.
   */
  footer?: ReactNode;
  /** Rendered at the header's leading edge — typically a « Annuler » button. */
  leading?: ReactNode;
  /**
   * Element to focus on open. Without it the first focusable field is chosen,
   * which is the harvested contract (§1.1). With it, a sheet whose whole point
   * is one field can put the caret there and skip a tap.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** `data-testid` on the panel. The backdrop gets `${testId}-backdrop`. */
  testId?: string;
  /**
   * Hides the trailing close button. Only pass this when `leading` already
   * offers a labelled way out — never leave a modal without a visible exit.
   */
  hideCloseButton?: boolean;
  /** Accessible label for the close button (UI copy is French, callers translate). */
  closeLabel?: string;
  /**
   * Ce que devient la feuille à partir de `md`. Le mobile ne change jamais :
   * c'est une feuille qui monte du bas, dans les deux cas.
   *
   * - `panel` (défaut) — colonne ancrée à droite, pleine hauteur. La forme juste
   *   pour une NAVIGATION : une liste de destinations remplit sa colonne, et
   *   l'ancrage au bord droit la rend prévisible.
   * - `dialog` — boîte centrée, hauteur ajustée au contenu, plafonnée à 85 % de
   *   la fenêtre. La forme juste pour un FORMULAIRE COURT.
   *
   * Le motif est mesuré, pas esthétique. `panel` étire un contenu de cinq champs
   * sur toute la hauteur de l'écran : relevé le 2026-08-23 sur la feuille de
   * saisie, **484 px de vide** entre le dernier champ et le bouton « Ajouter »,
   * soit plus de la moitié du panneau. Une boîte qui fait la taille de ce
   * qu'elle contient n'a pas de vide à distribuer.
   */
  desktop?: 'panel' | 'dialog';
};

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  leading,
  initialFocusRef,
  testId = 'sheet',
  hideCloseButton = false,
  closeLabel = 'Fermer',
  desktop = 'panel',
}: SheetProps) {
  const isClient = useIsClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  /**
   * `entered` is the ONLY stored animation state, and it is only ever written
   * from an async callback (a rAF on the way in, a timeout on the way out).
   *
   * Both of the things a sheet needs are derived from it, not stored:
   *   - `rendered` — keeps the panel in the tree through its exit transition. A
   *     component that unmounts the instant `open` goes false can never animate
   *     out.
   *   - `shown` — drives the transform class. `open && entered` means closing
   *     flips it to false in the SAME commit, so the slide-down starts at once
   *     while `rendered` holds the node alive for it.
   *
   * Deriving both is what makes this correct as well as lint-clean. An earlier
   * shape stored `mounted` and set it from an effect: the panel then stayed out
   * of the DOM for one commit, and the effect below — which needs `panelRef` to
   * lock scroll and place focus — ran against a null ref and silently did
   * nothing. Invisible with a mouse, total with a keyboard.
   */
  const [entered, setEntered] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const rendered = open || entered;
  const shown = open && entered;

  useEffect(() => {
    if (open) {
      if (entered) return;
      // One frame, so the browser has a "from" value to transition out of.
      // `useLayoutEffect` would run before paint and collapse the animation.
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    if (!entered) return;
    // Unmount once the slide-down has played. `0` under reduced motion — a
    // timeout rather than a synchronous write so the transition out is the only
    // thing that decides when the node leaves.
    const timer = window.setTimeout(
      () => setEntered(false),
      prefersReducedMotion() ? 0 : TRANSITION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, entered]);

  // Remember who opened us BEFORE focus moves inside, so it can be given back.
  // Layout effect: by the time the paint happens, focus may already have moved.
  useLayoutEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  /** Hand transform control back to the Tailwind state classes. */
  const clearDragTransform = useCallback(() => {
    dragYRef.current = 0;
    dragStartRef.current = null;
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = '';
    panel.style.transition = '';
  }, []);

  const handleClose = useCallback(() => {
    clearDragTransform();
    onClose();
  }, [clearDragTransform, onClose]);

  // --- Escape, focus trap, scroll lock, initial focus, focus restoration. ---
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;

    const { scrollY } = window;
    const { body } = document;
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        // Nothing to cycle between: keep focus inside rather than letting Tab
        // walk out into the inert page behind the backdrop.
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last?.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first?.focus();
        event.preventDefault();
      } else if (panel && !panel.contains(document.activeElement)) {
        // Focus escaped (browser chrome, a stray programmatic blur): pull it back.
        first?.focus();
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus lands on the next frame, not synchronously: the panel is still
    // translated off-screen at this point, and focusing an off-screen input
    // makes iOS scroll the layout viewport to chase it.
    const frame = requestAnimationFrame(() => {
      const explicit = initialFocusRef?.current;
      if (explicit) {
        explicit.focus();
        return;
      }
      const firstField = panel?.querySelector<HTMLElement>(
        'input:not([readonly]):not([disabled]):not([type="hidden"]), textarea:not([readonly]):not([disabled]), select:not([disabled])',
      );
      (firstField ?? closeButtonRef.current ?? panel)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frame);
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';
      body.style.overflow = '';
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
      // Give focus back to whatever opened the sheet. Without this the caret
      // restarts at the top of the document and a keyboard user has to walk
      // the whole page again after every dismissal.
      triggerRef.current?.focus?.();
    };
  }, [open, handleClose, initialFocusRef]);

  // --- Drag to dismiss (header zone only). ---
  // Bound to the handle/header rather than the panel: a drag that starts on
  // scrollable content must scroll it, which is the iOS behaviour and the only
  // way both gestures can coexist without a scroll-position heuristic.
  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    dragStartRef.current = event.clientY;
    // Kill the transition for the duration of the drag: the panel must sit
    // under the finger, not lag 320 ms behind it.
    if (panelRef.current) panelRef.current.style.transition = 'none';
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) return;
    // Downward only. An upward drag on a bottom sheet has no meaning, and
    // letting it translate would lift the panel off the bottom edge.
    const travelled = Math.max(0, event.clientY - dragStartRef.current);
    dragYRef.current = travelled;
    // CSSOM, not a React `style` prop: the strict CSP blocks inline style
    // attributes (see the file header). Also spares a re-render per frame.
    if (panelRef.current) panelRef.current.style.transform = `translateY(${travelled}px)`;
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragStartRef.current === null) return;
    const travelled = dragYRef.current;
    clearDragTransform();
    if (travelled > DRAG_DISMISS_PX) handleClose();
  }, [clearDragTransform, handleClose]);

  if (!isClient || !rendered) return null;

  const node = (
    <>
      <div
        data-testid={`${testId}-backdrop`}
        aria-hidden="true"
        onClick={handleClose}
        className={`bg-foreground/40 fixed inset-0 z-50 transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        data-state={shown ? 'open' : 'closed'}
        tabIndex={-1}
        className={[
          'bg-card border-border fixed z-50 flex flex-col shadow-xl outline-none',
          // Mobile: bottom sheet. `svh`, and the choice is load-bearing —
          // see the §Viewport units note in this file's header. `dvh` made the
          // sheet resize under the reader's fingers every time Safari's URL bar
          // moved; `svh` is defined against the viewport with browser UI
          // EXPANDED and, by spec, does not change when that UI retracts.
          'inset-x-0 bottom-0 max-h-[92svh] rounded-t-3xl border-t',
          // ≥ md, `panel` : colonne ancrée à droite, pleine hauteur.
          desktop === 'panel' &&
            'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[26rem] md:rounded-t-none md:rounded-l-3xl md:border-t-0 md:border-l',
          // ≥ md, `dialog` : boîte centrée, HAUTEUR AJUSTÉE AU CONTENU.
          // `md:h-fit` est la clé — sans lui, `inset-0` étire la boîte et on
          // retrouve le vide que cette variante existe pour supprimer.
          desktop === 'dialog' &&
            'md:inset-0 md:m-auto md:h-fit md:max-h-[85vh] md:w-md md:rounded-3xl md:border',
          // `opacity` fait partie de la transition pour `dialog` SEULEMENT.
          // Une boîte centrée n'a aucun bord vers lequel sortir : sans le fondu,
          // elle resterait entièrement visible, décalée de 16 px, pendant toute
          // la durée de la sortie, puis disparaîtrait d'un coup.
          desktop === 'dialog' ? 'transition-[transform,opacity]' : 'transition-transform',
          'duration-[var(--dur-structural)] ease-[var(--ease-spring)] motion-reduce:transition-none',
          // Discrete enter/exit states as CLASSES, never an inline style — the
          // CSP would drop the attribute and the sheet would pop into place.
          // `dialog` ne glisse pas depuis la droite : une boîte centrée qui
          // arrive par le bord traverserait tout l'écran pour rien. Elle monte
          // de quelques pixels en se révélant.
          shown
            ? desktop === 'dialog'
              ? 'translate-y-0 md:opacity-100'
              : 'translate-y-0 md:translate-x-0'
            : desktop === 'dialog'
              ? 'translate-y-full md:translate-y-4 md:opacity-0'
              : 'translate-y-full md:translate-x-full md:translate-y-0',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Drag zone: the handle and the header travel together, so the whole
            top strip of the sheet is grabbable rather than a 5px target. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 touch-none"
        >
          {/* Grab handle — 36 × 5, hidden on the right-anchored desktop panel
              where a downward drag means nothing. */}
          <div className="flex justify-center pt-2.5 pb-1 md:hidden">
            <span aria-hidden="true" className="bg-muted-foreground/30 h-[5px] w-9 rounded-full" />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-2 pb-3">
            <div className="justify-self-start">{leading}</div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            <div className="justify-self-end">
              {!hideCloseButton && (
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={handleClose}
                  aria-label={closeLabel}
                  data-testid={`${testId}-close`}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-brand-600 flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <CloseGlyph />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{children}</div>

        {/*
          The footer carries the safe-area inset. When there is no footer, the
          spacer below carries it instead, so the bottom of the sheet never
          collides with the iPhone home indicator — issue #152, open against
          three of the six panels this replaces.

          ⚠️ Do NOT name a Tailwind arbitrary-value class in prose here.
          Tailwind v4 scans source files as plain TEXT, so a class written in a
          comment is generated for real: an earlier draft of this note contained
          a `padding-bottom` utility with a literal ellipsis inside `env()`,
          which emitted invalid CSS and took the dev server down with
          "Unexpected token Delim('.')". `npm run build` swallowed it. Describe
          the utility, never spell it.
        */}
        {footer ? (
          <div className="border-border/60 shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : (
          <div aria-hidden className="h-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0" />
        )}
      </div>
    </>
  );

  return createPortal(node, document.body);
}

/** Inline so the primitive carries no icon-library dependency of its own. */
function CloseGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}
