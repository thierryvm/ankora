# Handoff — 10 août 2026, 20 h 23 — Provisionner n'est pas payer, et J1b est en production

**Session** : CC Ankora (Opus 5). Suite directe du handoff de 18 h 33, après compaction.
Démarrée sur une question de @thierry — « est-ce que d'autres banques permettent de payer
depuis l'épargne ? » — finie sur un ADR accepté, une migration en production et deux PR
mergées.

`main` = **`f836d83`** · **0 PR ouverte** · production à jour, schéma vérifié.

---

## 1. Le régime de travail a changé

@thierry a levé le verrou « GO explicite avant chaque action sortante » :

> « Pars du principe que tu as carte blanche, peu importe l'action que tu dois faire. En
> gardant évidemment cette approche de garde-fou, de vérification, de validation, de test. »

**Ce qui change** : `supabase db push`, `gh pr merge`, les migrations de production ne
demandent plus de feu vert au cas par cas. Décider, exécuter, rapporter — dans cet ordre.

**Ce qui ne change pas**, et il l'a redit dans la même phrase : préflight avant chaque action
sortante, preuve dans les deux sens, connecteurs MCP Supabase/Vercel toujours interdits, et
la liste bannie reste bannie (force-push `main`, passage en public, dépendance payante, fuite
de secret). La carte blanche porte sur le travail normal, pas sur celles-là.

## 2. ADR-041 — la question a renversé sa propre prémisse

La question portait sur un cas d'usage : l'épargne ne peut pas payer directement, est-ce
une limitation d'un établissement ? **Non — c'est la loi, et c'est la norme européenne.**

| Dispositif                     | Peut payer ? | Fondement                                                               |
| ------------------------------ | ------------ | ----------------------------------------------------------------------- |
| Épargne réglementée belge      | **Non**      | AR du 27/08/1993 art. 2 — liste **fermée** d'opérations                 |
| Livret A / LDDS (France)       | **Non**      | ni carte, ni prélèvement automatique                                    |
| Tagesgeldkonto (Allemagne)     | **Non**      | `Referenzkonto` obligatoire, retrait vers lui seul                      |
| Revolut Instant Access Savings | **Non**      | verbatim : « is not a payment account »                                 |
| **N26 Spaces avec IBAN**       | **Oui**      | domiciliations + carte liée — **disponible en Belgique**, plans payants |
| **bunq Money Pockets**         | **Oui**      | 25 poches, IBAN chacune, carte rattachable                              |
| **Monzo Bills Pots**           | apparence    | déplace de la poche vers le principal, **puis** paie                    |

**Monzo tranche le fond** : il affiche un geste et exécute deux mouvements — exactement le
geste décrit par @thierry, automatisé par la banque. Donc le modèle à deux legs est le cas
**général**, dont « payer directement » est l'effondrement.

Décision (F1–F5) : `paid_from` = l'enveloppe qui provisionne, `paid_from_account_type` = le
compte payeur, les deux peuvent être égaux ; la capacité de régler devient une **donnée
déclarée par compte** (`settles_directly` + compte de règlement), **jamais** une base de
banques — fausse en un mois, elle exigerait de collecter la banque de l'utilisateur
(minimisation art. 5(1)(c)) et répond à la mauvaise question.

