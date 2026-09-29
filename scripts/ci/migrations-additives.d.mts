// Types for migrations-additives.mjs (plain ESM, run by CI without a build step).

export type Refus = { regle: string; extrait: string };

export function instructions(sql: string): string[];
export function nom(brut: string): string;
export function objetsCrees(sql: string): Set<string>;
export function analyserMigration(sql: string, options?: { objetsExistants?: Set<string> }): Refus[];
export function analyserStatuts(nameStatus: string, derniereVersion: string | null): Refus[];
export function attenteNonCouverte(sortie: string, versionsAjoutees: string[]): string[];
export function comparerListeMigrations(
  sortie: string,
  versionsLocales: string[],
): { ok: boolean; ecarts: string[] };
