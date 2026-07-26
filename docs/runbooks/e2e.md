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

**Angle mort connu du préflight** (relevé le 26 juillet 2026) : il vérifie le
_fichier_ de lien, pas le compte que le CLI utilise réellement. Sur cette machine,
un `supabase` lancé sans `--env-file=.env.local` s'authentifie sur un **autre
compte Supabase**, qui ne voit même pas `ankora-prod` — un `supabase projects list`
nu ne l'affiche pas. Le durcissement du préflight est tracé pour une PR dédiée
(l'infrastructure de garde-fous ne se modifie pas dans une PR de feature).

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

```bash
npm run preflight
supabase start                      # applique les 15 migrations sur une base vide
supabase status -o json             # relève ANON_KEY / SERVICE_ROLE_KEY
```

Puis, avec l'environnement pointé sur la stack locale
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`, les deux clés,
`E2E_SUPABASE_READY=1`, un endpoint compatible Upstash sur `:8079`) :

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

## Ce que la CI ne prouve toujours pas

Le job `e2e-authenticated` n'est **pas** dans les checks requis de la branche
protégée : modifier la protection de branche relève d'une PR dédiée à revue
humaine. Tant que ce n'est pas fait, **il peut être rouge sans bloquer une
fusion**. Suivi côté @thierry.
