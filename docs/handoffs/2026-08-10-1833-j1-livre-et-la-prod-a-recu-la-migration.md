# Handoff — 10 août 2026, 22h30 — J1 livré, et la production a reçu la migration

**Session** : CC Ankora (Opus 5). Suite directe du handoff de 19h30, après compaction.
Démarrée sur « exécute le plan J1 », finie sur une migration en production et une PR mergée.

`main` = **`7eaa9f6`** · **0 PR ouverte** · 13 tickets · production à jour, schéma vérifié.

---

## 1. Ce qui est en production, et ce qui ne l'est pas

**En production depuis ce soir**, après GO explicite de @thierry et préflight vert relancé
juste avant :

- `20260810000001_d3_attribution_paiements_expand.sql` — les colonnes, le backfill, les
  clés étrangères, le trigger de gel.
- `20260729000001_deprecate_reste_a_vivre.sql` — locale depuis le 29 juillet, **jamais
  poussée**, découverte par `supabase migration list --linked`. Bénigne (elle relâche un
  `not null` sur une colonne que plus aucun code ne lit), mais dite avant, pas après.

**PAS en production, et c'est le sujet de la suite** : la migration `contract`
(`set not null`). Elle n'existe dans aucun arbre. Condition d'entrée et requête de
vérification : `docs/ROADMAP.md`, §J1b.

## 2. Trois corrections à mes propres affirmations

Consignées parce que chacune changeait ce qu'un lecteur aurait cru.

**« `db push` emportera la migration du 29 juillet, aucun moyen de l'éviter. » Faux.**
Mesuré au moment de pousser : elle est datée AVANT la dernière migration appliquée en
production, donc la CLI **refuse tout et n'applique rien**, en réclamant `--include-all`.
Le garde-fou contre l'insertion hors ordre existe ; l'emporter est délibéré.

**« Rendre `paidFrom` requis produira 10 erreurs `tsc`. » Il y en a eu 4.** Le plan impose
de chercher plutôt que d'ajuster l'attendu. Cause trouvée : les six littéraux « manquants »
sont des `{ ...carLoan, … }` qui héritent du champ. J'avais compté des premières lignes de
`grep` au lieu de lire les corps. Aucun producteur n'échappait au compilateur.

**« `on delete cascade` est le bon choix, le choix est binaire. » Il ne l'était pas.**
`no action deferrable initially deferred` donne la propriété RGPD **sans** rendre destructif
l'effacement d'une ligne de `accounts`. Les deux propriétés sont mesurées.

## 3. Les deux agents QA ont trouvé du vrai, et il fallait les écouter

**`test-quality-auditor`** : `charge-conversion.ts` — la copie de `paid_from`, c'est-à-dire
le correctif le plus sournois de toute la PR — n'était **couverte nulle part**. Ligne
retirée, l'insert omettait la colonne, le `default 'principal'` s'appliquait, **rien ne
rougissait**. Test écrit, et **sa sensibilité mesurée** : ligne retirée → 2 cas sur 3
échouent.

Il a aussi montré que le cas e2e du geste groupé ne semait que de l'`epargne` (une constante
codée en dur l'aurait passé), et que le test d'exhaustivité de la bijection recopiait ses
listes à la main — donc ne pouvait pas voir un quatrième compte ajouté d'un seul côté. Les
deux sont corrigés.

**`rls-flow-tester`** : `e2e/helpers/seed.ts` avalait l'erreur de suppression, alors que
c'est le **seul endroit du dépôt** qui exécute la chaîne complète de suppression de compte —
et depuis J1 elle traverse une clé étrangère de plus. Il échoue désormais bruyamment, et le
plancher n'a pas bougé : la cascade fonctionne pour toutes les specs.

Il a aussi obtenu un garde-fou de plus : la réparation des comptes est **vérifiée** au lieu
d'être supposée. `seed_default_accounts` est `security definer` et écrit dans une table en
`force row level security` sans policy INSERT ; si le rôle propriétaire hébergé ne portait
pas `BYPASSRLS`, la boucle sèmerait zéro ligne **sans erreur**. Le bloc est passé en
production sans se déclencher — l'inférence est devenue une mesure.

