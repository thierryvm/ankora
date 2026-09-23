'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { CHIP_DOT } from '@/components/expenses/category-dot';
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
} from '@/lib/domain/expenses/descriptions';
import type { ExpenseEntryCategory, ExpenseEntryContext } from '@/lib/actions/expense-entry.types';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { announceOptimisticSpend, settleSpend } from '@/lib/expenses/optimistic-spend';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';
import { formatCurrency } from '@/lib/i18n/formatters';
import { dayOffsetFrom, todayInAnkoraTz } from '@/lib/date/tz';
import type { Locale } from '@/i18n/routing';

/**
 * « Nouvelle dépense » — the two-tap entry flow (`DECISIONS-ANKORA.md` §3.4).
 *
 * ## The count, honestly
 *
 * Recording an expense costs **4 taps and a scroll** today: Dépenses tab →
 * Libellé → Montant → Ajouter. Target: **2 taps from anywhere**.
 *
 *   TAP 1  ⊕ — the sheet rises, the numeric keypad is ALREADY up and the caret
 *              is in the amount field. Date defaults to today, the most-used
 *              category is pre-selected, the label is optional.
 *   (typing the amount is not a tap — the keyboard is already open and focused;
 *    that is what makes "2 taps" real rather than an accounting trick)
 *   TAP 2  Ajouter — pinned above the keyboard, reachable by the thumb.
 *
 * F-6 amends the count for a first expense: no category is pre-selected until
 * the usage supports one, so a new workspace costs THREE gestures — amount,
 * category, save — and the sheet refuses to record without a category rather
 * than guessing one (measured: a first expense used to land in « Logement »).
 *
 * Everything else in this file exists to protect those taps. Every default
 * is chosen so the common case needs no interaction: pre-selected category,
 * today's date, optional label falling back to the category name. Changing the
 * category costs a third tap and that is assumed — the modal choice is right in
 * the large majority of entries, and a miscategorised one stays fixable in two
 * taps from the list.
 *
 * ## The detail that makes it a decision rather than bookkeeping
 *
 * Under the amount, in 12 px: **« Il te restera 429,89 € »**. The consequence
 * is shown BEFORE the commit. That single line is what separates Ankora from a
 * notebook — you are not recording what you spent, you are deciding whether to.
 *
 * ## Loading, deliberately not blocking
 *
 * Categories and « Il te reste » come from a server action fired on first open.
 * The amount field is live before it resolves — a user who taps ⊕ and types
 * immediately never waits. The chips and the projection land into a skeleton,
 * never into an empty box.
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

  // F-6 — shown when « Ajouter » is pressed with no category checked.
  const [categoryMissing, setCategoryMissing] = useState(false);
  // F-20 — a chip tapped by the person in this opening is theirs: a recalled
  // category never overrides it. Choosing a suggestion, an explicit act, does.
  const [categoryTouched, setCategoryTouched] = useState(false);
  // Rule 26 — the description combobox.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // F-18 — the note, folded behind « Ajouter une note ».
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

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
    setShowAllCategories(false);
    setCategoryMissing(false);
    setCategoryTouched(false);
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    setNoteOpen(false);
    setNote('');
    setOccurredOn(todayInAnkoraTz());
    setCategoryId(context?.preselectedId ?? null);
    // La LIGNE de création se referme, mais `justCreated` NON : la catégorie
    // existe réellement en base, et la faire disparaître à la fermeture de la
    // feuille reproduirait exactement le défaut qu'elle corrige.
    setCreatingCategory(false);
    setNewCategoryName('');
    setNewCategoryError(null);
  }, [open, context?.preselectedId]);

  const parsed = parseAmountInput(amount);
  const canSubmit = parsed !== null && !isSubmitting;

  const categories: ExpenseEntryCategory[] = [
    ...(showAllCategories
      ? [...(context?.chips ?? []), ...(context?.overflow ?? [])]
      : (context?.chips ?? [])),
    ...justCreated,
  ];
  const selectedName = categories.find((c) => c.id === categoryId)?.name ?? '';

  // Every selectable category, folded or not: a recalled or suggested category
  // may sit behind « + N autres », and must still be found.
  const allCategories: ExpenseEntryCategory[] = [
    ...(context?.chips ?? []),
    ...(context?.overflow ?? []),
    ...justCreated,
  ];
  const descriptions = context?.descriptions ?? [];
  const suggestions: DescriptionSuggestion[] = suggestOpen
    ? suggestDescriptions(label, descriptions, allCategories)
    : [];
  const listOpen = suggestions.length > 0;
  const active =
    listOpen && activeSuggestion >= 0 ? Math.min(activeSuggestion, suggestions.length - 1) : -1;

  /** Check a category and make sure its chip is on screen (not behind « + N »). */
  const checkCategory = (id: string) => {
    setCategoryId(id);
    setCategoryMissing(false);
    if (context?.overflow.some((c) => c.id === id)) setShowAllCategories(true);
  };

  const onLabelChange = (value: string) => {
    setLabel(value);
    setSuggestOpen(true);
    setActiveSuggestion(-1);
    // F-20 — a description typed in full recalls the category of its last
    // expense, unless the person already chose a chip in this opening.
    if (!categoryTouched) {
      const recalled = recallCategory(value, descriptions, allCategories);
      if (recalled) checkCategory(recalled);
    }
  };

  const chooseSuggestion = (suggestion: DescriptionSuggestion) => {
    setLabel(suggestion.label);
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    if (suggestion.categoryId) checkCategory(suggestion.categoryId);
  };

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
    if (value === null) return;
    // F-6 — no category, no record. Said on screen, before anything moves: the
    // server refuses the same payload anyway.
    if (categoryId === null) {
      setCategoryMissing(true);
      return;
    }

    // Label is optional and falls back to the category name — that fallback is
    // what makes 2 taps possible, since typing a label would add a third.
    const resolvedLabel = label.trim() || selectedName || t('fallbackLabel');
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
          note: note.trim() === '' ? null : note.trim(),
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
              onFocus={() => setSuggestOpen(false)}
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
          ---------- 2. La description. Elle dit où ; la catégorie dit à quoi. ----------

          Règle 26 : la description monte juste avant la catégorie, parce que
          c'est elle qui la propose. Combobox ARIA 1.2 (liste) : la `listbox`
          vit HORS du `<label>` et dans le flux, sous le champ. Les
          descriptions de la personne d'abord, puis les enseignes intégrées.
          Le champ reste libre.
        */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="add-expense-label"
            className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase"
          >
            {t('labelLabel')}
          </label>
          <input
            id="add-expense-label"
            type="text"
            maxLength={120}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls="add-expense-label-suggestions"
            aria-activedescendant={active >= 0 ? `add-expense-suggestion-${active}` : undefined}
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            /*
              No close on blur. The list lives IN the flow, above the chips:
              closing it when the field loses focus moved the chips up between
              the press and the release of a tap, and the tap landed beside
              the chip. Measured by e2e on iPhone 14. It closes when a
              suggestion or a chip is chosen, on Escape, and when the amount
              takes the focus back — never under the finger.
            */
            onKeyDown={(e) => {
              if (!listOpen) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveSuggestion((i) => (i + 1) % suggestions.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
              } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault();
                chooseSuggestion(suggestions[active]!);
              } else if (e.key === 'Escape') {
                // `Sheet` closes on any Escape reaching `document`: the first
                // one closes the list only, a second one the sheet.
                e.stopPropagation();
                setSuggestOpen(false);
              }
            }}
            /* The placeholder shows the fallback that will actually be
               stored, so leaving it empty is an informed choice. */
            placeholder={selectedName || t('labelPlaceholder')}
            data-testid="add-expense-label"
            className="border-border bg-card text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-brand-600 min-h-11 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          {listOpen && (
            <ul
              id="add-expense-label-suggestions"
              role="listbox"
              aria-label={t('suggestionsLabel')}
              data-testid="add-expense-label-suggestions"
              className="border-border bg-card flex flex-col overflow-hidden rounded-lg border"
            >
              {suggestions.map((suggestion, i) => {
                const category = allCategories.find((c) => c.id === suggestion.categoryId);
                return (
                  <li
                    key={`${suggestion.source}-${suggestion.label}`}
                    id={`add-expense-suggestion-${i}`}
                    role="option"
                    aria-selected={i === active}
                    // `mousedown`, not `click`: the field's blur closes the
                    // list, and a click would land on an option already gone.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      chooseSuggestion(suggestion);
                    }}
                    data-testid="add-expense-suggestion"
                    className={[
                      'flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 text-sm',
                      i === active ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                    ].join(' ')}
                  >
                    <span className="text-foreground font-medium">{suggestion.label}</span>
                    {(category || suggestion.count > 0) && (
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        {category && (
                          <>
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                CHIP_DOT[category.colorToken] ?? CHIP_DOT.zinc
                              }`}
                            />
                            {category.name}
                          </>
                        )}
                        {category && suggestion.count > 0 && ' · '}
                        {suggestion.count > 0 && t('suggestionCount', { count: suggestion.count })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
            /* Empty state, stated rather than hidden. A workspace with no
               `variable` category can still record the spend — the amount is
               what matters — so this explains instead of blocking. */
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
                    onClick={() => {
                      setCategoryId(category.id);
                      setCategoryTouched(true);
                      setCategoryMissing(false);
                      setSuggestOpen(false);
                    }}
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
              {!showAllCategories && (context?.overflow.length ?? 0) > 0 && (
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
                  aria-label={t('moreCategoriesAria', {
                    count: context?.overflow.length ?? 0,
                  })}
                  data-testid="add-expense-chip-more"
                  className="bg-surface-muted text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-brand-600 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span aria-hidden="true">
                    {t('moreCategoriesCount', { count: context?.overflow.length ?? 0 })}
                  </span>
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

          {categoryMissing && (
            <p
              role="alert"
              data-testid="add-expense-category-required"
              className="text-danger text-xs font-medium"
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

        {/* ---------- 4. La date, et la note repliée (F-18). ---------- */}
        <div className="grid grid-cols-2 gap-2">
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
          {!noteOpen && (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              data-testid="add-expense-note-toggle"
              className="text-brand-text-strong hover:bg-surface-muted focus-visible:ring-brand-600 flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {t('noteToggle')}
            </button>
          )}
        </div>

        {noteOpen && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="add-expense-note"
              className="text-muted-foreground text-[11px] font-semibold tracking-[0.09em] uppercase"
            >
              {t('noteLabel')}
            </label>
            <textarea
              id="add-expense-note"
              autoFocus
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="add-expense-note"
              className="border-border bg-card text-foreground focus-visible:ring-brand-600 rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
        )}

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
