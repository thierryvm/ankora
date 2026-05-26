# Server Actions — Error handling pattern (fail-loud)

> Adopté suite à l'incident **PR-BETA-3 2026-05-26** : un transient HTTP 503 sur la Server Action `updateResteAVivreOverrideAction` fermait silencieusement le drawer "Ajuster ce mois" en prod, sans toast d'erreur. L'utilisateur croyait que sa modification avait été sauvée alors qu'elle ne l'avait pas été.

## Principe

Une Server Action **ne doit jamais** rendre un HTTP 5xx au client en cas d'erreur applicative. Le client (drawer, form, dialog) doit toujours pouvoir interpréter la réponse — soit `{ ok: true }`, soit `{ ok: false, errorCode }`. Une erreur inattendue se traduit par un toast user-visible, jamais par une UI qui se ferme sans feedback.

## Pattern côté Server Action

```ts
'use server';

export async function myMutationAction(input: unknown): Promise<ActionResult> {
  // 1. Auth + workspace lookup HORS du try/catch.
  //    requireUserWithWorkspace() throws Next.js `redirect()` markers when
  //    no session — ces throws DOIVENT propager. Catcher ici les avalerait
  //    et le user verrait un "update failed" au lieu d'être bouncé sur /login.
  const { user, workspaceId } = await requireUserWithWorkspace();

  try {
    // 2. Rate limit, Zod, DB read + write — tout dans le try.
    const rl = await rateLimit('mutation', `user:${user.id}`);
    if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, errorCode: 'errors.validation.generic', fieldErrors: ... };

    // ... DB read/write avec gestion de `error` Supabase ...

    // 3. Audit log = fire-and-forget. Un blip `audit_log` ne doit JAMAIS
    //    undo une write user déjà committée.
    void logAuditEvent(EVENT, ctx, metadata).catch((err) => {
      log.error('Audit log failed after write succeeded', { error_message: String(err) });
    });

    // 4. Revalidation = try/catch interne. Si revalidatePath crash après
    //    la write, la DB est consistente, on log et on renvoie ok.
    try {
      revalidateAppPath('...');
    } catch (err) {
      log.warn('revalidate failed after write succeeded', { error_message: String(err) });
    }

    return { ok: true };
  } catch (err) {
    // 5. Filet de sécurité ultime. Capture les exceptions imprévues
    //    (createClient init crash, headers() crash, Zod internal, etc.).
    //    Log avec stack pour investigation, retourne un errorCode
    //    traduisible pour le client.
    log.error('myMutationAction unexpected crash', {
      user_id: user.id,
      workspace_id: workspaceId,
      error_message: err instanceof Error ? err.message : String(err),
      error_stack: err instanceof Error ? err.stack : undefined,
    });
    return { ok: false, errorCode: 'errors.<domain>.<actionFailed>' };
  }
}
```

### Les 3 erreurs à NE PAS faire

1. **Tout englober dans un try/catch monolithique** — incluant `requireUserWithWorkspace()`. Casse le bounce auth `/login`.
2. **`await logAuditEvent(...)`** sans `.catch()` — un échec d'audit fait crash toute l'action après la write.
3. **`revalidatePath(...)` sans try/catch** — un blip d'infra Next.js annule la valeur ok côté client alors que la DB est OK.

## Pattern côté client (drawer / form)

```tsx
'use client';

function submit() {
  startTransition(async () => {
    try {
      const result = await myMutationAction(input);
      if (result.ok) {
        toast.success(t('mySurface.success'));
        close(); // ferme drawer / dialog
        router.refresh(); // re-fetch RSC
      } else {
        // Mode erreur métier — translate via useActionErrorTranslator,
        // drawer/form reste OUVERT pour permettre retry sans re-saisie.
        toast.error(translateError(result.errorCode) || t('mySurface.errorGeneric'));
      }
    } catch (err) {
      // Mode exception JS (network down, action throws inattendu, …).
      // eslint-disable-next-line no-console
      console.error('myMutationAction threw', err);
      toast.error(t('mySurface.errorGeneric'));
      // drawer reste OUVERT
    }
  });
}
```

### Les 3 erreurs à NE PAS faire côté client

1. **`close()` avant de checker `result.ok`** — fermeture optimiste silencieuse, le user pense que c'est OK.
2. **Pas de `try/catch` autour de l'`await action()`** — une exception JS (network, action throws) crash le `startTransition` sans toast visible.
3. **`toast.error(result.errorCode)` direct** — affiche `errors.foo.bar` brut au user. Toujours passer par `useActionErrorTranslator`.

## i18n — clés obligatoires

Toute nouvelle Server Action doit ajouter ses error codes dans les **5 locales** (fr-BE, en, nl-BE, de-DE, es-ES) :

- `errors.<domain>.<actionFailed>` — le code retourné par l'action
- `<surface>.<feedback>.success` — copie du toast succès
- `<surface>.<feedback>.errorGeneric` — fallback erreur générique

Un test parity dans `<Composant>.test.tsx` assert leur présence + non-vacuité dans les 5 locales.

## Tests Vitest obligatoires

Pour chaque Server Action :

- **Auth bounce propage** : `requireUserWithWorkspace` throws un redirect marker → l'action re-throw (pas swallow).
- **Audit fail = write OK** : `auditSpy` throws → l'action retourne `{ ok: true }`.
- **Revalidate fail = write OK** : `revalidateSpy` throws → l'action retourne `{ ok: true }`.
- **DB read/write error** : Supabase retourne `{ data: null, error: {...} }` → l'action retourne errorCode adapté.
- **Outer crash** : `createClient` ou `from()` throw → outer catch convertit en `{ ok: false, errorCode }`.

Pour chaque composant client appelant une Server Action :

- **Success** : action retourne `{ ok: true }` → `toast.success` + `close()` + `router.refresh()`.
- **Erreur métier** : action retourne `{ ok: false, errorCode }` → `toast.error` translaté + drawer reste ouvert.
- **Exception JS** : action throws → `toast.error` générique + drawer reste ouvert.

## Référence incident

PR-BETA-3 (THI-267) hotfix 2026-05-26. Cf. `docs/prs/PR-BETA-3-capacite-tryptique-report.md` § "Hotfix Server Action 503 + Toast UX".
