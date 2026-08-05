import { describe, it, expect, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Le middleware ne doit JAMAIS voir un fichier de `public/`.
 *
 * Quand il le voit, next-intl traite le chemin comme une page localisable et le
 * route vers `/_not-found` : le fichier existe sur le disque, il est servi en
 * **404**, et rien ne le signale. Trois fois que ça arrive dans ce dépôt — les
 * polices `/fonts/*.ttf` en mai 2026, puis `/sw.js`, puis `/ai.txt` et
 * `/llms-full.txt` mesurés en production le 2026-08-05. À chaque fois le
 * correctif a été d'ajouter UNE entrée nommée au matcher, ce qui ne protège que
 * ce dont on s'est souvenu.
 *
 * Ce test énumère le **disque**, jamais une liste écrite à la main : c'est ce
 * qui le rend capable d'attraper le prochain fichier ajouté, celui que personne
 * n'a encore imaginé.
 *
 * Ce qu'il ne couvre PAS, délibérément : `robots.txt` et `sitemap.xml`, qui sont
 * des routes générées (`src/app/robots.ts`, `src/app/sitemap.ts`) et n'existent
 * pas dans `public/`. Leur entrée nommée dans le matcher est leur seule
 * garantie, et elle doit y rester.
 */

// `src/proxy.ts` importe la chaîne Supabase, donc `@/lib/env`, qui parse et
// JETTE au chargement du module. `.env.local` n'existe pas en CI. Même motif
// que `src/lib/supabase/__tests__/middleware.test.ts`.
vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}));

// La distribution ESM de next-intl importe `next/server` sans extension, ce que
// le résolveur de Vitest refuse. On ne teste PAS le routage i18n ici, seulement
// la valeur littérale exportée : le remplacer est sans effet sur ce qu'on mesure.
vi.mock('next-intl/middleware', () => ({ default: () => () => undefined }));
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: async () => undefined }));

import { config } from '@/proxy';

const PUBLIC_DIR = join(process.cwd(), 'public');

/** Chemins d'URL de tous les fichiers de `public/`, sous-dossiers compris. */
function cheminsPublics(): string[] {
  return readdirSync(PUBLIC_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolu = join(entry.parentPath, entry.name);
      return '/' + relative(PUBLIC_DIR, absolu).split(sep).join('/');
    });
}

/**
 * Le motif est lu depuis l'export, jamais recopié — une copie collée testerait
 * le test, pas le code.
 *
 * ANCRAGE OBLIGATOIRE. Next ne consomme pas ce motif comme une `RegExp` brute :
 * il l'enveloppe et le compile par path-to-regexp, qui **ancre** `^…$`. Sans
 * `^…$` ici, `new RegExp(motif).test(...)` est une recherche de sous-chaîne :
 * sur `/icons/icon-192.png`, le moteur réessaie au `/` interne et le lookahead
 * réussit à cet offset-là. On obtiendrait des échecs fantômes sur tous les
 * fichiers imbriqués.
 *
 * Ne pas tenter de reproduire le préfixe `/:nextData(...)?` et le suffixe
 * `{(\.json|...)}?` que Next ajoute : ce sont des groupes optionnels, évalués au
 * même offset que le lookahead, ils ne peuvent pas en changer le verdict.
 */
function matcherCapture(chemin: string): boolean {
  const motif = config.matcher[0];
  if (typeof motif !== 'string') throw new Error('config.matcher[0] doit être une chaîne');
  return new RegExp(`^${motif}$`, 'i').test(chemin);
}

describe('le matcher du middleware laisse passer tout `public/`', () => {
  const chemins = cheminsPublics();

  it('trouve bien des fichiers à vérifier', () => {
    // Cas de contrôle : sans lui, une énumération devenue vide rendrait le
    // `it.each` ci-dessous vert en ne testant rien du tout.
    expect(chemins.length).toBeGreaterThan(0);
  });

  it.each(chemins)('%s est servi statiquement, pas routé par next-intl', (chemin) => {
    expect(matcherCapture(chemin)).toBe(false);
  });

  it('capture bien une vraie page — sinon le test précédent ne prouve rien', () => {
    // Le matcher DOIT s'appliquer aux pages : c'est lui qui pose le nonce CSP et
    // la localisation. Un matcher qui n'attrape plus rien ferait passer tous les
    // cas ci-dessus tout en cassant l'application entière.
    expect(matcherCapture('/app')).toBe(true);
    expect(matcherCapture('/fr-BE/login')).toBe(true);
  });
});
