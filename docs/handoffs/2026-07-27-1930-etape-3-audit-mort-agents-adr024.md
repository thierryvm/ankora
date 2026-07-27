# Handoff — 27 juillet 2026, 19h30 · Étape 3 : le journal mort, les agents complices, et deux conceptions rejetées

**Agent** : @cc-ankora (Opus 5)
**Branches mergées** : `fix/h3-service-role-client` (#273), `fix/claims-publiques` (#274),
`docs/adr-023` (#275), `ci/preflight-comptes-actifs` (#276),
`chore/agents-silent-failure-coverage` (#277), `docs/adr-024-deletion-queue` (#279),
`docs/roadmap-etape-3-etat-reel` (#280)
**`main`** : `72f9fa6`

---

## 1. Ce qui a été livré

L'étape 3 devait brancher un cron sur la file de suppression de compte. **Aucune ligne de
ce cron n'existe encore.** Ce qui a été livré, c'est ce sur quoi il devait reposer — et qui
ne tenait pas.

**#273 — le journal d'audit n'enregistrait rien depuis le 16 avril.** `createAdminClient()`
associait la clé `service_role` à un adaptateur de cookies `@supabase/ssr` : en présence
d'une session, le SDK envoyait le JWT de l'utilisateur à la place de la clé, et le client
retombait en rôle `authenticated`, à qui `audit_log` est révoquée. Trois mois d'écritures
refusées en silence — `logAuditEvent()` avale ses propres erreurs par conception. Client
reconstruit et **scellé** par l'option `accessToken` (l'espace `.auth` devient
inaccessible), `error_code` ajouté au journal d'échec, spec e2e de non-régression prouvée
rouge-avant / verte-après.

**#274 — trois affirmations publiques inexactes**, corrigées dans les 5 locales : l'export
était annoncé « complet » (7 tables sur 14 — ni les soldes, ni les dettes), et la base
légale du journal d'audit était déclarée « obligation légale » alors qu'aucun texte ne
l'impose (intérêt légitime, art. 6(1)(f)).

**#275 — ADR-023** : délai de grâce 30 → 14 jours. À 30 jours, l'effacement tombait au bord
exact du délai légal d'un mois (art. 12(3)) : un cron en échec, et on est hors délai.

**#276 — le préflight comptes vérifie enfin les comptes actifs.** Il lisait deux fichiers
sur disque ; un fichier de lien peut nommer le bon projet pendant que la CLI est
authentifiée ailleurs. Il interroge maintenant chaque CLI (`supabase projects list`,
`vercel whoami`).

**#277 — un agent QA créé, trois corrigés.** Cf. §3.

**#279 — ADR-024 + plan d'exécution** de l'étape 3b. Cf. §4.

**#280 — ROADMAP remis à l'état réel** : l'étape 3 était annoncée « suivante » alors
qu'elle tourne depuis deux jours ; une dette fermée le matin y figurait encore.

## 2. Chiffres

|                                                      | Avant                   | Après                             |
| ---------------------------------------------------- | ----------------------- | --------------------------------- |
| Types d'événements présents en prod dans `audit_log` | 4 (tous pré-session)    | correctif livré, **à re-mesurer** |
| Tables couvertes par l'export RGPD                   | 7 / 14, dit « complet » | 7 / 14, **dit honnêtement**       |
| Agents QA                                            | 16                      | **17**                            |
| Plan 3b rejeté par `plan-reviewer`                   | —                       | **3 tours**                       |
| Sites annonçant « 30 jours » (hors i18n)             | annoncés 2              | **mesurés 8**, dont 2 publics     |

## 3. Les agents validaient les bugs qu'ils devaient attraper

La checklist de `gdpr-compliance-auditor` affirmait elle-même
« `exportUserData()` returns a **complete** JSON bundle » et « `executeDeletion()` **wipes** ».
Les deux étaient faux. **Il aurait approuvé les deux bugs corrigés le jour même.**

Cause commune : les 16 agents posaient tous la même question sous des angles différents —
_est-ce présent ?_ Aucun ne demandait _est-ce que ça marche, et le saurait-on si ça
s'arrêtait ?_. Trois incidents en trois mois sont sortis par ce trou, tous **verts**
pendant qu'ils échouaient : H3 (3 mois), la fonction de purge `SECURITY DEFINER` sur table
`FORCE RLS` (jamais appelée depuis avril), et le job e2e à 173 specs sautées.

Réponse : **un** agent créé (`silent-failure-auditor`, Opus) plutôt qu'un par symptôme,
et trois corrigés — `rls-flow-tester` gagne le **sens privilégié** (l'écriture légitime
atterrit-elle vraiment ?), `security-auditor` gagne les endpoints non authentifiés et le
principe « la sous-permission est une vulnérabilité », `gdpr-compliance-auditor` gagne un
chapitre « déclaré vs implémenté ».

## 4. Décisions verrouillées — ADR-024

**Deux conceptions écrites puis abandonnées, chacune tuée par une mesure.** Elles sont
consignées dans l'ADR parce que rien n'invite plus sûrement à les réécrire que leur
absence du dossier.

1. **Fonction `SECURITY DEFINER` atomique — rejetée.** `FORCE ROW LEVEL SECURITY`
   s'applique **au propriétaire de la table**. Possédée par `postgres`, elle écrirait
   **zéro ligne sans erreur** si le `postgres` hébergé n'a pas `BYPASSRLS` — invérifiable.
   Compte supprimé, IP et user-agent conservés, plus aucune clé de jointure.
2. **La même en `SECURITY INVOKER` appelée par `service_role` — rejetée aussi.** Mesuré :
   `service_role` n'a **aucun privilège** sur `auth.users` ni `auth.audit_log_entries`.

→ **L'atomicité SQL de bout en bout est impossible par toute conception** : c'est la
frontière entre PostgREST et GoTrue, pas une limite de notre code.

**La garantie devient l'idempotence et la reprise.** Une seule instruction est
irréversible ; la précéder d'un nettoyage rejouable suffit, et **aucun privilège nouveau
n'est demandé** — c'est ce qui rend cette conception défendable.

Autres décisions : verrou anti-double-suppression sur une colonne `claimed_at` (jamais
`requested_at`) ; `deletion_self_insert` **supprimée** plutôt que durcie (aucune insertion
client n'existe) ; orchestration extraite de l'enveloppe `server-only` pour que le chemin
destructeur soit enfin testable de bout en bout ; livraison en **deux PR** (A inerte,
B armement).

## 5. Erreurs commises, et ce qu'elles ont appris

- **Un verrou qui ne mesurait rien.** Ma reprise des lignes bloquées testait `requested_at`
  — la date de la _demande_. Une ligne n'étant traitable que 14 jours plus tard, la
  condition était **toujours vraie** : chaque exécution remettait en file les lignes qu'une
  autre traitait. **Le même compte supprimé deux fois.** Trouvé par la revue, corrigé, et
  le comportement voulu **mesuré** avant d'y croire.
- **« Prouvé en production » alors que ça ne l'était pas.** La mesure était locale ; la
  vérification prod n'a jamais été refaite après #273. Une inférence habillée en mesure —
  exactement ce que ce chantier corrige ailleurs. Devenu un NO-GO écrit.
- **Un inventaire annoncé exhaustif qui ne l'était pas.** 2 sites « 30 jours » annoncés,
  8 réels, dont `README.md` et `SECURITY.md` — dépôt public.
- **Une réinterprétation complaisante** : ADR-023 annonce « sept chaînes », il y en a cinq.
  J'avais écrit « imprécise, pas fausse ». Elle est fausse ; corrigé dans ADR-024.
- **`delete from auth.users` n'efface pas tout le graphe.** Compter les clés étrangères rend
  aveugle à ce qui n'en a pas — cf. §6.

## 6. Écart art. 17 mesuré — issue #278

`auth.audit_log_entries` conserve **l'email en clair** (`payload.actor_username`,
`traits.user_email`) **et l'adresse IP**, n'a **aucune clé étrangère** vers `auth.users`
(18 FK dans le schéma `auth`, aucune depuis cette table), et **survit intégralement** à la
suppression du compte. `service_role` ne peut même pas la lire.

Aucune rétention : ni GoTrue ni Supabase ne la purgent. Hors de portée du code applicatif —
la corriger demande d'atteindre le schéma `auth`, donc un ADR et une session dédiés.
**L'écart devient effectif le jour où le cron s'arme, pas avant.**

## 7. Ce qui reste à faire

**Bloqué par doctrine** : le code de 3b ne peut pas partir dans la session qui a produit
sa décision de schéma (banned list #2). **Reprendre en session fraîche**, plan prêt dans
[`docs/plans/step-3b-deletion-queue.md`](../plans/step-3b-deletion-queue.md).

**PR-A** (inerte) : migration (statut `processing`, `claimed_at`, index unique partiel,
`claim_pending_deletions`, deux politiques, purge en `INVOKER`), `deletion-core.ts`
extrait, annulation honnête, branche `processing` de l'UI, 3 clés i18n × 5, tests.
Attention : régénérer `src/lib/supabase/types.ts` **après** le push de migration, mettre à
jour `e2e/authenticated-specs.json` dans le même commit, et refondre les tests existants
de `deletion.test.ts` (un meurt avec la suppression du `delete from workspaces`).

**PR-B** (armement) : route de cron, `vercel.json`, `CRON_SECRET` optionnel, 30 → 14 jours
sur **8 sites + 25 chaînes**, vérification d'armement post-merge.

**Reste ouvert** : alerte sur échec d'écriture d'audit (art. 32(1)(d)),
`gdpr-compliance-auditor` sur l'app entière (jamais fait), advisors Supabase (0028, 0029),
export élargi aux 14 tables, Zod sur `recordCookieConsentAction`, `CardTitle` sans rôle
heading, 6 specs e2e en quarantaine, registre art. 30 + DPA, THI-206 (échéance 30 octobre).

## 8. Ce qui revient à @thierry

**Trois lectures SQL sur `ankora-prod`, aucune écriture.** Rappel : **deuxième** compte
Supabase ; le signe distinctif est la colonne `event_type` sur `audit_log`.

```sql
-- 1. Un workspace a-t-il plus d'un membre ? (rayon de destruction)
select workspace_id, count(*) from public.workspace_members group by 1 having count(*) > 1;

-- 2. Des demandes `pending` en double ? (verrou du push de PR-A)
select user_id, count(*) from public.deletion_requests
 where status='pending' group by 1 having count(*) > 1;

-- 3. Le journal d'audit enregistre-t-il depuis #273 ?
select event_type, count(*) from public.audit_log group by 1 order by 2 desc;
```

1 et 2 doivent renvoyer **zéro ligne**. **La 3 est un NO-GO de PR-B** si `auth.login` et
les `gdpr.*` restent absents après le 27 juillet.

**À trancher** : issue #278 (art. 17), et la réserve de fond signalée en #277 — j'écris les
agents qui auditent mon propre travail. Les incidents cités sont mesurés, mais le choix de
_ce qu'on cherche_ reste le mien.

**Note DoD** : Sourcery n'a relu **aucune** des PR de cet après-midi — plafond hebdomadaire
de 500 000 caractères atteint. Absence de relecture, pas silence approbateur. Sur du
markdown le coût est nul ; sur PR-A et PR-B, il faudra soit attendre le reset, soit
l'assumer par écrit.
