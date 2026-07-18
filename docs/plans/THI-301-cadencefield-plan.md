# THI-301 — CadenceField Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Gate Ankora** : ce plan doit recevoir `plan-reviewer` ✅ APPROVED avant tout code.

**Goal:** Remplacer les 3 champs séparés (fréquence / mois / jour) des formulaires charge par un composant unifié `CadenceField` (« Prélevé le 15 »), tout éditable, avec option « Dernier jour du mois ».

**Architecture:** Composant client feature-local contrôlé `CadenceField.tsx` consommé par le form create (`ChargesClient`) et le drawer edit (`ChargeEditDrawer`). Selects **natifs** (a11y iOS, @thierry locked). Sortie `{frequency, dueMonth, paymentDay}` — exactement les props que les Server Actions consomment déjà. **Zéro modif schéma/domaine** : le clamp bissextile reste dans `next-due-date.ts`.

**Tech Stack:** Next.js 16 client component, React 19, next-intl, Tailwind 4, Vitest + Testing Library.

**Spec:** `docs/plans/THI-301-cadencefield-design.md` (validé @thierry 2026-06-02).

---

## File Structure

- **Create** `src/app/[locale]/app/charges/CadenceField.tsx` — le composant (controlled, native selects, summary line).
- **Create** `src/app/[locale]/app/charges/__tests__/CadenceField.test.tsx` — tests unitaires.
- **Create** `src/app/[locale]/design-playground/_components/demos/CadenceFieldDemo.tsx` — démo QA visuelle.
- **Modify** `src/app/[locale]/design-playground/page.tsx` — enregistre la démo.
- **Modify** `src/app/[locale]/app/charges/ChargesClient.tsx` — remplace les 3 champs du form create (L336-379).
- **Modify** `src/app/[locale]/app/charges/ChargeEditDrawer.tsx` — remplace les 3 champs (L219-262).
- **Modify** `messages/fr-BE.json` (+ `en.json`, `nl-BE.json`, `de-DE.json`, `es-ES.json`) — bloc `app.charges.cadence.*` (additif).
- **Modify** `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx` — 2 assertions (L183 + L258).

**Décision i18n clé (réduit la casse de tests)** : on **garde** `paymentDayLabel`/`paymentDayHint` (utilisés par le test de parité locale L365-407) et on réutilise les libellés `"Fréquence"` / `"Jour du mois"` → la plupart des `getByLabelText` du form create restent verts. **Exception** (plan-reviewer 2026-06-02) : L183 `getByLabelText('Mois de référence')` casse (mois-ancre masqué en mensuel) → corrigé en Task 5. Le bloc `cadence.*` est purement **additif**.

---

### Task 1 : i18n — bloc `app.charges.cadence` (fr-BE référence)

**Files:**

