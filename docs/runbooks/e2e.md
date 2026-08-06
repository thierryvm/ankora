# Runbook — tests end-to-end

Comment faire tourner la suite Playwright, et surtout **ce qui la fait mentir**.

---

## ⚠️ Avant toute commande `supabase`

Ce dépôt est **lié au projet de production** (`supabase/.temp/project-ref` →
`fkscfvoouwufyjwnfvhb`, `ankora-prod`). Deux conséquences non négociables :

```bash
npm run preflight        # exiger un GO avant toute commande supabase
```

- `supabase start` / `stop` / `db reset` visent **la stack locale**. Sans danger.
- **`supabase db reset --linked` détruirait la production.** Le drapeau `--linked`
  ne s'utilise jamais sur une commande destructive, dans aucun contexte.

**Angle mort comblé le 27 juillet 2026.** Le préflight ne se contentait plus de
lire le _fichier_ de lien : il demande désormais à la CLI Supabase ce qu'elle
voit **avec les identifiants qu'elle utilisera vraiment**, et exige d'y trouver
`ankora-prod` marqué `linked`. Même chose côté Vercel via `vercel whoami`.

À savoir : @thierry a **deux comptes Supabase**. Le premier porte une
organisation nommée « ankora » qui ne contient que le projet airsoft ;
`ankora-prod` vit sur le second. Le signe qui les distingue en une seconde —
si `audit_log` a une colonne `event_type`, c'est Ankora ; si elle a `actor_id`,
c'est l'airsoft.

---

## Les deux jobs CI, et ce que chacun prouve

| Job                              | Supabase                | Ce qu'il prouve                                               |
| -------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `Playwright E2E`                 | valeurs factices        | surface publique : landing, SEO, en-têtes, a11y, consentement |
| `Playwright E2E (authenticated)` | **stack locale réelle** | 7 des 13 specs authentifiées (6 en quarantaine, cf. plus bas) |

Avant le 26 juillet 2026, seul le premier existait : **214 cas passaient, 173
sautaient** — 44,7 % de la suite. Tous les parcours connectés étaient dans les 173. Un `gh pr checks ✅` ne disait donc rien des surfaces les plus sensibles.

### Trois choses empêchaient le second d'exister

**1. La détection de « vraie Supabase » reniflait l'URL.** `adminClientOrNull()`
sautait dès que l'URL contenait `localhost:54321` — l'adresse exacte servie par
`supabase start`. Démarrer une stack n'aurait rien changé. La disponibilité est
désormais **déclarée** par `E2E_SUPABASE_READY=1`, et une déclaration fausse lève
une exception au lieu de sauter en silence.

**2. Notre limiteur bloquait la suite.** `rateLimit('auth', …)` autorise 5
tentatives / 15 min **par IP**, et la suite dépasse la centaine de connexions
réelles. `e2e/helpers/test.ts` donne à chaque test son propre `x-forwarded-for` —
l'en-tête dont l'app dérive déjà l'adresse de l'appelant. Aucune ligne de code de
production modifiée ; aucun risque ajouté, Vercel réécrit cet en-tête en amont.

**3. Celui de Supabase aussi.** GoTrue applique ses propres quotas, indépendants
des nôtres : `sign_in_sign_ups` vaut 30 par 5 min et par IP par défaut. Relevés
dans `supabase/config.toml` **pour la stack éphémère uniquement** — la production
se configure dans le dashboard. Sans cela, la suite échouait en affichant ce qui
ressemble à un login cassé.

---

## Lancer la suite en local

### Surface publique

```bash
npm run e2e
```

### Parcours authentifiés, contre la stack locale

**Deux écarts avec la CI empêchent ce job de tourner, et aucun des deux ne se
signale par un message clair.** Mesurés le 6 août 2026, après un premier montage
maison qui rendait **31 échecs et 10 réussites** là où la CI en passe 40.

**1. Épingler la CLI Supabase sur la version de la CI.** `npx supabase` prend la
dernière version publiée ; la CI épingle `2.84.2` (`supabase/setup-cli@v1` dans
`ci.yml`). Entre les deux, les **droits par défaut du schéma `public` ont
changé** : sous une CLI récente, `service_role` reçoit `Dxtm` — ni `SELECT`, ni
`INSERT`, ni `UPDATE`. Le semis échoue alors sur `permission denied for table
users`, et **tout parcours authentifié tombe**.

```bash
npx --yes supabase@2.84.2 start     # applique les migrations sur une base vide
npx --yes supabase@2.84.2 status -o json   # relève ANON_KEY / SERVICE_ROLE_KEY

# Contrôle en une ligne — doit rendre « t|t » :
docker exec supabase_db_ankora psql -U postgres -d postgres -tAc \
  "select has_table_privilege('service_role','public.users','SELECT'),
          has_table_privilege('service_role','public.users','UPDATE')"
```

> **Ce que cet écart révèle, et qui reste ouvert** : les migrations ne posent
> aucun `GRANT` — elles s'appuient sur les droits par défaut de la plateforme.
> La CI n'est verte que parce qu'elle épingle une version ancienne. Le jour où
> cet épinglage bouge, le job meurt ; et un projet Supabase créé aujourd'hui ne
> fonctionnerait pas. Mesuré : la production **a** ces droits, une base neuve
> **ne les a pas**. Correctif durable = une migration qui accorde explicitement,
> à traiter en session dédiée (touche `supabase/migrations/`, donc revue).

**2. Le limiteur de débit doit être joignable, sinon il refuse tout.**
`npm run start` tourne en `NODE_ENV=production`, et en production `rateLimit()`
échoue **fermé** : sans Upstash atteignable, la connexion renvoie « Service
temporairement indisponible » et **rien** ne passe. L'écran ne dit pas
« rate limit » — d'où l'heure perdue à soupçonner l'application.

