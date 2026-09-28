import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/fr-BE.json';

const { contexte, fusion, suppression } = vi.hoisted(() => ({
  contexte: vi.fn(),
  fusion: vi.fn(),
  suppression: vi.fn(),
}));
vi.mock('@/lib/actions/category-merge', () => ({
  getCategoryMergeContextAction: contexte,
  mergeCategoriesAction: fusion,
  deleteEmptyCategoriesAction: suppression,
}));

import { MergeCategoriesSheet } from '../MergeCategoriesSheet';

// Fictional workspace: two shop categories and a « Courses » post.
const CATEGORIES = [
  {
    id: 'c-inter',
    name: 'Intermarché',
    colorToken: 'rose',
    isSystem: false,
    expenseCount: 2,
    billCount: 0,
  },
  {
    id: 'c-colruyt',
    name: 'Colruyt',
    colorToken: 'blue',
    isSystem: false,
    expenseCount: 1,
    billCount: 1,
  },
  {
    id: 'c-courses',
    name: 'Courses',
    colorToken: 'amber',
    isSystem: true,
    expenseCount: 4,
    billCount: 0,
  },
];

function monter() {
  return render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <MergeCategoriesSheet open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  contexte.mockReset().mockResolvedValue({ ok: true, data: CATEGORIES });
  fusion.mockReset();
  suppression.mockReset();
});

describe('MergeCategoriesSheet', () => {
  it('says how many expenses move before acting, and writes only once confirmed', async () => {
    fusion.mockResolvedValue({
      ok: true,
      data: {
        targetId: 'c-courses',
        movedExpenses: 3,
        emptiedCategoryIds: ['c-inter', 'c-colruyt'],
      },
    });
    monter();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Intermarché/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Colruyt/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Courses/ }));

    const resume = screen.getByTestId('merge-resume');
    expect(resume.textContent).toContain('3 dépenses passeront dans « Courses »');
    expect(resume.textContent).toContain('1 facture');

    fireEvent.click(screen.getByTestId('merge-continuer'));
    expect(fusion).not.toHaveBeenCalled();
    expect(screen.getByTestId('merge-confirmation').textContent).toContain('3 dépenses');

    fireEvent.click(screen.getByTestId('merge-confirmer'));
    await waitFor(() => expect(fusion).toHaveBeenCalledTimes(1));
    expect(fusion).toHaveBeenCalledWith({
      sourceIds: ['c-inter', 'c-colruyt'],
      target: { kind: 'existing', id: 'c-courses' },
      confirmedExpenseCount: 3,
      confirmedBillCount: 1,
    });

    // Afterwards: the emptied categories are offered for deletion, separately.
    suppression.mockResolvedValue({ ok: true, data: { deleted: 2 } });
    const vides = await screen.findByTestId('merge-vides');
    expect(vides.textContent).toContain('2 catégories sont maintenant vides');
    fireEvent.click(screen.getByTestId('merge-supprimer-vides'));
    await waitFor(() =>
      expect(suppression).toHaveBeenCalledWith({ ids: ['c-inter', 'c-colruyt'] }),
    );
  });

  it('a new post is named in the sheet and sent as a new target', async () => {
    fusion.mockResolvedValue({
      ok: true,
      data: { targetId: 'c-new', movedExpenses: 2, emptiedCategoryIds: ['c-inter'] },
    });
    monter();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Intermarché/ }));
    expect(screen.getByTestId('merge-continuer')).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Nouvelle catégorie/ }));
    fireEvent.change(screen.getByTestId('merge-nouveau-nom'), {
      target: { value: 'Alimentation' },
    });
    expect(screen.getByTestId('merge-resume').textContent).toContain(
      '2 dépenses passeront dans « Alimentation »',
    );
    fireEvent.click(screen.getByTestId('merge-continuer'));
    fireEvent.click(screen.getByTestId('merge-confirmer'));
    await waitFor(() => expect(fusion).toHaveBeenCalledTimes(1));
    expect(fusion.mock.calls[0]![0]).toMatchObject({
      sourceIds: ['c-inter'],
      target: { kind: 'new', name: 'Alimentation' },
      confirmedExpenseCount: 2,
    });
  });
});
