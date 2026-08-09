# Roadmap — Ankora

**Réécrit le 26 juillet 2026.** Les 492 lignes précédentes empilaient des « Update »
datés d'avril à mai 2026 décrivant un plan (PR-D1…D8, Sprint Beta, jalon « v1.0
publique fin juin ») qui n'a plus cours : le programme actif est la **refonte v2 en
17 étapes**. Un document que personne ne peut suivre ne guide personne. L'historique
reste intégralement dans git (`git log -- docs/ROADMAP.md`).

---

## Programme actif — refonte v2

**Source de vérité** : [`docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md`](./superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md)
(17 étapes, périmètre et critères de sortie vérifiables par étape).

**Règle** : une étape n'est pas commencée tant que la précédente n'est pas terminée.

| Étape | Objet                                                                            | État            |
| ----- | -------------------------------------------------------------------------------- | --------------- |
| 1     | Dépenses — affordance d'édition, suppression confirmée, 3 bugs de date/frontière | ✅ #270         |
| 2     | Filet e2e réel en CI — les parcours connectés s'exécutent enfin                  | ✅ #271         |
| 3     | **RGPD P0 — la suppression de compte doit réellement supprimer**                 | 🔄 **en cours** |
| 4-17  | cf. spec                                                                         | 📋              |

### Étape 3 — détail (27 juillet 2026)

L'exécution des spécifications a révélé que le préalable n'était pas la file de
suppression, mais **ce sur quoi elle repose** : le journal d'audit n'enregistrait rien
depuis avril, et trois affirmations publiques étaient inexactes.

