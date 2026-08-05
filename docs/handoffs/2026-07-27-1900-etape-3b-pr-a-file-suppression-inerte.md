---
project: ankora
type: cc-handoff
date: 2026-07-27
agent: cc-ankora
model: claude-opus-5
---

# Handoff — 27 juillet 2026, 19h00 · Étape 3B / PR-A : la file de suppression, inerte

> **Le fait à lire en premier** : la production porte déjà les deux migrations, alors que
> `main` n'a pas encore le code. Le comportement de la base a changé **au moment du push,
> pas au moment du merge**. Détail au §4.

---

## 1. État git brut

```
$ git rev-parse --abbrev-ref HEAD
feat/3b-a-deletion-queue

$ git rev-parse --short HEAD
8dacbcc

$ git log --oneline -5
8dacbcc docs(adr): la conception 1 rejetée n'est plus une inférence — elle est mesurée
3cd94d6 test(gdpr): les trois corrections UI n'avaient aucun test — un revert passait la CI
083c820 docs: mesurer les privilèges des 9 fonctions, et fermer le chemin d'un agent vers un commit
4b5f7f9 docs(prs): planchers e2e confirmés par la CI, et l'état honnête du DoD
0cb0857 fix(gdpr): fermer EXECUTE à anon sur claim_pending_deletions, et deux garanties annoncées qui n'existaient pas

$ git status --short
(vide)
```

9 commits au total sur la branche depuis `main` = `72f9fa6`. Aucun WIP.

## 2. PR en vol

- **PR #282** — https://github.com/thierryvm/ankora/pull/282
- **Titre** : `feat(gdpr): la file de suppression, inerte — le schéma sans l'exécuteur`
- **HEAD** : `8dacbcc`
- **DoD** :
  1. **CI : ✅ les 4 checks obligatoires verts sur `8dacbcc`** — `Lint + Typecheck + Unit
Tests` (2m16s), `Security audit` (34s), `Playwright E2E` (**215 passed / 193
     skipped**), `Playwright E2E (authenticated)` (**31 passed**).
  2. **Sourcery : ⚠️ NON RELU.** `gh pr checks` rend `Sourcery review — skipping` : le
     plafond hebdomadaire de 500 000 caractères était atteint le 27 juillet. La requête
     `gh api …/comments` rend **vide**, mais **ce vide n'est pas une approbation** — c'est
     une absence de revue. À écrire tel quel, jamais à compter comme vert.
  3. Reviews humaines : aucune.
  4. Conflit `main` : `mergeable: MERGEABLE`. `mergeStateStatus` oscillait entre `BLOCKED`
     (checks en vol) et `UNKNOWN` (recalcul GitHub) — à revérifier au moment du merge.
  5. Rapport : ✅ [`docs/prs/PR-3B-A-report.md`](../prs/PR-3B-A-report.md), 11 sections.

**@thierry merge lui-même**, avec l'exception Sourcery écrite et non masquée.

## 3. Plan en cours

- **Plan** : [`docs/plans/step-3b-deletion-queue.md`](../plans/step-3b-deletion-queue.md).
  **Décisions** : [`docs/adr/ADR-024`](../adr/ADR-024-file-de-suppression-de-compte.md).
- **Position** : PR-A **terminée**, §A1 à §A7 livrés. PR-B **pas commencée**.
- **Sous-agents** : `plan-reviewer` 🟡 APPROVED WITH CHANGES (5 corrections intégrées) ·
  `i18n-auditor` PASS_WITH_NOTES · `gdpr-compliance-auditor` COMPLIANT_WITH_NOTES ·
  `test-quality-auditor` PASS WITH GAPS (trous fermés) · `rls-flow-tester` **PASS**.

**L'invariant de PR-A est tenu** : `executeDeletion` n'a **aucun appelant**. Rien ne peut
supprimer un compte après ce merge.

## 4. Ce qui est DÉJÀ en production — et qui ne l'était pas hier

**Deux migrations poussées sur `ankora-prod` (`fkscfvoouwufyjwnfvhb`)**, préflight GO et
`--dry-run` avant chacune. `supabase migration list` : `local = remote` sur les 16.

- `20260727000001_deletion_queue.sql`
- `20260727000002_claim_grants_hardening.sql`

### Le point que personne ne doit redécouvrir dans six mois

