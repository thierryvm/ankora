# Handoff — THI-300 (PR-UI-3a) liste charges : groupement + totaux + flatten

> 2026-06-01 ~21:45 · @cc-ankora · branche `feat/charges-list-totals-thi-300`

## 1. Objectif de session

THI-300 (PR-UI-3a) : la liste des charges ne montrait pas de total ("on ne voit jamais le total en bas" @thierry) et les cartes mobile étaient fragmentées. Refonte : groupement par fréquence + sous-totaux + total global + aplatissement mobile.

## 2. État livré

**Implémentation 100 % terminée, tous les gates locaux verts.** Code écrit, pas encore commité au moment de l'écriture de ce handoff (commit/push/PR en cours de clôture).

- `budget.ts` : + helper pur `subtotalByFrequency` (skip inactif, Decimal). Existants inchangés.
- `page.tsx` (Server) : compute subtotals + `monthlyProvisionTotal` + `annualTotal`, `.toNumber()` avant frontière RSC, props number.
- `ChargesClient.tsx` : grouping (ordre fixe, groupe vide masqué) + sous-totaux + footer total + flatten mobile (`min-h-13` pour les boutons absolute) + props.
- i18n : `subtotalLabel`/`totalMonthlyLabel`/`totalAnnualLabel` × 5 locales (glossaire-aligné).
- e2e desktop+mobile : `> li`→` li`, `charges-row-month`→`charges-row-next-due`, card→flat, + assertions grouping/totaux.
- Rapport : `docs/prs/PR-THI-300-report.md`.

**Gates réels** : typecheck 0 err ; lint 0 err ; lint:use-server OK ; vitest full 1385 passed ; ciblés 52 passed. e2e Playwright skippent en local (pas de Supabase service-role) → CI.

**Gouvernance** : plan-reviewer 🟡 APPROVED-with-changes (3 rounds — 2 quiproquos d'agents frais sans contexte levés ; tous les changements intégrés). 4 agents QA : financial-formula-validator PASS, i18n-auditor PASS, ui-auditor PASS_WITH_NOTES, mobile-ios-auditor PASS_WITH_NOTES (aucun BLOCK).

## 3. Reprise demain — DoD à finir

1. `gh pr view <N>` → CI 6 checks verts.
2. Sourcery : `gh api repos/thierryvm/ankora/pulls/<N>/comments --jq '.[] | select(.user.login=="sourcery-ai[bot]") | .body'` → vide.
3. mergeStateStatus CLEAN, pas de conflit main.
4. Live-test @thierry iPhone clair/sombre (`/app/charges`).
5. Merge (squash) → cleanup branche.

## 4. ⚠️ Régression i18n découverte en cours de session (NON liée à THI-300)

@thierry a signalé un **revert FR→EN au clic sur un lien** après switch de langue. Investigation read-only menée :

- **#209 dédouané** : son diff `routing.ts` n'est qu'un commentaire ; logique locale inchangée.
- **Cause racine VÉRIFIÉE (code)** : `public/sw.js` `isBypass()` est **locale-aveugle** — `startsWith('/app')` ne matche PAS `/en/app`. Le SW cache donc les pages authentifiées EN, ce que son propre contrat interdit. Confirmé live par `FetchEvent /en/app` + `sw.js:90 Failed to fetch` dans la console @thierry.
- **Mécanisme du revert (hypothèse forte)** : nav en `<Link>` locale-aware ; un render nav EN figé (cache SW + Router prefetch) garde des hrefs `/en/...` qui revertent au clic. `revalidatePath` purge le RSC serveur mais pas le SW ni le Router Cache client.
- **Fix prévu** (séquencé APRÈS THI-300, branche dédiée `fix/sw-locale-bypass`, infra → repro + plan-reviewer) : rendre `isBypass` locale-aware, ex. `/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(app|auth|api|onboarding)(?:\/|$)/`.
- Mémoire : `project_sw_locale_blind_bypass`.

**+ Finding séparé (3e sujet, ticket à froid)** : CSP — styles inline bloqués ×4 sur `/app` (`style-src 'self' 'nonce-…'`). Source à tracer (composant qui set un `style=` sans nonce). Décision @thierry : ticket séparé plus tard.

## 5. Dettes tracées (rappel, ne pas oublier)

- THI-312 (2 champs natifs→primitive), THI-314 (token `--color-border-strong`), THI-318 (avatar profil post-launch).
- 2 agents (`admin-dashboard-auditor`, `dashboard-ux-auditor`) sans `tools:` → ticket moindre-privilège à créer.
- Fuites i18n FR/EN pré-existantes nl/de/es (landing, cockpit, accounts, glossary) — backlog v1.1 (doctrine : seuls fr-BE+en prod-visibles v1.0).
- Mobile-polish backlog : gap boutons edit/delete 4px<8px (375px), `autocomplete` champs label.

## 6. Prochaine PR après THI-300

THI-301 (DateField : jour-du-mois + clamp dernier jour du mois). Puis hotfix `fix/sw-locale-bypass`.
