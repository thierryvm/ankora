# PR-B1 — Bug reporting MVP (capteur maison + admin panel embryonnaire)

> **Contexte projet obligatoire** — avant d'exécuter cette PR, **lire** `docs/ROADMAP.md` (ordre des PR, contrainte budget 0 €, BYOK IA Phase 2, arbitrage Sentry vs capteur maison tranché en faveur du capteur maison). Toute décision prise ici doit rester cohérente avec le ROADMAP.
>
> **Position dans la séquence** : PR-1 ✅ → PR-Q ✅ → PR-1bis ✅ (attendu) → PR-2 ✅ (attendu) → **PR-B1 (ici)** → PR-3 → PR-F → PR-B2.
>
> **Budget** : 0 €. Aucun service externe (Sentry, LogRocket, Bugsnag, Datadog **interdits** par décision Thierry du 2026-04-18). Tout reste dans l'infra Ankora (Supabase EU). Seule exception autorisée : GitHub API (gratuit pour repos publics) pour créer automatiquement des issues depuis l'admin panel.
>
> **Objectif** : donner à Thierry — et plus tard aux users Ankora — un moyen simple de signaler un bug technique ou UX, avec capture automatique du contexte (erreurs JS, route, viewport, locale, dernières actions user), stockage Supabase, et un admin panel minimaliste permettant d'exporter un **bundle markdown copiable en 2 clics vers Claude Code** ou de créer une **issue GitHub automatiquement**.
>
> **Principe directeur** : facilité d'utilisation > exhaustivité. Un user doit pouvoir signaler un bug en < 15 secondes depuis n'importe quelle page.

---

## 0 · Quality gates obligatoires (bloquants)

```
npm run typecheck    # 0 erreur, 0 any
npm run lint         # 0 erreur
npm run test         # tous les tests passent (nouveaux compris)
npm run test:e2e     # scénarios Playwright passent
npm run build        # build OK, toutes les routes générées
```

**Invariants à vérifier par grep en fin de PR** :

- Aucun import de `@sentry/*`, `logrocket`, `bugsnag`, `datadog` dans le projet.
- Aucune string FR hardcodée dans les nouveaux composants — tout passe par `t('…')` / `getTranslations('…')` (respect du socle PR-1bis).
- Aucune fuite de PII dans les tests snapshot (emails, mots de passe, tokens).
- `npm audit --production` : 0 high / 0 critical.

---

## 1 · Scope exact

### 1.1 Nouvelles dépendances (toutes gratuites, MIT)

```bash
npm install html-to-image@^1.11.13          # screenshot DOM → PNG, léger (~25 KB gzip), fonctionne PWA iOS/Android/desktop
npm install nanoid@^5.0.9                    # IDs courts pour breadcrumbs (déjà potentiellement présent, vérifier)
```

Zéro dépendance runtime au-delà. `html-to-image` est choisi contre `html2canvas` pour sa taille (~2× plus léger) et son meilleur support des polices web.

### 1.2 Fichiers créés (17 fichiers au total)

**Migrations Supabase (1)**

- `supabase/migrations/20260418_bug_reports.sql`

**Schemas (1)**

- `src/lib/schemas/bug-report.ts`

**Server Actions (1)**

- `src/lib/actions/bug-report.ts`

**Utilities (5)**

- `src/lib/admin/require-admin.ts`
- `src/lib/admin/breadcrumbs.ts`
- `src/lib/admin/scrub.ts`
- `src/lib/admin/bundle-export.ts`
- `src/lib/admin/github.ts`

**Composants client (4)**

- `src/components/bug-reporting/BreadcrumbProvider.tsx`
- `src/components/bug-reporting/ClientErrorCapture.tsx`
- `src/components/bug-reporting/BugWidget.tsx`
- `src/components/bug-reporting/BugModal.tsx`

**Error Boundary (1)**

- `src/components/bug-reporting/GlobalErrorBoundary.tsx`

**Pages admin (3)**

- `src/app/[locale]/app/admin/layout.tsx`
- `src/app/[locale]/app/admin/bugs/page.tsx`
- `src/app/[locale]/app/admin/bugs/[id]/page.tsx`

**Page publique help (1)**

- `src/app/[locale]/(public)/help/signaler-un-bug/page.tsx`

**Documentation (1)**

- `docs/admin/bug-triage.md`

### 1.3 Fichiers modifiés (5)

- `src/app/[locale]/layout.tsx` — injecter `<BreadcrumbProvider>` + `<ClientErrorCapture>` + `<GlobalErrorBoundary>` + `<BugWidget>`
- `src/lib/security/audit-log.ts` — ajouter les events `BUG_REPORT_CREATED`, `BUG_REPORT_STATUS_CHANGED`, `ADMIN_GITHUB_ISSUE_CREATED`
- `messages/fr-BE.json` — ajouter namespaces `bugReport` + `admin.bugs` + `help.reportBug`
- `messages/{nl-BE,en,es-ES,de-DE}.json` — stubs identiques FR-BE (traductions réelles = cohabitation avec PR-2, voir §9)
- `.env.example` — documenter `ADMIN_USER_IDS` + `GITHUB_ADMIN_TOKEN` + `GITHUB_REPO_OWNER` + `GITHUB_REPO_NAME`

