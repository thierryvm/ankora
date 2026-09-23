import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import frMessages from '../../../../messages/fr-BE.json';
import { AddExpenseSheet, parseAmountInput } from '../AddExpenseSheet';
import { todayInAnkoraTz } from '@/lib/date/tz';

/**
 * The entry flow, held to the two promises it was built for:
 * **2 taps**, and **`category_id` actually reaching the database**.
 *
 * The second one is the reported defect. `createExpenseAction` has written
 * `category_id` since it was first shipped; `ExpensesClient.tsx:71` passed
 * `categoryId: null` hardcoded, so a table, a foreign key and an Accepted ADR
 * (ADR-022) sat disconnected from the product by one line. Nothing failed,
 * because nothing asserted. Hence `sends the selected categoryId`.
 */

const createExpenseAction = vi.fn();
const createExpenseCategoryAction = vi.fn();
const getExpenseEntryContextAction = vi.fn();
const announceOptimisticSpend = vi.fn();
const settleSpend = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/lib/actions/expenses', () => ({
  createExpenseAction: (...args: unknown[]) => createExpenseAction(...args),
}));

vi.mock('@/lib/actions/expense-entry', () => ({
  getExpenseEntryContextAction: () => getExpenseEntryContextAction(),
}));

/*
  Mocké, et pas seulement par commodité : le module réel importe le client
  Supabase serveur, qui valide `env` à l'import et lève dans l'environnement de
  test des composants. Sans ce mock, la suite entière échoue au CHARGEMENT — et
  le message parle de variables d'environnement, jamais du composant.
*/
vi.mock('@/lib/actions/categories', () => ({
  createExpenseCategoryAction: (...args: unknown[]) => createExpenseCategoryAction(...args),
}));

vi.mock('@/lib/expenses/optimistic-spend', () => ({
  announceOptimisticSpend: (...args: unknown[]) => announceOptimisticSpend(...args),
  settleSpend: () => settleSpend(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'fr-BE',
  useTranslations: (namespace: string) => {
    const translate = (key: string, values?: Record<string, unknown>) => {
      const parts = `${namespace}.${key}`.split('.');
      let value: unknown = frMessages;
      for (const part of parts) {
        if (typeof value === 'object' && value !== null && part in value) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? `{${name}}`));
    };
    return translate;
  },
}));

vi.mock('@/lib/i18n/action-errors', () => ({
  useActionErrorTranslator: () => (code?: string) => code ?? 'error',
}));

const COURSES = { id: 'cat-courses', name: 'Courses', colorToken: 'emerald' };
const CARBURANT = { id: 'cat-carburant', name: 'Carburant', colorToken: 'cyan' };
const RESTO = { id: 'cat-resto', name: 'Restaurant', colorToken: 'amber' };

function context(over: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      chips: [COURSES, CARBURANT, RESTO],
      overflow: [],
      preselectedId: COURSES.id,
      ilTeReste: 448.39,
      budgetDuMois: 736.79,
      // 736,79 − 448,39. Coherent with the two above on purpose: the sheet now
      // publishes a couple, and a fixture whose members contradict each other
      // would let an implementation that mixes them up still look right.
      depensesDuMois: 288.4,
      incomplet: false,
      todayIso: '2026-07-18',
      // The person's own descriptions (rule 26). None by default, so the cases
      // written before the suggestions existed see the sheet they were written for.
      descriptions: [],
      ...over,
    },
  };
}

/**
 * Real timers on purpose. Faking them to pin a date would have meant driving
 * `userEvent` through `advanceTimers`, and the component reads the wall clock in
 * two places (the default date, and the current-month check) — so the assertions
 * below compare against `todayInAnkoraTz()` rather than a hardcoded day. A test
 * that only passes in July is not a test.
 */
