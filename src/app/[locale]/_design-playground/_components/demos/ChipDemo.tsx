'use client';
import * as React from 'react';
import { Chip } from '@/components/atoms';

export function ChipDemo(): React.JSX.Element {
  const [chips, setChips] = React.useState<
    ReadonlyArray<{ id: string; label: string; color: string }>
  >([
    { id: '1', label: 'Brand', color: '#14b8a6' },
    { id: '2', label: 'Accent', color: '#d4a017' },
    { id: '3', label: 'Removable', color: '#60a5fa' },
  ]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Chip label="Default" />
      {chips.map((c) => (
        <Chip
          key={c.id}
          label={c.label}
          color={c.color}
          removable
          onRemove={() => setChips((s) => s.filter((x) => x.id !== c.id))}
        />
      ))}
      <Chip label="Avec emoji" emoji="🍕" color="#f87171" />
    </div>
  );
}
