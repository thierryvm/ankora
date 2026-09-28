'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Sheet } from '@/components/primitives/Sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  deleteEmptyCategoriesAction,
  getCategoryMergeContextAction,
  mergeCategoriesAction,
} from '@/lib/actions/category-merge';
import type { MergeableCategory } from '@/lib/actions/categories.types';
import { isNextControlFlowError } from '@/lib/actions/next-control-flow';
import {
  CATEGORY_COLOR_TOKENS,
  couleurLaMoinsUtilisee,
  type CategoryColorToken,
} from '@/lib/domain/categories';
import { useActionErrorTranslator } from '@/lib/i18n/action-errors';

import { CATEGORY_DOT } from './category-colors';

const NOUVELLE = '—nouvelle—';

type Etape =
  | { nom: 'choix' }
  | { nom: 'confirmation' }
  | { nom: 'fait'; deplacees: number; cible: string; vides: string[] };

/**
 * « Regrouper des catégories » — the shops become descriptions, the category
 * becomes the post (« Intermarché », « Colruyt » → « Courses »).
 *
 * The sheet says how many expenses move BEFORE anything is written, asks for a
 * confirmation that repeats that number, and sends it: the server recounts and
 * refuses if it changed. Nothing is deleted by the merge; the emptied
 * categories are offered for deletion afterwards, as a separate gesture.
 * Every count comes from the server (`getCategoryMergeContextAction`); this
 * file only adds up the counts of the boxes ticked.
 */
