# ADR-020 — Frontière canonique `atoms/` (identité visuelle CD#3) vs `ui/` (infrastructure Radix)

- **Statut** : Accepted
- **Date** : 2026-05-18
- **Accepté le** : 2026-05-18 par Thierry vanmeeteren (via délégation @cowork)
- **Proposé par** : @cowork (orchestration) + @cc-ankora (diagnostic factuel)
- **À accepter par** : Thierry vanmeeteren (Product Owner)
- **Deciders** : Thierry vanmeeteren, @cowork, @cc-ankora
- **Tags** : `architecture`, `design-system`, `components`, `frontier`
- **Portée** : Phase 1 (MVP) — débloque PR-D6/D7 (Beta cockpit v3 — 6 sections restantes)
- **Tracking Linear** : [THI-189](https://linear.app/thierryvm/issue/THI-189) (High priority)

> **Glossaire des handles** (@cowork, @cc-design, @cc-ankora, @thierry) — voir source canonique : [`docs/design/trio-agents.md`](../design/trio-agents.md).

---

## Contexte & problème

Le repo contient actuellement **deux dossiers de composants UI parallèles** dont la frontière n'est pas formellement documentée :

| Dossier                 | Composants                                                                                                        | Origine                                               | Tests           | Barrel           | Convention nommage |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------- | ---------------- | ------------------ |
| `src/components/atoms/` | 11 (Button, Card, Chip, Avatar, Drawer, ProgressBar, ColorPicker, IconPicker, Tabs, ThemeToggle, LangSwitcher)    | Claude Design Session #3 (mergée PR #147, 9 mai 2026) | 11 tests Vitest | ✅ `index.ts`    | PascalCase         |
| `src/components/ui/`    | 13 (breadcrumb, button, card, dialog, eyebrow, form, glass, input, label, num, row, select, sheet, switch, toast) | shadcn legacy (présent depuis PR-3b PR #67)           | 9 tests Vitest  | ❌ pas de barrel | lowercase          |

**Diagnostic factuel** (livré 2026-05-17 par @cc-ankora, `docs/audits/2026-05-17-thi-189-atoms-vs-ui-diagnostic.md`) :

1. **Ce n'est PAS une fragmentation accidentelle** : le plan `docs/plans/PR-D4-PHASE2-A.md` ligne 18 documente explicitement « Cohabitation temporaire : `src/components/ui/button.tsx` (shadcn legacy) reste, `src/components/atoms/Button.tsx` nouveau Ankora CD#3. Cleanup en PR-D / PR-D5 ». Le cleanup n'a jamais été exécuté.
2. **2 vrais doublons** sur 24 composants (~8 %) : `Button` et `Card`. APIs incompatibles : monolithique (atoms) vs composable Radix/cva (ui).
3. **0 cross-import** (atoms n'importe pas ui, et vice versa) → bonne nouvelle architecturale, pas de couplage caché.
4. **Distribution call-sites prod** :
   - `ui/` = 38 call-sites prod (très intégré)
   - `atoms/` = 14 call-sites (12 vitrine `/admin/_playground` + 2 prod réels : `AdminTopbar`, `LangSwitcherClient`)

**Impact bloquant** : les 6 sections cockpit v3 restantes (THI-190 Health gauge, THI-192 Prochaines factures, THI-195 Simulateur drawer, THI-191/193/194) sont bloquées tant que la frontière atoms/ vs ui/ n'est pas claire. Sans règle, chaque section va fragmenter encore plus le DS.

**Deadline critique** : 10 juin 2026 (Beta) — perte abonnement Pro Max x5 si non livré.

---

## Decision drivers

| Driver                               | Pourquoi c'est décisif                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Préserver le travail @cc-design CD#3 | 11 atoms CD#3 livrés 9 mai (PR #147) = identité visuelle Ankora figée. Jeter ce travail = perte design system canonique.                                       |
| Préserver l'accessibilité Radix      | `ui/` repose sur Radix UI pour Dialog, Form, Select, Sheet, Switch, Toast = a11y best-in-class (focus trap, ARIA, keyboard nav). Réécrire = risque a11y élevé. |
| Effort minimal vs deadline 10/06     | 24 jours restants. Toute solution > 2 jours d'effort prend trop de bande passante CC Ankora pour livrer Beta.                                                  |
| Reviewability + maintenabilité       | La frontière doit être lisible pour CC Ankora futur + @thierry. Pas de règle implicite à reconstituer.                                                         |
| Anti-régression future               | Sans règle ESLint, les nouvelles sections cockpit v3 vont créer encore des doublons.                                                                           |
| Budget 0 €                           | Aucune dépendance payante ajoutée (lint custom = ESLint déjà présent).                                                                                         |

---

## Considered options

### Option A — Tout migrer vers `ui/` (jeter `atoms/`)

**Pour** :

- Cohérence shadcn unique
- Pattern connu communauté

**Contre** :

- ❌ **Perte du design Claude Design CD#3** (11 atoms livrés 9 mai)
- ❌ Réécrire 11 composants pour reproduire l'identité visuelle CD#3 dans le pattern shadcn = 4-5 jours
- ❌ Pattern AnkButton (variants `primary` / `secondary` / `ghost` / `destructive`) vs shadcn (variants `default` / `secondary` / `ghost` / `destructive` / `outline` / `link`) = mapping non-trivial

**Effort** : 4-5 jours. **Risque** : Moyen (régression visuelle CD#3). **Rejet**.

### Option B — Tout migrer vers `atoms/` (réécrire infra Radix)

**Pour** :

- Cohérence atoms unique
- Pattern Ankora pur sans dépendance shadcn

**Contre** :

- ❌ **Réécrire Dialog, Form, Select, Sheet, Switch, Toast** sans Radix = risque a11y MAJEUR
- ❌ Focus trap, ARIA, keyboard navigation à réimplémenter from scratch
- ❌ Perte du pattern shadcn éprouvé communauté

**Effort** : 10-15 jours. **Risque** : Élevé (a11y, deadline 10/06). **Rejet**.

### Option C — Frontière fonctionnelle stricte + désambiguïsation ciblée ⭐

**Principe** : reconnaître que `atoms/` et `ui/` ne sont pas en concurrence — ils ont des rôles **complémentaires** :

- **`atoms/`** = **identité visuelle Ankora CD#3** (composants visuels purs, pas de Radix, look CD#3 verrouillé)
- **`ui/`** = **infrastructure form/feedback Radix** (composants stateful avec a11y Radix : Dialog, Form, Select, Sheet, Switch, Toast)

**Actions concrètes** :

1. Renommer `atoms/Button.tsx` → `atoms/AnkButton.tsx` (+ export `AnkButton`)
2. Renommer `atoms/Card.tsx` → `atoms/AnkCard.tsx` (+ export `AnkCard`)
3. Update `atoms/index.ts` barrel pour exporter `AnkButton` / `AnkCard`
4. Update tests Vitest existants (`__tests__/Button.test.tsx` → `AnkButton.test.tsx` + `__tests__/Card.test.tsx` → `AnkCard.test.tsx`)
5. Update les 2 call-sites prod actuels (`AdminTopbar`, `LangSwitcherClient`) si ils importent les renommés (à vérifier — ils n'utilisent probablement pas Button/Card directement)
6. Ajouter règle ESLint custom dans `eslint.config.mjs` : interdire `from '@/components/atoms/Button'` ou `from '@/components/atoms/Card'` (warn dev, error CI)
7. Documenter cet ADR-020 comme référence pour CC Ankora + futurs développeurs

**Pour** :

- ✅ Préserve le work design CD#3 (atoms/) figé 9 mai 2026
- ✅ Préserve l'infrastructure Radix de `ui/`
- ✅ Effort minimal **0.5-1 jour** (renommage + lint + barrel + tests)
- ✅ Risque faible (renommage mécanique + lint = 0 régression possible)
- ✅ Débloque PR-D6/D7 immédiatement (frontière claire pour les 6 sections)
- ✅ ADR documenté pour le futur (anti-régression)

**Effort** : 0.5-1 jour. **Risque** : Faible. **Recommandé**.

---

## Decision

**Option C retenue.**

**Pattern d'usage canonique** :

```typescript
// ✅ Identité visuelle Ankora — composants visuels CD#3 purs
import { AnkButton, AnkCard, Chip, ProgressBar, Avatar } from '@/components/atoms';

// ✅ Infrastructure form/feedback Radix-based
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
import { Form, FormField, FormItem } from '@/components/ui/form';
import { Select, SelectTrigger, SelectContent } from '@/components/ui/select';

// ✅ Composition idiomatique — atoms dans ui-wrapper
function HealthGaugeCard() {
  return (
    <Card>
      {/* Card de ui/ (shadcn) — wrapper standard */}
      <CardHeader>...</CardHeader>
      <CardContent>
        <ProgressBar value={75} tone="success" />
        {/* ProgressBar de atoms/ — identité visuelle CD#3 */}
      </CardContent>
    </Card>
  );
}
```

**Règle ESLint** (à ajouter dans `eslint.config.mjs`) :

```javascript
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['@/components/atoms/Button', '@/components/atoms/Card'],
          message: 'Use AnkButton or AnkCard from @/components/atoms instead (cf. ADR-020).',
        },
      ],
    }],
  },
}
```

---

## Conséquences positives

- ✅ Débloque immédiatement PR-D6/D7 (6 sections cockpit v3 restantes pour Beta 10/06)
- ✅ Préserve les deux investissements design (CD#3 atoms + Radix ui infrastructure)
- ✅ Effort minimal (0.5-1 jour) compatible deadline Beta
- ✅ Pattern réutilisable pour les composants futurs (chaque ajout va dans la « bonne » colonne selon son rôle)
- ✅ Anti-régression via lint rule (les futures sections cockpit ne peuvent pas créer de doublon)

## Conséquences négatives / risques

- ⚠️ Convention nommage hybride (PascalCase atoms/ vs lowercase ui/) — accepté pour ne pas exploser le scope migration
- ⚠️ Dépendance @radix-ui maintenue dans `ui/` (risque mineur : Radix est stable, communauté active)
- ⚠️ 2 imports à connaître au lieu d'1 — mitigation : ADR-020 visible + lint rule + docs trio-agents.md

## Plan de migration (à exécuter par @cc-ankora dans PR THI-189)

Branche : `feat/thi-189-atoms-canonical-frontier`

1. Renommer `atoms/Button.tsx` → `atoms/AnkButton.tsx` (+ export `AnkButton` au lieu de `Button`)
2. Renommer `atoms/Card.tsx` → `atoms/AnkCard.tsx` (+ export `AnkCard` au lieu de `Card`)
3. Update `atoms/index.ts` barrel
4. Renommer + update tests `atoms/__tests__/Button.test.tsx` → `AnkButton.test.tsx` + `Card.test.tsx` → `AnkCard.test.tsx`
5. Update `eslint.config.mjs` avec règle `no-restricted-imports` (cf. ci-dessus)
6. Vérifier les 2 call-sites prod (`AdminTopbar`, `LangSwitcherClient`) — si ils importent Button/Card, update vers AnkButton/AnkCard
7. Passer ce ADR-020 de Proposed → Accepted dans le même commit
8. Lancer agents QA : `ui-auditor` + `test-runner`
9. PR + review @thierry

**Effort estimé** : 0.5-1 jour (renommage mécanique + lint + tests).

## Refs

- Diagnostic source : `docs/audits/2026-05-17-thi-189-atoms-vs-ui-diagnostic.md`
- Plan migration interrompue documentée : `docs/plans/PR-D4-PHASE2-A.md` ligne 18
- Linear THI-189 : <https://linear.app/thierryvm/issue/THI-189>
- ADR-005 (PR-3a anticipée) — contexte design system socle
- Pattern @cc-ankora « co-décideur, pas exécutant » (CLAUDE.md global)
