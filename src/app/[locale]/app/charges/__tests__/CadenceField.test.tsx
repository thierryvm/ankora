import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import messages from '../../../../../../messages/fr-BE.json';
import { CadenceField, type CadenceValue } from '../CadenceField';

function renderField(value: CadenceValue, onChange = vi.fn(), disabled = false) {
  render(
    <NextIntlClientProvider locale="fr-BE" messages={messages} timeZone="Europe/Brussels">
      <CadenceField idPrefix="t" value={value} onChange={onChange} disabled={disabled} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

const monthly: CadenceValue = { frequency: 'monthly', dueMonth: 1, paymentDay: 15 };
const quarterly: CadenceValue = { frequency: 'quarterly', dueMonth: 3, paymentDay: 15 };

describe('<CadenceField />', () => {
  it('hides the anchor-month select when monthly', () => {
    renderField(monthly);
    expect(screen.queryByTestId('t-month')).toBeNull();
    expect(screen.getByTestId('t-day')).toBeInTheDocument();
    expect(screen.getByTestId('t-frequency')).toBeInTheDocument();
  });

  it('shows an editable anchor-month select when non-monthly', () => {
    renderField(quarterly);
    expect(screen.getByTestId('t-month')).toBeInTheDocument();
  });

  it('renders the monthly summary line', () => {
    renderField(monthly);
    expect(screen.getByTestId('t-summary')).toHaveTextContent('Prélevé le 15 de chaque mois');
  });

  it('renders the recurring summary with computed months (quarterly anchored March)', () => {
    renderField(quarterly);
    // paymentMonthsFromFrequency('quarterly', 3) → [3,6,9,12] → mars, juin, sept., déc.
    expect(screen.getByTestId('t-summary')).toHaveTextContent(/mars/i);
    expect(screen.getByTestId('t-summary')).toHaveTextContent(/juin/i);
    expect(screen.getByTestId('t-summary')).toHaveTextContent(/déc/i);
  });

  it('exposes a "Dernier jour du mois" option that emits paymentDay=31', () => {
    const onChange = renderField(monthly);
    fireEvent.change(screen.getByTestId('t-day'), { target: { value: '31' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'monthly', dueMonth: 1, paymentDay: 31 });
  });

  it('shows "dernier jour" in the summary when paymentDay is 31', () => {
    renderField({ frequency: 'monthly', dueMonth: 1, paymentDay: 31 });
    expect(screen.getByTestId('t-summary')).toHaveTextContent(
      'Prélevé le dernier jour de chaque mois',
    );
  });

  it('emits the new frequency on change', () => {
    const onChange = renderField(monthly);
    fireEvent.change(screen.getByTestId('t-frequency'), { target: { value: 'annual' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'annual', dueMonth: 1, paymentDay: 15 });
  });

  it('emits the new anchor month on change (non-monthly)', () => {
    const onChange = renderField(quarterly);
    fireEvent.change(screen.getByTestId('t-month'), { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'quarterly', dueMonth: 6, paymentDay: 15 });
  });

  it('shows "dernier jour" in the recurring summary too (non-monthly + day 31)', () => {
    renderField({ frequency: 'quarterly', dueMonth: 3, paymentDay: 31 });
    const summary = screen.getByTestId('t-summary');
    expect(summary).toHaveTextContent(/dernier jour/i);
    expect(summary).toHaveTextContent(/mars/i);
  });

  it('disables every control when disabled', () => {
    renderField(quarterly, vi.fn(), true);
    expect(screen.getByTestId('t-frequency')).toBeDisabled();
    expect(screen.getByTestId('t-day')).toBeDisabled();
    expect(screen.getByTestId('t-month')).toBeDisabled();
  });

  it('associates each select with a <label> (a11y)', () => {
    renderField(quarterly);
    expect(screen.getByLabelText('Fréquence')).toBe(screen.getByTestId('t-frequency'));
    expect(screen.getByLabelText('Jour du mois')).toBe(screen.getByTestId('t-day'));
    expect(screen.getByLabelText('À partir de')).toBe(screen.getByTestId('t-month'));
  });
});
