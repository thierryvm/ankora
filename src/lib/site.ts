import { brand } from '@/lib/brand';

export const SITE = {
  name: 'Ankora',
  tagline: 'Ton ancrage financier',
  description:
    "Ankora t'aide à lisser tes charges, anticiper chaque facture et garder le contrôle de ton budget. Cockpit clair et sécurisé, sans conseil placement.",
  locale: 'fr-BE',
  defaultLocale: 'fr',
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  keywords: [
    'budget',
    'finances personnelles',
    'lissage charges',
    'épargne',
    'gestion budgétaire',
    'cockpit financier',
    'Belgique',
  ],
  themeColor: '#0F766E',
  background: '#F8FAFC',
  authors: [{ name: 'thierryvm' }],
  twitter: '@ankora_app',
  /**
   * Public contact address. This comment used to CLAIM to be the single source
   * of truth while `brand.ts` held three more copies and the legal messages
   * held twenty-five — a property asserted here and verified by nothing, which
   * is the same failure that let two screens drift 400 € apart (#349).
   *
   * The source is now `brand.ts`, and `brand.test.ts` proves it rather than
   * stating it. The reasoning against an env var was right and moved there
   * with the value.
   */
  contactEmail: brand.contactEmail,
} as const;