- Modify: `messages/fr-BE.json` (dans l'objet `app.charges`, après `paymentDayHint` L713)

- [ ] **Step 1 : Ajouter le bloc `cadence` dans fr-BE** (après la clé `"paymentDayHint": ...,`)

```json
"cadence": {
  "frequencyLabel": "Fréquence",
  "dayLabel": "Jour du mois",
  "anchorMonthLabel": "À partir de",
  "lastDayOption": "Dernier jour du mois",
  "daySummaryLast": "dernier jour",
  "summaryMonthly": "Prélevé le {day} de chaque mois",
  "summaryRecurring": "Prélevé le {day} : {months}"
},
```

> `frequencyLabel` et `dayLabel` réutilisent volontairement « Fréquence » / « Jour du mois » (mêmes textes que les clés existantes) pour que `getByLabelText(/jour du mois/i)` et `getByLabelText('Fréquence')` restent verts.

- [ ] **Step 2 : Vérifier le JSON valide**

Run: `npm run typecheck` (next-intl type-checke les messages) — Expected: 0 erreur. Si erreur JSON → corriger la virgule.

- [ ] **Step 3 : Mirror sur les 4 autres locales via le skill i18n-translator**

Invoquer le skill `i18n-translator` pour propager le bloc `cadence` (mêmes clés) dans `en.json`, `nl-BE.json`, `de-DE.json`, `es-ES.json`, en respectant le glossaire. EN prod-visible doit être soigné ; nl/de/es alignés glossaire. Placeholders `{day}` / `{months}` **identiques** dans toutes les locales.

- [ ] **Step 4 : Audit parité**

Invoquer le skill `i18n-audit` → parité clés + placeholders OK sur 5 locales.

- [ ] **Step 5 : Commit**

```bash
git add messages/
git commit -m "i18n(charges): add app.charges.cadence keys (THI-301)"
```

---

### Task 2 : Composant `CadenceField` (TDD)

**Files:**

- Create: `src/app/[locale]/app/charges/CadenceField.tsx`
- Test: `src/app/[locale]/app/charges/__tests__/CadenceField.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// src/app/[locale]/app/charges/__tests__/CadenceField.test.tsx
import { render, screen, fireEvent, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';
import messages from '../../../../../../messages/fr-BE.json';
import { CadenceField, type CadenceValue } from '../CadenceField';

function renderField(value: CadenceValue, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="fr-BE" messages={messages}>
      <CadenceField idPrefix="t" value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

const monthly: CadenceValue = { frequency: 'monthly', dueMonth: 1, paymentDay: 15 };
const quarterly: CadenceValue = { frequency: 'quarterly', dueMonth: 3, paymentDay: 15 };

describe('<CadenceField />', () => {
  it('hides the anchor-month select when monthly', () => {
    renderField(monthly);
    expect(screen.queryByTestId('t-month')).toBeNull();
    expect(screen.getByTestId('t-day')).toBeInTheDocument();
    expect(screen.getByTestId('t-frequency')).toBeInTheDocument();
  });

  it('shows an editable anchor-month select when non-monthly', () => {
    renderField(quarterly);
    expect(screen.getByTestId('t-month')).toBeInTheDocument();
  });

  it('renders the monthly summary line', () => {
    renderField(monthly);
    expect(screen.getByTestId('t-summary')).toHaveTextContent('Prélevé le 15 de chaque mois');
  });

  it('renders the recurring summary with computed months (quarterly anchored March)', () => {
    renderField(quarterly);
    // paymentMonthsFromFrequency('quarterly', 3) → [3,6,9,12] → mars, juin, sept., déc.
    expect(screen.getByTestId('t-summary')).toHaveTextContent('mars, juin, sept., déc.');
  });

  it('exposes a "Dernier jour du mois" option that emits paymentDay=31', () => {
    const onChange = renderField(monthly);
    fireEvent.change(screen.getByTestId('t-day'), { target: { value: '31' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'monthly', dueMonth: 1, paymentDay: 31 });
  });

  it('shows "dernier jour" in the summary when paymentDay is 31', () => {
    renderField({ frequency: 'monthly', dueMonth: 1, paymentDay: 31 });
    expect(screen.getByTestId('t-summary')).toHaveTextContent(
      'Prélevé le dernier jour de chaque mois',
    );
  });

  it('emits the new frequency on change', () => {
    const onChange = renderField(monthly);
    fireEvent.change(screen.getByTestId('t-frequency'), { target: { value: 'annual' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'annual', dueMonth: 1, paymentDay: 15 });
  });

  it('emits the new anchor month on change (non-monthly)', () => {
    const onChange = renderField(quarterly);
    fireEvent.change(screen.getByTestId('t-month'), { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'quarterly', dueMonth: 6, paymentDay: 15 });
  });

  it('associates each select with a <label> (a11y)', () => {
    renderField(quarterly);
    expect(screen.getByLabelText('Fréquence')).toBe(screen.getByTestId('t-frequency'));
    expect(screen.getByLabelText('Jour du mois')).toBe(screen.getByTestId('t-day'));
    expect(screen.getByLabelText('À partir de')).toBe(screen.getByTestId('t-month'));
  });
});
```

- [ ] **Step 2 : Lancer le test → échec**

Run: `npm run test -- CadenceField` — Expected: FAIL (module `../CadenceField` introuvable).

- [ ] **Step 3 : Implémenter le composant**

```tsx
// src/app/[locale]/app/charges/CadenceField.tsx
'use client';

import { useTranslations } from 'next-intl';

import { paymentMonthsFromFrequency } from '@/lib/domain/charges';
import type { ChargeFrequency } from '@/lib/domain/types';

export interface CadenceValue {
  frequency: ChargeFrequency;
  /** 1-12 anchor month. Ignored (and hidden) when frequency is monthly. */
  dueMonth: number;
  /** 1-31. The value 31 is presented as "Dernier jour du mois". */
  paymentDay: number;
}

interface CadenceFieldProps {
  /** Required: prefixes both the a11y ids and the data-testids. MUST be unique
   *  per instance on a page (create vs edit) to avoid duplicate DOM ids. */
  idPrefix: string;
  value: CadenceValue;
  onChange: (next: CadenceValue) => void;
  disabled?: boolean;
}

const FREQUENCIES: readonly ChargeFrequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const NUMERIC_DAYS = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
const LAST_DAY = 31;

// Native <select> mirroring the Ankora form-control contract 1:1
// (src/components/ui/input.tsx:52,65,66 + select.tsx). `ankora-form-control-16`
// is the iOS auto-zoom guard (16px !important) — MANDATORY: native <select> on
// iOS Safari auto-zooms < 16px exactly like inputs, which is the whole reason we
// go native. Focus = single brand-600 border, no ring (DS "un signal pas deux").
// Tokens used MUST exist in globals.css: border-border, bg-card, brand-500/600.
// There is NO --color-input nor --color-ring in this DS.
const selectClass =
  'ankora-form-control-16 border-border bg-card text-foreground h-10 w-full rounded-lg border px-3 py-2 shadow-sm transition-colors hover:border-brand-500/40 focus-visible:border-brand-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

export function CadenceField({ idPrefix, value, onChange, disabled }: CadenceFieldProps) {
  const t = useTranslations('app.charges.cadence');
  const tFreq = useTranslations('common.frequency');
  const tMonths = useTranslations('common.months');
  const tMonthsShort = useTranslations('common.monthsShort');

  const isMonthly = value.frequency === 'monthly';
  const freqId = `${idPrefix}-frequency`;
  const dayId = `${idPrefix}-day`;
  const monthId = `${idPrefix}-month`;

  const daySummary = value.paymentDay === LAST_DAY ? t('daySummaryLast') : String(value.paymentDay);

  const summary = isMonthly
    ? t('summaryMonthly', { day: daySummary })
    : t('summaryRecurring', {
        day: daySummary,
        months: paymentMonthsFromFrequency(value.frequency, value.dueMonth)
          .map((m) => tMonthsShort(String(m) as '1'))
          .join(', '),
      });

  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-field`}>
      <div className="flex flex-col gap-2">
        <label htmlFor={freqId} className="text-sm font-medium">
          {t('frequencyLabel')}
        </label>
        <select
          id={freqId}
          data-testid={`${idPrefix}-frequency`}
          className={selectClass}
          value={value.frequency}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, frequency: e.target.value as ChargeFrequency })}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {tFreq(f)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-2">
          <label htmlFor={dayId} className="text-sm font-medium">
            {t('dayLabel')}
          </label>
          <select
            id={dayId}
            data-testid={`${idPrefix}-day`}
            className={selectClass}
            value={value.paymentDay}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, paymentDay: Number(e.target.value) })}
          >
            {NUMERIC_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value={LAST_DAY}>{t('lastDayOption')}</option>
          </select>
        </div>

        {!isMonthly && (
          <div
            className="flex min-w-32 flex-1 flex-col gap-2"
            data-testid={`${idPrefix}-month-wrap`}
          >
            <label htmlFor={monthId} className="text-sm font-medium">
              {t('anchorMonthLabel')}
            </label>
            <select
              id={monthId}
              data-testid={`${idPrefix}-month`}
              className={selectClass}
              value={value.dueMonth}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, dueMonth: Number(e.target.value) })}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {tMonths(String(m) as '1')}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs" data-testid={`${idPrefix}-summary`}>
        {summary}
      </p>
    </div>
  );
}
```

> Note : pas d'import `cn` — `selectClass` est une constante statique (aucune classe conditionnelle). Le contrat de classe est aligné 1:1 sur `src/components/ui/input.tsx` (vérifié plan-reviewer 2026-06-02).

- [ ] **Step 4 : Lancer le test → succès**

Run: `npm run test -- CadenceField` — Expected: PASS (9 tests).

- [ ] **Step 5 : typecheck + lint**

Run: `npm run typecheck && npm run lint` — Expected: 0 erreur.

- [ ] **Step 6 : Commit**

```bash
git add "src/app/[locale]/app/charges/CadenceField.tsx" "src/app/[locale]/app/charges/__tests__/CadenceField.test.tsx"
git commit -m "feat(charges): CadenceField unified cadence picker (THI-301)"
```

---

### Task 3 : Câbler `CadenceField` dans le form create (`ChargesClient`)

**Files:**

- Modify: `src/app/[locale]/app/charges/ChargesClient.tsx`

- [ ] **Step 1 : Importer le composant** (après la ligne d'import du ChargeEditDrawer, L26)

```tsx
import { CadenceField } from './CadenceField';
```

- [ ] **Step 2 : Remplacer les 3 `<div>` (frequency L336-350 + dueMonth L351-365 + paymentDay L366-379)** par un seul bloc :

```tsx
<div className="md:col-span-2">
  <CadenceField
    idPrefix="create-charge"
    value={{
      frequency,
      dueMonth: Number(dueMonth),
      paymentDay: Number(paymentDay),
    }}
    onChange={(next) => {
      setFrequency(next.frequency);
      setDueMonth(String(next.dueMonth));
      setPaymentDay(String(next.paymentDay));
    }}
  />
