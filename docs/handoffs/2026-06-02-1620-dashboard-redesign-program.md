# Handoff — Session 2026-06-02 (longue) : merges, breach-check, refonte dashboard cadrée

> 2026-06-02 ~16:20 · @cc-ankora · pré-`/compact` (la session continue après compaction)

## 0. TL;DR reprise

Direction refonte cockpit **figée**. Prochaine action = **Phase 0 : Hero narration dashboard** (brainstorm→spec→plan-reviewer→build). Tout le reste est tracé en tickets/PRs. Aucun code dashboard écrit (HARD-GATE brainstorm respecté).

## 1. Livré cette session (mergé + déployé PROD)

- ✅ **PR #214** (charges align + cap sparkline simulateur) — mergé.
- ✅ **PR #215** (THI-324 SW locale-aware bypass + ferme fuite cache `/admin`+`/login`) — mergé + **déployé** (PROD sert `CACHE_VERSION ankora-v3` + `PROTECTED_LOCALED`, vérifié). @thierry a **confirmé le switch FR→EN corrigé**. Reste : vider cache SW une fois si besoin.
- ✅ `public/llms-full.txt` date spurieuse jetée (début de session).
- ✅ THI-300 (#212) + agent-hardening (#213) mergés (début de session).

## 2. 🟢 Alerte data-mixing = RÉSOLUE, PAS de breach

@thierry a craint que hotmail/gmail partagent des données sur `/en/app`. **Vérifié en DB** (service-role, read-only, terminal, zéro secret leaké) : chaque compte = **1 workspace isolé, owner unique, zéro membership croisé**, RLS `is_workspace_member` saine. L'« impression de mélange » **et** le « toujours en anglais » = **le même bug SW** (cache `/en/app` par-origine), corrigé par #215. Détail : memory `project_sw_locale_blind_bypass`.

## 3. THI-301 (CadenceField) — AU CHAUD

Plan-reviewer ✅ APPROVED, branche `feat/thi-301-cadence-field` (5 commits doc, 0 code). @thierry l'a mis « au chaud ». Reprendre APRÈS le chantier dashboard, ou quand @thierry le redemande. Voir memory `project_thi301_cadencefield_inflight`.

## 4. CHANTIER PRINCIPAL — Refonte dashboard en cockpit de décision (épic THI-327)

### Diagnostic (validé : @thierry + 2 analyses ChatGPT challengées + NORTH_STAR + audit ground-truth de mes propres yeux via harnais Playwright seedé)

`/app` se lit comme un **empilement de cartes comptables**, pas un **cockpit de décision**. Pas de « réponse principale », la liste factures domine, **incohérence de grammaire** Charges (groupé lourd) vs Dépenses (form+liste simple). **La cible est DÉJÀ spécifiée** dans `docs/NORTH_STAR.md` §"Dashboard Excellence" (8 sections, #1 Hero cashflow waterfall **jamais construit**) — le v3 a été bâti section par section sans la narration qui relie.

### 🆕 Bug trouvé live (THI-335) : état vide/sans-revenu affiche capacité **−1 711 € rouge** (anxiogène). Fix calme (nudge onboarding), jamais un déficit calculé effrayant.

### Direction validée (« Calm Financial OS »)

Hero « Situation du mois » = waterfall revenus→charges→provisions→reste-à-vivre→capacité + état vert/orange/rouge + plan virements (ADR-012) · factures en résumé bucket replié · provisions bullet expliqué · comptes barre empilée (philo enveloppes, pas total brut) · dépenses = rythme/jour · **SVG-maison zéro lib chart** (budget 0€) · copy humaine (jargon en tooltip) · **mission par page** (Dashboard="mois maîtrisé?", Charges="coût fixe+lissage+échéances", Dépenses="rythme vie courante", Comptes="où est l'argent", Simulateur="impact décision") · cohérence landing↔app.

### Découpage (chaque phase = brainstorm→spec→plan-reviewer→exec→gates agents)

- **Phase 0 (NEXT)** : Hero narration dashboard (waterfall #1 + statut + plan) — pierre angulaire, définit la grammaire. + fix THI-335 état-vide.
- **Phase 1** : reskin sections existantes (factures→résumé replié, provisions bullet, allocation comptes, rythme dépenses).
- **Phase 2** : mission page Charges (bandeau résumé + `ChargeImpactPreview` « +25€/mois » + raffiner groupes/tabs **sans re-whipsaurer** après THI-300).
- **Phase 3** : mission page Dépenses (rythme/reste-à-vivre).

### Garde-fous / gates par phase

`plan-reviewer` (Opus) avant code · `dashboard-ux-auditor` **Layer 0** (durci ce jour, voir §5) · `lighthouse-auditor` (perf, charts SVG ne régressent pas LCP/CLS) · `mobile-ios-auditor` · `ui-auditor` · `i18n-auditor`. SEO = landing only (`seo-geo-auditor`), PAS `/app` (noindex). PR < 600 lignes (anti-pattern NORTH_STAR). Ground-truth via harnais seedé (THI-331).

### Challenges retenus (à ne pas oublier)

- Ne PAS exécuter le méga-prompt ChatGPT d'un coup (3 pages + 13 composants = scope creep).
- Ne PAS nuker le vocabulaire établi (« Effort financier lissé » est ADR/NORTH_STAR) → vulgariser en lead, terme technique en tooltip.
- FSMA : « actions recommandées » = le **plan calculé de l'user** (ADR-012), jamais du conseil.
- Tabs Charges vs groupement THI-300 : arbitrer dans le brainstorm Charges, sans whipsaw.

## 5. Agents — amélioration livrée

**PR #216** (branche `chore/agents-dashboard-ux-coherence`) : ajoute à `dashboard-ux-auditor` une **Layer 0 (priorité haute)** qui audite l'EXPÉRIENCE (réponse principale, hiérarchie, hero waterfall, listes-ne-dominent-pas, sanity état-vide, cohérence inter-pages, mission par page, copy humaine, FSMA, landing↔app) + méthode ground-truth (harnais seedé). À merger.

**Harnais Playwright seedé (THI-331) PROUVÉ ce jour** : `seedOnboardedUser` + `fillLogin` (headless, zéro cred MCP) + screenshots `/app`,`/app/charges`,`/app/expenses` desktop+mobile. C'est LA méthode de vérif self-serve (doctrine-safe ; le preview Vercel est SSO-gated, donc local/seedé). À formaliser (THI-331).

## 6. Tickets ouverts (Linear)

THI-322 (CSP ProgressBar /app) · THI-323 (footer liens morts) · THI-324 (SW locale — **fait**, #215 mergé) · THI-327 (ÉPIC refonte dashboard — **le chantier**) · THI-328 (épic import post-launch) · THI-329 (statut payé charges sur vue factures) · THI-331 (harnais Playwright + durcir agents isolation) · THI-335 (état-vide capacité rouge).

## 7. PRs ouvertes

- **#216** chore/agents-dashboard-ux-coherence (Layer 0) — à merger (DoD).

## 8. État git

- `main` = à jour (#214 + #215 mergés).
- Branches : `feat/thi-301-cadence-field` (au chaud), `chore/agents-dashboard-ux-coherence` (#216), `docs/handoff-2026-06-02-dashboard-program` (ce handoff), `feat/pr-b2-mock-vertical-slice` (pause).

## 9. Ordre de reprise post-`/compact`

1. (Optionnel) merger PR #216 (agent Layer 0) après DoD.
2. **Phase 0 dashboard** : reprendre le `/brainstorm` (déjà lancé) → proposer 2-3 partis visuels du Hero (mockups ASCII, PAS de companion navigateur — préférence @thierry) → spec → `plan-reviewer` → build (TDD, SVG-maison) → gates agents + harnais seedé.
3. Fixer THI-335 (état-vide) dans Phase 0/1.
4. THI-301 reste au chaud jusqu'à signal @thierry.
