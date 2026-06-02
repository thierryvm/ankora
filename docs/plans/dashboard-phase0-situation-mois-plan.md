# Situation du Mois — Hero Dashboard (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le double-bloc héros du dashboard (`EffortFinancierCard` + `CapaciteEpargneCard`) par un Hero unifié « Situation du mois » : narration en cascade (revenus → charges → provisions → reste disponible → épargne) + statut calme + nudge + fix THI-335.

**Architecture:** Une fonction domaine pure `calculerSituationDuMois()` compose les calculs existants et dérive un statut. La page passe des `number` (jamais un `Decimal` à travers RSC) à un Server Component `SituationDuMoisHero`, qui compose pastille + chiffre-héros + `AllocationBar` (SVG-maison, **CSP-safe via attributs SVG, jamais `style={{}}` inline**) + flow vertical + nudge, en réutilisant `AjusterResteAVivreDrawer`.

**Tech Stack:** TypeScript strict · decimal.js (domaine) · Next.js 16 Server Components · Tailwind 4 tokens sémantiques · next-intl (5 locales) · Vitest + Testing Library.

**Spec validée :** [docs/plans/dashboard-phase0-situation-mois-design.md](dashboard-phase0-situation-mois-design.md)

**Branche :** `feat/dashboard-situation-mois-hero` (déjà créée, spec déjà commitée).

---

## ⚠️ Contraintes non négociables (lire avant de coder)

