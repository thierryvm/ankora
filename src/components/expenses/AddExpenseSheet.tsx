'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Sheet } from '@/components/primitives/Sheet';
import { toast } from '@/components/ui/toast';
import { createExpenseAction } from '@/lib/actions/expenses';
import { getExpenseEntryContextAction } from '@/lib/actions/expense-entry';
import type { ExpenseEntryCategory, ExpenseEntryContext } from '@/lib/actions/expense-entry.types';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import { announceOptimisticValue, settleSpend } from '@/lib/expenses/optimistic-spend';
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
 * Everything else in this file exists to protect those two taps. Every default
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

/** Chip palette. Closed set, mirroring the DB `color_token` check constraint. */
const CHIP_DOT: Record<string, string> = {
  blue: 'bg-info',
  cyan: 'bg-brand-500',
  emerald: 'bg-success',
  amber: 'bg-warning',
  rose: 'bg-danger',
  pink: 'bg-danger',
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

  const [context, setContext] = useState<ExpenseEntryContext | null>(null);
  const [contextFailed, setContextFailed] = useState(false);

  // Fetched on first open and kept — the taxonomy does not change between two
  // entries, and re-reading it would put a round-trip in front of every ⊕.
  // `ilTeReste` inside it goes stale after a submit; `pendingLocal` below is
  // what keeps the projection truthful without another round-trip.
  const [pendingLocal, setPendingLocal] = useState(0);

  useEffect(() => {
    if (!open || context !== null || contextFailed) return;
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
        setCategoryId((current) => current ?? result.data.preselectedId);
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        if (!cancelled) setContextFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, context, contextFailed]);

  // Reset the volatile fields between two entries, keep the fetched taxonomy.
  // Amount and label MUST clear: re-opening the sheet on the previous amount
  // is how a duplicate expense gets recorded by accident.
  useEffect(() => {
    if (open) return;
    setAmount('');
    setLabel('');
    setShowAllCategories(false);
    setOccurredOn(todayInAnkoraTz());
    setCategoryId(context?.preselectedId ?? null);
  }, [open, context?.preselectedId]);

  const parsed = parseAmountInput(amount);
  const canSubmit = parsed !== null && !isSubmitting;

  const categories: ExpenseEntryCategory[] = showAllCategories
    ? [...(context?.chips ?? []), ...(context?.overflow ?? [])]
    : (context?.chips ?? []);
  const selectedName = categories.find((c) => c.id === categoryId)?.name ?? '';

  // « Il te restera X € » — the line that turns entry into a decision.
  // `pendingLocal` accounts for spends made in this same sheet session, since
  // the fetched `ilTeReste` predates them.
  const projection =
    context && !context.incomplet ? context.ilTeReste - pendingLocal - (parsed ?? 0) : null;

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

  const handleSubmit = useCallback(() => {
    const value = parseAmountInput(amount);
    if (value === null) return;

    // Label is optional and falls back to the category name — that fallback is
    // what makes 2 taps possible, since typing a label would add a third.
    const resolvedLabel = label.trim() || selectedName || t('fallbackLabel');
    // Only a spend inside the current month moves this month's hero. A
    // backdated one is recorded, and correctly changes nothing on screen.
    // `projection` is null when income is unconfigured (THI-335) — there is no
    // figure to be optimistic about, so the hero is left alone.
    const affectsHero = isCurrentMonth && projection !== null;

    // The RESULTING figure, not the amount spent: it is the « Il te restera X € »
    // this sheet is already showing, and publishing it absolute makes the
    // update idempotent (see `optimistic-spend.ts`).
    if (affectsHero) announceOptimisticValue(projection);
    setPendingLocal((current) => current + value);

    startSubmit(async () => {
      try {
        const result = await createExpenseAction({
          label: resolvedLabel,
          amount: value,
          occurredOn,
          categoryId,
          note: null,
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
          {context === null && !contextFailed ? (
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
          ---------- 2. Les catégories. Elles ne défilent plus. ----------

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
                    onClick={() => setCategoryId(category.id)}
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
              {!showAllCategories && (context?.overflow.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories(true)}
                  aria-label={t('moreCategories')}
                  data-testid="add-expense-chip-more"
                  className="bg-surface-muted text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-brand-600 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span aria-hidden="true">
                    {t('moreCategoriesCount', { count: context?.overflow.length ?? 0 })}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---------- 3. Date + label, 50/50, both optional. ---------- */}
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
          <div className="bg-surface-soft flex flex-col gap-0.5 rounded-xl px-3 py-2">
            <label
              htmlFor="add-expense-label"
              className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
            >
              {t('labelLabel')}
            </label>
            <input
              id="add-expense-label"
              type="text"
              maxLength={120}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              /* The placeholder shows the fallback that will actually be
                 stored, so leaving it empty is an informed choice. */
              placeholder={selectedName || t('fallbackLabel')}
              data-testid="add-expense-label"
              className="text-foreground placeholder:text-muted-foreground/60 min-h-[26px] border-0 bg-transparent p-0 text-sm outline-none"
            />
          </div>
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