Plutôt qu'un vrai compte Upstash, monter le même conteneur que la CI — zéro
identifiant, zéro euro, hors ligne :

```bash
docker network create ankora-e2e
docker run -d --name ankora-e2e-redis --network ankora-e2e redis:7-alpine
docker run -d --name ankora-e2e-srh --network ankora-e2e -p 8079:80 \
  -e SRH_MODE=env -e SRH_TOKEN=ci-local-not-a-secret \
  -e SRH_CONNECTION_STRING=redis://ankora-e2e-redis:6379 \
  hiett/serverless-redis-http@sha256:5b0bb9239fce53abf87b2018a7a0deb9ec7bd900c5360738fe5fbeeb426f9150
```

Puis exporter `UPSTASH_REDIS_REST_URL=http://localhost:8079` et
`UPSTASH_REDIS_REST_TOKEN=ci-local-not-a-secret`.

À l'arrêt : `docker rm -f ankora-e2e-srh ankora-e2e-redis`.

Puis, avec l'environnement pointé sur la stack locale
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, les deux clés,
`E2E_SUPABASE_READY=1`, et les deux variables Upstash ci-dessus) :

```bash
npm run build && npm run start
npx playwright test $(node scripts/e2e-auth-specs.mjs --list | tr '\n' ' ') \
  --project=chromium-desktop --project="iPhone 14" --workers=1
```

### Parcours authentifiés, contre la PRODUCTION

```bash
npm run e2e:auth -- accounts        # nommer ce qu'on valide
```

Seul moyen de valider contre le **schéma réel**, ce qu'aucune stack locale ne
fait. Les utilisateurs semés sont éphémères et supprimés en `finally`.

---

## Les pièges qui coûtent une heure

**`PLAYWRIGHT_BASE_URL` n'existe pas ici.** La variable lue est **`E2E_BASE_URL`**
(`playwright.config.ts:4`). Une valeur posée dans l'autre est ignorée sans un mot,
et les specs tapent sur le port par défaut.

**Le port 3000 est occupé par un autre site local.** Utiliser un port dédié
(`PORT=3150` + `E2E_BASE_URL=http://localhost:3150`) et ne jamais tuer le
processus qui écoute sur 3000.

**Les ports Supabase sont décalés** (`54421` / `54422` / `54424`, pas `5432x`).
Le projet professionnel de @thierry fait tourner sa propre stack sur les ports par
défaut ; `supabase start` proposait d'arrêter **celle-là**. Les deux coexistent
désormais.

**`npm run start` impose `NODE_ENV=production`, où `rateLimit()` échoue fermé.**
Si le tout premier appel renvoie « Service temporairement indisponible », ce n'est
pas un quota : c'est un Upstash injoignable. Le symptôme frappe aussi bien les
mutations que les connexions.

**`playwright.config.ts` ne charge pas `.env.local`.** L'environnement doit être
exporté par l'appelant.

**`--workers=1`** reste nécessaire : les specs partagent la base.

---

## Sélection des specs authentifiées

`e2e/authenticated-specs.json` est la liste committée ; `scripts/lib/auth-specs.mjs`
la compare à ce qu'il découvre dans le code, à chaque exécution, **dans les deux
sens**. Une spec qui cesse d'être détectée (fixture renommée, indirection nouvelle,
suppression) fait échouer le job au lieu de rétrécir la couverture sans le dire.

C'est arrivé : le prédicat ne cherchait que `adminClientOrNull` et ratait les trois
specs qui sèment via la fixture `seededUser`. `npm run e2e:auth -- --all`
annonçait tout couvrir en n'exécutant que 9 specs sur 13.

**Ajouter une spec authentifiée = ajouter son chemin dans le JSON, même commit.**

### Quarantaine

Le même fichier porte une section `quarantine` : des specs **découvertes, listées,
comptées, mais pas exécutées**, chacune avec sa raison écrite. Le job l'imprime
intégralement à chaque exécution — une quarantaine que personne ne voit n'est
qu'un skip mieux élevé.

Six specs y sont entrées le 26 juillet 2026, et elles racontent toutes la même
histoire : **elles décrivent un tableau de bord qui n'existe plus**. Elles ont été
mergées, le cockpit a été reconstruit (Situation Hero, THI-327), et rien n'a
protesté puisqu'elles ne tournaient nulle part. Trois d'entre elles cherchent des
`data-testid` présents dans **zéro** fichier de `src/` ; trois autres cherchent un
rôle `heading` sur `CardTitle`, qui rend une `<div>`.

Ce dernier point est aussi un **défaut d'accessibilité réel** : les titres de
section du tableau de bord ne sont pas des titres pour un lecteur d'écran. Corrigé
dans sa propre PR, pas ici.

Sortir une spec de quarantaine = la réécrire contre l'UI actuelle, puis supprimer
son entrée. La liste doit rétrécir, jamais grandir en silence.

---

## Ce que la CI prouve, et ce qu'elle ne prouve pas

Depuis le 26 juillet 2026, `main` exige **quatre** checks :
`Lint + Typecheck + Unit Tests`, `Security audit`, `Playwright E2E` et
`Playwright E2E (authenticated)`. Avant cette date, **aucun** check n'était
requis : tous les jobs pouvaient être rouges sans empêcher une fusion.

Ce qui reste hors de portée de la CI : les **six specs en quarantaine**
ci-dessus, et tout ce qui ne s'observe que contre le schéma de production
(`npm run e2e:auth`, lancé à la main).
