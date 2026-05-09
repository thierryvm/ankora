'use client';
import * as React from 'react';
import { LangSwitcher } from '@/components/atoms';

export function LangSwitcherDemo(): React.JSX.Element {
  const [locale, setLocale] = React.useState('fr-BE');
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <LangSwitcher current={locale} onChange={setLocale} />
      <span style={{ color: 'var(--color-muted-foreground)' }}>
        Locale : <code>{locale}</code>
      </span>
    </div>
  );
}
