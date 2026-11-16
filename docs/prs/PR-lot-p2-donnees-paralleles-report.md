# PR — Lot P2 : données de `/app` en parallèle

> **Branche** : `perf/lot-p2-donnees-paralleles` (off `main` `2c13bed`) · **Date** : 2026-11-15 ·
> **Auteur** : @cc-ankora (Opus) · **Programme** : lot P « lancement rapide » (ADR-049)

## Pourquoi

@thierry trouve `/app` lent au lancement. Les logs d'exécution Vercel du 15 novembre 2026,
11:43–11:50 UTC (ligne `app render timing`, 5 rendus authentifiés), donnaient `session_ms`
38–112, `snapshot_ms` 143–209, `page_ms` 230–755. Ce sont les lectures propres à la page qui
forment le chemin critique.

Le rendu enchaînait six allers-retours vers Supabase, et la lecture G-31 (« Trop tôt pour
projeter ») partait **en dernier**, après les deux vagues du journal des comptes. Pourtant, elle
n'a besoin que du workspace et de la date du jour.

## Ce qui change

1. **La lecture G-31 part avec le snapshot.** L'ordonnancement vit dans une fonction de
   production, `avecLectureAnticipee` (`src/lib/data/debut-des-donnees.ts`), que la page appelle :
   - elle lance la lecture **avant** de charger la situation du mois ;
   - elle lit le workspace par la porte serveur (`currentWorkspaceId()`), la même résolution
     mémoïsée que le snapshot : session, second facteur, onboarding, appartenance.

   Seule la situation est attendue. La lecture revient sous forme de fonction et **n'est attendue
   que si la carte s'affiche** : un mois passé ou une situation incomplète ne l'attend jamais.
   Seul l'échec de la **lecture** est capturé. Une redirection ou un échec de la porte remonte par
   la situation, qui attend la même résolution.

2. **Le jugement de cette lecture** vit dans `debutDesDonneesPourLaCarte`
   (`src/lib/data/debut-des-donnees.ts`). L'ordre des branches est imposé par la revue :
   - carte absente (autre mois, situation incomplète) : `null`, et un échec est ignoré, comme
     avant, quand la lecture n'avait pas lieu ;
   - minuit franchi entre la lecture et la situation : relecture séquentielle avec le bon jour ;
   - échec : la même `DataReadUnavailableError` qu'avant ;
   - sinon : combinaison avec le premier mouvement.

   `readDebutDesDonnees` se découpe en `readDepensesDebut` (la requête) et
   `combineDebutDesDonnees` (fonction pure).

3. **`isAdmin()` passe par `lookupSession()`.** C'est la recherche de session mémoïsée par
   requête que partagent déjà les layouts et le snapshot. **Aucun gain de temps n'est revendiqué** :
   Next fusionnait déjà le `fetch` identique pendant un rendu. Le gain est déterministe : un seul
   chemin d'identité, et la règle devient la nôtre plutôt que celle du patch de `fetch`. Seul le
   statut `authenticated` peut être admin ; `anonymous`, `unavailable` et toute exception rendent
   `false`. `requireUser` et `requireAdmin` ne changent pas et restent les seuls gardiens :
   `isAdmin` ne décide que de l'affichage d'un lien.
4. **Le layout `[locale]/layout.tsx` n'est pas modifié.** Le lot A édite son `<head>`. Ses autres
   `await` (messages, traductions, cookies) sont locaux, et le second appel d'identité devient un
   accès au cache.

## Journal des comptes (mesure seule, fusion = lot P4)

Le harnais `serial-reads` compte désormais le rendu complet du cockpit : **4 vagues**.

| Vague | Contenu                                                                                |
| ----- | -------------------------------------------------------------------------------------- |
| 1     | Session                                                                                |
| 2     | `users` et `workspace_members`                                                         |
| 3     | Snapshot, engagements, première vague du journal (relevés et mouvements), lecture G-31 |
| 4     | Seconde vague du journal (débits et `statement_included_flows`)                        |

