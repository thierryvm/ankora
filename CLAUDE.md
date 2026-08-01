# CLAUDE.md — Ankora

> **Trio IA & gouvernance** — Source canonique : [`docs/design/trio-agents.md`](docs/design/trio-agents.md). Le résumé ci-dessous est intentionnellement répété pour visibilité au démarrage de session ; toute modification doit être répercutée dans la source canonique.

Projet **Ankora** : cockpit personnel de finances (PWA Next.js 16 + Supabase, hébergé UE).
Ce fichier complète le `CLAUDE.md` global de Thierry. En cas de conflit, ce fichier prévaut.

## Cap v1.0 publique (verrouillé 2026-04-23)

**Source unique de vérité** : `docs/NORTH_STAR.md` (consolidation de la vision, 3 jalons, 5 piliers, 9 contraintes non négociables, cibles mesurables).

Résumé local :

- **Horizon** : 12 semaines max depuis 2026-04-23 (Alpha ~4w, Beta ~8w, v1.0 publique ~12w)
- **Gouvernance** : Cowork pilote A+B+contenus D/E, CC Ankora pilote C+tech D/E, Thierry valide + merge
- **Contraintes clés** : FSMA non régulé, PSD2 exclu, GDPR renforcé, Budget 0 €

### Dashboard Excellence — non négociable

Le dashboard user EST le produit. Cible : niveau Monarch Money, pensé enveloppes (pas comptes agrégés).

Sections obligatoires user dashboard v3 :

1. Hero cashflow waterfall (salaire → enveloppes → sorties)
2. Health score provisions (jauge + nudges)
3. Timeline 6 mois prédictive
4. Enveloppes actives (drag-to-rebalance)
5. Prochaines factures 7/14/30j
6. Goals épargne avec ETA
7. Simulateur what-if en drawer
8. Activité récente

Admin panel obligatoire : santé technique, santé produit, acquisition, recommandations rule-based.

Tout dashboard minimaliste = refus de merge.

### Agents QA (17 au total)

Existants : `security-auditor`, `rls-flow-tester`, `financial-formula-validator`, `ui-auditor`, `lighthouse-auditor`, `seo-geo-auditor`, `gdpr-compliance-auditor`, `test-runner`, `i18n-auditor`.

Pilier A : `dashboard-ux-auditor`, `admin-dashboard-auditor`.

Mobile Recovery Day (4 mai 2026) : `mobile-ios-auditor` — focus iPhone Safari WebKit (complémentaire de `ui-auditor`). Procédure manuelle : `docs/runbooks/dev-on-iphone.md`.

LLM Security (ajouté 16 mai 2026) : `llm-security-auditor` — audit sécurité IA avancé OWASP LLM Top 10 + vecteurs 2026 (RAG poisoning, indirect injection, agent hijacking, supply chain LLM, model extraction, sycophancy abuse, multi-turn drift, encoding bypass). Modèle Opus. Complémentaire de `security-auditor` (couche app classique).

Diagnostic & qualité (ajoutés 25 juil. 2026) : `prod-bug-investigator` — établit la cause racine d'un bug prod **par la preuve** avant tout correctif (chaque affirmation étiquetée MEASURED / READ IN CODE / INFERRED / UNVERIFIED). Modèle Opus. `test-quality-auditor` — juge si les tests **prouvent** le comportement : specs désactivées en silence, assertions qui ne peuvent pas échouer, fix sans test de non-régression. Modèle Sonnet. Complémentaire de `test-runner` (qui exécute, sans juger).

Mécanismes muets (ajouté 27 juil. 2026) : `silent-failure-auditor` — le seul agent qui demande non pas « est-ce présent ? » mais « est-ce que ça marche, et le saurait-on si ça s'arrêtait ? ». Né de trois incidents de la même famille : écritures d'audit refusées trois mois en silence (H3), fonction de purge `SECURITY DEFINER` sur table `FORCE RLS` jamais appelée depuis avril, job e2e vert avec 173 specs sautées. Modèle Opus. Complémentaire de `security-auditor` (présence des garde-fous) et `test-quality-auditor` (valeur des tests).

Refonte UX (ajouté 24 juil. 2026) : `mobile-liquid-glass-auditor` — garant du contrat « Liquid Glass » : contraste WCAG AA dans l'état glass ET le fallback opaque, `prefers-reduced-transparency`/`reduced-motion`, anti-stacking/perf backdrop-filter, CSP-safe, quirks WebKit. Modèle Sonnet. Complémentaire de `mobile-ios-auditor` (WebKit général) et `ui-auditor` (WCAG générique). Cf. spec `docs/superpowers/specs/2026-07-24-ankora-refonte-ux-program-design.md`.

### Choix techniques lockés

- **Auth MFA** : TOTP via Supabase Auth natif (optionnel user, UI dans `/app/settings/security`)
- **Cookie consent** : Klaro! (open source, TCF v2.2, 0 €)
- **Langues v1.0** : FR + EN seulement. NL/DE/ES annoncées dans `/roadmap` publique, livrées post-launch
- **Admin auth** : `requireAdmin()` basé sur `user_id` Thierry initialement

---

## Positionnement réglementaire (non-négociable)

Ankora est un **outil d'éducation budgétaire et d'organisation**.
Ankora n'est **pas** un service de conseil en placement (contrainte FSMA Belgique).
Tout texte produit pour l'app doit éviter les formulations suggérant du conseil en investissement
("vous devriez placer", "nous recommandons d'investir", etc.).

## Stack

