# Paysage concurrentiel — Finance personnelle 2026

Source de vérité pour les décisions produit Ankora v1.0. Analyse de 13 acteurs (US + FR + UK + BE) réalisée le 23 avril 2026.

Pour la vision produit, voir `NORTH_STAR.md`. Pour l'ordre d'exécution, voir `ROADMAP.md`.

---

## Synthèse exécutive

Marché en croissance forte (+25 % annuel, 207 Md$ en 2026). Les leaders mondiaux (Monarch, YNAB, Copilot) sont **US-only** ou **mal localisés UE**, et monétisent à 80-100 $/an. Les leaders français (Linxo, Bankin') s'appuient sur l'**agrégation PSD2**. Aucun acteur belge natif ne domine. **Trois gaps structurels exploitables** par Ankora :

1. **Aucun concurrent mondial ne combine** modèle enveloppes-first + prédiction cashflow 6-12 mois + zéro agrégation PSD2
2. **Marché BE orphelin** : YNAB, Bankin' et Buxfer y sont, mais aucun n'est belge natif ni conçu pour la conformité APD 2026
3. **Pricing wars** : tous payants (79-120 $/an), Ankora peut tenir en 0 € jusqu'à Phase 3 grâce au modèle enveloppes (pas d'infra PSD2 à payer)

La proposition de valeur différenciante Ankora : **"Savoir où va ton argent dans 6 mois, sans connecter ta banque, sans payer, conforme Belgique"**.

---

## Vue marché 2026

- Marché global personal finance apps : 165 Md$ (2025) → 207 Md$ (2026), CAGR 25,2 %
- Belgique : 69 % des habitants utilisent le banking en ligne (au-dessus moyenne UE 54 %)
- Fintech belge : +300 % en 3 ans, 85 % des banques API-enabled (PSD2)
- Features standards 2026 : AI categorization, prédiction cashflow, goals automatisés, net worth tracker, recurring payments
- Tendance forte : **custom dashboards** (Monarch, Rocket Money) — les users veulent personnaliser
- Tendance forte : **couple/family mode** (Monarch différenciateur majeur)

---

## 13 concurrents analysés

### 1. Monarch Money (US) — 99 $/an

**Force** : référence absolue du dashboard personnel finance 2026. Net worth, budgets, investments, goals, tout sur un écran customisable. Collaborative mode pour couples (vraie killer feature). Tracks all investment holdings.

**Faiblesse Ankora peut exploiter** : US-only UX, pas de localisation UE sérieuse, pas de conformité APD belge, agrégation PSD2 imparfaite en Europe, prix élevé (99 $/an).

**À copier** : hiérarchie visuelle du dashboard, custom widgets, cohérence design tokens.

### 2. YNAB (US) — 99 $/an

**Force** : gold standard du zero-based budgeting. Méthode pédagogique forte, communauté fidèle. Présent en Belgique via marketplaces EU.

**Faiblesse Ankora peut exploiter** : pas d'IA, pas de prédiction cashflow forward, interface vieillissante, méthode manuelle pure (rigide), prix dissuasif pour marché belge.

**À copier** : discipline d'assignation de chaque euro à une enveloppe (concept proche d'Ankora).

### 3. Copilot Money (US Apple) — 95 $/an

**Force** : meilleure UX iOS/Mac du marché. IA catégorisation qui apprend des corrections. Interface premium.

**Faiblesse Ankora peut exploiter** : Apple-only (exclut Android + desktop Web = gros morceau marché BE), pas européen, agrégation US-centric.

**À copier** : qualité animation, densité d'information sans surcharge, feedback visuel sur chaque action.

### 4. Rocket Money (US) — 6-12 $/mois (freemium)

**Force** : focus abonnements (détecte, négocie, résilie). Dashboard customisable. Widgets iOS natifs. Net worth + Financial Goals + transaction tags + account sharing.

**Faiblesse Ankora peut exploiter** : focus trop étroit (abonnements only), pas de modèle enveloppes ni prédiction multi-mois, pas localisé UE.

**À copier** : customizable dashboard pattern, widgets premium, détection automatique des récurrences.

### 5. Emma (UK) — freemium

**Force** : open banking UK, scan des paiements récurrents, UI jeune.

**Faiblesse Ankora peut exploiter** : UK-first, localisation UE incomplète, pas d'angle prédictif fort.

### 6. Lunch Money (Global) — 10 $/mois

**Force** : multi-devises, dev-friendly, API publique, customisation poussée.

**Faiblesse Ankora peut exploiter** : très niche (dev/power users), UX non grand-public.

**À copier** : approche headless, export des données, tagging flexible.

### 7. Origin Financial (US) — 99 $/an

**Force** : AI insights + accès advisor humain. Positionnement premium "advisor + tools".

