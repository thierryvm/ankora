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

## Programme en cours — le journal des mouvements

**Sources de vérité** : [`docs/adr/ADR-038-journal-des-mouvements.md`](./adr/ADR-038-journal-des-mouvements.md)
(accepté le 5 août 2026 par @thierry) **et son amendement**
[`docs/adr/ADR-040-ordre-execution-du-journal.md`](./adr/ADR-040-ordre-execution-du-journal.md)
(10 août 2026), qui fixe l'ordre réel. **Lire les deux, ADR-040 en premier.**

**Pourquoi cette section existe** : ADR-038 porte la décision de fond la plus lourde du
produit — les soldes cessent d'être saisis, `workspaces.monthly_income` disparaît, les
rentrées deviennent des lignes datées — et **n'était tracé dans aucun document qui pilote
quoi et quand**. `grep ADR-038 docs/ROADMAP.md` ne rendait rien. Résultat mesuré : une
session entière du 10 août a re-dérivé une décision déjà prise cinq jours plus tôt. Une
décision qu'on ne peut pas trouver n'existe pas.

| PR  | Objet                                                                              | État                                        |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| —   | ADR-040 — inversion de l'ordre, corrections de schéma, D10/D11/D12                 | ✅ accepté le 2026-08-10                    |
| —   | ADR-041 — provisionner n'est pas payer : la capacité de régler devient une donnée  | 🟡 proposé le 2026-08-10, s'exécute dans J2 |
| J1  | D3 — attribution figée sur les deux tables de paiement + `commitments.paid_from`   | ✅ livré le 2026-08-10 (#363)               |
| J1b | La migration `contract` — `set not null` sur les deux colonnes                     | ⏳ **suivante**, cf. ci-dessous             |
| J2  | D1 — table de mouvements, RLS, export art. 20 (+ 4 tables absentes), **+ ADR-041** | 📋 périmètre élargi, cf. ci-dessous         |
| J3  | D2 — rentrées datées, suppression de `monthly_income`, sémantique d'`incomplet`    | 📋                                          |
| J4  | D6 — dérivation des soldes, suppression de `savings_balance`, ancienneté           | 📋                                          |
| J5  | D4 + D8 — ventilation contrôlée et arbitrage mensuel                               | 📋                                          |
| J6  | D0 — clé de substitution `accounts.id` + backfill                                  | 📋 **en dernier**, cf. ADR-040 E1           |

**L'ordre a changé le 10 août** : ADR-038 plaçait D0 en tête. ADR-040 le renvoie en fin de
programme, parce que D0 sert le découplage des rôles de comptes — qu'ADR-038 met lui-même
hors périmètre — et qu'aucun des cinq autres lots n'en dépend. Le motif n'est pas le risque
de la migration : mesuré, il est négligeable (une quinzaine de lignes, zéro clé étrangère
entrante). Le motif est que la valeur visible passe de la 5ᵉ PR à la 1ʳᵉ.

### J1b — ce qui reste à faire, et la condition d'entrée

J1 est livré en motif **expand / contract**, et seule la moitié `expand` est en production :
les deux colonnes `paid_from_account_type` sont **nullables**. La seconde migration
(`set not null`) n'existe volontairement dans aucun arbre — tant qu'elle y serait,
`supabase db push` l'appliquerait avec la première, avant que le code sache remplir la
colonne, et cocher une facture échouerait en production.

**La condition d'entrée est une mesure, pas un délai.** Avant d'écrire la migration
`contract`, vérifier que le code déployé écrit bien la colonne :

```sql
select count(*) filter (where paid_from_account_type is null) as a_reprendre,
       count(*)                                               as total
  from public.charge_payments;
```

Tant qu'un pointage récent laisse `NULL`, le code n'est pas en place et `contract` casserait
la production. La migration `contract` re-remplit d'abord les lignes de la fenêtre, **puis**
pose le `NOT NULL`. Son retour arrière est `alter column drop not null` — **jamais**
`drop column`.

**Deux dettes ouvertes par J1, à traiter avant J4** (leur ordre est dans les tickets) :
[#361](https://github.com/thierryvm/ankora/issues/361) — dépointer supprime physiquement la
ligne, ce qui videra l'historique dont D6 dépend ; et
[#362](https://github.com/thierryvm/ankora/issues/362) — « payé depuis » n'est exposé par
aucun écran, alors qu'à partir de D6 une attribution fausse produit deux soldes faux.

La troisième, [#366](https://github.com/thierryvm/ankora/issues/366), est **tranchée** par
[ADR-041](./adr/ADR-041-provisionner-nest-pas-payer.md) et s'exécute en J2.

### J2 — pourquoi son périmètre a grossi le 10 août

ADR-038 D1 posait déjà `from_account_id` / `to_account_id` : le journal sait représenter un
virement interne. Ce qu'aucun ADR ne disait, c'est **quels comptes ont le droit de payer**.

Vérifié le 2026-08-10 (sources datées dans ADR-041) : un compte d'épargne fiscalement
avantagé n'est **pas** un compte de paiement, et c'est vrai en Belgique par arrêté royal, en
France pour le Livret A et le LDDS, en Allemagne par le mécanisme du `Referenzkonto`. Mais
ce n'est **pas universel** — les sous-comptes N26 et bunq domicilient et portent une carte,
et N26 le propose en Belgique. La capacité de régler ne se déduit donc ni du rôle du compte,
ni de la banque : **elle se déclare**.

Ce qu'ADR-041 ajoute à J2 : deux colonnes sur `accounts` (`settles_directly` + compte de
règlement) avec leur contrainte, le renommage `paid_from` → `provisioned_from`, l'écriture à
deux mouvements quand l'enveloppe ne règle pas directement, et la **ré-attribution des lignes
de paiement écrites par J1** — dont le backfill a posé le compte de provisionnement là où le
compte payeur est attendu. Rien ne lit encore cette colonne ; J4 la lirait.

Si J2 dépasse ce qu'une revue humaine tient d'une traite, le point de coupe est le schéma et
le réglage d'un côté, l'écriture à deux mouvements de l'autre — dans cet ordre.

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
