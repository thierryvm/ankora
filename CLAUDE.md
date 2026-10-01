# CLAUDE.md — Ankora

Cockpit personnel de finances (PWA Next.js 16 + Supabase, hébergé UE). Complète le `CLAUDE.md`
global de Thierry et prévaut sur lui en cas de conflit.

**Ici, les règles.** Leurs raisons et récits : `docs/conventions/regles-et-raisons.md`, noté
**R#ancre**.

## Cap v1.0 publique (verrouillé 2026-04-23)

Source unique : `docs/NORTH_STAR.md` (vision, jalons, piliers, contraintes, cibles). Horizon 12 semaines max depuis le 2026-04-23. Cowork pilote A+B+contenus
D/E, CC Ankora C+tech D/E, Thierry valide + merge. FSMA non régulé, PSD2 exclu, GDPR renforcé,
budget 0 €. R#cap

### Dashboard — une hiérarchie plafonnée (verrouillé le 12 septembre 2026)

Le dashboard user EST le produit : niveau Monarch Money, pensé enveloppes, **pas d'agrégation
bancaire automatique** ; la vue par compte (soldes déduits des mouvements, virements entre
comptes dans les deux sens, ADR-038) en fait partie. Vérifié en revue :

1. **Une question par écran, que l'écran nomme** ; ce qui n'y répond pas se replie ou part ailleurs.
2. **Trois surfaces au plus au-dessus du pli**, mesurées à 375 px — la maquette mobile fait foi.
3. **Tout chiffre déclare sa source** (saisi, déduit des mouvements ou calculé) et s'ouvre sur
   ce qui le compose (règle 10).

Admin panel obligatoire : santé technique, santé produit, acquisition, recommandations
rule-based. **Aucun chiffre sans source ouvrable = refus de merge.** R#dashboard

### Choix techniques lockés

- **Auth MFA** : TOTP Supabase Auth natif, optionnel, « Activer la 2FA » sur `/app/settings`.
- **Cookie consent** : bannière maison (`src/components/gdpr/ConsentBanner.tsx`), deux scopes
  indépendants, version de politique et date de décision dans `user_consents`, retrait par trois
  chemins (art. 7(3)). Klaro n'est pas installé ; un tiers hors de notre rendu (pixel, iframe, widget) →
  réévaluer un CMP.
- **Langues v1.0** : FR + EN seulement ; NL/DE/ES annoncées sur `/roadmap`, post-launch.
- **Admin auth** : `requireAdmin()` basé sur `user_id` Thierry initialement.

R#choix-techniques

## Positionnement réglementaire (non-négociable)

Ankora est un **outil d'éducation budgétaire et d'organisation**, **pas** un service de conseil
en placement (FSMA Belgique). Tout texte produit pour l'app évite de suggérer du conseil en investissement
("vous devriez placer", "nous recommandons d'investir", etc.).

## Règles de code

1. **Domaine pur** : `src/lib/domain/` n'importe JAMAIS `@supabase` ni Next.js — TS pur +
   `decimal.js`.
2. **Validation en entrée** : tout Server Action / Route Handler parse avec Zod **avant** toute
   logique.
3. **Authz serveur** : jamais trust un `userId`/`workspaceId` du client — vérifier via la
   session Supabase.
4. **Audit** : toute action sensible (auth, GDPR, delete workspace) émet `logAuditEvent()`.
5. **Rate limit** : endpoints publics + mutations + export passent par `rateLimit()`.
6. **Nonce CSP** : jamais de script/style inline sans `nonce={nonce}`, lu via `headers()` dans
   les Server Components.
7. **Messages UI en français**, commits/code/comments en anglais.
8. **Tests domain ≥ 90% lignes + fonctions, ≥ 85% branches**.
9. **'use server' exports** : un fichier `'use server';` n'exporte QUE des fonctions `async`.
   Le code d'infrastructure (logger, clients, helpers) n'a jamais la directive. Vérifié par
   `npm run lint:use-server` en CI.
10. **Aucun montant agrégé sans sa décomposition accessible** (verrouillé le 5 août 2026).
11. **Toute action qui écrit d'un clic se défait d'un clic** (verrouillé le 5 août 2026).

### Un chiffre qu'on ne peut pas ouvrir est une injonction, pas une information

Règle 10. Tout montant issu d'une somme s'ouvre sur ce qui le compose — chaque ligne, avec sa
part et son échéance. Sans exception, **dans les deux sens** (ce qu'on verse comme ce qu'on
reprend : une notification de reversement dit _pourquoi_). Un composant qui reçoit un total sans
ses composantes est mal découpé : la décomposition descend avec le chiffre, jamais recalculée à
l'affichage. R#regle-10