Tranche [#366](https://github.com/thierryvm/ankora/issues/366). S'exécute **dans J2**, pas en
PR dédiée. Détail : [`docs/adr/ADR-041-provisionner-nest-pas-payer.md`](../adr/ADR-041-provisionner-nest-pas-payer.md).

## 3. Une dette créée par J1, nommée avant d'être découverte

Le backfill de J1 a posé `paid_from_account_type` égal au compte de **provisionnement**. Pour
toute facture provisionnée par un compte qui ne règle pas directement, cette valeur désigne
donc le mauvais compte sous F1.

**Rien ne la lit aujourd'hui ; J4 la lirait.** J2 doit ré-attribuer ces lignes. C'est écrit
dans l'ADR, dans le ROADMAP et dans les commentaires de colonne en base — trois endroits,
parce que celui qui lira « compte qui a payé » le croira.

## 4. J1b est en production

`20260810000002_d3_attribution_paiements_contract.sql` appliquée après préflight GO et
dry-run vérifié (**une seule** migration à appliquer, pas de `--include-all`).

**Le gain n'est pas le `NOT NULL`.** Les clés étrangères composites de J1 sont en
`MATCH SIMPLE` : une ligne dont une colonne est nulle **n'était pas vérifiée du tout**. Plus
aucune ligne n'étant nulle, la clé étrangère cesse d'être une promesse.

### Prouvé dans les deux sens, jamais dans un fichier suivi par git

| Ce qu'il fallait prouver             | Instrument                                                                                           | Résultat                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Le garde-fou **refuse**              | état pathologique fabriqué dans la base **locale** (une charge en `paid_from` hors des deux valeurs) | `ERROR: J1b : 1 paiement(s)…` — migration avortée    |
| **Aucune moitié** ne passe au refus  | `pg_attribute.attnotnull` après l'échec                                                              | `f` / `f`                                            |
| Le `NOT NULL` **mord**               | `update … = null`, trigger désactivé, transaction annulée                                            | `23502`                                              |
| **Zéro résidu**                      | triggers, contrainte, comptes relus                                                                  | `O`/`O`, contrainte présente, 0 nulle                |
| Le typecheck n'est pas un angle mort | champ retiré de `charge-payments.ts:126`                                                             | `TS2769 — … is missing but required`                 |
| La production applique bien          | spec OpenAPI de PostgREST                                                                            | `paid_from_account_type` **requis** sur les 2 tables |

### Chiffres CI, relevés sur le run de la PR (`31417500919`)

| Job                              | Mesuré                    | Plancher       |
| -------------------------------- | ------------------------- | -------------- |
| Lint + Typecheck + Unit Tests    | 165 fichiers, 2226 tests  | —              |
| `Playwright E2E`                 | **241 passed** / 206 skip | 241 — inchangé |
| `Playwright E2E (authenticated)` | **45 passed** / 5 skip    | 45 — inchangé  |

Zéro `failed`, zéro `flaky`. **Sourcery a réellement tourné** (1 min 18) et approuvé sans un
seul commentaire — contrairement à J1 où le silence venait d'un quota épuisé. La différence
est écrite parce qu'elle change ce que le critère vaut.

## 5. Un point de méthode qu'il faut connaître pour relire la PR #368

Le tableau « condition d'entrée » de la PR cite un pointage à `16 h 41` portant
`income_bills`, postérieur au déploiement de 16 h 16 — la preuve mesurée que le code déployé
remplit la colonne.

**Cette ligne a été dépointée par @thierry après avoir servi** : elle marquait payée une
facture du 16 août, cochée le 10 pour les besoins de la vérification. La laisser aurait
faussé son propre « Reste à payer » de 3 €.

Conséquence, dite plutôt que masquée : **quelqu'un qui rejoue la requête aujourd'hui ne
retrouvera pas cette ligne.** L'observation a eu lieu et elle est datée dans la PR ; elle
n'est plus vérifiable en base. Aucune ligne actuellement en production n'a donc été écrite
par le chemin post-déploiement. La garantie repose désormais sur deux faits vérifiables : les
quatre sites d'insertion fournissent la colonne, et le typecheck l'exige — mesuré, pas
supposé. Commentaire complet sur [#368](https://github.com/thierryvm/ankora/pull/368#issuecomment-5244162832).

## 6. Deux corrections d'hygiène, faites en passant

**Les noms des handoffs mentaient sur l'heure, et le décalage grandissait** : `1930` avait été
committé à 18 h 15, `2230` à 18 h 33 — quatre heures d'écart. Les sessions précédentes ont
inventé l'heure au lieu de lire l'horloge. Ce n'est pas cosmétique : la reprise lit le fichier
qui **trie en dernier**, et un handoff honnêtement daté 20 h 23 se serait classé avant un
fichier écrit deux heures plus tôt. Les deux sont renommés à leur heure de commit réelle.
Aucune référence ne pointait vers eux (`git grep` vide).

**L'index des ADR rattrapé partiellement** : 038, 040 et 041 y entrent, parce qu'ils forment
le programme en cours. Les dix restants (019-024, 034-037) attendent toujours leur PR dédiée.

## 7. Reprise — dans cet ordre

1. **J2** (ADR-038 D1 — la table de mouvements), **périmètre élargi par ADR-041** : deux
   colonnes sur `accounts` + contrainte, renommage `paid_from` → `provisioned_from`,
   ré-attribution des lignes historiques, écriture à deux mouvements. Point de coupe si c'est
   trop gros : schéma + réglage d'un côté, écriture à deux mouvements de l'autre — dans cet
   ordre, jamais l'inverse.
   **`plan-reviewer` est obligatoire** avant d'écrire la moindre ligne (migrations + Server
   Actions).
2. Puis **J3** (D2 — rentrées datées), **J4** (D6 — dérivation des soldes).

**Avant J4, et pas après** : [#361](https://github.com/thierryvm/ankora/issues/361) — dépointer
supprime physiquement la ligne (vérifié ce soir : `charge-payments.ts:107-111`, un `DELETE`
pur), ce qui videra l'historique dont D6 dépend ; et
[#362](https://github.com/thierryvm/ankora/issues/362) — « payé depuis » n'est exposé par aucun
écran. [#365](https://github.com/thierryvm/ankora/issues/365) (vocabulaire « Factures ») reste
indépendant et se fait d'un bloc.

## 8. État de l'environnement local

Supabase local debout (conteneurs `*_ankora`, API `127.0.0.1:54421`), les deux migrations J1 et
J1b appliquées. Aucun serveur de dév en cours (port 3700 libre). Branches locales nettoyées
avec le contre-contrôle canonique ; celles retenues par un worktree (`ankora-landing`,
`ankora-refonte`) sont conservées.

**Rappel de sécurité toujours actif** : les connecteurs MCP Supabase et Vercel de claude.ai
sont branchés sur les comptes **professionnels**. Interdits en session Ankora, lecture
comprise. Tout passe par la CLI, préfixée `work perso -NoCd;`, avec `npm run preflight` → GO
avant chaque action sortante — fait avant la poussée en production **et** avant chaque merge,
`gh pr merge` ne déclenchant aucun hook git.
