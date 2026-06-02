# Handoff — Session 2026-06-02 (soir) : Dashboard Phase 0 « Situation du mois » Hero

> 2026-06-02 ~21:10 · @cc-ankora · clôture session (quota bas — suite demain)

## 0. TL;DR reprise

PR **#217** (draft, branche `feat/dashboard-situation-mois-hero`) = Hero cockpit « Situation du mois » + nettoyage dashboard. **Validé visuellement @thierry « pour ce soir ».** Restant avant merge : lighthouse + QA agents voie LOURDE + DoD5 (à faire demain). Décision simulateur (graphique/Tremor) = **demain**. Phase 2 (page Factures) = PR séparée après.

## 1. Livré (commits sur la branche, tout vert : 1421 tests · build · lint · typecheck)

- **Hero « Situation du mois »** (NORTH_STAR #1 waterfall) : statut 🟢🟠🔴 + ⚪ incomplet (fix THI-335), chiffre-héros « Reste disponible » (= `resteDisponible`), flow vertical (Revenus → Charges → Provisions → Reste disponible → vie courante/épargne), AllocationBar SVG-maison **CSP-safe**, nudge FSMA + lien plan. Subsume + supprime `EffortFinancierCard` + `CapaciteEpargneCard` (+ tests). Garde `AjusterResteAVivreDrawer`.
- **Fonction domaine pure** `calculerSituationDuMois` ([situation-mois.ts](../../src/lib/domain/cockpit/situation-mois.ts)) — compose les primitives cockpit existantes, zéro calcul nouveau. 8 tests.
- **Décimales app-wide** : `formatCurrency` → `trailingZeroDisplay: 'stripIfInteger'` (500,00 € → 500 €, vraies décimales gardées).
- **THI-322 — ProgressBar CSP-safe** : remplissage SVG `<rect>` + hauteur via classe (`atm-pbar--{size}`), plus aucun `style={{}}` inline. atoms.css : tons `background` → `fill`. Tests réécrits.
- **Carte Santé** : layout 2-col interne + pleine largeur (fini le vide à droite).
- **Légende barre** : pastilles couleur sur le flow (Charges=info, Provisions=brand-500, Reste à vivre=accent-400, Capacité=success) — le flow EST la légende, zéro doublon.
- **Vocabulaire** : adopté l'existant (Reste disponible / Reste à vivre / Capacité épargne) → zéro migration, parité simulateur gratuite.
- i18n `dashboard.situation.*` × 5 locales (FR+EN réels, 3 post-launch en miroir FR).

## 2. Décisions @thierry verrouillées cette session

- Per-day « ≈ X/jour » sur la ligne **Reste à vivre** → **validé**.
- 2-col Hero **reverté** (mauvais ciblage — il visait la carte Santé, pas le Hero).
- Scope élargi PR = « dashboard Phase 0 clean » (1 PR, 1 merge).
- **Phase 2 (PR séparée)** : page Factures `/app/charges` adopte le **langage visuel** de la carte cockpit « Prochaines factures » MAIS garde **groupement fréquence + sous-totaux THI-300 + édition/suppression** (pas de bascule temps, pas de régression CRUD). Challenge fait : scopes pas identiques (lecture seule vs CRUD).
- « − 59 € » Provisions lissées = Σ (factures non-mensuelles / leur cycle : annuel/12, semestriel/6, trimestriel/3). Confirmé à @thierry.

## 3. Console / CSP (à finir de vérifier demain)

- `0k3-xio-dogxw.js` inline-style = **ProgressBar (THI-322), corrigé** → disparaît au redeploy.
- `feedback.js` + `vercel.live` = **toolbar preview Vercel**, absente en prod.
- `/app:1` résidu → **à vérifier post-deploy** (grep dit ProgressBar = seule source inline-style sur /app home ; si persiste = injection framework à tracer).

## 4. Restant avant merge (DoD) — DEMAIN

1. Vérif console /app post-deploy (résidu `/app:1`).
2. **Lighthouse** (≥95 perf / 100 a11y-BP-SEO) + **QA agents voie LOURDE** : `financial-formula-validator`, `dashboard-ux-auditor` Layer 0, `ui-auditor`, `mobile-ios-auditor`, `i18n-auditor`. (PAS lancés ce soir — quota.)
3. DoD5 (CI vert · Sourcery silencieux · threads résolus · pas de conflit · rapport `docs/prs/`).
4. Refs `.claude/` stale (`dashboard-ux-auditor.md` + `ankora-design-system` SKILL → réfèrent `CapaciteEpargneCard`/`EffortFinancierCard` supprimés) → **PR `.claude/` dédiée** (banned-list item 3).

## 5. Décisions ouvertes — DEMAIN

- **Simulateur** : graphique « pas pro » (sparkline SVG triangle). Options : (a) refaire le sparkline SVG proprement (garde budget 0 + direction SVG-maison), (b) lib chart (Tremor ↔ bundle/perf, contre la direction lockée — décision dépendance @thierry). → trancher demain.

## 6. PR ouverte

#217 (draft) — `feat/dashboard-situation-mois-hero`. ~9 commits. Spec+plan : `docs/plans/dashboard-phase0-situation-mois-{design,plan}.md`.

## 7. Git

Branche `feat/dashboard-situation-mois-hero` poussée (HEAD `d21ed1a`). `main` intacte. `public/llms-full.txt` modifié non-stagé (pré-existant, pas à nous).

## 8. Reprise demain (ordre)

1. Vérif console post-deploy + lighthouse.
2. QA agents voie LOURDE → corriger findings.
3. DoD5 + rapport + ready PR #217 → merge.
4. Décision simulateur.
5. Phase 2 : PR unification page Factures.
