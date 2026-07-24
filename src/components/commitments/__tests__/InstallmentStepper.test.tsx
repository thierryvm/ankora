import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { InstallmentStepper } from '../InstallmentStepper';

const labels = {
  countAriaLabel: '6 sur 11 échéances payées',
  markOneAriaLabel: 'Marquer une échéance payée',
  unmarkOneAriaLabel: 'Annuler la dernière échéance payée',
};

describe('<InstallmentStepper />', () => {
  it('shows the paid / total count', () => {
    render(
      <InstallmentStepper
        paid={6}
        total={11}
        onTickNext={vi.fn()}
        onUntickLast={vi.fn()}
        {...labels}
      />,
    );
    expect(screen.getByTestId('stepper-count')).toHaveTextContent('6 / 11');
  });

  it('calls onTickNext on +', () => {
    const onTickNext = vi.fn();
    render(
      <InstallmentStepper
        paid={6}
        total={11}
        onTickNext={onTickNext}
        onUntickLast={vi.fn()}
        {...labels}
      />,
    );
    fireEvent.click(screen.getByTestId('stepper-inc'));
    expect(onTickNext).toHaveBeenCalledOnce();
  });

  it('calls onUntickLast on −', () => {
    const onUntickLast = vi.fn();
    render(
      <InstallmentStepper
        paid={6}
        total={11}
        onTickNext={vi.fn()}
        onUntickLast={onUntickLast}
        {...labels}
      />,
    );
    fireEvent.click(screen.getByTestId('stepper-dec'));
    expect(onUntickLast).toHaveBeenCalledOnce();
  });

  it('disables − at 0 paid', () => {
    render(
      <InstallmentStepper
        paid={0}
        total={11}
        onTickNext={vi.fn()}
        onUntickLast={vi.fn()}
        {...labels}
      />,
    );
    expect(screen.getByTestId('stepper-dec')).toBeDisabled();
    expect(screen.getByTestId('stepper-inc')).not.toBeDisabled();
  });

  it('disables + once everything is paid', () => {
    render(
      <InstallmentStepper
        paid={11}
        total={11}
        onTickNext={vi.fn()}
        onUntickLast={vi.fn()}
        {...labels}
      />,
    );
    expect(screen.getByTestId('stepper-inc')).toBeDisabled();
    expect(screen.getByTestId('stepper-dec')).not.toBeDisabled();
  });

  it('disables both buttons while a mutation is pending', () => {
    render(
      <InstallmentStepper
        paid={6}
        total={11}
        disabled
        onTickNext={vi.fn()}
        onUntickLast={vi.fn()}
        {...labels}
      />,
    );
    expect(screen.getByTestId('stepper-dec')).toBeDisabled();
    expect(screen.getByTestId('stepper-inc')).toBeDisabled();
  });
});
