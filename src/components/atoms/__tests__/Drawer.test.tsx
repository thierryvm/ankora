import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { EditDrawer, type DrawerField, type DrawerValues } from '../Drawer';

/**
 * Helper — flush requestAnimationFrame so the auto-focus effect runs.
 * jsdom polyfills RAF as setTimeout(0); we wrap the call in act() to
 * silence React warnings about state-updates outside act.
 */
async function flushRaf(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

const baseFields: readonly DrawerField[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true, placeholder: 'Loyer' },
  { key: 'amount', label: 'Montant', type: 'money', required: true },
];

describe('<EditDrawer /> (atom CD#3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('open=false → root has aria-hidden="true"', () => {
    const { container } = render(
      <EditDrawer
        open={false}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const root = container.querySelector('.drw-root');
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.className).not.toContain('is-open');
  });

  it('open=true → root has aria-hidden="false" and is-open class', () => {
    const { container } = render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const root = container.querySelector('.drw-root');
    expect(root?.getAttribute('aria-hidden')).toBe('false');
    expect(root?.className).toContain('is-open');
  });

  it('open=true → auto-focuses first non-readonly input via rAF', async () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await flushRaf();
    const firstInput = screen.getByPlaceholderText('Loyer');
    expect(document.activeElement).toBe(firstInput);
  });

  it('ESC keydown → onCancel is called', () => {
    const onCancel = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('non-ESC key → onCancel NOT called', () => {
    const onCancel = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('backdrop click → onCancel is called', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const overlay = container.querySelector('.drw-overlay') as HTMLElement;
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Save click with required field empty → onSave NOT called + error rendered', () => {
    const onSave = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(onSave).not.toHaveBeenCalled();
    // "Requis" appears for at least one field
    expect(screen.getAllByText('Requis').length).toBeGreaterThan(0);
  });

  it('Save click with all required filled → onSave called with full values', () => {
    const onSave = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        initial={{ name: 'Loyer', amount: '850' }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ name: 'Loyer', amount: '850' });
  });

  it('Delete click 1st time → onDelete NOT called, confirmation UI shown', () => {
    const onDelete = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/confirmer la suppression/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /oui, supprimer/i })).toBeInTheDocument();
  });

  it('Delete confirmation "Oui, supprimer" → onDelete called with values', () => {
    const onDelete = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        initial={{ name: 'Loyer', amount: '850' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^supprimer$/i }));
    fireEvent.click(screen.getByRole('button', { name: /oui, supprimer/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith({ name: 'Loyer', amount: '850' });
  });

  it('Delete confirmation "Non" → reverts to initial delete button, onDelete NOT called', () => {
    const onDelete = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
        deleteLabel="Supprimer cette charge"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /supprimer cette charge/i }));
    fireEvent.click(screen.getByRole('button', { name: /^non$/i }));
    expect(onDelete).not.toHaveBeenCalled();
    // back to original delete button
    expect(screen.getByRole('button', { name: /supprimer cette charge/i })).toBeInTheDocument();
  });

  it('Field type=text → renders <input type="text">', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'a', label: 'A', type: 'text' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = document.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
  });

  it('Field type=text with inputType="email" → renders <input type="email">', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'a', label: 'Email', type: 'text', inputType: 'email' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.querySelector('input[type="email"]')).not.toBeNull();
  });

  it('Field type=money → renders € suffix + filters non-numeric chars', () => {
    let captured: DrawerValues = {};
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'amt', label: 'Montant', type: 'money' }]}
        onSave={(v) => {
          captured = v;
        }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('€')).toBeInTheDocument();
    const input = document.querySelector('.drw-money-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc12,50xyz' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(captured).toEqual({ amt: '12,50' });
  });

  it('Field type=date → renders <input type="date">', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'd', label: 'Date', type: 'date' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
  });

  it('Field type=select → renders <select> with placeholder option', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[
          {
            key: 'cat',
            label: 'Cat',
            type: 'select',
            placeholder: 'Choisir…',
            options: [
              { value: 'a', label: 'Alpha' },
              { value: 'b', label: 'Bravo' },
            ],
          },
        ]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const select = document.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(screen.getByText('Choisir…')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('Field type=category → renders pill grid; click pill sets value', () => {
    let captured: DrawerValues = {};
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[
          {
            key: 'cat',
            label: 'Cat',
            type: 'category',
            options: [
              { value: 'food', label: 'Alimentation', emoji: '🍕', color: '#14b8a6' },
              { value: 'rent', label: 'Loyer', emoji: '🏠', color: '#f59e0b' },
            ],
          },
        ]}
        onSave={(v) => {
          captured = v;
        }}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /alimentation/i }));
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(captured).toEqual({ cat: 'food' });
  });

  it('Field type=frequency → renders 4 default segmented buttons', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'freq', label: 'Fréquence', type: 'frequency' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const group = document.querySelector('.drw-segmented') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute('role')).toBe('radiogroup');
    const buttons = group.querySelectorAll('.drw-seg-btn');
    expect(buttons).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Mensuel' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Annuel' })).toBeInTheDocument();
  });

  it('Field type=notes → renders <textarea>', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'n', label: 'Notes', type: 'notes' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(document.querySelector('textarea')).not.toBeNull();
  });

  it('onChange clears field error', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'name', label: 'Nom', type: 'text', required: true }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(screen.getByText('Requis')).toBeInTheDocument();
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'A' } });
    expect(screen.queryByText('Requis')).not.toBeInTheDocument();
  });

  it('Money validation → "Montant invalide" if NaN', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'amt', label: 'Montant', type: 'money' }]}
        initial={{ amt: 'abc' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(screen.getByText('Montant invalide')).toBeInTheDocument();
  });

  it('Money validation → "Montant invalide" if negative', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'amt', label: 'Montant', type: 'money' }]}
        initial={{ amt: '-50' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(screen.getByText('Montant invalide')).toBeInTheDocument();
  });

  it('Custom validate function → returns custom error message', () => {
    const onSave = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[
          {
            key: 'a',
            label: 'A',
            type: 'text',
            validate: (v) => (v === 'bad' ? 'Mauvaise valeur' : undefined),
          },
        ]}
        initial={{ a: 'bad' }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(screen.getByText('Mauvaise valeur')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Field with help text → renders help when no error', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'a', label: 'A', type: 'text', help: 'Texte daide' }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Texte daide')).toBeInTheDocument();
  });

  it('subtitle prop → rendered in header', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        subtitle="Charge mensuelle"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Charge mensuelle')).toBeInTheDocument();
  });

  it('cancel button in footer → onCancel called', () => {
    const onCancel = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('header close icon button → onCancel called', () => {
    const onCancel = vi.fn();
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={baseFields}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Field type=date onChange → updates value passed to onSave', () => {
    let captured: DrawerValues = {};
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'd', label: 'Date', type: 'date' }]}
        onSave={(v) => {
          captured = v;
        }}
        onCancel={vi.fn()}
      />,
    );
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-05-09' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(captured).toEqual({ d: '2026-05-09' });
  });

  it('Field type=select onChange → updates value passed to onSave', () => {
    let captured: DrawerValues = {};
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[
          {
            key: 's',
            label: 'S',
            type: 'select',
            options: [
              { value: 'x', label: 'X' },
              { value: 'y', label: 'Y' },
            ],
          },
        ]}
        onSave={(v) => {
          captured = v;
        }}
        onCancel={vi.fn()}
      />,
    );
    const select = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(captured).toEqual({ s: 'y' });
  });

  it('Field type=notes onChange → updates value passed to onSave', () => {
    let captured: DrawerValues = {};
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'n', label: 'Notes', type: 'notes' }]}
        onSave={(v) => {
          captured = v;
        }}
        onCancel={vi.fn()}
      />,
    );
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Mon commentaire' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(captured).toEqual({ n: 'Mon commentaire' });
  });

  it('Frequency button click → updates value, marks aria-checked=true', () => {
    let captured: DrawerValues = {};
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'freq', label: 'F', type: 'frequency' }]}
        onSave={(v) => {
          captured = v;
        }}
        onCancel={vi.fn()}
      />,
    );
    const yearly = screen.getByRole('radio', { name: 'Annuel' });
    fireEvent.click(yearly);
    expect(yearly.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(captured).toEqual({ freq: 'yearly' });
  });

  it('Frequency with custom options → uses custom options not defaults', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[
          {
            key: 'f',
            label: 'F',
            type: 'frequency',
            options: [
              { value: 'a', label: 'Custom A' },
              { value: 'b', label: 'Custom B' },
            ],
          },
        ]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Custom A' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Mensuel' })).not.toBeInTheDocument();
  });

  it('Category option without emoji → renders without emoji span', () => {
    const { container } = render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[
          {
            key: 'c',
            label: 'C',
            type: 'category',
            options: [{ value: 'plain', label: 'Plain Label' }],
          },
        ]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('.drw-cat-emoji')).toBeNull();
    expect(screen.getByRole('button', { name: 'Plain Label' })).toBeInTheDocument();
  });

  it('Disabled text field → input is disabled and readOnly', () => {
    render(
      <EditDrawer
        open={true}
        title="Edit"
        fields={[{ key: 'a', label: 'A', type: 'text', disabled: true }]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.readOnly).toBe(true);
  });
});
