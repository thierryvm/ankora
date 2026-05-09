'use client';
import * as React from 'react';
import { Avatar } from '@/components/atoms';

export function AvatarDemo(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <Avatar emoji="🏠" color="#14b8a6" size="xs" label="Logement" />
      <Avatar emoji="🚗" color="#d4a017" size="sm" label="Voiture" />
      <Avatar initials="AD" color="#60a5fa" size="md" label="Avatar moyen" />
      <Avatar initials="AD" color="#a78bfa" size="lg" shape="circle" label="Avatar circle large" />
      <Avatar initials="AD" color="#fb7185" size="xl" label="Avatar XL" />
    </div>
  );
}
