# PR-D4 PHASE 2 — Intégration design Claude Design Session #3 (Dashboard cockpit + atoms)

> **Contexte projet obligatoire** — avant d'exécuter cette PR, lire `docs/ROADMAP.md` (ordre PRs, contrainte budget 0 €), `CLAUDE.md` (règles de code + Définition de DONE 5 critères), `docs/NORTH_STAR.md` (Dashboard Excellence niveau Monarch obligatoire — refus de merge si minimaliste).
>
> **Position** : PR-D4 PHASE 1 (charges + expenses + charge_payments CRUD backend) MERGÉE en #130. Cette PR PHASE 2 = intégration UI React/Tailwind du pack design Claude Design Session #3 livré 2026-05-08.
>
> **Prérequis** : PR-D1 ✅ + PR-D2 ✅ + PR-D3 ✅ + PR-D3-bis ✅ + PR-D4 PHASE 1 ✅ + PR-NAV-1 ✅. Branche cible : `feat/cc-design-cd3-cockpit-v2`.
>
> **Quality gates** : Définition de DONE 5 critères stricte (CI verts + Sourcery silencieux + reviews approuvées + pas de conflit main + rapport final livré). Ne JAMAIS déclarer terminé sans avoir vérifié Sourcery sur le DERNIER commit. Posture : ingénieur partenaire d'abord, exécutant ensuite.

---

## Phase 0 — Model check (obligatoire au démarrage)

VÉRIFIER LE MODÈLE ACTIF :

- Si Opus 4.7 → continuer
- Si Haiku / Sonnet / autre → STOP, avertir @thierry, ne PAS toucher au code

Le fichier `.claude/settings.local.json` épingle `"model": "claude-opus-4-7"`. Vérifier après tout reset config.

---

## 0bis · ADDENDUM 2026-05-09 — Enrichissements post-Bloc D + Bloc E + ADR-009 amendé

> **Lecture obligatoire** : ce brief a été rédigé le 2026-05-08, puis enrichi le 2026-05-09 après une session marathon avec @cc-design qui a livré l'onboarding (Bloc D), l'admin panel (Bloc E), l'amendement ADR-009 (3 concepts UX) et 7 micro-fixes consolidés. Les sections 1 à 11 ci-dessous restent canoniques mais les ajouts suivants priment en cas d'ambiguïté.

### A · ADR-009 amendé — 3 concepts UX distincts (impact direct sur HeroWaterfall + SignauxCard)

L'erreur historique d'ADR-009 a été clarifiée. Le hero waterfall affiche désormais une **décomposition pédagogique en 3 concepts** :

```
Reste disponible      = Revenus − Charges fixes − Provisions OUT du mois − Virement matelas saisi
                      = 662 €/mois pour Thierry mai 2026 (vraies données)

Reste à vivre         = budget vie courante variable saisi par l'utilisateur
                      = 500 €/mois estimé Thierry (courses 200 + imprévus 50 + sorties 0 + marge 250)
                      = AJUSTABLE manuellement chaque mois (R-10) via bouton "Ajuster ce mois"

Capacité d'épargne    = Reste disponible − Reste à vivre
réelle                = 162 €/mois pour Thierry mai 2026
```

**Implications UI à porter dans cette PR** :

1. **HeroWaterfall** affiche 3 labels triple-ligne au-dessus de la barre Reste :
   - Ligne 1 : `Reste disponible`
   - Ligne 2 : `+ 662 €` (gros, font-display)
   - Ligne 3 : `+ 87 € vs. avril` (delta, opacity 0.7, taille xs)
2. **Card "Capacité d'épargne réelle"** dans SignauxCard affiche **162 €** (PAS 662 €), avec sub-stats :
   - Reste disponible 662 €
   - Reste à vivre 500 € + bouton textuel "Ajuster ce mois →"
   - Capacité d'épargne réelle 162 €
3. **Modèle de données** : `workspace_settings.reste_a_vivre_default` (numeric) + `workspace_settings.reste_a_vivre_overrides` (jsonb keyé par YYYY-MM). Le bouton "Ajuster ce mois" écrit dans `reste_a_vivre_overrides[currentMonth]`. Si pas d'override → fallback `reste_a_vivre_default`.
4. **Onboarding Étape 3** demande ce Reste à vivre avec helper adaptatif neutre aux 3 ratios (R-06 anti-culpa, déjà livré Bloc D mais à respecter dans l'intégration).

Référence : [ADR-009 amendé section "Amendement 2026-05-09"](../docs/adr/ADR-009-capacite-epargne-reelle.md).

### B · R-14 — UI 100 % FR-BE (audit obligatoire avant merge)

**Nouvelle règle critique** : tout texte d'interface utilisateur doit être en français de Belgique, **sauf** termes consacrés universels (`IBAN`, `EUR`, `OK`, `PIN`, `Email`).

Mots à traquer et corriger systématiquement :

| Anglais  | FR-BE attendu |
| -------- | ------------- |
| Settings | Paramètres    |
| Skip     | Passer        |
| Continue | Continuer     |
| Save     | Enregistrer   |
| Cancel   | Annuler       |
| Submit   | Valider       |
| Edit     | Modifier      |
| Delete   | Supprimer     |
| Loading… | Chargement…   |
| Error    | Erreur        |

**Audit obligatoire avant merge** : exécuter `i18n-auditor` qui doit retourner 0 finding "anglais résiduel" sur les fichiers `messages/fr-BE.json`, les Server Components avec `getTranslations`, et les Client Components avec `useTranslations`.

Belgicismes attendus : "septante" / "nonante" interdits dans les nombres (toLocaleString gère), "courriel" préféré à "mail" mais `Email` (mot anglicisé universel) accepté, "GSM" accepté.

Référence : [`_regles-decisions-critiques.md` R-14](../../obsidian-second-brain/...) (vault Athenaeum, demander à @thierry si besoin).

### C · R-13 — Services bundlés (préparer le data model)

Dans cette PR, **aucune feature back-end** n'est ajoutée pour les bundles, mais la table `recurring_templates` doit être préparée pour accueillir le champ :

```sql
-- Migration séparée future PR-D5 (anticiper côté types Supabase)
ALTER TABLE recurring_templates
  ADD COLUMN included_services jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN recurring_templates.included_services IS
  'Services secondaires inclus dans cette charge (ex: [{ "name": "Netflix", "icon": "netflix" }] pour Orange + Netflix)';
```

**Dans cette PR PHASE 2**, ce qu'il faut faire :

1. Vérifier que les types Supabase régénérés (`npm run supabase:types`) **ne cassent pas** si la colonne n'existe pas encore.
2. Pour la Surface 1 cockpit, l'`ActiviteRecente` n'a PAS besoin d'afficher les bundles V1.
3. **Anticiper côté props** des atoms `Chip` et `Avatar` : prévoir que la donnée `chargeRow` puisse contenir un futur champ `included_services` sans casser le typage.

Cas réels confirmés Thierry (à respecter dans les seeds e2e) :

1. Orange 89 €/mois inclut Netflix
2. Assurance auto 150 €/mois est un PACK (auto + habitation + incendie + familiale)

→ **Ne JAMAIS ajouter** "Mutuelle annuelle 848 €" ni "Assurance habitation 420 €" dans les seeds — tout est mensualisé chez Thierry.

### D · ADR-017 Plans d'apurement (préparation cross-PR)

[ADR-017 Proposed](../docs/adr/ADR-017-plans-apurement.md) introduit la table `installment_plans` pour les paiements étalés (cas réel Thierry : Impôt 2 407 € en 11 fois).

**Dans cette PR PHASE 2**, ce qu'il faut faire :

1. **Surface 1 cockpit** affiche un bloc "Plans d'apurement" si la requête `getActiveInstallmentPlans(workspace_id)` retourne ≥ 1 ligne. Ce bloc :
   - Liste compacte avec total + N/M payées + montant standard
   - Tap → ouvre `<InstallmentsDrawer>` (drilldown grille N échéances avec chips Payée/À venir)
   - Boutons "Modifier" + "Supprimer" dans le drawer (déjà designé Bloc B)
2. **Si la table `installment_plans` n'existe pas encore en DB** → stop et signale-le dans le rapport final. Ne PAS implémenter la migration dans cette PR (c'est PR-D5).
3. **Stub** : si pas de migration, créer un fichier `src/lib/domain/installmentPlans.ts` avec un fallback `getActiveInstallmentPlans = async () => []` typé. Le bloc UI ne s'affiche simplement pas tant qu'aucun plan n'existe.