**Le comportement de la production a changé au moment du `db push`, pas au moment du
merge.** Concrètement, depuis le push et indépendamment de `main` :

- **`deletion_self_insert` est SUPPRIMÉE en production.** Un client ne peut plus insérer
  de ligne dans `deletion_requests`, même pour lui-même.
- **`deletion_self_update` y est déjà resserrée** : seule transition possible
  `pending → cancelled`.
- `claim_pending_deletions` existe, avec EXECUTE fermé à `anon` et `authenticated`.
- `purge_audit_log_older_than_12_months()` est passée en `SECURITY INVOKER`.

**Pourquoi c'est sûr, et vérifié** : `deletion_requests` n'est écrit qu'en **un seul
endroit** du code — `src/lib/gdpr/deletion.ts`, via `createServiceRoleClient()`, qui
contourne la RLS. **Aucune insertion client n'existe** dans le produit. La politique
supprimée accordait donc une capacité inutilisée. Mesuré, pas supposé.

### Si PR-A n'était finalement PAS mergée

La migration **reste en production** — un revert de PR sur GitHub ne défait pas un
`db push`. Ce qui resterait :

- Additif : colonne `claimed_at`, statut `processing` dans le CHECK, index unique partiel,
  deux fonctions. Le code actuel de `main` les ignore purement et simplement.
- Les deux politiques réécrites sont **plus restrictives** qu'avant. Un retour en arrière
  du code ne casse rien, puisque le code ne s'appuyait déjà pas sur les capacités
  retirées.
- La contrainte `check` élargie **accepte** l'ancien jeu de valeurs.

Conclusion : sans danger, mais **présent**. Pour vraiment revenir en arrière il faudrait
une migration inverse, écrite exprès. Ne pas supposer qu'un revert de PR suffit.

## 5. Décisions prises cette session

- **Les corrections des migrations livrées vivent dans l'ADR et le rapport, PAS dans les
  fichiers** parce que `supabase_migrations.schema_migrations` porte une colonne
  `statements` : la prod enregistre le texte exécuté, et éditer un fichier appliqué le
  ferait diverger de ce qui a tourné. Alternative écartée : corriger les commentaires en
  place — sur une migration qui touche la suppression de comptes, l'immuabilité vaut mieux
  qu'un commentaire plus juste.
- **`src/lib/supabase/types.ts` régénéré depuis la prod puis NON adopté tel quel** parce
  que la CLI installée (2.84.2) produit une forme différente de celle qui a généré le
  fichier committé (bloc `graphql_public`, guillemets doubles) → ~1 700 lignes de diff sans
  rapport. Les deux ajouts ont été vérifiés **au caractère près** et reportés à la main.
- **`processingBody` reste absolu** (« ne peut plus être annulée ») bien que la reprise à
  1 h puisse ramener la ligne en `pending`. La phrase décrit l'**état courant**, vrai quand
  elle s'affiche ; si un run plante, l'écran repasse en `pending` avec son bouton. Une
  formulation hésitante serait moins honnête dans le cas de tous les jours.
- **Le scrub des lignes `audit_log` à `user_id: null` n'est PAS étendu**, contrairement à
  la recommandation de `gdpr-compliance-auditor`. Ces lignes sont **non attribuables** :
  nettoyer par IP effacerait celles d'autres personnes (NAT). Résidu documenté, pas
  correctif à portée de main.
- **`danger.description` (« tout est effacé », 5 locales) n'est pas corrigé ici** : c'est
  une surévaluation **antérieure** à cette PR, qui relève de la dette documentaire portée
  par PR-B (§B3) avec les huit autres sites.

## 6. Décisions en attente @thierry

- **Q1** — Merger PR-A. Les 4 checks sont verts sur `8dacbcc`. Non urgent mais bloquant
  pour PR-B.
- **Q2** — Lecture production n° 4 (privilèges des 9 fonctions), en lecture seule, pour
  confirmer sur l'hébergé ce qui a été mesuré en local. Requête au §Annexes.
- **Ordre validé par @thierry** : PR-B **d'abord**, PR grants **ensuite** — ces fonctions
  sont utilisées par toutes les policies RLS, et il refuse ce risque en parallèle de
  l'armement d'une suppression de comptes.

## 7. Garde-fous activés

- Modèle actif : **Opus 5** ✅ (Phase 0 passée au démarrage).
- `npm run preflight` : ✅ GO avant chaque opération sortante (2 `db push`, chaque push git
  via le hook).
