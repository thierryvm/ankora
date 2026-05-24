# Ankora — Product Quality Bar v1

> **Statut** : `Draft v1` — à valider @thierry.
> **Date** : 23 mai 2026.
> **Auteur** : @cowork.
> **Portée** : référence unique pour toute décision produit / UX / contenu / code sur Ankora jusqu'à v1.0 publique (fin juin 2026).
> **Convention** : ce document **complète** `NORTH_STAR.md` (vision + cap) et `ADR-*.md` (décisions architecturales) sans les remplacer. En cas de conflit, NORTH_STAR > ADR > Quality Bar.

---

## 0. Philosophie produit (rappel)

Ankora est un **cockpit financier personnel calme**. Il existe pour **réduire le stress financier** de l'utilisateur belge / européen en lui montrant d'abord la **vérité utile**, puis les détails seulement quand ils servent une décision.

Ankora N'EST PAS :

- Une banque, un agrégateur (pas PSD2 — ADR-001).
- Un conseiller en placement (pas FSMA).
- Un dashboard financier SaaS générique.
- Un clone YNAB ou Monarch.
- Une app de tracking de dépenses brut.
- Une mosaïque de widgets.
- Une page infinie où tout a le même poids visuel.

Ankora EST :

- Un outil **d'éducation budgétaire** et **d'organisation financière**.
- Un **modèle d'enveloppes prédictif** sans agrégation bancaire automatique.
- Un produit **belge / européen, RGPD-first**.
- Un produit **anti-stress** : honnête sur les chiffres, sans culpabiliser.

---

## 1. Vocabulaire recommandé (à utiliser dans UI + docs + marketing)

| Concept                       | Source       | Usage                                                                                                                                   |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Capacité d'épargne réelle** | ADR-009      | KPI hero du dashboard. "Ton vrai reste à vivre chaque mois, sans surprise."                                                            |
| **Reste à vivre**             | ADR-009 amd. | Budget vie courante variable (ex-`Plafond_Quotidien`). Ajustable mensuellement.                                                         |
| **Reste disponible**          | ADR-009 amd. | Ce qui reste avant la vie courante (= revenus − charges − provisions − virements auto).                                                 |
| **Provisions affectées**      | NORTH_STAR   | Argent mis de côté pour factures futures (impôt communal, taxe voiture, vacances…). Échéance + montant cible. Lissage = différenciateur. |
| **Réserve libre**             | NORTH_STAR   | Buffer de sécurité non affecté. Disponible sans contrainte.                                                                              |
| **Total Épargne**             | NORTH_STAR   | Somme brute (Provisions affectées + Réserve libre). Lecture 1/3.                                                                         |
| **Effort financier mensuel**  | ADR-009      | Total des charges fixes mensuelles + provisions mensuelles lissées.                                                                     |
| **Plan d'apurement**          | ADR-017      | Échelonnement d'une dette (ex: 2 407 € / 11 mensualités). Génération auto N transactions.                                                |
| **Assistant Virements**       | ADR-012      | Sub-section dashboard qui suggère le montant à virer ce mois, avec détail provisions item-par-item.                                     |
| **Ballet provisions**         | ADR-018      | Aller-retour bidirectionnel compte courant ↔ épargne (audit trail OUT/IN).                                                              |
| **Live decrement**            | ADR-010      | Décompte temps réel du Quotidien restant (useOptimistic).                                                                              |
| **Détection déficit + rattrapage** | ADR-011 | Plan rattrapage 3 mois si déficit Provisions détecté.                                                                                  |
| **Cashflow waterfall**        | PR-3c-4      | Visualisation 3 steps Revenus / Effort / Plafond (déjà mergé landing + dashboard).                                                       |
| **Santé Provisions**          | THI-190      | Indicateur synthétique (vert/jaune/rouge) du statut Provisions.                                                                          |
| **Prochaines factures**       | THI-192      | Vue J-7 / J-14 / J-30 + bucket overdue.                                                                                                  |

### Style général

- Tutoiement, ton calme, langue de l'utilisateur.
- Phrases courtes, prose pédagogique sans jargon comptable.
- Emojis : **interdits dans l'UI** (sauf icônes Lucide standards). Tolérés ponctuellement en docs internes / commits.

---

## 2. Vocabulaire interdit

Ces formulations sont **bannies** de l'UI + landing + glossaire + emails Ankora :

### Interdit FSMA (réglementaire)

- "Vous devriez investir", "nous recommandons d'investir", "placez vos économies"
- "Conseil financier", "conseiller en placement"
- "Plus-value garantie", "rendement assuré", "rentabilité"
- Toute formulation suggérant une promesse de gain ou un conseil personnalisé

### Interdit R-06 anti-culpabilisation

- "Vous dépensez trop"
- "Il faut économiser", "vous devriez économiser"
- "Vous avez manqué votre objectif"
- "Mauvais comportement budgétaire"
- "Vous n'êtes pas raisonnable"

