# Rapport — Chantier 1 : nettoyage + vocabulaire

- **Date** : 2026-07-29
- **Branche** : `chantier1/nettoyage-vocabulaire` (depuis `main` @ `36680f7`)
- **Modèle exécutant** : Claude Opus 5
- **Autorité produit** : [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md) (Q1, Q2, Q3, Q6, §3.1, §3.6), précédé de [`docs/audits/2026-07-29-audit-ankora.md`](../audits/2026-07-29-audit-ankora.md)
- **ADR produits** : [ADR-034](../adr/ADR-034-suppression-atoms-et-design-playground.md) (supersède ADR-020) · [ADR-035](../adr/ADR-035-vocabulaire-des-quatre-chiffres.md) (amende ADR-009)
- **Statut** : **prêt pour revue** — jamais « DONE » au sens du CLAUDE.md (cf. §6)

---

## 1. Chiffres

**6 commits · 103 fichiers · +3 005 / −7 030 lignes (net −4 025).**

| Commit    | Objet                                                      | Fichiers |      Δ lignes |
| --------- | ---------------------------------------------------------- | -------: | ------------: |
| `78ae092` | `docs(adr)` — décisions et récolte du contrat `Drawer`     |        6 |   +1 545 / −1 |
| `c344748` | `refactor(components)` — suppression `atoms/` + playground |       55 | +335 / −4 685 |
| `201e2cd` | `fix(a11y)` — variantes sombres des couleurs de statut     |        6 |    +209 / −18 |
| `971d7dd` | `feat(cockpit)` — les quatre chiffres nommés               |       16 |    +566 / −43 |
| `54ad369` | `feat(cockpit)` — suppression de l'enveloppe 500 €         |       30 | +306 / −2 281 |
| `6358f76` | `fix(a11y)` — `CardTitle` en `<h3>` + quarantaine e2e      |        3 |     +52 / −10 |

Le commit ADR ne contient **aucun** fichier `src/`, `supabase/` ou `messages/` : la décision reste séparable de son exécution.

## 2. Portes de qualité

| Porte                     | Départ mesuré         | Arrivée mesurée       |    Verdict     |
| ------------------------- | --------------------- | --------------------- | :------------: |
| `npm run lint`            | 0 erreur / 9 warnings | 0 erreur / 9 warnings |  ✅ inchangé   |
| `npm run lint:use-server` | ✓                     | ✓                     |       ✅       |
| `npm run typecheck`       | 0 erreur              | 0 erreur              |       ✅       |
| `npm run test`            | 1 762 / 136 fichiers  | 1 575 / 127 fichiers  | ✅ 100 % vert  |
| `npm run build`           | —                     | succès                |       ✅       |
| `npm run security:audit`  | **cassé**             | **cassé**             | ⚠️ préexistant |
| `npm run e2e`             | —                     | **non exécuté**       |   ⚠️ cf. §5    |

**Baisse du nombre de tests : −187, entièrement expliquée.** 11 suites d'atoms supprimées (3 portées), plus les suites de l'enveloppe (`capacite-epargne-reelle`, `reste-a-vivre` ×3, `AjusterResteAVivreDrawer`). Aucune règle n'est enfreinte — seul l'e2e est soumis à un plancher. Le chiffre est écrit ici pour qu'il ne se lise pas comme une suite qui rétrécit en silence.

**`npm run security:audit` échoue sur `ERR_MODULE_NOT_FOUND: scripts/security-audit.ts`.** Vérifié : ce fichier n'existe pas non plus dans `main`. Script npm cassé **avant** le chantier, non causé par lui, non corrigé (hors périmètre).

## 3. Contrastes — ratios mesurés, pas recopiés

Calculés par `src/app/__tests__/contrast-ratios.test.ts` (luminance relative WCAG 2.1) **sur le fichier CSS modifié**, contre `--color-card` (`#ffffff` clair, `#111a2e` sombre).

| Token             | Avant clair | Avant sombre | Après clair | Après sombre |
| ----------------- | ----------: | -----------: | ----------: | -----------: |
| `--color-success` |     3,77 ❌ |      4,60 ✅ | **5,48 ✅** |  **9,02 ✅** |
| `--color-warning` |     3,19 ❌ |      5,44 ✅ | **5,22 ✅** | **10,39 ✅** |
| `--color-danger`  |     4,83 ✅ |      3,59 ❌ | **4,83 ✅** |  **6,27 ✅** |
| `--color-info`    |     4,10 ❌ |      4,23 ❌ | **5,93 ✅** |  **8,09 ✅** |

`info` échouait dans **les deux** thèmes. Les 8 paires passent désormais AA 4,5:1. Les 10 valeurs annoncées par le document de décisions sont confirmées au centième.

## 4. Écarts entre le plan et la réalité du code

Sept écarts constatés. Aucun n'a été tranché en silence.

