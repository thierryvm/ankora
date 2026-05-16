# Dashboard UX Auditor — PR-SEC-ADMIN

- **Date** : 2026-05-10
- **Branche** : `feat/sec-admin-hardening` (HEAD `861be8a`)
- **Surface auditée** : lien admin conditionnel ajouté au Header (variant `app`)
- **Périmètre** : `src/components/layout/Header.tsx`, `src/components/layout/HeaderNav.tsx` (mobile drawer), `messages/*.json` (i18n parité), `src/lib/auth/is-admin.ts` (gating)
- **Status** : **PASS_WITH_FINDINGS**

---

## Synthèse

Le lien admin est implémenté avec une discipline serveur correcte (`isAdmin()` SSR fail-closed), une parité i18n stricte 5/5 sur 2 clés (`nav.admin` + `nav.adminAriaLabel`), un pattern visuel cohérent avec les autres entrées de nav (`Button asChild variant="ghost" size="sm"`), et une couverture test à 3 cas (admin=true → link présent, admin=false → caché, marketing+admin=true → caché).

L'implémentation est **fonctionnellement saine et a11y conforme** mais présente **3 frottements UX/design-system mineurs** à arbitrer avant merge ou à tracer en dette explicite.

---

## Checklist (≥15 points vérifiés)

### Design Tokens & Styling

- [F1] **Couleur amber non tokenisée** : `bg-amber-500` (Tailwind `#f59e0b`) utilisé pour le marker. Le projet a un token sémantique `--color-warning: #d97706` (cf. `globals.css:105`, locké par @cowork 2026-04-25 comme "universal UX signal amber = attention"). Le marker admin n'est PAS un warning sémantique (c'est un marqueur "zone privée"), ce qui justifie de ne pas réutiliser `--color-warning`. **Mais** l'utilisation directe de la palette Tailwind contourne la convention `token-usage.md`. Décision attendue : (a) introduire un token dédié `--color-admin-marker` ou `--color-private-zone`, ou (b) documenter explicitement dans `token-usage.md` que `bg-amber-500` est une exception assumée pour ce marqueur unique.
- [x] Spacing : `gap-1.5` (6px) entre label et dot, échelle Tailwind respectée
- [x] Border radius : `rounded-full` sur le dot, token Tailwind standard
- [x] Typography : hérite `Button size="sm"` → `text-sm`, cohérent avec le reste de la nav

### Micro-interactions & Feedback

- [x] **Hover state** : hérité du Button ghost (hover:bg-accent), cohérent
- [x] **Focus state** : hérité du Button ghost (focus-visible:ring-brand-600 via composant)
- [x] **Active state** : pas de marquage "page active" sur les liens nav app — comportement déjà existant pour Settings/Charges/etc., pas une régression PR-SEC-ADMIN
- [x] **Transition timing** : hérite des transitions Button (durée 200ms par défaut)
- [F2] **Marker non animé** : le dot amber est statique. Pour signaler "zone privée" sans être agressif, un `motion-safe:animate-pulse` léger (ou un breathing 4s) pourrait être envisagé — actuellement le marker est purement visuel sans renforcement temporel. Non-bloquant V1, dette UX à tracer.

### Empty / Error / Loading states

- N/A — un lien de nav n'a pas d'état de chargement propre. Le gating SSR via `isAdmin()` est fail-closed (cf. `is-admin.ts:40-43` `catch → return false`), donc en cas d'erreur transitoire le lien disparaît silencieusement (correct, secure-by-default).

### Component Accessibility & Semantics

- [x] **Sémantique** : `<nav aria-label>` + `<Link>` rendu en `<a>`, hiérarchie correcte
- [x] **aria-label dédié** : `t('nav.adminAriaLabel')` enrichit le label visible "Admin" avec le contexte ("Espace admin (réservé fondateur)") — pattern WAI-ARIA correct (le aria-label REMPLACE le contenu textuel pour les AT)
- [x] **Decorative dot** : `aria-hidden="true"` ✓
- [x] **Color contrast** : `bg-amber-500 #f59e0b` est un élément graphique non-textuel ; les non-text UI components doivent atteindre 3:1 contre l'arrière-plan adjacent (WCAG 2.2 SC 1.4.11). Sur `bg-background` clair (`#ffffff`) le ratio est ~2.4:1 → **risque de non-conformité 1.4.11**. Voir [F3] ci-dessous.
- [x] **Keyboard navigation** : Link standard, navigable au Tab

