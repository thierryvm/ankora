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
| 3     | **RGPD P0 — la suppression de compte doit réellement supprimer**                 | ⏳ **suivante** |
| 4-17  | cf. spec                                                                         | 📋              |

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

### Angle mort du préflight comptes

`npm run preflight` valide le fichier de lien Supabase, pas le compte que le CLI
utilise réellement. Infrastructure de garde-fous → PR dédiée, jamais dans une PR de
feature.

---

## Conventions de travail

- Ordre d'exécution, gouvernance et Definition of DONE : [`CLAUDE.md`](../CLAUDE.md)
- Décisions d'architecture : [`docs/adr/`](./adr/)
- Rapports de PR : [`docs/prs/`](./prs/)
- Handoffs de session : [`docs/handoffs/`](./handoffs/)
- Runbooks (e2e, migrations, Upstash, iPhone) : [`docs/runbooks/`](./runbooks/)