### 4.1 L'audit sous-comptait les call-sites d'`atoms/`

Il en annonçait **2, dans l'admin**. Il y en avait **3**, et le troisième — `ProgressBar` dans `ProvisionHealthGaugeCard.tsx:5` — rend sur le **dashboard utilisateur**. Migré, pas contourné.

### 4.2 ADR-020 était `Accepted` et décrivait du code vivant

Son « pattern d'usage canonique » (l.122-144) montre `<ProgressBar tone="success">` dans une `Card` de `ui/` — c'est `ProvisionHealthGaugeCard.tsx:174-177` au mot près. Supprimer `atoms/` est un **renversement d'architecture**, pas du ménage. D'où ADR-034, et le passage d'ADR-020 en `Superseded`.

### 4.3 ADR-025 et ADR-026 étaient déjà réservés

Le plan du 26/07 (`docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md:507`) réserve ADR-022 → ADR-033. Pire : l'**ADR-025 réservé traite du « chiffre souverain »**, soit le sujet même du glossaire — deux ADR se seraient contredits. Renumérotés en **034/035**, premiers créneaux libres.

### 4.4 La valeur de `warning` renverse une décision verrouillée par un test — ⚠️ **arbitrage attendu**

`src/app/__tests__/globals-tokens.test.ts:47` verrouillait `#d97706` au titre d'une **décision @cowork du 2026-04-25**, pour garder le warning distinct du laiton admin. La valeur prescrite `#a35a06` atteint AA, mais le coût est mesuré :

| Comparaison                              | Ratio de luminance | Écart de teinte |
| ---------------------------------------- | -----------------: | --------------: |
| `#d97706` (avant) vs laiton `#8b6914`    |           **1,60** |             11° |
| `#a35a06` (appliqué) vs laiton `#8b6914` |           **1,03** |             11° |

Un ratio de 1,03 = luminances quasi identiques : en mode clair, le warning et le pigment admin deviennent difficiles à distinguer. **Alternative calculée : `#9a3412`** → AA **7,31** (mieux que les 5,22 prescrits), ratio 1,44 contre le laiton, 28° d'écart de teinte, toujours franchement ambré-orangé. La valeur du document est appliquée (il fait foi, et 3,19 n'était pas défendable) ; **un mot suffit pour basculer.**

À noter : `ADR-005`, provenance revendiquée par le commentaire du test, **ne contient aucun** de ces hexadécimaux.

### 4.5 `--color-brand-600` : valeur prescrite **non appliquée**

Le document prescrit `#0f766e`. C'est **`--color-brand-700` au caractère près** : l'appliquer écrasait une marche de la palette. Or `text-brand-600` n'a **qu'un seul usage** dans tout `src/` (`Prose.tsx:30`, un marqueur de liste décoratif), le token servant surtout d'anneau de focus. Et `--color-brand-text` porte **déjà** exactement les valeurs visées (`#0f766e` clair / `#2dd4bf` sombre, AA dans les deux). Le marqueur bascule sur le token sémantique ; la palette reste intacte. Un test fige `600 ≠ 700`.

### 4.6 Le namespace i18n n'est pas celui annoncé

Le document §3.1 annonce `cockpit.hero.*`. Le namespace réel est **`dashboard.situation.*`**. Celui qui existe a été conservé.

### 4.7 `previsions.ts` portait l'enveloppe, hors de tout périmètre annoncé

`plafondQuotidien` y était un champ **requis** (`:20`, `:51`), avec zéro call-site de production. Sans son retrait, « le concept d'enveloppe disparaît entièrement » aurait été faux.

## 5. Ce qui a résisté

### 5.1 Les e2e n'ont pas pu être exécutés — et c'est délibéré

Deux blocages cumulés :

1. **Docker absent** de la machine → `supabase start` impossible → pas de Supabase local.
2. Le projet Supabase lié est la **production**. Les specs authentifiées ne sautent qu'en l'absence de clé `service_role` ; les lancer aurait **écrit de vraies lignes en base de production**.

**Conséquence assumée : aucune des 6 specs ne sort de quarantaine.** Libérer une spec non vue verte l'envoie dans le job authentifié (plancher 31) et le passe au rouge — la même faute qu'un filet qui ment, dans l'autre sens.

La cause racine de 3 d'entre elles **est corrigée** (`CardTitle` rend un `<h3>`). Les 6 raisons ont été réécrites pour dire où chacune en est : 2 `READY TO VERIFY`, 1 `PARTIALLY FIXED`, 3 `STILL INVALID` — dont `dashboard-capacite-tryptique`, désormais **définitivement** invalide puisque ADR-035 supprime les concepts qu'elle asserte.

