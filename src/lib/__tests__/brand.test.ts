/**
 * L'adresse de contact a UNE source, et ce fichier le PROUVE.
 *
 * `site.ts` portait un commentaire se déclarant « single source of truth »
 * pendant que quatre constantes et vingt-cinq chaînes de traduction en
 * gardaient une copie. Une propriété affirmée en commentaire et vérifiée par
 * rien est exactement ce qui a laissé deux écrans diverger de 400 € (#349).
 *
 * L'enjeu n'est pas cosmétique : la mention RGPD de la politique de
 * confidentialité et celle de la notice cookies sont les voies par lesquelles
 * une personne exerce ses droits. Une copie oubliée le jour d'un changement
 * d'adresse, et la demande n'arrive nulle part — art. 12(2).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { brand } from '@/lib/brand';
import { SITE } from '@/lib/site';

const RACINE = join(process.cwd(), 'src');
const MESSAGES = join(process.cwd(), 'messages');

function fichiers(dossier: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin, extensions));
    else if (extensions.some((e) => entree.endsWith(e))) out.push(chemin);
  }
  return out;
}

describe("l'adresse de contact", () => {
  it('est la même partout où elle est exposée', () => {
    expect(SITE.contactEmail).toBe(brand.contactEmail);
    expect(brand.privacyEmail).toBe(brand.contactEmail);
    expect(brand.securityEmail).toBe(brand.contactEmail);
  });

  it('ressemble à une adresse, sinon le contact légal ne vaut rien', () => {
    expect(brand.contactEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  /**
   * Le témoin le plus utile : il échoue si quelqu'un recolle l'adresse en dur
   * quelque part, ce qui est précisément la façon dont les quatre copies
   * précédentes sont apparues — une à la fois, chacune raisonnable seule.
   */
  it("n'est écrite en dur nulle part ailleurs dans src/", () => {
    const source = join(RACINE, 'lib', 'brand.ts');
    const coupables = fichiers(RACINE, ['.ts', '.tsx'])
      .filter((f) => f !== source && !f.includes('__tests__'))
      .filter((f) => readFileSync(f, 'utf8').includes(brand.contactEmail))
      .map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/'));

    expect(coupables, `copies littérales à remplacer par brand.contactEmail`).toEqual([]);
  });

  it("n'est écrite en dur dans aucune traduction", () => {
    const coupables = fichiers(MESSAGES, ['.json'])
      .filter((f) => readFileSync(f, 'utf8').includes(brand.contactEmail))
      .map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/'));

    expect(coupables, 'utiliser le placeholder {email} et passer la valeur au rendu').toEqual([]);
  });

  /**
   * Contre-épreuve du garde lui-même : un instrument muet et un instrument qui
   * ne trouve rien rendent la même sortie. Celui-ci DOIT trouver quelque chose
   * quand on lui donne une chaîne qui existe vraiment.
   */
  it('sait trouver une chaîne présente — sinon il ne prouve rien', () => {
    const temoins = fichiers(RACINE, ['.ts']).filter((f) =>
      readFileSync(f, 'utf8').includes('Tribunal'),
    );
    expect(temoins.length).toBeGreaterThan(0);
  });
});