### Cohérence Header (PR-SEC-ADMIN spécifique)

- [x] **Position dans la nav** : dernier item après Settings — sémantiquement OK (utilitaire/transverse)
- [F3] **Contraste WCAG SC 1.4.11 (Non-text Contrast)** : `bg-amber-500 #f59e0b` contre `bg-background #ffffff` ≈ 2.4:1 — **sous le seuil 3:1**. Le marker étant un signal d'information (différenciation visuelle de la zone admin), il tombe dans le champ de SC 1.4.11. Préconisation : passer à `bg-amber-600` (`#d97706`, ratio ~3.5:1, ce qui correspond exactement au token `--color-warning`) OU utiliser le token `--color-warning` directement, en assumant la cohérence sémantique "amber = attention/zone protégée".
- [x] **i18n parité 5/5** : fr-BE, nl-BE, en, de-DE, es-ES — les 2 clés (`nav.admin` + `nav.adminAriaLabel`) présentes partout (vérifié grep ligne 31 sur les 5 fichiers)

### Mobile (HeaderNav.tsx drawer)

- [F4] **Lien admin absent du drawer mobile** : `HeaderNav.tsx:196-241` liste dashboard/accounts/charges/expenses/simulator/settings mais PAS admin. **Cohérence cassée** : un admin sur mobile ne peut pas accéder à `/admin` via la nav (devra taper l'URL ou passer par le footer si présent). Décision attendue :
  - **Option A (V1 desktop-only assumée)** : documenter explicitement dans le code (commentaire HeaderNav.tsx) ET dans la PR description que admin = desktop-only V1 (rationale : surface admin pas mobile-optimisée, friction acceptable pour 1 user fondateur).
  - **Option B (parité immédiate)** : ajouter le lien admin conditionnel au drawer — implique de passer `showAdminLink` en prop à HeaderNav (ce dernier est `'use client'`, donc le calcul SSR doit rester côté Header.tsx et descendre via prop, pas un nouveau call `isAdmin()` côté client).
  - **Recommandation** : Option B, car (a) le pattern "admin pour 1 user" Belgique implique que ce user utilise potentiellement son iPhone (cf. Mobile Recovery Day 2026-05-04), (b) c'est moins de 10 lignes de code, (c) cohérence stricte > pragmatisme V1 quand le coût est faible.

### Tests

- [x] 3 cas testés (`Header.test.tsx:118-137`) : admin=true → link visible, admin=false → caché, marketing+admin=true → caché. Couverture suffisante pour le scope nav desktop. Si Option B retenue, ajouter 1 test drawer mobile.

---

## Top 3 Findings

1. **[F3] Contraste WCAG SC 1.4.11 sur le dot marker** — `src/components/layout/Header.tsx:77` — `bg-amber-500` (`#f59e0b`, ~2.4:1 vs background blanc) sous le seuil 3:1 pour Non-text Contrast. Fix : `bg-amber-600` ou réutiliser le token `--color-warning` (`#d97706`, ~3.5:1).
2. **[F4] Lien admin absent de HeaderNav (drawer mobile)** — `src/components/layout/HeaderNav.tsx:196-241` — incohérence desktop/mobile pour les utilisateurs admin. Décision : passer `showAdminLink` en prop depuis Header.tsx (calcul SSR conservé) et ajouter la branche conditionnelle dans le drawer.
3. **[F1] Couleur amber non tokenisée** — `src/components/layout/Header.tsx:77` — `bg-amber-500` direct contourne la convention `token-usage.md`. Décision attendue de @cowork : token dédié `--color-admin-marker` ou exception documentée. Lié à F3 si on bascule sur `--color-warning`.

---

## Verdict

**PASS_WITH_FINDINGS** — le code est mergeable du point de vue UX strict (ghost button + size sm + aria-label dédié + i18n 5/5 + tests), mais 3 dettes UX/a11y/cohérence à arbitrer :

- **F3 a11y bloquant si l'on est strict WCAG 2.2 AA** (SC 1.4.11) — fix 1 ligne (`bg-amber-500` → `bg-amber-600`).
- **F4 cohérence mobile** — ~10 lignes pour parité drawer.
- **F1 token hygiene** — décision @cowork doctrine design.

Recommandation : appliquer F3 minimum avant merge (1 caractère), tracer F1 et F4 en issues GitHub si non traités dans cette PR.

---

## Path audit report

`F:\PROJECTS\Apps\ankora\docs\audits\2026-05-10-pr-sec-admin\dashboard-ux-auditor.md`
