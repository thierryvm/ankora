'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Sheet } from '@/components/primitives/Sheet';
import { toast } from '@/components/ui/toast';
import { createExpenseCategoryAction } from '@/lib/actions/categories';
import { createExpenseAction } from '@/lib/actions/expenses';
import { getExpenseEntryContextAction } from '@/lib/actions/expense-entry';
import { CATEGORY_COLOR_TOKENS, couleurLaMoinsUtilisee } from '@/lib/domain/categories';
import {
  recallCategory,
  suggestDescriptions,
  type DescriptionSuggestion,
} from '@/lib/domain/expense-descriptions';
import type { ExpenseEntryCategory, ExpenseEntryContext } from '@/lib/actions/expense-entry.types';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { announceOptimisticSpend, settleSpend } from '@/lib/expenses/optimistic-spend';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { formatCurrency } from '@/lib/i18n/formatters';
import { dayOffsetFrom, todayInAnkoraTz } from '@/lib/date/tz';
import type { Locale } from '@/i18n/routing';

/**
 * « Nouvelle dépense » — the short entry flow (`DECISIONS-ANKORA.md` §3.4).
 *
 * ## The count, honestly
 *
 *   TAP 1  ⊕ — the sheet rises, the numeric keypad is ALREADY up and the caret
 *              is in the amount field. Date defaults to today, the description
 *              is optional.
 *   (typing the amount is not a tap — the keyboard is already open and focused)
 *   TAP 2  a category chip — ONLY when none is pre-selected (F-6). The most-used
 *              category is pre-selected once it has been used in the last 30
 *              days; on a fresh workspace nothing is, because the first chip is
 *              then merely the first in declaration order, and pre-selecting it
 *              filed expenses under a category nobody chose.
 *   TAP 3  Ajouter — pinned above the keyboard, reachable by the thumb.
 *
 * So: amount, chip, submit on a fresh workspace; amount, submit once a habit
 * exists. No expense leaves without a category — the button waits, and a line
 * under the chips says why.
 *
 * The description is a combobox (v3 mock-up, rule 26): the person's own
 * descriptions first, then the built-in brands, each ticking the category it
 * implies. It stays optional and falls back to the category name.
 *
 * ## The detail that makes it a decision rather than bookkeeping
 *
 * Under the amount, in 12 px: **« Il te restera 429,89 € »**. The consequence
 * is shown BEFORE the commit. That single line is what separates Ankora from a
 * notebook — you are not recording what you spent, you are deciding whether to.
 *
 * ## Loading, deliberately not blocking
 *
 * Categories and « Il te reste » come from a server action fired on EVERY
 * opening (PR D) — a failed read included, which the next opening retries. The
 * amount field is live before it resolves — a user who taps ⊕ and types
 * immediately never waits. The chips land into a skeleton until a first read
 * succeeds, and keep those of the last good read after that; the projection shows its skeleton
 * until the new read arrives, never an old figure.
 */

/**
 * Largeur du champ montant, en caractères, indexée par le nombre de caractères
 * tapés.
 *
 * **Pourquoi une table et non un calcul.** Le champ avait une largeur FIXE de
 * `6ch` avec le texte aligné à droite, pour que le « € » reste collé aux
 * chiffres. Conséquence mesurée le 2026-08-23 : sur un montant vide, le cadre de
 * focus faisait 156 px pour un seul « 0 » — un rectangle presque vide avec le
 * chiffre écrasé contre son bord droit. C'est une part du « horrible
 * visuellement » signalé par @thierry.
 *
 * `field-sizing: content` réglerait cela en une ligne et reste hors de la base
 * de compatibilité de ce projet (Chrome 111 / Safari 16.2). Une largeur en
 * `style` inline est refusée par la CSP. Restent des classes littérales — que
 * Tailwind ne génère QUE s'il les lit telles quelles dans la source, d'où cette
 * table écrite en toutes lettres plutôt qu'un gabarit interpolé.
 *
 * Le `.1` de rattrapage couvre le curseur et l'inexactitude de `ch` sur les
 * séparateurs : `tabular-nums` égalise les chiffres entre eux, pas la virgule.
 */
const LARGEURS_MONTANT = [
  'w-[1.1ch]',
  'w-[2.1ch]',
  'w-[3.1ch]',
  'w-[4.1ch]',
  'w-[5.1ch]',
  'w-[6.1ch]',
  'w-[7.1ch]',
  'w-[8.1ch]',
  'w-[9.1ch]',
  'w-[10.1ch]',
] as const;

/**
 * Chip palette. Closed set, mirroring the DB `color_token` check constraint.
 *
 * ## `pink` a cessé d'être un doublon de `rose` — 2026-08-23
 *
 * Les deux pointaient sur `bg-danger`. Sur une pastille de 8 px posée à côté
 * d'un NOM, c'était sans conséquence : personne ne lit la couleur, on lit
 * « Loisirs ». Le jour où ces huit jetons deviennent un CHOIX — le sélecteur de
 * couleur d'une catégorie qu'on crée — deux pastilles identiques rendent le
 * contrôle cassé : on clique l'une, l'autre reste allumée à l'identique, et
 * rien ne dit laquelle on a prise. Mesuré à la capture 390 × 844.
 *
 * `pink` devient donc un dérivé de `--color-danger` éclairci vers la carte, et
 * non une couleur neuve : la palette reste fermée, la teinte reste de la
 * famille, et les deux se distinguent enfin. `color-mix` dans une classe
 * Tailwind, jamais dans un `style` inline — la CSP refuse le second.
 */