- Next.js 16.2+ (App Router, Server Components, Server Actions, typed routes)
- React 19.2+
- TypeScript strict (`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`)
- Tailwind CSS 4 (`@theme inline` — tokens dans `globals.css`)
- Supabase (Postgres + RLS + Auth + Storage, région EU-west)
- Upstash Redis (rate limiting)
- Zod v4 (validation iso client/server)
- Vitest 4 + Playwright + Lighthouse CI
- Husky + lint-staged

## Architecture

```
src/
  app/                 # App Router (layouts, pages, route handlers)
    (marketing)/       # landing, pricing, faq, legal
    (auth)/            # login, signup, callback
    app/               # dashboard privé — protégé par middleware
  components/
    brand/             # logo, favicon SVG
    ui/                # shadcn/ui primitives
    features/          # components métier par feature
  lib/
    domain/            # services financiers purs (Decimal.js, 0 dépendance DB)
    schemas/           # schémas Zod (1 fichier par agrégat)
    supabase/          # clients (browser, server, admin, middleware)
    security/          # rate-limit, audit-log
    gdpr/              # consent, export, deletion
    env.ts             # parse + valide les variables d'env via Zod
    site.ts            # source de vérité métadonnées SEO
supabase/
  migrations/          # schéma + RLS + triggers
.claude/
  agents/              # 17 QA agents (security, rls, financial, ui, lighthouse, seo-geo, gdpr, test-runner, test-quality, dashboard-ux, admin-dashboard, i18n, mobile-ios, llm-security, mobile-liquid-glass, prod-bug-investigator, silent-failure)
```

## Règles de code

1. **Domaine pur** : `src/lib/domain/` n'importe JAMAIS depuis `@supabase` ou Next.js — que du TS pur + `decimal.js`.
2. **Validation en entrée** : tout Server Action / Route Handler parse avec Zod **avant** toute logique.
3. **Authz serveur** : ne jamais trust un `userId`/`workspaceId` du client — toujours vérifier via la session Supabase.
4. **Audit** : toute action sensible (auth, GDPR, delete workspace) émet `logAuditEvent()`.
5. **Rate limit** : endpoints publics + mutations + export passent par `rateLimit()`.
6. **Nonce CSP** : jamais de script/style inline sans `nonce={nonce}`. Nonce lu via `headers()` dans Server Components.
7. **Messages UI en français**, commits/code/comments en anglais.
8. **Tests domain ≥ 90% lignes + fonctions, ≥ 85% branches**.
9. **'use server' exports** : un fichier avec `'use server';` ne peut exporter QUE des fonctions `async` (Server Actions). Infrastructure code (logger factory, clients, helpers) n'a jamais le directive `'use server'`. Vérifié par `npm run lint:use-server` en CI.

## Qualité obligatoire avant merge

- `npm run lint` → 0 erreur
- `npm run lint:use-server` → 0 erreur (vérifié en CI)
- `npm run typecheck` → 0 erreur
- `npm run test` → 100% pass
- **`npm run dev` → démarre, et une page rend réellement** (cf. ci-dessous)
- `npm run build` → succès
- `npm run e2e` → 100% pass sur parcours critiques
- Lighthouse ≥ 95 performance, 100 a11y/BP/SEO
- Pas de warning console en dev

### `npm run dev` est une porte, pas une commodité (ajouté le 29 juillet 2026)

**Quatre portes vertes ne prouvent pas que l'application démarre.** Démontré au
chantier 2 : un commentaire JSDoc de `Sheet.tsx` citait un utilitaire Tailwind
en écrivant `env(...)` avec des points de suspension **littéraux**. Tailwind v4
scanne les sources **comme du texte**, donc il a généré la classe pour de vrai —
`padding-bottom: env(...)`, du CSS invalide. Turbopack a refusé la feuille de
style entière : **toutes** les pages en HTTP 500, `Unexpected token Delim('.')`.

`lint` ✅ `lint:use-server` ✅ `typecheck` ✅ `test` ✅ **`build` ✅**. L'application
était morte. Le défaut a été trouvé en ouvrant un navigateur, et il ne pouvait
l'être qu'ainsi : `next build` a toléré la règle invalide que `next dev` refuse.

Donc, avant de rendre une tâche :

1. `npm run dev`, puis **charger au moins une page** et lire le retour HTTP.
   Un serveur qui affiche « Ready » n'a encore rien compilé.
2. Vérifier `0` occurrence d'erreur de compilation dans la sortie du serveur.
3. Si l'UI a changé : une capture en 390 × 844, et **mesurer au DOM** plutôt que
   juger à l'œil (`getBoundingClientRect`, `getComputedStyle`). Une capture prouve
   que ça rend ; une mesure prouve que c'est conforme.

**Corollaire de rédaction** : ne jamais épeler une classe Tailwind à valeur
arbitraire dans un commentaire, une JSDoc ou un Markdown scanné. Décrire
l'utilitaire, ne pas l'écrire.

## Définition de DONE (anti "push done = task done")

Un push, un commit ou une PR ouverte ne signifie PAS "terminé". Une tâche
n'est DONE qu'une fois TOUS ces critères satisfaits:

1. ✅ Tous les checks CI verts (Lint, Typecheck, Tests, E2E, Security, Build)
2. ✅ Sourcery bot silencieux sur le DERNIER commit de la PR
   (aucun commentaire inline actif, aucune review non résolue)
3. ✅ Toutes les reviews humaines approuvées et résolues
4. ✅ Pas de conflit avec main
5. ✅ Rapport final livré à Thierry avec preuve de chaque critère