**Faiblesse Ankora peut exploiter** : cible haut de gamme US, advisor = hors scope Ankora (FSMA), prix.

### 8. Tiller (US) — 79 $/an

**Force** : spreadsheet-based (Google Sheets + Excel sync bancaire automatique). Power users adorent.

**Faiblesse Ankora peut exploiter** : pas d'app native, dépendance Google/Excel, pas de vraie UX produit.

### 9. Goodbudget (US) — Free ou 80 $/an

**Force** : **LE concurrent conceptuel direct** d'Ankora. Envelope budgeting manuel, pas de bank sync (comme nous), 20 enveloppes en free. Philosophy "saisie manuelle = dépenses plus conscientes" = exactement notre thèse.

**Faiblesse Ankora peut exploiter** : UX très vieillie (early 2010s), aucune prédiction cashflow avancée, pas de health score, pas de timeline forward, pas de simulateur what-if. Ankora = Goodbudget 2026 avec Monarch-level dashboard.

**À copier** : validation du concept envelope-first + saisie manuelle accepté par le marché.

### 10. Linxo (FR, filiale Crédit Agricole) — 4,49 €/mois ou 29,99 €/an

**Force** : 320 banques agrégées PSD2 (incluant belges), prévision cashflow 30 jours (Premium), leader marché FR, Crédit Agricole backing.

**Faiblesse Ankora peut exploiter** : prévision limitée à 30 jours (Ankora = 6-12 mois), prévision en **Premium uniquement** (Ankora = gratuit), dépendance connexion bancaire (Ankora = zéro friction), UI français pur (pas de EN), pas d'angle conformité APD belge explicite.

### 11. Bilan (FR) — freemium

**Force** : alternative FR à Linxo.

**Faiblesse Ankora peut exploiter** : notoriété moindre, pas de différenciateur fort vs Linxo.

### 12. Cashbee (FR)

**Ne pas traiter comme concurrent direct** : Cashbee est un produit épargne/investissement, pas un budget tracker. Positionnement différent. Utile uniquement comme référence UX mobile FR.

### 13. Acteur belge natif : aucun dominant identifié

Les apps populaires en Belgique sont Payconiq by Bancontact (paiement mobile, pas budget), KBC Mobile, Belfius Mobile, ING Banking (apps banques natives). Côté budget pur : YNAB, Bankin' et Buxfer y opèrent mais aucun n'est belge natif ni conçu pour la conformité APD 2026. **C'est l'opportunité centrale d'Ankora.**

---

## Gaps exploitables pour Ankora v1.0

| Gap                                    | Qui l'exploite aujourd'hui | Comment Ankora gagne                                              |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| Envelope-first + prédiction 6-12 mois  | Personne                   | Core produit Ankora                                               |
| 100 % gratuit (pas freemium)           | Goodbudget (partial)       | Ankora complet gratuit Phase 1                                    |
| Conformité APD belge stricte 2026      | Personne                   | Privacy langue user + CGU loi 30/07/2018                          |
| Pas de PSD2 → zéro friction onboarding | Goodbudget, YNAB           | Dashboard Monarch-level + saisie fluide                           |
| Health score provisions                | Personne                   | Indice propriétaire Ankora                                        |
| Simulateur what-if intégré dashboard   | Personne                   | Drawer latéral natif                                              |
| Timeline cashflow waterfall animé      | Personne (YNAB partiel)    | Hero section Ankora                                               |
| Belgique natif                         | Personne                   | Localisation BE + fiscalité + CBC/KBC/Belfius/ING support display |

---

## Recommandations pour mockup user dashboard v3

Synthèse des patterns gagnants observés chez Monarch + Copilot + Rocket Money, adaptés au modèle enveloppes Ankora.

### Sections retenues (ordre visuel top-to-bottom)

1. **Hero cashflow waterfall** (unique à Ankora) — salaire → enveloppes → sorties, animation progressive au scroll
2. **KPI cards** (patrimoine net, provisions du mois, reste après factures, factures à venir) — pattern Monarch
3. **Timeline 6-12 mois prédictive** (unique à Ankora vs Linxo 30j limité) — courbe + jalons
4. **Enveloppes actives** (drag-to-rebalance) — pattern Goodbudget modernisé
5. **Health score provisions** (unique à Ankora) — jauge + 1-3 nudges actionnables
6. **Prochaines factures 7/14/30j** — pattern Rocket Money sur provisions au lieu d'abonnements
7. **Goals épargne avec ETA** — pattern Monarch, calcul prédictif Ankora
8. **Simulateur what-if en drawer latéral** (unique à Ankora) — slider what-if sans quitter le dashboard
9. **Activité récente** — timeline événements (ajout charge, transfert, etc.)

### Patterns UX à adopter

