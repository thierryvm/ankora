# ADR-004 — Logger structuré : Pino côté Node, wrapper minimal côté Edge

- **Statut** : Accepted
- **Date** : 2026-04-20
- **Accepté le** : 2026-04-20 par Thierry vanmeeteren
- **Deciders** : Thierry vanmeeteren (Product Owner), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `observability`, `security`, `gdpr`, `ops`
- **Portée** : toute la couche serveur Ankora (Server Components, Server
  Actions, Route Handlers, middleware, jobs).
- **En lien avec** :
  - [ADR-003](./ADR-003-notifications-system.md) — capteur maison doit logger
    via le même canal structuré.
  - `docs/security/AUDIT-2026-04-20.md` — gap P2 identifié lors de l'audit
    cybersécurité.

---

## Contexte

L'audit cybersécurité du 2026-04-20 a identifié l'**absence de logger
structuré** comme un gap opérationnel P2. Les surfaces server s'appuient
aujourd'hui sur `console.log` / `console.error` bruts. Conséquences :

1. **Incident response dégradée** — pas de `trace_id` pour relier les
   événements d'une même requête, pas de niveau (`debug` / `info` / `warn` /
   `error` / `fatal`), pas de corrélation avec les logs Vercel.
2. **Audit RGPD affaibli** — pas de redaction automatique des clés PII
   (email, token, cookies). Un oubli dans un `console.error(err)` peut
   fuiter un objet complet avec payload sensible dans les logs Vercel.
3. **Observabilité future** — PR-B1 (bug-reporting MVP) et ADR-003
   (notifications) vont multiplier les points d'émission de logs. Sans
   contrat, on entre dans l'enfer du grep.

Ankora est en phase vitrine, budget 0 €, stack Next.js 16 App Router (mix
runtime Node + Edge), Supabase Postgres, Vercel. La contrainte clé : **pas
de dépendance payante**, **pas de lock-in vendor**, **compatible Edge
Runtime** (middleware).

---

## Drivers de décision

- **D1. Budget 0 €** — pas d'Axiom, pas de Logtail, pas de Datadog.
  Free tier OK s'il est durable et exportable.
- **D2. Edge-compat** — le middleware (`src/proxy.ts`) tourne en Edge
  Runtime : pas d'accès à `fs`, pas de Workers Node. Tout logger doit
  fonctionner en Edge **ou** avoir un wrapper spécifique.
- **D3. RGPD EU** — redaction native de champs PII. Pas d'envoi hors UE
  par défaut.
- **D4. Pas de vendor lock** — le format (JSON line) doit être portable,
  ingérable par n'importe quel SIEM plus tard (Loki, ClickHouse,
  Grafana Cloud free tier, etc.).
- **D5. Coût cognitif minimal** — un seul import, API plate, pas de config
  par fichier, pas de transport exotique à comprendre.
- **D6. Performance** — le logger ne doit pas être le goulot d'un Server
  Action. Budget : < 1 ms d'overhead par log en Node, < 50 µs en Edge.

---

## Options envisagées

### Option A — Pino (retenue)

**Ce que c'est.** Logger JSON léger, maintenu par la Linux Foundation,
standard de facto dans l'écosystème Node. Zéro dépendance transitive. API
plate (`logger.info(...)`, `logger.child({ trace_id })`).

**Pro.**

- ~ 5 µs par log en Node (benchmarks publics), plus rapide que Winston.
- `pino.redact` natif : on liste les chemins PII (`*.email`, `*.token`,
  `*.password`, `headers.cookie`), le logger les remplace par `[Redacted]`
  avant sérialisation. Impossible de fuiter par oubli.
- Format JSON line sortable vers stdout → Vercel aggregator →
  n'importe quel SIEM plus tard.
- `pino-pretty` disponible en dev pour lecture humaine.
- Compatible avec AsyncLocalStorage pour propager `trace_id` sans passer
  l'objet partout.
- Licence MIT.

**Con.**

