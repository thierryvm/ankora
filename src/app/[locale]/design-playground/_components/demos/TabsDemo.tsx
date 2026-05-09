'use client';
import * as React from 'react';
import { Tabs, type TabItem } from '@/components/atoms';

const TABS: ReadonlyArray<TabItem> = [
  { id: 'overview', label: 'Vue d’ensemble' },
  { id: 'details', label: 'Détails', badge: 3 },
  { id: 'history', label: 'Historique' },
  { id: 'archived', label: 'Archivé', disabled: true },
];

export function TabsDemo(): React.JSX.Element {
  const [active, setActive] = React.useState('overview');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs
        tabs={TABS}
        activeId={active}
        onChange={setActive}
        variant="pill"
        ariaLabel="Démo pill"
      />
      <Tabs
        tabs={TABS}
        activeId={active}
        onChange={setActive}
        variant="underline"
        size="sm"
        ariaLabel="Démo underline"
      />
      <div style={{ color: 'var(--color-muted-foreground)' }}>
        Onglet actif : <code>{active}</code>
      </div>
    </div>
  );
}
