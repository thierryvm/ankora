# ADR-048 — Les pages publiques se servent depuis le cache

- **Statut** : Proposé (30 octobre 2026). Passe à « Accepté » seulement si la preuve du §6
  est rendue sur une branche d'essai, avant toute PR de code mergée, **et** si @thierry
  tranche la question Q1 (§5).
- **Relu par** : `plan-reviewer`, 30 octobre 2026 — 🟡 approuvé avec onze changements,
  tous intégrés dans cette version.
- **Cite** : audit `docs/audits/2026-05-19-thi-225-perf-investigation-1sec-nav-lag.md`
  (pistes F4 et F6, jamais livrées), PR #487 (lectures `/app` en moins de vagues),
  PR #469 (la landing renvoie un visiteur connecté vers le cockpit), THI-277 (la barre
  d'onglets montée une fois à la racine de locale), `CLAUDE.md` §« Choix techniques lockés ».

## 1. Contexte

@thierry rapporte, le 30 octobre 2026, des pages « très lentes, plusieurs secondes ».
Mesuré le même jour en production, depuis la Belgique :

| Page                                                        | Serveur endormi                              | Serveur réveillé       |
| ----------------------------------------------------------- | -------------------------------------------- | ---------------------- |
| `/`                                                         | 2,37 s au premier octet (**un seul relevé**) | 0,23 à 0,45 s          |
| `/login`, `/signup`, `/faq`, `/glossaire`, `/legal/privacy` | non relevé                                   | 0,16 à 0,30 s          |
| `/app` et ses pages, chargement complet                     | non relevé                                   | 0,42 à 0,90 s affichée |
| `/app` et ses pages, navigation par lien                    | non relevé                                   | 0,31 à 0,48 s          |

Relevés publics : `curl -sS -o /dev/null -D - -w "code=%{http_code} ttfb=%{time_starttransfer}" https://ankora.be<chemin>`,
trois fois par page. Toutes les réponses portaient `Cache-Control: private, no-cache,
no-store, max-age=0, must-revalidate`, `X-Vercel-Cache: MISS` et
`X-Vercel-Id: cdg1::fra1::…`. Relevés `/app` : `performance.getEntriesByType('navigation')`
et les entrées de ressources `_rsc`, dans un navigateur connecté.

Fluid Compute est **déjà activé**. Relevé avec
`vercel api "/v9/projects/<id>?teamId=<équipe>" --raw`, sous le contexte perso :
`resourceConfig = {"fluid":true,"functionDefaultRegions":["fra1"], …}`. La région est
celle de Supabase. À chaud, rien n'est lent : le coût est le **réveil**. Sur un site à
faible trafic, le serveur s'endort entre deux visites.

Les pages publiques n'ont rien de personnel. Elles paient ce réveil parce que **toutes**
les réponses sont calculées à la demande. Le rendu d'une page publique lit la requête en
sept endroits :

1. **Le nonce CSP**, que lisent `ThemeBootScript` et `JsonLd` (dans le layout racine) et
   la landing (`(public)/page.tsx`). La documentation de Next 16 dit qu'un nonce impose le
   rendu dynamique de toutes les pages
   (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, §« Static vs
   Dynamic Rendering with CSP »).
2. **Le layout racine de locale**, partagé par le site et l'application : cookie `theme`,
   `getOptionalUser()`, `isAdmin()`.
3. **L'en-tête marketing** (`Header` variante `marketing`, `MktNav`), qui relit la session.
   L'`AccountButton` y porte **l'adresse e-mail** de l'utilisateur dans le rendu serveur.
4. **`shouldMountBottomTabBar`** (`src/lib/layout/bottom-tab-bar-state.ts`), appelé par
   `Header` et `Footer`, qui lit `headers()` (`x-pathname`) et la session.