### 1.4 Fichiers **NE PAS** toucher

- `src/lib/domain/**` — couche domaine pure, aucun lien avec bug reporting
- `src/app/[locale]/app/(dashboard)/**` — le dashboard reste intact
- Les composants PR-3 (n'existent pas encore — PR-3 vient après PR-B1)

---

## 2 · Architecture

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                      Root Layout [locale]                   │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │ <BreadcrumbProvider> (Context API, ring buffer) │       │
│   │                                                 │       │
│   │   ┌─────────────────────────────────────────┐   │       │
│   │   │ <ClientErrorCapture /> (useEffect)      │   │       │
│   │   │   - window.onerror                      │   │       │
│   │   │   - window.onunhandledrejection         │   │       │
│   │   │   - console.error interceptor (dev)     │   │       │
│   │   └─────────────────────────────────────────┘   │       │
│   │                                                 │       │
│   │   ┌─────────────────────────────────────────┐   │       │
│   │   │ <GlobalErrorBoundary>                   │   │       │
│   │   │   { children }                          │   │       │
│   │   │   Fallback UI si crash React            │   │       │
│   │   └─────────────────────────────────────────┘   │       │
│   │                                                 │       │
│   │   <BugWidget />  (floating button + Ctrl+Shift+B) │     │
│   └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
         │
         │ Submit via Server Action
         ▼
┌─────────────────────────────────────────────────────────────┐
│   createBugReport(FormData)                                 │
│   - rateLimit('bug_report', userId, 5/hour)                 │
│   - bugReportInputSchema.parse(input)                       │
│   - scrubPII(input)                                         │
│   - upload screenshot → Supabase Storage (si présent)       │
│   - INSERT bug_reports (RLS-scoped)                         │
│   - logAuditEvent(BUG_REPORT_CREATED, ...)                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│   Supabase `bug_reports` (RLS : user own / admin all)       │
│   Supabase Storage `bug-screenshots` (RLS identique)        │
└─────────────────────────────────────────────────────────────┘
         │
         │ requireAdmin() guard
         ▼
┌─────────────────────────────────────────────────────────────┐
│   /app/admin/bugs                                           │
│   - Liste filtrée (status, severity, période)               │
│   - Détail : bouton "Export bundle Claude Code"             │
│                bouton "Créer GitHub Issue"                  │
│                bouton "Marquer résolu"                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Ring buffer breadcrumbs

Le `BreadcrumbProvider` maintient un **tableau circulaire de 20 entrées maximum** en mémoire React (pas `localStorage` — on ne veut pas persister les actions user entre sessions).

Types d'événements captés :

- `navigation` — changement de route (hook `usePathname` + effect)
- `click` — clic sur bouton/lien (délégation sur `<body>`, capture phase)
- `form_submit` — soumission formulaire
- `server_action` — appel Server Action (wrapper `withBreadcrumb(actionName, () => action(...))`)
- `console_error` — erreur console (intercepté en dev uniquement pour éviter bruit)

Chaque entrée : `{ id: nanoid(6), type, label, timestamp, metadata? }`. Le `metadata` est **toujours passé par `scrubPII()`** avant enregistrement.

### 2.3 Garde admin

Pour Phase 1 : `requireAdmin()` lit `process.env.ADMIN_USER_IDS` (comma-separated UUIDs). Thierry est l'unique admin par défaut.

**Fondation PR-B2** : prévoir que ce check deviendra `user.role === 'admin'` en Phase 2. Créer dès maintenant la logique dans un fichier isolé `src/lib/admin/require-admin.ts` qui encapsule le mécanisme — remplacer l'implémentation plus tard sera trivial.

---

## 3 · Migration DB

### 3.1 SQL à poser dans `supabase/migrations/20260418_bug_reports.sql`

```sql
-- Enums
CREATE TYPE bug_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE bug_status   AS ENUM ('new', 'acknowledged', 'in_progress', 'resolved', 'wontfix', 'duplicate');

-- Table principale
CREATE TABLE bug_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id      UUID REFERENCES workspaces(id) ON DELETE SET NULL,

  -- Contenu utilisateur
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description       TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  severity          bug_severity NOT NULL DEFAULT 'medium',

  -- Contexte technique capturé automatiquement
  route             TEXT NOT NULL,
  viewport_width    INTEGER NOT NULL,
  viewport_height   INTEGER NOT NULL,
  user_agent        TEXT NOT NULL,
  locale            TEXT NOT NULL,
  breadcrumbs       JSONB NOT NULL DEFAULT '[]'::jsonb,
  console_errors    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Screenshot (optionnel)
  screenshot_path   TEXT,  -- Path dans Supabase Storage bucket 'bug-screenshots'

  -- Workflow admin
  status            bug_status NOT NULL DEFAULT 'new',
  admin_notes       TEXT,
  github_issue_url  TEXT,
  triaged_at        TIMESTAMPTZ,
  triaged_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX idx_bug_reports_user_id     ON bug_reports(user_id);
CREATE INDEX idx_bug_reports_status      ON bug_reports(status)      WHERE status IN ('new', 'acknowledged', 'in_progress');
CREATE INDEX idx_bug_reports_severity    ON bug_reports(severity)    WHERE severity IN ('high', 'critical');
CREATE INDEX idx_bug_reports_created_at  ON bug_reports(created_at DESC);

-- Trigger updated_at
CREATE TRIGGER set_bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Un user peut lire ses propres reports
CREATE POLICY bug_reports_select_own ON bug_reports
  FOR SELECT USING (auth.uid() = user_id);

-- Un user peut insérer pour lui-même uniquement
CREATE POLICY bug_reports_insert_own ON bug_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Un user peut update SON report uniquement pour ajouter du contexte, JAMAIS modifier status/admin_notes
-- (pour rester strict, on exclut cette policy ; seul admin peut update)
-- Admin policies : via fonction SQL qui check ADMIN_USER_IDS ou role
CREATE OR REPLACE FUNCTION is_admin(uid UUID)
  RETURNS BOOLEAN
  LANGUAGE SQL
  SECURITY DEFINER
  STABLE
AS $$
  -- Phase 1 : lookup env via une table de config interne
  -- (la table `app_config` doit exister ou être créée — sinon fallback à FALSE pour fermer)
  SELECT EXISTS (
    SELECT 1 FROM app_config
    WHERE key = 'admin_user_ids'
      AND uid::TEXT = ANY(string_to_array(value, ','))
  );
$$;

CREATE POLICY bug_reports_select_admin ON bug_reports
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY bug_reports_update_admin ON bug_reports
  FOR UPDATE USING (is_admin(auth.uid()));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', FALSE)
ON CONFLICT DO NOTHING;

-- Storage RLS : user peut uploader sous son préfixe, admin peut tout lire
CREATE POLICY "users_upload_own_screenshots" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bug-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "users_read_own_screenshots" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bug-screenshots'
    AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR is_admin(auth.uid()))
  );
```

**Décision `app_config`** : si la table `app_config` n'existe pas déjà dans le projet, la créer dans la même migration :

```sql
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_config (key, value) VALUES ('admin_user_ids', '')
  ON CONFLICT DO NOTHING;
```

Thierry renseignera son UUID via Supabase Studio après déploiement.

### 3.2 Fondations PR-B2 dans la même migration

Ajouter également :

```sql
-- Placeholder pour future table de métriques produit (PR-B2b)
-- Ne PAS créer maintenant, juste laisser un commentaire dans le fichier migration
-- pour que la prochaine migration suive une numérotation cohérente.

COMMENT ON TABLE bug_reports IS
  'Bug reports soumis par les users. Fondation PR-B2 : cette table servira aussi de source au moteur de règles admin (PR-B2a).';
```

---

## 4 · Schéma Zod

### `src/lib/schemas/bug-report.ts`

```typescript
import { z } from 'zod';

export const BUG_REPORT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const BUG_REPORT_STATUSES = [
  'new',
  'acknowledged',
  'in_progress',
  'resolved',
  'wontfix',
  'duplicate',
] as const;

export const bugReportInputSchema = z.object({
  title: z.string().min(3, 'bug.title.tooShort').max(200, 'bug.title.tooLong'),
  description: z.string().min(10, 'bug.description.tooShort').max(5000, 'bug.description.tooLong'),
  severity: z.enum(BUG_REPORT_SEVERITIES).default('medium'),
  route: z.string().max(500),
  viewportWidth: z.number().int().positive().max(10000),
  viewportHeight: z.number().int().positive().max(10000),
  userAgent: z.string().max(500),
  locale: z.string().max(10),
  breadcrumbs: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(['navigation', 'click', 'form_submit', 'server_action', 'console_error']),
        label: z.string().max(500),
        timestamp: z.number().int(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(20),
  consoleErrors: z
    .array(
      z.object({
        message: z.string().max(2000),
        stack: z.string().max(5000).optional(),
        timestamp: z.number().int(),
      }),
    )
    .max(10),
  screenshotBase64: z.string().optional().describe('Data URL PNG, traitée côté serveur'),
});

export type BugReportInput = z.infer<typeof bugReportInputSchema>;

export const bugReportAdminUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(BUG_REPORT_STATUSES).optional(),
  adminNotes: z.string().max(2000).optional(),
});

export type BugReportAdminUpdate = z.infer<typeof bugReportAdminUpdateSchema>;
```

**Règle i18n PR-1bis** : les messages d'erreur Zod sont des **codes stables** (`bug.title.tooShort`), jamais du FR. La traduction se fait côté UI.

---

## 5 · Server Actions

### `src/lib/actions/bug-report.ts`

Signatures obligatoires (utiliser le contrat `ActionResult<T>` défini en PR-1bis) :

```typescript
export async function createBugReport(input: BugReportInput): Promise<ActionResult<{ id: string }>>;

export async function listBugReports(filters: {
  status?: BugStatus;
  severity?: BugSeverity;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<{ items: BugReport[]; total: number }>>;

export async function getBugReport(id: string): Promise<ActionResult<BugReport>>;

export async function updateBugReport(
  input: BugReportAdminUpdate,
): Promise<ActionResult<BugReport>>;

export async function exportBugReportBundle(
  id: string,
): Promise<ActionResult<{ markdown: string }>>;

export async function createGithubIssueFromBug(
  id: string,
): Promise<ActionResult<{ url: string; issueNumber: number }>>;
```

### Règles communes à toutes les actions

1. **Auth** : `const user = await requireUser()` en première ligne — sinon `errorCode: 'auth.required'`.
2. **Rate limit** (Upstash) :
   - `createBugReport` → 5 / heure / userId
   - `exportBugReportBundle` → 30 / heure / userId
   - `createGithubIssueFromBug` → 10 / heure / userId
3. **Validation Zod** avec codes stables.
4. **Scrub PII** (voir §7) avant INSERT.
5. **Admin check** pour `listBugReports`, `getBugReport` (hors `user_id == auth.uid()`), `updateBugReport`, `exportBugReportBundle`, `createGithubIssueFromBug` — via `requireAdmin()`.
6. **Audit log** : chaque création / modif / export → `logAuditEvent`.
7. **Revalidation** : `revalidatePath` sur `/app/admin/bugs` après mutation.

### Upload screenshot

Si `screenshotBase64` est présent dans l'input de `createBugReport` :

1. Vérifier que c'est bien un `data:image/png;base64,…` ou `data:image/webp;base64,…`.
2. Vérifier taille décodée ≤ 2 Mo → sinon `errorCode: 'bug.screenshot.tooLarge'`.
3. Convertir en Buffer, uploader via `supabase.storage.from('bug-screenshots').upload(${userId}/${reportId}.png, buffer, { contentType: 'image/png' })`.
4. Stocker le `path` retourné dans `bug_reports.screenshot_path`.
5. Pas d'URL publique — les admins récupèrent via `createSignedUrl` au moment de l'affichage (TTL 10 min).

---

## 6 · Utilities

### 6.1 `src/lib/admin/require-admin.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

/**
 * Phase 1 : admin = UUID présent dans app_config.admin_user_ids
 * Phase 2 : remplacer par un check sur `profiles.role`
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: config } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'admin_user_ids')
    .single();

  const allowedIds = (config?.value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowedIds.includes(user.id)) {
    redirect('/app'); // 404-like — on ne leak pas l'existence de /admin
  }
  return user;
}

export async function isAdmin(userId: string): Promise<boolean> {
  // Version non-redirect pour les checks Server Actions
  const supabase = await createClient();
  const { data } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'admin_user_ids')
    .single();
  const allowed = (data?.value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(userId);
}
```

### 6.2 `src/lib/admin/breadcrumbs.ts`

Expose `BreadcrumbRingBuffer` (tableau circulaire taille 20) + hook `useBreadcrumbs()` + Context.

Tests obligatoires :

- Ajoute 25 entrées → en garde 20 (les 20 dernières)
- Sérialise JSON sans exploser (breadcrumbs trop lourds)
- Scrub les `metadata` avant insertion

### 6.3 `src/lib/admin/scrub.ts`

**Fonction `scrubPII(input: unknown): unknown`** qui parcourt récursivement un objet et applique :

- Regex email : `/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi` → `<email:REDACTED>`
- Regex IBAN : `/\b[A-Z]{2}\d{2}\s?(\d{4}\s?){3,4}\d{1,4}\b/g` → `<iban:REDACTED>`
- Regex numéro carte : `/\b(?:\d{4}[\s-]?){3}\d{4}\b/g` → `<card:REDACTED>`
- Regex téléphone international : `/\+\d{8,15}\b/g` → `<phone:REDACTED>`
- Clés connues à purger : `password`, `token`, `apiKey`, `secret`, `authorization`, `cookie`, `sessionId` (case-insensitive) → `<REDACTED>`
- Montants bancaires : par défaut **NON scrubé** (trop utile pour debug). Flag `scrubAmounts: boolean` optionnel.

Tests obligatoires :

- Email dans une string imbriquée profondeur 5 → scrubé
- IBAN belge valide → scrubé
- Clé `Authorization: Bearer xyz` → scrubé
- Champ `amount: 59.95` → conservé (sauf option explicite)
- Input null / undefined → retourne tel quel sans crasher

### 6.4 `src/lib/admin/bundle-export.ts`

Fonction `buildMarkdownBundle(report: BugReport, screenshotSignedUrl?: string): string`.

Format du markdown de sortie (template) :

```markdown
# Bug Report #{id}

**Severity** : {severity}
**Status** : {status}
**Reported** : {createdAt ISO}
**Route** : `{route}`
**Locale** : {locale}
**Viewport** : {viewportWidth}×{viewportHeight}
**User agent** : `{userAgent}`

## Title

{title}

## Description

{description}

## Breadcrumbs (20 dernières actions)

| #   | Type       | Label        | Timestamp            |
| --- | ---------- | ------------ | -------------------- |
| 1   | navigation | /app/charges | 2026-04-18T14:32:00Z |
| ... |

## Console errors
```

{consoleErrors formatés en blocs}

```

## Screenshot

{si présent : "![screenshot](signed-url)" — l'URL expire dans 10 min}
{sinon : "_No screenshot provided_"}

## Admin notes

{admin_notes ou "_None_"}

---

_Generated from Ankora admin panel at {now ISO}._
_Open repo : https://github.com/thierryvm/ankora_
```

**Le but** : Thierry copie ce markdown, le colle dans Claude Code terminal, et Claude Code a tout le contexte nécessaire pour diagnostiquer et proposer un fix.

### 6.5 `src/lib/admin/github.ts`

Wrapper minimal autour de `fetch` vers l'API GitHub REST v3.

```typescript
export async function createGithubIssue(params: {
  title: string;
  body: string;
  labels?: string[];
}): Promise<{ url: string; issueNumber: number }> {
  const token = process.env.GITHUB_ADMIN_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  if (!token || !owner || !repo) {
    throw new Error('GitHub integration not configured');
  }
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ankora-admin/1.0',
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      labels: params.labels ?? ['bug', 'from-admin-panel'],
    }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { url: data.html_url, issueNumber: data.number };
}
```

**Sécurité** : token `GITHUB_ADMIN_TOKEN` = Personal Access Token fine-grained, scope `Issues: read/write` sur le repo `thierryvm/ankora` uniquement. Jamais exposé au client. Documenté dans `.env.example`.

---

## 7 · Composants client

### 7.1 `BreadcrumbProvider.tsx`

Provider Context React Server Components-safe (client wrapper). API :

```tsx
const { add, get, clear } = useBreadcrumbs();
add({ type: 'click', label: 'Button "Save charge"', metadata: { chargeId: '...' } });
```

Sous le capot : `useRef<Breadcrumb[]>([])` + méthodes qui mutent et notifient via `useSyncExternalStore`.

### 7.2 `ClientErrorCapture.tsx`

Un `useEffect` global dans le layout qui :

```tsx
useEffect(() => {
  const onError = (event: ErrorEvent) => {
    breadcrumbs.add({
      type: 'console_error',
      label: event.message,
      metadata: { filename: event.filename, lineno: event.lineno, stack: event.error?.stack },
    });
    consoleErrors.add({ message: event.message, stack: event.error?.stack, timestamp: Date.now() });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const msg = event.reason?.message ?? String(event.reason);
    breadcrumbs.add({ type: 'console_error', label: `Unhandled: ${msg}` });
    consoleErrors.add({ message: msg, stack: event.reason?.stack, timestamp: Date.now() });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}, []);
```

Délégation des clics (capture phase) pour enregistrer automatiquement le label du bouton/lien cliqué :

```tsx
useEffect(() => {
  const onClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    const clickable = el.closest('button, a, [role="button"]');
    if (!clickable) return;
    const label =
      clickable.getAttribute('aria-label') ??
      clickable.textContent?.trim()?.slice(0, 100) ??
      '(unlabeled)';
    breadcrumbs.add({ type: 'click', label });
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}, []);
```

### 7.3 `GlobalErrorBoundary.tsx`

Error boundary React classe (obligatoire — les hooks ne captent pas les erreurs de rendu). Fallback UI :

- Titre i18n : "Une erreur est survenue" / "Something went wrong" / ...
- Description : "Vous pouvez continuer ou nous signaler ce problème"
- Boutons : "Retour à l'accueil" + "Signaler ce bug" (ouvre la `BugModal` pré-remplie avec les infos)

### 7.4 `BugWidget.tsx`

Bouton flottant fixé en bas à droite (`position: fixed; bottom: 24px; right: 24px; z-index: 50`).

- Icône `lucide-react` → `Bug`
- Raccourci clavier : écoute `keydown` pour `Ctrl+Shift+B` (Windows/Linux) et `Meta+Shift+B` (macOS)
- Masqué sur mobile < 640px pour éviter conflit avec le bottom nav — mais toujours accessible via `Ctrl+Shift+B` ou via la page settings "Signaler un bug"
- État : fermé par défaut, ouvre `<BugModal />` au clic/raccourci

**Accessibilité** :

- `aria-label="Signaler un bug"` (i18n)
- `role="button"`
- Support clavier (Tab focusable, Enter/Space active)
- Contraste AA minimum

### 7.5 `BugModal.tsx`

Formulaire shadcn/ui `Dialog` + `react-hook-form` + `zodResolver(bugReportInputSchema)`.

Champs visibles :

- Titre (input, required)
- Description (textarea, required)
- Sévérité (select : Low / Medium / High / Critical — i18n)
- Screenshot (case à cocher "Capturer l'écran" — déclenche `htmlToImage.toPng(document.body)`, stocké en state comme data URL)

Champs invisibles (auto-remplis) :

- `route = window.location.pathname`
- `viewportWidth/Height = window.innerWidth / innerHeight`
- `userAgent = navigator.userAgent` (tronqué à 500)
- `locale` = locale actuelle next-intl
- `breadcrumbs` = `useBreadcrumbs().get()`
- `consoleErrors` = tableau accumulé

**Consentement RGPD explicite** : checkbox obligatoire avant submit :

> "J'accepte que les informations techniques listées ci-dessus (route actuelle, navigateur, dernières actions, screenshot éventuel) soient envoyées à l'équipe Ankora pour diagnostic. Aucune donnée financière ni mot de passe ne sera transmis. Voir la [politique de confidentialité](/legal/privacy)."

Si décoché → bouton "Envoyer" désactivé.

**Récap pré-envoi** : afficher un petit panel "Voici ce qui sera envoyé" avec :

- Route
- Viewport
- Locale
- 5 dernières actions (breadcrumbs, résumé)
- Preview du screenshot si présent

---

## 8 · Pages admin

### 8.1 `/app/admin/layout.tsx`

```tsx
import { requireAdmin } from '@/lib/admin/require-admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="admin-shell">
      <AdminSidebar />
      <main>{children}</main>
    </div>
  );
}
```

Sidebar minimaliste avec liens :

- Bugs (actif)
- _(placeholders grisés pour PR-B2 : Santé technique, Santé produit, Marketing, Recommandations)_

### 8.2 `/app/admin/bugs/page.tsx`

Liste server component avec :

- Filtres (search params) : `status`, `severity`, `since`
- Pagination (20/page)
- Tableau : date, user (UUID tronqué — pas d'email), title, severity badge, status badge, route
- Lien cliquable vers détail

### 8.3 `/app/admin/bugs/[id]/page.tsx`

Détail + 3 boutons actions (Server Actions `'use server'`) :

1. **"Copier le bundle Claude Code"** → `exportBugReportBundle(id)` → retourne le MD → client `navigator.clipboard.writeText(md)` + toast "Bundle copié ✔️"
2. **"Créer une issue GitHub"** → `createGithubIssueFromBug(id)` → affiche l'URL retournée + toast, met à jour `github_issue_url` en DB
3. **Change status** → select `<form action={updateBugReport}>` avec les 6 statuts, + champ `admin_notes` libre

Affichage :

- Tout le contenu du report
- Breadcrumbs en timeline verticale
- Screenshot (signed URL, 10 min TTL)
- Console errors en blocs code
- Audit trail (qui a trié, quand)

---

## 9 · i18n

Ajouter à `messages/fr-BE.json` :

```json
{
  "bugReport": {
    "widgetLabel": "Signaler un bug",
    "modalTitle": "Signaler un bug",
    "modalDescription": "Décris ce qui ne fonctionne pas. Plus tu es précis, plus vite on peut corriger.",
    "titleLabel": "Titre court",
    "titlePlaceholder": "Ex: Le bouton Enregistrer ne fonctionne pas",
    "descriptionLabel": "Description détaillée",
    "descriptionPlaceholder": "Qu'essayais-tu de faire ? Qu'est-ce qui s'est passé ?",
    "severityLabel": "Gravité",
    "severity": {
      "low": "Faible — gêne mineure",
      "medium": "Moyenne — gêne significative",
      "high": "Importante — bloque une action",
      "critical": "Critique — app inutilisable"
    },
    "screenshotLabel": "Capturer l'écran",
    "screenshotHint": "Une capture de ta page actuelle (sans mots de passe ni montants sensibles visibles)",
    "consentLabel": "J'accepte l'envoi des informations techniques listées ci-dessus",
    "consentLink": "Voir la politique de confidentialité",
    "submit": "Envoyer le rapport",
    "cancel": "Annuler",
    "success": "Rapport envoyé, merci !",
    "errors": {
      "required": "Ce champ est requis",
      "tooShort": "Trop court",
      "tooLong": "Trop long",
      "rateLimit": "Trop de rapports envoyés, réessaie dans une heure",
      "network": "Problème réseau, réessaie",
      "server": "Erreur serveur, notre équipe est notifiée"
    }
  },
  "admin": {
    "bugs": {
      "pageTitle": "Rapports de bugs",
      "status": {
        "new": "Nouveau",
        "acknowledged": "Pris en compte",
        "in_progress": "En cours",
        "resolved": "Résolu",
        "wontfix": "Ne sera pas corrigé",
        "duplicate": "Doublon"
      },
      "actions": {
        "copyBundle": "Copier le bundle Claude Code",
        "bundleCopied": "Bundle copié dans le presse-papiers",
        "createIssue": "Créer une issue GitHub",
        "issueCreated": "Issue GitHub créée",
        "markResolved": "Marquer résolu"
      },
      "filters": {
        "all": "Tous",
        "byStatus": "Par statut",
        "bySeverity": "Par gravité",
        "since": "Depuis"
      }
    }
  },
  "help": {
    "reportBug": {
      "pageTitle": "Comment signaler un bug",
      "intro": "Ankora est en développement actif. Si tu rencontres un problème…",
      "step1": "Ouvre le widget bug (icône en bas à droite) ou utilise le raccourci Ctrl+Shift+B",
      "step2": "Décris ce qui ne va pas — plus tu es précis, mieux c'est",
      "step3": "Coche la capture d'écran si elle aide à illustrer le problème",
      "step4": "Envoie — on te confirme à l'écran",
      "privacy": "Les données techniques (route, navigateur, dernières actions) sont envoyées avec ton rapport. Aucun mot de passe ni donnée bancaire ne transite. Voir la politique de confidentialité."
    }
  }
}
```

**Les 4 autres fichiers** (`nl-BE`, `en`, `es-ES`, `de-DE`) reçoivent la même structure avec **les strings FR copiées telles quelles** (stubs). Leur traduction réelle sera faite dans PR-2 ou en review post-PR-B1 selon la séquence exacte.

---

## 10 · RGPD & sécurité

### 10.1 Consentement

- Aucune envoi de report **sans checkbox cochée** (validation côté client ET côté serveur via Zod refine)
- Le consentement est **par rapport**, pas global — l'utilisateur recoche à chaque envoi

### 10.2 Scrub automatique

Appliqué **côté serveur uniquement** sur les champs : `title`, `description`, `breadcrumbs[].label`, `breadcrumbs[].metadata`, `consoleErrors[].message`, `consoleErrors[].stack`.

**Pas** appliqué sur : `userAgent`, `route` (peut contenir un ID produit, c'est voulu), `viewportWidth/Height`, `locale`.

### 10.3 Screenshot

Uploadé dans bucket **privé** `bug-screenshots`. Accès uniquement via `createSignedUrl` par un admin connecté. Pas d'URL publique possible.

**TTL recommandé** : 30 jours, via cron Supabase Edge Function (PR-B2a). En PR-B1, on documente juste le TODO dans `docs/admin/bug-triage.md`.

### 10.4 Rate limiting (Upstash)

Respect strict des clés Upstash existantes :

- `bug_report:create:{userId}` → 5/heure
- `bug_report:export:{userId}` → 30/heure (admin only, mais quand même)
- `bug_report:github:{userId}` → 10/heure

Réponse 429 → `errorCode: 'rate.limit.exceeded'` côté Server Action.

### 10.5 Audit log

Events à ajouter dans `audit-log.ts` :

- `BUG_REPORT_CREATED` : `{ userId, bugId, severity, hasScreenshot }` (PAS le contenu)
- `BUG_REPORT_STATUS_CHANGED` : `{ adminId, bugId, fromStatus, toStatus }`
- `ADMIN_GITHUB_ISSUE_CREATED` : `{ adminId, bugId, issueNumber }`
- `ADMIN_BUG_BUNDLE_EXPORTED` : `{ adminId, bugId }`

---

## 11 · Tests

### 11.1 Vitest (unit/integration) — obligatoires

- `src/lib/admin/__tests__/scrub.test.ts`
  - Emails / IBAN / CB / téléphone / clés sensibles → scrubés
  - Null / undefined / types exotiques → pas de crash
  - Deep nesting 5 niveaux → fonctionne
  - **Invariant critique** : `scrubPII(input) !== input` (immuabilité)

- `src/lib/admin/__tests__/breadcrumbs.test.ts`
  - 25 push → 20 entrées (FIFO)
  - `get()` retourne un snapshot, pas la ref interne
  - Sérialisation JSON stable

- `src/lib/admin/__tests__/bundle-export.test.ts`
  - Contient le titre, description, route, severity
  - Respecte le template (snapshot test)
  - Gère l'absence de screenshot

- `src/lib/schemas/__tests__/bug-report.test.ts`
  - Titre < 3 chars → rejet avec code `bug.title.tooShort`
  - Description vide → rejet
  - Breadcrumbs > 20 entries → rejet
  - Screenshot base64 invalide → rejet

- `src/lib/actions/__tests__/bug-report.test.ts`
  - `createBugReport` sans auth → `errorCode: 'auth.required'`
  - Rate limit atteint → `errorCode: 'rate.limit.exceeded'`
  - Scrub est bien appliqué avant INSERT (spy sur Supabase mock)
  - Admin update sans admin → `errorCode: 'auth.admin.required'`

### 11.2 Playwright (e2e) — obligatoires

- `tests/e2e/bug-widget.spec.ts`
  - Bouton widget visible sur `/app`
  - Clic ouvre la modal
  - Ctrl+Shift+B ouvre la modal
  - Remplissage + submit sans consentement → erreur visible
  - Remplissage + consentement + submit → toast success + request Supabase voyageant bien
  - Widget accessible au clavier (Tab, Enter)

- `tests/e2e/admin-bugs.spec.ts` (nécessite un user test avec ADMIN_USER_IDS)
  - Accès `/app/admin/bugs` pour non-admin → redirect `/app`
  - Accès pour admin → liste s'affiche
  - Bouton "Copier bundle" → clipboard contient du markdown
  - Changement de statut → persiste après reload

### 11.3 Couverture cible

- `src/lib/admin/**` → ≥ 90%
- `src/lib/actions/bug-report.ts` → ≥ 85%
- `src/components/bug-reporting/**` → ≥ 70% (tests Playwright compensent)

---

## 12 · Documentation

### 12.1 Page publique `/help/signaler-un-bug`

Page i18n simple expliquant :

- À quoi sert le widget
- Comment l'ouvrir (bouton + raccourci)
- Ce qui est envoyé / ce qui ne l'est pas
- Lien vers politique de confidentialité

### 12.2 Runbook admin `docs/admin/bug-triage.md`

Markdown interne avec :

- Accès : comment ajouter un admin (UPDATE sur `app_config` via Supabase Studio)
- Triage : workflow `new → acknowledged → in_progress → resolved`
- Export bundle Claude Code : quand l'utiliser, comment coller dans le terminal
- GitHub Issues : quand créer une issue vs résoudre directement
- TODO : purge des screenshots > 30 jours (à implémenter en PR-B2a)
- Métriques à surveiller (nombre de reports/jour, taux résolu, temps de triage médian)

---

## 13 · Variables d'environnement

Ajouter à `.env.example` :

```bash
# Bug reporting — GitHub integration
GITHUB_ADMIN_TOKEN=                         # Fine-grained PAT, scope Issues:write on repo ankora only
GITHUB_REPO_OWNER=thierryvm
GITHUB_REPO_NAME=ankora

# Admin access (Phase 1 — Phase 2 remplacera par profiles.role)
# Rempli après premier deploy via UPDATE app_config SET value = '<uuid1>,<uuid2>' WHERE key = 'admin_user_ids';
```

Jamais de valeur réelle dans `.env.example`, uniquement les noms.

---

## 14 · Commits attendus (conventional commits)

```
feat(bug-reporting): add supabase migration for bug_reports table + storage
feat(bug-reporting): add zod schemas + server actions with rate limit + scrub
feat(bug-reporting): add breadcrumb provider + client error capture hooks
feat(bug-reporting): add bug widget + modal with html-to-image screenshot
feat(bug-reporting): add global error boundary with bug-report fallback
feat(admin): add admin layout + bugs list/detail pages with RLS guard
feat(admin): add claude-code bundle export + github issue creation
feat(i18n): add bugReport + admin.bugs + help.reportBug namespaces
docs(admin): add bug-triage runbook
docs(help): add signaler-un-bug public page
test(bug-reporting): vitest coverage scrub/breadcrumbs/bundle + schema
test(bug-reporting): playwright e2e widget + admin access
chore: update .env.example with bug-reporting + github vars
```

---

## 15 · Sécurité — invariants obligatoires

- [ ] RLS activée sur `bug_reports` (3 policies : select own, insert own, admin CRUD)
- [ ] RLS activée sur `storage.objects` bucket `bug-screenshots`
- [ ] `is_admin()` fonction SECURITY DEFINER en lecture seule
- [ ] `GITHUB_ADMIN_TOKEN` jamais exposé au client (vérifier par grep `process.env.GITHUB` côté client → 0 match)
- [ ] Zod validation sur 100% des inputs Server Actions
- [ ] Scrub appliqué AVANT INSERT, pas après
- [ ] Rate limit sur les 3 actions critiques (create, export, github)
- [ ] Consentement obligatoire (côté client ET serveur via Zod refine)
- [ ] Aucun log serveur contenant le contenu scrubé (on log l'event + les IDs, pas le texte)
- [ ] Pas de dépendance externe payante (grep dependencies : 0 sentry/bugsnag/rollbar/etc.)
- [ ] CSP headers non violés (html-to-image utilise un canvas inline, vérifier)

---

## 16 · Hors scope (PR-B2 uniquement)

Ces fonctionnalités SONT mentionnées dans le ROADMAP mais **ne font pas partie de PR-B1** :

- ❌ Session replay (rrweb ou équivalent) — trop gros, déport en PR-B2a
- ❌ Métriques produit agrégées (funnels, cohortes) — PR-B2b
- ❌ Moteur de règles rule-based — PR-B2d
- ❌ Dashboard graphiques type YouTube Studio — PR-B2a/b
- ❌ Cron de purge screenshots 30j — PR-B2a (juste documenté ici)
- ❌ Multi-admin avec rôles granulaires — Phase 2 produit
- ❌ Webhooks sortants (Slack, Discord) — Phase 2

---

## 17 · Rapport final attendu

À la fin de la PR, rédiger un rapport dans `docs/prs/PR-B1-report.md` contenant :

1. Quality gates (tableau typecheck/lint/test/build/e2e)
2. Liste des fichiers créés / modifiés avec LOC
3. Checklist sécurité §15 (cases cochées)
4. Couverture de tests par module
5. Variables d'env à remplir post-déploiement
6. Fondations PR-B2 posées (liste des hooks/tables/endpoints réutilisables)
7. Limites connues (ex: pas de session replay, purge manuelle des screenshots, etc.)
8. Dette technique volontaire (ex: `is_admin` en table plutôt que colonne `profiles.role` — à migrer en Phase 2)

---

**Rappel final** : cette PR doit rester **self-contained**. Aucun impact sur le dashboard existant, le domaine financier, l'onboarding ou l'auth. Seuls les fichiers listés en §1.2 et §1.3 sont touchés.