export function MergeCategoriesSheet({
  open,
  onClose,
}: Readonly<{ open: boolean; onClose: () => void }>) {
  const t = useTranslations('app.expenses.merge');
  const translateError = useActionErrorTranslator();
  const [categories, setCategories] = useState<MergeableCategory[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [cible, setCible] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState('');
  const [etape, setEtape] = useState<Etape>({ nom: 'choix' });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Mounted on open by its host, so every opening starts from fresh state.
    let actif = true;
    getCategoryMergeContextAction().then(
      (r) => {
        if (!actif) return;
        if (r.ok) setCategories(r.data);
        else setErreur(r.errorCode);
      },
      () => actif && setErreur('errors.categories.mergeFailed'),
    );
    return () => {
      actif = false;
    };
  }, [open]);
  // `erreur` holds the error CODE: translated at render, so the load effect
  // depends on `open` alone (the translator is a new function every render).

  const liste = categories ?? [];
  const choisies = liste.filter((c) => sources.includes(c.id));
  const nbDepenses = choisies.reduce((n, c) => n + c.expenseCount, 0);
  const nbFactures = choisies.reduce((n, c) => n + c.billCount, 0);
  const nomCible =
    cible === NOUVELLE ? nouveauNom.trim() : (liste.find((c) => c.id === cible)?.name ?? '');
  const pret = sources.length > 0 && cible !== null && nomCible !== '';

  function basculer(id: string) {
    setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    if (cible === id) setCible(null);
  }

  function couleurNeuve(): CategoryColorToken {
    return couleurLaMoinsUtilisee(
      liste.flatMap((c) => {
        const jeton = CATEGORY_COLOR_TOKENS.find((j) => j === c.colorToken);
        return jeton
          ? [
              {
                id: c.id,
                name: c.name,
                kind: 'variable' as const,
                colorToken: jeton,
                isSystem: c.isSystem,
              },
            ]
          : [];
      }),
    );
  }

  // After any failure the counts may have moved, or part of it is written:
  // read them again and start the choice over.
  function recharger() {
    setSources([]);
    setCible(null);
    setEtape({ nom: 'choix' });
    getCategoryMergeContextAction().then(
      (r) => (r.ok ? setCategories(r.data) : setErreur(r.errorCode)),
      () => setErreur('errors.categories.mergeFailed'),
    );
  }

  function regrouper() {
    startTransition(async () => {
      try {
        const r = await mergeCategoriesAction({
          sourceIds: sources,
          target:
            cible === NOUVELLE
              ? { kind: 'new', name: nouveauNom.trim(), colorToken: couleurNeuve() }
              : { kind: 'existing', id: cible },
          confirmedExpenseCount: nbDepenses,
          confirmedBillCount: nbFactures,
        });
        if (!r.ok) {
          toast.error(translateError(r.errorCode));
          recharger();
          return;
        }
        const systeme = new Set(liste.filter((c) => c.isSystem).map((c) => c.id));
        setEtape({
          nom: 'fait',
          deplacees: r.data.movedExpenses,
          cible: nomCible,
          vides: r.data.emptiedCategoryIds.filter((id) => !systeme.has(id)),
        });
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        toast.error(translateError('errors.categories.mergeFailed'));
        recharger();
      }
    });
  }

  function supprimerVides(ids: string[]) {
    startTransition(async () => {
      try {
        const r = await deleteEmptyCategoriesAction({ ids });
        if (!r.ok) {
          toast.error(translateError(r.errorCode));
          return;
        }
        toast.success(t('videsSupprimees', { count: r.data.deleted }));
        onClose();
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        toast.error(translateError('errors.categories.mergeFailed'));
      }
    });
  }

  const puce = (c: MergeableCategory) => (
    <span
      aria-hidden="true"
      className={[
        'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
        CATEGORY_DOT[c.colorToken ?? 'zinc'] ?? CATEGORY_DOT.zinc,
      ].join(' ')}
    />
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('titre')}
      closeLabel={t('fermer')}
      testId="merge-sheet"
    >
      <div className="space-y-5 pb-4">
        {etape.nom === 'fait' ? (
          <div className="space-y-4" data-testid="merge-fait">
            <p className="font-medium">
              {t('fait', { count: etape.deplacees, cible: etape.cible })}
            </p>
            {etape.vides.length > 0 ? (
              <div data-testid="merge-vides" className="space-y-3">
                <p className="text-sm">{t('vides', { count: etape.vides.length })}</p>
                <p className="text-muted-foreground text-xs">{t('videsAide')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    data-testid="merge-supprimer-vides"
                    disabled={pending}
                    onClick={() => supprimerVides(etape.vides)}
                  >
                    {t('supprimerVides')}
                  </Button>
                  <Button type="button" variant="outline" onClick={onClose}>
                    {t('garderVides')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" onClick={onClose}>
                {t('fermer')}
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t('intro')}</p>
            {erreur ? (
              <p role="alert" className="text-sm">
                {translateError(erreur)}
              </p>
            ) : categories === null ? (
              <p className="text-muted-foreground text-sm" aria-live="polite">
                {t('chargement')}
              </p>
            ) : liste.length < 2 ? (
              <p className="text-sm">{t('tropPeu')}</p>
            ) : (
              <>
                <fieldset disabled={etape.nom === 'confirmation'}>
                  <legend className="font-mono text-xs tracking-wide uppercase">
                    {t('sources')}
                  </legend>
                  <ul className="mt-2">
                    {liste.map((c) => (
                      <li key={c.id} className="border-border border-b last:border-b-0">
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                          <input
                            type="checkbox"
                            data-testid="merge-source"
                            data-nom={c.name}
                            className="accent-brand-600 h-5 w-5 shrink-0"
                            checked={sources.includes(c.id)}
                            onChange={() => basculer(c.id)}
                          />
                          {puce(c)}
                          <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {t('nbDepenses', { count: c.expenseCount })}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>

                <fieldset disabled={etape.nom === 'confirmation'}>
                  <legend className="font-mono text-xs tracking-wide uppercase">
                    {t('cible')}
                  </legend>
                  <ul className="mt-2">
                    {liste
                      .filter((c) => !sources.includes(c.id))
                      .map((c) => (
                        <li key={c.id} className="border-border border-b">
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                            <input
                              type="radio"
                              name="merge-cible"
                              data-testid="merge-cible"
                              data-nom={c.name}
                              className="accent-brand-600 h-5 w-5 shrink-0"
                              checked={cible === c.id}
                              onChange={() => setCible(c.id)}
                            />
                            {puce(c)}
                            <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                          </label>
                        </li>
                      ))}
                    <li>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                        <input
                          type="radio"
                          name="merge-cible"
                          className="accent-brand-600 h-5 w-5 shrink-0"
                          checked={cible === NOUVELLE}
                          onChange={() => setCible(NOUVELLE)}
                        />
                        <span className="font-medium">{t('nouvelle')}</span>
                      </label>
                      {cible === NOUVELLE && (
                        <Input
                          data-testid="merge-nouveau-nom"
                          aria-label={t('nouveauNom')}
                          placeholder={t('nouveauNomExemple')}
                          maxLength={40}
                          value={nouveauNom}
                          onChange={(e) => setNouveauNom(e.target.value)}
                          className="mt-1"
                        />
                      )}
                    </li>
                  </ul>
                </fieldset>

                <div data-testid="merge-resume" aria-live="polite" className="space-y-1 text-sm">
                  {pret ? (
                    <>
                      <p className="font-medium">
                        {t('resume', { count: nbDepenses, cible: nomCible })}
                      </p>
                      {nbFactures > 0 && <p>{t('resumeFactures', { count: nbFactures })}</p>}
                      <p className="text-muted-foreground text-xs">{t('resumeDescriptions')}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t('resumeVide')}</p>
                  )}
                </div>

                {etape.nom === 'confirmation' ? (
                  <div
                    data-testid="merge-confirmation"
                    className="border-border space-y-3 rounded-lg border p-3"
                  >
                    <p className="font-medium">
                      {t('confirmation', { count: nbDepenses, cible: nomCible })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        data-testid="merge-confirmer"
                        disabled={pending}
                        onClick={regrouper}
                      >
                        {t('confirmer')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setEtape({ nom: 'choix' })}
                      >
                        {t('annuler')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    data-testid="merge-continuer"
                    disabled={!pret}
                    onClick={() => setEtape({ nom: 'confirmation' })}
                  >
                    {t('continuer')}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