### Interdit marketing trompeur

- "Le seul outil qui…", "la meilleure app de…"
- "Économisez X € par mois" (impossible à garantir)
- "Sans effort", "automatiquement" (Ankora demande de la saisie, c'est assumé)
- "IA prédictive avancée", "machine learning" (Phase 1 = règles déterministes)

### Interdit jargon (= barrière cognitive)

- "Burn rate", "runway", "cash flow management" (anglicismes corporate)
- "Cash flow" sans contexte (préférer "trésorerie" ou "argent disponible")
- "ROI", "TCO", "EBITDA" (jamais en UI)

---

## 3. Règles de hiérarchie cognitive

### 3.1 Trois zones cognitives (dashboard)

| Zone | Rôle                          | Contenu                                                                            | Profondeur                |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------- |
| A    | Rassurance immédiate (3 sec)  | Capacité d'épargne réelle + Effort + indicateur Santé Provisions condensé          | 0 clic, 0 scroll          |
| B    | Pilotage actif (à scroller)   | Prochaines factures + Assistant Virements + Goals + CTA Simulateur                 | 0 clic, 1-2 scrolls       |
| C    | Détails consultables          | Santé Provisions gauge + Drag-rebalance + Timeline 6m + activité récente / historique | 1 clic drawer/page dédiée |

### 3.2 Anti-patterns à refuser

- **Pas plus de 3 zones** dans un dashboard.
- **Pas de mosaïque de widgets** : grouper visuellement avec spacing, pas avec bordures.
- **Pas de "Niveau 4"** (audit annuel, comptabilité fine) → hors scope v1.0, va dans Phase 3.
- **Pas d'égalité visuelle** entre Zone A et Zone C — la typo (`text-3xl` Zone A vs `text-sm` Zone C) doit le signaler.

### 3.3 Règles drawer

- Drawer mobile = fullscreen, fermeture par swipe-down ou bouton X.
- Drawer desktop = side-panel droit, largeur max 480 px.
- Focus trap obligatoire (a11y).
- Escape ferme.
- Return focus sur l'élément déclencheur après fermeture.

---

## 4. Règles dashboard

### 4.1 KPI hero

- **Toujours** Capacité d'épargne réelle (ADR-009). Jamais Cash Flow court-termiste (interdit, justifié dans ADR-009 §"Alternatives évaluées").
- 4xl `font-bold`, couleur emerald si ≥ 0, rose si < 0.
- Préfixe `+` si positif.
- Message contextuel court (sm, text-muted-foreground).

### 4.2 Compte Épargne — trois lectures simultanées

Les trois strates (Total / Provisions affectées / Réserve libre) sont **toujours visibles ensemble**, jamais cachées les unes derrière les autres. C'est le différenciateur n°1.

### 4.3 Mois courant + navigation temporelle

Sélecteur `< Mai 2026 >` en header. URL `?month=YYYY-MM` pour deep-linkability.

### 4.4 États empty + loading

- Empty state = card avec CTA "Ajouter ta première charge" (pas une page blanche).
- Loading = skeleton aligné sur la structure de la card (pas un spinner générique).
- Erreur API = message clair actionnable + bouton retry (pas de stack trace).

### 4.5 Comportement responsive

- Mobile 375 px : 1 colonne.
- Tablet 768 px : 1-2 colonnes selon section.
- Desktop ≥ 1024 px : multi-col.
- Safe-area iOS (`env(safe-area-inset-bottom)`) respectée — agent `mobile-ios-auditor` obligatoire.

---

## 5. Règles landing

- **Ce n'est pas un dashboard**. Pas de KPI live, pas de données réelles utilisateur.
- **Démontrer la promesse par l'exemple** : WhatIfDemo (déjà mergé PR-3c-3), Hero waterfall avec chiffres exemples Belges (déjà mergé PR-3c-4).
- **Pas d'argumentaire commercial agressif** : pas de "Inscrivez-vous maintenant !", "Offre limitée", "Économisez X €".
- **CTAs primaires** : "Découvrir Ankora" / "Lire la promesse" / "Tester le simulateur".
- **CTAs secondaires** : "FAQ" / "Glossaire" / "Roadmap publique".
- **Pas de pricing** en Phase 1 (gratuit). Annoncer "Plan pro à partir de Phase 3" en footer.

---

## 6. Règles données financières

### 6.1 Précision

- **Decimal.js** obligatoire pour tout calcul monétaire (jamais `number`).
- Arrondi 2 décimales pour affichage, précision interne conservée.

### 6.2 Affichage

- `formatCurrency(value, locale)` toujours utilisé (locale-aware).
- `tabular-nums` Tailwind sur **tous** les nombres pour alignement vertical.
- Signe explicite (`+162 €` plutôt que `162 €` quand le signe porte sens).
- Pas de pourcentages sur les KPI hero (réservés aux indicateurs Santé).

### 6.3 Domaine pur

- `src/lib/domain/` n'importe **jamais** Supabase ni Next.js (règle CLAUDE.md).
- Tous les calculs financiers passent par Decimal.js + tests Vitest ≥ 95 % coverage.

---

## 7. Règles RGPD / privacy

- **Langue user par défaut** (sanctions APD belge 2026+).
- **Consentement Klaro!** open source (TCF v2.2) — pas Cookiebot / OneTrust (budget 0 €).
- **Jamais de PII en logs** (email, montants, identifiants).
- **Export GDPR** : JSON complet, accessible depuis `/app/settings`.
- **Suppression compte** : délai de grâce 30 jours, cron Vercel.
- **Pas d'agrégation tierce** (pas Plaid, pas Tink, pas PSD2).
- **Hébergement EU obligatoire** (Vercel + Supabase EU-west).

---

## 8. Règles FSMA-aware

- **Pas de conseil placement** sous aucune forme.
- **Pas de promesse de gain**.
- **Pas de comparatif de produits financiers tiers** (livret A vs assurance-vie vs ETF…).
- **Pas de simulation d'investissement** (le simulateur Ankora simule l'impact d'une décision budget, pas un placement).
- **Mention légale obligatoire** sur landing footer + CGU : "Ankora est un outil d'éducation budgétaire, pas un service de conseil en investissement."
- **Recommandations admin** : **règles déterministes uniquement** en Phase 1 (pas LLM, justifié dans `ROADMAP §PR-B2`).

---

## 9. Règles mobile / tablette / desktop

### 9.1 Mobile-first non-négociable

- Tout composant doit fonctionner sur viewport 375 × 667 px (iPhone SE) AVANT d'être considéré comme livré.
- Touch targets ≥ 44 × 44 px (WCAG 2.5.5).
- Pas de hover-only (le hover n'existe pas sur touch).
- Pas de `position: sticky` non testé sur iOS Safari.
- Safe-area iOS (`env(safe-area-inset-bottom)` + top notch) intégrée.

### 9.2 PWA cible

- Service Worker offline-first sur landing + glossaire + FAQ.
- Add-to-Home-Screen testé sur iOS + Android.
- Manifest.json complet (icônes 5 tailles, theme color, display standalone).

### 9.3 Tests obligatoires

- Agent `mobile-ios-auditor` invoqué dès qu'on touche layout / nav / forms / dashboard mobile / theme toggle / drawer.
- Procédure manuelle iPhone réel : `docs/runbooks/dev-on-iphone.md`.
- Lighthouse mobile ≥ 95 (cible v1.0).

---

## 10. Critères de rejet PR (gates obligatoires)

Une PR est **refusée** (no merge) si l'un de ces critères tombe :

### 10.1 Agents QA

- Agent `dashboard-ux-auditor` ❌ Fail
- Agent `mobile-ios-auditor` ❌ Fail
- Agent `security-auditor` ❌ Fail (sur toute PR auth / middleware / RLS)
- Agent `rls-flow-tester` ❌ Fail (sur toute PR migrations)
- Agent `financial-formula-validator` ❌ Fail (sur toute PR `src/lib/domain/`)
- Agent `i18n-auditor` ❌ Fail (sur toute PR `messages/`, `src/i18n/`)
- Agent `gdpr-compliance-auditor` ❌ Fail (sur toute PR PII / cookies / export)

### 10.2 Lighthouse

- Performance mobile < 95 (cible v1.0)
- A11y < 100
- BP < 100
- SEO < 100

### 10.3 CI quality gates

- `npm run lint` non-vert
- `npm run lint:use-server` non-vert (async-only enforcement)
- `npm run typecheck` non-vert
- `npm run test` non-vert
- `npm run e2e` non-vert
- Sourcery bot non-silent sur le dernier commit

### 10.4 Process

- Scope creep détecté (PR ajoute des features non listées dans le prompt initial)
- PR > 600 lignes sans justification explicite
- Dépendance payante introduite sans validation @thierry
- Modèle financier modifié sans ADR
- Feature supprimée sans confirmation @thierry

### 10.5 Vocabulaire

- Vocabulaire interdit §2 présent dans la PR
- Vocabulaire recommandé §1 non utilisé pour les concepts ADR
- Anglicismes corporate dans l'UI utilisateur

---

## 11. Évolution de ce document

- Toute modification = PR dédiée avec validation @thierry.
- Versionner via filename (`v1`, `v2`, ...). Pas de mise à jour silencieuse.
- Historique de décisions documenté en footer.

### Changelog

| Version | Date       | Changement        | Auteur  |
| ------- | ---------- | ----------------- | ------- |
| v1      | 2026-05-23 | Création initiale | @cowork |

---

**Fin du Quality Bar Ankora v1.** Tout artefact produit (UI, doc, marketing, code, agent QA) doit respecter ce document. En cas de doute, demander à @cowork ou @thierry avant de livrer.