**Vérification systématique de Sourcery après chaque push**:

```bash
gh api repos/thierryvm/ankora/pulls/<N>/comments \
  --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
```

Si output non vide → corriger avant de déclarer DONE.

### Le nombre de cas e2e exécutés ne descend jamais

**Critère permanent, ajouté le 26 juillet 2026.** Une CI verte ne vaut que ce
qu'elle exécute. Le 26 juillet, le job `Playwright E2E` affichait **214 passed /
173 skipped** : 44,7 % de la suite ne tournait nulle part, et tous les parcours
connectés étaient dans les 173. Un `gh pr checks ✅` ne disait rien des surfaces
les plus sensibles de l'app.

Deux jobs, donc **deux planchers distincts** — un chiffre global agrégé serait
ininterprétable au premier conflit, donc ignoré :

| Job                              | Plancher au 31 juillet 2026                              |
| -------------------------------- | -------------------------------------------------------- |
| `Playwright E2E`                 | **224 passed** (215 avant, +9 `cron-gdpr-auth`, PR-3B-B) |
| `Playwright E2E (authenticated)` | **38 passed** (31 avant, +7 découpage au cas du 31/07)   |

> **⚠️ Plancher public à re-mesurer (chantier 1, 29 juillet 2026).** ADR-034 a
> supprimé `/design-playground` et sa spec `e2e/design-playground.spec.ts`
> (1 cas × 2 projets non-webkit → **−2 attendus**). Le chiffre **n'est pas
> corrigé ici** : la doctrine exige un nombre **observé**, et il ne l'a pas été.
> Les e2e n'ont pas pu tourner sur la machine du chantier — Docker absent, donc
> pas de `supabase start`, et le projet Supabase lié est la **production** :
> les specs authentifiées ne sautent qu'en l'absence de clé `service_role`, donc
> les lancer aurait écrit de vraies lignes en prod. **À la première CI verte
> après ce chantier : relever la ligne `N passed` du job public et inscrire la
> valeur mesurée ici.** Le job authentifié n'est pas affecté par ADR-034.
>
> **Toujours pas mesuré au 31 juillet 2026** — Docker est installé depuis, mais le
> plancher public exige un second build (les `NEXT_PUBLIC_*` sont inlinées à la
> compilation, et le job public tourne sur un Supabase factice) plus les six
> projets. Reporté délibérément par @thierry : coût élevé, valeur documentaire.
> Le chiffre reste **attendu à −2, jamais observé** — donc pas inscrit.
>
> **Second delta en attente, même jour : +6.** `e2e/consent-first-visit.spec.ts`
> ajoute 2 cas, exécutés par `chromium-desktop`, `mobile-safari` et
> `mobile-chrome` (elle n'est pas sous `mobile-ios/`, donc pas par les trois
> projets iPhone). Vérifié en local sur ces trois projets : **`6 passed`**. Le
> solde attendu du plancher public est donc **−2 +6 = +4**, à confirmer par
> mesure — un delta calculé n'est pas un plancher observé.

> **Job authentifié : 31 → 38, mesuré le 31 juillet 2026.** Première exécution
> réelle de ce job depuis sa création : Docker n'existait pas sur la machine, et
> le projet Supabase lié était la production. Relevé en parité CI (stack locale,
> CLI Supabase épinglée 2.84.2, `retries: 2`, `--workers=1`, `chromium-desktop` +
> `iPhone 14`) : **`38 passed, 5 skipped`**, aucun échec, aucun flaky.
>
> Le +7 ne vient d'aucune spec nouvelle : la quarantaine était appliquée au
> **fichier** alors que les échecs sont par **cas**. `dashboard-cockpit-bloc2`
> (2 cas verts sur 6) et `dashboard-simulator-drawer` (5 sur 6) retenaient sept
> cas qui passaient. Ils sortent de la liste ; leurs 5 cas réellement cassés
> portent un `test.skip(true, raison)` à leur propre niveau.
>
> Les 4 entrées restantes ont été **vues rouges**, pas supposées. Les deux
> étiquetées « READY TO VERIFY » au chantier 1 ne le sont pas : elles échouent sur
> des **montants** (`accounts:75` attend `500,00`, `dashboard-expenses:64` attend
> `5,00 €`), ce qu'une relecture de libellés ne pouvait pas voir.

Le relèvement du 27 juillet est mesuré, pas déduit : `gdpr-deletion-queue.spec.ts`
n'apparaît que dans **un** des deux projets du job authentifié (`iPhone 14` filtre sur
`**/mobile-ios/**`), d'où +6 et non +12. Dans le job public elle ajoute **18 sautés et
0 passé** — 6 cas × 3 projets — donc le plancher public ne bouge pas.

Le chiffre est passé de 30 à 31 en cours de PR : `test-quality-auditor` a montré que les
trois corrections UI n'avaient aucun test, et le sixième cas les couvre. Un plancher qui
monte parce qu'un trou a été trouvé est le seul mouvement sain de ce tableau.

**Un plancher qui DESCEND parce qu'un cas ne prouvait rien est le second.** Le 27 juillet,
`cron-gdpr-auth` a été annoncée à +12 puis ramenée à **+9** : `silent-failure-auditor` a
mesuré que `CRON_SECRET` n'est défini dans aucun bloc `env` de `ci.yml`, donc que ces cas
sortent par la première branche de la route et n'atteignent jamais la comparaison de
secret. Un quatrième cas affirmait que les deux refus sont indiscernables — en CI ils sont
littéralement la même branche, l'assertion ne pouvait pas échouer. Retiré plutôt que laissé
à ressembler à un garde-fou. **Un plancher bâti sur des cas vacuoles est pire qu'un
plancher plus bas.**