- **Ne tourne pas en Edge Runtime natif** (utilise `process.stdout.write`,
  `worker_threads` optionnels). Nécessite un wrapper Edge.
- API de `child logger` légèrement verbose pour bindings.

**Mitigation du con.**

- `src/lib/log.ts` expose une API unifiée. En Node, elle délègue à Pino. En
  Edge (détecté via `process.env.NEXT_RUNTIME === 'edge'` ou test de
  `globalThis.EdgeRuntime`), elle délègue à un **wrapper minimal maison
  (~ 40 lignes)** qui émet le même format JSON line via `console.log` —
  Vercel ingère les deux.
- Le format reste identique, seul le transport change.

### Option B — Winston

**Ce que c'est.** Le logger Node historique, plus ancien, plus d'options
de transport.

**Pro.**

- Plus de transports natifs (fichier, HTTP, syslog).
- Très documenté.

**Con.**

- ~ 5 × plus lent que Pino (benchmarks publics).
- Bundle ~ 3 × plus lourd.
- Edge-incompatible aussi, et les workarounds sont plus lourds que pour Pino.
- Redaction PII non native (il faut écrire un `format.printf` custom).

**Verdict** : Pino fait tout ce que Winston fait et mieux, pour notre
usage. Winston n'a d'avantage que si on exige les transports natifs
exotiques — pas notre cas (Vercel ingère stdout).

### Option C — `console.*` enrichi maison

**Ce que c'est.** Un wrapper de 50 lignes autour de `console.log` qui
injecte `timestamp`, `level`, `trace_id`, `redact`. Pas de dépendance.

**Pro.**

- Zéro dépendance.
- Edge-compatible par construction.
- On maîtrise 100 % du comportement.

**Con.**

