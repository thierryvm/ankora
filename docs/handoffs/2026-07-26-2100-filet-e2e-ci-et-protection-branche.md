# Handoff — 26 juillet 2026, 21h00 · Filet e2e réel en CI + protection de branche

**Agent** : @cc-ankora (Opus 5)
**Branches** : `fix/refonte-01-depenses-filet-affordance` (mergée #270),
`ci/refonte-02-filet-e2e` (mergée #271, `d652d1c`)

---

## 1. Ce qui a été livré

**Étape 1 (#270)** — dépenses : la ligne devient la cible d'édition, la suppression
passe derrière une confirmation nommant la dépense et son montant. Trois bugs
silencieux corrigés (date par défaut en UTC au lieu de l'heure belge, `formatDate`
ignorant le fuseau, `paid_from` perdu à la création) + tests de frontière
d'autorisation.

**Étape 2 (#271)** — la CI exécute enfin les parcours connectés. Nouveau job
`Playwright E2E (authenticated)` : stack Supabase locale éphémère, 15 migrations
rejouées depuis zéro, Redis + proxy compatible Upstash pour que `rateLimit()` soit
réellement exercé.

**Protection de branche** — quatre checks rendus obligatoires sur `main`
(`Lint + Typecheck + Unit Tests`, `Security audit`, `Playwright E2E`,
`Playwright E2E (authenticated)`). **Avant : aucun check n'était requis** — tous les
jobs pouvaient être rouges et la fusion passait.

## 2. Chiffres

|                                         | Avant                    | Après                        |
| --------------------------------------- | ------------------------ | ---------------------------- |
| Job public                              | 214 passed / 173 skipped | **215 passed / 172 skipped** |
| Job authentifié                         | n'existait pas           | **24 passed** (local ET CI)  |
| Skips inconditionnels dans `e2e/`       | 2                        | **0**                        |
| Connexions réelles servies en une passe | —                        | **79**, zéro refus de quota  |

## 3. Décisions verrouillées

- **Aucune ligne de `src/` touchée par l'étape 2.** La v1 du plan proposait un
  contournement du rate-limiter ; `plan-reviewer` a montré qu'il était **fail-open**
  (variable à `.default('development')`), ce qui aurait dé-protégé les previews
  Vercel — lesquelles pointent sur l'unique base, la production.
- **Solution hermétique retenue contre l'avis initial de la revue** (Redis + SRH
  épinglés par digest plutôt qu'une base Upstash de CI), après spike mesuré et
  falsifiable. Une dépendance réseau externe dans un gate bloquant apprend à ignorer
  le rouge. La revue a concédé.
- **Ports Supabase locaux décalés en `5442x`** : le projet professionnel `OVB`
  occupe les défauts sur la machine de @thierry.
- **`enforce_admins` et les approbations obligatoires restent désactivés** — dépôt
  solo, ils bloqueraient @thierry sur ses propres PR.

## 4. Dettes ouvertes, chacune sa PR

1. **6 specs décrivent un dashboard qui n'existe plus** (pré-THI-327) — en
   quarantaine motivée dans `e2e/authenticated-specs.json`. La liste ne doit que
   rétrécir.
2. **`CardTitle` rend une `<div>`** → les titres de section du cockpit ne sont pas
   des titres pour un lecteur d'écran. Défaut WCAG réel, primitive partagée, donc PR
   dédiée + `ui-auditor`.
3. **`audit_log` refuse les insertions** sur une base reconstruite depuis les
   migrations. En production ça marche → un droit y a été posé hors migration. Les
   migrations ne décrivent pas complètement la production. À traiter avec l'étape 3
   (RGPD).
4. **Angle mort du préflight** : il valide le fichier de lien Supabase, pas le compte
   que le CLI utilise réellement. PR dédiée (infrastructure de garde-fous).
5. **`docs/ROADMAP.md` date du 9 mai** et ignore le programme de refonte 17 étapes.
   Dérive documentaire à corriger avant d'ouvrir l'étape suivante.

## 5. Reprise — prochaine action

**Étape 3 du programme de refonte : RGPD P0** (`docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md`,
section ÉTAPE 3). Objectif : `executeDeletion()` n'a **aucun appelant** — la file de
suppression de comptes n'est consommée par rien. Voie LOURDE, `plan-reviewer`
obligatoire. La dette n° 3 ci-dessus s'y rattache naturellement.

Prérequis désormais satisfait : les tests d'intégration de `executeDeletion()`
peuvent enfin tourner contre une vraie base, ce que l'étape 2 rend possible.

## 6. Erreurs de méthode commises, et corrigées

Consignées parce qu'elles se reproduiront sinon :

- **Sonde vacuole** : une assertion visant un `alert` vide déjà présent au
  chargement — elle ne pouvait pas échouer et « prouvait » l'inverse de la réalité.
- **Falsification contre un serveur mort** : le serveur s'était arrêté une minute
  plus tôt ; le résultat ne valait rien.
- **Compteur au niveau module pour l'unicité par test** : Playwright relance chaque
  réessai dans un worker neuf, qui le remet à zéro. 29 échecs au lieu de 12.
- **Affirmation non vérifiée dans un plan** : j'avais écrit que les 13 specs
  sélectionnées étaient toutes atteintes par la fixture — c'était vrai, mais je ne
  l'avais pas mesuré au moment de l'écrire.

## 7. État de la machine

Stack Supabase Ankora arrêtée, conteneurs de spike supprimés, serveur de test
arrêté. **Les 11 conteneurs du projet professionnel `OVB` tournent toujours** —
jamais touchés.

## 8. Références

- `docs/prs/PR-refonte-01-depenses-report.md`
- `docs/prs/PR-refonte-02-filet-e2e-report.md`
- `docs/runbooks/e2e.md` — comment lancer chaque suite, et les pièges qui coûtent
  une heure
- `docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md` — programme 17 étapes
