'use client';
import * as React from 'react';
import { AnkButton, EditDrawer, type DrawerField } from '@/components/atoms';

const FIELDS: ReadonlyArray<DrawerField> = [
  { type: 'text', key: 'name', label: 'Nom', required: true, placeholder: 'Mon poste' },
  { type: 'money', key: 'amount', label: 'Montant', required: true },
  { type: 'date', key: 'due', label: 'Échéance' },
  {
    type: 'select',
    key: 'status',
    label: 'Statut',
    options: [
      { value: 'draft', label: 'Brouillon' },
      { value: 'active', label: 'Actif' },
    ],
  },
  { type: 'notes', key: 'notes', label: 'Notes' },
];

export function DrawerDemo(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <AnkButton onClick={() => setOpen(true)}>Ouvrir le Drawer</AnkButton>
      <EditDrawer
        open={open}
        title="Démo Drawer"
        fields={FIELDS}
        onSave={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