beforeEach(() => {
  vi.clearAllMocks();
  // The primitive defers its entrance transform and its initial focus by one
  // frame (focusing a still-off-screen input makes iOS chase it); collapsing
  // rAF to a synchronous call is what makes those assertions deterministic.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  window.scrollTo = vi.fn();
  // `clearAllMocks` keeps queued `…Once` values: a pending read left by one
  // test would otherwise become the first open of the next.
  getExpenseEntryContextAction.mockReset();
  getExpenseEntryContextAction.mockResolvedValue(context());
  createExpenseAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Open the sheet and wait for its context to land. */
async function openSheet() {
  const onClose = vi.fn();
  render(<AddExpenseSheet open onClose={onClose} />);
  await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());
  return { onClose };
}

describe('parseAmountInput — what a francophone actually types', () => {
  it.each([
    ['18,50', 18.5],
    ['18.50', 18.5],
    ['1.234,56', 1234.56],
    ['1 234,56', 1234.56],
    ['60', 60],
    ['0,05', 0.05],
    ['18,', 18],
  ])('reads %s as %s', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-5', '0', '1,2,3', '€18', '18€'])('rejects %s', (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });

  it('reads a comma as a decimal separator, not as thousands', () => {
    // `type="number"` would have discarded the comma outright and left the
    // field looking accepted with an empty value — which is why the input is
    // `type="text"` with `inputMode="decimal"`.
    expect(parseAmountInput('18,50')).toBe(18.5);
    expect(parseAmountInput('18,50')).not.toBe(1850);
  });
});

describe('the 2-tap promise', () => {
  it('puts the caret in the amount field on open, before anything is fetched', () => {
    render(<AddExpenseSheet open onClose={vi.fn()} />);
    // Not awaited on purpose: the field must be live BEFORE the context lands,
    // otherwise "2 taps" costs a round-trip in practice.
    expect(document.activeElement).toBe(screen.getByTestId('add-expense-amount'));
  });

  it('shows skeletons rather than an empty box while the context loads', () => {
    render(<AddExpenseSheet open onClose={vi.fn()} />);
    expect(screen.getAllByTestId('add-expense-chip-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByTestId('add-expense-projection-skeleton')).toBeInTheDocument();
  });

  it('pre-selects the most-used category, so the common case costs no tap', async () => {
    await openSheet();
    expect(screen.getByTestId(`add-expense-chip-${COURSES.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('defaults the date to today', async () => {
    await openSheet();
    expect(screen.getByTestId('add-expense-date')).toHaveValue(todayInAnkoraTz());
  });

  it("says « Aujourd'hui » over the native field, not 29-07-2026", async () => {
    // The mockup's wording, without giving up the system date picker.
    await openSheet();
    expect(screen.getByTestId('add-expense-date-friendly')).toHaveTextContent("Aujourd'hui");
  });

  it('refuses to submit until an amount is a real amount', async () => {
    const user = userEvent.setup();
    await openSheet();
    expect(screen.getByTestId('add-expense-submit')).toBeDisabled();

    await user.type(screen.getByTestId('add-expense-amount'), 'abc');
    expect(screen.getByTestId('add-expense-submit')).toBeDisabled();

    await user.clear(screen.getByTestId('add-expense-amount'));
    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    expect(screen.getByTestId('add-expense-submit')).toBeEnabled();
  });
});

describe('the category actually reaches the database — the reported defect', () => {
  it('sends the selected categoryId, never null', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CARBURANT.id, amount: 18.5 }),
    );
  });

  it('sends the pre-selected category when the user changes nothing', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '60');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ categoryId: COURSES.id });
  });

  it('falls back to the category name when the label is left empty', async () => {
    // This fallback is what keeps the flow at 2 taps — typing a label would be
    // a third.
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '60');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ label: 'Courses' });
  });

  it('prefers a typed label over the fallback', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '60');
    await user.type(screen.getByTestId('add-expense-label'), 'Delhaize');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ label: 'Delhaize' });
  });
});

describe('« Il te restera X € » — the consequence, before the commit', () => {
  it('shows what is left today before anything is typed', async () => {
    await openSheet();
    expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('448,39');
  });

  it('subtracts the amount being typed', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');

    // 448,39 − 18,50 = 429,89 — the figure on the approved mockup.
    expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('429,89');
  });

  /*
    PR D — a transfer with a free share, or money received, moves « Il te
    reste » without going through this sheet. The sheet used to keep the
    figures read at its FIRST open for the life of the component, so reopening
    it after such a gesture computed « Il te restera » on the old figure until
    the next server render. Reopening must read the figure again, and must not
    show the old one while it does.
  */
  it('reads « Il te reste » again on every reopening, never the one from the first open', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() =>
      expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('448,39'),
    );

    rerender(<AddExpenseSheet open={false} onClose={onClose} />);
    // Elsewhere, a free share of 143,27 € leaves the month: 448,39 → 305,12.
    let resolveSecond!: (value: ReturnType<typeof context>) => void;
    getExpenseEntryContextAction.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );
    rerender(<AddExpenseSheet open onClose={onClose} />);

    // While the second read is in flight, the old figure is not on screen.
    expect(screen.queryByText(/448,39/)).not.toBeInTheDocument();
    expect(getExpenseEntryContextAction).toHaveBeenCalledTimes(2);

    resolveSecond(context({ ilTeReste: 305.12, depensesDuMois: 431.67 }));
    await waitFor(() =>
      expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('305,12'),
    );
  });

  it('does not count twice a spend made in the sheet once the reread includes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-submit'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    rerender(<AddExpenseSheet open={false} onClose={onClose} />);

    // The server now counts the 18,50 € itself: 448,39 − 18,50 = 429,89.
    getExpenseEntryContextAction.mockResolvedValue(
      context({ ilTeReste: 429.89, depensesDuMois: 306.9 }),
    );
    rerender(<AddExpenseSheet open onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-projection')).toHaveTextContent('429,89'),
    );
    expect(screen.getByTestId('add-expense-projection')).not.toHaveTextContent('411,39');
  });

  it('shows no figure at all when income is not configured (THI-335)', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ incomplet: true, ilTeReste: 0 }));
    render(<AddExpenseSheet open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.queryByTestId('add-expense-projection-skeleton')).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('add-expense-projection')).not.toBeInTheDocument();
  });
});

describe('the hero moves before the server answers (ADR-010)', () => {
  it('announces the RESULTING figure, not the amount spent', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    // 448,39 − 45 = 403,39. Absolute rather than a delta so that applying it
    // twice is applying it once — see `optimistic-spend.ts` for the one-frame
    // dip a delta produced when the revalidated server value landed.
    // Les DEUX figures partent ensemble, et elles bougent en sens opposés du
    // même montant : 448,39 − 45 d'un côté, 288,40 + 45 de l'autre. Une seule
    // publiée laisserait le nombre et la courbe décrire deux mois différents.
    expect(announceOptimisticSpend).toHaveBeenCalledWith({
      ilTeReste: 403.39,
      depensesDuMois: expect.closeTo(333.4, 2),
    });
  });

  it('reverts the optimistic descent when the insert is rejected', async () => {
    // Leaving the hero down on a rejected insert is the one failure worse than
    // the round-trip delay the optimism exists to hide.
    createExpenseAction.mockResolvedValue({ ok: false, errorCode: 'errors.expenses.createFailed' });
    const user = userEvent.setup();
    const { onClose } = await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(settleSpend).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reverts when the action throws, too', async () => {
    createExpenseAction.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(settleSpend).toHaveBeenCalled());
  });

  it('does NOT move the hero for an expense dated outside the current month', async () => {
    const user = userEvent.setup();
    await openSheet();

    await user.clear(screen.getByTestId('add-expense-date'));
    await user.type(screen.getByTestId('add-expense-date'), '2026-06-15');
    await user.type(screen.getByTestId('add-expense-amount'), '45');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalled());
    // Recorded, and correctly changes nothing on this month's figure.
    expect(announceOptimisticSpend).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-expense-past-month')).toBeInTheDocument();
    // No friendly name for a date two months back: the figures ARE the label.
    expect(screen.queryByTestId('add-expense-date-friendly')).not.toBeInTheDocument();
  });

  it('closes and confirms on success', async () => {
    const user = userEvent.setup();
    const { onClose } = await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
    expect(settleSpend).not.toHaveBeenCalled();
  });
});

describe('the chip row', () => {
  it('reveals the overflow behind the ＋ chip', async () => {
    const extra = { id: 'cat-cadeaux', name: 'Cadeaux', colorToken: 'pink' };
    getExpenseEntryContextAction.mockResolvedValue(context({ overflow: [extra] }));
    const user = userEvent.setup();
    await openSheet();

    expect(screen.queryByTestId(`add-expense-chip-${extra.id}`)).not.toBeInTheDocument();
    await user.click(screen.getByTestId('add-expense-chip-more'));
    expect(screen.getByTestId(`add-expense-chip-${extra.id}`)).toBeInTheDocument();
  });

  it('hides the ＋ chip when there is nothing behind it', async () => {
    await openSheet();
    expect(screen.queryByTestId('add-expense-chip-more')).not.toBeInTheDocument();
  });

  it('explains itself rather than showing an empty row when there is no category', async () => {
    getExpenseEntryContextAction.mockResolvedValue(
      context({ chips: [], overflow: [], preselectedId: null }),
    );
    render(<AddExpenseSheet open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-no-categories')).toBeInTheDocument(),
    );
  });

  it('is a radiogroup, so a screen reader reads it as one choice', async () => {
    await openSheet();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

describe('when the context cannot be read', () => {
  /*
    F-6 — this case used to read « still lets the amount be recorded, and says
    why the chips are missing », and asserted that the expense left with
    `categoryId: null`. The server now refuses exactly that payload, so letting
    the button send it would promise a save that cannot happen. The sheet says
    why the chips are missing — that half is unchanged — and holds the button.
  */
  it('says why the chips are missing, and sends nothing the server would refuse', async () => {
    getExpenseEntryContextAction.mockResolvedValue({ ok: false, errorCode: 'errors.generic' });
    const user = userEvent.setup();
    render(<AddExpenseSheet open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-context-failed')).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    expect(screen.getByTestId('add-expense-submit')).toBeDisabled();
    await user.click(screen.getByTestId('add-expense-submit'));
    expect(createExpenseAction).not.toHaveBeenCalled();
  });

  /*
    A failed read is not a verdict on the workspace: a dropped connection on one
    opening must not leave the sheet without chips for the rest of the session.
    Every opening reads again (PR D) — a failure included.
  */
  it.each([
    ['answers ok: false', () => Promise.resolve({ ok: false, errorCode: 'errors.generic' })],
    ['throws', () => Promise.reject(new Error('network'))],
  ])('reads again on the next opening after a first read that %s', async (_, failure) => {
    getExpenseEntryContextAction.mockImplementationOnce(failure);
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() =>
      expect(screen.getByTestId('add-expense-context-failed')).toBeInTheDocument(),
    );

    rerender(<AddExpenseSheet open={false} onClose={onClose} />);
    rerender(<AddExpenseSheet open onClose={onClose} />);

    await waitFor(() =>
      expect(screen.getByTestId(`add-expense-chip-${COURSES.id}`)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('add-expense-context-failed')).not.toBeInTheDocument();
    expect(getExpenseEntryContextAction).toHaveBeenCalledTimes(2);
  });
});

/**
 * Chantier « feuille de saisie », 23 août 2026 — les trois griefs de @thierry,
 * chacun mesuré au navigateur avant d'être corrigé.
 *
 * Ces cas sont écrits EN NÉGATIF : ils disent ce qui ne doit plus revenir. Une
 * régression visuelle ne casse aucun test de rendu — la feuille afficherait
 * toujours ses champs, simplement mal. Seule une assertion sur le mécanisme
 * exact qui produisait le défaut peut l'attraper.
 */
describe('la feuille après le chantier visuel', () => {
  it('la rangée de catégories ne défile plus horizontalement', async () => {
    await openSheet();
    // MESURÉ avant : 602 px de puces dans une fenêtre de 390, donc 212 px hors
    // écran et 3 puces sur 6 entièrement visibles, sans la moindre affordance.
    // Le pied de `Sheet` étant `shrink-0`, l'enroulement ne peut plus le
    // pousser sous le clavier — la raison d'être du défilement a disparu.
    const groupe = screen.getByRole('radiogroup');
    expect(groupe.className).toContain('flex-wrap');
    expect(groupe.className).not.toContain('overflow-x-auto');
    expect(groupe.className).not.toContain('flex-nowrap');
  });

  it('le déclencheur du reste dit COMBIEN il en reste', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ overflow: [RESTO, RESTO, RESTO] }));
    await openSheet();
    // Un « + » seul ne dit ni ce qu'il révèle ni combien. Sur la seule commande
    // qui pouvait signaler le contenu caché, c'était la pire des économies.
    expect(screen.getByTestId('add-expense-chip-more').textContent).toContain('3');
  });

  it('et il le dit AUSSI à un lecteur d’écran', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ overflow: [RESTO, RESTO, RESTO] }));
    await openSheet();
    // Défaut signalé par Sourcery : le texte visible est `aria-hidden`, donc un
    // `aria-label` sans compteur rendait le nombre — la seule information que
    // ce chantier ajoutait — invisible pour un lecteur d'écran. Le nom
    // accessible doit porter le VERBE et le NOMBRE : « 3 autres » seul ne dit
    // pas ce que fait le bouton.
    const nom = screen.getByTestId('add-expense-chip-more').getAttribute('aria-label') ?? '';
    expect(nom).toContain('3');
    expect(nom.replace(/\d/g, '').trim().length).toBeGreaterThan(8);
  });

  it('le montant n’est plus enfermé dans un pavé', async () => {
    await openSheet();
    // MESURÉ avant : 134 px de haut pour un champ de 66 — 68 px de rembourrage
    // autour d’un nombre — et 30 % de la hauteur de la feuille.
    const champ = screen.getByTestId('add-expense-amount');
    expect(champ.closest('.bg-surface-soft')).toBeNull();
  });

  it('l’étiquette du montant est visible, plus seulement lue par les lecteurs d’écran', async () => {
    await openSheet();
    const etiquette = document.querySelector('label[for="add-expense-amount"]');
    expect(etiquette).not.toBeNull();
    // `sr-only` était le défaut : rien à l’écran ne disait ce qu’on tapait.
    expect(etiquette?.className).not.toContain('sr-only');
  });

  it('la largeur du champ suit le montant tapé', async () => {
    const user = userEvent.setup();
    await openSheet();
    const champ = screen.getByTestId('add-expense-amount');
    // Largeur fixe de 6ch avant : sur un champ vide, le cadre de focus faisait
    // 156 px pour un seul « 0 », collé contre son bord droit.
    expect(champ.className).toContain('w-[1.1ch]');
    await user.type(champ, '18,50');
    expect(champ.className).toContain('w-[5.1ch]');
    expect(champ.className).not.toContain('w-[1.1ch]');
  });
});

/**
 * Créer sa catégorie sans quitter la saisie (ADR-043).
 *
 * Le cas qui compte est le dernier : une catégorie créée a ZÉRO usage, donc le
 * classement du serveur la mettrait en dernier, donc elle tomberait derrière
 * « + N autres ». Livrer « crée ta catégorie » et la faire disparaître à
 * l'instant de sa création serait pire que ne rien livrer.
 */
describe('AddExpenseSheet — créer une catégorie', () => {
  const CREEE = { id: 'cat-coiffeur', name: 'Coiffeur', colorToken: 'rose' };

  it('le déclencheur n’est PAS dans le radiogroup des catégories', async () => {
    // Un `radiogroup` ne doit contenir que des `radio`. Le bouton de
    // débordement y vivait déjà en infraction ; y ajouter celui-ci aurait
    // aggravé le défaut au lieu de le corriger.
    await openSheet();
    const groupe = screen.getByRole('radiogroup');
    expect(groupe).not.toContainElement(screen.getByTestId('add-expense-new-category'));
    expect(within(groupe).queryByTestId('add-expense-chip-more')).toBeNull();
  });

  it('reste proposé quand l’espace n’a AUCUNE catégorie', async () => {
    // C'est l'état où créer sert le plus. Rattacher le bouton au `radiogroup`
    // l'aurait fait disparaître exactement là.
    getExpenseEntryContextAction.mockResolvedValue(
      context({ chips: [], overflow: [], preselectedId: null }),
    );
    await openSheet();
    expect(screen.getByTestId('add-expense-no-categories')).toBeInTheDocument();
    expect(screen.getByTestId('add-expense-new-category')).toBeInTheDocument();
  });

  it('ouvre la ligne de création et pré-choisit une couleur', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.click(screen.getByTestId('add-expense-new-category'));
    expect(screen.getByTestId('add-expense-new-category-name')).toBeInTheDocument();
    // Une pastille est cochée : la moins utilisée parmi les catégories connues.
    const cochees = screen
      .getAllByRole('radio')
      .filter((r) => (r as HTMLInputElement).name === 'add-expense-new-category-color')
      .filter((r) => (r as HTMLInputElement).checked);
    expect(cochees).toHaveLength(1);
  });

  it('chaque pastille porte le NOM de sa couleur, jamais la couleur seule', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.click(screen.getByTestId('add-expense-new-category'));
    expect(screen.getByRole('radio', { name: 'Bleu' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Gris' })).toBeInTheDocument();
  });

  it('Entrée soumet', async () => {
    const user = userEvent.setup();
    createExpenseCategoryAction.mockResolvedValue({ ok: true, data: CREEE });
    await openSheet();
    await user.click(screen.getByTestId('add-expense-new-category'));
    await user.type(screen.getByTestId('add-expense-new-category-name'), 'Coiffeur{Enter}');
    await waitFor(() => expect(createExpenseCategoryAction).toHaveBeenCalledTimes(1));
    expect(createExpenseCategoryAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Coiffeur' }),
    );
  });

  it('Échap referme la ligne SANS fermer la feuille ni perdre le montant', async () => {
    // `Sheet` pose son écouteur `keydown` sur `document` et referme sans
    // condition : sans `stopPropagation`, annuler la création détruirait le
    // montant déjà tapé.
    const user = userEvent.setup();
    const { onClose } = await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-new-category'));
    await user.type(screen.getByTestId('add-expense-new-category-name'), 'Coiffeur{Escape}');

    expect(screen.queryByTestId('add-expense-new-category-name')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-expense-amount')).toHaveValue('18,50');
  });

  it('un échec conserve la saisie et annonce l’erreur', async () => {
    const user = userEvent.setup();
    createExpenseCategoryAction.mockResolvedValue({
      ok: false,
      errorCode: 'errors.categories.duplicate',
    });
    await openSheet();
    await user.click(screen.getByTestId('add-expense-new-category'));
    await user.type(screen.getByTestId('add-expense-new-category-name'), 'Courses');
    await user.click(screen.getByTestId('add-expense-new-category-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-new-category-error')).toHaveAttribute('role', 'alert'),
    );
    // Retaper un nom pour un homonyme corrigible d'un caractère serait une
    // punition, pas une information.
    expect(screen.getByTestId('add-expense-new-category-name')).toHaveValue('Courses');
  });

  it('le succès rend la puce VISIBLE et sélectionnée, sans toucher au montant', async () => {
    const user = userEvent.setup();
    createExpenseCategoryAction.mockResolvedValue({ ok: true, data: CREEE });
    await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-new-category'));
    await user.type(screen.getByTestId('add-expense-new-category-name'), 'Coiffeur');
    await user.click(screen.getByTestId('add-expense-new-category-submit'));

    const puce = await screen.findByTestId(`add-expense-chip-${CREEE.id}`);
    expect(puce).toBeInTheDocument();
    expect(puce).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('add-expense-new-category-name')).toBeNull();
    expect(screen.getByTestId('add-expense-amount')).toHaveValue('18,50');
  });

  it('la dépense part sous la catégorie qui vient d’être créée', async () => {
    // La preuve de bout en bout : sans elle, la puce pourrait paraître
    // sélectionnée sans que l'identifiant atteigne l'insertion.
    const user = userEvent.setup();
    createExpenseCategoryAction.mockResolvedValue({ ok: true, data: CREEE });
    await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.click(screen.getByTestId('add-expense-new-category'));
    await user.type(screen.getByTestId('add-expense-new-category-name'), 'Coiffeur');
    await user.click(screen.getByTestId('add-expense-new-category-submit'));
    await screen.findByTestId(`add-expense-chip-${CREEE.id}`);
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: CREEE.id }),
    );
  });
});

/**
 * F-6 — no category ticked for you on a workspace that has never used one, and
 * no expense leaves without a category.
 */
describe('F-6 — the category is chosen, never assumed', () => {
  it('with nothing pre-selected, no chip is ticked', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ preselectedId: null }));
    await openSheet();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('holds the button and says why, once an amount is typed', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ preselectedId: null }));
    const user = userEvent.setup();
    await openSheet();

    // No amount yet: nothing to explain.
    expect(screen.queryByTestId('add-expense-category-required')).not.toBeInTheDocument();

    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    expect(screen.getByTestId('add-expense-submit')).toBeDisabled();
    expect(screen.getByTestId('add-expense-category-required')).toHaveTextContent(
      'Choisis une catégorie pour enregistrer.',
    );

    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    expect(screen.getByTestId('add-expense-submit')).toBeEnabled();
    expect(screen.queryByTestId('add-expense-category-required')).not.toBeInTheDocument();
  });

  it('three gestures still record it: amount, chip, submit', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ preselectedId: null }));
    const user = userEvent.setup();
    await openSheet();

    await user.type(screen.getByTestId('add-expense-amount'), '5,05');
    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({
      amount: 5.05,
      categoryId: CARBURANT.id,
      label: 'Carburant',
    });
  });

  it('on close, the choice goes back to the pre-selection — null included', async () => {
    getExpenseEntryContextAction.mockResolvedValue(context({ preselectedId: null }));
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());

    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    rerender(<AddExpenseSheet open={false} onClose={onClose} />);
    rerender(<AddExpenseSheet open onClose={onClose} />);

    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());
    expect(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`)).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('on close, the choice goes back to the pre-selected category when there is one', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());

    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    rerender(<AddExpenseSheet open={false} onClose={onClose} />);
    rerender(<AddExpenseSheet open onClose={onClose} />);

    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());
    expect(screen.getByTestId(`add-expense-chip-${COURSES.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('an empty workspace is told to create a category first', async () => {
    getExpenseEntryContextAction.mockResolvedValue(
      context({ chips: [], overflow: [], preselectedId: null }),
    );
    await openSheet();
    const message = screen.getByTestId('add-expense-no-categories').textContent ?? '';
    expect(message).toContain('Crée d’abord une catégorie');
    // The old promise — « le montant sera enregistré sans catégorie » — is gone.
    expect(message).not.toContain('sans catégorie');
    expect(screen.getByTestId('add-expense-new-category')).toBeInTheDocument();
  });
});

/** F-18 — a note, folded away until asked for. */
describe('the note', () => {
  it('is folded behind a 44 px link, under the date', async () => {
    await openSheet();
    expect(screen.queryByTestId('add-expense-note')).not.toBeInTheDocument();
    const toggle = screen.getByTestId('add-expense-note-toggle');
    expect(toggle).toHaveTextContent('Ajouter une note');
    expect(toggle.className).toContain('min-h-11');
    expect(
      screen.getByTestId('add-expense-date').compareDocumentPosition(toggle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('unfolds into a labelled field of 500 characters at most', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.click(screen.getByTestId('add-expense-note-toggle'));
    const note = screen.getByTestId('add-expense-note');
    expect(note.tagName).toBe('TEXTAREA');
    expect(note).toHaveAttribute('maxLength', '500');
    expect(screen.getByLabelText('Note')).toBe(note);
  });

  it('leaves with the expense, trimmed', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '7,05');
    await user.click(screen.getByTestId('add-expense-note-toggle'));
    await user.type(screen.getByTestId('add-expense-note'), '  À rembourser par Léa  ');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({
      note: 'À rembourser par Léa',
    });
  });

  it('an empty note leaves as null', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '7,05');
    await user.click(screen.getByTestId('add-expense-note-toggle'));
    await user.type(screen.getByTestId('add-expense-note'), '   ');
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({ note: null });
  });

  it('is folded and emptied when the sheet closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());

    await user.click(screen.getByTestId('add-expense-note-toggle'));
    await user.type(screen.getByTestId('add-expense-note'), 'Brouillon');
    rerender(<AddExpenseSheet open={false} onClose={onClose} />);
    rerender(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());

    expect(screen.queryByTestId('add-expense-note')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('add-expense-note-toggle'));
    expect(screen.getByTestId('add-expense-note')).toHaveValue('');
  });
});

/**
 * v3 mock-up, rule 26 — the description says WHERE, the category says WHAT.
 * A combobox (ARIA 1.2, list autocomplete): the person's own descriptions
 * first, then the built-in brands; choosing one ticks the category it implies.
 */
describe('the description — suggestions and recall', () => {
  const EXTRA = { id: 'cat-cadeaux', name: 'Cadeaux', colorToken: 'pink' };
  const MINE = [
    { label: 'Boulangerie Pierre', categoryId: RESTO.id, count: 4, lastOn: '2026-07-10' },
    { label: 'Chez Paul', categoryId: null, count: 1, lastOn: '2026-07-09' },
    { label: 'Anniversaire Léa', categoryId: EXTRA.id, count: 1, lastOn: '2026-07-08' },
  ];

  function withMine(over: Record<string, unknown> = {}) {
    getExpenseEntryContextAction.mockResolvedValue(
      context({ preselectedId: null, descriptions: MINE, overflow: [EXTRA], ...over }),
    );
  }

  const field = () => screen.getByTestId('add-expense-label');
  const options = () => screen.queryAllByTestId('add-expense-description-option');

  it('is labelled « Description » and keeps the fallback as placeholder', async () => {
    await openSheet();
    expect(document.querySelector('label[for="add-expense-label"]')?.textContent).toBe(
      'Description',
    );
    expect(field()).toHaveAttribute('placeholder', 'Courses');
  });

  it('sits between the amount and the categories, the date after them', async () => {
    await openSheet();
    const order = [
      screen.getByTestId('add-expense-amount'),
      field(),
      screen.getByRole('radiogroup'),
      screen.getByTestId('add-expense-date'),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('is an ARIA 1.2 combobox, collapsed until something is typed', async () => {
    await openSheet();
    expect(field()).toHaveAttribute('role', 'combobox');
    expect(field()).toHaveAttribute('aria-autocomplete', 'list');
    expect(field()).toHaveAttribute('aria-controls', 'add-expense-description-list');
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(options()).toHaveLength(0);
  });

  it('suggests brands from the first letters, each with the category it will tick', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'colr');

    expect(field()).toHaveAttribute('aria-expanded', 'true');
    const [first] = options();
    expect(first).toHaveAttribute('role', 'option');
    expect(first?.textContent).toContain('Colruyt');
    expect(first?.textContent).toContain('Courses');
    expect(first?.className).toContain('min-h-11');
    // The list lives OUTSIDE the label: a click in a label is forwarded to its input.
    const list = document.getElementById('add-expense-description-list');
    expect(list).toHaveAttribute('role', 'listbox');
    expect(list?.closest('label')).toBeNull();
  });

  it('puts the person’s own descriptions before the brands', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'b');
    expect(options()[0]?.textContent).toContain('Boulangerie Pierre');
    // The second line names the category it will tick.
    expect(options()[0]?.textContent).toContain(RESTO.name);
  });

  it('choosing a suggestion fills the field and ticks its category', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'colr');
    await user.click(options()[0]!);

    expect(field()).toHaveValue('Colruyt');
    expect(screen.getByTestId(`add-expense-chip-${COURSES.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(options()).toHaveLength(0);
    expect(field()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a suggestion without a category leaves the ticked one alone', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    await user.type(field(), 'chez');
    await user.click(options()[0]!);

    expect(field()).toHaveValue('Chez Paul');
    expect(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('the arrows move the active option, Enter chooses it', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'b');
    expect(field()).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    const active = field().getAttribute('aria-activedescendant');
    expect(active).toBe(options()[0]?.id);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[1]?.id);
    await user.keyboard('{ArrowUp}');
    expect(field().getAttribute('aria-activedescendant')).toBe(options()[0]?.id);

    await user.keyboard('{Enter}');
    expect(field()).toHaveValue('Boulangerie Pierre');
    expect(screen.getByTestId(`add-expense-chip-${RESTO.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('Escape closes the list without closing the sheet; a second Escape closes the sheet', async () => {
    const user = userEvent.setup();
    const { onClose } = await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '18,50');
    await user.type(field(), 'colr');
    expect(options().length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(options()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-expense-amount')).toHaveValue('18,50');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  /*
    The list does not close on blur (see the component), so moving to another
    FIELD has to close it: otherwise it stays open under a field the person has
    left, announced as expanded to a screen reader that is now elsewhere.
  */
  it('closes when the amount field takes the focus', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'colr');
    expect(field()).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByTestId('add-expense-amount'));
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(options()).toHaveLength(0);
  });

  it('closes when the date field takes the focus', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'colr');
    expect(field()).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByTestId('add-expense-date'));
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(options()).toHaveLength(0);
  });

  it('closes when the note field takes the focus', async () => {
    const user = userEvent.setup();
    await openSheet();
    await user.click(screen.getByTestId('add-expense-note-toggle'));
    await user.type(field(), 'colr');
    expect(field()).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByTestId('add-expense-note'));
    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(options()).toHaveLength(0);
  });

  it('marks the active option by more than a background tint', async () => {
    // `bg-surface-muted` alone is a tint a few percent away from the card:
    // the keyboard position must also read as an outline.
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'colr');
    const option = options()[0]!;
    expect(option.className).toContain('aria-selected:ring-2');
    expect(option.className).toContain('aria-selected:ring-inset');
    expect(option.className).toContain('aria-selected:ring-brand-600');
    expect(option.className).toContain('aria-selected:bg-surface-muted');
  });

  it('turns off autocorrect and spellcheck, but keeps the capital letter', async () => {
    // A brand name corrected into a dictionary word stops matching the
    // suggestions; a capitalised first letter is what a description should have.
    await openSheet();
    expect(field()).toHaveAttribute('autocorrect', 'off');
    expect(field()).toHaveAttribute('spellcheck', 'false');
    expect(field()).not.toHaveAttribute('autocapitalize');
  });

  it('typing one of the person’s descriptions in full ticks its category, no click', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.type(field(), 'boulangerie pierre');
    expect(screen.getByTestId(`add-expense-chip-${RESTO.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('…unless the person already picked a chip in this opening', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.click(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`));
    await user.type(field(), 'Boulangerie Pierre');
    expect(screen.getByTestId(`add-expense-chip-${CARBURANT.id}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId(`add-expense-chip-${RESTO.id}`)).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('a ticked category hidden in the overflow is shown in the row', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    expect(screen.queryByTestId(`add-expense-chip-${EXTRA.id}`)).not.toBeInTheDocument();

    await user.type(field(), 'anniv');
    await user.click(options()[0]!);

    const chip = screen.getByTestId(`add-expense-chip-${EXTRA.id}`);
    expect(chip).toHaveAttribute('aria-checked', 'true');
    // Nothing left behind « + N autres »: the only overflow category is on show.
    expect(screen.queryByTestId('add-expense-chip-more')).not.toBeInTheDocument();
  });

  it('sends the chosen description and its category', async () => {
    withMine();
    const user = userEvent.setup();
    await openSheet();
    await user.type(screen.getByTestId('add-expense-amount'), '7,05');
    await user.type(field(), 'colr');
    await user.click(options()[0]!);
    await user.click(screen.getByTestId('add-expense-submit'));

    await waitFor(() => expect(createExpenseAction).toHaveBeenCalledTimes(1));
    expect(createExpenseAction.mock.calls[0]?.[0]).toMatchObject({
      label: 'Colruyt',
      categoryId: COURSES.id,
      amount: 7.05,
    });
  });

  it('the description is emptied and the list closed when the sheet closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());
    await user.type(field(), 'colr');
    rerender(<AddExpenseSheet open={false} onClose={onClose} />);
    rerender(<AddExpenseSheet open onClose={onClose} />);
    await waitFor(() => expect(screen.getByTestId('add-expense-projection')).toBeInTheDocument());

    expect(field()).toHaveValue('');
    expect(options()).toHaveLength(0);
  });
});
