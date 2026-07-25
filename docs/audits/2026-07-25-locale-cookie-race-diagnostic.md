# Diagnostic — le sélecteur de langue repasse tout seul en anglais

**Date** : 25 juillet 2026
**Auteur** : @cc-ankora
**Statut** : cause racine **établie**, correctif **non livré** — décision d'architecture à trancher par @thierry
**Symptôme rapporté** : « le sélecteur de langue en-fr repasse automatiquement à l'anglais »
**Reproductibilité prod** : ~50 % (4 rounds mesurés), jamais reproduit en local

---

## 1. Résumé exécutif

Le cookie `NEXT_LOCALE` est réécrit en `en` par une requête `/en…` qui arrive **après**
le `Set-Cookie` de la Server Action de changement de langue. La page continue de
s'afficher en français — seul le cookie bascule — et c'est la navigation _suivante_
qui redirige en 307 vers `/en`. D'où le caractère « aléatoire » et le fait que ça
reparte **toujours** vers l'anglais et jamais l'inverse.

Trois correctifs ont été construits et mesurés dans `src/proxy.ts`. **Les trois sont
structurellement impossibles** : Next normalise les requêtes RSC avant que le
middleware ne s'exécute. Le middleware ne peut pas distinguer un prefetch d'arrière-plan
d'une vraie navigation. Le code a été reverté ; rien de spéculatif n'a été mergé.

Deux correctifs viables restent, tous deux hors du middleware, tous deux porteurs
d'un arbitrage produit → escalade @thierry.

---

## 2. Mécanisme (établi)

`next-intl@4.11.0` — `middleware/syncCookie.js`, désobfusqué :

```js
function syncCookie(request, response, resolvedLocale, config) {
  if (!config.localeCookie) return;
  const { name, ...options } = config.localeCookie;
  const hasCookie = request.cookies.has(name);
  if (hasCookie && request.cookies.get(name)?.value !== resolvedLocale) {
    response.cookies.set(name, resolvedLocale, options); // ← la réécriture
  } else if (!hasCookie) {
    /* … Accept-Language … */
  }
}
```

Et `middleware/resolveLocale.js` : **le préfixe d'URL gagne toujours** sur le cookie.

Conséquence : **toute** requête vers `/en/…` alors que le cookie vaut `fr-BE` réécrit
le cookie en `en`, pour un an (`Max-Age=31536000`). `syncCookie` n'a aucune notion de
prefetch — et, comme démontré en §3, ne peut pas en avoir.

### Pourquoi c'est asymétrique

Le sens FR→EN est immunisé : ses requêtes visent des URLs non préfixées (`localePrefix:
'as-needed'` ⇒ le français vit à la racine), donc le locale résolu égale déjà le cookie
et `syncCookie` n'écrit rien. Seul le sens EN→FR est exposé. C'est exactement le
« ça revient toujours à l'anglais » rapporté.

### La course

Mesuré en local (Playwright, interception réseau, build de production) sur un
retour EN→FR :

```
POST /en                              ← Server Action setLocaleAction
   ↳ SET-COOKIE NEXT_LOCALE=fr-BE     ← correct
final NEXT_LOCALE = fr-BE             ← correct
```

En local le serveur répond en quelques millisecondes : la fenêtre de course est
quasi nulle et le bug ne se reproduit pas. En production, toute requête `/en…`
encore en vol (prefetch d'un `<Link>` de l'arbre anglais encore monté, revalidation,
requête RSC de layout) qui se termine **après** ce `Set-Cookie` rebascule le cookie
en `en`. La latence réseau ouvre la fenêtre → ~50 %.

---

## 3. Les trois correctifs middleware — mesures et verdicts

Tous testés sur un build de production (`npm run build && npm run start`), pas en dev.

| #   | Signal utilisé pour détecter un prefetch                | Mesure                                                                                                                                                     | Verdict                                |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | En-têtes `rsc` / `next-router-prefetch` / `sec-purpose` | Le navigateur les envoie (`rsc=1 prefetch=1`), mais le middleware ne reçoit que `accept, cookie, host, user-agent, x-forwarded-*`, `x-nonce`, `x-pathname` | ☠️ Next les retire avant le middleware |
| 2   | En-tête `accept: text/x-component`                      | Interception d'un **vrai** prefetch : `accept=(none)`. Ne matche que les `fetch()` fabriqués à la main                                                     | ☠️ ne matche jamais le bug réel        |
| 3   | Paramètre d'URL `?_rsc=<hash>`                          | `curl "/en?_rsc=probe"` → le middleware voit `nextUrl.search = "(empty)"`, `request.url = "http://…/en"`                                                   | ☠️ Next retire aussi le paramètre      |

Instrumentation ayant produit la mesure 3 (retirée depuis) :

```
x-dbg-search: (empty)        ← ?_rsc=probe avait pourtant bien été envoyé
x-dbg-url:    http://localhost:3101/en
x-dbg-isrsc:  false
```

### Conclusion structurelle

