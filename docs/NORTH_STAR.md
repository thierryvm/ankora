# North Star — Ankora v1.0

Source unique de vérité pour la vision et les décisions produit jusqu'à la v1.0 publique.

Dernière mise à jour : 23 avril 2026.

---

## Mission

Aider les particuliers belges et européens à **maîtriser leur cashflow personnel** grâce à un modèle d'enveloppes prédictif, sans agrégation bancaire automatique, sans conseil en investissement, sans coût pour l'utilisateur en Phase 1.

Ankora n'est **pas** une banque, **pas** un agrégateur (pas PSD2), **pas** un conseiller (pas FSMA). C'est un **outil d'éducation budgétaire et d'organisation financière**.

## Cap v1.0 publique — 12 semaines max

Date de départ : 23 avril 2026. Cible : mi-juillet 2026. Enveloppe communicable : **12 semaines**. Aucune fausse promesse — si on livre en 9, c'est du bonus.

### Trois jalons verrouillés

| #   | Jalon         | Horizon      | Contenu minimal                                                                                                   |
| --- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Alpha privé   | ~4 semaines  | Thierry + 2-3 proches, FR seul, auth + onboarding + CRUD + dashboard v3 + simulateur + MFA optionnel              |
| 2   | Beta privée   | ~8 semaines  | 5-10 testeurs externes, CGU/Privacy UE+BE 2026 rédigées, GDPR export/deletion live, bug reporting, Klaro! intégré |
| 3   | v1.0 publique | ~12 semaines | Signups libres sur ankora.be, FR + EN, schemas AEO complets, Lighthouse 100, /roadmap publique, admin panel v1    |

## Les 5 piliers parallélisables

### A — Fondations & Hygiène

ROADMAP sync, CLAUDE.md, agents QA (10), CI gates (Sourcery required, Lighthouse budget, parity tests), branch protection rigoureuse.

### B — Product Excellence

Recherche concurrentielle formelle (12 acteurs), mockups user dashboard v3 (niveau Monarch-enveloppes), mockup admin panel v1 (4 sections + rule-based reco), design tokens finaux.

### C — Core Fonctionnel

PR-B1 Bug reporting MVP (filet avant chantier UI), PR-3 port des mockups v3 en React prod, auth complète (Supabase + MFA TOTP), onboarding 3 étapes, CRUD charges/dépenses/catégories, dashboard core live, simulateur what-if intégré, goals épargne.

### D — Sécurité & Légal (UE + BE 2026)

CGU conformes loi belge 30/07/2018 + directive ePrivacy + AI Act (non-applicable Phase 1), Privacy Policy **en langue utilisateur**, Cookies Policy + intégration Klaro! open source (TCF v2.2), GDPR export JSON + suppression avec délai de grâce de 30j, rate limiting Upstash multicouches, audit log append-only.

### E — SEO/AEO/Perf

Schemas JSON-LD fintech avancés (FinancialProduct, SoftwareApplication, Organization, FAQPage, DefinedTerm), llms-full.txt enrichi, entity consistency (LinkedIn, Product Hunt, G2), `/roadmap` publique (confiance + AEO), Lighthouse 100/100/100/100 mobile + desktop, Service Worker offline-first.

## Règles d'or (non négociables)

1. **Aucune fausse promesse** publique ou interne. 12 semaines = plafond, pas cible.
2. **Budget 0 €** strict — Thierry sur mutuelle Solidaris, aucun revenu autorisé Phase 1. Toute dépendance payante = validation explicite requise.
3. **Dashboard Excellence** — minimaliste inacceptable. Niveau Monarch obligatoire.
4. **Tests + agents QA** avant chaque merge. CI verte + Sourcery silent + DONE-5 appliqué.
5. **GDPR by design** + langue utilisateur par défaut (sanctions APD belge 2026+).
6. **Push done ≠ task done**.
7. **Scope creep interdit** — toute déviation = validation Thierry avant d'ouvrir une ligne de code.

## Anti-patterns interdits

- PR > 600 lignes (sauf cas exceptionnel justifié)
- Skipping de phase dans un prompt délégué
- Mockup recyclé au lieu d'un vrai mockup v3
- "On verra après" sur la sécurité ou le légal
- Déclarer une tâche DONE sans vérif Sourcery sur HEAD
- Introduire une dépendance payante en production sans validation explicite

## Cibles mesurables v1.0

| Métrique                        | Cible                                    |
| ------------------------------- | ---------------------------------------- |
| Lighthouse Performance          | ≥ 95 (mobile + desktop)                  |
| Lighthouse A11y / BP / SEO      | 100 / 100 / 100                          |
| Uptime ankora.be                | ≥ 99.5%                                  |
| TTFB p95                        | < 400 ms                                 |
| Coverage domain                 | ≥ 90% lignes + fonctions, ≥ 85% branches |
| Coverage global                 | ≥ 80%                                    |
| Erreurs console prod            | 0                                        |
| Critical + High npm audit       | 0                                        |
| Incidents sécurité avant launch | 0 exploitable                            |

## Positionnement concurrentiel (à affiner après recherche)

Ankora se distingue des outils US/FR existants par :

| Axe fort Ankora                          | Vide concurrentiel                                            |
| ---------------------------------------- | ------------------------------------------------------------- |
| Modèle enveloppes prédictif sans PSD2    | Monarch/Linxo = agrégation live, Ankora = saisie + prédiction |
| Waterfall salaire → enveloppes → sorties | YNAB le fait à moitié, personne ne le fait beau               |
| Timeline cashflow 6-12 mois              | Monarch sur comptes agrégés uniquement                        |
| Health score provisions                  | Inexistant ailleurs                                           |
| Simulateur what-if intégré dashboard     | Fait à part chez tous                                         |
| Alertes J-7 factures provisionnées       | Rocket Money = abonnements seulement                          |
| GDPR conformité belge stricte            | Most US tools ignorent APD belge                              |
| 100 % 0 € utilisateur Phase 1            | YNAB 99$/an, Monarch 99$/an                                   |

## Gouvernance

- **Cowork** (Claude desktop) : recherche, mockups, contenu vision/légal, prompts délégués, orchestration
- **CC Ankora** (terminal avec gh/npm/Brave+Claude extension) : code, commits, PRs, vérifications
- **Thierry** : backup décisionnel quand cela se justifie vraiment, merge PRs, validation mockups

Les décisions techniques sont autonomes côté Cowork et CC Ankora dans le cadre verrouillé ici. Tout écart = validation Thierry obligatoire.

## Après v1.0

- Pots partagés inter-utilisateurs (Phase 2)
- IA BYOK (Anthropic/OpenRouter, l'utilisateur fournit sa clé, Ankora ne facture jamais le compute)
- Import CSV / OFX (pas PSD2)
- Notifications push PWA
- Tarification payante plan pro (le moment où Ankora peut enfin engager des coûts d'infra)
