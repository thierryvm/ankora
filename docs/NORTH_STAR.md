# North Star — Ankora v1.0

> **Trio IA & gouvernance** — Source canonique : [`docs/design/trio-agents.md`](design/trio-agents.md). Le résumé ci-dessous est intentionnellement répété pour visibilité au démarrage de session ; toute modification doit être répercutée dans la source canonique.

Source unique de vérité pour la vision et les décisions produit jusqu'à la v1.0 publique.

Dernière mise à jour : 24 avril 2026 (adoption trio IA + workflow Claude Design).

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

Recherche concurrentielle formelle (12 acteurs, livrée), spec fonctionnelle user dashboard v3 (niveau Monarch-enveloppes, livrée dans `docs/design/claude-design-brief.md` §3.2), spec fonctionnelle admin panel v1 (4 sections + rule-based reco, §3.4), design tokens finaux via **Claude Design** (Opus 4.7, research preview) — remplace l'itération mockup HTML pixel-perfect. Ordre surfaces verrouillé : DS → Landing → Dashboard → Onboarding → Admin.

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

## Différenciateur clé — Réserve libre vs Provisions affectées

Le **Compte Épargne Ankora** distingue **deux strates** que les concurrents confondent :

| Strate                   | Nature                                                                                                                      | Comportement                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Provisions affectées** | Argent mis de côté pour couvrir des factures annuelles spécifiques (impôt communal, assurance voiture, vacances 2026, etc.) | Chaque poste a une date d'échéance et un montant cible. Rapatrier = casser le lissage. Alertes J-7/J-3/J-0 avant échéance (PR-F).       |
| **Réserve libre**        | Buffer de sécurité non-affecté (excédent mensuel cumulé)                                                                    | Disponible sans contrainte. Peut être rapatriée vers Compte courant à tout moment. Historique de mouvements tracé (apports / retraits). |

Workflow user type : chaque mois, excédent = virement manuel vers compte Épargne → **incrémente la Réserve libre**. Besoin ponctuel (coup dur, vacances extra) = retrait vers courant → **décrémente la Réserve libre**, pas les provisions.

Ankora doit afficher **3 chiffres distincts** sur le Compte Épargne dans le dashboard :

1. Total Épargne (somme)
2. Provisions affectées (bloquées jusqu'échéance)
3. Réserve libre (disponible)

Et un **historique de mouvements** de la réserve (in/out par mois) accessible depuis le dashboard.

**Pourquoi c'est différenciant** : YNAB ne distingue pas, Monarch met tout dans des goals, Goodbudget ne gère pas la notion de buffer. Ankora rend visible une gestion déjà pratiquée par les utilisateurs avancés mais jamais formalisée dans les outils.

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
| Provisions vs Réserve libre distinctes   | Confondus partout ailleurs (YNAB/Monarch/Goodbudget)          |

## Gouvernance — Trio IA + Thierry (verrouillé 2026-04-24)

- **@cowork** (Claude desktop) : vision produit, spec fonctionnelle, recherche concurrentielle, contenu vision/légal, brief Claude Design, orchestration, revue exports, update NORTH_STAR/ROADMAP
- **@cc-design** (claude.ai/design, Opus 4.7, research preview) : polish visuel, exploration UI, cohérence design system, variations composants, exports React/Tailwind ou ZIP, handoff Claude Code
- **@cc-ankora** (Claude Code terminal, gh/npm/supabase CLI) : code production, intégration Supabase/Next.js, tests, CI, PRs, merge sur branches dédiées
- **@thierry** : vision produit humaine, validation à chaque étape, merge autorité finale sur `main`

**Convention de tag obligatoire** dans tout rapport / commit / PR / comms inter-agents : `@cowork —`, `@cc-design —`, `@cc-ankora —`, `@thierry —`.

**Loop design standard** :
@cowork spec fonctionnelle → @cowork brief Claude Design → @cc-design variations visuelles → @thierry valide → @cowork prompt intégration → @cc-ankora branche `feat/cc-design-<surface>` + agents QA → @thierry merge.

**Règle non négociable** : aucun export Claude Design ne merge direct sur `main`. Toujours branche dédiée, agents QA (`ui-auditor`, `design:accessibility-review`, `gdpr-compliance-auditor`), micro-copy relue par @cowork (FSMA + qualité FR).

### Ordre d'exécution surfaces v1.0 (verrouillé 2026-04-24)

0. **Design System** — étape fondatrice, publiée une fois dans claude.ai/design, héritée automatiquement par toutes les surfaces
1. **Landing** (`ankora.be`) — PRIORITÉ 1, surface qui fait ou défait le produit (effet "wow" ou funnel perdu)
2. **User Dashboard v3** — cœur produit, ouvert 2-3× par semaine
3. **Onboarding 3 étapes** — premier pas décisif, UX premium
4. **Admin Dashboard** — interne Thierry, dernière priorité

Cf. `docs/design/trio-agents.md` (convention complète), `docs/design/claude-design-brief.md` (template brief), `docs/design/design-principles-2026.md` (trends + red flags).

Les décisions techniques sont autonomes côté @cowork et @cc-ankora dans le cadre verrouillé ici. Tout écart = validation @thierry obligatoire.

## Après v1.0

- Pots partagés inter-utilisateurs (Phase 2)
- IA BYOK (Anthropic/OpenRouter, l'utilisateur fournit sa clé, Ankora ne facture jamais le compute)
- Import CSV / OFX (pas PSD2)
- Notifications push PWA
- Tarification payante plan pro (le moment où Ankora peut enfin engager des coûts d'infra)
