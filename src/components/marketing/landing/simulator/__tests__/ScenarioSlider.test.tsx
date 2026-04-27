import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ScenarioSlider } from '../ScenarioSlider';
import { SLIDER_RANGE } from '../constants';

describe('<ScenarioSlider />', () => {
  it('renders an input[type=range] with the configured min/max/step', () => {
    render(
      <ScenarioSlider
        value={100}
        onChange={vi.fn()}
        label="Montant mensuel"
        valueText="{amount} euros par mois"
        unit="€/mois"
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Montant mensuel' });
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('min', String(SLIDER_RANGE.min));
    expect(slider).toHaveAttribute('max', String(SLIDER_RANGE.max));
    expect(slider).toHaveAttribute('step', String(SLIDER_RANGE.step));
  });

  it('shows the numeric value next to the label', () => {
    render(
      <ScenarioSlider
        value={150}
        onChange={vi.fn()}
        label="Montant"
        valueText="{amount} euros par mois"
        unit="€/mois"
      />,
    );
    expect(screen.getByText('150 €/mois')).toBeInTheDocument();
  });

  it('exposes the value via aria-valuetext (with placeholder substituted)', () => {
    render(
      <ScenarioSlider
        value={75}
        onChange={vi.fn()}
        label="Montant"
        valueText="{amount} euros par mois"
        unit="€/mois"
      />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', '75 euros par mois');
  });

  it('calls onChange with a number when the user drags', () => {
    const onChange = vi.fn();
    render(
      <ScenarioSlider
        value={100}
        onChange={onChange}
        label="Montant"
        valueText="{amount} eu"
        unit="€"
      />,
    );
    fireEvent.change(screen.getByRole('slider'), { target: { value: '250' } });
    expect(onChange).toHaveBeenCalledWith(250);
  });
});
