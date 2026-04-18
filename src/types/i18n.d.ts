import type messages from '../../messages/fr-BE.json';
import type { LOCALES } from '@/i18n/routing';

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages;
    Locale: (typeof LOCALES)[number];
  }
}
