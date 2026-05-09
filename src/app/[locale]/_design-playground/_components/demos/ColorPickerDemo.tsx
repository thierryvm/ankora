'use client';
import * as React from 'react';
import { ColorPicker } from '@/components/atoms';

export function ColorPickerDemo(): React.JSX.Element {
  const [color, setColor] = React.useState('#14b8a6');
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        Sélectionnée : <code>{color}</code>
      </div>
      <ColorPicker value={color} onChange={setColor} />
    </div>
  );
}
