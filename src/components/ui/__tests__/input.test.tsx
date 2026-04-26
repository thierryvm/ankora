import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';

import { Input } from '../input';

describe('<Input />', () => {
  it('renders an input element with the given type', () => {
    render(<Input type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('respects the disabled prop', () => {
    render(<Input disabled placeholder="Disabled" />);
    const input = screen.getByPlaceholderText('Disabled');
    expect(input).toBeDisabled();
  });

  it('flags invalid state via aria-invalid', () => {
    render(<Input aria-invalid placeholder="Invalid" />);
    const input = screen.getByPlaceholderText('Invalid');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('updates as a controlled component', () => {
    function Controlled() {
      const [value, setValue] = useState('');
      return (
        <Input
          aria-label="controlled"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByLabelText('controlled') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(input.value).toBe('hello');
  });
});