const CHIP_DOT: Record<string, string> = {
  blue: 'bg-info',
  cyan: 'bg-brand-500',
  emerald: 'bg-success',
  amber: 'bg-warning',
  rose: 'bg-danger',
  pink: 'bg-[color-mix(in_oklab,var(--color-danger)_55%,var(--color-card))]',
  purple: 'bg-accent-600',
  zinc: 'bg-muted-foreground',
};

/**
 * Parse what a francophone actually types. `1.234,56` and `1234.56` are both
 * meant as the same amount; a bare `Number()` reads the first as 1.234.
 * Returns `null` for anything that is not a single positive amount.
 */
export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s| /g, '');
  if (trimmed === '') return null;
  // Whichever separator appears LAST is the decimal one; earlier ones group.
  const decimalAt = Math.max(trimmed.lastIndexOf(','), trimmed.lastIndexOf('.'));
  const integerPart = decimalAt === -1 ? trimmed : trimmed.slice(0, decimalAt);
  const decimalPart = decimalAt === -1 ? '' : trimmed.slice(decimalAt + 1);

  // Grouping, if present, must actually BE grouping: `1.234,56` is an amount,
  // `1,2,3` is a typo. Without this check the latter silently became 12,30 € —
  // a wrong figure accepted without a word, on the one field that matters.
  const groups = integerPart.split(/[.,]/);
  if (groups.length > 1 && !groups.slice(1).every((group) => /^\d{3}$/.test(group))) return null;

  const normalised = decimalAt === -1 ? groups.join('') : `${groups.join('')}.${decimalPart}`;
  if (!/^\d+(\.\d*)?$/.test(normalised)) return null;
  const value = Number(normalised);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export type AddExpenseSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function AddExpenseSheet({ open, onClose }: AddExpenseSheetProps) {
  const t = useTranslations('app.expenses.addSheet');
  const locale = useLocale() as Locale;
  const translateError = useActionErrorTranslator();
  const fmt = (value: number) => formatCurrency(value, locale);

  const amountRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayInAnkoraTz());
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // A chip clicked (or a category created) in THIS opening: from then on a
  // description typed in full no longer re-ticks the recalled category — the
  // person's own choice wins over our memory of their habits.
  const [pickedByHand, setPickedByHand] = useState(false);

  // The description combobox (v3 mock-up, rule 26).
  const [descriptionListOpen, setDescriptionListOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  // The note (F-18), folded until asked for.
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  /*
    Créer une catégorie sans quitter la saisie en cours.

    `justCreated` est ce qui règle le trou de visibilité : le classement des
    puces trie par nombre d'usages sur 30 jours, donc une catégorie qui vient
    d'être créée a ZÉRO usage, sort dernière, et tomberait dans le débordement.
    On aurait livré « crée ta catégorie » et elle aurait disparu à l'instant de
    sa création. Elle est donc ajoutée localement à la rangée, et rien n'est
    évincé — les puces passent à la ligne depuis le chantier du 23 août.
  */
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<string>(CATEGORY_COLOR_TOKENS[0]);
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [isCreatingCategory, startCreateCategory] = useTransition();
  const [justCreated, setJustCreated] = useState<ExpenseEntryCategory[]>([]);
  const newCategoryInputRef = useRef<HTMLInputElement>(null);
  const newCategoryBlockRef = useRef<HTMLDivElement>(null);

  const [context, setContext] = useState<ExpenseEntryContext | null>(null);
  const [contextFailed, setContextFailed] = useState(false);

  // Read again on EVERY opening (PR D). The figures inside the context are not
  // this sheet's to keep: a transfer with a free share or money received moves
  // « Il te reste » from another screen, and a context kept from the first open
  // would compute « Il te restera » on the old figure. The chips of the last
  // read stay on screen while the new one lands; the FIGURES do not —
  // `figuresFresh` is false from the moment the sheet closes until the new read
  // arrives, and the projection shows its skeleton in between.
  //
  // `pendingLocal` covers spends made in this same opening, which the read
  // predates. Every opening starts with a new read, so it goes back to zero on
  // close — never on arrival, which could land after a submit of this opening.
  const [pendingLocal, setPendingLocal] = useState(0);
  const [figuresFresh, setFiguresFresh] = useState(false);

  useEffect(() => {
    if (!open) {
      setFiguresFresh(false);
      // A failed read belongs to the opening it happened in: the next one reads
      // again, or a single dropped request would leave the sheet chipless for
      // the rest of the session.
      setContextFailed(false);
      setPendingLocal(0);
      return;
    }
    if (figuresFresh || contextFailed) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getExpenseEntryContextAction();
        if (cancelled) return;
        if (!result.ok) {
          setContextFailed(true);
          return;
        }
        setContext(result.data);
        setFiguresFresh(true);
        setCategoryId((current) => current ?? result.data.preselectedId);
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        if (!cancelled) setContextFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, figuresFresh, contextFailed]);

  // Reset the volatile fields between two entries, keep the fetched taxonomy.
  // Amount and label MUST clear: re-opening the sheet on the previous amount
  // is how a duplicate expense gets recorded by accident.
  useEffect(() => {
    if (open) return;
    setAmount('');
    setLabel('');
    setDescriptionListOpen(false);
    setActiveSuggestion(-1);
    setNote('');
    setNoteOpen(false);
    setShowAllCategories(false);
    setOccurredOn(todayInAnkoraTz());
    // Back to the pre-selection — which may be null (F-6): a choice made in
    // one opening must not silently carry over to the next expense.
    setCategoryId(context?.preselectedId ?? null);
    setPickedByHand(false);
    // La LIGNE de création se referme, mais `justCreated` NON : la catégorie
    // existe réellement en base, et la faire disparaître à la fermeture de la
    // feuille reproduirait exactement le défaut qu'elle corrige.
    setCreatingCategory(false);
    setNewCategoryName('');
    setNewCategoryError(null);
  }, [open, context?.preselectedId]);

  const parsed = parseAmountInput(amount);
  // F-6: no category, no submit. The server refuses it too; the button says so
  // first, and the line under the chips says why.
  const canSubmit = parsed !== null && categoryId !== null && !isSubmitting;
  const categoryMissing = parsed !== null && categoryId === null && context !== null;

  const chips = context?.chips ?? [];
  const overflow = context?.overflow ?? [];
  // Every category this sheet knows — the source for names, suggestions and
  // recall, whether or not its chip is currently on show.
  const knownCategories: ExpenseEntryCategory[] = [...chips, ...overflow, ...justCreated];
  const ownDescriptions = context?.descriptions ?? [];

  // v3 rule 25 — « the chips, plus the chosen one if it is not among them »: a
  // category ticked by a suggestion or a recall may live in the overflow, and
  // a ticked category nobody can see is a choice nobody can check.
  const pinned =
    !showAllCategories && categoryId !== null
      ? overflow.find((category) => category.id === categoryId)
      : undefined;
  const hiddenCount = showAllCategories
    ? 0
    : overflow.filter((category) => category.id !== pinned?.id).length;
  const categories: ExpenseEntryCategory[] = [
    ...(showAllCategories ? [...chips, ...overflow] : [...chips, ...(pinned ? [pinned] : [])]),
    ...justCreated,
  ];
  const selectedName = knownCategories.find((c) => c.id === categoryId)?.name ?? '';

  const suggestions = descriptionListOpen
    ? suggestDescriptions(label, ownDescriptions, knownCategories)
    : [];
  const listShown = suggestions.length > 0;
  const activeIndex =
    listShown && activeSuggestion >= 0 ? Math.min(activeSuggestion, suggestions.length - 1) : -1;

  const closeDescriptionList = () => {
    setDescriptionListOpen(false);
    setActiveSuggestion(-1);
  };

  const pickCategory = (id: string) => {
    setCategoryId(id);
    setPickedByHand(true);
    // Closed AFTER the click completes, never on the press: see the note on
    // the description list below.
    closeDescriptionList();
  };

  const changeDescription = (value: string) => {
    setLabel(value);
    setDescriptionListOpen(true);
    setActiveSuggestion(-1);
    // A description typed in full that the person has written before ticks
    // the category it was filed under — unless they already chose one here.
    if (!pickedByHand) {
      const recalled = recallCategory(value, ownDescriptions, knownCategories);
      if (recalled !== null) setCategoryId(recalled);
    }
  };

  const chooseSuggestion = (suggestion: DescriptionSuggestion) => {
    setLabel(suggestion.label);
    // No category implied: the one already ticked stays.
    if (suggestion.categoryId !== null) setCategoryId(suggestion.categoryId);
    closeDescriptionList();
  };

  const handleDescriptionKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!listShown) {
        setDescriptionListOpen(true);
        return;
      }
      const count = suggestions.length;
      setActiveSuggestion(
        event.key === 'ArrowDown'
          ? (activeIndex + 1) % count
          : activeIndex <= 0
            ? count - 1
            : activeIndex - 1,
      );
      return;
    }
    if (event.key === 'Enter' && listShown && activeIndex >= 0) {
      event.preventDefault();
      const chosen = suggestions[activeIndex];
      if (chosen) chooseSuggestion(chosen);
      return;
    }
    /*
      `stopPropagation` is not a precaution: `Sheet` listens for `keydown` on
      `document` and closes unconditionally. Without it, Escape meant to close
      the list would close the sheet and lose the amount already typed. With
      the list closed, the next Escape reaches `Sheet` and closes it.
    */
    if (event.key === 'Escape' && listShown) {
      event.stopPropagation();
      event.preventDefault();
      closeDescriptionList();
    }
  };

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  // « Il te restera X € » — the line that turns entry into a decision — and its
  // twin, « Dépensé ce mois », which the curve of the month reads.
  //
  // Built as ONE object from ONE guard: the two figures describe the same
  // month, so a state where one exists and the other does not would be a
  // contradiction we would then have to handle. `pendingLocal` accounts for
  // spends made in this same sheet session, since the fetched context predates
  // them — it is added to one and subtracted from the other, which is the same
  // statement said twice.
  const optimiste =
    context && figuresFresh && !context.incomplet
      ? {
          ilTeReste: context.ilTeReste - pendingLocal - (parsed ?? 0),
          depensesDuMois: context.depensesDuMois + pendingLocal + (parsed ?? 0),
        }
      : null;
  const projection = optimiste?.ilTeReste ?? null;

  const isCurrentMonth = occurredOn.slice(0, 7) === todayInAnkoraTz().slice(0, 7);

  /**
   * « Aujourd'hui » / « Hier » when the date has a name, `null` otherwise.
   *
   * Only two offsets get a word. « Avant-hier » exists in French but is read
   * more slowly than the date it replaces, and beyond that the figures are
   * simply clearer — so the friendly label stops exactly where it stops helping.
   */
  const dayOffset = dayOffsetFrom(todayInAnkoraTz(), occurredOn);
  const friendlyDate =
    dayOffset === 0 ? t('dateToday') : dayOffset === -1 ? t('dateYesterday') : null;

  /**
   * Ouvre la ligne de création, en pré-choisissant une pastille.
   *
   * « La moins utilisée » et non « la première libre » : les 8 jetons sont tous
   * consommés dès l'inscription, donc une règle « libre » ne se déclencherait
   * jamais. Cf. `couleurLaMoinsUtilisee`, qui documente aussi que la PREMIÈRE
   * catégorie créée sera bleue pour tout le monde — la variété commence à la
   * deuxième.
   */
  const openCategoryCreation = useCallback(() => {
    const connues = [...(context?.chips ?? []), ...(context?.overflow ?? []), ...justCreated].map(
      (c) => ({
        id: c.id,
        name: c.name,
        kind: 'variable' as const,
        colorToken: c.colorToken as (typeof CATEGORY_COLOR_TOKENS)[number],
        isSystem: false,
      }),
    );
    setNewCategoryColor(couleurLaMoinsUtilisee(connues));
    setNewCategoryName('');
    setNewCategoryError(null);
    setCreatingCategory(true);
  }, [context?.chips, context?.overflow, justCreated]);

  /*
    La ligne s'ouvre SOUS le pli — mesuré à 390 × 844, les pastilles et les deux
    boutons tombaient hors écran. Le contenu de la feuille défile, donc rien
    n'était perdu ; mais une ligne qu'il faut chercher est une ligne qu'on croit
    absente. On l'amène à l'écran plutôt que de compter sur le réflexe de faire
    défiler.

    `requestAnimationFrame` parce que le nœud n'existe pas encore au moment où
    l'état change ; `block: 'nearest'` pour ne pas arracher le champ montant du
    haut de la feuille quand la place suffit déjà.
  */
  useEffect(() => {
    if (!creatingCategory) return;
    const id = requestAnimationFrame(() => {
      // Le BLOC, pas le champ : le champ est déjà visible quand on l'ouvre,
      // donc le viser ne déplacerait rien — ce sont les huit pastilles et les
      // deux boutons, sous le pli, qu'il faut amener à l'écran. Mesuré à
      // 390 × 844 : « Créer » tombait hors champ, et un formulaire dont on ne
      // voit pas le bouton se lit comme un formulaire qui ne se valide pas.
      //
      // Appel optionnel : `scrollIntoView` n'existe pas dans jsdom, et une
      // commodité d'affichage ne doit pas faire tomber le composant là où elle
      // manque. Le `?.()` est pour l'environnement, pas pour faire taire un test.
      // `end` et non `nearest` : `nearest` ne déplace rien tant que le HAUT du
      // bloc est visible, ce qui était exactement le cas — les pastilles et les
      // boutons restaient dessous. Le bloc fait ~220 px pour ~500 px de zone
      // utile, donc l'amener par le bas ne chasse pas son propre titre.
      newCategoryBlockRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [creatingCategory]);

  const handleCreateCategory = useCallback(() => {
    const nom = newCategoryName.trim();
    if (nom === '' || isCreatingCategory) return;
    setNewCategoryError(null);

    startCreateCategory(async () => {
      try {
        const result = await createExpenseCategoryAction({
          name: nom,
          colorToken: newCategoryColor,
        });
        if (!result.ok) {
          // La saisie est CONSERVÉE. Vider le champ sur échec obligerait à
          // retaper un nom que l'utilisateur vient d'écrire, pour une erreur
          // qui est souvent un simple homonyme à corriger d'un caractère.
          setNewCategoryError(translateError(result.errorCode));
          return;
        }
        // Ajoutée à la rangée ET sélectionnée : on vient de la créer, c'est
        // évidemment celle qu'on veut. Sans ça, elle partirait au fond du
        // classement (zéro usage) et se retrouverait derrière « + N autres ».
        setJustCreated((current) => [...current, result.data]);
        setCategoryId(result.data.id);
        setPickedByHand(true);
        setCreatingCategory(false);
        setNewCategoryName('');
        // Le focus revient là où l'utilisateur allait de toute façon.
        amountRef.current?.focus();
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        setNewCategoryError(translateError('errors.categories.createFailed'));
      }
    });
  }, [newCategoryName, newCategoryColor, isCreatingCategory, translateError]);

  const handleSubmit = useCallback(() => {
    const value = parseAmountInput(amount);
    // F-6 — the button is disabled in both cases; this guard keeps a stray
    // Enter from sending what the server would refuse anyway.
    if (value === null || categoryId === null) return;

    // The description is optional and falls back to the category name — typing
    // one would otherwise be a mandatory extra step on every entry.
    const resolvedLabel = label.trim() || selectedName || t('fallbackLabel');
    const resolvedNote = note.trim() || null;
    // Only a spend inside the current month moves this month's hero. A
    // backdated one is recorded, and correctly changes nothing on screen.
    // `optimiste` is null when income is unconfigured (THI-335) — there is no
    // figure to be optimistic about, so the hero is left alone.
    const affectsHero = isCurrentMonth && optimiste !== null;

    // The RESULTING figures, not the amount spent: « Il te restera X € » is
    // what this sheet is already showing, and publishing absolutes makes the
    // update idempotent (see `optimistic-spend.ts`). Both travel together, so
    // the number and the curve cannot end up describing different months.
    if (affectsHero) announceOptimisticSpend(optimiste);
    setPendingLocal((current) => current + value);

    startSubmit(async () => {
      try {
        const result = await createExpenseAction({
          label: resolvedLabel,
          amount: value,
          occurredOn,
          categoryId,
          note: resolvedNote,
        });
        if (result.ok) {
          toast.success(t('toastCreated', { amount: fmt(value) }));
          onClose();
          return;
        }
        // Revert the optimistic descent before saying why. Leaving the hero
        // down on a rejected insert is the one failure mode worse than the
        // round-trip delay it exists to hide.
        if (affectsHero) settleSpend();
        setPendingLocal((current) => Math.max(0, current - value));
        toast.error(translateError(result.errorCode));
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        if (affectsHero) settleSpend();
        setPendingLocal((current) => Math.max(0, current - value));
        // eslint-disable-next-line no-console
        console.error('createExpenseAction threw', err);
        toast.error(translateError('errors.expenses.createFailed'));
      }
    });
    // `fmt` and `t` are recreated per render by next-intl; including them would
    // rebuild this callback on every keystroke for no behavioural gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    amount,
    label,
    note,
    selectedName,
    occurredOn,
    categoryId,
    isCurrentMonth,
    projection,
    onClose,
    translateError,
  ]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      testId="add-expense-sheet"
      closeLabel={t('close')}
      initialFocusRef={amountRef}
      /*
        Boîte centrée à partir de `md`, jamais la colonne pleine hauteur.

        MESURÉ le 2026-08-23 sur un écran de 1280 × 900 : le panneau latéral
        laissait **484 px de vide** entre le dernier champ et le bouton
        « Ajouter » — plus de la moitié de sa hauteur. Une colonne pleine
        hauteur est la bonne forme pour une NAVIGATION, qui la remplit ; ce
        formulaire fait cinq champs, et une boîte de la taille de ce qu'elle
        contient n'a pas de vide à distribuer. Le menu « Plus » garde la
        colonne, qui reste le défaut de la primitive.
      */
      desktop="dialog"
      leading={
        <button
          type="button"
          onClick={onClose}
          data-testid="add-expense-cancel"
          className="text-brand-text-strong focus-visible:ring-brand-600 -mx-2 flex min-h-11 items-center rounded-md px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          {t('cancel')}
        </button>
      }
      hideCloseButton
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-describedby={categoryMissing ? 'add-expense-category-required' : undefined}
          data-testid="add-expense-submit"
          className="bg-brand-700 text-primary-foreground focus-visible:ring-brand-600 hover:bg-brand-800 flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {/*
          ---------- 1. Le montant. Le seul champ qui compte. ----------

          Le pavé gris est parti. Mesuré le 2026-08-23 : il faisait **134 px de
          haut pour un champ de 66 px** — soit 68 px de rembourrage autour d'un
          nombre — et occupait **30 % de la feuille** sur un iPhone 14. Constat
          de @thierry : « l'encadrement pour rajouter un montant est juste
          énorme et horrible visuellement ».

          À la place, la grammaire que le cockpit vient d'adopter : une micro-
          étiquette en capitales, le nombre en grand, la conséquence dessous.
          L'étiquette devient VISIBLE — elle était `sr-only`, donc l'écran ne
          disait nulle part ce qu'on tapait — et un filet sous le nombre garde
          l'affordance de champ que le pavé portait, pour 2 px au lieu de 68.
        */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <label
            htmlFor="add-expense-amount"
            className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase"
          >
            {t('amountLabel')}
          </label>
          {/*
            Le filet est l'affordance AU REPOS, et rien d'autre : il ne s'allume
            pas au focus. `globals.css` porte une règle `:focus-visible`
            NON-LAYERÉE — donc prioritaire sur toute utilitaire Tailwind, y
            compris le `outline-none` de l'`input` ci-dessous, ce qui se vérifie
            au navigateur : l'outline calculée vaut bien 2 px brand. Le champ a
            donc déjà son indicateur de focus, à l'échelle de toute l'app. En
            ajouter un second, d'une autre forme, donnait deux cadres qui ne se
            recouvraient pas.

            `min-w-44` et non `w-44` : le filet garde une longueur lisible quand
            le champ ne fait qu'un caractère, et s'allonge si le montant dépasse.
          */}
          <div className="border-border flex min-w-44 items-baseline justify-center gap-2.5 border-b pb-1">
            <input
              ref={amountRef}
              id="add-expense-amount"
              // `text` with a decimal inputMode, not `number`: iOS renders the
              // right keypad for both, but `type=number` silently discards a
              // comma — the separator every francophone types — leaving the
              // field looking accepted and the value empty.
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={closeDescriptionList}
              placeholder="0"
              aria-describedby={projection !== null ? 'add-expense-projection' : undefined}
              data-testid="add-expense-amount"
              /*
                Largeur suivant le contenu via `LARGEURS_MONTANT` — cf. la note
                de cette table en tête de fichier. `text-right` est conservé :
                sur le dernier palier, quand le montant dépasse la table, les
                chiffres restent collés au « € » au lieu de s'en éloigner.
              */
              /*
                `min-w-[3ch]` : le cadre de focus de `globals.css` épouse la
                largeur du champ. Sur un champ vide de `1.1ch`, il dessinait un
                rectangle haut et étroit autour d'un seul « 0 » — et c'est
                justement l'état qu'on voit en ouvrant la feuille. Trois
                caractères de plancher lui donnent la forme d'un champ.
              */
              className={`text-foreground caret-brand-600 placeholder:text-muted-foreground/40 min-w-[3ch] border-0 bg-transparent text-right text-[40px] font-bold tracking-tight tabular-nums outline-none ${
                LARGEURS_MONTANT[Math.min(Math.max(amount.length, 1), LARGEURS_MONTANT.length) - 1]
              }`}
            />
            {/*
              `gap-2.5` (10 px) sur le conteneur, et aucune marge ici.

              Ce n'est pas un réglage à l'œil : la locale `fr-BE` place une
              ESPACE INSÉCABLE (U+00A0) entre le montant et le symbole, et c'est
              ce que `formatCurrency` produit partout ailleurs dans l'app.
              Mesuré au navigateur le 2026-08-23, cette espace rend **9,9 px**
              en Inter à 40 px. Le champ de saisie affiche donc le même écart
              que les montants formatés qu'il côtoie — sans quoi la seule
              surface où l'on ÉCRIT un montant serait la seule à ne pas
              respecter la typographie de tous ceux qu'on LIT.
            */}
            <span aria-hidden="true" className="text-muted-foreground text-xl font-semibold">
              €
            </span>
          </div>

          {/* The consequence, before the commit. */}
          {!figuresFresh && !contextFailed ? (
            <span
              aria-hidden="true"
              data-testid="add-expense-projection-skeleton"
              className="bg-muted-foreground/15 mt-1 h-4 w-40 animate-pulse rounded-full"
            />
          ) : projection !== null ? (
            <p
              id="add-expense-projection"
              aria-live="polite"
              data-testid="add-expense-projection"
              className="text-muted-foreground text-xs tabular-nums"
            >
              {parsed === null
                ? t('projectionIdle', { amount: fmt(context!.ilTeReste - pendingLocal) })
                : t('projection', { amount: fmt(projection) })}
            </p>
          ) : null}
        </div>

        {/*
          ---------- 2. La description : où l'argent est parti. ----------

          v3 mock-up, rule 26 — a combobox (ARIA 1.2, list autocomplete). From
          the first letter, six suggestions at most: the person's own
          descriptions first, then the built-in brands. Choosing one fills the
          field and ticks the category it implies.

          The list lives OUTSIDE the <label> — a click inside a label is
          forwarded to its input — and in the flow under the field, never over
          the chips it would hide.

          It does NOT close on blur, deliberately. Being in the flow, closing
          it moves the chips up; a blur fires on `mousedown`, so a tap on a
          chip would collapse the list between press and release, the release
          would land on another element, and the tap would be lost. It closes
          on a choice, on Escape, on a chip picked, when the amount, the date or
          the note takes the focus, and with the sheet.
          Options prevent `mousedown` so the field keeps the focus (and the
          phone keeps its keyboard) while one is chosen.
        */}
        <div className="flex flex-col gap-1">
          <div className="bg-surface-soft flex flex-col gap-0.5 rounded-xl px-3 py-2">
            <label
              htmlFor="add-expense-label"
              className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
            >
              {t('descriptionLabel')}
            </label>
            <input
              id="add-expense-label"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={listShown}
              aria-controls="add-expense-description-list"
              aria-activedescendant={
                activeIndex >= 0 ? `add-expense-description-option-${activeIndex}` : undefined
              }
              autoComplete="off"
              /* Autocorrect would turn a brand into a dictionary word that no
                 longer matches its suggestion. No `autoCapitalize`: the
                 description keeps its capital letter. */
              autoCorrect="off"
              spellCheck={false}
              maxLength={120}
              value={label}
              onChange={(e) => changeDescription(e.target.value)}
              onKeyDown={handleDescriptionKeyDown}
              /* The placeholder shows the fallback that will actually be
                 stored, so leaving it empty is an informed choice. */
              placeholder={selectedName || t('fallbackLabel')}
              data-testid="add-expense-label"
              className="text-foreground placeholder:text-muted-foreground/60 min-h-[26px] border-0 bg-transparent p-0 text-sm outline-none"
            />
          </div>
          <ul
            id="add-expense-description-list"
            role="listbox"
            aria-label={t('descriptionListLabel')}
            hidden={!listShown}
            className="bg-card border-border flex flex-col rounded-xl border p-1"
          >
            {suggestions.map((suggestion, index) => {
              const categoryName =
                suggestion.categoryId === null
                  ? null
                  : (knownCategories.find((c) => c.id === suggestion.categoryId)?.name ?? null);
              return (
                <li
                  key={`${suggestion.label}-${index}`}
                  id={`add-expense-description-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-testid="add-expense-description-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                  className="hover:bg-surface-muted aria-selected:bg-surface-muted aria-selected:ring-brand-600 flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5 aria-selected:ring-2 aria-selected:ring-inset"
                >
                  <span className="text-foreground text-sm">{suggestion.label}</span>
                  {categoryName !== null && (
                    <span className="text-muted-foreground text-xs">{categoryName}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/*
          ---------- 3. Les catégories. Elles ne défilent plus. ----------

          MESURÉ le 2026-08-23 : la rangée contenait **602 px de puces dans une
          fenêtre de 390** — 212 px hors écran — et **3 puces sur 6 étaient
          entièrement visibles**. Aucune ombre, aucune flèche, rien ne disait
          qu'il y avait une suite. Constat de @thierry : « les catégories ne
          sont pas facilement accessibles ».

          Le commentaire d'origine justifiait le défilement ainsi : « une 6ᵉ
          puce pousse la rangée sur deux lignes et fait passer le bouton
          Ajouter sous le clavier ». **Cette contrainte n'existe plus.** Le pied
          de `Sheet` est `shrink-0` et son contenu `min-h-0 flex-1
          overflow-y-auto` : le pied ne PEUT plus être poussé hors écran, c'est
          le contenu qui défile. Vérifié dans `Sheet.tsx` avant de changer ceci.

          Donc `flex-wrap`. Rien n'est caché sans le dire, et le repli tient à
          ce que le serveur classe déjà les puces par usage — ce qu'on voit en
          premier est ce qu'on utilise le plus.
        */}
        <div className="flex flex-col gap-2">
          <span
            id="add-expense-category-label"
            className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase"
          >
            {t('categoryLabel')}
          </span>
          {context === null && !contextFailed ? (
            <div className="flex flex-wrap gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  data-testid="add-expense-chip-skeleton"
                  className="bg-muted-foreground/15 h-11 w-24 shrink-0 animate-pulse rounded-full"
                />
              ))}
            </div>
          ) : categories.length === 0 ? (
            /* Empty state, stated rather than hidden. Since F-6 an expense
               needs a category, so the message sends the person to « Nouvelle »
               just below — rendered in this state precisely for that. */
            <p className="text-muted-foreground text-xs" data-testid="add-expense-no-categories">
              {t('noCategories')}
            </p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby="add-expense-category-label"
              className="flex flex-wrap gap-2"
            >
              {categories.map((category) => {
                const selected = category.id === categoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => pickCategory(category.id)}
                    data-testid={`add-expense-chip-${category.id}`}
                    className={[
                      'focus-visible:ring-brand-600 flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                      selected
                        ? 'bg-brand-700 text-primary-foreground'
                        : 'bg-surface-muted text-foreground hover:bg-muted',
                    ].join(' ')}
                  >
                    {!selected && (
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          CHIP_DOT[category.colorToken] ?? CHIP_DOT.zinc
                        }`}
                      />
                    )}
                    {category.name}
                  </button>
                );
              })}
              {/*
                Le déclencheur portait un « + » seul dans un rond de 44 px.
                Un glyphe sans mot ne dit ni ce qu'il révèle ni combien : sur
                une rangée qui cachait déjà la moitié de son contenu, c'était la
                seule chose qui aurait pu le dire, et elle ne le disait pas.
                Il porte maintenant le nombre — « + 12 autres » — parce qu'on
                décide d'ouvrir bien plus volontiers quand on sait ce qu'il y a
                derrière.
              */}
            </div>
          )}

          {/*
            Rangée SŒUR, hors du `radiogroup`.

            Ces deux boutons ne sont pas des `radio` : un `radiogroup` ne doit
            contenir que des `radio`, et « + N autres » y vivait déjà en
            infraction. Ajouter « + Nouvelle » dedans aurait aggravé le défaut,
            et y poser les 8 pastilles aurait imbriqué un `radiogroup` dans un
            autre — invalide.

            Rendue dès que le contexte est chargé, y compris quand il n'y a
            AUCUNE catégorie : c'est précisément l'état où créer sert le plus.
            La rattacher au `radiogroup` l'aurait fait disparaître là.
          */}
          {context !== null && !contextFailed && (
            <div className="flex flex-wrap gap-2">
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories(true)}
                  /*
                    Le nom accessible porte LE VERBE ET LE NOMBRE.

                    Défaut signalé par Sourcery le 2026-08-23, et c'en était un :
                    le texte visible « + 9 autres » est `aria-hidden`, donc un
                    `aria-label` sans compteur annonçait « Voir toutes les
                    catégories » — le nombre, seule information que ce chantier
                    ajoutait, n'existait pas pour un lecteur d'écran.

                    Sa correction remplaçait l'étiquette par « 9 autres », ce qui
                    perdait le verbe : un bouton nommé par un décompte ne dit pas
                    ce qu'il fait. D'où une clé dédiée qui garde les deux.
                  */
                  aria-label={t('moreCategoriesAria', { count: hiddenCount })}
                  data-testid="add-expense-chip-more"
                  className="bg-surface-muted text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-brand-600 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span aria-hidden="true">{t('moreCategoriesCount', { count: hiddenCount })}</span>
                </button>
              )}

              {!creatingCategory && (
                <button
                  type="button"
                  onClick={openCategoryCreation}
                  /*
                    `data-testid` DÉLIBÉRÉMENT hors du préfixe
                    `add-expense-chip-` : une spec e2e sélectionne
                    `[data-testid^="add-expense-chip-"]` puis clique la
                    PREMIÈRE. Nommer ce bouton `…-chip-new` l'aurait fait
                    cliquer comme une catégorie, et le plancher public serait
                    tombé sans qu'aucune ligne n'explique pourquoi.
                  */
                  data-testid="add-expense-new-category"
                  className="border-border text-foreground hover:bg-surface-muted focus-visible:ring-brand-600 flex min-h-11 items-center gap-1.5 rounded-full border border-dashed px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  {t('newCategory')}
                </button>
              )}
            </div>
          )}

          {/*
            F-6 — why the button waits. Shown only once a valid amount is typed:
            before that, the amount is what is missing, and saying « choose a
            category » over an empty field would point at the wrong thing.
            Referenced by the button's `aria-describedby`.
          */}
          {categoryMissing && !contextFailed && (
            <p
              id="add-expense-category-required"
              data-testid="add-expense-category-required"
              className="text-muted-foreground text-xs"
            >
              {t('categoryRequired')}
            </p>
          )}

          {/* ---------- La ligne de création, sous la rangée ---------- */}
          {creatingCategory && (
            <div
              ref={newCategoryBlockRef}
              className="bg-surface-soft flex flex-col gap-3 rounded-xl p-3"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="add-expense-new-category-name"
                  className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase"
                >
                  {t('newCategoryName')}
                </label>
                <input
                  ref={newCategoryInputRef}
                  id="add-expense-new-category-name"
                  type="text"
                  autoFocus
                  value={newCategoryName}
                  maxLength={40}
                  enterKeyHint="done"
                  disabled={isCreatingCategory}
                  aria-busy={isCreatingCategory}
                  aria-invalid={newCategoryError !== null}
                  aria-describedby={newCategoryError ? 'add-expense-new-category-error' : undefined}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    /*
                      `stopPropagation` n'est pas une précaution : `Sheet` pose
                      son écouteur `keydown` sur `document` et referme la
                      feuille SANS condition. Sans cet arrêt, « Échap » pour
                      annuler la création détruirait le montant déjà tapé —
                      exactement l'inverse de ce que cette ligne promet.
                    */
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setCreatingCategory(false);
                      setNewCategoryError(null);
                      amountRef.current?.focus();
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateCategory();
                    }
                  }}
                  data-testid="add-expense-new-category-name"
                  className="border-border bg-card text-foreground focus-visible:ring-brand-600 min-h-11 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                />
              </div>

              {/*
                `<fieldset>` + `<input type="radio">` natifs, et NON un
                `role="radiogroup"` fait main : les radios natives apportent la
                navigation aux flèches et le tabindex mobile gratuitement. Un
                groupe ARIA sans ces deux comportements est une étiquette qui
                promet ce qu'elle ne tient pas — c'est déjà le cas des puces de
                catégorie au-dessus, dette préexistante qu'on ne duplique pas.
              */}
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase">
                  {t('newCategoryColor')}
                </legend>
                <div className="flex flex-wrap gap-2 pt-1">
                  {CATEGORY_COLOR_TOKENS.map((token) => (
                    <label
                      key={token}
                      className="focus-within:ring-brand-600 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-within:ring-2"
                    >
                      <input
                        type="radio"
                        name="add-expense-new-category-color"
                        value={token}
                        checked={newCategoryColor === token}
                        disabled={isCreatingCategory}
                        onChange={() => setNewCategoryColor(token)}
                        className="sr-only"
                      />
                      {/* Le nom de la couleur, jamais la couleur seule. */}
                      <span className="sr-only">{t(`color.${token}`)}</span>
                      <span
                        aria-hidden="true"
                        className={[
                          'h-6 w-6 rounded-full transition-transform',
                          CHIP_DOT[token] ?? CHIP_DOT.zinc,
                          newCategoryColor === token
                            ? 'ring-foreground ring-offset-surface-soft scale-110 ring-2 ring-offset-2'
                            : '',
                        ].join(' ')}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              {newCategoryError && (
                <p
                  id="add-expense-new-category-error"
                  role="alert"
                  data-testid="add-expense-new-category-error"
                  className="text-danger text-xs"
                >
                  {newCategoryError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={newCategoryName.trim() === '' || isCreatingCategory}
                  data-testid="add-expense-new-category-submit"
                  className="bg-brand-700 text-primary-foreground focus-visible:ring-brand-600 min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-opacity focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                >
                  {t('newCategoryCreate')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingCategory(false);
                    setNewCategoryError(null);
                    amountRef.current?.focus();
                  }}
                  disabled={isCreatingCategory}
                  data-testid="add-expense-new-category-cancel"
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-brand-600 min-h-11 rounded-lg px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                >
                  {t('newCategoryCancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------- 4. La date, puis la note repliée. ---------- */}
        <div className="flex flex-col gap-1">
          <div className="bg-surface-soft flex flex-col gap-0.5 rounded-xl px-3 py-2">
            <label
              htmlFor="add-expense-date"
              className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
            >
              {t('dateLabel')}
            </label>
            {/*
              A human label over the native field, not instead of it.

              The mockup says « Aujourd'hui »; a native date input can only say
              « 29-07-2026 ». The gap is small and it lands on the most frequent
              action in the app, so it is worth closing — but not by building a
              date picker, which would cost the system picker, the locale, the
              keyboard support and the screen-reader semantics all at once.

              So the native input stays and does all the work; the label is
              painted ON it and is `pointer-events-none`, so a tap goes straight
              through to the field it describes. The input's own text is made
              transparent only while a friendly label covers it — never hidden
              outright, because on a date with no friendly name (17/07) the
              figures ARE the label.
            */}
            <div className="relative min-h-[26px]">
              <input
                id="add-expense-date"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                onFocus={closeDescriptionList}
                data-testid="add-expense-date"
                className={[
                  'min-h-[26px] w-full border-0 bg-transparent p-0 text-sm tabular-nums outline-none',
                  friendlyDate ? 'text-transparent' : 'text-foreground',
                ].join(' ')}
              />
              {friendlyDate && (
                <span
                  aria-hidden="true"
                  data-testid="add-expense-date-friendly"
                  className="text-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm"
                >
                  {friendlyDate}
                </span>
              )}
            </div>
          </div>
          {/*
            F-18 — the note, folded behind a link: most expenses need none, and
            an always-open field would push the date and the button down for
            everyone to serve the few. Folded and emptied again on close.
          */}
          {noteOpen ? (
            <div className="bg-surface-soft flex flex-col gap-0.5 rounded-xl px-3 py-2">
              <label
                htmlFor="add-expense-note"
                className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
              >
                {t('noteLabel')}
              </label>
              <textarea
                ref={noteRef}
                id="add-expense-note"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onFocus={closeDescriptionList}
                data-testid="add-expense-note"
                className="text-foreground min-h-11 resize-none border-0 bg-transparent p-0 text-sm outline-none"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              data-testid="add-expense-note-toggle"
              className="text-brand-text-strong focus-visible:ring-brand-600 -mx-2 flex min-h-11 items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {t('noteToggle')}
            </button>
          )}
        </div>

        {!isCurrentMonth && (
          <p className="text-muted-foreground text-xs" data-testid="add-expense-past-month">
            {t('pastMonthNotice')}
          </p>
        )}

        {contextFailed && (
          <p className="text-warning text-xs" data-testid="add-expense-context-failed">
            {t('contextFailed')}
          </p>
        )}
      </div>
    </Sheet>
  );
}
