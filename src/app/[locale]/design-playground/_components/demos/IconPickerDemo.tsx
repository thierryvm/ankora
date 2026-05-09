'use client';
import * as React from 'react';
import { IconPicker, type AnkoraIconName } from '@/components/atoms';

export function IconPickerDemo(): React.JSX.Element {
  const [icon, setIcon] = React.useState<AnkoraIconName | undefined>('home');
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        Sélectionnée : <code>{icon ?? '—'}</code>
      </div>
      <IconPicker value={icon} onChange={setIcon} columns={6} />
    </div>
  );
}