- Pas de redaction robuste (il faut la coder nous-mêmes, et écrire un
  redactor JSON correct est un piège : paths profonds, arrays, circular
  refs, Symbols — c'est exactement ce que Pino a déjà debugué).
- Pas de `child()` logger natif → chaque binding à passer explicitement.
- Pas d'échantillonnage ni de serializers prédéfinis (`err`, `req`, `res`).
- La maintenance retombe sur nous.
- Pas de communauté à interroger.

**Verdict** : tentant sur le papier (zéro dep, ADR-001 philosophie
"no-dep-tierce-si-maison-faisable"), mais le coût de réécrire correctement
`pino.redact` seul dépasse le bénéfice. Pino pèse ~ 60 KB bundle, MIT,
Linux Foundation : ce n'est pas le même risque qu'une dep SaaS.

### Option D — SaaS gratuit (Axiom free tier, Logtail, Grafana Cloud)

**Ce que c'est.** Service externe qui ingère logs via HTTP, fournit UI
de recherche.

**Pro.**

- UI clé en main, recherche plein texte, alerting.

**Con.**

- Vendor lock (format propriétaire côté UI).
- Transit hors Vercel → latence + PII qui sort du périmètre Vercel
  pour aller dans un autre DC (RGPD : DPA à négocier, même en free).
- Free tier qui peut basculer payant à tout moment.
- Contraire à D4 (pas de lock-in) et D3 (RGPD strict).

**Verdict** : inadapté au budget 0 € durable et à la posture RGPD vitrine.
À reconsidérer si Ankora devient rentable et que les volumes explosent.

---

## Décision

**Option A — Pino côté Node, wrapper Edge maison, façade unique
`src/lib/log.ts`.**

### 1. Façade `src/lib/log.ts`

```ts
import type { LogLevel } from './log-types';

interface Logger {
  trace(msg: string, bindings?: Record<string, unknown>): void;
  debug(msg: string, bindings?: Record<string, unknown>): void;
  info(msg: string, bindings?: Record<string, unknown>): void;
  warn(msg: string, bindings?: Record<string, unknown>): void;
  error(msg: string, bindings?: Record<string, unknown>): void;
  fatal(msg: string, bindings?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export const log: Logger =
  process.env.NEXT_RUNTIME === 'edge' ? createEdgeLogger() : createNodeLogger();
```

### 2. Pino côté Node

```ts
import pino from 'pino';

function createNodeLogger(): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    redact: {
      paths: [
        '*.email',
        '*.password',
        '*.token',
        '*.access_token',
        '*.refresh_token',
        '*.authorization',
        'headers.cookie',
        'headers.authorization',
        'req.body.password',
      ],
      censor: '[Redacted]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { app: 'ankora', env: process.env.VERCEL_ENV ?? 'local' },
  });
}
```

### 3. Wrapper Edge (~ 40 lignes)

```ts
function createEdgeLogger(): Logger {
  const emit = (level: LogLevel, msg: string, bindings?: Record<string, unknown>) => {
    const redacted = redactShallow(bindings ?? {});
    console.log(
      JSON.stringify({
        level,
        time: new Date().toISOString(),
        msg,
        app: 'ankora',
        env: process.env.VERCEL_ENV ?? 'edge',
        ...redacted,
      }),
    );
  };
  return {
    trace: (m, b) => emit('trace', m, b),
    debug: (m, b) => emit('debug', m, b),
    info: (m, b) => emit('info', m, b),
    warn: (m, b) => emit('warn', m, b),
    error: (m, b) => emit('error', m, b),
    fatal: (m, b) => emit('fatal', m, b),
    child: (bindings) => childOf(bindings, emit),
  };
}
```

Le `redactShallow` Edge traite les clés PII classiques (email, token,
password) au niveau 1 uniquement — le middleware ne logge pas d'objets
profonds, c'est suffisant. Si un jour on en a besoin, on exporte la logique
`pino.redact` dans un utilitaire partagé.

### 4. Propagation `trace_id` via AsyncLocalStorage (Node)

Middleware `src/proxy.ts` génère un `trace_id = nanoid()` (réutilise
l'existant) et le pose en header `x-trace-id`. Côté Node, un helper
`withTrace(traceId, fn)` l'injecte dans l'AsyncLocalStorage ; tout
`log.info(...)` dans le scope hérite du `trace_id`. Côté Edge, le middleware
fait `log.child({ trace_id }).info(...)` explicitement (pas d'ALS en Edge).

### 5. Format de sortie (normatif)

```json
{
  "level": "info",
  "time": "2026-04-20T09:12:34.567Z",
  "app": "ankora",
  "env": "production",
  "trace_id": "aB3cD4eF",
  "msg": "user signed in",
  "user_id": "uuid",
  "workspace_id": "uuid"
}
```

Règles :

- **Pas d'email brut** dans `user_id` ou `bindings` — on logue toujours
  l'UUID, jamais l'email ou le téléphone.
- **Pas de stack trace** en `info` / `warn` ; uniquement en `error` /
  `fatal`, via le serializer `err`.
- **Pas de cookies ni de tokens** — redaction auto.
- **`trace_id`** : mandatory pour tout log émis dans le cycle d'une requête.

### 6. Règles d'écriture

- `log.error(msg, { err })` avec un objet `Error` → Pino sérialise
  proprement (stack, message, cause).
- `log.warn` pour les rate-limit hits, validation échecs, OAuth refus.
- `log.info` pour les événements business (login, logout, workspace créé,
  bucket invariance recalculée).
- `log.debug` pour les traces techniques de dev, désactivé en prod par défaut.
- **Pas** de `console.log` / `console.error` hors `src/lib/env.ts` (bootstrap)
  et `src/lib/log.ts` (implémentation). Lint rule à ajouter (ESLint
  `no-console` sauf allowlist).

### 7. Rétention & export

- Vercel conserve les logs stdout ~ 30 jours (plan Hobby / Pro).
- Pour les événements business critiques (sécurité, RGPD), l'`audit_log`
  Supabase reste **la source de vérité**. Le logger est l'**observabilité
  opérationnelle**, pas la trace légale.
- Si un jour Ankora monte en volume, on ajoute un transport (Loki,
  Grafana Cloud free tier EU, ou Vercel Log Drain vers Supabase Storage).
  Le format JSON line reste compatible.

---

## Conséquences

### Positives

- Observabilité propre dès PR-B1, corrélation par `trace_id`.
- Redaction PII automatique — baseline RGPD sans effort supplémentaire.
- Edge + Node couverts par une seule façade.
- Bundle impact négligeable (~ 60 KB Node, 0 KB Edge).
- Format portable : export vers n'importe quel SIEM plus tard.
- Lint rule `no-console` renforce la discipline.

### Négatives

- Un nouveau fichier `src/lib/log.ts` + une dep (`pino`, `pino-pretty` en dev).
- La migration des `console.*` existants demande un sweep (environ 8
  occurrences identifiées lors de l'audit — coût : 15 min).
- Le wrapper Edge doit rester simple : si on est tenté de le complexifier,
  il faut passer sur un vrai logger Edge-native (pas encore mainstream en
  2026).

### Neutres

- La politique de log (quoi logger à quel niveau) reste à documenter
  progressivement via des exemples dans le code et un paragraphe dans
  `docs/observability.md` (à créer en PR séparée).

---

## Plan d'implémentation

1. **PR courte "feat(log): introduce Pino with Edge wrapper"** — ajout
   `pino` + `pino-pretty` (devDep), création `src/lib/log.ts`, sweep des 8
   `console.*` existants (hors bootstrap), ajout règle ESLint `no-console`
   avec allowlist, tests unitaires façade (redaction + level gating).
2. **Doc légère `docs/observability.md`** — exemples d'usage, conventions
   de bindings (`user_id`, `workspace_id`, `event`, `trace_id`), rappel
   des interdits (pas d'email, pas de token, pas de stack en `info`).
3. **Intégration middleware** — `trace_id` déjà généré dans
   `src/proxy.ts` : l'exposer via header `x-trace-id` + le passer en
   binding pour `log.child({ trace_id })` côté Edge.
4. **PR-B1** (bug-reporting MVP) consomme le logger dès le départ —
   pas besoin de refactor après coup.

---

## Risques résiduels

- **R1. Edge wrapper diverge de Pino** — si on ajoute de la logique
  métier dans Pino (serializers custom, hooks) sans la répliquer dans
  l'Edge wrapper, on obtient des logs de format différent selon le runtime.
  **Mitigation** : test d'intégration qui loggue depuis un middleware
  (Edge) et depuis un Server Action (Node) et vérifie que le JSON émis
  a la même forme.
- **R2. PII qui fuit par un chemin non prévu** — `pino.redact` gère les
  paths déclarés ; un nouveau champ PII ajouté sans mise à jour de la
  liste fuite. **Mitigation** : revue de code explicite sur tout
  `log.*(msg, bindings)` qui ajoute un nouveau champ, et test e2e qui
  scanne 24 h de logs pour des patterns email / JWT.
- **R3. Volume Vercel** — en prod vitrine les volumes sont faibles ; si
  Ankora décolle, les logs Vercel peuvent être coûteux ou tronqués.
  **Mitigation** : niveau par défaut `info` en prod, `debug` désactivé ;
  revoir dans 6 mois si trafic > 1k req/h.

---

## Références

- Pino — https://github.com/pinojs/pino (Linux Foundation project, MIT).
- Benchmarks Pino vs Winston — https://github.com/pinojs/pino/blob/main/docs/benchmarks.md
- Next.js runtime detection — https://nextjs.org/docs/app/api-reference/edge#edge-runtime
- RGPD art. 32 — sécurité du traitement, pseudonymisation, minimisation
  des données de log.
- ADR-003 (notifications) — cf. capteur maison, logger est le canal.
- `docs/security/AUDIT-2026-04-20.md` — gap P2 "Structured logging".

---

**Décision acceptée le 2026-04-20.** Toute modification requiert un ADR de supersession (ADR-NNN) qui documente la bascule.