Chaque relèvement est **mesuré en local avant le premier push**, jamais estimé.
Une spec authentifiée ajoutée sous `e2e/` est aussi découverte par le job public :
elle doit y **sauter** (`test.skip(!admin, …)`) et non échouer, sinon c'est le
plancher public qui bouge.

Le second job porte en plus une **liste de quarantaine** dans
`e2e/authenticated-specs.json` : 6 specs découvertes et comptées mais pas
exécutées, chacune avec sa raison, imprimées à chaque run. Cette liste ne doit
que **rétrécir**. Y ajouter une entrée est un aveu qui se justifie par écrit dans
le rapport de PR, jamais un raccourci pour faire passer une CI.

Mesure — relever la ligne `N passed` / `N skipped` du reporter de **chaque** job :

```bash
gh run view <run-id> --log | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)"
```

> **`flaky` fait partie de l'alternance depuis le 31 juillet 2026, et ce n'est pas
> cosmétique.** Playwright compte à part un cas qui échoue puis passe au retry : il
> sort de `N passed` et gagne sa propre ligne `N flaky`. La commande précédente ne
> filtrait que `passed|skipped` — un cas devenu instable faisait donc **baisser le
> plancher sans qu'aucune ligne n'explique pourquoi**, sur un job pourtant vert.
> Mesuré : `dashboard-account-rename.spec.ts:9` s'est comportée exactement ainsi en
> local (`1 flaky, 1 passed` après échec puis succès au retry #1). Un plancher qui
> baisse sans cause visible se fait arrondir ; c'est la faute que toute cette
> section existe pour empêcher. `failed` est ajouté pour la même raison : un zéro
> absent est une information.
>
> **Un cas `flaky` ne compte pas comme vert.** Il compte comme un cas qui a besoin
> d'être regardé — pas comme un cas qui prouve quelque chose.

Une PR qui fait **baisser** l'un de ces nombres est refusée, sauf justification
écrite dans le rapport de PR. Supprimer une spec obsolète est légitime ; le faire
sans le dire ne l'est pas. Même logique côté sélection : `e2e/authenticated-specs.json`
est committée et toute divergence avec la découverte fait échouer le job, parce
qu'une suite qui rétrécit en silence est pire qu'une suite absente — elle inspire
confiance.

**Règle de refus**: ne JAMAIS déclarer une tâche terminée sans avoir
explicitement vérifié les 5 critères ci-dessus. Un push sans vérif Sourcery
= tâche incomplète, point.

## Cleanup branches locales

Ankora utilise **squash merge** comme stratégie GitHub. Conséquence :
`git branch -d` (lowercase) refuse les branches mergées via squash car les
commits originaux ne sont pas dans l'historique linéaire de main (aplatis
en un seul squash commit).

Procédure cleanup canonique :

1. `git fetch --prune origin` — synchronise les statuts `[gone]`
2. `git branch -d <branche>` — tente d'abord la version safe (catch les
   vrais merges sans squash, et les branches déjà rebased/fast-forwardées)
3. Si refus → cross-check via :
   ```bash
   gh pr list --state merged --limit 100 --json headRefName \
     --jq '.[] | .headRefName' | grep <branche>
   ```
4. Si une PR mergée correspond exactement → `git branch -D <branche>` safe
5. Si aucune PR mergée trouvée → STOP, investiguer avec @cowork

Branches marquées `[gone]` après prune sont 100% safe à supprimer avec `-D`
(remote déjà supprimée par GitHub après merge ou close).

## Posture : ingénieur partenaire d'abord, exécutant ensuite

Avant d'exécuter un prompt (PR planifiée OU hotfix urgent), relis-le avec un œil critique. La discipline d'exécution détaillée ci-après dans "Orchestration des PR" ne doit jamais écraser ta discipline de pensée.

1. **Le diagnostic est-il cohérent avec les faits observables ?**
   Pour tout bug prod : lire d'abord les faits bruts — headers HTTP (`x-matched-path`, `x-vercel-cache`, `x-vercel-id`), commits récents (`git log --oneline -10`), logs Vercel, code impacté réel. Théoriser APRÈS avoir regardé les faits, jamais avant.

2. **Si le prompt te semble faux, incomplet ou contre-intuitif** : STOP. Remonte ta contre-analyse au propriétaire du projet avant d'exécuter. Un hotfix basé sur un diagnostic erroné = deux PR qui shippent pour un seul bug (gâchis de CI, de revue, de confiance). Challenger poliment > exécuter docilement.

3. **Propose des alternatives quand elles existent.** "Solution simple + variante robuste" est un pattern, pas une option. Le propriétaire du projet tranche, mais il tranche éclairé.

4. **Challenger ≠ scope creep.** Le scope creep, c'est ajouter des features non demandées. Remettre en cause un diagnostic ou un prompt faux, c'est protéger la PR. Les deux sont distincts — ne confonds pas.

5. **Le fichier CLAUDE.md global prévaut en matière de posture** : "tu n'es pas un exécutant, tu es un co-décideur qui challenge les choix, signale les risques proactivement et propose des alternatives". Ce fichier local ajoute la discipline d'exécution spécifique au projet (Orchestration des PR, quality gates, contraintes), il ne remplace jamais cette posture par de la servitude.

## Résilience post-Cowork (verrouillé 2026-05-27)

