# Roadmap — Ankora

Dernière mise à jour : 16 avril 2026.

## Phase 0 — Bootstrap (terminée)

- [x] Choix du nom + vérification domaines
- [x] Bootstrap Next.js 16 + TypeScript strict + Tailwind 4
- [x] Headers sécurité A+ (CSP nonce, HSTS, COOP, Permissions-Policy)
- [x] Couche domaine pure (budget, provision, simulation, balance) testée
- [x] Migrations Supabase + RLS complètes
- [x] `.claude/agents/` (7 QA agents)
- [x] CI GitHub Actions (lint + typecheck + test + e2e + lighthouse + audit)
- [x] Husky pre-commit + commit-msg
- [x] PWA manifest + llms.txt + sitemap + robots
- [x] Logo + favicon + icônes PWA

## Phase 1 — MVP (en cours)

Objectif : cockpit personnel utilisable par Thierry, ses enfants et amis.

- [ ] Auth Supabase : signup, login, reset, MFA
- [ ] Onboarding 3 étapes (nom espace, revenus, première charge)
- [ ] CRUD charges fixes + catégories
- [ ] CRUD dépenses variables
- [ ] Dashboard : provisions mensuelles, santé, transfert suggéré, factures du mois
- [ ] Simulateur what-if (annuler / négocier)
- [ ] Export GDPR (JSON)
- [ ] Suppression compte GDPR (grace 30j + cron)
- [ ] Consentement cookies (banner granulaire)
- [ ] Pages légales : CGU, Privacy, Cookies, FAQ
- [ ] Service Worker offline-first pour les pages publiques
- [ ] Lighthouse 100/100/100/100 (mobile + desktop)
- [ ] Tests e2e Playwright sur les parcours critiques

## Phase 2 — Pots partagés + IA BYOK

- Pots partagés inter-utilisateurs (invitation par email, rôles viewer/editor)
- Anthropic SDK + OpenRouter : l'utilisateur fournit sa clé, Ankora relaye
  - Suggestions de négociation
  - Détection d'abonnements dormants
  - Résumé mensuel personnalisé
- Import CSV / OFX (pas de PSD2)
- Notifications push (factures à venir)

## Phase 3 — Produit complet

- Agrégation multi-devises
- Tableau de bord annuel + rapports téléchargeables (PDF)
- Suggestions d'épargne sans conseil (ex: livret A/LDDS = informationnel uniquement)
- Version mobile native via Expo (si la PWA montre des limites)
- Tarification payante (plan pro : multi-espaces, IA inclus, support prioritaire)

## Hors scope

- Agrégation PSD2 (coût + régulation)
- Déclaration fiscale automatisée
- Conseil en placement personnalisé (FSMA)
- Comptabilité en partie double pour entreprises