1. **CSP stricte** : `style-src 'self' 'nonce-…'` sans `unsafe-inline` ni `unsafe-hashes` ([src/proxy.ts:57](../../src/proxy.ts#L57)). **Tout `style={{…}}` React rendu en attribut HTML est BLOQUÉ en prod** (THI-322). → largeurs dynamiques de la barre EXCLUSIVEMENT via attributs SVG (`x`, `width`, `fill="var(--color-…)"`), comme [`SimulatorProjection.tsx`](../../src/app/[locale]/app/simulator/SimulatorProjection.tsx). **Aucun `style={{}}` dans les nouveaux fichiers.**
2. **Decimal ne traverse jamais RSC** : la page convertit en `number` avant de passer au Hero ; le Hero formate via `formatCurrency` (qui accepte `Money | number`).
3. **Domaine pur** : `src/lib/domain/cockpit/situation-mois.ts` n'importe ni Supabase ni Next.js — uniquement decimal.js + les modules cockpit voisins.
4. **Tokens** : aucun hex hardcodé hors SVG justifié ; tokens sémantiques only (cf. [token-usage.md](../design/token-usage.md)).
5. **Messages UI en français**, code/commentaires/commits en anglais.

---

## File Structure

| Fichier                                                           | Action    | Responsabilité                                                                                |
| ----------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `src/lib/domain/cockpit/situation-mois.ts`                        | créer     | Fonction pure `calculerSituationDuMois` + types `SituationStatut`/`SituationDuMois`.          |
| `src/lib/domain/cockpit/__tests__/situation-mois.test.ts`         | créer     | TDD domaine (4 statuts + edges).                                                              |
| `src/lib/domain/cockpit/index.ts`                                 | modifier  | `export * from './situation-mois'`.                                                           |
| `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json`                      | modifier  | Namespace `dashboard.situation.*`.                                                            |
| `src/lib/domain/cockpit/__tests__/situation-i18n.test.ts`         | créer     | Parité 5 locales.                                                                             |
| `src/components/dashboard/AllocationBar.tsx`                      | créer     | Barre fine SVG-maison présentationnelle (CSP-safe).                                           |
| `src/components/dashboard/__tests__/AllocationBar.test.tsx`       | créer     | TDD barre.                                                                                    |
| `src/components/dashboard/SituationDuMoisHero.tsx`                | créer     | Server Component Hero.                                                                        |
| `src/components/dashboard/__tests__/SituationDuMoisHero.test.tsx` | créer     | TDD Hero (statuts + incomplet + nudge + drawer).                                              |
| `src/app/[locale]/app/page.tsx`                                   | modifier  | Câble le Hero, calcule `joursRestants`, supprime la section 2-cartes.                         |
| `src/components/dashboard/EffortFinancierCard.tsx` + test         | supprimer | Subsumé.                                                                                      |
| `src/components/dashboard/CapaciteEpargneCard.tsx` + test         | supprimer | Subsumé (garder `AjusterResteAVivreDrawer`).                                                  |
| `src/components/dashboard/ProvisionHealthGaugeCard.tsx`           | modifier  | Commentaire stale (réf. cartes supprimées) → réf. Hero.                                       |
| `src/app/[locale]/app/simulator/SimulatorClient.tsx`              | modifier  | Commentaire stale (réf. `CapaciteEpargneCard`) → réf. Hero. (Commentaire only, zéro logique.) |

---

## Known stale refs (hors scope — PR `.claude/` dédiée)

La suppression de `EffortFinancierCard`/`CapaciteEpargneCard` rend stale deux références dans l'infra de garde-fous, **à NE PAS éditer dans cette PR** (`.claude/` = infra, banned-list item 3 — modif réservée à une PR `.claude/` dédiée avec review humaine) :

- `.claude/agents/dashboard-ux-auditor.md` (« match the dashboard hero card `CapaciteEpargneCard` ») → deviendra `SituationDuMoisHero`.
- `.claude/skills/ankora-design-system/SKILL.md` (liste `CapaciteEpargneCard, EffortFinancierCard`).

Acté ici pour que `dashboard-ux-auditor` Layer 0 ne produise pas de faux négatif (chercher un composant disparu). À corriger dans une PR `.claude/` séparée.

---

## Task 1: Domaine — `calculerSituationDuMois`

**Files:**

- Create: `src/lib/domain/cockpit/situation-mois.ts`
- Test: `src/lib/domain/cockpit/__tests__/situation-mois.test.ts`
- Modify: `src/lib/domain/cockpit/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/cockpit/__tests__/situation-mois.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

import { calculerSituationDuMois } from '@/lib/domain/cockpit/situation-mois';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from '@/lib/domain/cockpit/types';

const NO_PAYMENTS: PaymentLedger = new Map();
const REF: ReferencePeriod = { year: 2026, month: 6 };

const charge = (over: Partial<CockpitCharge>): CockpitCharge => ({
  id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
  label: 'Test',
  amount: new Decimal(0),
  frequency: 'monthly',
  paymentMonths: [1],
  paymentDay: 1,
  isActive: true,
  ...over,
});

describe('calculerSituationDuMois', () => {
  it('statut vert when capacité ≥ 0 and provisions à jour (no periodic charge)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [charge({ amount: new Decimal(1838), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.statut).toBe('vert');
    expect(out.hasRevenus).toBe(true);
    expect(out.resteDisponible.toNumber()).toBe(662);
    expect(out.capacite.toNumber()).toBe(162);
    expect(out.provisionsAJour).toBe(true);
  });

  it('statut orange when capacité < 0 but resteDisponible ≥ 0', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(800),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.statut).toBe('orange');
    expect(out.resteDisponible.toNumber()).toBe(500);
    expect(out.capacite.toNumber()).toBe(-300);
  });

  it('statut orange when provisions en déficit even if capacité ≥ 0', () => {
    // Annual 1200 due in March (paymentMonths [3]); ref month 6 → 9 months
    // until next due → épargne requise 300 > solde 0 → déficit.
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.statut).toBe('orange');
    expect(out.capacite.gte(0)).toBe(true);
    expect(out.provisionsAJour).toBe(false);
    expect(out.deficitEpargne.toNumber()).toBe(300);
  });

  it('statut rouge when charges + provisions exceed revenus (resteDisponible < 0)', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(1000),
      charges: [charge({ amount: new Decimal(1500), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.statut).toBe('rouge');
    expect(out.resteDisponible.toNumber()).toBe(-500);
  });

  it('statut incomplet when revenus is null (THI-335) — no negative propagated to statut', () => {
    const out = calculerSituationDuMois({
      revenus: null,
      charges: [charge({ amount: new Decimal(900), frequency: 'monthly' })],
      budgetVieCourante: new Decimal(500),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.statut).toBe('incomplet');
    expect(out.hasRevenus).toBe(false);
    expect(out.revenus.toNumber()).toBe(0);
  });

  it('exposes chargesFixes and provisionsLissees split separately', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(3000),
      charges: [
        charge({ amount: new Decimal(1500), frequency: 'monthly' }),
        charge({ amount: new Decimal(1200), frequency: 'annual', paymentMonths: [3] }),
      ],
      budgetVieCourante: new Decimal(0),
      soldeEpargneActuel: new Decimal(10000),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.chargesFixes.toNumber()).toBe(1500);
    expect(out.provisionsLissees.toNumber()).toBe(100); // 1200 / 12
    expect(out.resteDisponible.toNumber()).toBe(1400); // 3000 - 1500 - 100
  });

  it('ignores inactive charges', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2000),
      charges: [
        charge({ amount: new Decimal(900), frequency: 'monthly' }),
        charge({ amount: new Decimal(800), frequency: 'monthly', isActive: false }),
      ],
      budgetVieCourante: new Decimal(0),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.chargesFixes.toNumber()).toBe(900);
    // Whole-chain proof: the inactive 800 must not leak past chargesFixes.
    expect(out.resteDisponible.toNumber()).toBe(1100); // 2000 − 900 − 0
  });

  it('statut vert on an empty workspace with budgetVieCourante only', () => {
    const out = calculerSituationDuMois({
      revenus: new Decimal(2500),
      charges: [],
      budgetVieCourante: new Decimal(700),
      soldeEpargneActuel: new Decimal(0),
      payments: NO_PAYMENTS,
      ref: REF,
    });
    expect(out.statut).toBe('vert');
    expect(out.resteDisponible.toNumber()).toBe(2500);
    expect(out.capacite.toNumber()).toBe(1800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- situation-mois`
Expected: FAIL — `Cannot find module '@/lib/domain/cockpit/situation-mois'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/domain/cockpit/situation-mois.ts`:

```ts
import Decimal from 'decimal.js';

import { capaciteEpargneReelle } from './capacite-epargne-reelle';
import { provisionsMensuellesLissees, totalChargesMensuelles } from './effort-financier-lisse';
import { calculerSanteProvisions } from './sante-provisions';
import type { CockpitCharge, PaymentLedger, ReferencePeriod } from './types';

/**
 * Statut « Situation du mois » — narration calme du Hero dashboard (Phase 0).
 *  - vert      : capacité ≥ 0 ET provisions à jour
 *  - orange    : capacité < 0 OU provisions en déficit (mais revenus couvrent les obligations)
 *  - rouge     : charges + provisions > revenus (resteDisponible < 0)
 *  - incomplet : revenus non configurés (monthlyIncome === null) → fix THI-335
 */
export type SituationStatut = 'vert' | 'orange' | 'rouge' | 'incomplet';

export type SituationDuMoisInput = Readonly<{
  /** Revenus mensuels. `null` = non configuré → statut incomplet (THI-335). */
  revenus: Decimal | null;
  charges: readonly CockpitCharge[];
  /** Budget « vie courante » (domaine resteAVivre). */
  budgetVieCourante: Decimal;
  soldeEpargneActuel: Decimal;
  payments: PaymentLedger;
  ref: ReferencePeriod;
}>;

export type SituationDuMois = Readonly<{
  statut: SituationStatut;
  hasRevenus: boolean;
  /** 0 quand incomplet. */
  revenus: Decimal;
  chargesFixes: Decimal;
  provisionsLissees: Decimal;
  /** Chiffre-héros = revenus − chargesFixes − provisionsLissees. */
  resteDisponible: Decimal;
  budgetVieCourante: Decimal;
  capacite: Decimal;
  provisionsAJour: boolean;
  deficitEpargne: Decimal;
  rattrapageMensuel: Decimal;
}>;

export function calculerSituationDuMois(input: SituationDuMoisInput): SituationDuMois {
  const hasRevenus = input.revenus !== null;
  const revenus = input.revenus ?? new Decimal(0);

  const capac = capaciteEpargneReelle({
    revenus,
    charges: input.charges,
    resteAVivre: input.budgetVieCourante,
  });

  const sante = calculerSanteProvisions({
    charges: input.charges,
    payments: input.payments,
    soldeEpargneActuel: input.soldeEpargneActuel,
    ref: input.ref,
  });

  const chargesFixes = totalChargesMensuelles(input.charges);
  const provisionsLissees = provisionsMensuellesLissees(input.charges);
  const provisionsAJour = sante.statut === 'a_jour';

  let statut: SituationStatut;
  if (!hasRevenus) {
    statut = 'incomplet';
  } else if (capac.resteDisponible.lt(0)) {
    statut = 'rouge';
  } else if (capac.capacite.lt(0) || !provisionsAJour) {
    statut = 'orange';
  } else {
    statut = 'vert';
  }

  return {
    statut,
    hasRevenus,
    revenus,
    chargesFixes,
    provisionsLissees,
    resteDisponible: capac.resteDisponible,
    budgetVieCourante: capac.resteAVivre,
    capacite: capac.capacite,
    provisionsAJour,
    deficitEpargne: sante.deficitEpargne,
    rattrapageMensuel: sante.rattrapageMensuel,
  };
}
```

- [ ] **Step 4: Export from the cockpit barrel**

In `src/lib/domain/cockpit/index.ts`, add after the existing `export * from './simulateur';` line:

```ts
export * from './situation-mois';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- situation-mois`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/cockpit/situation-mois.ts src/lib/domain/cockpit/__tests__/situation-mois.test.ts src/lib/domain/cockpit/index.ts
git commit -m "feat(cockpit): calculerSituationDuMois pure domain function (THI-327 Phase 0)"
```

---

## Task 2: i18n — namespace `dashboard.situation` (5 locales) + parité

**Files:**

- Modify: `messages/fr-BE.json`, `messages/en.json`, `messages/nl-BE.json`, `messages/de-DE.json`, `messages/es-ES.json`
- Test: `src/lib/domain/cockpit/__tests__/situation-i18n.test.ts`

- [ ] **Step 1: Write the failing parity test**

Create `src/lib/domain/cockpit/__tests__/situation-i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

const LOCALES = ['fr-BE', 'en', 'de-DE', 'es-ES', 'nl-BE'] as const;

const LEAF_KEYS = [
  'heroLabel',
  'heroSubtitle',
  'voirPlan',
  'statut.vert',
  'statut.orangeCapacite',
  'statut.orangeProvisions',
  'statut.rouge',
  'nudge.orangeCapacite',
  'nudge.orangeProvisions',
  'nudge.rouge',
  'incomplet.title',
  'incomplet.body',
  'incomplet.cta',
  'flow.revenus',
  'flow.chargesFixes',
  'flow.provisions',
  'flow.resteDisponible',
  'flow.resteAVivre',
  'flow.capaciteEpargne',
  'flow.ajuster',
  'flow.parJour',
  'barAria',
] as const;

function leaf(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (typeof acc === 'object' && acc !== null && k in acc) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe('dashboard.situation — i18n parity (5 locales)', () => {
  it.each(LOCALES)(
    'locale %s exposes every situation key as a non-empty string',
    async (locale) => {
      const m = (await import(`../../../../../messages/${locale}.json`)).default as {
        dashboard: { situation: unknown };
      };
      for (const key of LEAF_KEYS) {
        const value = leaf(m.dashboard.situation, key);
        expect(value, `${locale} → dashboard.situation.${key}`).toBeTypeOf('string');
        expect((value as string).length, `${locale} → dashboard.situation.${key}`).toBeGreaterThan(
          0,
        );
      }
    },
  );
});
```

> Note: 5 `../` because the test lives at `src/lib/domain/cockpit/__tests__/` (4 levels) and must reach repo-root `messages/`. Verify the relative depth when the file is created; adjust if Vitest resolves from a different root.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- situation-i18n`
Expected: FAIL — `dashboard.situation` undefined.

- [ ] **Step 3: Add the FR source keys**

In `messages/fr-BE.json`, inside the top-level `"dashboard"` object, add a `"situation"` sibling next to `"effort"`/`"capacite"`/`"health"`:

```json
"situation": {
  "heroLabel": "Reste disponible",
  "heroSubtitle": "Ce qu'il te reste après tes charges et provisions",
  "voirPlan": "Voir le plan",
  "statut": {
    "vert": "Tu gères bien ce mois-ci",
    "orangeCapacite": "À ajuster ce mois-ci",
    "orangeProvisions": "Provisions à renflouer",
    "rouge": "Tes charges dépassent tes revenus"
  },
  "nudge": {
    "orangeCapacite": "Ton épargne passe sous zéro ({capacite}). Regarde le plan pour rééquilibrer.",
    "orangeProvisions": "Il manque {deficit} pour couvrir tes charges à venir. Rattrapage suggéré : {rattrapage}/mois.",
    "rouge": "Tes charges et provisions ({obligations}) dépassent tes revenus ({revenus}). On regarde ensemble ce qui peut bouger."
  },
  "incomplet": {
    "title": "Complète ta situation",
    "body": "Ajoute tes revenus pour voir ton reste disponible ce mois.",
    "cta": "Configurer mes revenus"
  },
  "flow": {
    "revenus": "Revenus",
    "chargesFixes": "Charges fixes",
    "provisions": "Provisions lissées",
    "resteDisponible": "Reste disponible",
    "resteAVivre": "Reste à vivre",
    "capaciteEpargne": "Capacité épargne",
    "ajuster": "Ajuster ce mois",
    "parJour": "≈ {amount}/jour"
  },
  "barAria": "Répartition de tes revenus : {charges} de charges, {provisions} de provisions, {vieCourante} de vie courante, {epargne} d'épargne possible."
}
```

- [ ] **Step 4: Add the EN keys**

In `messages/en.json`, same location, add:

```json
"situation": {
  "heroLabel": "Available leftover",
  "heroSubtitle": "What's left after your charges and provisions",
  "voirPlan": "See the plan",
  "statut": {
    "vert": "You're on track this month",
    "orangeCapacite": "Needs adjusting this month",
    "orangeProvisions": "Provisions to top up",
    "rouge": "Your charges exceed your income"
  },
  "nudge": {
    "orangeCapacite": "Your savings dip below zero ({capacite}). Check the plan to rebalance.",
    "orangeProvisions": "You're short {deficit} to cover upcoming charges. Suggested catch-up: {rattrapage}/month.",
    "rouge": "Your charges and provisions ({obligations}) exceed your income ({revenus}). Let's look at what can move."
  },
  "incomplet": {
    "title": "Complete your setup",
    "body": "Add your income to see your available leftover this month.",
    "cta": "Set up my income"
  },
  "flow": {
    "revenus": "Income",
    "chargesFixes": "Fixed charges",
    "provisions": "Smoothed provisions",
    "resteDisponible": "Available leftover",
    "resteAVivre": "Living budget",
    "capaciteEpargne": "Savings capacity",
    "ajuster": "Adjust this month",
    "parJour": "≈ {amount}/day"
  },
  "barAria": "Breakdown of your income: {charges} charges, {provisions} provisions, {vieCourante} living budget, {epargne} potential savings."
}
```

> EN « Available leftover » est aligné sur la clé existante `app.simulator.impact.resteDisponible` = "Available leftover" (parité simulateur, déjà en place).

- [ ] **Step 5: Add the FR-mirrored keys to nl-BE, de-DE, es-ES**

Les 3 locales post-launch reçoivent **la copy FR à l'identique** (pattern existant du repo — parité de clés, traductions NL/DE/ES livrées post-v1.0). Coller le **bloc `"situation"` de l'étape 3 (FR)** au même emplacement dans `messages/nl-BE.json`, `messages/de-DE.json` et `messages/es-ES.json`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- situation-i18n`
Expected: PASS (5 locales).

- [ ] **Step 7: Commit**

```bash
git add messages/*.json src/lib/domain/cockpit/__tests__/situation-i18n.test.ts
git commit -m "i18n(dashboard): dashboard.situation keys + 5-locale parity (THI-327 Phase 0)"
```

---

## Task 3: `AllocationBar` — barre fine SVG-maison (CSP-safe)

**Files:**

- Create: `src/components/dashboard/AllocationBar.tsx`
- Test: `src/components/dashboard/__tests__/AllocationBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/AllocationBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AllocationBar } from '../AllocationBar';

describe('<AllocationBar />', () => {
  it('renders one <rect> per segment with cumulative x offsets', () => {
    render(
      <AllocationBar
        ariaLabel="Répartition test"
        segments={[
          { key: 'a', ratio: 0.5, fill: 'var(--color-info)' },
          { key: 'b', ratio: 0.25, fill: 'var(--color-success)' },
        ]}
      />,
    );
    const a = screen.getByTestId('allocation-segment-a');
    const b = screen.getByTestId('allocation-segment-b');
    expect(a.getAttribute('x')).toBe('0');
    expect(a.getAttribute('width')).toBe('50');
    expect(b.getAttribute('x')).toBe('50');
    expect(b.getAttribute('width')).toBe('25');
  });

  it('exposes the accessible breakdown via role=img + aria-label', () => {
    render(
      <AllocationBar
        ariaLabel="Répartition de tes revenus"
        segments={[{ key: 'a', ratio: 1, fill: 'var(--color-danger)' }]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Répartition de tes revenus' })).toBeInTheDocument();
  });

  it('clamps a ratio above 1 to width 100 and never overflows the cursor', () => {
    render(
      <AllocationBar
        ariaLabel="Clamp"
        segments={[
          { key: 'a', ratio: 1.3, fill: 'var(--color-info)' },
          { key: 'b', ratio: 0.4, fill: 'var(--color-success)' },
        ]}
      />,
    );
    expect(screen.getByTestId('allocation-segment-a').getAttribute('width')).toBe('100');
    // cursor already at 100 → second segment starts at 100, width clamped to 0.
    expect(screen.getByTestId('allocation-segment-b').getAttribute('x')).toBe('100');
    expect(screen.getByTestId('allocation-segment-b').getAttribute('width')).toBe('0');
  });

  it('uses NO inline style attribute (CSP strict — geometry via SVG attrs only)', () => {
    const { container } = render(
      <AllocationBar
        ariaLabel="No style"
        segments={[{ key: 'a', ratio: 0.5, fill: 'var(--color-info)' }]}
      />,
    );
    expect(container.querySelector('[style]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- AllocationBar`
Expected: FAIL — `Cannot find module '../AllocationBar'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/dashboard/AllocationBar.tsx`:

```tsx
/**
 * AllocationBar — barre d'allocation fine du Hero « Situation du mois » (Phase 0).
 *
 * CSP-safe par construction : la géométrie passe par des ATTRIBUTS SVG
 * (`x`, `width`, `fill`), jamais par un `style={{…}}` inline (bloqué par la CSP
 * stricte `style-src 'self' 'nonce-…'`, cf. THI-322 + SimulatorProjection.tsx).
 *
 * Présentationnel pur (zéro état, zéro hydration) — Server Component compatible.
 * Supplémentaire : la même répartition est donnée en texte par le flow vertical
 * du Hero, donc la barre est une ancre visuelle (WCAG 1.4.11 graphique ≥ 3:1),
 * pas la seule source d'info.
 */

export type AllocationSegment = Readonly<{
  /** Clé stable (sert aussi au data-testid). */
  key: string;
  /** Portion du tout, 0..1 (le caller normalise sur les revenus). */
  ratio: number;
  /** Couleur de remplissage — token sémantique via var(), ex `var(--color-info)`. */
  fill: string;
}>;

type Props = {
  segments: readonly AllocationSegment[];
  /** Description accessible de la répartition complète (role=img). */
  ariaLabel: string;
};

export function AllocationBar({ segments, ariaLabel }: Props) {
  let cursor = 0;
  const rects = segments.map((s) => {
    const width = Math.max(0, Math.min(100 - cursor, s.ratio * 100));
    const x = cursor;
    cursor += width;
    return { key: s.key, x, width, fill: s.fill };
  });

  return (
    <div
      className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full"
      data-testid="allocation-bar"
    >
      <svg
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="block h-full w-full"
      >
        {rects.map((r) => (
          <rect
            key={r.key}
            x={r.x}
            y={0}
            width={r.width}
            height={6}
            fill={r.fill}
            data-testid={`allocation-segment-${r.key}`}
          />
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- AllocationBar`
Expected: PASS (4 tests). Note: `x`/`width` are emitted as the numbers `0`/`50`/`25`/`100` → `getAttribute` returns their string form.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/AllocationBar.tsx src/components/dashboard/__tests__/AllocationBar.test.tsx
git commit -m "feat(dashboard): AllocationBar SVG-maison, CSP-safe (THI-327 Phase 0)"
```

---

## Task 4: `SituationDuMoisHero` — Server Component

**Files:**

- Create: `src/components/dashboard/SituationDuMoisHero.tsx`
- Test: `src/components/dashboard/__tests__/SituationDuMoisHero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/SituationDuMoisHero.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import messages from '../../../../messages/fr-BE.json';
import { SituationDuMoisHero } from '../SituationDuMoisHero';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const ns =
      (messages as Record<string, Record<string, unknown>>)[namespace.split('.')[0] ?? ''] ?? {};
    const sub = namespace
      .split('.')
      .slice(1)
      .reduce<unknown>((acc, key) => {
        if (typeof acc === 'object' && acc !== null && key in acc) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, ns);
    return (key: string, vars?: Record<string, unknown>) => {
      const node = sub;
      if (typeof node === 'object' && node !== null && key in node) {
        const value = (node as Record<string, unknown>)[key];
        if (typeof value !== 'string') return key;
        return vars ? value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : value;
      }
      return key;
    };
  },
}));

// AjusterResteAVivreDrawer is a client component with its own Server Action +
// next-intl client hooks; stub it so the server-rendered Hero test stays pure.
vi.mock('../AjusterResteAVivreDrawer', () => ({
  AjusterResteAVivreDrawer: () => <button data-testid="reste-a-vivre-trigger">Ajuster</button>,
}));

const BASE = {
  revenus: 2500,
  chargesFixes: 1500,
  provisionsLissees: 338,
  resteDisponible: 662,
  budgetVieCourante: 500,
  capacite: 162,
  deficitEpargne: 0,
  rattrapageMensuel: 0,
  provisionsAJour: true,
  joursRestants: 18,
  currentMonthYYYYMM: '2026-06',
  locale: 'fr-BE' as const,
};

const renderHero = async (over: Partial<typeof BASE> & { statut: string }) =>
  render(await SituationDuMoisHero({ ...BASE, ...over } as never));

describe('<SituationDuMoisHero />', () => {
  it('vert: shows hero label + reassuring status, AllocationBar + Adjust trigger, no plan link', async () => {
    await renderHero({ statut: 'vert' });
    expect(screen.getByText(messages.dashboard.situation.heroLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.dashboard.situation.statut.vert)).toBeInTheDocument();
    expect(screen.getByTestId('allocation-bar')).toBeInTheDocument();
    expect(screen.getByTestId('reste-a-vivre-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('situation-nudge-link')).toBeNull();
  });

  it('orange (capacité < 0): shows the capacité nudge + a plan link', async () => {
    await renderHero({ statut: 'orange', capacite: -60, resteDisponible: 440 });
    expect(
      screen.getByText(messages.dashboard.situation.statut.orangeCapacite),
    ).toBeInTheDocument();
    expect(screen.getByTestId('situation-nudge-link')).toBeInTheDocument();
  });

  it('orange (provisions déficit, capacité ≥ 0): shows the provisions nudge', async () => {
    await renderHero({
      statut: 'orange',
      capacite: 200,
      provisionsAJour: false,
      deficitEpargne: 300,
      rattrapageMensuel: 100,
    });
    expect(
      screen.getByText(messages.dashboard.situation.statut.orangeProvisions),
    ).toBeInTheDocument();
  });

  it('rouge: shows the rouge status + plan link', async () => {
    await renderHero({ statut: 'rouge', resteDisponible: -180 });
    expect(screen.getByText(messages.dashboard.situation.statut.rouge)).toBeInTheDocument();
    expect(screen.getByTestId('situation-nudge-link')).toBeInTheDocument();
  });

  it('incomplet (THI-335): shows setup CTA, no AllocationBar, no negative amount', async () => {
    const { container } = await renderHero({ statut: 'incomplet', revenus: 0 });
    expect(screen.getByText(messages.dashboard.situation.incomplet.title)).toBeInTheDocument();
    expect(screen.getByTestId('situation-setup-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('allocation-bar')).toBeNull();
    expect(container.textContent ?? '').not.toContain('−');
    expect(container.textContent ?? '').not.toMatch(/-\d/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- SituationDuMoisHero`
Expected: FAIL — `Cannot find module '../SituationDuMoisHero'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/dashboard/SituationDuMoisHero.tsx`:

```tsx
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/i18n/formatters';
import type { SituationStatut } from '@/lib/domain/cockpit';
import type { Locale } from '@/i18n/routing';

import { AllocationBar, type AllocationSegment } from './AllocationBar';
import { AjusterResteAVivreDrawer } from './AjusterResteAVivreDrawer';

type Props = {
  statut: SituationStatut;
  revenus: number;
  chargesFixes: number;
  provisionsLissees: number;
  resteDisponible: number;
  budgetVieCourante: number;
  capacite: number;
  deficitEpargne: number;
  rattrapageMensuel: number;
  provisionsAJour: boolean;
  joursRestants: number;
  currentMonthYYYYMM: string;
  locale: Locale;
};

const STATUT_ACCENT = {
  vert: {
    Icon: CheckCircle2,
    ring: 'ring-success/15',
    icon: 'text-success',
    from: 'from-success/8',
  },
  orange: {
    Icon: AlertTriangle,
    ring: 'ring-warning/15',
    icon: 'text-warning',
    from: 'from-warning/8',
  },
  rouge: { Icon: AlertCircle, ring: 'ring-danger/15', icon: 'text-danger', from: 'from-danger/8' },
} as const;

export async function SituationDuMoisHero(props: Props) {
  const t = await getTranslations('dashboard.situation');
  const fmt = (value: Parameters<typeof formatCurrency>[0]) => formatCurrency(value, props.locale);

  // --- Incomplet (THI-335): no waterfall, no negative number, calm CTA. ---
  if (props.statut === 'incomplet') {
    return (
      <Card
        className="ring-info/15 relative overflow-hidden ring-1 ring-inset"
        data-testid="situation-hero"
        data-statut="incomplet"
      >
        <div
          aria-hidden
          className="from-info/8 pointer-events-none absolute inset-0 bg-linear-to-br to-transparent"
        />
        <CardContent className="relative flex flex-col gap-3 py-6">
          <div className="flex items-center gap-2">
            <Wallet aria-hidden strokeWidth={1.5} className="text-info h-6 w-6 shrink-0" />
            <p className="text-lg font-semibold tracking-tight">{t('incomplet.title')}</p>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{t('incomplet.body')}</p>
          <Button asChild variant="outline" size="sm" className="min-h-11 self-start px-4">
            <Link href="/app/accounts" data-testid="situation-setup-cta">
              {t('incomplet.cta')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const accent = STATUT_ACCENT[props.statut];

  // --- Status line (title + optional nudge). ---
  const statusTitle =
    props.statut === 'vert'
      ? t('statut.vert')
      : props.statut === 'rouge'
        ? t('statut.rouge')
        : props.capacite < 0
          ? t('statut.orangeCapacite')
          : t('statut.orangeProvisions');

  let nudge: string | null = null;
  if (props.statut === 'rouge') {
    nudge = t('nudge.rouge', {
      obligations: fmt(props.chargesFixes + props.provisionsLissees),
      revenus: fmt(props.revenus),
    });
  } else if (props.statut === 'orange') {
    nudge =
      props.capacite < 0
        ? t('nudge.orangeCapacite', { capacite: fmt(props.capacite) })
        : t('nudge.orangeProvisions', {
            deficit: fmt(props.deficitEpargne),
            rattrapage: fmt(props.rattrapageMensuel),
          });
  }

  // --- Allocation bar segments (rouge → single danger fill). ---
  const segments: AllocationSegment[] =
    props.resteDisponible < 0 || props.revenus <= 0
      ? [{ key: 'overflow', ratio: 1, fill: 'var(--color-danger)' }]
      : [
          { key: 'charges', ratio: props.chargesFixes / props.revenus, fill: 'var(--color-info)' },
          {
            key: 'provisions',
            ratio: props.provisionsLissees / props.revenus,
            fill: 'var(--color-brand-500)',
          },
          {
            key: 'vie',
            ratio:
              Math.max(0, Math.min(props.budgetVieCourante, props.resteDisponible)) / props.revenus,
            fill: 'var(--color-accent-400)',
          },
          ...(props.capacite > 0
            ? [
                {
                  key: 'epargne',
                  ratio: props.capacite / props.revenus,
                  fill: 'var(--color-success)',
                },
              ]
            : []),
        ];

  const barAria = t('barAria', {
    charges: fmt(props.chargesFixes),
    provisions: fmt(props.provisionsLissees),
    vieCourante: fmt(props.budgetVieCourante),
    epargne: fmt(Math.max(0, props.capacite)),
  });

  const perJour =
    props.joursRestants > 0 && props.budgetVieCourante > 0
      ? t('flow.parJour', { amount: fmt(props.budgetVieCourante / props.joursRestants) })
      : null;

  return (
    <Card
      className={`relative overflow-hidden ring-1 ring-inset ${accent.ring}`}
      data-testid="situation-hero"
      data-statut={props.statut}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-linear-to-br ${accent.from} to-transparent`}
      />
      <CardContent className="relative flex flex-col gap-5 py-6">
        {/* Status pill (icon + text — never colour alone). */}
        <div className="flex items-center gap-2">
          <accent.Icon
            aria-hidden
            strokeWidth={1.5}
            className={`h-5 w-5 shrink-0 ${accent.icon}`}
          />
          <p className="text-sm font-semibold tracking-tight">{statusTitle}</p>
        </div>

        {/* Hero number. */}
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('heroLabel')}
          </p>
          <p
            className="text-foreground text-4xl font-bold tracking-tight tabular-nums"
            data-testid="situation-hero-value"
          >
            {fmt(props.resteDisponible)}
          </p>
          <p className="text-muted-foreground text-sm">{t('heroSubtitle')}</p>
        </div>

        {/* Allocation bar (supplementary visual anchor). */}
        <AllocationBar segments={segments} ariaLabel={barAria} />

        {/* Nudge (orange/rouge only) + plan link. */}
        {nudge && (
          <div className="border-border/60 flex flex-col gap-1.5 border-t pt-4">
            <p className="text-muted-foreground text-sm leading-relaxed">{nudge}</p>
            <Link
              href="/app#plan-heading"
              className="text-brand-text-strong inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
              data-testid="situation-nudge-link"
            >
              {t('voirPlan')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        )}

        {/* Waterfall flow. */}
        <dl className="border-border/60 flex flex-col gap-2 border-t pt-4 text-sm">
          <FlowRow label={t('flow.revenus')} value={fmt(props.revenus)} />
          <FlowRow label={t('flow.chargesFixes')} value={`− ${fmt(props.chargesFixes)}`} muted />
          <FlowRow label={t('flow.provisions')} value={`− ${fmt(props.provisionsLissees)}`} muted />
          <div className="border-border mt-1 border-t pt-2">
            <FlowRow label={t('flow.resteDisponible')} value={fmt(props.resteDisponible)} strong />
          </div>
          <div className="text-muted-foreground flex items-center justify-between gap-2 pl-3 text-xs">
            <dt className="flex items-center gap-2">
              <span>· {t('flow.resteAVivre')}</span>
              <AjusterResteAVivreDrawer
                currentMonthYYYYMM={props.currentMonthYYYYMM}
                initialResteAVivre={props.budgetVieCourante}
                monthlyIncome={props.revenus}
                triggerLabel={t('flow.ajuster')}
              />
            </dt>
            <dd className="tabular-nums">
              {fmt(props.budgetVieCourante)}
              {perJour ? <span className="ml-2">{perJour}</span> : null}
            </dd>
          </div>
          <div className="text-muted-foreground flex items-center justify-between gap-2 pl-3 text-xs">
            <dt>· {t('flow.capaciteEpargne')}</dt>
            <dd className="tabular-nums">{fmt(Math.max(0, props.capacite))}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function FlowRow({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-muted-foreground' : 'text-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold' : 'font-medium'} text-foreground`}>
        {value}
      </dd>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- SituationDuMoisHero`
Expected: PASS (5 tests). If the incomplet `not.toContain('−')` assertion trips on a stray minus, confirm the incomplet branch renders zero amounts (it renders none).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/SituationDuMoisHero.tsx src/components/dashboard/__tests__/SituationDuMoisHero.test.tsx
git commit -m "feat(dashboard): SituationDuMoisHero — unified cockpit hero (THI-327 Phase 0)"
```

---

## Task 5: Câblage page.tsx + suppression des cartes subsumées

**Files:**

- Modify: `src/app/[locale]/app/page.tsx`
- Delete: `src/components/dashboard/EffortFinancierCard.tsx`, `src/components/dashboard/__tests__/EffortFinancierCard.test.tsx`, `src/components/dashboard/CapaciteEpargneCard.tsx`, `src/components/dashboard/__tests__/CapaciteEpargneCard.test.tsx`
- Modify (comment-only): `src/components/dashboard/ProvisionHealthGaugeCard.tsx`, `src/app/[locale]/app/simulator/SimulatorClient.tsx`

- [ ] **Step 1: Wire the Hero into the dashboard**

In `src/app/[locale]/app/page.tsx`:

1. Replace the two card imports

```tsx
import { EffortFinancierCard } from '@/components/dashboard/EffortFinancierCard';
import { CapaciteEpargneCard } from '@/components/dashboard/CapaciteEpargneCard';
```

with

```tsx
import { SituationDuMoisHero } from '@/components/dashboard/SituationDuMoisHero';
```

2. Add the cockpit import for the new function. The file already imports `paymentKey, type PaymentLedger` from `@/lib/domain/cockpit`; extend it to:

```tsx
import { calculerSituationDuMois, paymentKey, type PaymentLedger } from '@/lib/domain/cockpit';
```

3. After `paymentsLedger` is built (around L83-88) and `soldeEpargneActuel` exists (L82), compute the situation + days remaining. Insert before the `return (`:

```tsx
// THI-327 Phase 0 — unified "Situation du mois" hero. Reuses the same
// cockpit primitives as the (now removed) Effort + Capacité cards.
const situation = calculerSituationDuMois({
  // Distinct from `monthlyIncome` above (the Transfer plan coerces null→0).
  // The situation needs the genuine null to drive the THI-335 incomplet state.
  revenus: snapshot.monthlyIncome === null ? null : money(snapshot.monthlyIncome),
  charges: cockpitCharges,
  budgetVieCourante: money(snapshot.resteAVivre),
  soldeEpargneActuel,
  payments: paymentsLedger,
  ref: snapshot.currentPeriod,
});

// Days remaining in the current month (Europe/Brussels) for the "≈ X/jour"
// living-budget hint. `currentPeriod` is, by the snapshot invariant
// (workspace-snapshot derives it from `new Date()` in this same TZ), always
// the current calendar month. We still guard defensively: if it ever
// diverged, `joursRestants = 0` suppresses the per-day hint (the Hero treats
// joursRestants <= 0 as "no per-day").
const brusselsNow = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date()); // "YYYY-MM-DD"
const [bYear, bMonth, bDay] = brusselsNow.split('-').map(Number);
const isCurrentPeriod =
  bYear === snapshot.currentPeriod.year && bMonth === snapshot.currentPeriod.month;
const daysInMonth = new Date(
  snapshot.currentPeriod.year,
  snapshot.currentPeriod.month, // month is 1..12 → Date(y, m, 0) = last day of (m)
  0,
).getDate();
const joursRestants = isCurrentPeriod ? Math.max(1, daysInMonth - (bDay ?? 1) + 1) : 0;
```

4. Replace the whole `<section aria-label={...} className="grid gap-4 md:grid-cols-2"> … </section>` block (the one rendering `<EffortFinancierCard />` + `<CapaciteEpargneCard />`, L112-124) with:

```tsx
<section aria-label={t('headerTitle', { month: monthLabel })}>
  <SituationDuMoisHero
    statut={situation.statut}
    revenus={situation.revenus.toNumber()}
    chargesFixes={situation.chargesFixes.toNumber()}
    provisionsLissees={situation.provisionsLissees.toNumber()}
    resteDisponible={situation.resteDisponible.toNumber()}
    budgetVieCourante={situation.budgetVieCourante.toNumber()}
    capacite={situation.capacite.toNumber()}
    deficitEpargne={situation.deficitEpargne.toNumber()}
    rattrapageMensuel={situation.rattrapageMensuel.toNumber()}
    provisionsAJour={situation.provisionsAJour}
    joursRestants={joursRestants}
    currentMonthYYYYMM={`${snapshot.currentPeriod.year}-${String(snapshot.currentPeriod.month).padStart(2, '0')}`}
    locale={locale}
  />
</section>
```

> `.toNumber()` converts Decimal → number AT the page boundary (Decimal never crosses into the Hero/its client drawer). The incomplet branch passes `revenus: 0` harmlessly (the Hero shortcuts on `statut === 'incomplet'`).

- [ ] **Step 2: Delete the subsumed cards + their tests**

```bash
git rm src/components/dashboard/EffortFinancierCard.tsx \
       src/components/dashboard/__tests__/EffortFinancierCard.test.tsx \
       src/components/dashboard/CapaciteEpargneCard.tsx \
       src/components/dashboard/__tests__/CapaciteEpargneCard.test.tsx
```

> `AjusterResteAVivreDrawer.tsx` is NOT deleted — it is now imported by the Hero. The domain test `capacite-epargne-reelle.test.ts` is NOT deleted (it tests the domain function, still used).

- [ ] **Step 3: Fix the two stale comments referencing the deleted cards**

In `src/components/dashboard/ProvisionHealthGaugeCard.tsx`, the doc comment (around L31-33) says “Cards #1 (EffortFinancierCard) and #2 (CapaciteEpargneCard) answer …”. Replace that sentence with:

```tsx
 * The unified `SituationDuMoisHero` answers "what is my real monthly burden
 * and what's left?". This card answers a different question:
```

In `src/app/[locale]/app/simulator/SimulatorClient.tsx`, the comment around L315-317 references `CapaciteEpargneCard "Reste disponible"`. Replace `CapaciteEpargneCard` with `SituationDuMoisHero` in that comment (comment-only, zero behaviour change — the simulator's "Reste disponible" wording and logic stay identical).

- [ ] **Step 4: Verify nothing else imports the deleted components**

Run: `npm run typecheck`
Expected: 0 error. (If a typecheck error surfaces an unexpected importer, STOP and report — the spec assumed only `page.tsx` imports these.)

- [ ] **Step 5: Run the full test + lint suite**

Run: `npm run test`
Expected: PASS (the deleted card tests are gone; new domain/bar/hero/i18n tests pass).

Run: `npm run lint && npm run lint:use-server`
Expected: 0 error.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(dashboard): wire Situation hero into page, remove subsumed cards (THI-327 Phase 0)"
```

---

## Task 6: Quality gates + vérification visuelle

**Files:** none (verification only).

- [ ] **Step 1: Full gate sweep**

```bash
npm run typecheck
npm run lint
npm run lint:use-server
npm run test
npm run build
```

Expected: all green, 0 warning.

- [ ] **Step 2: Manual dev smoke (CSP + visual)**

Run `npm run dev`, open `/fr-BE/app`, and confirm in DevTools console:

- **Zero new `style-src` CSP violation** from `AllocationBar` (the bar renders its segments — proves the SVG-attr approach is CSP-safe).
- The Hero renders for the seeded/test workspace: status pill, "Reste disponible" headline, the thin bar, the flow with the "Ajuster ce mois" trigger.
- Toggle a no-income workspace (or set `monthlyIncome` null) → the incomplet CTA shows, **no red negative number**.

- [ ] **Step 3: Seeded Playwright ground-truth (optional but recommended)**

If the seeded harness is wired (`e2e/helpers/seed.ts` + `fillLogin`), capture a desktop + mobile screenshot of `/app` for the QA agents and @thierry's visual validation. Otherwise defer to the agent-gate phase.

- [ ] **Step 4: Final commit (if any gate fix was needed)**

```bash
git add -A
git commit -m "chore(dashboard): green gates for Situation hero (THI-327 Phase 0)"
```

---

## Post-plan: agent gates (hors exécution TDD, avant PR DoD)

Voie LOURDE (touche le domaine) — lancer après le build :
`financial-formula-validator` (domaine) · `dashboard-ux-auditor` **Layer 0** · `ui-auditor` · `mobile-ios-auditor` · `i18n-auditor` · `lighthouse-auditor` · `test-runner`. SEO non concerné (surface privée). PR cible < 600 lignes.

---

## Self-Review (rempli après écriture)

**1. Spec coverage :**

- §1 Vocabulaire → Task 2 (labels) + Task 4 (usage). ✅
- §2 Mapping data → Task 1 (compose les fonctions existantes). ✅
- §3 Statut 3 paliers + incomplet → Task 1 (logique) + Task 4 (rendu). ✅
- §4 Nudges FSMA-safe + priorité orange → Task 4 (sélection : `capacite < 0` prime). ✅
- §5 Forme flow + barre fine + per-day sur vie courante → Task 3 (barre) + Task 4 (flow + perJour). ✅
- §6 Archi composants → Tasks 1/3/4/5. ✅
- §7 A11y → AllocationBar role=img + aria, statut icône+texte, dl/dt/dd, drawer réutilisé. ✅
- §8 Tests → domaine (Task 1), composant (Tasks 3/4), i18n (Task 2). E2E = Task 6 step 3. ✅
- §9 Scope IN/OUT → seules les surfaces listées sont touchées ; jauge/factures/comptes/plan/dépenses intacts. ✅
- §10 Gates → bloc « agent gates ». ✅

**2. Placeholder scan :** aucun TODO/TBD ; toute la copy FR+EN est explicite ; les `{var}` sont des placeholders i18n légitimes. ✅

**3. Type consistency :** `SituationStatut`/`SituationDuMois` (Task 1) consommés par le Hero (Task 4) via `.toNumber()` (Task 5). Props du Hero = exactement les champs passés en Task 5. `AllocationSegment` (Task 3) = type des `segments` construits en Task 4. `AjusterResteAVivreDrawer` props (`currentMonthYYYYMM`/`initialResteAVivre: number`/`monthlyIncome: number | null`/`triggerLabel`) respectés en Task 4. ✅

**Point à valider @thierry (déjà flaggé en spec) :** per-day attaché à la ligne « Reste à vivre ». Confirmé en exécution si OK visuellement.
