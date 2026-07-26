# PR-LEGAL-1 — Cookies management RGPD-compliant — Rapport final

- **Date** : 2026-05-06 22:00 (UTC+2)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Phase 0 OK
- **Branche** : `feat/legal-1-cookies-consent-management`
- **Commits** : `4bf10ff feat(consent): RGPD-compliant granular cookies management (PR-LEGAL-1)`
- **PR ouverte** : **https://github.com/thierryvm/ankora/pull/120**
- **mergeStateStatus initial** : `UNSTABLE` (CI en cours)

---

## TL;DR @cowork — 90 secondes

1. **Banner 3 boutons granulaire** livré (Essential only / Customize / Accept all). Customize panel = 2 toggles indépendants (analytics + marketing).
2. **Backend audit trail** : Server Action `recordCookieConsentAction()` qui persiste chaque scope (cookies.analytics, cookies.marketing) dans `user_consents` (table existante, pas de migration). Visiteurs publics = silent no-op (localStorage only). Authentifiés = full GDPR audit (version, IP, UA, timestamps).
3. **Settings → Cookies & confidentialité** + **Footer "Modifier mes préférences cookies"** = 3 méthodes équivalentes pour modifier consent (RGPD art. 7(3)).
4. **Bonus Sourcery PR #119 follow-up** : `<BrandHomeLink>` partagé Header/Footer + `<svg aria-hidden focusable={false}>` → 1 seule annonce SR au lieu de 2.
5. **Quality gates locaux 100% verts** : 623/623 vitest, 0 lint errors, typecheck clean, build clean.
6. **PR #120 attend CI complet + ta validation merge bypass admin** (Playwright BUG-iOS-011 toujours attendu rouge).

---

## Décisions @cowork suivies (toutes intégrées)

| #   | Décision @cowork                                  | Application                                                        |
| --- | ------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Banner maison amélioré (PAS Klaro!)               | ✅ implémenté ConsentBanner étendu                                 |
| 2   | Pas de TCF v2.2                                   | ✅ skipped (Phase 1 sans tracker)                                  |
| 3   | Granularité analytics/marketing indépendantes     | ✅ 2 scopes distincts persistés                                    |
| 4   | Sync backend obligatoire (audit RGPD)             | ✅ `recordCookieConsentAction()` + table `user_consents`           |
| 5   | Settings UI + Footer link (RGPD art. 7(3))        | ✅ 3 méthodes équivalentes                                         |
| 6   | Cookies legal page finalisée + draft retiré       | ✅ enrichie (manage methods + withdrawal) + draft retiré 5 locales |
| 7   | i18n 5 locales parité (pas FR placeholders)       | ✅ traductions natives via patch-i18n script .mjs                  |
| 8   | Sourcery PR #119 follow-up (BrandHomeLink + a11y) | ✅ refactor Header/Footer + svg aria-hidden                        |

---

## Architecture livrée — 8 surfaces

| #   | Fichier                                                       | Type          | Notes                                                                         |
| --- | ------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| 1   | `src/lib/actions/consent.ts`                                  | Server Action | recordCookieConsentAction + getCookieConsentAction + resetCookieConsentAction |
| 2   | `src/lib/actions/consent-types.ts`                            | Types         | Sibling pour types/const (lint:use-server async-only)                         |
| 3   | `src/components/gdpr/ConsentBanner.tsx`                       | Client        | 3 boutons + customize panel + reopenConsentBanner export                      |
| 4   | `src/app/[locale]/app/settings/CookiesPreferencesSection.tsx` | Client        | SSR snapshot + localStorage hydration freshness                               |
| 5   | `src/app/[locale]/app/settings/SettingsClient.tsx`            | Client        | Refactor : nouveau prop `cookiesSection` slot                                 |
| 6   | `src/app/[locale]/app/settings/page.tsx`                      | RSC           | Pré-fetch consent snapshot via Server Action                                  |
| 7   | `src/components/layout/CookiePreferencesLink.tsx`             | Client        | Footer button → `reopenConsentBanner()`                                       |
| 8   | `src/components/brand/BrandHomeLink.tsx`                      | RSC           | Sourcery PR #119 followup — shared Header/Footer                              |

