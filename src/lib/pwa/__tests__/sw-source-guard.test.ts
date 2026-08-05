import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde source sur `public/sw.js`.
 *
 * `public/sw.js` n'est ni compilé, ni typé, ni importé : aucun test unitaire ne
 * peut l'atteindre, et aucun outil de ce dépôt ne le regarde. Tout le mécanisme
 * de mise à jour repose pourtant sur **l'absence** d'un appel : un contributeur
 * qui remet `self.skipWaiting()` dans `install` fait disparaître l'état
 * `waiting`, donc la détection, donc le bandeau — et **rien ne rougit**.
 *
 * C'est exactement la famille de défauts que `silent-failure-auditor` traque :
 * un garde-fou dont l'arrêt ne se voit nulle part. Même méthode que
 * `sheet-is-the-only-modal.test.ts` — lire la source et l'assertionner.
 */
const SW = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

/**
 * Le code, sans les commentaires.
 *
 * Le premier jet de ce garde échouait sur le commentaire qui explique pourquoi
 * `skipWaiting()` ne doit PAS être là : il en épelle le nom. Une sonde qui lit
 * un fichier comme du texte brut doit d'abord retirer ce qui n'est pas exécuté,
 * sinon elle juge la prose. Même leçon que la classe Tailwind épelée dans une
 * JSDoc (cf. `CLAUDE.md`, porte du 29/07).
 */
const CODE = SW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('public/sw.js — garde source du mécanisme de mise à jour', () => {
  it("n'active PAS le worker automatiquement à l'installation", () => {
    // Le seul `skipWaiting()` toléré est celui du gestionnaire de message.
    // Un appel dans `install` supprimerait l'état `waiting` : plus rien à
    // détecter, plus rien à annoncer, et la PWA installée redeviendrait
    // impossible à mettre à jour sur iPhone.
    const install = CODE.slice(
      CODE.indexOf("addEventListener('install'"),
      CODE.indexOf("addEventListener('activate'"),
    );
    expect(install).not.toContain('skipWaiting');
  });

  it('active le worker sur demande explicite du client', () => {
    expect(CODE).toContain("addEventListener('message'");
    expect(CODE).toContain('SKIP_WAITING');
    expect(CODE).toContain('self.skipWaiting()');
  });

  it('revendique les clients à l’activation', () => {
    // `clients.claim()` reste nécessaire : sans lui, le worker fraîchement
    // activé ne contrôlerait pas le document déjà ouvert, et le rechargement
    // qui suit repartirait sous l'ancien.
    expect(CODE).toContain('clients.claim()');
  });

  it('sert les navigations par le réseau, jamais par le cache', () => {
    // Propriété dont dépend la phrase « le HTML et le JavaScript neufs
    // arrivent tout de suite » : c'est elle qui rend l'interface de détection
    // présente dès la première ouverture après un déploiement.
    expect(CODE).toContain("request.mode === 'navigate'");
  });
});