**Limite à connaître** : l'outil Bash était cassé pour les deux agents (`expo: command not
found` dans le préambule du shell, sur toute commande, `echo` compris). Leurs constats sont
des lectures de code, jamais des mesures. `rls-flow-tester` l'a écrit lui-même et a refusé
de rendre PASS sur ce qu'il n'avait pas exécuté — c'est la bonne posture, et c'est pour ça
que les mesures ont été reprises à la main ensuite.

## 4. Chiffres relevés, pas déduits

| Job                              | Mesuré en CI sur `191120e` | Plancher           |
| -------------------------------- | -------------------------- | ------------------ |
| Lint + Typecheck + Tests         | 165 fichiers, 2226 tests   | —                  |
| `Playwright E2E`                 | **241 passed** / 206 skip  | 241 — **inchangé** |
| `Playwright E2E (authenticated)` | **45 passed** / 5 skip     | **41 → 45**        |

Aucune ligne `failed`, aucune ligne `flaky`. Le delta local (+4, mesuré dans les deux sens
sur la même machine) et le delta CI concordent exactement.

**Sourcery : muet PAR ÉPUISEMENT DE QUOTA hebdomadaire**, pas par approbation. Critère
satisfait **à vide**, et c'est dit — un silence par absence de lecture n'est pas un silence.

## 5. Le harnais e2e local exigeait une réparation, et elle est réutilisable

`.env.local` porte une URL Upstash **factice**. En build de production `rateLimit()` échoue
FERMÉ, donc la toute première connexion renvoie « Service temporairement indisponible » — ce
qui se lit comme un bug applicatif alors que c'est le harnais. La CI ne rencontre jamais ça
parce qu'elle monte `serverless-redis-http` devant un Redis nu.

Reproduire ces deux conteneurs en local est **la condition** pour qu'un cas authentifié qui
se connecte prouve quoi que ce soit. Détail dans
[`docs/reference/planchers-e2e-historique.md`](../reference/planchers-e2e-historique.md).

Deuxième piège du même ordre : `npm run e2e:auth` cible ce que pointe `.env.local`,
c'est-à-dire la **production**. Il ne convient pas pour valider une migration non encore
poussée — il faut rejouer le job CI contre la pile locale.

## 6. Reprise — dans cet ordre

1. **Vérifier que le code déployé écrit la colonne** (requête dans `docs/ROADMAP.md` §J1b).
   Tant qu'un pointage récent laisse `NULL`, la migration `contract` casserait la production.
2. **PR J1b** : la migration `contract`, écrite à ce moment-là et pas avant.
3. Puis **J2** (D1 — la table de mouvements).

**Avant J4, et pas après** : [#361](https://github.com/thierryvm/ankora/issues/361) — le
dépointage supprime physiquement la ligne, ce qui videra l'historique dont D6 dépend ; et
[#362](https://github.com/thierryvm/ankora/issues/362) — « payé depuis » n'est exposé par
aucun écran, alors qu'à partir de D6 une attribution fausse produit **deux** soldes faux.

## 7. Trois remarques d'audit délibérément NON traitées

Elles portent sur du préexistant, relèvent d'une PR de sécurité dédiée, et **deux d'entre
elles ne s'écrivent pas dans un dépôt public avant correction** (§« Ce dépôt est PUBLIC »
de `CLAUDE.md`). Elles ont été remontées à @thierry hors dépôt, en conversation.

## 8. État de l'environnement local

Supabase local debout (conteneurs `*_ankora`, API `127.0.0.1:54421`), migration J1 appliquée.
Deux conteneurs jetables `ankora-e2e-redis` / `ankora-e2e-srh` sur le réseau
`ankora-e2e-net`, port 8079 — à supprimer quand ils ne servent plus.

**Rappel de sécurité toujours actif** : les connecteurs MCP Supabase et Vercel de claude.ai
sont branchés sur les comptes **professionnels**. Interdits en session Ankora, lecture
comprise. Tout passe par la CLI, préfixée `work perso -NoCd;`, avec `npm run preflight` → GO
avant chaque action sortante — ce qui a été fait avant la poussée en production ET avant le
merge, `gh pr merge` ne déclenchant aucun hook git.