Avant ce lot, G-31 formait une 5ᵉ vague. `statement_included_flows` ne dépend pas de la première
vague, mais l'avancer ne fait rien gagner tant que les débits, eux, en dépendent. La fusion des
deux vagues reste le lot P4.

## Mesures avant / après

**Instrument.** `npm run dev` sur la pile Supabase locale. Un proxy HTTP ajoute 40 ms à chaque
requête vers Supabase, pour émuler l'aller-retour mesuré en production. Le compte est fictif et
seedé par `e2e/helpers/semis-cockpit.ts`, avec un relevé et un mouvement pour que la seconde vague
du journal travaille. On mesure 20 chargements à chaud de `/app` par série, avec
`PerformanceNavigationTiming` côté navigateur et la ligne `app render timing` côté serveur.
L'outil (proxy et script) est resté hors de l'arbre et rien n'est ajouté au dépôt.

Deux paires A/B. La seconde ne bascule que `page.tsx` par rechargement à chaud, sur le même
serveur.

| Série           | TTFB médian | TTFB p90 | Fin de réponse médiane | p90   | `session_ms` | `snapshot_ms` | `page_ms` |
| --------------- | ----------- | -------- | ---------------------- | ----- | ------------ | ------------- | --------- |
| Avant (paire 1) | 398         | 512      | 910                    | 1 009 | 132          | 139           | 225       |
| Après (paire 1) | 351         | 467      | 782                    | 961   | 124          | 129           | 221       |
| Avant (paire 2) | 311         | 450      | 792                    | 970   | 120          | 109           | 193       |
| Après (paire 2) | 273         | 295      | 664                    | 683   | 109          | 107           | 190       |

Toutes les valeurs sont en millisecondes. Tous les chargements ont répondu 200.

**Lecture des résultats.**

- La fin de réponse baisse de **128 ms dans les deux paires** et le TTFB de 38 à 47 ms.
- `page_ms` ne bouge pas, et c'est attendu : il ne mesure que la lecture du journal et des
  engagements, qui ne change pas.
- Le gain dépasse une seule latence injectée (40 ms). Je ne l'ai pas décomposé ; le mode dev en
  amplifie probablement une part. **Il faudra donc le confirmer en production** par la même ligne
  de log (`page_ms` inchangé attendu) et par le TTFB du document.

## Portes

