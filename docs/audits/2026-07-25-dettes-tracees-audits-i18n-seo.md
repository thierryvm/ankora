# Dettes tracées — audits i18n & SEO du 25 juillet 2026

Constats remontés par `i18n-auditor` et `seo-geo-auditor` pendant la PR #258, **hors de son
périmètre**. Aucun n'est corrigé ici : étendre le scope d'une PR en vol est une action
bannie (doctrine `CLAUDE.md`). Tracés pour être planifiés, pas redécouverts.

---

## P0 — Les redirections serveur non préfixées perdent la langue

**Introduit par #258**, arbitré par @thierry le 25/07 : merger et enchaîner une PR de suivi.

En `localePrefix: 'as-needed'`, le préfixe du français est `/fr-BE`, jamais la chaîne vide.
Un chemin comme `/login` ne matche donc aucun préfixe de locale, et c'est la branche cookie
de `localeDetection` qui rattrapait le coup en émettant un 307 vers `/en/login`. Cette
branche n'existe plus.

Mesuré, requête `/app` avec cookie `NEXT_LOCALE=en` :

| Config     | Résultat                                    |
| ---------- | ------------------------------------------- |
| Avant #258 | `307 → /en/app` — l'anglais est préservé    |
| Après #258 | `307 → /login` — non préfixé, donc français |

**Sites concernés** — tous en `redirect()` de `next/navigation` brut :

| Fichier                                                  | Cibles                                                  |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/auth/require-user.ts`                           | `/login`, `/onboarding`                                 |
| `src/lib/auth/require-admin.ts`                          | `/app`                                                  |
| `src/lib/data/workspace-snapshot.ts`                     | `/login`, `/onboarding` (×3)                            |
| `src/lib/actions/auth.ts`                                | `/signup/check-email`, `/app`, `/`, `/login?reset=done` |
| `src/lib/actions/onboarding.ts`                          | `/app`                                                  |
| `src/app/[locale]/onboarding/page.tsx`                   | `/app`                                                  |
| `src/app/[locale]/app/settings/deletion-status/page.tsx` | `/app/settings`                                         |

**Effet** : un utilisateur anglophone connecté dont la session expire, qui se connecte, se
déconnecte ou finit son onboarding atterrit sur une page française. Avant le lancement,
aucun utilisateur anglophone connecté n'existe — d'où l'arbitrage.

**Correctif** : mécanique. Le bon pattern est déjà dans
`src/app/auth/callback/route.ts` (`localiseTarget()`), alimenté par `getLocale()` de
`next-intl/server`. Attention : le `redirect()` de `@/i18n/navigation` exige un paramètre
`locale` explicite, il ne l'infère pas.

**Voie lourde** : gardes d'authentification + Server Actions → nouveau plan +
`plan-reviewer` obligatoires. Aucun test E2E actuel ne peut voir cette régression (les
parcours connectés sont skippés en CI, secrets `E2E_*` absents) : prévoir une validation
Playwright seedée locale.

---

## P1 — Le sélecteur de langue des Réglages est cassé (préexistant)

Deux défauts cumulés, indépendants de #258 :

1. `updateProfileAction` (`src/lib/actions/settings.ts`) écrit **seulement** `users.locale` —
   jamais le cookie, et sans `revalidatePath('/', 'layout')`. Sauvegarder sa langue depuis
   Réglages › Profil n'a donc **aucun effet visible**, la résolution étant désormais
   pilotée par l'URL.
2. Le `<Select>` de `SettingsClient.tsx` (`ProfileCard`) propose `fr-BE`, `fr-FR`, `en-GB`.
   Le schéma serveur valide avec `z.enum(LOCALES)` où `LOCALES = ['fr-BE','nl-BE','en','es-ES','de-DE']`.
   **`fr-FR` et `en-GB` n'y sont pas** → toute valeur autre que `fr-BE` échoue en validation
   Zod avec un toast d'erreur générique.

À traiter ensemble : soit aligner le select sur `LOCALES_VISIBLE` et faire passer
l'écriture par `setLocaleAction`, soit retirer le champ des Réglages puisque le switcher
d'en-tête le couvre déjà.

---

## P1 — Quatre bugs SEO préexistants

Relevés par `seo-geo-auditor`, aucun causé par #258.

1. **Pages `noindex` soumises au sitemap** — `src/app/sitemap.ts` inclut `/legal/cgu`,
   `/legal/privacy`, `/legal/cookies` pour les 5 locales (15 URLs), alors que chacune pose
   `robots: { index: false }`. Search Console les signalera en « URL envoyée marquée
   noindex ».
2. **Canonique cross-locale sur la FAQ et les pages légales** — `faq/page.tsx` et les pages
   légales codent en dur `alternates: { canonical: '/faq' }`, jamais préfixé. Quand un
   segment déclare `alternates`, Next **remplace** la valeur du parent : `/en/faq` émet donc
   une canonique vers `https://ankora.be/faq`, ce qui canonicalise l'anglais vers le
   français et contredit le `Link` hreflang de la même URL.
3. **Le glossaire se canonicalise vers l'accueil** — `glossaire/page.tsx` ne déclare aucun
   `alternates` et hérite donc silencieusement de la canonique du layout parent (`/`).
   `glossaire/[slug]/page.tsx` n'a pas ce défaut.
4. **Locales non traduites indexables** — `nl-BE`, `es-ES`, `de-DE` ne sont ni `noindex`
   ni exclues du sitemap alors que le contenu `landing.*` y est du français verbatim.
   Piste : cadrer la boucle de `sitemap.ts` sur `LOCALES_VISIBLE`, comme le glossaire le
   fait déjà.

Verdict global de l'audit SEO sur #258 : **GO, aucune régression du diff.**

---

## P2 — Divers

- `src/i18n/request.ts` est un **3ᵉ lecteur** du cookie `NEXT_LOCALE`, non documenté et
  très probablement inerte (l'arbre `[locale]` étant en rendu dynamique, `requestLocale`
  est toujours renseigné). Soit le supprimer, soit corriger la note de `routing.ts` qui
  n'en annonce que deux.
- Les deep-links `/nl-BE`, `/de-DE`, `/es-ES` résolvent toujours — mais **aucun test** ne le
  vérifie. Un `page.goto('/nl-BE')` + assertion sur `html[lang]` suffirait.
- `public/llms.txt` annonce « operating in French, Dutch, English » alors que
  `LOCALES_VISIBLE` vaut FR + EN. À reformuler.