</div>
```

> L'état parent (`frequency`, `dueMonth: string`, `paymentDay: string`) et la logique `onCreate` (`Number(dueMonth)`, `paymentMonthsFromFrequency(frequency, parsedDueMonth)`) restent **inchangés** — la conversion se fait à la frontière du composant.

- [ ] **Step 3 : Nettoyer les imports désormais inutiles dans le form**

Si `Select/SelectContent/SelectItem/SelectTrigger/SelectValue`, `Label`, `MONTH_KEYS`, `tMonths` ne sont plus utilisés ailleurs dans `ChargesClient` (vérifier : `tMonths` reste utilisé ? `Label` reste utilisé par le champ Libellé/Montant ? `Select` ?), retirer uniquement ceux réellement orphelins. **Vérifier par `npm run lint`** (no-unused-vars) plutôt que supposer.

- [ ] **Step 4 : typecheck + lint**

Run: `npm run typecheck && npm run lint` — Expected: 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/[locale]/app/charges/ChargesClient.tsx"
git commit -m "feat(charges): wire CadenceField into create form (THI-301)"
```

---

### Task 4 : Câbler `CadenceField` dans le drawer edit (`ChargeEditDrawer`)

**Files:**

- Modify: `src/app/[locale]/app/charges/ChargeEditDrawer.tsx`