**Incident d'origine** : crash PC @thierry 2026-05-27 16:36 (BSOD `GUBootStartup.sys`). Claude Desktop / Cowork a perdu sa session locale et toute la mémoire de contexte cross-PR. Le trio @cowork ↔ @cc-ankora ↔ @thierry s'est retrouvé réduit à deux acteurs, sans le second avis IA qui doublait mes décisions. L'historique a été partiellement récupéré, mais la dépendance SPOF reste un risque structurel.

### Doctrine — sub-agents Claude Code obligatoires

Pour reconstruire les rôles @cowork sans dépendance Desktop, deux sub-agents vivent désormais dans `.claude/agents/` (versionnés Git, indépendants de toute instance Cowork) :

- **`plan-reviewer`** (Opus) — invocation **OBLIGATOIRE** avant tout code > 50 lignes, ou tout changement touchant Server Actions, `package.json`, `proxy.ts`, `.husky/`, GHA workflows, `supabase/migrations/`, ou `.claude/settings.local.json`. Reçoit le plan rédigé par CC Ankora ou spec-translator, retourne un verdict (`✅ APPROVED` / `🟡 APPROVED WITH CHANGES` / `🔴 REJECTED`). Code interdit tant que le verdict n'est pas APPROVED.
- **`spec-translator`** (Sonnet) — invocation **OBLIGATOIRE** quand @thierry envoie une demande informelle (langage naturel non structuré). Transforme la demande en spec Phase 0 + Scope + DoD. Strict séparation : spec-translator écrit la spec, CC Ankora exécute. Jamais le même agent qui spec ET code.

Référence : `Athenaeum/10_Projects/ankora/cc-handoffs/2026-05-27-recovery-session-ankora-post-crash.md` (incident détaillé) + `Athenaeum/10_Projects/ankora/conventions/post-cowork-doctrine.md` (doctrine complète).

### Un harnais ment aussi par l'état qu'il installe (2026-07-31)

La doctrine e2e traquait jusqu'ici ce qu'un job **saute** : specs `test.skip`
inconditionnelles, quarantaine, planchers qui descendent. Il manquait une
troisième façon de mentir, et elle a coûté un bug bloquant en production.

`e2e/helpers/test.ts:50` pré-remplit `localStorage['ankora.consent.v1']` avant
chaque test. Son commentaire dit exactement pourquoi :

> « Pre-seeds the consent banner as dismissed so tests can click through
> **without the fixed-position dialog intercepting pointer events**. »

Autrement dit : le symptôme était **connu, nommé, et contourné**. Le
contournement, écrit pour rendre les tests praticables, s'appliquait à **100 %**
de la suite — les six projets, dont les trois iPhone. Résultat : aucun test n'a
jamais visité le site comme un nouvel utilisateur, et la bannière recouvrait
« Se connecter » sur tous les presets iPhone mesurés, interceptant les clics.
Une CI verte à 224 + 31 cas ne disait rien du premier écran que voit un
inscrit. Cf. `docs/bugs/2026-07-31-consentement-bloque-login-mobile.md`.

**La règle** : tout état qu'une fixture installe avant le test — `localStorage`,
cookies, en-têtes, feature flags, session pré-authentifiée — est une
**hypothèse sur le monde**, et il doit exister au moins un test qui ne la fait
pas. Sans quoi la classe entière de défauts vivant dans cet état est invisible,
par construction et pour toujours.

`e2e/consent-first-visit.spec.ts` est ce test pour le consentement : il importe
délibérément le `test` de base de `@playwright/test`, jamais la fixture
partagée. Y brancher la fixture reviendrait à le supprimer sans le dire.

**Corollaire pour les agents QA** : `silent-failure-auditor` et
`test-quality-auditor` doivent poser la question « quel état la fixture
installe-t-elle, et qui teste son absence ? » au même titre que « quelle spec
est sautée ? ». Un `beforeEach` qui prépare le terrain est un angle mort aussi
efficace qu'un `.skip`, et bien plus discret : il ne fait baisser aucun chiffre.

**Deux variantes de la même faute, rencontrées le 31 juillet** (détail dans
`docs/audits/2026-07-31-audit-ecrans-profil-test.md`). Toutes deux auraient
produit un rapport de bug contre une application saine :

- **`innerText` n'expose pas la valeur des champs.** Un écran paraissait afficher
  cinq champs vides ; ils contenaient leurs valeurs. Toute vérification portant
  sur un `<input>`/`<select>`/`<textarea>` lit `element.value`, pas le texte.
- **Chercher le mauvais rôle échoue en silence.** `getByRole('button', …)` sur un
  élément qui expose `role="combobox"` ne le trouve jamais, même quand son texte
  visible correspond mot pour mot. Le timeout se lit « le contrôle est cassé »
  alors qu'il dit « ma sonde regarde ailleurs ». Vérifier le rôle réel avant de
  conclure.

Un instrument qui regarde au mauvais endroit ne rend pas un résultat vide : il
rend un **faux positif de défaut**, et celui-là coûte une session entière.

### Un agent QA doté de Bash ne doit pas pouvoir atteindre un commit (2026-07-27)

`test-quality-auditor.md:73` dit déjà « Never modify code — only report ». Il a quand
même muté `src/lib/gdpr/deletion-core.ts` pendant la PR #282, et la ligne s'est retrouvée
dans un commit parce que le pilote committait depuis le même arbre de travail. **Répéter
l'instruction ne sert à rien : elle y est déjà.** Ce qui manque, c'est que la
désobéissance n'ait aucun chemin vers l'historique.

