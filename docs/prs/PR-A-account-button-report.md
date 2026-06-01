# PR-A — AccountButton : menu compte (connexion/déconnexion partout)

> **Branche** : `feat/account-button-login-logout` · **Spec** : @cowork 2026-06-01
> **Auteur** : @cc-ankora (orchestrateur autonome) · **Date** : 2026-06-01

---

## 1. Problème (@thierry)

« Pas de vrai menu pour se connecter/déconnecter peu importe la page. » Investigation code-vérifiée : `logoutAction` n'était rendu **qu'à un seul endroit** (`MoreSheet.tsx`, `md:hidden`) → **desktop + tablette = zéro logout dans le chrome**, aucune identité utilisateur affichée.

## 2. Solution livrée

**`AccountButton`** (nouveau, `hidden md:flex`) : avatar initiales + dropdown ancré (identité email · Paramètres · Se déconnecter). Présent sur tablette + desktop, sur le header app **et** les pages publiques authentifiées. Mobile <768 inchangé (BottomTabBar/MoreSheet, THI-277). **`MoreSheet`** : section Compte/logout remontée en **position 1** (était 4/4) → logout sans scroll sur mobile.

## 3. Challenges à la spec @cowork (corrigés)

- **« AccountButton (server) appelle getOptionalUser() lui-même, trivial »** → **REJETÉ**. Un dropdown interactif (state/focus/portal) **doit** être Client → ne peut pas appeler `getOptionalUser()` (server-only). Cowork mélangeait Server/Client. (Le « 2e round-trip » que j'ai d'abord soulevé était partiellement surévalué : Supabase déduplique `getUser()` par requête via cookies, cf. `bottom-tab-bar-state.ts:33-34` — mais le point Server/Client tient.)
- **Architecture email** : `plan-reviewer` a tranché **Option B (prop-drill)** vs mon Option A (cache). Mon argumentaire Option A citait un pattern `cache()` **inexistant** (`shouldMountBottomTabBar` est délibérément NON-cache, leak inter-tests vitest). `require-user.ts` est instrumenté 503-diag → banned-list #2/#3. → `app/layout.tsx` réutilise le User déjà retourné par `requireUser()` et passe `userEmail` ; le Header marketing capture l'email de son `getOptionalUser` existant. **Zéro round-trip neuf, zéro touche au helper auth.**

## 4. Override des recos cowork + ux-auditor (code-vérifié)

- **PAS d'`Avatar.tsx`** (réutilisation recommandée par cowork + ux-auditor) : l'atom utilise des **inline `style={{}}`** (color-mix) bloqués par la CSP prod (`style-src 'self' 'nonce-…'` sans `unsafe-inline`, `proxy.ts:57`), et n'est utilisé **que dans `design-playground`** (jamais sur surface CSP-réelle). → avatar construit en **classes Tailwind** (`bg-brand-700` + initiales blanches), CSP-safe.
- **PAS de portal** : un dropdown ancré portalisé exigerait un positionnement inline (bloqué CSP). → `absolute` Tailwind, CSP-safe. Risque résiduel : stacking iPad Safari (backdrop-blur header) — documenté, **live-test requis**.

## 5. Fichiers

NOUVEAU : `src/components/layout/AccountButton.tsx` (+ test). MODIF : `Header.tsx` (prop `userEmail` + rendu), `app/[locale]/app/layout.tsx` (prop-drill), `MoreSheet.tsx` (réordre), `Header.test.tsx` (mock AccountButton), `messages/*.json` ×5 (`common.account`). NON touché : `BottomTabBar.tsx`/routes, `auth.ts`, contrat THI-277, `require-user.ts`.

## 6. QA agents (DoD)

| Agent                | Verdict                      | Résolution                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-reviewer`      | 🟡 APPROVED WITH CHANGES     | Option B imposée (mon Option A reposait sur un fait faux) ; défer entête email MoreSheet ; exception landing tracée — tous intégrés                                                                                                          |
| `i18n-auditor`       | PASS_WITH_NOTES              | parité 5 locales ✅ ; `common.account.logout` **identique** à `layout.moreSheet.links.logout` (5 locales) ✅ ; glossaire §2 logout = **déféré** (drift non-bloquant + collision version avec PR badge #207 concurrente)                      |
| `ui-auditor`         | PASS_WITH_NOTES → **résolu** | contrastes tous AA/AAA (avatar 6.10:1) ✅ ; F-1 aria-label dupliqué → retiré du panel ; F-3 double focus (outline global non-layered) → classes ring custom retirées, outline global seul (doctrine THI-298) ; F-4 Tab → ferme le menu (APG) |
| `mobile-ios-auditor` | PASS_WITH_NOTES              | réordre MoreSheet = **zéro régression** (scroll-lock/focus-trap/portal/safe-area intacts) ✅ ; `hidden md:flex` ✅ ; stacking iPad = live-test                                                                                               |
| `test-runner`        | ✅ local                     | typecheck 0 · lint 0 · lint:use-server ✅ · vitest 45/45 · build OK · JSON ×5                                                                                                                                                                |

## 7. Décisions tracées (follow-ups)

- **Entête email MoreSheet** (mobile) : déféré (threading `[locale]/layout` → BottomTabBar = scope creep hors Option B).
- **AccountButton sur la landing (`MktNav`)** : exclu volontairement — la landing garde sa CTA conversion « Mon cockpit ». **Exception documentée, pas un oubli.**
- **Glossaire §2 logout** : à ajouter (i18n-auditor) une fois le badge PR #207 mergé (éviter collision de version).
- **Stacking iPad Safari** : live-test ; si confiné → portal CSP-safe via CSS custom properties (pas d'inline style).
- **Zone morte nav tablette 768-1023** (nav primaire) : ticket séparé (hors PR-A).

## 8. Définition de DONE

1. CI verts (Lint, Typecheck, Tests, E2E, Security, Build) : ⏳ post-push
2. Sourcery silencieux sur dernier commit (vérif `gh api`) : ⏳
3. Review @thierry : ⏳
4. Pas de conflit main : ⏳
5. Rapport (ce doc) : ✅
6. Live-test @cowork 3 ranges (mobile/tablette/desktop) clair+sombre + **stacking iPad** : ⏳ **bloquant avant merge**