Plus : Footer + Header refactorisés pour utiliser `BrandHomeLink`, page `/legal/cookies` enrichie (3 nouvelles sections), 5 fichiers `messages/*.json` patchés en lockstep, 4 fichiers de tests créés/étendus, 1 spec E2E.

---

## Décisions techniques notables

### A. Source backend = `user_consents` (pas `consent_records`)

Le prompt @cowork mentionnait `consent_records`. La table existante en DB s'appelle `user_consents` (créée par `20260416000001_initial_schema.sql`) avec scopes enum `('tos','privacy','cookies.analytics','cookies.marketing','newsletter')`. **Décision** : utiliser l'existante pour cohérence avec `recordConsent()` / `getConsents()` déjà testés en prod (logique GDPR du flow auth déjà branchée dessus). Pas de migration. Pas de duplication.

### B. `localStorage.NEXT_LOCALE` cookie = source de vérité côté client

Le banner persiste dans `localStorage['ankora.consent.v1']` (clé inchangée, version inchangée à `1.0.0`). Pour les visiteurs non-auth, ça reste leur seule trace. Pour les auth, le backend devient la source canonique mais le localStorage est gardé pour réactivité instantanée (pas de round-trip serveur sur chaque page load).

### C. `reopenConsentBanner()` via flag localStorage

Plutôt qu'un context provider ou un event bus, le mécanisme est simple : un flag `'ankora.consent.reopen' === '1'` que le ConsentBanner check via `useSyncExternalStore`. Le clic sur Footer link / Settings reset → set flag → banner re-render. Robuste, testable, zéro dépendance.

### D. `'use server'` strict — types extraits

`scripts/lint-use-server.mjs` (CI gate Ankora) force chaque fichier `'use server'` à n'exporter que des `async functions`. J'ai donc extrait `COOKIE_CONSENT_VERSION`, `CookieConsentInput`, `CookieConsentSnapshot` dans `src/lib/actions/consent-types.ts` (sibling). Pattern propre et explicite.

### E. Slot `cookiesSection` dans `SettingsClient`

Pour respecter l'ordre canonique demandé (cookies entre DataCard et DangerZone), j'ai ajouté un prop optionnel `cookiesSection?: React.ReactNode` plutôt que d'inliner la fetch SSR dans le client tree. Pattern slot React idiomatique, zéro impact sur les tests existants.

---

## Sourcery PR #119 follow-up — détails