- **Custom dashboard** : permettre masquer/réorganiser les widgets (Monarch/Rocket Money)
- **Widgets iOS/Android** (PWA) : KPI principale en home screen (Rocket Money)
- **Dark mode natif** automatique (tous les concurrents l'ont)
- **Density équilibrée** : ni mur d'infos (Emma) ni vide marketing (Goodbudget), inspiration Copilot
- **Feedback visuel systématique** : chaque action a une micro-animation (Copilot)
- **Empty/error/loading states** explicites (tous les concurrents matures)

### Patterns à NE PAS copier

- Le graphe en donut de YNAB (complexe, peu lisible sur mobile)
- La densité de Lunch Money (power-user-only)
- L'interface vieillie de Goodbudget

---

## Recommandations pour mockup admin panel v1

Aucun concurrent n'expose publiquement son admin, donc on part sur les **4 sections ADR B2** avec inspiration générique des dashboards SaaS modernes (Vercel, Linear, PostHog pour la lisibilité).

### Sections et métriques

1. **Santé technique** — uptime, error rate, p50/p95/p99 latency, top 10 erreurs 7j, bug reports status funnel, build statuses CI (via GitHub API)
2. **Santé produit** — DAU/WAU/MAU, retention cohortes 1/7/30 jours, funnel onboarding (étape 1 → complet), feature usage heatmap (charges, dépenses, simulateur)
3. **Acquisition** — signups/jour, sources referrer, UTMs, conversion first-workspace-created, pays origine
4. **Recommandations rule-based** (ADR-002) — alertes contextuelles : "Étape 3 onboarding abandon 23 %", "Erreur charge-form X40 cette semaine", "15 signups même domaine gmail en 1h"

Toutes les données doivent être **calculées server-side** (pas de calcul client des KPI), requêtes agrégées avec index Postgres, refresh cron ou bouton manuel. `requireAdmin()` partout. Graphiques Recharts, lisibilité prioritaire sur esthétique.

---

## Positionnement final Ankora (one-liner)

> **Ankora — Le cockpit finances belge qui te montre ton argent dans 6 mois, sans connecter ta banque.**

Angle émotionnel : **prédictibilité, tranquillité, conformité**. Contre le stress du "est-ce que j'ai assez pour la facture de février", Ankora montre la courbe jusqu'à juin.

Public cible v1.0 : **particuliers belges 25-55 ans, double revenu, 1-2 enfants, factures lissables (assurances, impôts, abonnements), veulent reprendre le contrôle sans installer encore une app qui veut leur numéro de compte**.

---

## Livrables de cette recherche (complétés 23 avril 2026)

1. ✅ Document rempli avec analyse 13 concurrents
2. ✅ Recommandations dashboard user v3 (sections + patterns)
3. ✅ Recommandations admin panel v1 (4 sections)
4. ✅ Positionnement final Ankora (one-liner + public cible)
5. ⏳ Mockup user dashboard v3 HTML (tâche #133, suite logique)
6. ⏳ Mockup admin panel v1 HTML (tâche #134, suite logique)

## Sources

- [Era vs Monarch vs Copilot vs YNAB 2026](https://era.app/articles/era-vs-monarch-vs-copilot-vs-ynab/)
- [YNAB vs Monarch vs Copilot — WalletHub 2026](https://wallethub.com/edu/b/ynab-vs-monarch-vs-copilot-vs-wallethub/150687)
- [Best AI Personal Finance Tools 2026 — Techno-Pulse](https://www.techno-pulse.com/2026/04/best-ai-personal-finance-tools-in-2026.html)
- [Best Budgeting Apps 2026 — Engadget](https://www.engadget.com/apps/best-budgeting-apps-120036303.html)
- [Linxo Avis 2026 — Economiser Mon Argent](https://www.economiser-mon-argent.com/avis-linxo/)
- [Linxo Avis Complet — Selectra](https://selectra.info/finance/guides/compte-bancaire/linxo-avis)
- [12 Best Budgeting Apps for Europe 2026 — Freenance](https://freenance.io/budgeting/best-free-budgeting-apps-europe/)
- [Best Budget App Belgium — Buxfer](https://www.buxfer.com/countries/22/best-budgeting-app-belgium)
- [Rocket Money Review 2026 — Wall Street Survivor](https://www.wallstreetsurvivor.com/rocket-money-review/)
- [Tiller Money Pricing 2026](https://sheetlink.app/tiller-money-pricing-2026)
- [Belgium Digital Finance 2026 — Beaumont Capital](https://beaumont-capitalmarkets.co.uk/belgium-digital-finance-ai-open-banking-initiatives/)
- [Personal Finance Apps Market Report 2026](https://www.researchandmarkets.com/report/personal-finance-app-market)
