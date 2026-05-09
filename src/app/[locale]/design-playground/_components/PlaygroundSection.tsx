import * as React from 'react';
import { Card } from '@/components/atoms';

export interface PlaygroundSectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}

export function PlaygroundSection({
  id,
  title,
  children,
}: PlaygroundSectionProps): React.JSX.Element {
  return (
    <Card padding="lg" elevation="raised" id={id} title={title}>
      <div style={{ marginTop: 8 }}>{children}</div>
    </Card>
  );
}
