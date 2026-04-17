import type { Money } from '@/lib/domain/types';

const EUR = new Intl.NumberFormat('fr-BE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function formatMoney(value: Money | number): string {
  const n = typeof value === 'number' ? value : value.toNumber();
  return EUR.format(n);
}

export function formatMonth(month: number): string {
  const names = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ];
  return names[month - 1] ?? '—';
}

export function formatFrequency(freq: string): string {
  switch (freq) {
    case 'monthly':
      return 'Mensuelle';
    case 'quarterly':
      return 'Trimestrielle';
    case 'semiannual':
      return 'Semestrielle';
    case 'annual':
      return 'Annuelle';
    default:
      return freq;
  }
}
