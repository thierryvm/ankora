# PR — Refonte étape 2 : filet e2e réel en CI

**Date** : 26 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `ci/refonte-02-filet-e2e`
**Revue de plan** : `plan-reviewer` — 3 passes, 🟡 → 🟡 → revue close (23 édits intégrés)
**Étape** : 2 / 17 du plan de refonte v2 — déclarée **bloquante** pour les 15 suivantes

---

## 1. Le problème

`gh pr checks ✅` ne voulait pas dire grand-chose. Run `30210147687` sur `main` :

| Mesure             | Valeur                   |
| ------------------ | ------------------------ |
| Cas e2e exécutés   | 214 passed               |
| Cas e2e **sautés** | **173 skipped** — 44,7 % |

Les 173 contenaient **tous** les parcours connectés. Le vert ne couvrait que la
surface publique.

## 2. Ce qui empêchait de le corriger — six blocages, tous vérifiés en code

**B1 — Le garde de détection reniflait l'URL.** `adminClientOrNull()` sautait dès
que l'URL contenait `localhost:54321` — l'adresse exacte servie par
`supabase start`. **Démarrer une stack locale n'aurait rien changé** : les 173 cas
auraient continué de sauter. Ce point seul invalidait l'étape telle que rédigée
dans le plan du programme.

**B2 — `rateLimit()` échoue fermé, et la CI tourne en production.**
`next start` impose `NODE_ENV=production` ; la CI pointait Upstash sur un port où
rien n'écoute. Ce n'est pas « le login casse » : les **24 sites `rateLimit('mutation')`**
échouent autant que les 4 sites `auth`.

**B3 — Le quota `auth` : 5 tentatives / 15 min par IP.** 39 sites `goto('/login')`,
et les specs mobile tournent sur 3 projets. Plus de 100 connexions par passe.

**B4 — Aucun `supabase/config.toml`.** `supabase start` en exige un.

**B5 — Le détecteur de specs authentifiées avait un angle mort.** Il matchait
`adminClientOrNull` seul et ratait les 3 specs qui sèment via la fixture
`seededUser`. `npm run e2e:auth -- --all` annonçait tout couvrir en exécutant
9 specs sur 13. Découvert en instruisant une remarque de revue.

**B6 — GoTrue applique ses propres quotas.** `sign_in_sign_ups` = 30 par 5 min et
par IP. **Aucune revue ne l'avait vu.** Traiter notre limiteur sans traiter le sien
aurait fait échouer la suite en affichant ce qui ressemble à un login cassé.

## 3. Ce que la revue a empêché

Ma v1 proposait un driver de rate-limiting « en mémoire » pour les tests, désactivé
si `NEXT_PUBLIC_APP_ENV === 'production'`. **Fail-open** : cette variable a un
`.default('development')` (`env.ts:12`). Oubliée ou non propagée au scope Vercel
Preview, elle vaut `development` et le contournement s'active. Or les previews
pointent sur l'**unique** projet Supabase — la production. Le correctif aurait
ouvert la porte qu'il prétendait fermer.

**Le plan final ne touche aucune ligne de `src/`.** Deux leviers côté tests :

- **L1** — un `x-forwarded-for` unique par test, l'en-tête dont l'app dérive déjà
  l'adresse de l'appelant. Aucun risque ajouté : Vercel le réécrit en amont.
- **L2** — un Redis + un proxy compatible Upstash dans le job, ce qui rend
  `rateLimit()` **réellement fonctionnel**. La suite **gagne** la couverture du
  rate-limiting au lieu de la perdre.

## 4. Un désaccord tranché par la mesure

La revue classait en premier une base Upstash dédiée à la CI, son argument
principal étant que cela supprimait l'incertitude sur les scripts Lua de
`slidingWindow` à travers une image figée depuis mai 2024.

**J'ai mesuré au lieu d'argumenter** — construction identique à la production
(`slidingWindow(5, '15 m')`, prefix `rl:auth`, packages du lockfile) :

| appel     | 1   | 2   | 3   | 4   | 5   | 6      |
| --------- | --- | --- | --- | --- | --- | ------ |
| `success` | ✅  | ✅  | ✅  | ✅  | ✅  | **❌** |

Falsifiable : proxy arrêté → sortie 1 ; redémarré → sortie 0.

L'incertitude levée, restait l'argument que la revue avait elle-même désigné comme
le vrai arbitrage, et **il penche dans l'autre sens** : une base externe met une
dépendance réseau **dans le gate bloquant**. Un rouge dû à une panne fournisseur
apprend à ignorer le rouge — le mode de panne exact que cette étape répare.
Solution hermétique retenue ; **la revue a concédé**, en ajoutant deux arguments
que je n'avais pas faits (état partagé entre runs concurrents, écriture de secret
à la charge de @thierry).

## 5. Preuve

### Mesuré en local avant d'être poussé