| Porte                     | Résultat                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`       | 0 erreur                                                                                                                                                                                     |
| `npm run lint`            | 0 erreur ; les 26 avertissements sont préexistants, aucun sur les fichiers modifiés (`eslint` ciblé : exit 0)                                                                                |
| `npm run lint:use-server` | ✓                                                                                                                                                                                            |
| `npm run test`            | 271 fichiers verts. Seul `tests/tooling/depot-public-sans-budget-reel.test.ts` dépasse son délai sous la charge de la suite complète ; isolé, il passe en 6/6. Il est sans lien avec ce diff |
| `npm run build`           | succès                                                                                                                                                                                       |
| `npm run dev`             | `/` 200 ; `/app` 307 sans session et 200 connecté (40 chargements mesurés) ; 0 erreur de compilation                                                                                         |
| Contre-épreuves           | ancien `isAdmin` remis : 3 tests rougissent, dont « une seule demande de session » (2 au lieu de 1). Garde `authenticated` retirée : le test « `unavailable` portant un id listé » rougit    |

## Tests ajoutés

- **`is-admin.test.ts`** : réécrit sur `lookupSession`, 10 cas. Il prouve que :
  - un non-admin, un id qui _contient_ un id admin, une liste vide, une session anonyme ou
    `unavailable`, et une exception rendent tous `false` ;
  - la garde de statut est prouvée isolément.
- **`debut-des-donnees.test.ts`** : la requête découpée, la combinaison pure, et les six branches
  du jugement, dont « minuit franchi et lecture en échec » qui relit sans lever.
- **`serial-reads.test.ts`** :
  - une seule demande de session pour `getOptionalUser` puis `isAdmin` ;
  - la lecture G-31 part en vague 3, avec une seule résolution du workspace et trois vagues en
    tout ;
  - une redirection vers l'onboarding ou vers le second facteur empêche la lecture de partir ;
  - le rendu complet du cockpit tient en 4 vagues.

  Le harnais garde un journal complet des appels (`everIssued`) : l'ancienne assertion « jamais
  émis » lisait un tableau que le pilote vide à chaque vague.

## Revues

- `spec-translator` : spec rédigée, design A/B/C retenu.
- `plan-reviewer` (Opus) : 🔴, pour un DoD incomplet seulement, puis ✅ **APPROVED** après six
  corrections (date du jour lue une fois, aucun `await` avant le `Promise.all`, ordre des
  branches, preuve d'une seule résolution, aucun gain attribué à `isAdmin`, DoD complet).
- `security-auditor` (Opus) : **PASS_WITH_NOTES**, aucun défaut de code. Ses deux notes de test
  (garde de statut isolée, cas du second facteur) sont traitées dans cette PR. Risque résiduel :
  `isAdmin` ne vérifie pas le second facteur, comme avant ce diff ; il n'en résulte que l'affichage
  d'un lien, et `/admin` reste gardé par `requireAdmin`.
- **Sourcery**, trois fils :
  - `page.tsx:197` (une lecture inutile retarde les mois passés) : **corrigé**. La lecture n'est
    plus attendue quand la carte est absente. Le test « pas besoin » fournit une lecture qui ne
    se termine jamais et vérifie qu'elle n'est pas attendue.
  - `serial-reads.test.ts:210` (le test ne prouve pas l'ordonnancement de la page) :
    **corrigé**. L'ordonnancement est extrait dans `avecLectureAnticipee`, et les tests de
    vagues passent par cette fonction. Contre-épreuve faite : si elle attend la situation avant
    de lancer la lecture, les deux tests de vagues rougissent (une vague de plus).
  - `page.tsx:167` (la carte peut être périmée par rapport au snapshot) : **refusé dans le
    fil**. Les lectures du cockpit n'ont jamais partagé un instantané transactionnel : ce sont
    des requêtes séparées, et l'ancienne lecture séquentielle pouvait aussi voir un autre état
    que le snapshot (plus tard au lieu de plus tôt). La fenêtre est celle d'un rendu ; toute
    écriture revalide la page et la corrige au rendu suivant.
- **CI du premier push** : le run `push` a rougi sur `ChargeEditDrawer.payment.test.tsx`
  (course de focus, réparée par #540, désormais mergée dans la branche). Le run `pull_request`
  du même commit était vert, e2e compris : **299** public et **99** authentifié.

## Coût accepté

La lecture G-31 (bornée à 5 lignes, une colonne, sous RLS) part aussi pour un mois passé ou une
situation incomplète, sans être attendue. Elle ne crée aucune vague : elle voyage avec le
snapshot.

## Hors périmètre

- Fusion des vagues du journal (P4).
- Pré-chargement de navigation du service worker (P3).
- Serveur chaud (P1).
- `getClaims()` dans le proxy (P5).
- La ligne « lot P » du ROADMAP n'existe que sur la branche de #542 (programme ADR-049) : elle
  se coche là-bas.

## Définition de DONE

À compléter avec les preuves après le push :

1. Checks CI verts : Lint, Typecheck, Tests, E2E (public ≥ 296 passed, authentifié ≥ 81 passed,
   planchers de `main` au 16 novembre 2026), Security, Build.
2. Sourcery et Codex silencieux sur le dernier commit ; fils résolus.
3. Revue humaine : @thierry (merge délégué à l'orchestration).
4. `mergeStateStatus` CLEAN.
5. Ce rapport.
