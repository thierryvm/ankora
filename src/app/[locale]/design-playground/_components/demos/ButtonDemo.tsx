'use client';
import * as React from 'react';
import { AnkButton } from '@/components/atoms';

export function ButtonDemo(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <AnkButton>Primary md</AnkButton>
      <AnkButton variant="secondary">Secondary</AnkButton>
      <AnkButton variant="ghost">Ghost</AnkButton>
      <AnkButton variant="destructive">Destructive</AnkButton>
      <AnkButton loading>Loading</AnkButton>
      <AnkButton disabled>Disabled</AnkButton>
      <AnkButton size="sm">Small</AnkButton>
      <AnkButton size="lg">Large</AnkButton>
    </div>
  );
}
