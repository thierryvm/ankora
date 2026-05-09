import * as Lucide from 'lucide-react';
import type * as React from 'react';

/**
 * Ankora curated icon registry — 25 icônes Lucide mappées aux catégories
 * budget belges typiques (logement, courses, voiture, énergie, etc.).
 *
 * **Décision sécurité (2026-04-23)** : on n'adopte PAS le pattern raw SVG
 * paths du handoff (`design_handoff_ankora_v1/atoms/08-IconPicker.jsx`)
 * car il injecte des chaînes SVG via une prop HTML brute (XSS si le
 * registry est pollué + perte du tooling typé).
 *
 * À la place : composants `lucide-react` directement — tree-shakable,
 * typés, audités par la communauté.
 *
 * Module pur (pas de `'use client'`) : safe à importer côté serveur.
 */

export type AnkoraIconName =
  | 'home'
  | 'wallet'
  | 'pie-chart'
  | 'trending-up'
  | 'shield-check'
  | 'utensils'
  | 'car'
  | 'zap'
  | 'wifi'
  | 'phone'
  | 'shopping-cart'
  | 'gift'
  | 'heart'
  | 'gamepad-2'
  | 'plane'
  | 'book-open'
  | 'graduation-cap'
  | 'briefcase'
  | 'piggy-bank'
  | 'banknote'
  | 'receipt'
  | 'calendar'
  | 'bell'
  | 'settings'
  | 'help-circle';

export interface AnkoraIconDef {
  readonly name: AnkoraIconName;
  readonly label: string;
  readonly Component: React.ComponentType<{ size?: number; className?: string }>;
}

export const ANKORA_ICON_LIB: readonly AnkoraIconDef[] = [
  { name: 'home', label: 'Logement', Component: Lucide.Home },
  { name: 'wallet', label: 'Portefeuille', Component: Lucide.Wallet },
  { name: 'pie-chart', label: 'Provisions', Component: Lucide.PieChart },
  { name: 'trending-up', label: 'Épargne', Component: Lucide.TrendingUp },
  { name: 'shield-check', label: 'Sécurité', Component: Lucide.ShieldCheck },
  { name: 'utensils', label: 'Courses', Component: Lucide.Utensils },
  { name: 'car', label: 'Voiture', Component: Lucide.Car },
  { name: 'zap', label: 'Énergie', Component: Lucide.Zap },
  { name: 'wifi', label: 'Internet', Component: Lucide.Wifi },
  { name: 'phone', label: 'Téléphone', Component: Lucide.Phone },
  { name: 'shopping-cart', label: 'Achats', Component: Lucide.ShoppingCart },
  { name: 'gift', label: 'Cadeaux', Component: Lucide.Gift },
  { name: 'heart', label: 'Santé', Component: Lucide.Heart },
  { name: 'gamepad-2', label: 'Loisirs', Component: Lucide.Gamepad2 },
  { name: 'plane', label: 'Voyages', Component: Lucide.Plane },
  { name: 'book-open', label: 'Lecture', Component: Lucide.BookOpen },
  { name: 'graduation-cap', label: 'Études', Component: Lucide.GraduationCap },
  { name: 'briefcase', label: 'Travail', Component: Lucide.Briefcase },
  { name: 'piggy-bank', label: 'Tirelire', Component: Lucide.PiggyBank },
  { name: 'banknote', label: 'Espèces', Component: Lucide.Banknote },
  { name: 'receipt', label: 'Factures', Component: Lucide.Receipt },
  { name: 'calendar', label: 'Calendrier', Component: Lucide.Calendar },
  { name: 'bell', label: 'Notifications', Component: Lucide.Bell },
  { name: 'settings', label: 'Paramètres', Component: Lucide.Settings },
  { name: 'help-circle', label: 'Aide', Component: Lucide.HelpCircle },
];
