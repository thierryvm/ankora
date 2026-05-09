'use client';
/**
 * Atom 04 — Drawer (EditDrawer + 7 field primitives)
 *
 * Source: design_handoff_ankora_v1/atoms/_deps/drawer.jsx (Claude Design Session #3)
 *
 * Drawer édition Linear-style slide-in.
 * - Desktop : slide-in droite (480px)
 * - Mobile (<700px) : full-screen, bottom→top (iOS Settings pattern)
 * - Multi-champs contextuels via prop `fields` (discriminated union sur `type`)
 * - Footer sticky : Save (primary) · Cancel · Delete (rouge, optionnel, 2 clics)
 * - Validation inline visible
 * - Focus trap minimal (auto-focus 1er input via rAF ; ESC = fermer ; backdrop = fermer)
 *
 * Single source of truth pour Surfaces 1-4 (charges, dépenses, catégories, comptes).
 *
 * 7 field primitives internes au fichier (pas exportées) :
 * text · money · date · select · category · frequency · notes
 */

import * as React from 'react';

/* ============================================================================
   Types — discriminated union sur `type`
   ============================================================================ */

export type DrawerFieldType =
  | 'text'
  | 'money'
  | 'date'
  | 'select'
  | 'category'
  | 'frequency'
  | 'notes';

interface DrawerFieldBase {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly help?: string;
  readonly disabled?: boolean;
  readonly validate?: (value: string | undefined, all: DrawerValues) => string | undefined;
}

export interface DrawerTextField extends DrawerFieldBase {
  readonly type: 'text';
  readonly inputType?: 'text' | 'email' | 'tel' | 'url';
}
export interface DrawerMoneyField extends DrawerFieldBase {
  readonly type: 'money';
}
export interface DrawerDateField extends DrawerFieldBase {
  readonly type: 'date';
}
export interface DrawerNotesField extends DrawerFieldBase {
  readonly type: 'notes';
}
export interface DrawerSelectField extends DrawerFieldBase {
  readonly type: 'select';
  readonly options: ReadonlyArray<{ value: string; label: string }>;
}
export interface DrawerCategoryField extends DrawerFieldBase {
  readonly type: 'category';
  readonly options: ReadonlyArray<{ value: string; label: string; emoji?: string; color?: string }>;
}
export interface DrawerFrequencyField extends DrawerFieldBase {
  readonly type: 'frequency';
  readonly options?: ReadonlyArray<{ value: string; label: string }>;
}

export type DrawerField =
  | DrawerTextField
  | DrawerMoneyField
  | DrawerDateField
  | DrawerSelectField
  | DrawerCategoryField
  | DrawerFrequencyField
  | DrawerNotesField;

export type DrawerValues = Readonly<Record<string, string | undefined>>;

export interface EditDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly fields: readonly DrawerField[];
  readonly initial?: DrawerValues;
  readonly onSave: (values: DrawerValues) => void;
  readonly onCancel: () => void;
  readonly onDelete?: (values: DrawerValues) => void;
  readonly deleteLabel?: string;
}

/* ============================================================================
   FieldLabel — partagé par tous les renderers
   ============================================================================ */

interface FieldLabelProps {
  readonly children: React.ReactNode;
  readonly required?: boolean;
  readonly error?: string;
}

function FieldLabel({ children, required, error }: FieldLabelProps): React.JSX.Element {
  return (
    <div className="drw-label-row">
      <label className={['drw-label', error ? 'is-error' : ''].filter(Boolean).join(' ')}>
        {children}
        {required && <span className="drw-required"> *</span>}
      </label>
      {error && <span className="drw-error-msg">{error}</span>}
    </div>
  );
}

/* ============================================================================
   Field renderers — internes au module
   ============================================================================ */

interface RendererProps<F extends DrawerField> {
  readonly field: F;
  readonly value: string | undefined;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}

function TextFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerTextField>): React.JSX.Element {
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <input
        className={['drw-input', error ? 'is-error' : ''].filter(Boolean).join(' ')}
        type={field.inputType ?? 'text'}
        placeholder={field.placeholder}
        value={value ?? ''}
        disabled={!!field.disabled}
        readOnly={!!field.disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.help && !error && <div className="drw-help">{field.help}</div>}
    </div>
  );
}

function MoneyFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerMoneyField>): React.JSX.Element {
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <div className="drw-money">
        <input
          className={['drw-input', 'drw-money-input', error ? 'is-error' : '']
            .filter(Boolean)
            .join(' ')}
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9,.\-]/g, ''))}
        />
        <span className="drw-money-suffix">€</span>
      </div>
      {field.help && !error && <div className="drw-help">{field.help}</div>}
    </div>
  );
}

function DateFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerDateField>): React.JSX.Element {
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <input
        className={['drw-input', error ? 'is-error' : ''].filter(Boolean).join(' ')}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.help && !error && <div className="drw-help">{field.help}</div>}
    </div>
  );
}

function SelectFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerSelectField>): React.JSX.Element {
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <div className="drw-select">
        <select
          className={['drw-input', error ? 'is-error' : ''].filter(Boolean).join(' ')}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>
            {field.placeholder ?? '—'}
          </option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="drw-select-chev"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {field.help && !error && <div className="drw-help">{field.help}</div>}
    </div>
  );
}

function CategoryFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerCategoryField>): React.JSX.Element {
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <div className="drw-cat-grid">
        {field.options.map((o) => {
          const active = value === o.value;
          const activeStyle: React.CSSProperties | undefined =
            active && o.color
              ? {
                  borderColor: o.color,
                  background: `color-mix(in oklab, ${o.color} 14%, transparent)`,
                }
              : undefined;
          return (
            <button
              key={o.value}
              type="button"
              className={['drw-cat-chip', active ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => onChange(o.value)}
              style={activeStyle}
            >
              {o.emoji && <span className="drw-cat-emoji">{o.emoji}</span>}
              <span className="drw-cat-label">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DEFAULT_FREQ_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'monthly', label: 'Mensuel' },
  { value: 'quarterly', label: 'Trim.' },
  { value: 'yearly', label: 'Annuel' },
  { value: 'once', label: 'Unique' },
];

function FrequencyFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerFrequencyField>): React.JSX.Element {
  const opts = field.options ?? DEFAULT_FREQ_OPTIONS;
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <div className="drw-segmented" role="radiogroup">
        {opts.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={['drw-seg-btn', active ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotesFieldRenderer({
  field,
  value,
  error,
  onChange,
}: RendererProps<DrawerNotesField>): React.JSX.Element {
  return (
    <div className="drw-field">
      <FieldLabel required={field.required} error={error}>
        {field.label}
      </FieldLabel>
      <textarea
        className={['drw-input', 'drw-textarea', error ? 'is-error' : ''].filter(Boolean).join(' ')}
        rows={3}
        placeholder={field.placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.help && !error && <div className="drw-help">{field.help}</div>}
    </div>
  );
}

/* ============================================================================
   EditDrawer — composant exporté
   ============================================================================ */

export function EditDrawer({
  open,
  title,
  subtitle,
  fields,
  initial,
  onSave,
  onCancel,
  onDelete,
  deleteLabel = 'Supprimer',
}: EditDrawerProps): React.JSX.Element {
  const [values, setValues] = React.useState<DrawerValues>(initial ?? {});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = React.useState(false);
  const panelRef = React.useRef<HTMLElement | null>(null);

  // Reset state + auto-focus first input quand le drawer s'ouvre
  React.useEffect(() => {
    if (!open) return;
    setValues(initial ?? {});
    setErrors({});
    setConfirmDel(false);
    const id = requestAnimationFrame(() => {
      const el = panelRef.current?.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('.drw-input:not([readonly]):not([disabled])');
      if (el) el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, initial]);

  // ESC → onCancel
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const setField = React.useCallback((key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => {
      if (!e[key]) return e;
      const n = { ...e };
      delete n[key];
      return n;
    });
  }, []);

  const validateAll = React.useCallback((): boolean => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.required && (v === undefined || v === null || v === '')) {
        errs[f.key] = 'Requis';
        continue;
      }
      if (f.type === 'money' && v) {
        const num = parseFloat(String(v).replace(',', '.'));
        if (Number.isNaN(num) || num < 0) {
          errs[f.key] = 'Montant invalide';
          continue;
        }
      }
      if (f.validate) {
        const m = f.validate(v, values);
        if (m) {
          errs[f.key] = m;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [fields, values]);

  const handleSave = React.useCallback(() => {
    if (validateAll()) onSave(values);
  }, [validateAll, onSave, values]);

  const handleDelete = React.useCallback(() => {
    if (onDelete) onDelete(values);
  }, [onDelete, values]);

  const renderField = (f: DrawerField): React.JSX.Element | null => {
    const value = values[f.key];
    const error = errors[f.key];
    const onChange = (v: string) => setField(f.key, v);
    switch (f.type) {
      case 'text':
        return (
          <TextFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      case 'money':
        return (
          <MoneyFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      case 'date':
        return (
          <DateFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      case 'select':
        return (
          <SelectFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      case 'category':
        return (
          <CategoryFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      case 'frequency':
        return (
          <FrequencyFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      case 'notes':
        return (
          <NotesFieldRenderer
            key={f.key}
            field={f}
            value={value}
            error={error}
            onChange={onChange}
          />
        );
      default: {
        // Exhaustiveness check — TypeScript will error if a new field type is added without a case
        const _exhaustive: never = f;
        return _exhaustive;
      }
    }
  };

  return (
    <div
      className={['drw-root', open ? 'is-open' : ''].filter(Boolean).join(' ')}
      aria-hidden={!open}
    >
      <div className="drw-overlay" onClick={onCancel} />
      <aside
        ref={panelRef}
        className="drw-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <header className="drw-header">
          <div className="drw-header-text">
            <div className="drw-title">{title}</div>
            {subtitle && <div className="drw-subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="drw-icon-btn" onClick={onCancel} aria-label="Fermer">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="drw-body">{fields.map((f) => renderField(f))}</div>

        {/* Footer */}
        <footer className="drw-footer">
          {onDelete ? (
            confirmDel ? (
              <div className="drw-confirm">
                <span className="drw-confirm-text">Confirmer la suppression&nbsp;?</span>
                <button
                  type="button"
                  className="drw-btn drw-btn-ghost"
                  onClick={() => setConfirmDel(false)}
                >
                  Non
                </button>
                <button type="button" className="drw-btn drw-btn-danger" onClick={handleDelete}>
                  Oui, supprimer
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="drw-btn drw-btn-danger-ghost"
                onClick={() => setConfirmDel(true)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" />
                </svg>
                {deleteLabel}
              </button>
            )
          ) : (
            <span />
          )}
          <div className="drw-footer-actions">
            <button type="button" className="drw-btn drw-btn-ghost" onClick={onCancel}>
              Annuler
            </button>
            <button type="button" className="drw-btn drw-btn-primary" onClick={handleSave}>
              Enregistrer
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