**Le mécanisme, lui, ne mentait déjà plus** depuis le 26/07 : la quarantaine est imprimée à chaque run avec ses raisons et exclue de l'invocation Playwright. Vérifié en exécutant `scripts/e2e-auth-specs.mjs` → _15 specs, 9 run, 6 QUARANTINED — not run_. Une spec non exécutée est donc **visiblement** non exécutée. Le point 5 du brief était déjà satisfait ; le travail restant était de réduire la quarantaine, pas de réparer le garde-fou.

### 5.2 Le plancher e2e public n'est pas corrigé

La suppression de `e2e/design-playground.spec.ts` devrait coûter **2 exécutions** (1 cas × 2 projets non-webkit). Le chiffre **n'est pas inscrit** : la doctrine exige une valeur **observée**. Une note dans `CLAUDE.md` consigne le delta attendu et demande d'inscrire la valeur mesurée à la première CI verte.

### 5.3 La migration est écrite, pas appliquée

`supabase/migrations/20260729000001_deprecate_reste_a_vivre.sql`. Elle retire `NOT NULL` et le défaut, et marque les deux colonnes `DEPRECATED`. **Pas de `DROP COLUMN`** : `reste_a_vivre_overrides` porte de la donnée utilisateur, le dépôt n'a jamais droppé de colonne, et il n'y a ni préproduction ni PITR. `src/lib/supabase/types.ts` est **délibérément intact** — le schéma prod n'ayant pas changé, les types générés doivent continuer à le refléter.

### 5.4 Le hook `pre-commit` ne peut pas passer sur cette machine

Le preflight comptes rend NO-GO : `supabase link` et `vercel link` étaient absents au moment des commits. L'identité git a été corrigée (`user.name=thierryvm`, exigée par `scripts/preflight-accounts.mjs:137`) et ce contrôle **passe**. Les deux autres ❌ ne gardent que push/migration/deploy — aucun n'a été fait. `--no-verify` a été **explicitement autorisé par @thierry** pour les commits locaux ; en contrepartie `prettier` et `npm run lint:use-server` ont été lancés à la main avant chaque commit.

### 5.5 `ci.yml` porte une variable morte

`ANKORA_PLAYGROUND_ENABLED: 'true'` (`.github/workflows/ci.yml:88`) ne sert plus à rien. **Non retiré** : modifier un workflow GHA dans une PR feature est sur la liste des interdits (banned list du 2026-05-27, item 3). Elle est inerte — `src/lib/env.ts` ne la déclare plus. **Dette pour une PR d'infra dédiée.** En revanche `src/lib/env.ts:39` et `.env.example:17`, fichiers ordinaires, ont été nettoyés.

### 5.6 Non touché, faute d'arbitrage

`src/components/ui/{dialog,form,sheet,switch}.tsx` : 0 call-site, mais le plan du 26/07 (l.976) exige un ADR-028 explicite et dit « sans arbitrage : les garder ». Aucun arbitrage rendu → gardés.

## 6. Definition of Done

Ce chantier s'arrête à **« prêt pour revue »**. `CLAUDE.md` : « un push, un commit ou une PR ouverte ne signifie PAS terminé ».

1. ✅ Lint 0 · use-server ✓ · typecheck 0 · tests 100 % · build ✓ — rien de dégradé. ⚠️ `security:audit` cassé avant le chantier ; e2e non exécutables (§5.1).
2. ⏸️ **Sourcery** — inatteignable : aucun push autorisé, donc aucune PR à analyser.
3. ⏸️ **Review @thierry** — c'est l'objet de ce rapport.
4. ✅ Pas de conflit avec `main`.
5. ✅ Ce rapport.

## 7. Trois décisions attendues de @thierry

1. **Token `warning`** (§4.4) — garder `#a35a06` (prescrit, AA 5,22, collision 1,03 avec le laiton) ou basculer sur `#9a3412` (AA 7,31, séparation 1,44) ?
2. **Numérotation ADR** — 034/035 retenus faute d'alternative. Réallouer si tu préfères.
3. **Découpage en PR** — 6 commits sur une branche, > 100 fichiers. Le volume est un candidat au découpage en 6 PR au moment du push. Ordre de dépendance : `C0` et `C1` indépendants · `C2` indépendant · **`C3` dépend de `C2`** · `C4` et `C5` autonomes.

## 8. Hors périmètre, non fait

Pas de primitive `<Sheet>` (seulement la **récolte écrite** de son contrat, dans [`docs/specs/sheet-primitive-contract.md`](../specs/sheet-primitive-contract.md), avec les 4 exigences d'a11y modale que la source ne couvrait pas) · pas de bouton ⊕ · pas de refonte de l'accueil · pas de saisie 2 taps · pas de cadences 1/2/3/4/6/12 · pas de calculateur de coût du crédit · **aucune issue GitHub fermée** (pas d'accès `gh` sur la machine — les 7 issues P0/P1 #150-#152 et #154-#157 restent à fermer en référençant ADR-034).