### E · ADR-018 Provisions bidirectionnelles (préparation cross-PR)

[ADR-018 Proposed](../docs/adr/ADR-018-provisions-bidirectionnelles-audit-trail.md) introduit la table `provision_transfers` pour le ballet OUT/IN compte courant ↔ compte de lissage.

**Dans cette PR PHASE 2**, ce qu'il faut faire :

1. **CompteEpargne** affiche déjà 3 lectures (Total / Affectées / Libre). Cette PR doit ajouter un **onglet "Mouvements"** (atom `Tabs` créé par @cc-design en Bloc B) qui affiche une timeline IN/OUT chronologique.
2. **Stub V1** : si la table `provision_transfers` n'existe pas encore en DB, l'onglet Mouvements affiche les `account_transfers` génériques (ADR-002) avec un badge neutre. Le drilldown par cycle est désactivé tant que `provision_transfers` n'est pas migré (PR-D5).
3. **Hero waterfall — règle critique** : les `provision_transfers direction='in'` du mois en cours **ne s'ajoutent PAS aux revenus** dans le calcul du Reste disponible. Ce sont des transferts neutres entre buckets, pas une rentrée d'argent fraîche. Documenter cette invariance dans un test Vitest dédié (`heroWaterfall.test.ts → "ne compte pas les rapatriements IN comme revenus"`).

### F · Atom Tabs (créé en Bloc B 2026-05-08, à porter)

@cc-design a créé en Bloc B un 9e atom `Tabs` (`_shared/atoms/09-Tabs.jsx`) consommé par CompteEpargne (3 lectures + onglet Mouvements). À ajouter à la liste des atoms à porter en §3.1 (donc **9 atoms** au total, pas 8).

Props : `tabs: { id, label, badge? }[]`, `activeId`, `onChange`, `variant: 'pill'|'underline'`, `size: 'sm'|'md'`.
Tokens : `--color-brand-500`, `--color-brand-surface`, `--color-border`, `--color-foreground`, `--radius-full`, `--ease-spring`.

### G · Bug CSS résiduel droite Compte Épargne (task #203)

Un bug CSS résiduel persiste sur le bord droit de la card Compte Épargne (overflow non géré sur certains viewports < 768px). À investiguer et fixer pendant l'intégration. Reproductible sur Brave 130+ desktop 1440 et iPhone Safari 17.

Suspect : container query `.ce-split` qui ne reset pas correctement la marge négative en mode 1 colonne. À vérifier avec `mobile-ios-auditor` agent.

### H · i18n micro-copy additions (Reste à vivre + Plans d'apurement)

Compléter les ~80 clés du §7 avec ces ~15 clés additionnelles :

```json
"capacite.title": "Capacité d'épargne réelle",
"capacite.value": "{amount}/mois",
"capacite.subline.dispo": "Reste disponible {amount}",
"capacite.subline.rav": "Reste à vivre {amount}",
"capacite.cta.adjust": "Ajuster ce mois →",
"capacite.help": "Ce que tu peux mettre de côté chaque mois, après tout payé et après ton budget vie courante.",

"rav.drawer.title": "Ajuster ton reste à vivre",
"rav.drawer.lede": "Combien tu prévois de dépenser ce mois-ci en vie courante (courses, imprévus, sorties, marge) ?",
"rav.drawer.help": "Tu peux ajuster ce montant chaque mois sans impacter les autres mois. Pas de jugement, juste de la souplesse.",
"rav.drawer.default": "Garder la valeur par défaut ({amount})",

"apurement.title": "Plans d'apurement",
"apurement.empty": "Aucun plan d'apurement actif.",
"apurement.row": "{label} · {paid}/{total} payées · {amount}/mois",
"apurement.drawer.title": "{label} · {totalAmount} en {count} fois",
"apurement.drawer.action.modify": "Modifier",
"apurement.drawer.action.delete": "Supprimer",

"epargne.tab.lectures": "Lectures",
"epargne.tab.mouvements": "Mouvements",
"epargne.mouvements.empty": "Aucun mouvement enregistré ce mois.",
"epargne.mouvements.tooltip": "L'argent ne disparaît pas — il attend que la facture tombe."
```

### I · Tests additionnels obligatoires

Ajouter aux tests Vitest existants (§4) :

1. `heroWaterfall.test.ts` — test invariance "Reste à vivre n'est PAS soustrait du Reste disponible dans le hero" (le hero affiche le Reste disponible, le RAV est ailleurs)
2. `capaciteEpargne.test.ts` — test formule `capacite = restDisponible - restAVivre`, test fallback `reste_a_vivre_default` si pas d'override
3. `compteEpargne.test.ts` — test container query basculant 3 colonnes → 1 colonne sous 600px
4. `i18n-fr-be.test.ts` — test parity FR-BE / EN + 0 mot anglais résiduel dans les valeurs FR-BE (regex `/\b(Settings|Skip|Continue|Save|Cancel)\b/i`)

Playwright e2e additionnel :

