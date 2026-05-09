import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as React from 'react';

import { PlaygroundSection } from './_components/PlaygroundSection';
import { ButtonDemo } from './_components/demos/ButtonDemo';
import { ChipDemo } from './_components/demos/ChipDemo';
import { CardDemo } from './_components/demos/CardDemo';
import { ProgressBarDemo } from './_components/demos/ProgressBarDemo';
import { AvatarDemo } from './_components/demos/AvatarDemo';
import { DrawerDemo } from './_components/demos/DrawerDemo';
import { ColorPickerDemo } from './_components/demos/ColorPickerDemo';
import { IconPickerDemo } from './_components/demos/IconPickerDemo';
import { TabsDemo } from './_components/demos/TabsDemo';
import { ThemeToggleDemo } from './_components/demos/ThemeToggleDemo';
import { LangSwitcherDemo } from './_components/demos/LangSwitcherDemo';

export const metadata: Metadata = {
  title: 'Playground · Ankora Atoms',
  description: 'Internal design system playground (dev only).',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ATOMS: ReadonlyArray<{ id: string; name: string; Demo: React.ComponentType }> = [
  { id: 'button', name: '01 — Button', Demo: ButtonDemo },
  { id: 'chip', name: '02 — Chip', Demo: ChipDemo },
  { id: 'card', name: '03 — Card', Demo: CardDemo },
  { id: 'drawer', name: '04 — Drawer', Demo: DrawerDemo },
  { id: 'progress-bar', name: '05 — ProgressBar', Demo: ProgressBarDemo },
  { id: 'avatar', name: '06 — Avatar', Demo: AvatarDemo },
  { id: 'color-picker', name: '07 — ColorPicker', Demo: ColorPickerDemo },
  { id: 'icon-picker', name: '08 — IconPicker', Demo: IconPickerDemo },
  { id: 'tabs', name: '09 — Tabs', Demo: TabsDemo },
  { id: 'theme-toggle', name: '10 — ThemeToggle', Demo: ThemeToggleDemo },
  { id: 'lang-switcher', name: '11 — LangSwitcher', Demo: LangSwitcherDemo },
];

export default function DesignPlaygroundPage(): React.JSX.Element {
  if (process.env.NODE_ENV === 'production' && process.env.ANKORA_PLAYGROUND_ENABLED !== 'true') {
    notFound();
  }

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>Ankora Design Playground</h1>
        <p style={{ marginTop: 8, color: 'var(--color-muted-foreground)' }}>
          11 atoms CD#3 — internal QA route. Production-gated par{' '}
          <code>ANKORA_PLAYGROUND_ENABLED=true</code>.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 24 }}>
        {ATOMS.map(({ id, name, Demo }) => (
          <PlaygroundSection key={id} id={id} title={name}>
            <Demo />
          </PlaygroundSection>
        ))}
      </div>
    </main>
  );
}
