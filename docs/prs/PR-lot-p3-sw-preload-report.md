# @cc-ankora — Lot P3 : préchargement de navigation du service worker

15 novembre 2026. Branche `fix/sw-navigation-preload`, base `main` 8f39fe3. Modèle : Opus
(alias `opus`). Voie lourde : `spec-translator` → `plan-reviewer` (🔴 au premier passage pour une
DoD incomplète, ✅ au second) → code → `security-auditor`.

## Ce qui change

Avant, chaque navigation attendait que le worker démarre avant même de lancer sa requête réseau
(`public/sw.js`, branche `navigate` : `respondWith(fetch(request))`). Sur une PWA installée, ce
démarrage se place devant chaque lancement.

- `activate` active le préchargement de navigation (`registration.navigationPreload.enable()`),
  **détecté et non supposé** : absent de WebKit avant 15.4 et des navigateurs anciens. Un échec de
  `enable()` est avalé et ne bloque jamais l'activation ni `clients.claim()`.
- `answerNavigation(event)` attend `event.preloadResponse` en premier, sur chaque navigation : le
  préchargement est toujours consommé (sinon Chrome l'annule et le signale).
  - Une réponse préchargée est rendue telle quelle, redirections comprises (la 307 de next-intl
    arrive en redirection opaque, comme `fetch(request)` la rendait).
  - Sans préchargement (non pris en charge ou désactivé) : un seul `fetch`.
  - Un préchargement rejeté est une panne réseau : `/offline` directement, **jamais** de seconde
    requête, qui rejouerait un `?code=` à usage unique (`/auth/callback`, lien de réinitialisation).
- Rien d'autre ne bouge : les navigations restent réseau seul, `isBypass`, `PROTECTED_LOCALED`,
  la liste `CACHEABLE_ASSET`, `install` (toujours sans `skipWaiting`) et `/offline` sont intacts.

### Pourquoi `CACHE_VERSION` ne change pas

La demande disait « monter la version pour que les clients se mettent à jour ». Tout octet modifié
dans `sw.js` relance déjà `install` puis `activate` : la mise à jour part sans changer la version.
Changer la version ne sert qu'à vider un cache empoisonné ; aucun ne l'est, et le vider aurait
supprimé jusqu'à 150 fichiers `_next/static`, donc ralenti le premier lancement après la mise à
jour, à l'inverse du but (relevé par `plan-reviewer`).

### Retour arrière : jamais un revert brut

L'état du préchargement est rangé sur l'**enregistrement** et survit à un nouveau worker. Un worker
qui cesse de lire `preloadResponse` alors que le préchargement reste actif enverrait chaque
navigation deux fois. Retour arrière = correctif en avant qui appelle
`navigationPreload.disable()` dans `activate`. L'avertissement est écrit dans `sw.js`.

## Délai avant `/offline` : non, et pourquoi

Décision : **aucun délai**. `/offline` n'apparaît que si la requête échoue.

| Mesure                                      | Valeur                                                     | Source                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Premier octet en production, à chaud        | 0,20 à 0,30 s (`/`, `/login`, `/offline`, 3 essais chacun) | `curl -sS -o /dev/null -w "%{time_starttransfer}"` sur ankora.be, 15/11                                                                               |
| Premier octet en production, à froid        | 2,14 s sur `/`                                             | diagnostic du 15/11 (mesuré par la session de diagnostic, non remesuré ici)                                                                           |
| Premier octet en local, build de production | 11 à 19 ms                                                 | navigation Chromium, `performance.getEntriesByType('navigation')`                                                                                     |
| Réseau lent émulé (Fast 3G, Slow 3G)        | **non mesuré**                                             | l'émulation CDP `Network.emulateNetworkConditions` n'a eu aucun effet sur les navigations (13 ms en « Slow 3G ») : panne d'instrument, pas une donnée |

Raisonnement : un délai `N` doit dépasser le démarrage à froid (2,14 s) **plus** la latence d'un
réseau lent. Le profil « Slow 3G » de Chrome se définit par 2 s d'aller-retour ; une connexion
neuve en demande plusieurs avant le premier octet. Tout `N` assez court pour servir à quelque chose
montrerait `/offline` à quelqu'un qui est en ligne, et jetterait la vraie réponse en route. Sur
une connexion bloquée, le comportement reste celui du navigateur sans worker : il attend. Le
préchargement ne raccourcit pas cette attente, il retire seulement le démarrage du worker devant.

## Vérifications

### Tests unitaires (`npm run test` : 272 fichiers, 3 834 tests verts)

`src/lib/pwa/__tests__/sw-source-guard.test.ts`, nouveau bloc « navigation preload (lot P3) »,
exécuté sur le `sw.js` livré avec des faux `self`, `caches` et `fetch` :

- `activate` appelle `enable()`, purge toujours les anciens caches, revendique les clients ; sans
  `registration`, ou sans `navigationPreload`, ou avec un `enable()` qui rejette : pas d'erreur et
  `claim()` tourne.
- Réponse préchargée rendue telle quelle, sans second `fetch` ; redirection opaque transmise.
- Sans préchargement (absent ou `undefined`) : un seul `fetch`. Préchargement rejeté : `/offline`,
  sans `fetch`. `fetch` rejeté : `/offline`.
- `/auth/callback?code=x` : jamais de seconde requête, ni en cas de succès ni en cas d'échec.
- `/app`, `/en/app`, `/nl-BE/app/charges`, `/`, `/login` : aucune ouverture de cache, et la seule
  lecture est `/offline`.

`src/lib/sw/__tests__/is-bypass.test.ts` : le garde textuel de la branche `navigate` suit
désormais la délégation vers `answerNavigation` et `offlineFallback`, avec les mêmes interdits
(`caches.match(request)`, `cache.put`, `caches.open`).

Contre-épreuve, `sw.js` muté puis restauré : préchargement ignoré → 3 échecs ; page lue dans le
cache → 6 échecs ; `enable()` retiré → 2 échecs.

### Build de production local (`next build && next start`, variables factices de la CI)

- `navigationPreload.getState()` après activation : `{ enabled: true, headerValue: 'true' }`.
- En-tête `Service-Worker-Navigation-Preload: true` vu sur la navigation `/app` et sur sa
  redirection vers `/login` (`Network.requestWillBeSentExtraInfo`).
- Proxy et CSP : avec et sans l'en-tête, mêmes statut, en-tête `Content-Security-Policy`,
  `Location` et `Vary` sur `/` (200), `/login` (200) et `/app` (307 vers `/login`). L'en-tête
  n'entre dans aucun `Vary` : aucun effet sur le cache CDN.
- Cache Storage après navigation vers `/app` : uniquement des ressources de la liste blanche et
  `/offline`.
- Console de la page et du worker : aucun avertissement, aucune erreur.
- Coût du démarrage du worker, worker arrêté (`ServiceWorker.stopAllWorkers`) avant chacune de
  9 navigations : médiane du premier octet 17 ms avec préchargement, 16 ms sans. **Sur un PC de
  bureau, le gain ne se mesure pas** : le worker y démarre en quelques millisecondes. Le gain
  attendu porte sur l'iPhone, où ce démarrage est plus lent ; il reste à constater sur l'appareil.

### e2e

Nouveau test dans `e2e/pwa.spec.ts`, sous `next start` seulement (la CI l'exécute toujours, un
enregistrement manquant y échoue), en Chromium seulement. Il interroge l'état jusqu'à
`enabled: true` (`ready` répond dès l'état `activating`), puis vérifie que chaque clé de Cache
Storage est dans `CACHEABLE_ASSET` ou vaut `/offline`, plus un contrôle fixe qui ne dépend pas de
cette liste (aucune clé en `/app`, `/login` ou `/`).

Delta mesuré en local : `e2e/pwa.spec.ts` sans le test `9 passed`, avec `11 passed` / `1 skipped`.
Plancher public 294 → **296** (`CLAUDE.md`, `docs/reference/planchers-e2e-historique.md`) ;
authentifié **81**, inchangé (`pwa.spec.ts` absent de `e2e/authenticated-specs.json`).

### Portes locales

`npm run lint` (0 erreur), `npm run lint:use-server`, `npm run typecheck`, `npm run test`,
`npm run build` : verts. `npm run dev` : `/login` et `/offline` en 200, 0 erreur de compilation
(le worker ne s'enregistre pas en dev : cette porte prouve le rendu, pas le préchargement).

## Ce qui n'est PAS affirmé

- « Lancement iPhone corrigé » : non. Le préchargement retire le démarrage du worker, pas un
  démarrage à froid de la fonction Vercel (lot P1) ni les données en série de `/app` (lot P2).
- Le préchargement n'est actif qu'après le clic sur « Recharger » ou une fermeture complète de
  l'app (pas de `skipWaiting` à l'installation) : le premier lancement après le déploiement n'est
  pas plus rapide.

## Revue sécurité (`security-auditor`, Opus)

Verdict : OK, avec des changements non bloquants. Aucun chemin ne met une page en cache ni ne
rejoue un jeton à usage unique ; cookies, CSP et `Vary` inchangés ; aucune redirection construite
par le worker. Point moyen retenu : un revert supprime aussi les tests et cet avertissement. La
procédure « désactiver d'abord, retirer ensuite » est donc aussi écrite dans la description de la
PR et transmise à l'orchestrateur pour la ligne du lot P dans le `ROADMAP` (portée par une autre
PR, pour ne pas créer de conflit ici). Point faible, non vérifiable hors appareil : le traitement
par WebKit d'une redirection opaque préchargée dans une PWA autonome, couvert par le contrôle
ci-dessous.

## Contrôle sur l'appareil par @thierry

Depuis l'écran d'accueil, PWA installée : toucher « Recharger » quand le bandeau apparaît, puis
lancer l'app connecté, puis déconnecté ; vérifier la locale EN ; mode avion → `/offline` ; le
bandeau « Recharger » fonctionne toujours au déploiement suivant. Puis, préchargement actif :
lancement à froid vers `/app` → `/login`, connexion jusqu'au retour par `/auth/callback?code=`
sans erreur « code déjà utilisé », et un lien de réinitialisation du mot de passe qui aboutit.

## Definition of Done

1. CI : _à compléter avec le run de la PR._
2. Sourcery et Codex : _à compléter._
3. Revue humaine : en attente de @thierry.
4. Conflits avec `main` : _à compléter._
5. Ce rapport.