1. `e2e/dashboard-rav-adjust.spec.ts` — flow : ouvrir dashboard → cliquer "Ajuster ce mois" → modifier RAV à 450 € → vérifier capacité passe à 212 € (662 - 450)
2. `e2e/dashboard-mouvements-tab.spec.ts` — flow : ouvrir CompteEpargne → cliquer onglet "Mouvements" → vérifier rendu timeline (vide ou pleine)

### J0 · Atoms 10 & 11 — ThemeToggle + LangSwitcher (livrés Patch Bloc E 2026-05-09)

@cc-design a livré dans le Patch Bloc E 2 atoms additionnels :

10. **ThemeToggle** (`_shared/atoms/10-ThemeToggle.jsx`)
    - Props : `theme: 'light'|'dark'`, `onToggle: () => void`, `size?: 'sm'|'md'`
    - Bouton circulaire 36×36 (md) ou 28×28 (sm), icône Sun/Moon, animation rotation 180° (ease-spring 320ms)
    - Tokens : `--color-foreground`, `--color-surface-soft`, `--color-brand-500`, `--radius-full`, `--ease-spring`, `--dur-structural`
    - Persistance : cookie SSR `theme=light|dark`, action sur attribut `[data-theme="dark"]` du `<html>`
    - A11y : `aria-label` dynamique « Activer le thème {dark|light} », `aria-pressed`

11. **LangSwitcher** (`_shared/atoms/11-LangSwitcher.jsx`)
    - Props : `current: 'fr-BE'|'en'`, `onChange: (lang) => void`, `languages?: Array`
    - Bouton compact "🇧🇪 FR" / "🇬🇧 EN" + dropdown listbox a11y
    - Tokens : `--color-foreground`, `--color-surface-soft`, `--color-border`, `--color-brand-500`, `--radius-md`, `--ease-out`, `--shadow-md`
    - Persistance : cookie `NEXT_LOCALE` + URL routing `/[locale]/...` next-intl
    - V1.0 : 2 langues seulement (FR-BE + EN). NL/DE/ES post-launch (cf. `CLAUDE.md` §"Choix techniques lockés")

→ Nombre total d'atoms à porter dans cette PR : **11** (au lieu de 9 mentionnés en §0bis F).

Ces 2 atoms doivent être consommés dans **AppShell.tsx** (header layout user + admin) ET dans le sidebar nav.

### K · RBAC Admin — guard `requireAdmin()` + nav conditionnelle + badge visible

> **Contexte** : Ankora a un panneau admin (`/[locale]/admin/**`) accessible uniquement à @thierry initialement (cf. `CLAUDE.md` §"Choix techniques lockés" → "Admin auth : `requireAdmin()` basé sur `user_id` Thierry initialement"). Cette PR doit poser les fondations RBAC visuelles ET back-end.

#### K.1 — Helper `requireAdmin()` côté serveur

Créer `src/lib/auth/requireAdmin.ts` :

```typescript
// src/lib/auth/requireAdmin.ts
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function requireAdmin(): Promise<{ userId: string; isAdmin: true }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  if (!ADMIN_USER_IDS.includes(user.id)) redirect('/app'); // pas un 403 honteux, juste un retour silencieux dashboard

  return { userId: user.id, isAdmin: true };
}

export async function isAdmin(): Promise<boolean> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return ADMIN_USER_IDS.includes(user.id);
}
```

Variable d'env : `ADMIN_USER_IDS` (CSV de UUIDs Supabase Auth) — à valider dans `src/lib/env.ts` Zod schema.

#### K.2 — Layout admin protégé

Dans `src/app/[locale]/admin/layout.tsx` (Server Component) :

```typescript
import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // bloque l'accès si pas admin
  return <>{children}</>;
}
```

#### K.3 — Nav conditionnelle côté user

Dans `src/components/layout/AppShell.tsx` (sidebar nav user) :

```typescript
import { isAdmin } from '@/lib/auth/requireAdmin';

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const adminFlag = await isAdmin();
  return (
    <div>
      <Sidebar>
        {/* ... items normaux user ... */}
        {adminFlag && (
          <NavItem href="/admin" icon="ShieldCheck" label={t('nav.admin')} badge={t('nav.admin.badge')} badgeTone="info" />
        )}
      </Sidebar>
      <main>{children}</main>
    </div>
  );
}
```

→ Si l'utilisateur n'est PAS admin, l'item n'existe **pas dans le DOM côté client**. Pas de leak, pas de disabled grisé suspect.

#### K.4 — Badge visible "Zone admin"

Dans le header de `src/app/[locale]/admin/layout.tsx`, ajouter un chip sticky en haut à gauche :

```jsx
<Chip
  size="s"
  color="info"
  icon="Shield"
  label={t('admin.zone.badge')} // "Zone admin · réservée fondateur"
/>
```

#### K.5 — Footer admin disclaimer

En bas de chaque page admin :

```jsx
<footer className="mt-12 text-xs opacity-60">
  {t('admin.footer.disclaimer')} {/* "Données admin · accès restreint · audit log activé" */}
</footer>
```

#### K.6 — Audit log obligatoire sur toute action admin

Toute Server Action déclenchée depuis `/admin/**` doit appeler `logAuditEvent({ action: 'admin.<verb>', actor_id, target, ... })`. À vérifier par `gdpr-compliance-auditor` agent.

### L · Admin live data bindings (CRITIQUE — verrouillé par @thierry 2026-05-09)

> **Verbatim @thierry** : _« le dashboard admin est mon outil de contrôle pour gérer l'application, elle doit être parfaitement fonctionnel et être branchée sur les vraies valeurs »_.

**Aucun chiffre seed/hardcodé acceptable** dans le rendu admin de production. Chaque KPI doit consommer une vraie source live. Cette section pose les bindings ; l'implémentation effective des fetchers se fait en **PR-B2 dédiée** (cf. `prompts/PR-B2-admin-live-data-bindings.md`).

#### L.1 — Bindings KPI → source réelle

| KPI                     | Source                                           | Endpoint / Query                                           | Refresh |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ------- |
| Vercel deploy LIVE      | Vercel REST API                                  | `GET /v6/deployments?app=ankora&target=production&limit=1` | 60s     |
| Supabase DB usage       | Supabase Management API                          | `GET /v1/projects/{ref}/database/usage`                    | 5min    |
| Supabase MAU            | RPC custom sur `auth.users`                      | `count where last_sign_in > now() - 30d`                   | 5min    |
| Supabase BW + Storage   | Supabase Management API                          | `GET /v1/projects/{ref}/usage`                             | 5min    |
| Upstash cmd/jour        | Upstash REST API                                 | `GET /v2/redis/{db}/usage`                                 | 60s     |
| Sentry erreurs 24h      | Sentry API                                       | `GET /api/0/projects/{org}/{proj}/issues/?statsPeriod=24h` | 60s     |
| Signups +N (30d)        | Supabase RPC                                     | `count(auth.users) where created_at > now() - 30d`         | 5min    |
| Onboardings X/Y         | Supabase RPC                                     | `workspaces where onboarding_completed_at IS NOT NULL`     | 5min    |
| Drop-off Étape 1/2/3    | Supabase events table                            | `tracking onboarding_step_X_started/completed`             | 5min    |
| Charges médiane         | Supabase RPC                                     | `MEDIAN(count(recurring_templates) GROUP BY workspace_id)` | 5min    |
| Top 5 sources           | Vercel Analytics API                             | `GET /api/v1/analytics/sources?period=30d`                 | 1h      |
| Pages les plus visitées | Vercel Analytics API                             | `GET /api/v1/analytics/pages?period=30d`                   | 1h      |
| Recos rule-based        | Table `admin_recommendations` (cron rule engine) | `SELECT * WHERE status='pending'`                          | 2min    |

