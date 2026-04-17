export const SITE = {
  name: 'Ankora',
  tagline: 'Ton ancrage financier',
  description:
    "Ankora t'aide à lisser tes charges, anticiper chaque facture et garder le contrôle de ton budget mois après mois. Pas de conseil en placement, juste un cockpit clair et sécurisé.",
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
  authors: [{ name: 'Thierry Vanmansart' }],
  twitter: '@ankora_app',
} as const;
