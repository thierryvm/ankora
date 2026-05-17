# Diagnostic préparatoire — THI-190 Health score provisions gauge (lecture seule)

**Date** : 2026-05-17
**Agent** : @cc-ankora (Opus 4.7)
**Scope** : compréhension spec UX + inventaire technique + options d'implémentation. **Aucune ligne de code écrite.**
**Bloqueur amont** : THI-189 (frontière atoms vs ui) — la décision Option C influe sur l'option d'impl retenue.
**Décideurs** : @cowork (priorisation Beta) + @thierry (validation merge).

---

## TL;DR exécutif (10 lignes)

1. **Le domain layer existe déjà et est complet** : `src/lib/domain/cockpit/sante-provisions.ts` (156 lignes, ADR-011 mentionnée) + **31 cas de tests Vitest** dans `__tests__/sante-provisions.test.ts`. L'API `calculerSanteProvisions()` retourne tout ce dont l'UI a besoin : `{totalEpargneTheorique, soldeEpargneActuel, deficitEpargne, rattrapageMensuel, statut, detailParCharge}`.
2. **Aucune nouvelle migration Supabase requise**. Les tables `charges`, `accounts`, `charge_payments` existent déjà et sont câblées via `getWorkspaceSnapshot()` + `toCockpitCharges()`.
3. **Aucune nouvelle dépendance npm requise**.
4. **Le ticket THI-190 est essentiellement un travail UI** : créer 1 composant Server Component `ProvisionHealthGaugeCard.tsx`, l'ajouter à `src/app/[locale]/app/page.tsx`, ajouter clés i18n `dashboard.santeProvisions.*` × 5 locales.
5. **Statut UX = binaire** dans la spec canonique (`a_jour | deficit`), mais le mot "gauge" du Linear suggère une représentation visuelle proportionnelle (solde/cible). Le composant `atoms/ProgressBar` (CD#3) avec mode `split` ou `tone` forcé est parfait pour ça.
6. **Tension frontière atoms vs ui (lien direct THI-189)** : les dashboard cards existants (`EffortFinancierCard`, `CapaciteEpargneCard`) utilisent `ui/card` (shadcn). Si ce composant utilise `atoms/ProgressBar`, ce sera **le premier cross-import atoms→ui de la codebase**. C'est aligné avec Option C THI-189 (frontière fonctionnelle) mais doit être documenté dans l'ADR.
7. **3 options d'implémentation** documentées plus bas, recommandation **Option A** (Server Component, pattern `EffortFinancierCard`, `ui/card` wrapper + `atoms/ProgressBar` jauge).
8. **Effort estimé Option A** : 0.5-1 jour (UI + i18n × 5 locales + tests Vitest snapshot + invocation `dashboard-ux-auditor`).
9. **Pré-requis avant exécution** : THI-189 mergée (ADR frontière atoms/ui) + sortie fenêtre sas 48h post-19/05.
10. **Pas de bloqueur découvert** : aucune table manquante, aucun helper domain manquant, aucune dette technique nouvelle.

---

## 1. Spec UX résumée (source : vault Athenaeum)

**Source** : [`specs/dashboard-cockpit-vraie-vision-2026-05-03.md`](file://C:/Users/thier/iCloudDrive/iCloud~md~obsidian/Athenaeum/10_Projects/ankora/specs/dashboard-cockpit-vraie-vision-2026-05-03.md), section 4 + section 5.

### 1.1 Formule canonique (ADR-011, déjà implémentée dans `sante-provisions.ts`)

```
Pour chaque charge périodique active c (annual / quarterly / semiannual) :
  nextMois = premier mois ∈ c.paymentMonths avec mois ≥ moisActuel
  isPayeCeMois = payments.get(paymentKey(c.id, year, month))

  Si nextMois = moisActuel ET isPayeCeMois :
    nextMois = mois suivant (avec rollover sur paymentMonths[0])

  monthsLeft = nextMois - moisActuel
  Si nextMois < moisActuel OU (nextMois = moisActuel ET isPayeCeMois) :
    monthsLeft += 12
  Si nextMois = moisActuel ET !isPayeCeMois : monthsLeft = 0

  cycleMonths = 12 (annual) | 6 (semiannual) | 3 (quarterly)
  safeMonthsLeft = monthsLeft = 0 ? 0
                                  : (monthsLeft mod cycleMonths = 0 ? cycleMonths : monthsLeft mod cycleMonths)

  epargneRequise = c.montant - (c.montant / cycleMonths × safeMonthsLeft)

totalEpargneTheorique = Σ(epargneRequise)
deficitEpargne = totalEpargneTheorique - soldeEpargneActuel
rattrapageMensuel = deficitEpargne > 0 ? deficitEpargne / 3 : 0
statut = deficitEpargne > 0 ? 'deficit' : 'a_jour'
```

### 1.2 Affichage UX prévu (spec section 2 droite + section 4 et 5)

- **Statut textuel** : `À jour ✨` ou `Déficit -X €`.
- **Cible théorique idéale** affichée (`totalEpargneTheorique`).
- **Solde actuel** affiché (`soldeEpargneActuel`).
- **Plan rattrapage 3 mois** : si `rattrapageMensuel > 0`, libellé `Inclut +X € pour rattraper le déficit sur 3 mois`.
- **Détail item-par-item** : liste des charges périodiques avec leur `epargneRequise` (Dashlane +4.42 €, S.W.D.E +15 €, etc.).
- **Placement initial spec** : sub-card de "Assistant Virements" (section 2 col droite). Linear THI-190 dit "section 2 sur 8 cockpit v3" → peut-être promotion en section autonome.

### 1.3 Seuils visuels — extrapolation justifiée

La spec parle de statut binaire (`a_jour | deficit`) mais le **mot "gauge"** du Linear suggère une représentation visuelle proportionnelle. Proposition :

| Ratio `solde / cible` | Couleur (token)    | Libellé                       |
| --------------------- | ------------------ | ----------------------------- |
| `≥ 1.0`               | `success` (vert)   | `À jour ✨`                   |
| `≥ 0.75`              | `warning` (orange) | `Quasi à jour (déficit -X €)` |
| `< 0.75`              | `danger` (rouge)   | `Déficit critique -X €`       |

À valider par @cowork (peut diverger du `statut` binaire du domain).

---

## 2. Inventaire technique factuel

### 2.1 Domain layer (status : ✅ COMPLET)

| Fichier                                                     | Lignes           | Status                                                                                                                  |
| ----------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/cockpit/sante-provisions.ts`                | 156              | ✅ Livré, ADR-011 cité                                                                                                  |
| `src/lib/domain/cockpit/__tests__/sante-provisions.test.ts` | (31 cas)         | ✅ Livré                                                                                                                |
| `src/lib/domain/cockpit/index.ts`                           | barrel           | ✅ Re-export ligne 15                                                                                                   |
| `src/lib/domain/cockpit/types.ts`                           | (types partagés) | ✅ Existants (`CockpitCharge`, `PaymentLedger`, `ReferencePeriod`, `CYCLE_MONTHS`, `paymentKey`, `isPeriodicFrequency`) |

**API exportée** :

```ts
export type SanteProvisionsInput = Readonly<{
  charges: readonly CockpitCharge[];
  payments: PaymentLedger;
  soldeEpargneActuel: Decimal;
  ref: ReferencePeriod;
}>;

export type SanteProvisionsOutput = Readonly<{
  totalEpargneTheorique: Decimal;
  soldeEpargneActuel: Decimal;
  deficitEpargne: Decimal;
  rattrapageMensuel: Decimal;
  statut: 'a_jour' | 'deficit';
  detailParCharge: readonly SanteProvisionsDetailEntry[];
}>;

export function calculerSanteProvisions(input: SanteProvisionsInput): SanteProvisionsOutput;
export const RATTRAPAGE_MONTHS = 3;
```

### 2.2 Data flow (status : ✅ DISPONIBLE)

Le fichier `src/lib/data/workspace-snapshot.ts` fournit déjà tout ce qu'il faut :

- `getWorkspaceSnapshot()` → renvoie `accounts`, `charges`, `monthlyExpenses`, etc.
- `toCockpitCharges(snapshot.charges)` → adapte au format `CockpitCharge[]` du domain.
- Le `provisions` account (type `'provisions'`) contient `soldeEpargneActuel`.
- `charge_payments` table existe et est lue par le snapshot → utilisable pour construire `PaymentLedger`.

**À vérifier en implémentation** : le snapshot expose-t-il déjà `payments: PaymentLedger` au composant ? Si non, ajouter un helper `toPaymentLedger(snapshot.chargePayments)`. **C'est probablement la seule petite addition data** nécessaire pour câbler le composant.

### 2.3 Composants UI existants (patterns à reproduire)

| Composant                 | Type                   | Pattern utilisé                                                                | Utilise atoms/ ? | Utilise ui/ ?               |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------ | ---------------- | --------------------------- |
| `EffortFinancierCard.tsx` | Server Component async | `Card` shadcn + lucide icon + `getTranslations` + `formatCurrency`             | ❌               | ✅ (`@/components/ui/card`) |
| `CapaciteEpargneCard.tsx` | Server Component async | idem                                                                           | ❌               | ✅ (`@/components/ui/card`) |
| `AccountCard.tsx`         | Server Component       | idem                                                                           | ❌               | ✅ (`@/components/ui/card`) |
| `atoms/ProgressBar.tsx`   | Server Component       | Classes `atm-pbar-*` + auto-tone (warning > 0.85, danger > 1.0) + mode `split` | ✅ (lui-même)    | —                           |

**Convention dashboard actuelle** : `ui/card` (shadcn) + lucide icons + tokens semantic (`--color-info`, `--color-success`). Aucun atom utilisé pour l'instant dans les cards prod.

### 2.4 i18n

| Locale | Fichier               | Clés `dashboard.santeProvisions.*` existantes |
| ------ | --------------------- | --------------------------------------------- |
| fr-BE  | `messages/fr-BE.json` | À vérifier — probablement absentes            |
| nl-BE  | `messages/nl-BE.json` | À ajouter                                     |
| en     | `messages/en.json`    | À ajouter                                     |
| de-DE  | `messages/de-DE.json` | À ajouter                                     |
| es-ES  | `messages/es-ES.json` | À ajouter                                     |

**À ajouter (~10 clés)** : title, statusAJour, statusDeficit, cibleLabel, soldeLabel, rattrapageHint, detailHeader, emptyState, etc.

Note: rappel CLAUDE.md projet — **v1.0 publique = FR + EN seulement**. NL/DE/ES annoncées sur `/roadmap` mais livrées post-launch. **Mais le projet maintient déjà parité 5 locales** (cf. routing.ts + existing translations), donc à confirmer avec @cowork si on garde 5 ou on dégrade à 2 pour Beta.

### 2.5 Tests existants modèles

- Domain : pattern `it.each()` Vitest dans `sante-provisions.test.ts` (31 cas).
- UI : pas de tests Vitest pour `EffortFinancierCard.tsx` / `CapaciteEpargneCard.tsx` aujourd'hui (Server Components testés indirectement via E2E + snapshot).

---

## 3. Options d'implémentation

### Option A ⭐ — Server Component reproduisant le pattern dashboard existant (RECOMMANDÉE)

**Principe** : créer `src/components/dashboard/ProvisionHealthGaugeCard.tsx` selon le pattern `EffortFinancierCard.tsx` (Server Component async), utilisant `ui/card` comme wrapper et `atoms/ProgressBar` comme jauge visuelle.

**Composition** :

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/atoms'; // ← premier cross-import atoms→ui
import { calculerSanteProvisions } from '@/lib/domain/cockpit';
import { ShieldHalf } from 'lucide-react'; // icône dédiée
// ... Server Component async, identique pattern Effort/Capacité
```

**Pros** :

- Pattern dashboard cohérent (3e card au même format que les 2 existantes).
- Réutilise `atoms/ProgressBar` (livré, testé) sans réécrire.
- Server Component → zéro JS shippé au client.
- Domain prêt → 100% du calcul est `await getWorkspaceSnapshot()` → `calculerSanteProvisions()`.
- Aligné avec Option C de THI-189 (frontière fonctionnelle, atoms = primitives Ankora utilisables comme building blocks dans les composants ui-wrapped).

**Cons** :

- **Premier cross-import atoms→ui de la codebase** : doit être explicitement autorisé par l'ADR THI-189 (Option C l'autorise, mais à formaliser).
- Mélange visuel léger : `ui/card` (shadcn tokens) + `atoms/ProgressBar` (classes `atm-pbar-*`). Cohérence à vérifier via `dashboard-ux-auditor`.

**Effort estimé** : **0.5-1 jour** :

- Composant : ~80 lignes (clone EffortFinancierCard pattern).
- i18n 5 locales : 10 clés × 5 = 50 lignes JSON.
- Câblage `src/app/[locale]/app/page.tsx` : +5 lignes.
- Helper `toPaymentLedger()` si manquant : +15 lignes.
- Tests Vitest snapshot (optionnel, pattern existant) : +30 lignes.
- Agents QA : `dashboard-ux-auditor` + `ui-auditor` + `i18n-auditor`.

**Fichiers impactés** : **5-6**

- `src/components/dashboard/ProvisionHealthGaugeCard.tsx` (nouveau)
- `src/app/[locale]/app/page.tsx` (modif intégration)
- `messages/{fr-BE,nl-BE,en,de-DE,es-ES}.json` (5 fichiers)
- Optionnel : `src/lib/data/workspace-snapshot.ts` (ajout `toPaymentLedger`)

**Risque** : **faible**. Domain testé. Patron répliqué. Aucune nouvelle dépendance.

---

### Option B — Composant 100% atoms/ (CD#3 strict)

**Principe** : utiliser `atoms/Card` (CD#3) + `atoms/ProgressBar` + `atoms/Chip` pour le statut. Pas de `ui/card`.

**Pros** :

- Cohérence 100% CD#3.
- Aligné avec une future migration "tout atoms/" (Option B THI-189).

**Cons** :

- **Diverge du pattern dashboard existant** (Effort/Capacité utilisent `ui/card`). Incohérence visuelle au sein du même cockpit.
- Si Option C THI-189 retenue (recommandée), ce choix est contre-doctrine (la frontière dit : `ui/` = wrappers infrastructure, `atoms/` = primitives).
- `atoms/Card` a une API monolithique (`tone | padding | elevation`) qui ne match pas la composition `<CardHeader><CardTitle>` utilisée par les autres cards dashboard.
- Devra être refait quand cohérence visuelle exigée.

**Effort estimé** : **0.5-1 jour** (même volume mais avec friction esthétique).

**Risque** : **moyen** — divergence visuelle dans la grille dashboard, probable retravail.

---

### Option C — Custom SVG-based gauge (radial / arc)

**Principe** : ne pas réutiliser `ProgressBar`, dessiner une jauge radiale type "speedometer" en SVG pur.

**Pros** :

- Plus expressif visuellement (correspond mieux au mot "gauge").
- Aucune dépendance à `ProgressBar` → indépendant du débat atoms/ui.

**Cons** :

- Réinvention de la roue (linéaire suffit pour ce signal).
- Plus de code (~150 lignes SVG + tests).
- Aucun atom radial gauge dans CD#3 → introduction d'un pattern unique non systémique.
- A11y plus complexe (ARIA pour radial vs progressbar standard).
- Effort plus élevé pour gain UX marginal.

**Effort estimé** : **1.5-2 jours**.

**Risque** : **moyen** (a11y custom SVG, écart pattern dashboard).

---

## 4. Recommandation @cc-ankora

**Option A** pour les raisons suivantes :

1. **Aligné Option C THI-189 recommandée** (frontière fonctionnelle : `atoms/` = primitives réutilisables comme building blocks, `ui/` = wrappers infrastructure shadcn). Le cross-import `atoms/ProgressBar` dans un composant Server `ui/card`-wrapped est exactement le cas d'usage prévu par cette frontière.
2. **Pattern dashboard cohérent** : 3 cards (Effort / Capacité / Santé) au même format visuel.
3. **Effort minimal** : 0.5-1 jour, compatible Beta P1.
4. **Domain déjà livré et testé** : 0 risque côté calcul.
5. **Server Component** : zéro JS, parfait pour score Lighthouse cible.
6. **A11y standard** : `ProgressBar` a déjà l'ARIA `progressbar` correct.

**Plan d'exécution suggéré (post-THI-189 merge)** :

1. ✅ Vérifier que ADR THI-189 (Option C frontière) est signée → décision finale atoms/ui.
2. Créer branche `feat/thi-190-health-gauge-card`.
3. Créer `src/components/dashboard/ProvisionHealthGaugeCard.tsx` (pattern clone EffortFinancierCard).
4. Ajouter helper `toPaymentLedger()` dans `workspace-snapshot.ts` si absent.
5. Intégrer dans `src/app/[locale]/app/page.tsx` (3e card section radar OU section dédiée selon @cowork).
6. Ajouter clés i18n × 5 locales (ou × 2 si dégradation Beta validée).
7. Tests Vitest snapshot pour le composant.
8. Invoquer `dashboard-ux-auditor` + `ui-auditor` + `i18n-auditor`.
9. PR → review @thierry → merge.
10. Update ROADMAP : THI-190 ✅ → enchaîner THI-192 + THI-195.

**Pré-requis avant exécution** :

- ✅ Domain layer livré (déjà fait).
- ⏳ THI-189 mergée (ADR frontière atoms/ui).
- ⏳ Sortie fenêtre sas 48h post-mutuelle 19/05.
- ⏳ Confirmation @cowork : 5 locales ou dégradation Beta à 2 (FR + EN).

---

## 5. Données brutes vérifiées

**Méthode** : lecture spec vault Athenaeum + lecture domain layer + lecture composants dashboard + grep patterns.

- Spec : `dashboard-cockpit-vraie-vision-2026-05-03.md` (vault Athenaeum), section 4 + section 5 + section 2 droite.
- Domain : `src/lib/domain/cockpit/sante-provisions.ts` (156 lignes, fonctionnel).
- Tests domain : 31 cas Vitest (count via grep `^\s*(it|test)\(`).
- Pattern composant cible : `src/components/dashboard/EffortFinancierCard.tsx` (Server Component async, 80 lignes).
- ProgressBar atom : `src/components/atoms/ProgressBar.tsx` (Server Component, 80+ lignes, mode split).
- Workspace snapshot : `src/lib/data/workspace-snapshot.ts` (à inspecter pour vérif `payments`).
- ADR : `docs/adr/ADR-018-provisions-bidirectionnelles-audit-trail.md` (existant, lié), ADR-011 mentionnée dans le code (à vérifier existence).

---

## 6. Hors scope

- THI-192 (prochaines factures 7/14/30j) — autre ticket Beta P1, audit séparé sur demande.
- THI-195 (simulateur drawer) — autre ticket Beta P1.
- THI-191 / THI-193 / THI-194 (V1.0, pas Beta).
- Migration Supabase (aucune requise).
- Refactor `EffortFinancierCard` / `CapaciteEpargneCard` (hors scope).
- Décision dégradation 5→2 locales pour Beta (à valider par @cowork avant exécution).

---

## 7. STOP conditions évaluées

- ✅ **Spec canonique trouvée** : vault Athenaeum `specs/dashboard-cockpit-vraie-vision-2026-05-03.md`.
- ✅ **Pas de dépendance bloquante** : domain prêt, data flow disponible, atoms livrés.
- ✅ **Diagnostic < 1h** : ~50 min écoulés.
- ✅ **Self-check fatigue** : OK. 3e Phase consécutive mais charge cognitive faible (diagnostics convergents, patterns familiers).

---

## 8. Prochaines actions proposées

1. **@cowork** lit ce diagnostic et arbitre Option A / B / C.
2. **@cowork** confirme : 5 locales ou 2 pour Beta ?
3. Si Option A retenue : planifier THI-190 exécution post-THI-189 merge (probablement entre 20 et 25 mai, fenêtre Beta P1).
4. **@cc-ankora** exécutera la PR sur signal @cowork — pas avant THI-189 mergée.

---

**Fin du diagnostic.** Aucune modification code. Working tree main inchangé (sauf création de ce fichier markdown + les 2 diagnostics précédents).