#### L.2 — Type AdminDashboardData (props-driven, zéro hardcoded)

```typescript
// src/lib/admin/types.ts
export type AdminDashboardData = {
  technical: {
    vercel: VercelDeploymentInfo;
    supabase: SupabaseUsage;
    upstash: UpstashUsage;
    sentry: SentrySummary;
  };
  product: {
    signups30d: number;
    onboardings: { completed: number; total: number };
    mau30d: number;
    medianCharges: number;
    dropOff: { step1: number; step2: number; step3: number; total: number; threshold: number };
  };
  acquisition: {
    signups30d: number;
    sources: { name: string; count: number; percent: number }[]; // percent = Hamilton method (somme = 100)
    topPages: { path: string; views: number }[];
  };
  recommendations: AdminRecommendation[];
  loadingState: { technical: 'loading'|'live'|'stale'|'error'; product: ...; acquisition: ...; recommendations: ... };
};
```

#### L.3 — Helper Hamilton method partagé

Fichier `src/lib/utils/largestRemainderRound.ts` :

```typescript
export function largestRemainderRound(values: number[], total: number): number[] {
  if (total === 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floored = exact.map(Math.floor);
  const remainders = exact.map((v, i) => ({ idx: i, rem: v - floored[i] }));
  const distributed = floored.reduce((a, b) => a + b, 0);
  const toDistribute = 100 - distributed;
  remainders.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < toDistribute; i++) {
    floored[remainders[i].idx] += 1;
  }
  return floored;
}
```

Test Vitest : `largestRemainderRound([5, 3, 2, 0, 2], 12)` doit retourner `[42, 25, 17, 0, 16]` (somme = 100). Couvrir aussi le cas total=0 (retourne tableau de zéros) et total=N (chaque count = total).

#### L.4 — Composant SectionCard avec loadingState

Atom additionnel à porter (atom 12) : `<SectionCard loadingState="loading|live|stale|error" lastUpdated={Date}>`.

Affichage :

- `loading` : skeleton shimmer
- `live` : dot teal + tooltip "Mis à jour à HH:MM"
- `stale` : dot laiton + tooltip "Données ≥ X min · à rafraîchir"
- `error` : dot danger + bannière "Source X indisponible · données peuvent être inexactes"

#### L.5 — Pas dans cette PR (scope PR-B2)

L'implémentation des **server fetchers** + branchement des 4 APIs externes (Vercel/Supabase/Upstash/Sentry) + cache Next.js + tests Playwright e2e est hors scope PR-D4 PHASE 2. Cette PR pose seulement :

- Le helper `largestRemainderRound.ts`
- Les types `AdminDashboardData`
- L'atom `SectionCard`
- L'admin layout protégé par `requireAdmin()`
- Le badge "Zone admin" + footer disclaimer + nav conditionnelle

→ Les KPIs admin restent en **mode mockup** (props seedées) à la fin de cette PR. La PR-B2 viendra brancher les vraies sources.

### J · Garde-fous transverses (R-01 à R-14 — rappel obligatoire avant chaque commit)

| Règle                             | Garde-fou dans cette PR                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| R-01 Budget 0 €                   | Aucune dépendance payante ajoutée                                                                          |
| R-02 FSMA-safe                    | Aucun terme "investir/placer/rendement" dans les copies                                                    |
| R-03 no-PSD2                      | Aucun appel API banque, aucun OAuth bancaire                                                               |
| R-04 vraies données > seeds       | Les seeds e2e utilisent les vraies données Thierry mai 2026                                                |
| R-05 3 concepts capacité          | HeroWaterfall + SignauxCard décomposition pédagogique                                                      |
| R-06 anti-culpabilisation         | Helpers RAV neutres, pas de rouge agressif sur déficits                                                    |
| R-07 mobile-first                 | Container queries CompteEpargne, sidebar off-canvas mobile                                                 |
| R-08 trio agents                  | Convention `@cowork / @cc-design / @cc-ankora / @thierry` dans tous les commits, commentaires PR, rapports |
| R-09 toggle Payé pattern Coda     | Pattern à respecter en PR-D5 (pas dans cette PR)                                                           |
| R-10 ajustement manuel partout    | Bouton "Ajuster ce mois" RAV                                                                               |
| R-11 plans apurement              | Bloc Plans d'apurement Surface 1 + drawer                                                                  |
| R-12 provisions bidirectionnelles | Onglet Mouvements CompteEpargne + tooltip pédagogique                                                      |
| R-13 services bundlés             | Préparer types `included_services` jsonb                                                                   |
| R-14 UI 100 % FR-BE               | Audit `i18n-auditor` obligatoire avant merge                                                               |

Détail complet des 14 règles dans `Athenaeum/10_Projects/ankora/_regles-decisions-critiques.md` (vault Obsidian de @thierry, demander si besoin).

---

## 1 · Source de vérité visuelle

Le pack final Claude Design Session #3 vit dans le projet remote claude.ai/design (ID `019dbeb5-1a7d-7b39-b9c5-ce01e2a48e7e`). Tu n'y as pas d'accès direct — ce prompt en est l'extrait fidèle.

**Récap des livrables Claude Design (8 atoms + 4 surfaces + 2 playgrounds + tokens prod inchangés)** :

### Atoms (`project/_shared/atoms/`)

1. **Button** — `01-Button.jsx`
   - Variants : `primary | secondary | ghost | destructive`, sizes `sm | md | lg`, props `icon`, `iconRight`, `disabled`, `ariaLabel`
   - Tokens : `--color-brand-{500,600}`, `--color-foreground`, `--color-muted-foreground`, `--color-border`, `--color-card`, `--color-danger`, `--radius-md`, `--ease-spring`, `--font-sans`
   - Deps : aucune (icônes injectées via prop)

