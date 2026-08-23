import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `dvh` est interdit dans les classes de mise en page. `svh` est l'unité de ce
 * dépôt.
 *
 * **Mesuré le 2026-08-23**, WebKit iPhone 14, en faisant varier la hauteur du
 * viewport pendant qu'un tiroir était ouvert — ce que la barre d'URL de Safari
 * fait à chaque défilement :
 *
 * ```
 *   viewport 664 px -> tiroir 664 px    (ExpenseEditDrawer, h-dvh)
 *   viewport 560 px -> tiroir 560 px
 *   viewport 420 px -> tiroir 420 px
 *
 *   viewport 664 px -> feuille max-height 610.88 px   (Sheet, max-h-[92dvh])
 *   viewport 420 px -> feuille max-height 386.40 px, la feuille est rognée
 * ```
 *
 * Le tiroir suivait le viewport **au pixel**. Signalé par @thierry comme « le
 * modal qui change sa taille tout le temps » et « la page bouge dans tous les
 * sens » — c'est la même cause.
 *
 * Les trois unités ne sont pas interchangeables :
 *
 * | unité | définie contre | stable ? |
 * | ----- | -------------- | -------- |
 * | `lvh` | UI du navigateur **rétractée** | oui, mais le contenu passe sous la barre |
 * | `dvh` | l'état **courant** de l'UI | **non — c'est tout le défaut** |
 * | `svh` | UI du navigateur **déployée** | **oui**, par définition de la spec |
 *
 * Pourquoi un test qui lit du texte plutôt qu'un test de navigateur : aucun
 * navigateur sans chrome dynamique ne peut distinguer `svh` de `dvh`. Sous
 * Playwright, WebKit rend `100dvh === 100svh === 100lvh === 664` — vérifié. Le
 * seul témoin possible est donc la source, et le vrai iPhone de @thierry.
 */

const RACINE = join(process.cwd(), 'src');

/** `dvh` précédé d'un chiffre ou d'un tiret : `h-dvh`, `92dvh`, `min-h-dvh`. */
const MOTIF = /[-\d]dvh\b/;

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      // Les tests sont exclus : CE fichier nomme `dvh` dans ses propres
      // assertions témoins, et s'auto-accuserait.
      if (nom !== '__tests__') fichiers(chemin, acc);
    } else if (/\.(tsx?|css)$/.test(nom)) {
      acc.push(chemin);
    }
  }
  return acc;
}

/**
 * Les commentaires ont le DROIT de nommer `dvh` — ils expliquent précisément
 * pourquoi on ne s'en sert pas, et les supprimer serait perdre la raison.
 *
 * Les blocs `/* … *\/` sont retirés en premier, avant tout découpage en lignes :
 * un filtre par préfixe de ligne laissait passer le milieu d'un bloc CSS de
 * plusieurs lignes, ce que ce test a effectivement remonté à sa première
 * exécution.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((ligne) =>
      // Couper à partir de `//`, pas seulement les lignes qui COMMENCENT par
      // `//` : sinon `'h-svh', // remplace h-dvh` serait accusé. Le `(?<!:)`
      // épargne les URL (`https://`), seul cas courant de `//` en milieu de
      // ligne qui ne soit pas un commentaire.
      ligne.replace(/(?<!:)\/\/.*$/, ''),
    )
    .join('\n');
}

describe('unités de viewport — `svh`, jamais `dvh`', () => {
  it('aucune classe de mise en page n’utilise `dvh`', () => {
    const fautifs: string[] = [];

    for (const chemin of fichiers(RACINE)) {
      const lignes = sansCommentaires(readFileSync(chemin, 'utf8')).split('\n');
      lignes.forEach((ligne, i) => {
        if (!MOTIF.test(ligne)) return;
        fautifs.push(
          `${chemin.replace(process.cwd(), '').replace(/\\/g, '/')}:${i + 1}  ${ligne.trim().slice(0, 90)}`,
        );
      });
    }

    expect(
      fautifs,
      `\`dvh\` suit la barre d'URL de Safari : la surface se redimensionne à chaque défilement.\nUtiliser \`svh\`.\n\n${fautifs.join('\n')}`,
    ).toHaveLength(0);
  });

  it('le motif attrape bien une classe fautive — témoin', () => {
    // Sans ce cas, la règle passerait au vert le jour où le motif cesse de
    // matcher quoi que ce soit, et personne ne le saurait.
    expect(MOTIF.test("'h-dvh max-h-dvh'")).toBe(true);
    expect(MOTIF.test("'max-h-[92dvh]'")).toBe(true);
    expect(MOTIF.test("'min-h-dvh'")).toBe(true);
    expect(MOTIF.test("'h-svh max-h-svh'")).toBe(false);
  });

  /**
   * Les trois formes de commentaire doivent être neutralisées, y compris celle
   * en FIN de ligne — signalée par Sourcery le 2026-08-23. Un filtre qui ne
   * traitait que les lignes commençant par `//` aurait accusé
   * `'h-svh', // remplace h-dvh`, c'est-à-dire la ligne même qui documente le
   * correctif.
   */
  it('neutralise les trois formes de commentaire, et épargne les URL', () => {
    expect(sansCommentaires("  'h-svh', // remplace h-dvh").includes('dvh')).toBe(false);
    expect(sansCommentaires('  // h-dvh partout').includes('dvh')).toBe(false);
    expect(sansCommentaires('/* bloc\n   avec h-dvh dedans\n*/').includes('dvh')).toBe(false);

    // Une URL n'est pas un commentaire : la ligne doit survivre entière.
    expect(sansCommentaires("const u = 'https://exemple.be/h-dvh';")).toContain('exemple.be');

    // Et le code NU reste vu — sans quoi le nettoyage avalerait la règle.
    expect(sansCommentaires("  'h-dvh max-h-dvh',")).toContain('dvh');
  });
});