**Next canonise les requêtes RSC avant l'exécution du middleware : en-têtes _et_
paramètre de cache-busting.** Une requête de prefetch et une navigation document
sont, du point de vue de `proxy.ts`, littéralement indiscernables. Aucun correctif
dans le middleware ne peut fonctionner — ni le nôtre, ni celui de `next-intl`.

### Piège d'ordonnancement découvert au passage (à conserver)

Une première version filtrait l'en-tête `set-cookie` **avant** `updateSession`. Sans
effet. `NextResponse.cookies` est une vue `ResponseCookies` qui conserve sa propre map
parsée et réécrit l'en-tête `set-cookie` **entier** à chaque `.set()`. `updateSession`
appelle `response.cookies.set()` pour la session Supabase, ce qui re-sérialise cette
map périmée et **restaure fidèlement** le `NEXT_LOCALE` qu'on venait de retirer.

> Toute manipulation brute de l'en-tête `set-cookie` dans `proxy.ts` doit être la
> **toute dernière** opération, après `updateSession`.

---

## 4. Hypothèses écartées (avec la preuve)

| Hypothèse                           | Écartée par                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Cache du Service Worker             | PR #252 (modèle allowlist) + dump du cache : aucune entrée RSC/document         |
| `Accept-Language` du navigateur     | Navigateur de @thierry en français — confirmé explicitement                     |
| Cache CDN Vercel                    | Les réponses RSC portent `Cache-Control: private, no-store`                     |
| Duplication de `Path` sur le cookie | Un seul `Set-Cookie`, `Path=/`                                                  |
| Liens `/en` en dur                  | Aucun ; le switcher utilise `<button>` + `router.replace`, pas de `<Link>`      |
| `start_url` de la PWA               | Non préfixé                                                                     |
| Course sur le refresh token         | Supabase : `sessions_timebox=0`, sessions vivantes 47 j, 0 rotation concurrente |
| `users.locale` en base              | Écrit par la Server Action, cohérent avec le choix                              |

---

## 5. Les deux correctifs viables (décision @thierry)

### Option A — retirer la gestion du cookie à next-intl _(recommandée)_

`localeCookie: false` dans `src/i18n/routing.ts`. `syncCookie` devient inerte :
plus aucune réécriture, la course disparaît par construction. Le cookie reste écrit
explicitement par `setLocaleAction` (`cookies().set`) — ce qu'il fait déjà.

**Coût** : `localeCookie: false` désactive aussi la **lecture** (cf. `resolveLocale.js`,
fonction `c`). Une arrivée sur `/` nu ne retomberait plus sur la langue choisie mais
sur `Accept-Language`, puis `defaultLocale`. Concrètement : un utilisateur au
navigateur français ayant choisi l'anglais et tapant l'URL racine verrait le français.
Sa navigation, elle, reste préfixée `/en/…` (tous les liens sont locale-aware) et
`users.locale` reste la source de vérité côté connecté.

**Verdict** : c'est un arbitrage produit assumable, et c'est le seul correctif qui
supprime la classe de bug entière plutôt qu'une de ses occurrences.

### Option B — navigation dure sur changement de langue

Remplacer `router.replace(pathname, { locale })` par une navigation document dans
`LocaleSwitcher.tsx`. Une navigation document annule toutes les requêtes en vol de la
page précédente et démonte l'arbre anglais : plus de requête `/en…` retardataire.

**Coût** : rechargement complet à chaque changement de langue (action rare).
**Limite** : atténue la course sans supprimer la cause — si une requête `/en…` provient
d'ailleurs que de l'arbre périmé, le bug persiste. Non prouvable par un test.

### Recommandation

**Option A**, dans une PR dédiée, avec `plan-reviewer` (touche la config de routage
i18n) puis validation @thierry sur l'arbitrage « `/` nu ne mémorise plus la langue ».
Option B en complément possible, jamais seule.

---

## 6. Pourquoi rien n'a été mergé

Deux correctifs ont déjà été livrés sur ce symptôme sans le résoudre (#252 cache SW,
puis la détection de prefetch par en-tête). Le troisième aurait été livré sur la même
base : un test vert contre une forme de requête inventée, alors que le signal n'existe
pas en production. La leçon est intégrée dans `.claude/agents/test-quality-auditor.md`
(« ce test aurait-il attrapé le bug ? ») et `.claude/agents/prod-bug-investigator.md`
(mesure avant hypothèse).

Le test de non-régression reste dans la suite, en `test.fixme` — il décrit le défaut
tant qu'il n'est pas clos, plutôt que de disparaître ou de passer au vert à tort.

---

## 7. Symptôme 2 — reconnexion fantôme (non traité ici)

« Si je reviens à l'accueil puis sur le cockpit, il me redemande de me connecter. »

Ce n'est **pas** une perte de session : Supabase montre `sessions_timebox=0`, des
sessions vivant 47 jours, aucune course de rotation de refresh token, ~1 session créée
par jour. C'est un problème de rendu/navigation côté client. Cause non établie —
à traiter dans une investigation séparée, surtout pas dans la même PR.