5. **La landing** appelle `redirectIfSignedIn()` (#469).
6. **La locale** : aucune page `(public)` n'appelle `setRequestLocale`. `getTranslations`
   et `getLocale` sans locale explicite retombent sur `src/i18n/request.ts`, dont le repli
   lit `cookies()`, `getUser()` et `users.locale`.
7. **`src/i18n/request.ts`** fixe `now: new Date()`, qui serait figé au moment du build
   sur une page statique.

## 2. Périmètre

**Concernées** : le groupe `(public)` — `/`, `/faq`, `/glossaire`, `/glossaire/[slug]`,
`/legal/cgu`, `/legal/cookies`, `/legal/privacy`, `/offline`, dans chaque locale.

**Non concernées**, qui restent rendues à la demande : `(auth)`, `/app`, `/admin`,
`/onboarding`. Leurs réveils sont un autre chantier (§7).

## 3. Décision

### D1 — Deux politiques CSP, choisies par le chemin

**Politique statique** (pages du §2), sans nonce :

```
script-src 'self' 'sha256-<thème>' <empreintes des scripts en ligne de la route>
style-src  'self' <empreintes des blocs <style> en ligne de la route, s'il y en a>
```

- **Pas de `'strict-dynamic'`** : avec lui, `'self'` serait ignoré et chaque chunk
  devrait passer par une empreinte attachée à son attribut `integrity`. La prise en charge
  par WebKit n'est pas prouvée. Sans lui, `'self'` couvre les chunks servis par le domaine.
  Conséquence : **`experimental.sri` n'est pas requis** par cette décision. S'il est
  ajouté, c'est pour l'intégrité des fichiers, pas pour la CSP, et sa justification sera
  écrite.
- **Jamais `'unsafe-inline'`** dans `script-src`. Dans `style-src`, ce serait une décision
  séparée, écrite, jamais supposée.
- **Le JSON-LD perd son nonce sans dommage** : un bloc `application/ld+json` n'est pas
  exécuté, la CSP ne s'y applique pas.

**Politique à nonce** (toutes les autres routes) : celle d'aujourd'hui, **plus**
`'sha256-<thème>'` dans `script-src`. Le layout racine est partagé : `ThemeBootScript`
ne peut plus lire le nonce sans rendre dynamiques les pages du §2. Sans cette empreinte,
le script de thème serait bloqué sur `/app`. Une empreinte reste valide à côté de
`'strict-dynamic'`.

**Invariants**, chacun vérifié par un test :

- Les deux politiques ne diffèrent **que** par `script-src` et `style-src`. La CSP d'un
  document reste celle de son premier chargement pendant les navigations par lien
  (`/faq` → `/app`), donc toutes ses autres directives doivent être identiques.
- Toute route du groupe `(public)`, énumérée sur le disque, reçoit la politique statique ;
  toute autre route reçoit la politique à nonce.
- **Sur un chemin public, le proxy n'écrit plus de nonce sur la requête** (aujourd'hui,
  il pose `x-nonce` et `content-security-policy` sur la requête pour tout chemin). Next lit
  le nonce dans l'en-tête CSP de la requête : en laisser un ferait entrer **un nonce
  partagé entre utilisateurs** dans le cache.

### D2 — Le layout racine cesse de lire la requête

- **Thème** : `ThemeBootScript` lit déjà `localStorage`, puis la préférence du système,
  avant la peinture. La lecture du cookie `theme` côté serveur disparaît.
- **Locale** : chaque page du §2 et chaque `generateMetadata` appellent `setRequestLocale`
  et passent la locale explicitement à `getTranslations`.
- **Ce qui dépend de l'utilisateur sort du HTML des pages publiques** : l'`AccountButton`
  et son e-mail, le choix « Se connecter » ou « Mon cockpit », la barre d'onglets. Sur une
  page publique, ils deviennent des composants client. Ils ne servent qu'à **l'affichage,
  jamais à autoriser quoi que ce soit** : `requireUser()` et `requireAdmin()` restent les
  seuls gardiens, côté serveur, inchangés.