| Lot                                                                                   | État                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Le client `service_role` fuitait la session utilisateur (H3, #192)                    | ✅ #273                                                                          |
| Trois affirmations publiques inexactes (export « complet », base légale)              | ✅ #274                                                                          |
| ADR-023 — délai de grâce 30 → 14 jours (art. 12(3))                                   | ✅ #275                                                                          |
| Préflight : vérifier les comptes **actifs** Supabase/Vercel, pas les fichiers de lien | ✅ #276                                                                          |
| Agents QA : `silent-failure-auditor` + 3 agents corrigés                              | ✅ #277                                                                          |
| ADR-024 — conception de la file (reprise plutôt qu'atomicité) + plan d'exécution      | ✅ #279                                                                          |
| **PR-A** — la file, inerte : migration, orchestration extraite, UI, i18n, tests       | ⏳ **suivante**                                                                  |
| **PR-B** — l'armement : route de cron, `CRON_SECRET`, 30 → 14 jours appliqué          | 📋 après PR-A                                                                    |
| `auth.audit_log_entries` garde l'email et l'IP après effacement (art. 17)             | 📋 [#278](https://github.com/thierryvm/ankora/issues/278) — ADR + session dédiés |

**Verrou** : PR-B est bloquée tant que les trois lectures production du plan
([`docs/plans/step-3b-deletion-queue.md`](./plans/step-3b-deletion-queue.md)) ne sont pas
revenues. La troisième est un NO-GO : toute la conception repose sur un chemin PostgREST
`service_role` jamais re-vérifié en production depuis #273.

## Programme parallèle — refonte landing « Le relevé corrigé »

Chantier **parallèle** à la refonte v2 (surfaces disjointes : marketing public
uniquement), mené en worktree dédié sur exception de modèle @thierry du 8 août 2026. **Sources de vérité** :
[`prompts/PR-LAND-refonte-releve-corrige.md`](../prompts/PR-LAND-refonte-releve-corrige.md)
et [`docs/adr/ADR-039-portee-tokens-marketing-papier.md`](./adr/ADR-039-portee-tokens-marketing-papier.md)
(approuvé par la relecture cockpit).

| PR  | Objet                                                            | État        |
| --- | ---------------------------------------------------------------- | ----------- |
| —   | ADR-039 + plan d'exécution validé `plan-reviewer`                | ✅ #334     |
| L1  | Tokens papier + portée `.mkt-paper` + durcissement `blockAfter`  | ✅ #338     |
| L2  | Hero « relevé corrigé » + wrapper + parade flex + fixme iOS levé | ✅ #339     |
| L3  | Sections au ton « relevé » + 5ᵉ FAQ + migration waterfall + SEO  | 📋 suivante |

**L'ordre est contraint, pas constaté** — ces trois lignes ne sont pas
interchangeables. L1 pose la portée `.mkt-paper` et les six pigments ; L2 **et**
L3 la consomment, donc aucune des deux ne rend quoi que ce soit sans elle. L3
reprend en plus le hero introduit par L2 pour y migrer la waterfall. Attaquer L3
seule ne donnerait ni le papier ni la surface sur laquelle se poser.

Plancher e2e public relevé par L2 : **228 → 231** (levée BUG-iOS-HERO-OVERFLOW,
mesurée par projet, cf. [`docs/reference/planchers-e2e-historique.md`](./reference/planchers-e2e-historique.md)).
Rapports : [`docs/prs/PR-L1-report.md`](./prs/PR-L1-report.md),
[`docs/prs/PR-L2-report.md`](./prs/PR-L2-report.md).

### Vision produit

Inchangée et hors de ce fichier : [`docs/NORTH_STAR.md`](./NORTH_STAR.md) (vision,
jalons, piliers, contraintes non négociables). Les huit sections obligatoires du
dashboard et le positionnement FSMA sont rappelés dans [`CLAUDE.md`](../CLAUDE.md).

---

## Contraintes transverses

**Budget 0 €** — aucune dépendance payante en production tant qu'Ankora n'a pas de
revenus. Services autorisés : Vercel Hobby, Supabase Free, Upstash Free, GitHub
Actions (dépôt public → minutes gratuites). Introduire une dépendance payante exige
une validation @thierry explicite.

**Qualité** — quatre checks obligatoires sur `main` depuis le 26 juillet 2026 :
`Lint + Typecheck + Unit Tests`, `Security audit`, `Playwright E2E`,
`Playwright E2E (authenticated)`. Le nombre de cas e2e exécutés ne descend jamais
(planchers et procédure de mesure dans [`CLAUDE.md`](../CLAUDE.md)).

---

## Dettes ouvertes

Chacune mérite sa propre PR ; aucune n'est un blocage de l'étape en cours.

### THI-206 — GRANT explicite dans le template de migration

**Plus urgente qu'annoncée.** Supabase retire l'exposition automatique des tables au
**30 octobre 2026** ; les migrations d'Ankora reposent encore sur les grants
implicites.

Échéance ferme, mais **ce n'est PAS la cause du `permission denied for table audit_log`**
observé le 26 juillet. Cause **mesurée** le jour même : `createAdminClient()` passait la
clé service_role **et** un adaptateur qui rendait les cookies de l'utilisateur ; en
présence d'une session, le jeton utilisateur écrasait la clé et le client retombait en
rôle `authenticated`, à qui `audit_log` est interdit. C'était H3 / issue #192, connue
depuis le 28 mai et jamais mesurée. Corrigé par `createServiceRoleClient()`
(`src/lib/supabase/admin.ts`) — **surtout pas** par un GRANT sur `audit_log`, qui aurait
ouvert le journal d'audit en écriture à tout utilisateur connecté.

Convention : [`docs/CONVENTIONS.md`](./CONVENTIONS.md).

### Six specs e2e décrivent un dashboard supprimé

En quarantaine motivée dans `e2e/authenticated-specs.json`, imprimée à chaque run.
Elles visent le cockpit d'avant THI-327. La liste ne doit que **rétrécir**.

### `CardTitle` rend une `<div>`

Les titres de section du cockpit ne portent donc aucun rôle `heading` — défaut WCAG
sur la page la plus importante de l'app, et cause de trois des six specs
quarantinées. Primitive partagée : PR dédiée + `ui-auditor`.

### ~~Angle mort du préflight comptes~~ — comblé le 27 juillet 2026 (#276)

`npm run preflight` lisait deux fichiers sur disque et appelait ça un compte vérifié ; un
fichier de lien peut nommer le bon projet pendant que la CLI est authentifiée ailleurs. Il
interroge désormais chaque CLI sur ce qu'elle **voit réellement** : Supabase doit renvoyer
`ankora-prod` marqué `linked`, et `vercel whoami` doit renvoyer `thierryvm`. Les deux sont
des appels réseau, tous deux sautés sous `--local` pour que le hook de pre-commit reste
hors ligne.

---

## Conventions de travail

- Ordre d'exécution, gouvernance et Definition of DONE : [`CLAUDE.md`](../CLAUDE.md)
- Décisions d'architecture : [`docs/adr/`](./adr/)
- Rapports de PR : [`docs/prs/`](./prs/)
- Handoffs de session : [`docs/handoffs/`](./handoffs/)
- Runbooks (e2e, migrations, Upstash, iPhone) : [`docs/runbooks/`](./runbooks/)
