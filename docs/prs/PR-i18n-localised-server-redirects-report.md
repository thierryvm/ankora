# PR — les redirections serveur portent la langue de l'utilisateur

**Date** : 25 juillet 2026
**Auteur** : @cc-ankora
**Branche** : `fix/i18n-localised-server-redirects`
**Revue de plan** : `plan-reviewer` — 🟡 APPROVED WITH CHANGES (4 corrections, toutes intégrées)
**Ferme** : le P0 laissé ouvert par #258, arbitré par @thierry le 25/07

---

## 1. La régression fermée

`localePrefix: 'as-needed'` met le français sur les URLs **non préfixées** : le préfixe du
français est `/fr-BE`, jamais la chaîne vide. Un chemin comme `/login` ne matche donc aucun
préfixe de locale.

Jusqu'à #258, next-intl rattrapait le coup : la branche cookie de `localeDetection` lisait
`NEXT_LOCALE` et émettait un 307 vers `/en/login`. #258 a désactivé cette détection — c'était
la même garde qui laissait un prefetch d'arrière-plan réécrire silencieusement la langue de
l'utilisateur. Le filet a disparu avec elle, et chaque `redirect()` nu renvoyait dès lors un
utilisateur anglophone sur une page française.

Concerné : session expirée, connexion, déconnexion, fin d'onboarding, refus d'accès admin.

## 2. Le correctif

Le helper que j'avais prévu d'écrire **existait déjà** — `plan-reviewer` l'a relevé, et c'est
strictement meilleur que ma proposition. `src/i18n/navigation.ts` expose un `redirect` issu de
`createNavigation(routing)` :

```ts
redirect({ href: '/login', locale: await getLocale() });
```

Il retourne `never`, lève immédiatement comme celui de `next/navigation`, et **son type impose
la locale**. Aucun module à écrire, et le risque décrit ci-dessous disparaît par construction.

### Le piège que ce choix évite

J'avais envisagé un helper `async` du type `await redirectLocalised('/login')`. Vérification
faite : `eslint.config.mjs` n'active pas `@typescript-eslint/no-floating-promises` (pas de lint
typé — ni `project` ni `projectService`). Un `await` oublié sur une garde d'authentification
n'aurait donc levé **ni erreur TypeScript ni erreur de lint** : `redirect` ne lèverait plus,
l'exécution continuerait, et l'utilisateur passerait **non authentifié**. Le `redirect`
synchrone de next-intl rend cette classe d'erreur impossible.

### Terminaison explicite

TypeScript ne propage pas le narrowing `never` depuis un identifiant issu d'un destructuring
(`export const { redirect } = createNavigation(...)`), contrairement au `redirect` de
`next/navigation`. Le code après l'appel était donc considéré atteignable, ce qui a fait
remonter 8 erreurs `'x' is possibly null`. Corrigé par un `return redirect(...)` explicite à
chaque site : la terminaison est visible à la lecture, et TypeScript la comprend.

## 3. Sites modifiés (14 redirections, 8 fichiers)