### Une action à un clic qui ne se défait pas est un piège à un clic

Règle 11. L'annulation est exposée au même endroit et au même coût. On corrige, on ne supprime
pas : l'annulation laisse une trace datée. L'affichage porte la date de l'action (« coché le 3
août »), jamais un simple état : **une date se vérifie, une coche se croit.** R#regle-11

## Ce dépôt est PUBLIC (ajouté le 2 août 2026)

Fichiers, **messages de commit**, **descriptions de PR**, commentaires de revue : public et
définitif ; fermer ou supprimer ne retire rien.

- **On décrit ce qu'on corrige, jamais comment l'exploiter** : aucune valeur mesurée d'un défaut
  de sécurité **non encore corrigé** (sortie de sonde de privilèges, ACL, rôle qui passe à tort,
  requête qui le démontre) ; la matrice va au document d'exploitation hors dépôt. Corrigé et
  vérifié, on peut divulguer.
- **N'entrent pas non plus** : chemins hors dépôt (sauvegardes, exports, ressources locales),
  état des sauvegardes et restaurations de la production, données nominatives des utilisateurs.
  La règle porte sur l'**agrégation** autant que sur chaque élément.
- **`docs/retours/` n'est jamais commité** (12 sept. 2026, `.gitignore`) : un point de rapport
  entre reformulé, sans valeur réelle ni capture.

R#depot-public

## Qualité obligatoire avant merge

`npm run lint`, `npm run lint:use-server` (CI), `npm run typecheck` → 0 erreur ;
`npm run test` → 100 % ; **`npm run dev` → démarre et une page rend réellement** ;
`npm run build` → succès ; `npm run e2e` → 100 % sur parcours critiques ; Lighthouse ≥ 95
performance, 100 a11y/BP/SEO ; pas de warning console en dev.

### `npm run dev` est une porte, pas une commodité (ajouté le 29 juillet 2026)

