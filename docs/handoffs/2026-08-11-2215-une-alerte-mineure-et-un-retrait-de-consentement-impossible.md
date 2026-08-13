---
project: ankora
type: cc-handoff
session: 2026-08-11-2215
agent: cc-ankora
---

# Handoff — une alerte mineure, et derrière elle un retrait de consentement impossible

> Session @cc-ankora (Opus 5), clone principal. Suite du handoff de 21 h 10.
> @thierry a arrêté vers 22 h : « on verra demain pour finir tout ça proprement ».

## 1. État git

```text
origin/main : ead1e6b security(deps): un seul paquet verrouillait esbuild (#385)
              a1c1eb1 docs(passation) (#384)
              af29d0f fix(landing): trois endroits où la page ne disait pas la vérité (#383)
```

**PR ouverte : [#386](https://github.com/thierryvm/ankora/pull/386)** — correctif
du retrait de consentement, E2E en cours à la clôture. Elle est à moi : merger au
vert, après vérification de Sourcery et Codex.

## 2. Ce qui a été livré

| PR   | Objet                                                            |
| ---- | ---------------------------------------------------------------- |
| #383 | mergée par @thierry — cohérence de la landing                    |
| #384 | passation de 21 h 10                                             |
| #385 | alerte Dependabot #33 (esbuild) — **`npm audit` passe de 1 à 0** |
| #386 | le retrait du consentement exigeait un rechargement complet      |

## 3. L'alerte esbuild : le correctif proposé était le mauvais

GitHub suggérait un `overrides` vers `>= 0.28.1`. Mesure de l'arbre réel, en
remontant au propriétaire de chaque ligne du lockfile :

- `tsx@4.21.0` → `esbuild: ~0.27.0` — **le seul verrou**
- `vite@8.1.5` → esbuild en **peerDependency optionnelle**, jamais installée :
  vite 8 tourne sur `rolldown`

Un override aurait donc poussé une version **hors de la plage déclarée** par le
seul consommateur réel. Relever `tsx` suffit et laisse chacun dans sa plage.

**4.22.5 et non 4.23.12**, délibérément : l'unique changement de la mineure 4.22
est « upgrade esbuild to 0.28 », alors que 4.23.0 réécrit la résolution de
modules. Un correctif de sécurité porte le delta minimal.

Exposition réelle **mesurée** comme quasi nulle : la faille vise l'API `servedir`
du serveur de développement d'esbuild, absente de `node_modules/tsx/dist/` (sonde
validée par témoin positif). La porte CI bloquante étant
`--audit-level=high --omit=dev`, elle n'avait jamais rougi.

## 4. Le vrai défaut de la soirée

@thierry signale que « Modifier mes préférences cookies » ne ramène pas la
bannière, et qu'un gros rechargement répare. Le symptôme criait « cache » ou
« service worker ». **Il n'y en avait aucun** : après le clic, `localStorage`
portait bien `consent` vide et `reopen=1`.

**Cause.** `dismissed` est un état React local, posé à `true` à la décision et
remis à zéro par rien. `shouldShow = !dismissed && (…)` le lit en premier. La
bannière vivant dans le layout racine, cet état survit à toute la navigation
client : une fois la décision prise, **le retrait devenait inatteignable pour le
reste de la session**. Le rechargement « réparait » en remontant le composant.

L'enjeu est réglementaire : RGPD art. 7(3), retirer doit être aussi simple que
consentir. Deux des trois chemins annoncés par `CLAUDE.md` passent par ce bouton.

**Pourquoi aucun test ne l'avait vu.** Deux cas couvraient la réouverture, et
tous deux passaient avant le correctif : l'un pose le drapeau AVANT le rendu (le
chemin du rechargement, celui qui marchait), l'autre n'assertit que sur
`localStorage` sans jamais monter la bannière. Le mécanisme était prouvé,
l'effet visible ne l'était pas — et c'est l'effet visible qui portait le défaut.

**Correctif.** Ajustement de l'état pendant le rendu (motif React documenté), et
non dans un `useEffect` : le linter a refusé la première version pour rendu en
cascade, à raison. La règle n'a pas été désactivée, la cause a été changée.

## 5. Le pied de page, audité et sain

Liens en 200, langue conservée depuis `/en`, cibles à 44 px, contraste 8,55:1,
les cinq contrôles cliquables sur desktop et iPhone 14.

Seul défaut trouvé, non corrigé : le `<nav>` porte `aria-label={t('copyright')}`
— la navigation des liens légaux est annoncée par une mention de copyright.

## 6. Deux pannes d'instrument, à ne pas répéter

- **`document.elementFromPoint()` rend `null` hors du viewport.** Ma sonde a
  condamné 10 contrôles sur 10 ; c'était le défilement qui manquait. Puis ma
  correction a échoué à son tour, `globals.css` posant `scroll-behavior: smooth`
  — le `scrollIntoView` est animé et la mesure partait trop tôt. Remède :
  `behavior: 'instant'`, ou mieux le clic à blanc de Playwright.
- **Les accents sont obligatoires dans un sélecteur d'interface française.**
  `/preferences/i` ne trouve jamais « préférences », et le timeout se lit « le
  bouton est cassé ».

**Règle qui en sort** : un défaut sur _absolument tout_ ce qu'on mesure est
presque toujours une panne d'instrument, pas un bug.

## 7. Dettes relevées, non traitées

- **`npm run security:audit` et `npm run security:headers` pointent dans le
  vide** — les deux fichiers `scripts/` n'existent pas. Deux des quatre scripts
  `tsx` déclarés sont morts.
- **Icônes commitées périmées** : `npm run icons` est déterministe, mais rend
  d'autres octets que `favicon-16.png` et `favicon-32.png` du dépôt.
- **La CI n'exerce `tsx` nulle part** — zéro occurrence dans `.github/`.

## 8. En attente d'une décision de @thierry

- **L'adresse de contact.** Il s'inquiète, à juste titre, de voir son Gmail
  personnel publié en clair sur la landing. **Contrainte nouvelle : le domaine
  est acheté chez Vercel**, qui ne fait pas d'e-mail. Deux voies : basculer les
  serveurs de noms vers Cloudflare (Email Routing gratuit), ou un service qui ne
  demande que des MX dans le DNS Vercel. Recommandation : une redirection
  `contact@ankora.be` vers sa boîte. Pas de formulaire — un service en ligne doit
  publier un moyen de contact direct, et aucune obfuscation ne protège un
  `mailto:` qui doit rester utilisable. Une ligne dans `src/lib/brand.ts`.
- **Le libellé « Tester un changement »** posé dans #383.

## 9. Environnement

Connecteurs MCP Supabase et Vercel toujours interdits en session Ankora, lecture
comprise. L'outil Bash du harnais est cassé sur cette machine (un profil shell y
injecte `expo`) : tout passe par PowerShell, préfixé `work perso -NoCd;`.
