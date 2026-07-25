# Handoff — 25 juillet 2026, ~04:00 — Refonte UX Phase 1 + bug SW non résolu

## 1. État à la reprise

`main` propre, **0 PR ouverte**, tout mergé. 11 PR livrées dans la session.

## 2. ⚠️ PRIORITÉ 1 — le bug locale/session PERSISTE après #252

@thierry a testé après déploiement : **le bug est toujours là**. Mon correctif SW
(#252) n'était donc pas la cause racine, ou pas la seule.

**Ce qui est prouvé** (à ne pas re-vérifier) :

- Avant #252, le Cache Storage contenait bien 8 entrées `?_rsc=` (dont des
  payloads `/en?_rsc=…`) + le document `/`. Mesuré sur build de prod.
- Après #252, ces entrées ont disparu (0 RSC, 0 document) — vérifié localement.
- La locale seule (sans auth, sans SW) fonctionne parfaitement : FR→EN→FR +
  navigation + reload = OK.
- `users.locale` = `fr-BE` pour les 5 users en base → la DB n'est pas la cause.
- Ordre de résolution : `requestLocale` (URL) > cookie `NEXT_LOCALE` > DB > défaut.
  **L'URL gagne toujours.**

**Donc la piste restante** : quelque chose produit une URL `/en` (ou un payload
EN) hors du SW. Candidats non encore explorés :

- Le **router cache client de Next 16** (distinct du SW) — payloads RSC prefetchés
  conservés en mémoire/disque par Next lui-même. Le commentaire de
  `src/lib/actions/locale.ts:59` (THI-276) mentionne exactement ce risque.
- Le scénario e2e de non-régression correspondant est `test.skip` :
  `e2e/i18n/locale-switcher.spec.ts:180` → à réactiver, c'est probablement lui
  qui aurait attrapé ça.
- Vérifier si le bug se produit aussi **hors PWA / en navigation privée**, pour
  isoler cache navigateur vs SW vs serveur.

**Méthode recommandée** : demander à @thierry de reproduire en gardant la console
ouverte, et dumper `caches.keys()` + l'URL au moment du basculement. Ou reproduire
en local **connecté** (le script `npm run e2e:auth` existe pour ça — attention au
rate limit auth : 5 logins / 15 min par IP).

## 3. ⚠️ PRIORITÉ 2 — violations CSP en prod (nouveau, non traité)

Console de @thierry sur `https://ankora.be/app` (25/07, verbatim) :

```
385weld3d2j8q.js:1 Applying inline style violates … 'style-src 'self' 'nonce-U3dHUEZYa2RVVm5Sdm5QYkhaQWV2''
   hash sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=
(anonymous) @ 385weld3d2j8q.js:1
385weld3d2j8q.js:1 Applying inline style violates … (même directive)
   hash sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=
```

Points établis :

- La source est **`385weld3d2j8q.js`** = un chunk Next hashé → **notre bundle**,
  PAS une extension. C'est un vrai bug Ankora.
- **Deux hashes différents** = deux styles distincts bloqués :
  - `47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=` est le hash de la **chaîne
    vide** → un `style` vide est appliqué quelque part.
  - `CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=` est un style **non vide**,
    contenu inconnu.
- Piste : du JS runtime qui pose un attribut `style` (le CSSOM `el.style.x = …`
  n'est PAS soumis à `style-src`, mais `setAttribute('style', …)` l'est). Chercher
  côté `style={{…}}` React rendus en SSR et côté libs tierces du bundle.
- Nos barres de progression utilisent `style={{ width: '…%' }}` (cf. commentaires
  « CSP-safe : attribut, pas balise `<style>` ») — à re-vérifier, c'est peut-être
  précisément ce qui est bloqué en prod alors qu'on le croyait sûr.

**Bruit à ignorer** dans la même console : `ActionableCoachmark`, `showOneChild`
depuis `chrome-extension://…/content-script-idle.js` et
`…/ch-content-script-dend.js` → **extensions Chrome de @thierry**, pas Ankora.

## 4. Livré cette session (11 PR)

| PR   | Contenu                                                        |
| ---- | -------------------------------------------------------------- |
| #245 | Phase 0 nettoyage (−3403 lignes)                               |
| #247 | Agent `mobile-liquid-glass-auditor`                            |
| #248 | Sécu postcss (ouverte par @thierry)                            |
| #249 | **Gate CI scopé prod** (`--omit=dev`) — débloque toutes les PR |
| #250 | `npm run e2e:auth`                                             |
| #251 | **Phase 1b — token `.surface-overlay`**                        |
| #252 | Fix SW RSC (n'a PAS résolu le bug — cf. §2)                    |

Plus tôt dans la session : #235→#244 (engagements cockpit + stepper, simulateur,
passe visuelle, sécu next).

## 5. Décisions verrouillées

- **Programme de refonte** : spec canonique
  `docs/superpowers/specs/2026-07-24-ankora-refonte-ux-program-design.md`
  (6 phases, architecture Liquid Glass réconciliée WCAG AA).
- **Règle glass** : le glass va sur ce qui **flotte** (nav, sheets), **jamais** sur
  le contenu. Le texte est toujours sur une surface opaque.
- **82 %** dans `.surface-overlay` : constante épinglée par test — c'est ce qui
  tient le texte de nav à 4.76:1 en pire cas.
- **Gate CI sécurité** : bloquant sur `--omit=dev` (surface livrée), audit dev en
  informatif. Un HIGH `brace-expansion` dev-only est infixable (les 2 voies
  cassent le lint : override → `@eslint/config-array`, eslint 10 →
  `eslint-plugin-react` embarqué dans `eslint-config-next`). À re-tester quand
  Next publiera un `eslint-config-next` compatible eslint 10.
- **Secrets E2E** : volontairement absents. Prod = seul projet Supabase, la clé
  `service_role` ne doit jamais vivre en CI. 13/30 specs skippées en CI, couvertes
  par `npm run e2e:auth` en local.

## 6. Suite prévue (après les 2 priorités)

- **Phase 1c** — refonte nav mobile (bottom-tab + MoreSheet) = cœur du « je
  cherche toujours quoi faire et où » de @thierry.
- **Phase 1d** — consolidation `ui/**` (shadcn) ↔ `atoms/**` (ADR-020).
- **Phase 3 Comptes** — décision produit PENDANTE : le modèle 3-comptes est un
  invariant DB (RLS sans INSERT/DELETE). Trois voies dans la spec.
- Follow-up tracé : `Hero.tsx` / `WhatIfDemo.tsx` utilisent `<Glass>` sur du
  **contenu** — contraire à la règle §5, à migrer en Phase 5 (landing).