| Fichier                                  | Avant                                                      | Après                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/components/brand/BrandHomeLink.tsx` | n'existait pas                                             | RSC partagé, props `ariaLabel` + `logoClassName`                                                            |
| `src/components/layout/Header.tsx`       | `<Link><AnkoraLogo /></Link>` inline                       | `<BrandHomeLink ariaLabel={t('homeAria')} logoClassName="h-8 w-auto" />`                                    |
| `src/components/layout/Footer.tsx`       | idem inline (depuis PR #119)                               | `<BrandHomeLink logoClassName="h-7 w-auto" />`                                                              |
| `src/components/brand/AnkoraLogo.tsx`    | `<svg role="img" aria-label="Ankora">` toujours visible AT | hérité — overridé via `aria-hidden focusable={false} aria-label={undefined}` quand wrappé par BrandHomeLink |

Tests `Footer.test.tsx` mis à jour : ne cherche plus `getByRole('img', { name: 'Ankora' })` (qui ne match plus puisque hidden). Cherche le aria-label `Accueil Ankora` du Link.

---

## Quality gates ✅

| Gate                      | Résultat                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| `npm run lint`            | ✅ 0 erreur, 7 warnings `no-console` (intentionnel error boundaries) |
| `npm run lint:use-server` | ✅ All `use server` files contain only async exports                 |
| `npm run typecheck`       | ✅ 0 erreur                                                          |
| `npx vitest run` (full)   | ✅ **623/623 tests pass**, 64 fichiers (4 nouveaux)                  |
| `npm run build`           | ✅ exit code 0, all routes prerender                                 |

### Tests détaillés

| Fichier                                                                      | Cas | Couverture                                                              |
| ---------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------- |
| `src/components/brand/__tests__/BrandHomeLink.test.tsx`                      | 5   | aria-hidden svg, no duplicate aria-label, focus classes                 |
| `src/components/gdpr/__tests__/ConsentBanner.test.tsx`                       | 8   | 3 boutons, accept-all, essential-only, customize-then-save, reopen flag |
| `src/app/[locale]/app/settings/__tests__/CookiesPreferencesSection.test.tsx` | 5   | snapshot hydration, toggle persist, reset reopens banner                |
| `src/components/layout/__tests__/Footer.test.tsx` (extended)                 | +1  | new `cookiePreferences` button verified                                 |
| `e2e/cookies-consent.spec.ts`                                                | 4   | first-visit banner, accept-all flow, customize, footer reopen           |

---

## DoD canonique 5/5 — état actuel

| #   | Critère DoD                           | État                                                              |
| --- | ------------------------------------- | ----------------------------------------------------------------- |
| 1   | `gh pr checks` ✅ tous verts          | ⏳ CI en cours sur `4bf10ff` (lint/test/security/Vercel)          |
| 2   | Sourcery silent sur le DERNIER commit | ⏳ Sourcery review status `skipping` initial — vérifier après run |
| 3   | Threads humains résolus               | ⏳ aucun thread ouvert (PR fraîche)                               |
| 4   | Branch up-to-date with main           | ✅ rebased on `8666fd2` (PR #119 mergée)                          |
| 5   | mergeStateStatus CLEAN                | ⏳ `UNSTABLE` initial post-push (normal CI en cours)              |

**À surveiller** : Playwright E2E job va vraisemblablement échouer sur BUG-iOS-011 #116 (overflow iPhone SE landing). **Accepté @cowork pour le merge bypass admin** (cf. directive Phase 1).

---

## Statut CI initial post-push

```
Vercel Preview Comments        pass    0
Lint + Typecheck + Unit Tests  pending 0
Security audit                 pending 0
check-sourcery-resolved        pass    2s
Sourcery review                skipping
Vercel                         pass    0   (deployment ready)
label                          pass    4s
```

---

## Backlog post-merge (flag pour @cowork)

1. **Mettre à jour `.tmp/patch-i18n-pr-legal-1.mjs`** : le script restera dans `.tmp/` (gitignored) à titre de référence pour la prochaine fois qu'on patche en lockstep 5 locales. Optionnel : promouvoir vers `scripts/i18n-patch.mjs` si pattern récurrent.
2. **Page `/app/settings/consent-history`** mentionnée dans le prompt comme option : non-livrée (scope creep). Si tu veux l'ajouter post-merge, prévoir une mini-PR séparée qui lit `getConsents()` + render timeline. Estimation 1-2h.
3. **Anti-tracking-by-default** : Klaro! / TCF v2.2 ré-évaluation Phase 2 si Ankora ajoute Plausible / Sentry replays / pixel marketing. Pas urgent v1.0.

---

## Actions @cowork demandées

- [ ] Vérifier la PR #120 → CI lint/typecheck/test/build verts + Sourcery silent ou approuvé
- [ ] Smoke test sur Vercel preview (incognito → 3-button banner → 3 méthodes reset → footer reopen)
- [ ] Approuver + squash merge avec **bypass admin** sur Playwright iPhone SE (BUG-iOS-011 connu/accepté)
- [ ] (optionnel) Documenter le pattern `consent-types.ts` sibling dans `docs/CONVENTIONS.md` ou similaire si tu juges utile pour les prochaines Server Actions

## Pour @thierry (validation post-merge)

- PR #120 prête à review : https://github.com/thierryvm/ankora/pull/120
- Conformité RGPD APD belge complète sur cookies (consent libre + explicite + éclairé + retirable + audit trail)
- Aucun impact Voie D (modules domain non touchés)
- Sprint Voie D PR-D3 toujours sur les rails pour lundi 12 mai

---

**Push done ≠ task done.** Squash merge attendu après ta validation finale + bypass admin Playwright.

— @cc-ankora (Opus 4.7) · 2026-05-06 22:00 UTC+2