- **Coût** : le client Supabase du navigateur (`@/lib/supabase/client`, importé nulle part
  aujourd'hui) entre dans le bundle de la landing. Lighthouse est donc dans la preuve.
- **La barre d'onglets** : voir Q1. `BottomTabBarSlot` est un frère de `children` dans
  le layout racine. Un layout enfant ne peut le nourrir ni par props ni par contexte.

### D3 — La redirection de la landing passe dans le proxy

#469 renvoie un visiteur connecté de `/` vers `/app`. Une page servie depuis le cache ne
peut plus en décider. Le proxy, lui, appelle déjà `getUser()` : il connaît le verdict
**vérifié**. Sur la landing seulement, si next-intl n'a pas déjà rendu une redirection et
si le verdict dit « connecté », il répond par un 307 vers le cockpit de la locale
résolue. Ce 307 porte `Cache-Control: private, no-store`. Un second facteur encore dû est
rattrapé par `requireUser()` sur `/app`, au prix d'une redirection de plus.

### D4 — Le proxy reste sur le chemin

Le proxy garde le routage de locale et le rafraîchissement de session de qui porte un
cookie. Il s'exécute **avant** le cache, en Node : il reste un code serveur, avec son
propre réveil. Le gain réel de cet ADR dépend de ce coût, encore inconnu. C'est pourquoi
la preuve fixe un seuil à froid (§6, point 7).

## 4. Options écartées

- **Tout laisser à la demande et garder le serveur éveillé** par un appel planifié. Cela
  ne retire aucun coût, cela en ajoute un. Ça peut compléter les pages `/app`, pas
  remplacer ce choix pour des pages sans contenu personnel. Décision séparée (§7).
- **Retirer la CSP des pages publiques, ou y admettre `'unsafe-inline'` en script.**
  Régression sur les pages les plus exposées. Refusé.
- **Deux layouts racines** (site et application). Chaque passage de l'un à l'autre
  recharge le document, et la barre d'onglets ne resterait plus montée du cockpit à la
  FAQ (THI-277). Refusé.
- **Partial Prerendering.** Incompatible avec une CSP à nonce, selon la même
  documentation. Écarté tant que `/app` garde le nonce.
- **Forcer le rendu statique par `dynamic = 'force-static'`.** Cette option rend
  `headers()` et `cookies()` vides en silence : elle masquerait les lectures au lieu de
  les retirer. Interdit.

## 5. Question pour @thierry

**Q1 — La barre d'onglets sur les pages publiques.** Aujourd'hui, elle est rendue par le
serveur, présente dans le HTML, et ne se fie jamais au client
(`bottom-tab-bar-visibility.tsx`). Une page publique en cache ne peut pas la contenir pour
un visiteur connecté. Deux voies :

- **(a)** Sur les pages publiques, la barre apparaît **après l'hydratation**, d'après la
  session lue par le client : un indice d'affichage, pas une autorisation. Sur `/app` et
  `/admin`, la racine continue de la rendre côté serveur : ces routes restent dynamiques,
  donc le layout racine peut encore y lire la session. Le mécanisme qui distingue les deux
  cas à la racine sans rendre dynamiques les pages du §2 fait partie de la preuve (§6,
  point 3). Coût : un court instant sans barre en arrivant sur une page publique.
- **(b)** Pas de barre d'onglets sur les pages publiques, un lien « Mon cockpit » dans
  l'en-tête à la place.

Recommandation du pilote : **(a)**, si la preuve montre un mécanisme propre ; sinon (b).

## 6. La preuve qui fait passer cet ADR à « Accepté »

Sur une branche d'essai, **non mergée**, dans cet ordre. Un point en échec arrête l'essai.

1. **D'abord, en local, sur le HTML du build** (`next build`, puis les fichiers HTML
   produits sous `.next/server/app/`) : recenser **tous** les scripts et styles en ligne
   sans `src`. Ça comprend l'amorce `self.__next_f`, les morceaux de données RSC et les
   fonctions `$RC` / `$RS` de React. Leur texte est fixé au build, donc des empreintes
   par route sont calculables. **Rejet** si l'une de ces conditions se vérifie :
   - un script en ligne change d'une requête à l'autre ;
   - aucun mécanisme sûr ne porte les empreintes de la route jusqu'à l'en-tête CSP
     (manifeste produit après le build et lu par le proxy, ou équivalent) ;
   - l'en-tête obtenu dépasse 4 Ko sur la plus grosse page du §2.
