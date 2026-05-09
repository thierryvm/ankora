# Ankora Design Playground

Internal QA route — showcase 11 atoms CD#3 du design system Ankora.

## Activation

- **Dev** : toujours accessible via `npm run dev` puis ouvrir
  http://localhost:3000/fr-BE/design-playground/
- **Production** : route gardée par variable d'environnement.
  - Par défaut : `notFound()` (404 visible).
  - Pour activer ponctuellement (preview Vercel ou QA designer) :
    `ANKORA_PLAYGROUND_ENABLED=true` côté serveur, puis redéployer
    OU set vars + restart.

## Pas de PII

Cette route est interne mais reste publique en dev. Toutes les fixtures
utilisent des données neutres (pas de noms réels, pas d'emails, pas
d'IBAN). Si tu ajoutes une démo, respecte cette règle.

## Sitemap

Cette route n'est PAS listée dans `src/app/sitemap.ts` (whitelist
explicite des routes publiques). Robots `noindex/nofollow` via
`metadata` sur la page.

Le segment URL est volontairement sans préfixe `_` car Next.js App Router
considère les dossiers préfixés `_` comme **private folders exclus du
routing** (pas seulement du middleware locale-routing). Les sub-folders
`_components/` et `_components/demos/` gardent le préfixe `_` car ils ne
sont PAS routés (private folders attendus). Sécurité prod assurée par le
guard env runtime, pas par le préfixe URL.

## Structure

- `page.tsx` — Server Component avec guard env + metadata noindex.
- `_components/PlaygroundSection.tsx` — wrapper Card par section.
- `_components/demos/<Atom>Demo.tsx` — 1 démo client par atom (avec
  useState pour montrer interactivité).

## Voir aussi

- `docs/plans/PR-D4-PHASE2-A.md` — plan d'implémentation
- `docs/prs/PR-D4-PHASE2-A-report.md` — rapport DoD final