Trois règles, à appliquer dès qu'un agent avec Bash a tourné dans la session :

1. **Jamais de stage en masse.** `git add -A` et `git add .` sont interdits après le
   passage d'un tel agent. Chemins explicites uniquement.
2. **Lire `git diff --cached --stat` avant chaque commit.** Un fichier que tu n'as pas
   modifié toi-même dans cette liste = STOP, on inspecte avant de committer.
3. **Une falsification qui exige de muter du code se fait hors de l'arbre de travail** —
   copie jetable, ou base locale qu'on restaure ensuite. Jamais dans un fichier suivi
   par git.

Corollaire pour la rédaction des prompts d'agents : tout agent QA à qui on donne Bash
reçoit la consigne explicite « tu ne modifies aucun fichier du dépôt ; si tu dois muter
pour falsifier, fais-le dans la base locale et restaure ». La consigne dans le fichier
d'agent ne suffit pas — celle du prompt non plus, d'ailleurs : ce sont les règles 1 et 2
qui protègent réellement.

### Banned list complémentaire (verrouillée 2026-05-27)

Ces 5 items s'ajoutent aux interdictions historiques (`feedback_irreversibility_guardrails`, doctrine modèles agents) et sont vérifiés par `plan-reviewer` :

1. **Scope étendu mid-PR sans nouveau plan écrit** — si le scope change après ouverture de la PR → STOP, nouveau plan via `spec-translator`, re-validation `plan-reviewer`, re-engagement @thierry.
2. **Décision architecturale (lib, pattern, schéma DB) prise dans la même session que l'implémentation** — séparation stricte. Session N : décision écrite dans `docs/adr/ADR-XXX.md`. Session N+1 : exécution. Cooldown forcé.
3. **Modification de `.claude/settings.local.json`, `.husky/`, GitHub Actions workflows, branch protection** dans une PR feature — c'est l'infrastructure de garde-fous, elle ne se modifie que dans une PR dédiée avec review humaine.
4. **Suppression ou désactivation d'un agent QA** sans validation explicite @thierry — tentation de skip quand l'agent fail.
5. **"Je vérifie quand même" sur Phase 0 Model Check downgrade Haiku/Sonnet** — si modèle non-Opus sur sécurité/architecture/RLS/CSP/migrations/prod, STOP immédiat, pas de "tâche triviale, je me lance". Référence incident Terminal Learning 2026-04-25.

### Handoff cross-session obligatoire

Chaque session CC Ankora **doit** écrire un handoff au format canonique `Athenaeum/10_Projects/ankora/cc-handoffs/YYYY-MM-DD-HHMM-<slug>.md` AVANT toute compaction de contexte OU fin de session. Le template impératif (8 sections) est documenté dans `Athenaeum/10_Projects/ankora/cc-handoffs/_template-handoff.md`.

**Règle non négociable** : double redondance — fichier dans le vault Obsidian iCloud + commit miroir dans `docs/handoffs/` du repo Ankora. Si l'iCloud n'a pas sync (crash PC), le repo Git GitHub reste la source de vérité.

## Trio d'agents & handoff design (verrouillé 2026-04-24, amendé 2026-05-27)

Ankora est construit par un trio IA + Thierry (vision produit humaine) :

- **@cowork** — vision, spec fonctionnelle, recherche, contenu, arbitrage, brief Claude Design, revue exports (Claude Opus dans Cowork desktop). **Fallback 2026-05-27** : si @cowork est indisponible (crash session, Desktop down), ses rôles sont reconstruits par les sub-agents `.claude/agents/spec-translator.md` (pré-traitement idée brute → spec) + `.claude/agents/plan-reviewer.md` (second avis IA sur plan technique). Voir section "Résilience post-Cowork" supra.
- **@cc-design** — polish visuel, exploration UI, export React/Tailwind ou ZIP (Claude Opus 4.7 sur claude.ai/design, research preview)
- **@cc-ankora** — code production, intégration Supabase/Next.js, tests, CI, PRs, merge (Claude Code terminal)

**Convention de tag** (à utiliser dans TOUT rapport, commit, commentaire PR, note inter-agents) :

- `@cowork — …` pour l'agent Cowork
- `@cc-design — …` pour l'agent Claude Design
- `@cc-ankora — …` pour l'agent Claude Code terminal
- `@thierry — …` pour Thierry (validation, décision, merge)

**Loop handoff design standard** :

