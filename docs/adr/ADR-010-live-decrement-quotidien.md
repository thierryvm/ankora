# ADR-010 — Live decrement du Quotidien (optimistic update + revalidation)

- **Statut** : Accepted
- **Date** : 2026-05-03
- **Accepté le** : 2026-05-03 par délégation explicite de @thierry à @cowork (chat session, "tu as la responsabilité des choix techniques")
- **Proposé par** : Cowork-Opus (Architecture)
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `ux`, `performance`, `next-js`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-009 (capacité d'épargne), spec `dashboard-cockpit-vraie-vision-2026-05-03.md`, PR-C2a (déjà mergée), PR-D5

---

## Contexte & problème

La PR-C2a (mergée 2026-05-03) a livré une section "Dépenses — Mai" sur le Dashboard avec :

- Total des dépenses du mois
- Liste des 5 dernières dépenses
- Lien vers `/app/expenses`

Le pattern technique : Server Component qui charge `monthlyExpenses` via `getWorkspaceSnapshot()`, render passif. Pour voir une nouvelle dépense ajoutée via `/app/expenses`, l'utilisateur doit revenir sur `/app` (qui exerce le Router Cache + revalidatePath de PR-C1).

**Limite identifiée empiriquement par @thierry** lors du smoke test prod : le pattern "passif" ne donne pas le sentiment cockpit. Le mockup IronBudget propose une UX plus directe :

> Card "Dépenses du Quotidien" sur le Dashboard avec :
>
> - Barre de progression `Reste à dépenser X / Y €`
> - Form ajout inline (description + montant + catégorie + bouton +)
> - Liste des dépenses du mois avec delete au hover
> - **Mise à jour LIVE** à chaque saisie : la barre, le total, et le `Reste à dépenser` se recalculent **instantanément** sans recharge.

C'est cette dimension live qui transforme le Dashboard en **vrai cockpit**. Sans elle, l'utilisateur a l'impression de remplir un formulaire administratif.

Cet ADR formalise le pattern Next.js 16 + React 19 pour livrer cette UX, la stratégie de gestion d'erreur (que faire si le serveur rejette la dépense ?), et l'interaction avec ADR-009 (Capacité d'Épargne Réelle qui ne change PAS — confirmé).

---

## Décision — drivers

Trois objectifs en tension :

1. **Sentiment cockpit immédiat** : la barre doit bouger en moins de 100 ms après le clic "+", sans attendre le round-trip serveur.
2. **Cohérence DB** : la dépense doit finir persistée Supabase. Pas de divergence client/serveur.
3. **Robustesse erreur** : si le serveur rejette (validation, RLS, network), l'UI doit revert proprement et expliquer pourquoi.

---

## Décision adoptée

**Adopter le pattern "Optimistic Update React 19 + Server Action + revalidatePath"** :

### Architecture

```
[User clique +]
    │
    ▼
[useOptimistic update locale instantanée] ──> [UI affiche la dépense en gris/loading]
    │
    ▼
[Server Action addExpenseAction(formData)]
    │
    ├── ✅ Succès → revalidatePath('/[locale]/app', 'page') → Server Component recharge → UI confirme (couleur normale)
    │
    └── ❌ Erreur (Zod / RLS / network) → useOptimistic revert + toast erreur ("Cette dépense n'a pas pu être enregistrée. Réessaye.")
```

### Implémentation simplifiée (pseudocode)

```typescript
// src/components/features/QuotidienCard.tsx (Client Component)
'use client';

import { useOptimistic, useTransition } from 'react';
import { addExpenseAction } from '@/app/[locale]/app/expenses/actions';

export function QuotidienCard({ initialExpenses, plafondQuotidien, currentPeriod }: Props) {
  const [optimisticExpenses, addOptimisticExpense] = useOptimistic(
    initialExpenses,
    (state, newExpense: Expense) => [...state, { ...newExpense, _optimistic: true }]
  );
  const [isPending, startTransition] = useTransition();

  const totalDepensesMois = useMemo(
    () => optimisticExpenses.reduce((acc, e) => acc.plus(e.montant), new Decimal(0)),
    [optimisticExpenses]
  );
  const resteBudget = plafondQuotidien.minus(totalDepensesMois);
  const pourcentage = Decimal.min(totalDepensesMois.dividedBy(plafondQuotidien).times(100), 100);

  async function handleSubmit(formData: FormData) {
    const newExpense = parseFormData(formData);  // validation Zod côté client
    startTransition(async () => {
      addOptimisticExpense(newExpense);
      const result = await addExpenseAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        // useOptimistic revert auto au prochain render
      }
      // Sinon revalidatePath dans Server Action déclenche refresh
    });
  }

  return <Card>{/* JSX avec optimisticExpenses */}</Card>;
}
```

### Server Action

```typescript
// src/app/[locale]/app/expenses/actions.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/security/rate-limit';
import { logAuditEvent } from '@/lib/security/audit-log';

const AddExpenseSchema = z.object({
  description: z.string().trim().min(1).max(100),
  montant: z.coerce.number().positive().max(99999.99),
  categorieId: z.string().uuid(),
  occurredOn: z.coerce.date(),
});

export async function addExpenseAction(formData: FormData) {
  const parsed = AddExpenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Données invalides' };

  await rateLimit({ key: 'expense-add', limit: 30, window: '1m' });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Non authentifié' };

  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...parsed.data /* workspace_id resolved server-side via RLS */ })
    .select()
    .single();

  if (error) {
    // Logger structuré (sans PII)
    return { ok: false, error: "Erreur d'enregistrement" };
  }

  await logAuditEvent({ action: 'expense_added', userId: user.id });
  revalidatePath('/[locale]/app', 'page');
  return { ok: true, expense: data };
}
```

### Que se passe-t-il avec la Capacité d'Épargne Réelle ?

**Décision** : la Capacité d'Épargne Réelle (ADR-009) est **un KPI lissé long-terme** basé sur le **plafond** Quotidien, pas sur les dépenses réelles. Elle **NE change PAS** quand l'utilisateur ajoute une dépense. C'est un choix volontaire pour éviter le yo-yo et donner de la stabilité émotionnelle.

Ce qui change live :

- Total dépenses du mois (somme `optimisticExpenses`)
- Reste à dépenser (`plafond - total`)
- Barre de progression et sa couleur (violet < 75 %, amber 75-90 %, rose ≥ 90 %)
- Liste des dépenses (la nouvelle apparaît immédiatement)

Ce qui NE change PAS live :

- Capacité d'Épargne Réelle (KPI hero du Bloc 1) — stable
- Effort Financier Lissé — stable
- Assistant Virements — stable
- Santé des Provisions — stable
- Prévisions 6 mois — stable

Cette stabilité est **une feature, pas un bug**. Elle distingue Ankora de Monarch/Lunch Money qui font fluctuer leurs KPIs au moindre achat (effet anxiogène).

---

## Conséquences positives

- ✅ **UX cockpit immédiate** : sentiment de réactivité au sub-100ms.
- ✅ **Pas de loading state visible** : useOptimistic camoufle la latence réseau.
- ✅ **React 19 native** : pas de lib externe (TanStack Query, SWR), tout vient du framework.
- ✅ **Cohérence DB garantie** : la Server Action est l'unique source de vérité, revalidatePath force le rerender Server Component.
- ✅ **Robustesse erreur** : useOptimistic revert auto si la Server Action échoue, toast explicatif visible.
- ✅ **Cohérent avec PR-C2a** : pas besoin de tout refactor, on garde getWorkspaceSnapshot() en server-side, on ajoute juste le useOptimistic en client-side.
- ✅ **Capacité Réelle stable** : préserve la promesse "sans surprise" en évitant le yo-yo.

## Conséquences négatives

- ❌ **Complexité technique** : useOptimistic + useTransition + Server Action + revalidatePath = stack à comprendre. Mitigation : documentation interne `docs/patterns/optimistic-mutations.md` (à créer en PR-D5).
- ❌ **Edge case race condition** : si l'utilisateur ajoute 3 dépenses en 1 seconde, la 3ème peut arriver avant que la 1ère soit confirmée serveur. Mitigation : useTransition sérialise les Server Actions, et useOptimistic gère les états intermédiaires.
- ❌ **Erreur silencieuse possible** : si le revert useOptimistic se fait sans toast (bug), l'utilisateur ne sait pas que l'enregistrement a échoué. Mitigation : tests E2E Playwright "simuler erreur 500 → vérifier toast visible".
- ❌ **Coût mémoire client** : le tableau optimisticExpenses peut grossir si user a beaucoup de dépenses. Mitigation : limiter l'affichage à 50 dernières dépenses du mois, paginer pour le reste.

---

## Alternatives évaluées

### Alternative 1 — Polling

Recharger automatiquement le Dashboard toutes les 5 secondes via `setInterval` ou `react-query` polling.

**Rejetée** : gaspillage réseau + latence visible + ne couvre pas la suppression de dépense.

### Alternative 2 — WebSockets / Supabase Realtime

S'abonner à la table `expenses` via Supabase Realtime, pousser les changements au Dashboard.

**Rejetée v1.0** : surcomplexité pour un single-user app. WebSockets + RLS + reconnexion = ~2-3 jours de dev pour 0 ROI utilisateur. À reconsidérer en v1.5+ si feature multi-utilisateurs (workspace partagé) arrive.

### Alternative 3 — Pas d'optimistic, juste useTransition + Suspense

Server Action + Suspense boundary qui affiche un skeleton pendant le rerender.

**Rejetée** : le skeleton est visible 200-500 ms (latence Vercel + DB). Donne un sentiment de lenteur, pas cockpit.

### Alternative 4 — RouteHandler + fetch côté client

POST sur `/api/expenses` côté client, mise à jour state local, refresh via `router.refresh()`.

**Rejetée** : Server Actions sont l'idiome Next.js 16 recommandé. Routes API ajoutent une couche d'indirection sans bénéfice (et obligent à dupliquer la validation Zod côté client).

---

## Plan d'implémentation

1. **PR-D5 (Quotidien live + Assistant Virements + Santé Provisions)** :
   - Composant `QuotidienCard` Client Component avec useOptimistic
   - Server Action `addExpenseAction` (créer ou réutiliser celle de `/app/expenses`)
   - Server Action `removeExpenseAction` (avec confirm modal côté client)
   - Tests Vitest sur la logique optimistic state
   - Tests Playwright E2E :
     - "user ajoute dépense → barre bouge en <100ms → DB confirme en <1s"
     - "user ajoute dépense avec erreur réseau → revert + toast"
     - "user ajoute 5 dépenses rapidement → toutes persistées dans le bon ordre"
2. **Documentation** : créer `docs/patterns/optimistic-mutations.md` avec ce pattern comme référence pour de futurs cas (ex: toggle paye charge en PR-D4 utilisera le même pattern).
3. **i18n** : 4 nouvelles clés `messages/{fr-BE,en}.json` :
   ```json
   "quotidien.toast.addError": "Cette dépense n'a pas pu être enregistrée. Réessaye.",
   "quotidien.toast.removeError": "Cette dépense n'a pas pu être supprimée. Réessaye.",
   "quotidien.confirmDelete": "Supprimer cette dépense ?",
   "quotidien.placeholder": "Ex: Courses Colruyt"
   ```

---

## Risques

- **Risque 1 — Drift DB / UI** : useOptimistic affiche une dépense qui n'existe pas en DB suite à erreur silencieuse. Mitigation : assertion E2E sur état post-action + monitoring Sentry sur Server Action errors.
- **Risque 2 — User ajoute en offline** : useOptimistic accepte, Server Action throw network error, toast affiché. L'utilisateur peut être dérouté. Mitigation v1.0 : message clair "Vérifie ta connexion". v1.1 : queue offline avec retry automatique.
- **Risque 3 — Bug Hydration React 19** : useOptimistic peut désynchroniser SSR / CSR. Mitigation : tests E2E couvrent le first render.
- **Risque 4 — Performance render** : si l'utilisateur a 100 dépenses du mois, recompute Decimal sum à chaque render = 100 itérations. Acceptable, à surveiller. Mitigation : `useMemo` sur le total + pagination > 50 items.

---

## Métriques de succès

À mesurer 4 semaines post-PR-D5 :

- **Latence perçue** : timing entre clic "+" et update visible. Cible : ≤ 100 ms p95.
- **Fréquence d'usage** : nombre moyen de dépenses ajoutées par user / semaine. Cible : ≥ 3 (signal cockpit régulier).
- **Taux d'erreur Server Action** : monitoring Sentry. Cible : ≤ 0.5 % des appels.
- **Taux de revert useOptimistic** : mesurer combien de fois la dépense optimiste a été retirée. Cible : ≤ 1 % (signal de robustesse).

---

## Décision finale

À valider par @thierry. En attendant validation explicite, statut `Proposed`.