- `npm run lint:use-server` : ✅ pass.
- Branch protection `main` : ✅ (4 checks requis).
- Sous-agents : `plan-reviewer` invoqué **avant** tout code, conformément à la doctrine
  post-Cowork. `spec-translator` non invoqué — la demande arrivait déjà sous forme de plan
  écrit et validé, pas de langage naturel informel.

## 8. Next action concrète

**Ouvrir `feat/3b-b-cron-arming` depuis `main` une fois PR-A mergée, et exécuter §B1 à §B5
de `docs/plans/step-3b-deletion-queue.md`.** Le NO-GO de PR-B a été levé par la lecture
production n° 3 du 27 juillet.

## 9. Anti-pièges — ce que la prochaine session ne doit PAS faire

- **Ne PAS rejouer les migrations `20260727000001` et `20260727000002`** — déjà appliquées
  en prod ET en local.
- **Ne PAS éditer ces deux fichiers de migration** — `schema_migrations.statements`
  enregistre le texte exécuté.
- **Ne PAS ouvrir la PR grants avant PR-B** (§7.C du rapport). Décision @thierry.
- **Ne PAS révoquer EXECUTE sur `is_workspace_member` / `is_workspace_editor` pour
  `authenticated`** — les policies RLS les invoquent dans ce rôle ; ce serait casser toute
  lecture applicative. `anon` seul, et **en nommant `public`** dans le revoke (voir §Annexes).
- **Ne PAS se servir du MCP Supabase pour vérifier la production** : il est branché sur le
  **premier** compte et ne voit qu'un projet du compte professionnel. Il rendrait un résultat faux avec l'air
  d'être vrai.
