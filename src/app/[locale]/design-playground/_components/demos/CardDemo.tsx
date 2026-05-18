'use client';
import * as React from 'react';
import { AnkCard } from '@/components/atoms';

export function CardDemo(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      <AnkCard title="Default" padding="md">
        Body content
      </AnkCard>
      <AnkCard title="Brand tone" tone="brand" padding="md">
        Body
      </AnkCard>
      <AnkCard title="Warning tone" tone="warning" padding="md">
        Body
      </AnkCard>
      <AnkCard title="Raised elevation" elevation="raised" padding="md">
        Body
      </AnkCard>
    </div>
  );
}
