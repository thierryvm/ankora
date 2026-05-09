'use client';
import * as React from 'react';
import { ProgressBar } from '@/components/atoms';

export function ProgressBarDemo(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ProgressBar value={0.3} max={1} label="Provisions" showValue />
      <ProgressBar value={0.86} max={1} label="Auto-warning" showValue />
      <ProgressBar value={1.2} max={1} label="Overflow danger" showValue />
      <ProgressBar
        value={0.9}
        max={1}
        label="Split affected/free"
        split={{ affected: 0.6, free: 0.3, affectedTone: 'brand', freeTone: 'accent' }}
      />
    </div>
  );
}