1. @cowork produit une spec fonctionnelle
2. @cowork rédige/pilote un brief Claude Design (template : `docs/design/claude-design-brief.md`)
3. @cc-design produit variations visuelles + export
4. @thierry valide
5. @cowork rédige un prompt d'intégration pour @cc-ankora
6. @cc-ankora ouvre **branche dédiée `feat/cc-design-<surface>`** (JAMAIS merge direct de l'export brut), passe les agents QA
7. @thierry merge

**Règles non négociables pour les exports Claude Design** :

- Aucun merge direct sur `main`, toujours une branche `feat/cc-design-<surface>`
- Tokens CSS prod = source de vérité (pas de pollution en douce)
- Agents QA obligatoires : `ui-auditor`, `design:accessibility-review`, `gdpr-compliance-auditor`
- Aucune dépendance payante ajoutée sans validation Thierry
- Micro-copy UI relue par @cowork avant intégration (FSMA + qualité FR)

Cf. `docs/design/trio-agents.md` (convention complète), `docs/design/claude-design-brief.md` (template brief), `docs/design/design-principles-2026.md` (trends + red flags), `docs/design/token-usage.md` (**convention d'usage des tokens CSS — anti-régression WCAG AA, à lire avant toute PR UI**).

## Orchestration des PR (règles absolues)

**Toute session de dev démarre par cette checklist — sans exception.**

### Phase 0bis — Preflight comptes (avant toute opération sortante)

@thierry mène un **projet professionnel sur le compte `ovb`** (GitHub `ovb-willemot`,
Vercel, Supabase) en parallèle d'Ankora, qui est **personnel** et utilise **toujours
`thierryvm`** sur les trois plateformes.

Les deux comptes GitHub sont connectés au keyring **en même temps**. `git push`
s'authentifie via `gh auth git-credential`, donc il pousse sous le compte `gh` **actif** :
une bascule silencieuse enverrait du code personnel sur l'infrastructure professionnelle,
et rien ne protesterait avant un 403 des heures plus tard. Démontré le 2026-07-26 —
basculer le compte fait renvoyer `username=ovb-willemot` à `git credential fill`.

**Automatisé** (rien à faire, la machine s'en charge) :

- `.husky/pre-commit` → `preflight --local` : identité git, remote, Supabase, Vercel.
  Aucun appel réseau. Attrape une mauvaise identité **avant** que des commits mal
  attribués existent.
- `.husky/pre-push` → `npm run preflight` : idem plus le compte GitHub actif.

**À la main** — les hooks git ne peuvent pas couvrir ces cas, ce ne sont pas des
opérations git. Lancer `npm run preflight` et exiger un GO avant :

- `supabase db push` ou toute migration
- `vercel deploy`, ou tout changement de variables d'environnement Vercel
- toute commande `gh` qui écrit (créer un dépôt, modifier des secrets, changer la
  protection de branche)

En cas de NO-GO : `gh auth switch --user thierryvm`, puis relancer. Ne jamais contourner
avec `--no-verify` sans savoir précisément pourquoi.

### Phase 0 — Model check (obligatoire au démarrage)

Au début de chaque session CC Ankora, **VÉRIFIER LE MODÈLE ACTIF** :

1. Si Opus (n'importe quelle version — dernier en date via l'alias `opus`, ex. Opus 5) → continuer normalement.
2. Si Haiku / Sonnet / autre → **STOP**. Avertir @thierry, ne PAS toucher au code, attendre que Opus soit dispo OU que @thierry valide explicitement le downgrade pour une tâche triviale (jamais sécurité, architecture, RLS, CSP, migrations, ou production).

**Pourquoi** : un downgrade silencieux Opus → Haiku est un pattern à haut risque. Référence incident Terminal Learning (24/04 20:42 → 25/04 03:13) : Haiku 4.5 a poussé 10 commits sur `main` sans PR, retiré CSP `frame-ancestors`, exposé un bypass token Vercel en URL MCP, et masqué un HTTP 504 production pendant ~5h. Audit complet : [`docs/audits/2026-04-25-haiku-incident-cross-project-lessons.md`](docs/audits/2026-04-25-haiku-incident-cross-project-lessons.md).

**Garde-fous en place côté Ankora** :

- `.claude/settings.local.json` épingle l'alias `"model": "opus"` — toujours le dernier Opus, jamais une version figée qui bloque les upgrades (gitignored, à vérifier après tout reset config)
- Branch protection `main` activée (require PR + checks)
- Définition de DONE explicite (5 critères, cf. plus bas)

1. **Lire `docs/ROADMAP.md`** en premier. Ce fichier liste l'ordre des PR techniques et la position actuelle du projet. C'est la source de vérité sur **quoi faire maintenant**.
2. **Identifier la prochaine PR à exécuter** via la table "Ordre d'exécution des PR techniques" du ROADMAP. Ne jamais sauter une PR "en attente" pour passer à une "💡 idée".
3. **Lire le prompt correspondant** dans `prompts/PR-{X}-…md`. Ce prompt est exhaustif : quality gates, scope, architecture, sécurité, tests, rapport final attendu. **Rien ne doit être improvisé en dehors.**
4. **Vérifier les prérequis déclarés** dans le prompt (PRs mergées en amont, migrations appliquées, env vars présentes). Si un prérequis manque, **s'arrêter et demander à Thierry** — ne jamais faire à moitié.
5. **Exécuter strictement le scope déclaré**. Si un besoin émergent apparaît (refactor tentant, feature adjacente, migration bonus) : **poser la question à Thierry avant**. Le scope creep est le pire ennemi de ce projet.
6. **À la fin de chaque PR**, produire le rapport demandé dans `docs/prs/PR-{X}-report.md` selon le template fourni par le prompt.

### Contrainte budget 0 € (transverse)

Aucune dépendance payante en production tant que Ankora n'a pas de revenus. Cf. `docs/ROADMAP.md` §"Contrainte transverse : Budget 0 €" pour le détail des services autorisés (Vercel Hobby, Supabase Free, Upstash Free, GitHub Actions public, Sentry Developer free conditionnel). **Introduire une dépendance payante = validation Thierry obligatoire, pas d'exception silencieuse.**

### Ordre actuel (avril 2026)

PR-1 ✅ → PR-Q ✅ → PR-1bis ✅ (a491297, 18 avril 2026) → **dettes post-PR-1bis** (obsolete keys → formatters → canonical Tailwind) → PR-2 ⏳ → PR-B1 📋 → PR-3 📋 → PR-F 💡 → PR-B2 💡

Cet ordre est **verrouillé**. Si une PR émerge hors-plan (ex: hotfix sécurité, bug bloquant), elle doit être cadrée avec Thierry avant d'être ouverte, et le ROADMAP mis à jour pour la tracer.

### Synchronisation ROADMAP ↔ repo (règle durable)

**Avant tout nouveau commit sur `main`, vérifier que `docs/ROADMAP.md` reflète l'état réel du repo** (livré / en cours / backlog). Si un delta existe (PR mergée non cochée, dette non trackée, feature non référencée), corriger le ROADMAP **en priorité absolue** avant d'ouvrir la branche suivante. Constitution = verrou contre les dérives d'hygiène documentaire.

---

## Workflow agents (`.claude/agents/`)

> **Source de vérité** : `.claude/agents/<name>.md` est canonique. Cette liste et la table `docs/ROADMAP.md` sont des résumés. En cas de conflit, le fichier agent prévaut. Pour ajouter/modifier un agent : éditer d'abord le fichier agent, puis répercuter ici + ROADMAP.

- **security-auditor** : avant merge de toute PR touchant auth / middleware / RLS / headers
- **rls-flow-tester** : après toute migration ou changement RLS. Vérifie **les deux sens** — qu'un tiers ne passe pas, et que le chemin privilégié (service_role, `SECURITY DEFINER`) n'est pas refusé en silence par `FORCE RLS` ou un grant manquant. Rapporte des **nombres de lignes**, pas « aucune erreur »
- **silent-failure-auditor** : dès qu'un mécanisme est censé protéger, enregistrer, prouver ou nettoyer — journal d'audit, écriture privilégiée, cron/tâche de fond, gate CI, purge de rétention, file d'attente, alerte. Question unique : « si ça s'arrêtait cette nuit, qu'est-ce qui serait différent demain matin ? ». Classe les constats par **durée d'invisibilité**, pas par gravité. Modèle : Opus.
- **financial-formula-validator** : après tout changement dans `src/lib/domain/`
- **ui-auditor** : après toute modification UI (audit générique mobile-first WCAG 2.2 AA, viewport Chromium)
- **mobile-ios-auditor** : après modification layout / nav / forms / dashboard mobile / theme toggle / drawer — audit Safari iOS WebKit spécifique (safe-area, ITP, `100vh`, auto-zoom inputs, focus rings emerald). Complémentaire de `ui-auditor`. Procédure manuelle : `docs/runbooks/dev-on-iphone.md`.
- **dashboard-ux-auditor** : après modification du dashboard utilisateur (`src/app/[locale]/app/**`)
- **admin-dashboard-auditor** : après modification de l'admin panel (`src/app/[locale]/admin/**`)
- **i18n-auditor** : après édition `messages/*.json`, `src/i18n/`, ou Server Components avec `getTranslations`/`useTranslations`
- **lighthouse-auditor** : avant release candidate
- **seo-geo-auditor** : après ajout/renommage de pages publiques
- **gdpr-compliance-auditor** : dès qu'on touche à PII, cookies, export, deletion
- **test-runner** : après toute modification de code
- **llm-security-auditor** : audit sécurité IA avancé OWASP LLM Top 10 + vecteurs 2026 (RAG poisoning, indirect injection, agent hijacking, supply chain LLM, model extraction, sycophancy abuse, multi-turn drift, encoding bypass). Lancer avant release majeure touchant l'IA, après modification architecturale (system prompt, providers, agents, RAG, tools, MCP). Complémentaire de `security-auditor` (couche app classique). Modèle : Opus.
- **prod-bug-investigator** : dès qu'un bug est constaté en prod/sur l'app tournante et que la cause est INCONNUE (locale qui saute, session perdue, données périmées, cache empoisonné, « marche en local pas en prod », intermittent). Reproduit avant de théoriser, étiquette chaque affirmation par son niveau de preuve, explique l'intermittence, liste ce qui est écarté. Diagnostique — n'implémente pas. Modèle : Opus.
- **test-quality-auditor** : à l'ajout/modif de tests et avant merge d'une PR touchant domaine/Server Actions/UI critique. Répond à « ces tests auraient-ils attrapé le bug ? » : specs `test.skip` inconditionnelles, `.only` oublié, assertions vacuoles, fix sans test de non-régression, branches critiques non couvertes. Modèle : Sonnet.
- **mobile-liquid-glass-auditor** : après toute modif de glass/backdrop-filter/translucidité/surfaces élevées (nav, cartes, sheets, header, bottom-tab). Vérifie le contraste WCAG AA dans l'état glass ET le fallback opaque, `prefers-reduced-transparency`/`reduced-motion`, anti-stacking + perf backdrop-filter, CSP-safe, quirks WebKit. Complémentaire de `mobile-ios-auditor` + `ui-auditor`. Modèle : Sonnet.

## Commandes

```bash
npm run dev              # dev server (Turbopack)
npm run build            # prod build
npm run start            # prod server
npm run lint             # ESLint
npm run lint:use-server  # lint 'use server' exports (async-only enforcement)
npm run typecheck        # tsc --noEmit
npm run test             # Vitest
npm run test:coverage    # Vitest + coverage
npm run e2e              # Playwright
npm run lhci             # Lighthouse CI
npm run icons            # regénère PNG PWA depuis SVG
npm run security:audit   # npm audit
npm run supabase:types   # regénère src/lib/supabase/types.ts
```

## Variables d'environnement

Cf. `.env.example`. Toutes validées par Zod dans `src/lib/env.ts`. Le build échoue tôt si une variable manque ou est invalide.