Avant de rendre une tâche : `npm run dev`, **charger au moins une page**, lire le code HTTP
(« Ready » n'a rien compilé) ; `0` erreur de compilation dans la sortie ; UI changée : capture
en 390 × 844 et **mesure au DOM** (`getBoundingClientRect`, `getComputedStyle`). Jamais de
classe Tailwind à valeur arbitraire épelée dans un commentaire, une JSDoc ou un Markdown
(Tailwind v4 scanne le texte) : décrire l'utilitaire. R#npm-run-dev

## Définition de DONE (anti "push done = task done")

Push, commit ou PR ouverte ≠ terminé. DONE = (1) tous les checks CI verts (Lint, Typecheck,
Tests, E2E, Security, Build) ; (2) Sourcery silencieux sur le DERNIER commit (aucun commentaire
inline actif, aucune review non résolue) ; (3) reviews humaines approuvées et résolues ; (4) pas
de conflit avec main ; (5) rapport final à Thierry avec la preuve de chaque critère.

### Un retour Sourcery se traite, ou se refuse PAR ÉCRIT (verrouillé 2026-08-02)

Relire Sourcery après chaque push. Corriger quand c'est fondé ; ne pas appliquer par réflexe ;
un commentaire écarté l'est **dans le fil**, avec sa raison — jamais ignoré, jamais refusé
seulement dans le rapport. Les remarques de revue générale se traitent par un commentaire de
PR. Les trois sources :

```bash
gh api repos/thierryvm/ankora/pulls/<N>/comments --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
gh api repos/thierryvm/ankora/pulls/<N>/reviews --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
gh api graphql -f query='query { repository(owner:"thierryvm", name:"ankora") {
  pullRequest(number:<N>) { reviewThreads(first:50) { nodes { isResolved path line } } } } }'
```

`check-sourcery-resolved` rougit au push tant que le fil de la review du même push n'est pas
résolu : résoudre le fil puis `gh run rerun <id>`, sans chercher de défaut dans le code.
R#sourcery

### Le nombre de cas e2e exécutés ne descend jamais

Deux planchers **observés**, distincts (jamais un chiffre agrégé) : `Playwright E2E` **294 passed**, `Playwright E2E (authenticated)`
**81 passed**. Relevé : `gh run view <run-id> --log | grep -E
"^\s+[0-9]+ (passed|failed|flaky|skipped)"`.

- Mesurés, jamais déduits ; un relèvement se mesure en local avant le premier push, avec et sans
  la spec (on compare le **delta**). Un `flaky` ne compte pas comme vert.
- Une spec authentifiée est aussi découverte par le job public : elle y **saute**
  (`test.skip(!admin, …)`), elle n'échoue pas.
- `e2e/authenticated-specs.json` est committé ; sa quarantaine (raison par spec, imprimée à
  chaque run) ne fait que rétrécir, tout ajout se justifie dans le rapport de PR ; une
  divergence avec la découverte fait échouer le job.
- Une PR qui fait **baisser** un plancher est refusée sans justification écrite dans le rapport
  de PR. Il monte quand un trou est trouvé, descend quand un cas ne prouvait rien.

Journal : `docs/reference/planchers-e2e-historique.md`. R#planchers-e2e

## Cleanup branches locales

Squash merge, donc : `git fetch --prune origin` ; `git branch -d <b>` ; si refus,
`gh pr list --state merged --limit 100 --json headRefName --jq '.[] | .headRefName' | grep <b>` :
PR mergée dont la branche est **exactement** `<b>` → `git branch -D <b>`, aucune → STOP, investiguer avec @cowork. Une branche
`[gone]` après prune se supprime avec `-D`.

## Posture : ingénieur partenaire d'abord, exécutant ensuite

Relire tout prompt d'un œil critique. Bug prod : les faits bruts d'abord (headers
`x-matched-path`/`x-vercel-cache`/`x-vercel-id`, `git log --oneline -10`, logs Vercel, code),
la théorie après. Prompt faux ou incomplet : STOP, contre-analyse au propriétaire avant
d'exécuter, alternatives proposées (simple + robuste). Challenger n'est pas du scope creep. Le
`CLAUDE.md` global prévaut sur la posture. R#posture

## Résilience post-Cowork (verrouillé 2026-05-27)

### Doctrine — sub-agents Claude Code obligatoires

- **`plan-reviewer`** (Opus) avant tout code > 50 lignes, ou tout changement touchant Server
  Actions, `package.json`, `proxy.ts`, `.husky/`, workflows GHA, `supabase/migrations/`,
  `.claude/settings.local.json`. Verdict `✅ APPROVED` / `🟡 APPROVED WITH CHANGES` /
  `🔴 REJECTED` ; code interdit tant que le verdict n'est pas APPROVED.
- **`spec-translator`** (Sonnet) dès que @thierry envoie une demande informelle : il écrit la
  spec (Phase 0 + Scope + DoD), CC Ankora exécute. Jamais le même agent qui spec ET code.

R#post-cowork

### Un harnais ment aussi par l'état qu'il installe (2026-07-31)

Tout état qu'une fixture installe (`localStorage`, cookies, en-têtes, feature flags, session
pré-authentifiée) est une **hypothèse sur le monde** : au moins un test ne la fait pas.
`e2e/consent-first-visit.spec.ts` importe exprès le `test` de `@playwright/test`, jamais la
fixture partagée. `silent-failure-auditor` et `test-quality-auditor` demandent « quel état la fixture installe-t-elle, et qui teste
son absence ? » comme « quelle spec est sautée ? ». Un champ se lit par `element.value`, pas
`innerText` ; vérifier le rôle réel avant de conclure qu'un `getByRole` en échec est un défaut.
R#harnais

### Un agent QA doté de Bash ne doit pas pouvoir atteindre un commit (2026-07-27)

Après le passage d'un tel agent : (1) jamais `git add -A` ni `git add .`, chemins explicites ;
(2) lire `git diff --cached --stat` avant chaque commit, un fichier que tu n'as pas modifié =
STOP ; (3) une falsification qui mute du code se fait hors de l'arbre de travail (copie jetable
ou base locale restaurée). Tout agent QA doté de Bash reçoit dans son prompt : « tu ne modifies aucun fichier du dépôt ; si tu dois
muter pour falsifier, fais-le dans la base locale et restaure ». R#agent-qa-bash

### Banned list complémentaire (verrouillée 2026-05-27)

En plus des interdictions historiques, vérifiée par `plan-reviewer` :

1. **Scope étendu mid-PR sans nouveau plan écrit** → STOP, plan via `spec-translator`,
   `plan-reviewer`, re-engagement @thierry.
2. **Décision architecturale (lib, pattern, schéma DB) dans la même session que
   l'implémentation** : session N, décision dans `docs/adr/ADR-XXX.md` ; session N+1,
   exécution.
3. **Modifier `.claude/settings.local.json`, `.husky/`, les workflows GHA ou la branch
   protection dans une PR feature** : PR dédiée, review humaine.
