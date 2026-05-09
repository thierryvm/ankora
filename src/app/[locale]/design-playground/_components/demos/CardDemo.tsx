'use client';
import * as React from 'react';
import { Card } from '@/components/atoms';

export function CardDemo(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      <Card title="Default" padding="md">
        Body content
      </Card>
      <Card title="Brand tone" tone="brand" padding="md">
        Body
      </Card>
      <Card title="Warning tone" tone="warning" padding="md">
        Body
      </Card>
      <Card title="Raised elevation" elevation="raised" padding="md">
        Body
      </Card>
    </div>
  );
}