2. `next build` classe chaque route du §2 comme statique, **sans `force-static`**.
3. Le mécanisme de Q1 retenu, montré : barre présente dans le HTML de `/app`, absente du
   HTML de `/faq`.
4. Sur la prévisualisation, deuxième requête sur `/`, `/faq`, `/glossaire`,
   `/legal/privacy` : `X-Vercel-Cache: HIT`. Aucune occurrence de `nonce=` dans le HTML
   servi, sur deux requêtes successives. Le corps servi à une requête **connectée** et à
   une requête **anonyme** sur `/faq` est identique octet pour octet.
5. **Zéro violation CSP**, sur Chromium et WebKit, sur ces pages et sur `/offline` déjà en
   cache dans le service worker : thème au démarrage, bannière de consentement, service
   worker, mesure d'audience après consentement, JSON-LD. Même vérification sur `/app`
   (empreinte du thème dans la politique à nonce).
6. **D3** :
   - une requête connectée sur `/` rend un 307 ; une requête anonyme sur la même URL rend
     ensuite un 200 `HIT` **sans `Set-Cookie`** ;
   - depuis `/app`, le lien du logo vers `/` aboutit sur `/app` ;
   - après un rafraîchissement de jeton, aucun `Set-Cookie` n'apparaît sur une réponse
     `HIT` anonyme.
7. **Seuil à froid.** Au moins cinq relevés du premier octet à froid (après au moins
   15 minutes sans visite) par page, avant et après. **Rejet** si la médiane après ne
   descend pas sous 0,8 s, ou n'est pas au moins divisée par deux.
8. Pas d'éclair de thème à 390 × 844, en clair comme en sombre : mesure au DOM au premier
   rendu.
9. `npm run dev` : une page publique et une page `/app` répondent 200, sans aucune
   violation CSP dans la console. En dev, `'unsafe-inline'` est ignoré par le navigateur
   dès qu'une empreinte est présente : la politique de dev doit en tenir compte.
10. Lighthouse sur la landing : performance ≥ 95, accessibilité, bonnes pratiques et SEO
    à 100.
11. Planchers e2e inchangés : 294 public, 81 authentifié.

## 7. Conséquences

- **Deux politiques CSP à tenir.** Les invariants de D1 sont ce qui empêche leur dérive.
- **Un test de build échoue** quand une route du §2 redevient dynamique. Aucun
  `force-static` ne le contourne. Chaque montée de Next rejoue les points 1 et 2 du §6.
- Le plan de la branche d'essai et celui de la PR de code reprennent les cinq critères de
  DONE du `CLAUDE.md` et la preuve du §6.
- **Revues obligatoires** avant le merge du code : `plan-reviewer` ; `security-auditor`
  (CSP, proxy, redirection, `next.config.ts`) ; `mobile-ios-auditor` (éclair de thème,
  WebKit).
- **Hors de cet ADR** : les réveils des pages `/app`. Deux pistes, chacune avec sa propre
  revue sécurité : vérifier la session dans le proxy sans appel réseau (`getClaims()`),
  et un appel planifié qui garde le serveur éveillé.
- **Retour arrière** : revenir sur la PR rend le nonce à toutes les pages. Aucune donnée
  n'est touchée.