- [ ] **Step 1 : Importer le composant** (après l'import `cn` L23)

```tsx
import { CadenceField } from './CadenceField';
```

- [ ] **Step 2 : Remplacer les 3 blocs (frequency L219-233 + dueMonth L234-248 + paymentDay L249-262)** par :

```tsx
<CadenceField
  idPrefix="edit-charge"
  value={{
    frequency,
    dueMonth: Number(dueMonth),
    paymentDay: Number(paymentDay),
  }}
  disabled={isPending}
  onChange={(next) => {
    setFrequency(next.frequency);
    setDueMonth(String(next.dueMonth));
    setPaymentDay(String(next.paymentDay));
  }}
/>
```

> `submit()` lit toujours `Number(dueMonth)` / `Number(paymentDay)` + `paymentMonthsFromFrequency` — inchangé. Les `useId` `dueMonthId`/`paymentDayId`/`frequencyId` deviennent inutilisés → les retirer (Step 3).

- [ ] **Step 3 : Retirer les `useId` orphelins + imports `Select/Label` si inutilisés**

Retirer `frequencyId`, `dueMonthId`, `paymentDayId` (L69-70 + frequencyId). Vérifier via `npm run lint` quels imports (`Select*`, `Label`, `Input`) restent utilisés (Label/Input restent pour libellé+montant) et retirer les orphelins seulement.

- [ ] **Step 4 : typecheck + lint**

Run: `npm run typecheck && npm run lint` — Expected: 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/[locale]/app/charges/ChargeEditDrawer.tsx"
git commit -m "feat(charges): wire CadenceField into edit drawer (THI-301)"
```

---

### Task 5 : Mettre à jour le test existant `ChargesClient.test.tsx`

**Files:**

- Modify: `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx`

- [ ] **Step 1 : Corriger l'assertion « Mois de référence » (L183) — 2e break (plan-reviewer)**

Le form create défaut `monthly` → `CadenceField` rend `isMonthly === true` → le select mois-ancre **n'est pas monté** (et son libellé serait « À partir de », jamais « Mois de référence »). Donc `getByLabelText('Mois de référence')` (L183) lève. Remplacer :

```tsx
expect(screen.getByLabelText('Mois de référence')).toBeInTheDocument();
```

par (le mois-ancre est volontairement masqué en mensuel ; on vérifie la ligne de résumé du composant) :

```tsx
expect(screen.getByTestId('create-charge-summary')).toBeInTheDocument();
```

> Voisins verts : `getByLabelText('Fréquence')` (L182) + `getByLabelText(/jour du mois/i)` (L184, L221) tiennent (libellés `cadence.frequencyLabel`/`cadence.dayLabel` = « Fréquence »/« Jour du mois ») ; parité locale (L365-407) tient car `paymentDayLabel`/`paymentDayHint` conservés.

- [ ] **Step 2 : Adapter le sélecteur edit-drawer (L258)**

Remplacer :

```tsx
expect(screen.getByTestId('charge-edit-payment-day')).toHaveValue(5);
```

par :

```tsx
expect(screen.getByTestId('edit-charge-day')).toHaveValue('5');
```

> Native `<select>` → `toHaveValue` renvoie la string `'5'`. Le test create (L216-232) ne change que label/amount/day → `paymentMonths=[1..12]` et `paymentDay=15` tiennent.

- [ ] **Step 3 : Lancer toute la suite charges**

Run: `npm run test -- charges` — Expected: PASS (CadenceField + ChargesClient).

- [ ] **Step 4 : Commit**

```bash
git add "src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx"
git commit -m "test(charges): update edit-drawer day selector for CadenceField (THI-301)"
```

---

### Task 6 : Démo design-playground (QA visuelle locale)

**Files:**

- Create: `src/app/[locale]/design-playground/_components/demos/CadenceFieldDemo.tsx`
- Modify: `src/app/[locale]/design-playground/page.tsx`

- [ ] **Step 1 : Créer la démo**

```tsx
// src/app/[locale]/design-playground/_components/demos/CadenceFieldDemo.tsx
'use client';
import * as React from 'react';

import { CadenceField, type CadenceValue } from '@/app/[locale]/app/charges/CadenceField';

export function CadenceFieldDemo(): React.JSX.Element {
  const [value, setValue] = React.useState<CadenceValue>({
    frequency: 'monthly',
    dueMonth: 1,
    paymentDay: 15,
  });
  return (
    <div style={{ maxWidth: 420 }}>
      <CadenceField idPrefix="demo-cadence" value={value} onChange={setValue} />
      <pre style={{ marginTop: 16, fontSize: 12 }}>{JSON.stringify(value)}</pre>
    </div>
  );
}
```

- [ ] **Step 2 : Enregistrer la démo dans `page.tsx`**

Ajouter l'import (après L16) :

```tsx
import { CadenceFieldDemo } from './_components/demos/CadenceFieldDemo';
```

Ajouter l'entrée au tableau `ATOMS` (après la dernière entrée L38) :

```tsx
  { id: 'cadence-field', name: '12 — CadenceField (THI-301)', Demo: CadenceFieldDemo },
```

- [ ] **Step 3 : typecheck + lint**

Run: `npm run typecheck && npm run lint` — Expected: 0 erreur.

- [ ] **Step 4 : QA visuelle Chrome local**

Run: `npm run dev`, ouvrir Chrome sur `http://localhost:3000/design-playground` (desktop + émulation iPhone). Vérifier : mensuel masque le mois ; passage trimestriel affiche le mois + résumé « mars, juin, sept., déc. » ; option « Dernier jour du mois » → JSON `paymentDay:31` + résumé « Prélevé le dernier jour ». Light + dark.

- [ ] **Step 5 : Commit**

```bash
git add "src/app/[locale]/design-playground/"
git commit -m "chore(playground): CadenceField demo (THI-301)"
```

---

### Task 7 : QA agents + DoD final

- [ ] **Step 1 : Agents QA ciblés (voie lourde, par ce que le diff touche)**

- `ui-auditor` (nouveaux selects natifs, labels, contraste tokens, mobile-first)
- `mobile-ios-auditor` (selects natifs iOS, focus rings, tap targets ≥ 44px, safe-area)
- `i18n-auditor` (bloc `cadence` × 5 locales, placeholders `{day}`/`{months}`)
- `test-runner` (Vitest + e2e charges)

- [ ] **Step 2 : Gates Ankora**

Run: `npm run typecheck && npm run lint && npm run lint:use-server && npm run test` — Expected: tout vert. Puis `npm run e2e -- charges` (ou laisser la CI) — Expected: parcours charges OK.

- [ ] **Step 3 : Pousser la branche + ouvrir la PR**

```bash
git push -u origin feat/thi-301-cadence-field
gh pr create --fill --base main
```

- [ ] **Step 4 : DoD (mémoire `feedback_dod_sequence_canonical`)**

CI 6 checks verts · Sourcery inline vide sur le dernier commit · review threads résolus · `mergeStateStatus CLEAN` · live-test @thierry. Puis squash-merge + cleanup branche.

---

## Self-Review (writing-plans)

**1. Spec coverage** : §3 architecture → Task 2 ; §4 comportement (Dernier jour, summary, mois masqué/éditable) → Task 2 tests + impl ; §5 frontière domaine (aucun calcul date UI) → le composant n'importe que `paymentMonthsFromFrequency` (pur, lecture seule), ne touche pas `next-due-date` ✅ ; §6 scope (create+edit, i18n, playground, pas de schéma) → Tasks 1/3/4/6 ; §7 DoD → Task 7. Couvert.

**2. Placeholder scan** : aucun TBD/TODO ; code complet par step ; seul point « ouvert » = nettoyage d'imports orphelins, résolu **par `npm run lint`** (vérification factuelle, pas devinette) — explicitement instruit, pas un placeholder.

**3. Type consistency** : `CadenceValue.frequency: ChargeFrequency` (= type domaine consommé par `paymentMonthsFromFrequency`) cohérent entre composant, démo et call-sites ; `idPrefix` requis et unique (`create-charge` / `edit-charge` / `demo-cadence` / `t`) → pas de collision d'`id`/testid ; `paymentDay=31` ⇔ « Dernier jour » cohérent entre option, summary et tests.

**Risque résiduel** : faible. `selectClass` aligné 1:1 sur le contrat form-control canonique (`input.tsx`/`select.tsx`, incl. `ankora-form-control-16` anti-zoom iOS) → `ui-auditor`/`mobile-ios-auditor` valident en confirmation, pas en correction. Le reste est mécanique.

---

## Amendements plan-reviewer (2026-06-02)

🟡 APPROVED WITH CHANGES → corrigés dans ce document :

1. **2e break de test** (L183 `getByLabelText('Mois de référence')`) ajouté en Task 5 Step 1.
2. **`selectClass`** réécrit sur le contrat Ankora (`ankora-form-control-16 border-border bg-card … rounded-lg hover:border-brand-500/40 focus-visible:border-brand-600`) — fini `border-input`/`bg-background`/`ring-ring` (tokens inexistants) + garde anti-zoom iOS restaurée.
3. **Import `cn` mort** retiré du composant.
4. **`min-w-[8rem]` → `min-w-32`** (canonique, linter).

Re-soumission à plan-reviewer requise avant code.
