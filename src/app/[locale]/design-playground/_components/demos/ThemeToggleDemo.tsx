'use client';
import * as React from 'react';
import { ThemeToggle, type Theme } from '@/components/atoms';

export function ThemeToggleDemo(): React.JSX.Element {
  const [theme, setTheme] = React.useState<Theme>('light');
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <ThemeToggle initialTheme={theme} onChange={setTheme} size="md" />
      <span style={{ color: 'var(--color-muted-foreground)' }}>
        Thème courant : <code>{theme}</code>
      </span>
    </div>
  );
}