| Fichier                                                  | Cibles localisées                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/auth/require-user.ts`                           | `/login`, `/onboarding`                                                |
| `src/lib/auth/require-admin.ts`                          | `/app`                                                                 |
| `src/lib/data/workspace-snapshot.ts`                     | `/login`, `/onboarding` (×3)                                           |
| `src/lib/actions/auth.ts`                                | `/signup/check-email`, `/app`\|`/onboarding`, `/`, `/login?reset=done` |
| `src/lib/actions/onboarding.ts`                          | `/app`                                                                 |
| `src/app/[locale]/onboarding/page.tsx`                   | `/app`                                                                 |
| `src/app/[locale]/app/settings/deletion-status/page.tsx` | `/app/settings`                                                        |

### Ce qui n'est délibérément PAS localisé

- **`src/lib/actions/auth.ts` — l'URL OAuth de Google.** Elle est absolue et externe ; la
  passer au `redirect` locale-aware la préfixerait et la transformerait en chemin
  same-origin cassé. Elle garde le `redirect` de `next/navigation`, importé sous l'alias
  explicite `redirectToExternalUrl` — la distinction est porteuse de sens, pas cosmétique.
- **`src/app/auth/callback/route.ts`** garde sa résolution par cookie. Cette route est exclue
  du matcher du proxy, donc le middleware n'y tourne pas et l'en-tête `X-NEXT-INTL-LOCALE`
  dont dépend `getLocale()` est absent : il retomberait sur `resolveLocaleFromUserOrCookie()`,
  qui coûte un `auth.getUser()` **plus** un select `users` sur le chemin chaud de l'OAuth, pour
  la valeur que le cookie porte déjà. Commentaire ajouté pour que personne ne « simplifie ».
- **`src/proxy.ts` et `src/i18n/routing.ts`** ne sont pas touchés. Un 307 basé sur la lecture
  du cookie dans le proxy serait l'alternative tentante en une ligne ; elle est interdite par
  la note de `routing.ts` (« trois correctifs middleware construits et mesurés — do not retry
  that layer »). Localiser aux call-sites est la bonne couche.
- **`src/app/not-found.tsx`** lit `NEXT_LOCALE` mais ne contient aucun `redirect()` — hors
  périmètre, vérifié.

### Paramètre mort supprimé

`requireUser(redirectTo = '/login')` : les 6 appelants du repo ne passent **aucun** argument.
Localiser un chemin fourni par un appelant inexistant reviendrait à inventer une surface
d'open redirect. Le paramètre est supprimé plutôt que validé.

### Le middleware n'est pas en cause

`updateSession` (`src/lib/supabase/middleware.ts`) n'émet aucune redirection — il ne fait que
rafraîchir les cookies de session. Le `307 → /login` mesuré provient donc bien d'un
`redirect()` RSC, et le relevé `grep -rn "redirect("` couvre tout le rayon d'explosion.

## 4. Preuve

Mesure A/B sur le comportement réel, build de production local contre la production actuelle :

| Requête                      | Production (avant)               | Cette branche              |
| ---------------------------- | -------------------------------- | -------------------------- |
| `/en/app` — visiteur anglais | `307 → /login` ❌ page française | `307 → /en/login` ✅       |
| `/app` — visiteur français   | `307 → /login`                   | `307 → /login` ✅ inchangé |

### Tests

`src/lib/auth/__tests__/require-user-redirects.test.ts` — **nouveau**. Ces branches avaient
**zéro couverture** : la suite voisine `require-user.test.ts` n'exerce que `getOptionalUser`,
n'importe jamais `requireUser` et ne mocke pas `next/navigation`.

Le mock `redirect` **lève**, sur le modèle de `require-admin.test.ts`. Un mock inerte laisserait
`requireUser` continuer et retourner `undefined as User` : le test resterait vert au-dessus
d'une garde qui ne garde plus. Un test dédié verrouille précisément ça.

Deux suites existantes ont dû être alignées : elles mockaient `next/navigation`, alors que les
modules importent désormais `@/i18n/navigation`. Mocker le barrel garde aussi le build ESM de
next-intl hors du graphe Vitest, où il échoue à résoudre `next/navigation`.

**Angle mort assumé** : les specs Playwright authentifiées sont skippées en CI (secrets `E2E_*`
absents — un seul projet Supabase, la clé `service_role` ne doit pas atteindre la CI). Ces
tests unitaires sont donc le **seul** filet automatisé pour cette classe de régression, pas un
complément à une couverture E2E.

### Quality gates

`npm run typecheck` 0 erreur · `npm run lint` 0 erreur · `npm run lint:use-server` OK ·
`npm run test` **1652 / 1652**

## 5. Definition of DONE

| #   | Critère                             | Preuve                                 |
| --- | ----------------------------------- | -------------------------------------- |
| 1   | CI verte                            | cf. checks de la PR                    |
| 2   | Sourcery muet sur le dernier commit | `gh api …/comments` → sortie vide      |
| 3   | Threads de review résolus           | GraphQL `reviewThreads` → 0 non résolu |
| 4   | Pas de conflit avec `main`          | `mergeStateStatus: CLEAN`              |
| 5   | Rapport livré                       | ce fichier                             |