2. **Chip** — `02-Chip.jsx` — générique, pas couplé au catalogue
   - Props : `color`, `label`, `emoji`, `icon`, `size: 's'|'m'|'l'`, `removable`, `onRemove`
   - Tokens : `--color-foreground`, `--color-border`, `--font-sans`, `--font-mono`, `--radius-full`
   - Note : `CategoryBadge` (utilisé Surfaces 1-4) est une spécialisation de Chip couplée à `CATEGORIES_SEED` — à porter séparément dans `src/components/categories/CategoryBadge.tsx`

3. **Card** — `03-Card.jsx`
   - Props : `padding: 'sm'|'md'|'lg'|'none'`, `elevation: 'flat'|'raised'`, `tone: 'default'|'soft'|'brand'|'accent'`, `eyebrow`, `title`, `footer`
   - Tokens : `--color-card`, `--color-border`, `--color-{brand,accent}-surface`, `--radius-lg`, `--shadow-{sm,md}`, `--font-display`, `--font-mono`

4. **Drawer (EditDrawer)** — canonique dans `_shared/atoms/_deps/drawer.jsx`
   - Composant : `EditDrawer`
   - Props : `{ open, title, subtitle?, fields, initial, onSave, onCancel, onDelete?, deleteLabel? }`
   - Field shape : `{ key, type: 'text'|'money'|'date'|'select'|'category'|'frequency'|'notes'|'color'|'emoji'|'icon'|'preview', label?, required?, placeholder?, help?, options?, disabled? }`
   - Field primitives internes : `TextField`, `MoneyField`, `DateField`, `SelectField`, `CategoryField`, `FrequencyField`, `NotesField`
   - Tokens : `--color-card`, `--color-border`, `--color-foreground`, `--color-muted-foreground`, `--color-brand-500`, `--color-danger`, `--radius-md`, `--radius-lg`, `--ease-spring`, `--dur-structural`, `--shadow-lg`
   - 🟠 **Single source of truth** — utilisé par Surfaces 1-4 sans variation. NE PAS wrapper dans un Headless UI Dialog différent (risque de double-handling focus trap).

5. **ProgressBar** — `05-ProgressBar.jsx`
   - Props : `value`, `max`, `tone: 'brand'|'accent'|'success'|'danger'|'neutral'`, `size`, `label`, `valueLabel`, `split: { affected, free, affectedTone?, freeTone? }`
   - Tokens : `--color-brand-500`, `--color-accent-400`, `--color-success`, `--color-danger`, `--color-surface-muted`, `--radius-full`, `--ease-spring`
   - Animation : CSS transitions sur width (pas de framer-motion)

6. **Avatar / Icon** — `06-Avatar.jsx`
   - Props : `emoji`, `icon` (string), `initials`, `label`, `color`, `size`, `shape: 'circle'|'rounded'`
   - Reçoit l'icône en string et délègue au registre — équivalent React = mapping vers `lucide-react` avec un composant `<Icon name="..." />`

7. **ColorPicker** — `07-ColorPicker.jsx`
   - Props : `value`, `options`, `onChange`, `columns`
   - Palette par défaut `ATM_COLOR_PALETTE` : 11 couleurs depuis `--color-brand-*` + `--color-accent-*` + neutrals
   - Tokens : `--color-foreground`, `--color-border`, `--radius-sm`, `--ease-spring`

8. **IconPicker** — `08-IconPicker.jsx`
   - Composant interne : `AtomIcon` (renderer SVG depuis registre)
   - Bibliothèque : `CAT_ICON_LIB` — à porter en sélection curated de `lucide-react`
   - Tokens : `--color-card`, `--color-border`, `--color-brand-500`, `--radius-sm`

### Surfaces

| #   | Surface                                                                                                                     | Atomes consommés                                            | État                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| 1   | Dashboard cockpit (hero waterfall Option C bidirectionnel + Compte Épargne + Bloc 4 Signaux + Activité + Année + Objectifs) | Card, CategoryBadge (spec Chip), ProgressBar, Avatar        | Complète — 18 design issues résolues + iter Hero #2 |
| 2   | Charges fixes enrichie (21 charges, 8 catégories)                                                                           | Card, Chip, Drawer, Button                                  | Complète                                            |
| 3   | Dépenses (transactions)                                                                                                     | Card, Chip, Drawer, Button, Avatar                          | Complète                                            |
| 4   | Catégories (Settings, drag-to-reorder, soft-delete vers "Autres" is_system protégée)                                        | Card, Chip, Drawer, Button, ColorPicker, IconPicker, Avatar | Complète                                            |

Layout shell partagé : Sidebar (240px fixe desktop, off-canvas mobile) + Topbar. À porter en composant React commun `src/components/layout/AppShell.tsx` (cohérent avec PR-NAV-1 existant).

### Tokens (déjà en place dans `src/app/globals.css` — VÉRIFIER cohérence)

Source de vérité maquette : `design_system/colors_and_type.css`. Tu dois confirmer que les tokens prod Ankora couvrent tout :

