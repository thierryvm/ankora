<div align="center">

<img src="public/brand/logo.svg" alt="Ankora" width="96" height="96" />

# Ankora™

**Cockpit budgétaire personnel — Belgique · RGPD · hébergé UE**

_Ton ancrage financier. Lisse tes charges annuelles sur 12 mois, anticipe chaque facture et sais exactement combien virer vers l'épargne chaque mois._

[![CI](https://github.com/thierryvm/ankora/actions/workflows/ci.yml/badge.svg)](https://github.com/thierryvm/ankora/actions/workflows/ci.yml)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-EU--hosted-3ECF8E?logo=supabase)](https://supabase.com)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](https://web.dev/progressive-web-apps/)
[![WCAG 2.2 AA](https://img.shields.io/badge/a11y-WCAG%202.2%20AA-success)](https://www.w3.org/WAI/WCAG22/quickref/)

[Fonctionnalités](#fonctionnalités) · [Démarrage](#démarrage-rapide) · [Architecture](docs/ARCHITECTURE.md) · [Sécurité](SECURITY.md) · [FAQ](#faq)

</div>

---

## Qu'est-ce qu'Ankora ?

**Ankora est une application web progressive (PWA) de gestion budgétaire personnelle**, conçue pour les particuliers belges qui veulent reprendre le contrôle de leurs finances sans confier leurs données à un agrégateur bancaire.

Contrairement aux applications de type YNAB ou Bankin' qui se connectent à tes comptes via PSD2, **Ankora fonctionne en saisie manuelle** : tu restes propriétaire de tes données, rien n'est partagé avec une banque, un courtier ou un service de scoring. L'app est hébergée en **Union européenne** (Supabase région EU-west) et **conforme RGPD** (art. 15, 17, 20, 25, 32).

Ankora se positionne comme un **outil d'éducation budgétaire et d'organisation** — il ne délivre pas de conseil en placement, en investissement ou en crédit (contrainte réglementaire **FSMA** en Belgique).

> **Pour qui ?** Salariés, indépendants, ménages qui veulent lisser les grosses factures (mutuelle annuelle, taxe de circulation, assurances trimestrielles) pour ne plus jamais se faire surprendre.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Principes de conception](#principes-de-conception)
- [Stack technique](#stack-technique)
- [Démarrage rapide](#démarrage-rapide)
- [Structure du projet](#structure-du-projet)
- [Scripts disponibles](#scripts-disponibles)
- [Qualité & sécurité](#qualité--sécurité)
- [Conformité RGPD](#conformité-rgpd)
- [FAQ](#faq)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Fonctionnalités

| Fonctionnalité           | Description                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Lissage annuel**       | Toute charge trimestrielle, semestrielle ou annuelle est ventilée en provision mensuelle. Plus jamais de facture surprise. |
| **Assistant virements**  | Calcule automatiquement combien virer vers l'épargne ce mois-ci (`provisions − factures dues`).                            |
| **Santé des provisions** | Compare la cible théorique à ton solde réel et propose un plan de rattrapage lissé sur 3 mois en cas de déficit.           |
| **Simulateur what-if**   | Estime l'impact d'une résiliation, d'une renégociation ou d'une augmentation sur ta capacité d'épargne mensuelle.          |
| **PWA installable**      | Fonctionne hors-ligne partiellement, installable sur iOS / Android / desktop.                                              |
| **Multi-workspace**      | Gère tes comptes perso + couple + maison séparément, chacun avec ses propres membres et rôles.                             |
| **Export RGPD**          | Export JSON complet de tes données en un clic (art. 20 RGPD).                                                              |
| **Suppression 30 j**     | Droit à l'oubli avec période de grâce de 30 jours et annulation possible (art. 17 RGPD).                                   |
| **MFA TOTP**             | Double authentification via Google Authenticator / 1Password / Authy.                                                      |

---

## Principes de conception

- **Souveraineté des données** : hébergement UE, Row Level Security (RLS) stricte, aucun partage entre utilisateurs par défaut.
- **Privacy by default** (RGPD art. 25) : analytics désactivées tant que l'utilisateur n'a pas consenti, pas de PII dans les logs, purge automatique.
- **Sécurité par défaut** : CSP avec nonce par requête, `strict-dynamic`, HSTS preload, COOP/CORP same-origin, rate-limit multi-couche Upstash.
- **Accessibilité** : mobile-first, WCAG 2.2 AA, navigation clavier complète, `prefers-reduced-motion` respecté.
- **Pureté du domaine financier** : `src/lib/domain/` utilise Decimal.js avec arrondi banquier (`ROUND_HALF_EVEN`, précision 20). Aucun `number` natif pour les montants.
- **Validation iso client/server** : schémas Zod partagés, parsing avant toute logique, toujours re-validés côté serveur.
- **FSMA-aware** : aucune formulation suggérant un conseil en placement, nulle part dans l'UI ni dans les contenus.

---

## Stack technique

| Couche             | Technologie                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Framework          | [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions, typed routes)                                       |
| UI                 | [React 19](https://react.dev), [Tailwind CSS 4](https://tailwindcss.com) (`@theme inline`), [shadcn/ui](https://ui.shadcn.com)       |
| Langage            | [TypeScript strict](https://www.typescriptlang.org) (`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`)                   |
| Backend            | [Supabase](https://supabase.com) (Postgres 15, RLS, Auth, Storage, Edge Functions — région EU)                                       |
| Validation         | [Zod v4](https://zod.dev) (iso client/server)                                                                                        |
| Rate limiting      | [Upstash Redis](https://upstash.com) + `@upstash/ratelimit`                                                                          |
| Calculs financiers | [Decimal.js](https://mikemcl.github.io/decimal.js/) (ROUND_HALF_EVEN, précision 20)                                                  |
| Tests              | [Vitest 4](https://vitest.dev), [Playwright](https://playwright.dev), [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) |
| Hooks              | [Husky](https://typicode.github.io/husky) + [lint-staged](https://github.com/lint-staged/lint-staged)                                |
| Hébergement        | [Vercel](https://vercel.com) + middleware Fluid Compute                                                                              |
| Observabilité      | Vercel Analytics (opt-in RGPD)                                                                                                       |

---

## Démarrage rapide

### Pré-requis

- [Node.js 22+](https://nodejs.org)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (pour les migrations locales)
- Un compte [Supabase](https://supabase.com) (projet EU)
- Un compte [Upstash](https://upstash.com) (pour le rate-limit Redis)

### Installation

```bash
git clone https://github.com/thierryvm/ankora.git
cd ankora
npm install
cp .env.example .env.local
# Remplir les variables d'environnement (voir .env.example)
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

### Migrations Supabase

```bash
npx supabase link --project-ref <ton-project-ref>
npx supabase db push
npm run supabase:types  # regénère src/lib/supabase/types.ts
```

---

## Structure du projet

```
ankora/
├── .github/              # workflows CI, issue/PR templates, dependabot
├── .claude/agents/       # 7 agents QA Claude Code (security, RLS, RGPD, UI…)
├── docs/                 # ARCHITECTURE, CONVENTIONS, ROADMAP
├── e2e/                  # suites Playwright
├── public/               # assets statiques, sw.js, llms.txt, icônes PWA
├── scripts/              # génération d'icônes, helpers dev
├── src/
│   ├── app/              # App Router
│   │   ├── (marketing)/  # landing, pricing, FAQ, légal
│   │   ├── (auth)/       # signup, login, forgot-password, reset-password
│   │   ├── app/          # dashboard privé (middleware-protected)
│   │   └── onboarding/   # wizard 3 étapes
│   ├── components/       # brand, ui (shadcn), features, layout, pwa, seo
│   └── lib/
│       ├── domain/       # logique financière pure (Decimal.js, 0 dépendance DB)
│       ├── schemas/      # Zod iso client/server
│       ├── supabase/     # clients browser/server/admin/middleware
│       ├── security/     # rate-limit, audit-log
│       ├── gdpr/         # consent, export, deletion
│       ├── actions/      # Server Actions (auth, settings, charges, etc.)
│       └── env.ts        # parse Zod des variables d'environnement
├── supabase/migrations/  # schéma + RLS + triggers
└── tests/                # Vitest (schemas, domain)
```

---

## Scripts disponibles

```bash
npm run dev              # dev server (Turbopack)
npm run build            # build production
npm run start            # serveur production local
npm run lint             # ESLint (0 erreur requis avant merge)
npm run typecheck        # tsc --noEmit (0 erreur requis)
npm run test             # Vitest (unit + schemas)
npm run test:coverage    # Vitest + rapport de couverture
npm run e2e              # Playwright (parcours critiques)
npm run lhci             # Lighthouse CI (≥ 95 perf, 100 a11y/BP/SEO)
npm run icons            # régénère PNG PWA depuis SVG
npm run security:audit   # npm audit --audit-level=high
npm run supabase:types   # régénère src/lib/supabase/types.ts
```

---

## Qualité & sécurité

### Portes de qualité (bloquantes avant merge)

- `npm run lint` → **0 erreur**
- `npm run typecheck` → **0 erreur**
- `npm run test` → **100 % pass**
- `npm run e2e` → 100 % pass sur parcours critiques
- Lighthouse → ≥ 95 performance, 100 a11y / best-practices / SEO
- Aucun warning console en dev

### Agents QA automatisés

Ce dépôt embarque 7 agents Claude Code spécialisés dans `.claude/agents/` :

| Agent                         | Déclencheur                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `security-auditor`            | Avant merge de toute PR touchant auth, middleware, RLS, headers |
| `rls-flow-tester`             | Après toute migration ou changement de policy RLS               |
| `financial-formula-validator` | Après tout changement dans `src/lib/domain/`                    |
| `ui-auditor`                  | Après toute modification UI                                     |
| `lighthouse-auditor`          | Avant release candidate                                         |
| `seo-geo-auditor`             | Après ajout/renommage de pages publiques                        |
| `gdpr-compliance-auditor`     | Dès qu'on touche à PII, cookies, export, deletion               |

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour les détails d'invocation.

### Signalement d'une vulnérabilité

Voir [SECURITY.md](SECURITY.md). Email dédié : **security@ankora.eu**.

---

## Conformité RGPD

| Article RGPD                           | Implémentation                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| **Art. 6** (base légale)               | Documentée par traitement dans `/legal/privacy`                                      |
| **Art. 7** (consentement)              | Deux cases distinctes (CGU + privacy), aucun pré-coché, rejet aussi simple qu'accept |
| **Art. 13** (information)              | Privacy policy dédiée + liens contextuels                                            |
| **Art. 15 / 20** (accès & portabilité) | Export JSON complet depuis Settings (schéma versionné)                               |
| **Art. 17** (droit à l'oubli)          | Deletion flow avec grâce 30 j + annulation, pseudonymisation des logs d'audit        |
| **Art. 25** (privacy by design)        | RLS partout, analytics opt-in, pas de PII en logs                                    |
| **Art. 32** (sécurité)                 | MFA TOTP, CSP nonce, rate-limit, audit log append-only                               |

### Hébergement

Supabase région **EU-west** (Irlande) pour les données applicatives. Vercel Edge régionalisé EU pour le rendu. Aucune sortie de données hors UE.

---

## FAQ

### Est-ce qu'Ankora remplace ma banque ?

Non. Ankora ne se connecte **pas** à tes comptes bancaires (pas de PSD2, pas d'agrégation). Tu saisis toi-même tes charges et tes soldes. L'app te donne une vision long-terme (provisions, lissage) que ton app bancaire ne fournit pas.

### Est-ce qu'Ankora donne des conseils de placement ?

**Non**, jamais. Ankora est un outil d'**éducation budgétaire et d'organisation**. Toute recommandation d'investissement nécessiterait un agrément FSMA que nous n'avons pas. Ankora t'aide à savoir combien virer vers ton épargne — pas où placer cet argent.

### Mes données sont-elles en sécurité ?

Oui. Elles sont hébergées en **Union européenne** (Supabase Irlande), isolées par utilisateur via Row Level Security Postgres, chiffrées en transit (TLS 1.3) et au repos. Aucun tiers n'y a accès. Tu peux les exporter ou les supprimer à tout moment depuis tes paramètres.

### Puis-je utiliser Ankora sans créer de compte ?

Non. Le compte est nécessaire pour sauvegarder tes données en sécurité et activer la 2FA. Nous n'exigeons que ton email — pas de nom, de téléphone ou de date de naissance.

### Ankora est-il open source ?

Le code source est **visible** (licence propriétaire), mais pas réutilisable pour un usage commercial. Nous accueillons les signalements de bugs et les suggestions via [GitHub Issues](https://github.com/thierryvm/ankora/issues).

### Combien ça coûte ?

MVP en phase bêta privée. La tarification définitive sera publiée sur `/pricing` au lancement public.

### Ankora fonctionne-t-il hors Belgique ?

L'app est utilisable depuis toute l'UE. Les avertissements réglementaires sont orientés Belgique (FSMA). Traductions `fr-BE`, `fr-FR` et `en-GB` disponibles dans les paramètres utilisateur.

---

## Feuille de route

Voir [docs/ROADMAP.md](docs/ROADMAP.md) pour la roadmap détaillée.

**Phase actuelle** : Phase 2 MVP — auth, onboarding, dashboard, settings, RGPD, PWA. _(avril 2026)_

**Prochaines phases** :

- Phase 3 : analytics opt-in, notifications mensuelles, partage famille (read-only)
- Phase 4 : imports CSV, catégorisation assistée par IA (local-first)
- Phase 5 : multi-devise (EUR + CHF + GBP), exports PDF annuels

---

## Contribuer

Lis [CONTRIBUTING.md](CONTRIBUTING.md) avant toute PR.

En résumé :

1. Ouvre une issue pour discuter du changement (sauf typo évidente)
2. Fork → branche `feature/xxx` → PR vers `develop`
3. Les portes de qualité doivent toutes passer
4. Les messages UI sont en **français**, code/commits/commentaires en **anglais**

### Commits

Format [Conventional Commits](https://www.conventionalcommits.org) :

```
feat(auth): add MFA TOTP enrollment
fix(budget): clamp simulation delta to 2 decimals
chore(deps): bump zod to 4.2.1
docs(readme): update roadmap
```

---

## Licence

**Propriétaire.** © 2026 Thierry Vanmeeteren. Tous droits réservés.

- **Ankora™** est une marque déposée de Thierry Vanmeeteren
- Le code source est fourni à titre consultatif (transparence, audit de sécurité)
- Toute utilisation, copie, modification ou distribution requiert une autorisation écrite

Voir [LICENSE](LICENSE) pour les conditions détaillées, ou [NOTICE](NOTICE) pour l'inventaire des dépendances tierces.

---

<div align="center">

**Made with care in Belgium 🇧🇪**

[Site web](https://ankora.eu) · [Politique de confidentialité](https://ankora.eu/legal/privacy) · [Contact](mailto:hello@ankora.eu)

</div>