4. **Supprimer ou désactiver un agent QA** sans validation explicite @thierry.
5. **« Je vérifie quand même » sur un downgrade Haiku/Sonnet** en sécurité, architecture, RLS,
   CSP, migrations ou prod → STOP immédiat.

### Handoff cross-session obligatoire

Avant toute compaction ou fin de session : handoff
`Athenaeum/10_Projects/ankora/cc-handoffs/YYYY-MM-DD-HHMM-<slug>.md` (template
`_template-handoff.md`, 8 sections), en double : vault Obsidian + miroir commité dans le dépôt
**privé** `claude-config` (`handoffs/ankora/`), jamais dans ce dépôt public (24 août 2026).
R#handoff

## Trio d'agents & handoff design (verrouillé 2026-04-24, amendé 2026-05-27)

Rôles et boucle : `docs/design/trio-agents.md` (repli de @cowork : `spec-translator` +
`plan-reviewer`). Tag `@cowork|@cc-design|@cc-ankora|@thierry — …` dans tout rapport, commit,
commentaire, note. Un export Claude Design n'est jamais mergé tel quel : @cc-ankora l'intègre
sur une branche `feat/cc-design-<surface>` et passe `ui-auditor` (WCAG 2.2 AA),
`dashboard-ux-auditor`, `gdpr-compliance-auditor` ; tokens CSS prod = source de vérité ; aucune
dépendance payante sans Thierry ; micro-copy relue par @cowork avant intégration (FSMA + FR). Avant toute PR UI :
`docs/design/token-usage.md`. R#trio

## Orchestration des PR (règles absolues)

### Phase 0bis — Preflight comptes (avant toute opération sortante)

Ankora utilise **toujours `thierryvm`** (GitHub, Vercel, Supabase) ; un compte professionnel est
connecté en même temps et la bascule arrive **en cours de session** : un GO d'il y a dix minutes
ne vaut rien. Hooks : `preflight --local` (pre-commit), `npm run preflight` (pre-push). **À la
main**, `npm run preflight` + GO avant : `supabase db push` ou migration, `vercel deploy` ou
variable d'env Vercel, toute commande `gh` qui écrit. NO-GO : `gh auth switch --user
thierryvm`, relancer ; jamais `--no-verify` sans savoir pourquoi. R#phase-0bis

### Phase 0 — Model check (obligatoire au démarrage)

Opus (alias `opus`) → continuer. Haiku / Sonnet / autre → **STOP** : prévenir @thierry, ne pas
toucher au code, sauf downgrade validé explicitement par @thierry pour une tâche triviale
(jamais sécurité, architecture, RLS, CSP, migrations, production).
`.claude/settings.local.json` épingle `"model": "opus"` (gitignoré : à revérifier après tout
reset).
R#phase-0

### Checklist de démarrage, sans exception

1. Lire `docs/ROADMAP.md` : ordre des PR et position actuelle.
2. Prendre la prochaine PR de la table « Ordre d'exécution des PR techniques », jamais une
   « 💡 idée » avant une PR « en attente ».
3. Suivre son prompt `prompts/PR-{X}-…md` ; rien d'improvisé en dehors.
4. Prérequis manquant (PR amont, migration, env var) : s'arrêter et demander à Thierry.
5. Scope strict ; tout besoin émergent → question à Thierry avant.
6. Rapport `docs/prs/PR-{X}-report.md` selon le template du prompt.

Une PR hors plan se cadre avec Thierry avant d'être ouverte, et le ROADMAP la trace.
R#ordre-avril-2026

### Contrainte budget 0 € (transverse)

Aucune dépendance payante en production sans revenus ; services autorisés : `docs/ROADMAP.md`
§« Contrainte transverse : Budget 0 € ». **Dépendance payante = validation Thierry, sans
exception silencieuse.**

### Synchronisation ROADMAP ↔ repo (règle durable)

Avant tout commit sur `main`, `docs/ROADMAP.md` reflète le repo (livré / en cours / backlog) ;
un delta se corrige **en priorité absolue**, avant la branche suivante.

## Workflow agents (`.claude/agents/`)

Source de vérité : `.claude/agents/<name>.md` (`description` = quand l'invoquer). Ajout ou
modification : éditer le fichier puis le ROADMAP. Chaque agent déclare un `model:` — jamais de
défaut silencieux ni de version figée (`opus`). Agents QA : lister `.claude/agents/` ;
présentation historique : R#agents-qa

## Variables d'environnement

`.env.example` ; toutes validées par Zod dans `src/lib/env.ts` (le build échoue tôt).

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
