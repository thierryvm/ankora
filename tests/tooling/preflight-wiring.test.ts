import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le préflight ne doit jamais PLANTER — il doit rendre un verdict.
 *
 * Historique, trois fois la même faute de câblage : les preuves de lien du
 * projet vivent dans des fichiers gitignorés (`.vercel/`, `supabase/.temp/`,
 * `.env.local`), donc absents de tout worktree. `scripts/preflight-accounts.mjs`
 * sait aller les chercher dans le clone d'origine (`resolveLinkFile`) — mais
 * encore faut-il qu'il DÉMARRE.
 *
 * `node --env-file=X` échoue si X n'existe pas : Node sort en `exit 9` avant la
 * première ligne du script. Sur `git push` depuis un worktree, ça donnait un
 * hook mort, sans rapport et sans verdict. `08d9bae` a réparé le chemin
 * `pre-commit` en passant à `--env-file-if-exists` et a laissé le script npm
 * `preflight`, donc le chemin `pre-push`, tel quel.
 *
 * Un garde-fou qui plante est pire qu'un garde-fou permissif : il n'enseigne
 * rien sauf `--no-verify`. Ces cas épinglent le câblage pour qu'un retour en
 * arrière soit visible avant d'être vécu.
 *
 * Ce qu'ils ne testent PAS, et volontairement : le VERDICT du préflight. Il
 * dépend de comptes réels et d'appels réseau. Ici, une seule question — le
 * script peut-il commencer ?
 */

const root = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('le préflight démarre même quand .env.local est absent', () => {
  const entryPoints = [
    [
      'script npm `preflight` (appelé par pre-push)',
      () => JSON.parse(read('package.json')).scripts.preflight,
    ],
    ['hook pre-commit', () => read('.husky/pre-commit')],
  ] as const;

  /**
   * Ancré sur un VRAI appel `node`, pas sur la chaîne nue.
   *
   * `--env-file-if-exists=` ne matche pas `--env-file=` — le `=` doit suivre
   * `file` immédiatement — donc la forme corrigée passe. Mais un fichier peut
   * parfaitement citer `--env-file` en prose : le commentaire de `pre-push`
   * ajouté par ce même correctif le fait, pour expliquer ce qu'on a arrêté de
   * faire. Sans l'ancre, ce test deviendrait rouge le jour où quelqu'un écrit
   * `--env-file=` dans une explication — un faux positif sur une porte, c'est-
   * à-dire précisément ce que ce correctif combat.
   */
  const APPEL_NODE_EN_DUR = /node[^\n]*--env-file=/;

  it.each(entryPoints)('%s ne charge jamais .env.local en dur', (_label, source) => {
    const text = source();
    expect(text).not.toMatch(APPEL_NODE_EN_DUR);
    expect(text).toMatch(/--env-file-if-exists=\.env\.local/);
  });

  it('le hook pre-push passe bien par le script npm corrigé', () => {
    // Si le hook réintroduisait un `node --env-file=…` en direct, les cas
    // ci-dessus resteraient verts sur un chemin que plus personne n'emprunte.
    const hook = read('.husky/pre-push');
    expect(hook).toMatch(/npm run preflight/);
    expect(hook).not.toMatch(APPEL_NODE_EN_DUR);
  });
});