- **Couleurs palettes 50→950** : `--color-brand-{50,100,200,300,400,500,600,700,800,900,950}` (anchor 500=#14b8a6 teal) · `--color-accent-{50…900}` (laiton, dark 400=#d4a017, light 600=#8b6914 AA on white)
- **Semantic** : `--color-success` (#059669), `--color-warning` (#8b6914), `--color-danger` (#dc2626), `--color-info` (#0284c7)
- **Neutrals + theme switch** : `--color-{background,foreground,muted,muted-foreground,border,card,surface-soft,surface-muted}` (light + dark via `[data-theme='dark']`)
- **Tinted surfaces** : `--color-{brand,accent}-surface`, `--color-{brand,accent}-surface-border`
- **Text semantic** : `--color-{brand,accent}-text`, `--color-{brand,accent}-text-strong`
- **Typo** : `--font-sans` (Inter), `--font-display` (Fraunces), `--font-mono` (JetBrains Mono)
- **Radius** : `--radius-{xs(4),sm(6),md(8),lg(12),xl(16),2xl(20),full}`
- **Shadows dual** : `--shadow-{xs,sm,md,lg}` (drop shadows light, inset highlights dark)
- **Motion** : `--dur-default(200)`, `--dur-structural(320)`, `--ease-spring` (Apple cubic-bezier(0.32, 0.72, 0, 1)), `--ease-out` (cubic-bezier(0.16, 1, 0.3, 1))

Si un token manque dans Ankora prod → l'ajouter dans `globals.css` en respectant la convention `@theme inline`. Aucun nouveau token nécessaire au-delà du set existant.

---

## 2 · Stack & dépendances

**Aucune nouvelle dépendance npm.** Tout tourne avec ce qui existe déjà :

- React 19.2+
- TypeScript strict
- Tailwind CSS 4 (`@theme inline` dans `globals.css`)
- `lucide-react` (déjà présent — confirmer version 0.400+)

Polices Inter / Fraunces / JetBrains Mono : déjà en place dans `public/fonts/` (vérifier ; sinon copier depuis `design_system/fonts/` si Thierry te transmet le ZIP du projet design).

Pas de framer-motion. Animations via CSS transitions + `@keyframes`. Le hook `useTicker` (count-up, ~8 lignes) à porter ou remplacer par n'importe quel tween perso.

Container queries natif `container-type: inline-size` + `@container` — support Chrome 105+, Safari 16+, Firefox 110+. Aucun polyfill.

---

## 3 · Scope strict de cette PR

### À porter (in scope)

1. **8 atoms en TypeScript** dans `src/components/atoms/` :
   - `Button.tsx`, `Chip.tsx`, `Card.tsx`, `Drawer.tsx` (EditDrawer), `ProgressBar.tsx`, `Avatar.tsx`, `ColorPicker.tsx`, `IconPicker.tsx`
   - Chaque atom typé strictement (pas de `any`), props discriminées via union types
   - Stories minimales en `.stories.tsx` si Storybook présent (sinon, composant playground page `app/[locale]/_design-playground/page.tsx` privée admin-only)

2. **Surface 1 — Dashboard cockpit** (priorité 1 PR) dans `src/app/[locale]/app/page.tsx` + composants :
   - `src/components/dashboard/HeroWaterfall.tsx` (Option C bidirectionnel — voir §6 piège critique)
   - `src/components/dashboard/CompteEpargne.tsx` (3 lectures avec container query)
   - `src/components/dashboard/SignauxCard.tsx` (score santé + nudges what-if)
   - `src/components/dashboard/ActiviteRecente.tsx` (Bloc 8 — 10 derniers mouvements)
   - `src/components/dashboard/AnneeChart.tsx` (Bloc Année — 6 mois prédictif)
   - `src/components/dashboard/ObjectifsEpargne.tsx` (Bloc Goals)
   - `src/components/dashboard/AssistantVirements.tsx` (rail droit, lié à ADR-012)

3. **i18n** : ajouter ~80 clés (FR-BE + EN) listées en §7 dans `messages/fr-BE.json` + `messages/en.json`

### Hors scope (à reporter)

- Surfaces 2 / 3 / 4 (Charges, Dépenses, Catégories) — feront l'objet de PR-D5 / PR-D6 / PR-D7 séparées (édition de mouvements + onboarding + drag-reorder back-end). Cette PR pose les atomes + Surface 1 uniquement.
- Onboarding 3 étapes (catalogue belge + import CSV) — PR-D5 dédiée selon ADR-016
- Surface 5 admin dashboard — Session Claude Design #5

---

## 4 · Architecture & règles de code

### Domaine pur intact

Aucun changement à `src/lib/domain/`. Tu consommes les services existants :

- `calculerSanteProvisions()` (ADR-011) → SignauxCard
- `calculerCapaciteEpargne()` (ADR-009) → SignauxCard
- `calculerVirementRecommande()` (ADR-012) → AssistantVirements
- `getCharges()` + `getChargePayments()` → ActiviteRecente
- `getAccountBalances()` → CompteEpargne

Si une fonction domain manque, **stop et signale-le dans le rapport final** — ne pas l'implémenter dans cette PR.

### Composants Server vs Client

- Page `app/[locale]/app/page.tsx` : **Server Component** par défaut. Fetch via Server Actions ou directement Supabase server client.
- HeroWaterfall, CompteEpargne, SignauxCard, AnneeChart : **Client Components** (animations, interactions).
- ActiviteRecente, ObjectifsEpargne : **Server Components** (rendu pur).
- Tap → drawer : Client Component avec `useState` ouverture.
- Pattern : Server Component compose les Client Components avec données pré-fetched en props.

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`. Zéro `any`.
- Props des atoms : union discriminées (`type ButtonProps = PrimaryButtonProps | SecondaryButtonProps | ...`)
- Field types du Drawer : enum littéral typé.

### Tests

- **Vitest** :
  - Tests unitaires sur chaque atom (≥ 90% lignes + fonctions, ≥ 85% branches)
  - Tests sur `HeroWaterfall` : geometry helpers `topRoundedPath`, `botRoundedPath`, calcul `valToY` proportionnel.
- **Playwright** :
  - Smoke `/app` route loads + hero rendered + Compte Épargne 3 lectures visibles
  - Mobile viewport 375×812 (iPhone SE) : sidebar off-canvas, container query CompteEpargne 1 colonne
  - Dark theme toggle : switch puis vérif rendu

### Agents QA obligatoires (run avant push)

```
.claude/agents/ui-auditor.md
.claude/agents/dashboard-ux-auditor.md
.claude/agents/mobile-ios-auditor.md
.claude/agents/i18n-auditor.md
.claude/agents/test-runner.md
.claude/agents/security-auditor.md
```

Pour chacun : laisser tourner, capturer la sortie, fixer les findings P0/P1 avant de marquer DONE.

---

## 5 · Hero waterfall Option C — paradigme exact

### Visuel attendu

```
+3650 ┃▇▇▇▇┃                                                     ↑ ciel (positive max)
      ┃    ┃
+630  ┃    ┃                                          ┃▇▇▇▇┃     │ étage haut (60% plot)
      ┃    ┃                                          ┃    ┃
   0 ──┻────┻─────────┰──────┰──────┰──────┻────┻──── ← BASELINE 0 (1.5px solid, opacity 0.85)
                      ┃      ┃                                    │
-980                  ┃      ┃                                    │ étage bas (40% plot)
                              ┃      ┃
-1620                         ┃      ┃                            │
                                      ┃      ┃
-420                                  ┗▇▇▇▇▇┛                     ↓ cave
       Sal   Reste  Prov   VieC    RésL
```

### Pseudocode (à porter en TSX strict)

```tsx
const PLOT_W = 500;
const PLOT_H = 280;
const TOP_H = PLOT_H * 0.6; // 168 — zone barres positives
const BOT_H = PLOT_H * 0.4; // 112 — zone barres négatives
const BASELINE_Y = TOP_H; // y=168 (en SVG, y descend)
const MAX_REVENUE = 3650;
const MAX_OUTFLOW_ABS = 1620;

function getBarRect(value: number) {
  if (value >= 0) {
    const h = (value / MAX_REVENUE) * TOP_H;
    return { y: BASELINE_Y - h, height: h, roundedSide: 'top' as const };
  } else {
    const h = (Math.abs(value) / MAX_OUTFLOW_ABS) * BOT_H;
    return { y: BASELINE_Y, height: h, roundedSide: 'bottom' as const };
  }
}

// Geometry helpers — coins arrondis sur côté éloigné de la baseline
function topRoundedPath(x: number, y: number, w: number, h: number, r: number) {
  return `M ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}
function botRoundedPath(x: number, y: number, w: number, h: number, r: number) {
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} Z`;
}
```

### 🔴 Piège critique — animation

**NE JAMAIS utiliser `transform: scaleY` + `transformBox: fill-box` sur SVG paths.** Cassé sur Brave (et Firefox certaines versions) → `transformOrigin` retombe sur (0,0) du viewport SVG, barres négatives apparaissent suspendues en haut au lieu de pendre depuis baseline.

**Solution validée** : animation **uniquement** via `@keyframes` opacity sur les paths :

```css
@keyframes wf-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.wf-bar {
  animation: wf-fade-in 480ms var(--ease-spring) both;
}
.wf-bar:nth-child(1) {
  animation-delay: 0ms;
}
.wf-bar:nth-child(2) {
  animation-delay: 80ms;
}
/* ... staggered fade-in */
```

### Test d'acceptation binaire

Si une règle horizontale imaginaire au niveau y=168 :

1. Traverse le plot de gauche à droite SANS être coupée par aucune barre ✓
2. Toutes les barres positives au-dessus (y < 168) ✓
3. Toutes les barres négatives en-dessous (y > 168) ✓
4. La ligne baseline 0 est dessinée et perceptible ✓
5. Test du gamin de 12 ans : « papa gagne 3650, dépense 980+1620+420, il reste 630 » lu en 1 seconde ✓

### Labels triple-ligne (au-dessus barres positives)

```tsx
// Au-dessus de la barre Reste +630 €
<g className="wf-label wf-label--positive">
  <text className="wf-label__category">Reste disponible</text>
  <text className="wf-label__value">+ 630 €</text>
  <text className="wf-label__delta">+ 87 € vs. mars</text> {/* opacity 0.7, taille xs */}
</g>
```

**Pas de chip flottante 630 €** — supprimée pour éviter le doublon.

### Format numbers FR-BE (cohérence projet)

```ts
function fmtEur(value: number, opts: { sign?: boolean } = {}) {
  const abs = Math.abs(value).toLocaleString('fr-BE', { maximumFractionDigits: 0 });
  const sign = opts.sign ? (value >= 0 ? '+ ' : '− ') : '';
  return `${sign}${abs} €`; // narrow no-break space + symbole après
}
```

CSS `font-variant-numeric: tabular-nums` partout sur les chiffres (alignement colonnes).

---

## 6 · Points d'attention transverses

🔴 **Catégories `is_system`** (préparation Surface 4 PR-D7) : la catégorie "Autres" doit être non-supprimable, non-renommable côté UI ET back-end. Cascade FK ON DELETE SET NULL → fallback "Autres". Sort order pinned 99 (drag-drop bypass). À documenter même si Surface 4 n'est pas dans cette PR — l'atom IconPicker/ColorPicker est utilisé.

🟠 **EditDrawer = single source of truth** : utilisé en Surfaces 1-4. Pas de Modal séparé, pas de wrapper Headless UI Dialog. Focus trap manuel + escape key + backdrop click déjà gérés.

🟠 **Container queries CompteEpargne** : `container-type: inline-size` sur la carte (pas sur le viewport). `.ce-split` collapse 1 colonne dès que la carte mesure < 600px peu importe le viewport. Pas une `@media`. Robuste pour rail droit étroit + mobile.

🟡 **Numbers formatting** : `fmtEur` avec `toLocaleString('fr-BE')` → 3 650 € (espace insécable narrow). `font-variant-numeric: tabular-nums` partout sur chiffres.

🟡 **Patterns non-évidents à conserver** :

- Hero = 1 SVG unique, deux zones (TOP_H 60% + BOT_H 40%), pas deux SVG empilés
- Baseline 0 visuellement renforcée (`stroke-width="1.5"` + `stroke-opacity="0.85"`) + label "0 €" à gauche
- Sublines en `font-variant: all-small-caps` (pas `text-transform: uppercase` brutal)
- Truncation listes : `min-width: 12ch` + `text-overflow: ellipsis` (anti-troncature 1-2 chars)

🟡 **Sécurité** :

- Server Components par défaut (pas de leak Supabase keys côté client)
- Tous les `Server Actions` avec Zod parse + workspace authz + audit log + rateLimit
- Headers CSP `nonce={nonce}` sur tout `<script>` ou `<style>` inline (interdit sinon)

---

## 7 · i18n micro-copy à ajouter

Ajouter à `messages/fr-BE.json` (et stub anglais à `messages/en.json` — traduction propre EN à valider par @cowork avant merge) :

### Dashboard — bandeaux narratifs

```json
"dashboard.eyebrow.month": "TON MOIS",
"dashboard.eyebrow.year": "TON ANNÉE",
"dashboard.eyebrow.account": "TON COMPTE",
"dashboard.eyebrow.signals": "TES SIGNAUX",
"dashboard.title.month": "Là où ton argent est, maintenant.",
"dashboard.lede.month": "Salaire, charges fixes, ce qui reste. Vue du mois en cours, sans projection.",
"dashboard.transition": "Avant d'aller plus loin : combien tu peux vraiment garder, chaque mois ?"
```

### Hero waterfall

```json
"hero.eyebrow": "Cashflow waterfall · {month} {year}",
"hero.title": "Du salaire au reste disponible.",
"hero.subtitle": "Ce qui entre · ce qui sort · ce qui reste.",
"hero.badge.predictive": "Prédictif · 6 mois devant",
"hero.bar.salaires": "Salaires + revenus",
"hero.bar.provisions": "Provisions affectées",
"hero.bar.vie": "Vie courante",
"hero.bar.reserve": "Réserve libre",
"hero.bar.reste": "Reste disponible",
"hero.subline.salaires": "{count, plural, one{# entrée} other{# entrées}} · {month}",
"hero.subline.provisions": "≈ {count} × annuelles · cumul {amount}",
"hero.subline.vie": "loyer · courses · transport",
"hero.subline.reserve": "virement mensuel · saisi",
"hero.subline.reste": "à toi · sans contrainte",
"hero.delta": "{sign} {amount} vs. {month}",
"hero.baseline": "0 €"
```

### Compte Épargne (signature)

```json
"epargne.eyebrow": "SIGNATURE ANKORA",
"epargne.title": "Compte épargne · trois lectures.",
"epargne.lede": "Ton épargne n'est pas un seul nombre. Ankora distingue ce qui est réservé à une charge à venir, ce qui reste libre, et le total réellement sur le compte.",
"epargne.label.total": "Total · ce qui est sur le compte",
"epargne.label.affected": "Affectées · {pct}",
"epargne.label.free": "Libre · {pct}",
"epargne.label.provisions": "Provisions affectées",
"epargne.label.reserve": "Réserve libre",
"epargne.subline.iban": "IBAN {iban} · saisie manuelle",
"epargne.subline.provisions": "{count} charges à venir · alimenté par {amount}/mois",
"epargne.subline.reserve": "Disponible à tout moment · in/out historique",
"epargne.cta.provisions": "Voir les {count} provisions →",
"epargne.cta.reserve": "Voir les {count} mouvements récents →",
"epargne.footer": "Saisie manuelle · données hébergées en Belgique · Ankora ne se connecte à aucune banque.",
"epargne.footer.manual": "Mouvement manuel"
```

### Status badges génériques (utilisés Surfaces 2-3-4 — préparation)

```json
"status.programmer": "Programmer",
"status.verifier": "Vérifier",
"status.aVirer": "À virer manuellement",
"status.payee": "Payée",
"status.enRetard": "En retard",
"status.aVenir": "À venir",
"signal.vigilance": "Vigilance"
```

### Conventions FR-BE (helpers utils)

- Dates abrégées sans zéro initial : "2 mai" / "20 juill." (helper `formatDateBe(date)`)
- Montants : narrow no-break space + symbole après valeur
- Pourcentages : espace avant `%` (33 %)

---

## 8 · Plan d'exécution recommandé

1. **Setup branche** : `git checkout -b feat/cc-design-cd3-cockpit-v2 develop`. Vérifier modèle Opus 4.7 (Phase 0).
2. **Tokens audit** : ouvrir `globals.css`, vérifier que tous les tokens listés en §1 sont présents. Compléter ce qui manque (RAS attendu).
3. **Atoms en cascade** :
   1. `Button.tsx` (le plus simple) + tests + story → commit
   2. `Card.tsx` → commit
   3. `Chip.tsx` → commit
   4. `ProgressBar.tsx` → commit
   5. `Avatar.tsx` → commit
   6. `Drawer.tsx` (EditDrawer + 7 field primitives) → commit (le plus gros)
   7. `ColorPicker.tsx` → commit
   8. `IconPicker.tsx` → commit
4. **Surface 1 cockpit** :
   1. Refactor `app/[locale]/app/page.tsx` en Server Component squelette layout 3 colonnes
   2. `HeroWaterfall.tsx` Client Component (Option C bidirectionnel — pas de transform scaleY)
   3. `CompteEpargne.tsx` Client Component (container queries)
   4. `SignauxCard.tsx` Client Component (intègre `calculerSanteProvisions` + `calculerCapaciteEpargne`)
   5. `ActiviteRecente.tsx` Server Component (lit `getCharges` + `getChargePayments`)
   6. `AnneeChart.tsx` Client Component (line chart 6 mois)
   7. `ObjectifsEpargne.tsx` Server Component (stub data si pas encore en DB)
   8. `AssistantVirements.tsx` Client Component (rail droit, intègre `calculerVirementRecommande`)
5. **i18n** : ajouter les ~80 clés FR-BE + stubs EN. Lancer `npm run lint:i18n` (parity test).
6. **Tests** : Vitest atoms (≥ 90 % lignes), Playwright `/app` smoke + mobile 375 + dark mode toggle.
7. **Agents QA** : run les 6 agents listés en §4. Fix P0/P1 avant push.
8. **Quality gates locaux** : `npm run lint && npm run lint:use-server && npm run typecheck && npm run test && npm run e2e && npm run build`.
9. **Push + PR** : titre `feat(cockpit): Surface 1 dashboard CD#3 + 8 atoms (PR-D4 PHASE 2)`. Attendre CI vert + Sourcery silencieux.
10. **Rapport final** dans `docs/prs/PR-D4-PHASE2-report.md` selon template `.TEMPLATE-pr-body.md`.

---

## 9 · Définition de DONE (5 critères stricts — non négociable)

1. ✅ Tous les checks CI verts (Lint, Typecheck, Tests, E2E, Security, Build, Lighthouse)
2. ✅ Sourcery bot silencieux sur le DERNIER commit de la PR — vérifié via :
   ```bash
   gh api repos/thierryvm/ankora/pulls/<N>/comments --jq '.[] | select(.user.login == "sourcery-ai[bot]") | .body'
   ```
   Si output non vide → corriger avant DONE.
3. ✅ Toutes les reviews humaines approuvées et résolues
4. ✅ Pas de conflit avec `develop`
5. ✅ Rapport final livré à @thierry avec preuve de chaque critère + screenshots desktop 1440 + mobile 375 + dark mode

---

## 10 · Coordonnées agents pour escalade

- @thierry — décisions business (budget, scope, FSMA, design final), valide les merges
- @cowork — arbitrages techniques, micro-copy review FR-BE, debug pattern non-évident
- @cc-design — uniquement si re-touche design nécessaire (ne devrait pas, pack final livré)

Si tu rencontres un blocage qui dépasse cette PR (ex: domain function manquante, ADR contredit), **ne fais pas à moitié** — stop et remonte vers @cowork.

---

## 11 · Posture rappel

> Avant d'exécuter : relis le prompt avec un œil critique. Si une consigne te semble fausse, incomplète ou contre-intuitive, STOP et remonte ta contre-analyse à @cowork avant d'exécuter. Un hotfix basé sur un diagnostic erroné = deux PR pour un seul bug. Challenger poliment > exécuter docilement.

> Push done ≠ task done. Vérifier les 5 critères de Définition de DONE avant de déclarer terminé.

> @thierry est protégé : aucune dépendance payante ajoutée sans validation explicite. Aucune migration destructive sans confirmation. Aucun changement de design system sans validation.

---

## Annexe — Liens vers ADRs déjà acceptés (à respecter dans cette PR)

- ADR-001 (no-PSD2) : pas d'agrégation bancaire
- ADR-002 (bucket-model) : lissage trimestriel + annuel automatique
- ADR-009 (capacité d'épargne réelle) : KPI hero + formule
- ADR-011 (santé provisions) : algo détection déficit + plan rattrapage 3 mois
- ADR-012 (assistant virements) : calcul intelligent provisions ↔ factures du mois
- ADR-016 (tracking paiements multi-sources, statut Proposed) : préparation PR-D5 — pas dans le scope de cette PR mais à connaître
- **ADR-009 amendé 2026-05-09** : 3 concepts UX (Reste disponible / Reste à vivre / Capacité d'épargne réelle) — IMPACT DIRECT cette PR (cf. §0bis A)
- **ADR-017 (plans d'apurement, statut Proposed)** : préparation PR-D5 — bloc Surface 1 à porter avec stub si table absente (cf. §0bis D)
- **ADR-018 (provisions bidirectionnelles, statut Proposed)** : préparation PR-D5 — onglet Mouvements CompteEpargne avec stub si table absente (cf. §0bis E)

Spec dashboard cockpit canonique : `specs/dashboard-cockpit-vraie-vision-2026-05-03.md` (vault Athenaeum, à demander à @thierry si besoin).

---

**Fin du brief. Bonne implémentation.**
