# Handoff — 11 août 2026, 00 h 25 — ADR-042, quatre tours de revue avant la première ligne

**Session** : CC Ankora (Opus 5). Suite du handoff de 20 h 23. Trois chantiers enchaînés :
ADR-041 mergé, J1b en production, et une conception RGPD figée après quatre tours de
`plan-reviewer`.

`main` = **`8052033`** + PR [#370](https://github.com/thierryvm/ankora/pull/370) en attente de
merge · production à jour.

---

## 1. Le régime de travail a changé, et c'est le point le plus structurant

@thierry a levé le verrou « GO explicite avant chaque action sortante » :

> « Pars du principe que tu as carte blanche, peu importe l'action que tu dois faire. En
> gardant évidemment cette approche de garde-fou, de vérification, de validation, de test. »

**Ce qui change** : `supabase db push`, `gh pr merge`, les migrations de production ne
demandent plus de feu vert au cas par cas. Décider, exécuter, rapporter.

**Ce qui ne change pas** : préflight avant chaque action sortante, preuve dans les deux sens,
connecteurs MCP Supabase/Vercel toujours interdits, liste bannie toujours bannie. Consigné en
mémoire de session.

## 2. J1b est en production

`20260810000002_d3_attribution_paiements_contract.sql` appliquée après dry-run vérifié (une
seule migration, pas de `--include-all`). Production vérifiée par ce qu'elle **déclare** : la
spec OpenAPI de PostgREST annonce `paid_from_account_type` **requis** sur les deux tables.

Le gain n'est pas le `NOT NULL` : les clés étrangères de J1 sont en `MATCH SIMPLE`, donc une
ligne nulle **n'était pas vérifiée du tout**. Plus aucune ligne n'étant nulle, la clé
étrangère cesse d'être une promesse.

**Prouvé dans les deux sens** : garde-fou vu refuser sur un état pathologique fabriqué dans la
base **locale** (restaurée ensuite, triggers et contraintes relus) ; `NOT NULL` vu rendre
`23502` ; sensibilité du typecheck mesurée en retirant le champ d'un site d'insertion
(`TS2769`). Détail dans [#368](https://github.com/thierryvm/ankora/pull/368).

**Réserve de méthode consignée dans la PR** : la ligne de 16 h 41 qui prouvait que le code
déployé remplit la colonne a été **dépointée par @thierry** après avoir servi (elle marquait
payée une facture du 16 août). L'observation est datée dans la PR ; elle n'est plus
reproductible en base. Le dépointage est un `DELETE` pur, sans interaction possible avec le
`NOT NULL`.

## 3. ADR-042 — neuf défauts bloquants, zéro ligne de code

**C'est le résultat le plus important de la session, et il faut le lire comme tel.**

Le droit à l'effacement est **construit, mergé, et inerte**. Mesuré : `CRON_SECRET` absent des
variables de production, file à **zéro demande**. Le défaut ne nuit donc à personne
aujourd'hui — il nuirait au premier qui cliquerait.

Le défaut : `claim_pending_deletions` n'a **aucune colonne de tentative**. 25 lignes en échec
occupent le lot chaque nuit, pour toujours, sans alerte. Et la personne concernée a perdu son
bouton d'annulation tout en lisant que sa suppression est irréversible.

### Ce que les quatre tours ont attrapé

| Tour | Trouvaille                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Le bouton d'annulation **affirmait avoir annulé sans rien annuler** — le chemin ne connaît que `pending`. Et `failed` n'était pas positionné vis-à-vis de l'index d'unicité : les deux branches cassaient quelque chose (page de réglages en erreur, ou blocage définitif du droit de redemander). |
| 2    | **Ma correction du tour 1 rendait inerte le garde-fou du tour 1.** L'action _réessayer_ remettait le compteur à zéro sans toucher la date d'ancrage — la conjonction temporelle devenait vraie pour toujours. Ma propre preuve n° 4 ne testait que le cas qui marche.                              |
| 3    | L'ancre pouvait être **absente** : le conjoint valait `NULL`, donc jamais vrai — ligne **inquarantinable à vie** tout en occupant un créneau. Le gel de #285, reproduit par son correctif. Et la date de relance n'avait aucune colonne.                                                           |
| 4    | Trois valeurs imposées **sans source** : qui écrit `last_attempted_at` et ce que ça signifie, un vocabulaire d'erreur que le code ne sait pas produire, une colonne écrite dans une branche mais affichée dans une autre.                                                                          |

**Deux des neuf ont été introduits par une révision de l'ADR lui-même.** Une correction peut
créer le défaut qu'elle prétend fermer — c'est exactement ce que la séparation
décision / exécution existe pour attraper, et elle l'a fait quatre fois.

Verdict final : « plus rien à revoir dans la conception », et le critère de sortie est
atteint — **l'exécution n'a plus aucune décision à prendre.**

## 4. Deux corrections d'hygiène, faites en passant

**98 apostrophes doublées publiées dans un dépôt public.** `''` n'échappe rien dans une
here-string PowerShell : mes `n''existait` sont partis tels quels dans 3 corps de PR et
2 commentaires. Les cinq documents sont réparés, avec contrôle de non-corruption. **Méthode
changée** : tout corps destiné à `gh` passe désormais par `--body-file`. Consigné en mémoire.

Trouvée non pas en corrigeant le défaut signalé par Sourcery, mais en **cherchant s'il
existait ailleurs**.

**Le ROADMAP annonçait PR-A « suivante »** alors qu'elle est livrée depuis le 27 juillet
(#282, #284). Corrigé, et la section RGPD réécrite avec les faits mesurés.

## 5. Reprise — dans cet ordre

1. **Merger [#370](https://github.com/thierryvm/ankora/pull/370)** s'il ne l'est pas (deux jobs
   Playwright publics étaient encore en vol à la clôture).
2. **PR-C — l'exécution d'ADR-042.** Elle n'a **aucune** décision à prendre : cinq colonnes,
   quatre invariants dont un devenu contrainte de base, quatorze preuves chacune avec son
   instrument, dix points de découpage. Tout est écrit.
   **Planchers** : public **inchangé à 241** (la spec saute dans le job public) ; authentifié
   **> 45, à MESURER en local dans les deux sens avant le premier push** — annoncer 45 serait
   faux, le lot ajoute sept cas.
3. **Puis l'armement**, qui est un **runbook indivisible**, pas une PR : les deux lectures de
   production dues par ADR-024, puis `CRON_SECRET` → **redéploiement** → `vercel crons ls` →
   exécution manuelle sur file vide. Poser la variable sans redéployer donne un `401`
   quotidien **silencieux**.

**En parallèle, non bloqué** : J2 (ADR-038 D1 + ADR-041 F2), et
[#365](https://github.com/thierryvm/ankora/issues/365) — le vocabulaire « Factures », petit et
visible.

**Note sur Sourcery** : muet sur #370 par **épuisement de quota**, pas par approbation. Il
avait réellement tourné sur #368 (approbation) et sur #369 (une remarque fondée, corrigée et
partiellement refusée par écrit dans le fil). La différence change ce que le critère vaut.

## 6. État de l'environnement local

Supabase local debout (conteneurs `*_ankora`, API `127.0.0.1:54421`), migrations J1 et J1b
appliquées. Aucun serveur de dév (port 3700 libre). Branches locales nettoyées avec le
contre-contrôle canonique ; celles retenues par un worktree sont conservées.

**Rappel de sécurité toujours actif** : les connecteurs MCP Supabase et Vercel de claude.ai
sont branchés sur les comptes **professionnels**. Interdits en session Ankora, lecture
comprise. Tout passe par la CLI, préfixée `work perso -NoCd;`, avec `npm run preflight` → GO
avant chaque action sortante — fait avant la poussée en production et avant chaque merge.