- **Ne PAS compter `Sourcery review — skipping` comme un vert.**
- **Ne PAS lancer un agent QA doté de Bash sur le répertoire depuis lequel on commite**
  sans appliquer les 3 règles ajoutées dans `CLAUDE.md` (chemins explicites,
  `git diff --cached --stat` avant chaque commit, mutations hors de l'arbre).
- **Ne PAS supposer qu'un test local prouve un privilège de l'hébergé** : `postgres` porte
  `rolbypassrls = t` en local. La version `SECURITY DEFINER` d'avril de la purge **aurait
  passé un test local avec un compteur correct**.

---

## Annexes

### Ce que la session a mesuré, et qui n'était qu'un raisonnement

`rls-flow-tester` a **fabriqué** le mode de panne rejeté par ADR-024 au lieu de le
supposer — rôle dédié sans `BYPASSRLS`, propriétaire d'une fonction de purge, 7 lignes
semées dans une table `FORCE RLS` :

```
DEFINER, propriétaire SANS bypassrls, appelée par service_role → rows_deleted = 0, survivants = 7
INVOKER,                              appelée par service_role → rows_deleted = 7, survivants = 0
```

Zéro ligne, **aucune erreur**, retour « succès ». La décision D4 repose désormais sur une
mesure reproductible.

Contrefactuel de l'ordre de D1 : supprimer le compte **avant** la pseudonymisation laisse
`203.0.113.77` et le user-agent d'une personne effacée, sans plus aucune clé de jointure,
sans erreur.

### La PR grants — mesures faites, prêtes à l'emploi

Quatre fonctions étaient exécutables par `anon` ; **impact réel nul sur les quatre**,
vérifié par appels réels via PostgREST. Les révocations sont **sûres, et prouvées** :

- `touch_updated_at()` — **mesuré le 27/07** : elle est branchée sur **6 tables**
  (`accounts`, `charges`, `commitments`, `users`, `workspace_settings`, `workspaces`).
  Test en trois temps sur la pile locale, en rôle `authenticated` avec claims JWT :
  `updated_at` remis à `2020-01-01`, UPDATE → bouge ; **revoke** ; UPDATE rejoué → **bouge
  encore** (`17:02:40.368922`). Le privilège `EXECUTE` d'une fonction de trigger est
  vérifié **à la création du trigger**, pas à chaque déclenchement. Le revoke ne casse
  rien. _(Grant local restauré après mesure pour rester aligné sur la prod.)_
- `assert_rls_coverage()` — **aucun appelant** dans le dépôt. Le commentaire « Callable
  from CI » de `20260417000002:36` décrit une intention jamais réalisée. Révocable pour
  `anon` **et** `authenticated`.

```sql
revoke execute on function public.is_workspace_member(uuid) from public, anon;
revoke execute on function public.is_workspace_editor(uuid) from public, anon;
-- `authenticated` DOIT RESTER : invoquées par les policies RLS dans ce rôle.
revoke execute on function public.assert_rls_coverage()      from public, anon, authenticated;
revoke execute on function public.touch_updated_at()         from public, anon, authenticated;
```

**Nommer `public` dans chaque revoke est impératif.** `20260528000001:70-71` a retiré le
grant **nominatif** à `anon` sur les deux helpers, mais le grant à `PUBLIC` (grantee 0) est
resté et `anon` en héritait : la migration de mai **n'a rien changé**. `aclexplode` le
montre — `16443` (anon) absent, `0` (PUBLIC) présent.

### Lecture production n° 4 — à faire passer à @thierry (lecture seule)

```sql
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_peut,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_peut
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by 3 desc, 4 desc, 1;
```

### Dettes nommées, non corrigées

- **Issue #278, art. 17** : `auth.audit_log_entries` garde l'**e-mail en clair** et l'IP,
  aucune FK vers `auth.users`, survit à l'effacement, illisible même par `service_role`.
  Une personne qui exerce son droit à l'effacement verra son compte supprimé et son adresse
  rester en base indéfiniment. **L'écart naît le jour où le cron s'arme — donc avec PR-B.**
- Lignes `audit_log` à `user_id: null` : portent une IP inatteignable par
  `.eq('user_id', …)`. Non attribuables, donc non nettoyables sans dommage collatéral.
- `status='completed'` / `completed_at` **inatteignables** (la ligne cascade avec le
  compte). La branche « Complétée » de l'écran de statut est du code mort.
- Art. 5(2) : après suppression, rien ne démontre qu'une demande précise a été honorée.
- `purge_audit_log_older_than_12_months()` réparée et **mesurée pour la première fois
  depuis avril** (6 lignes semées → rend 6 → 0 restante), mais **toujours sans appelant**.
  La rétention de 12 mois annoncée dans les 5 politiques n'est pas implémentée. PR-B l'arme.
- `src/lib/supabase/types.ts` généré par une autre version de CLI que celle installée.
- Le test de frontière de module (`deletion-core.test.ts`) lit les imports de premier
  niveau et **n'attrape pas un import dynamique** — prouvé par l'incident du §9.

### Planchers e2e — relevés dans les logs CI de `8dacbcc`

| Job                              | Plancher                  | Relevé                                |
| -------------------------------- | ------------------------- | ------------------------------------- |
| `Playwright E2E`                 | **215 passed** (inchangé) | 193 skipped (+18 : 6 cas × 3 projets) |
| `Playwright E2E (authenticated)` | **31 passed** (25 avant)  | +6, dans un seul projet               |

Mesurés en local **avant** le premier push, puis confirmés dans les logs des jobs. Inscrits
dans `CLAUDE.md`. Quarantaine `e2e/authenticated-specs.json` : 6 entrées, **inchangée**.

### Incident de process

`test-quality-auditor`, qui dispose de Bash, a muté `src/lib/gdpr/deletion-core.ts` pour
éprouver le test de frontière de module ; la ligne s'est retrouvée dans le commit
`43b8ec8` (retirée en `2a2d032`). Son fichier d'agent disait **déjà** « Never modify code ».
Répéter l'instruction ne protège de rien — trois règles versionnées dans `CLAUDE.md`
ferment le chemin vers l'historique.

`rls-flow-tester` a signalé le même problème vu de l'autre bout : la pile locale était
partagée, le HEAD bougeait sous lui, `audit_log` recevait des `auth.login` qu'il n'avait pas
produits. La règle « un agent par répertoire de travail » protège aussi **les mesures**.

### Liens

- PR : https://github.com/thierryvm/ankora/pull/282
- Rapport : `docs/prs/PR-3B-A-report.md`
- ADR : `docs/adr/ADR-024-file-de-suppression-de-compte.md` (amendé ce jour)
- Plan : `docs/plans/step-3b-deletion-queue.md`
- Registre conformité : `docs/compliance/2026-07-27-registre-defaillance-journal-audit.md` §6.5
- Issue art. 17 : #278
