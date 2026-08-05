/**
 * Déclarations pour `generate-notice.mjs`.
 *
 * Le générateur reste en JavaScript : il tourne hors de la chaîne TypeScript,
 * via `npm run notice`, y compris quand `node_modules` vient d'être réinstallé
 * et qu'aucune compilation n'a eu lieu. Ce fichier donne à sa spec un typage
 * réel plutôt qu'un `any` — sans quoi le test pourrait appeler n'importe quoi
 * avec n'importe quels arguments et rester vert.
 */

/** Les seuls champs de `package-lock.json` que le générateur consulte. */
export type LockPackage = {
  version?: string;
  license?: string;
  dev?: boolean;
  devOptional?: boolean;
  optional?: boolean;
  link?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export type Lock = { packages: Record<string, LockPackage> };

export type PkgJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export const BEGIN_MARKER: string;
export const END_MARKER: string;

export function nomDepuisChemin(chemin: string): string;

/**
 * Les chemins d'entrée du lock réellement joignables depuis les dépendances de
 * production, arêtes optionnelles comprises. Ne se fie pas aux drapeaux `dev`.
 */
export function atteignablesEnProduction(lock: Lock, pkgJson: PkgJson): Set<string>;

export function inventaireProduction(
  lock: Lock,
  pkgJson: PkgJson,
): Array<{ chemin: string; nom: string; version?: string; licence: string }>;

/** Lève sur une licence à déclencheur réseau, ou sur une entrée sans licence. */
export function corpsGenere(lock: Lock, pkgJson: PkgJson): string;

/** Lève si les marqueurs manquent ou ne sont pas uniques. */
export function remplacerRegion(noticeExistant: string, corps: string): string;
