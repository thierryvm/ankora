/**
 * The payload of `getSixMoisAction` — plain numbers only: a Decimal loses its
 * prototype crossing the action boundary. Formatting happens client-side.
 */
export type SixMoisFacture = Readonly<{
  id: string;
  label: string;
  montant: number;
  jour: number;
  payee: boolean;
  /** ISO timestamp of the recorded payment; null when none is recorded. */
  payeeLe: string | null;
  /** « échéance i/n » for a commitment instalment; null for a bill. */
  echeance: Readonly<{ index: number; total: number }> | null;
}>;

export type SixMoisDepense = Readonly<{
  id: string;
  label: string;
  montant: number;
  date: string;
}>;

export type SixMoisMois = Readonly<{
  year: number;
  month: number;
  statut: 'passe' | 'en-cours' | 'a-venir';
  factures: Readonly<{
    total: number;
    lignes: readonly SixMoisFacture[];
    paiementsNonEnregistres: boolean;
  }>;
  depenses: Readonly<{ total: number; lignes: readonly SixMoisDepense[] }> | null;
  provisions: Readonly<{ net: number; cible: number; facturesDues: number }>;
  total: number;
  auMoins: boolean;
  ecartMoisPrecedent: number | null;
}>;