|                            |                         |
| -------------------------- | ----------------------- |
| Cas exécutés               | **24 passed, 0 failed** |
| Durée                      | **1,0 min**             |
| Connexions réelles servies | **79**                  |
| Refus de rate-limit        | **0**                   |

Le critère de sortie demandait « 6+ connexions réelles dans une même passe ».
Il y en a eu 79.

### La correction que seule l'exécution pouvait révéler

Première passe : **29 échecs en 24,8 min**. Cause : mon IP par test venait d'un
compteur au niveau module. **Playwright exécute chaque réessai dans un worker
neuf**, qui réimporte le module et remet le compteur à zéro — chaque réessai
réutilisait l'adresse du premier test. Quelques échecs isolés suffisaient à
épuiser le budget et à déclencher une cascade.

Dérivée de `testId` + `retry`, l'adresse survit aux redémarrages de worker :
**29 → 12 échecs, 24,8 → 5,4 min**.

Deux erreurs de méthode de ma part, corrigées : une sonde dont l'assertion visait
un `alert` vide déjà présent (elle ne pouvait pas échouer), et une falsification
menée contre un serveur mort (elle ne prouvait rien).

### Rejeu des migrations depuis zéro — jamais vérifié auparavant

Les 15 migrations construisent une base vide en 14 tables. La production ne les a
reçues qu'incrémentalement ; rien ne garantissait qu'un dépôt frais soit
reconstructible. C'est désormais vérifié à chaque run.

Fidélité confirmée : Postgres **17.6.1.104** en production, `major_version = 17`
en local.

### Quality gates

`npm run test` **1702 / 1702** · `typecheck` 0 · `lint` 0 erreur

## 6. Ce que cette PR ne corrige pas, et le dit

### Six specs décrivent un tableau de bord qui n'existe plus

Elles ont été mergées, le cockpit a été reconstruit (Situation Hero, THI-327), et
**rien n'a protesté puisqu'elles ne tournaient nulle part**. Les exécuter pour la
première fois est ce qui l'a révélé.

- Trois cherchent des `data-testid` présents dans **zéro** fichier de `src/` :
  `effort-financier-card`, `substat-reste-disponible`, `substat-reste-a-vivre`,
  `capacite-epargne-card`, `capacite-epargne-substats`.
- Trois cherchent un rôle `heading` sur `CardTitle`, **qui rend une `<div>`**
  (`src/components/ui/card.tsx:23`).

Elles sont **en quarantaine explicite** : découvertes, listées, comptées, imprimées
à chaque run avec leur raison. Pas de `test.skip` dans les fichiers — une
quarantaine que personne ne voit n'est qu'un skip mieux élevé.

### Trois dettes révélées, laissées à leur propre PR

1. **Défaut d'accessibilité réel** : les titres de section du cockpit ne sont pas
   des titres pour un lecteur d'écran. Sur la page la plus importante de l'app.
2. **L'audit RGPD ne s'écrit pas sur une base reconstruite depuis les migrations** :
   `permission denied for table audit_log`. En production ça marche, donc un droit
   y a été posé **hors migration**. Les migrations ne décrivent pas complètement la
   production — et la traçabilité d'audit est une obligation RGPD.
3. **Angle mort du préflight** : il valide le _fichier_ de lien Supabase, pas le
   compte que le CLI utilise réellement. Sur cette machine, un `supabase` sans
   `--env-file` s'authentifie sur un autre compte qui ne voit même pas
   `ankora-prod`. L'infrastructure de garde-fous ne se modifie pas dans une PR de
   feature.

### Un incident évité côté comptes

`supabase start` a échoué : le projet **professionnel `OVB`** occupe les ports
Supabase par défaut sur cette machine, et le CLI suggérait d'arrêter **sa** stack.
Les ports d'Ankora sont décalés (`5442x`) — les deux coexistent, et aucune commande
d'ici ne peut plus toucher au projet professionnel.

## 7. ⚠️ L'étape n'est livrée qu'à moitié à la fusion

La protection de branche est **hors périmètre** (banned-list §3 : l'infrastructure
de garde-fous ne se modifie qu'en PR dédiée à revue humaine). Le job
`e2e-authenticated` ne sera donc **pas** dans les checks requis : **il pourra être
rouge sans bloquer un merge**.

Tant qu'une PR de suivi — propriétaire **@thierry** — ne l'aura pas ajouté aux
checks obligatoires, le filet reste **décoratif** et l'objectif propre de l'étape
(« que le vert veuille dire quelque chose ») n'est pas atteint.

## 8. Definition of DONE

| #   | Critère                                | Preuve                     |
| --- | -------------------------------------- | -------------------------- |
| 1   | CI verte                               | checks de la PR            |
| 2   | Sourcery muet sur le dernier commit    | `gh api …/comments` → vide |
| 3   | Approbation @thierry + threads résolus | à la revue                 |
| 4   | Pas de conflit avec `main`             | `mergeStateStatus: CLEAN`  |
| 5   | Rapport livré                          | ce fichier                 |
