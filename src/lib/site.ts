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
   * Public contact address. Single source of truth: it also appears in the CGU
   * and in the privacy notice, and three copies of an address drift into three
   * addresses. Deliberately NOT an env var — it must be identical in every
   * environment, and a legal contact that differs between preview and
   * production is a legal contact nobody can rely on.
   */
  contactEmail: 'thierryvm@gmail.com',
} as const;
