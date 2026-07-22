# ADR-021 — Engagements dans le cockpit (effort lissé fini)

- **Statut** : Proposé (2026-07-21)
- **Contexte épic** : « Dettes & échéanciers » — suite de PR-1/2/3 (mergées). Cette
  ADR couvre l'intégration des engagements au calcul cockpit (ce que PR-3 avait
  volontairement laissé de côté : la carte affiche, mais le hero ignore).
- **Décideurs** : @thierry (décision métier validée 2026-07-21), @cc-ankora (modélisation)
- **Agents QA voie lourde** : `plan-reviewer` (gate pré-code), `financial-formula-validator`,
  `i18n-auditor`, `dashboard-ux-auditor`, `ui-auditor`, `test-runner`

---

## Contexte & problème

Le Hero « Situation du mois » ([`situation-mois.ts`](../../src/lib/domain/cockpit/situation-mois.ts))
calcule son chiffre-héros ainsi :

```
Reste disponible = revenus − charges fixes − provisions lissées
```

Les **engagements** (dettes à solde restant, échéanciers finis type SPF, factures
ponctuelles futures) n'entrent **nulle part** dans ce calcul :
[`page.tsx:104-113`](../../src/app/[locale]/app/page.tsx) ne passe que `charges` à
`calculerSituationDuMois`. Résultat : le Hero affiche « Reste disponible = X »
sans déduire la mensualité du crédit voiture, alors que la carte « Mes engagements »
juste en dessous annonce « 250 € dus ce mois ». **Le même écran donne deux versions
contradictoires** de la situation de l'utilisateur. C'est un défaut de cohérence
_numérique_ (correctness financière), pas cosmétique — repérable immédiatement par
un utilisateur habitué à son tableur Coda.

## Décision (validée @thierry 2026-07-21)

**Lisser les mensualités d'engagements actifs dans l'effort mensuel du cockpit,
exactement comme les charges périodiques sont lissées ; exclure les factures
ponctuelles (one-off) du chiffre mensuel.**

Précisément, un engagement contribue au reste disponible du mois `ref` **ssi** :

1. `isActive` **et** `installmentsTotal > 1` — une échéance unique est un
   paiement ponctuel (tous les one-off ont `installmentsTotal = 1` par contrainte
   DB `commitments_one_off_single`, et un `debt`/`installment_plan` à échéance
   unique est économiquement un one-off) : ce n'est pas une charge récurrente et
   il reste visible uniquement dans la carte « Mes engagements » ;
2. non **soldé** (toutes les échéances cochées ⇒ contribution 0 — un crédit
   remboursé par anticipation ne pèse plus) ;
3. la période `ref` tombe dans la fenêtre `[première échéance, dernière échéance]`.

Sa contribution mensuelle = `installmentAmount / cycleMonths` (mensualité de
600 €/trimestre ⇒ 200 €/mois lissés), **miroir per-mois** de
`provisionsMensuellesLissees` — mais **pas un miroir exact sur la vie** de
l'engagement : une charge périodique est perpétuelle (le lissage conserve les
euros), un engagement est **fini**, donc la fenêtre `[première, dernière échéance]`
tronque le dernier cycle de `cycleMonths − 1` mois (600 €/trim × 4 couvre 10 mois,
200 × 10 = 2000 lissés vs 2400 réellement dus). Le Hero n'affiche qu'**un seul
mois** : la valeur mensuelle (200) est le bon effort du mois, l'UI reste honnête.
La troncature n'a d'effet que pour les fréquences **non mensuelles** (mensuel ⇒
`cycleMonths = 1`, aucune troncature — c'est le cas de la majorité : crédit
voiture, arrangement SPF). Hors fenêtre ou soldé ⇒ 0, donc la charge **disparaît
automatiquement** le mois qui suit la dernière échéance (le bug « comptée à
l'infini » ne peut pas exister par construction). `financial-formula-validator`
confirme que la troncature de queue (non-mensuel) est acceptée.

### Pourquoi pas les autres options

- **Tout lisser, one-off inclus** (lissage d'un one-off sur les mois jusqu'à
  échéance) : plus « juste » comptablement mais un montant qui apparaît puis
  disparaît du mensuel surprend l'utilisateur ; reporté (pourra devenir une
  option provisionnement plus tard).
- **Ne rien changer** : laisse le « Reste disponible » optimiste/faux dès qu'un
  crédit court — ne résout pas le problème de cohérence signalé.

## Conséquences

- ✅ Hero et carte « Mes engagements » racontent enfin la même histoire.
- ✅ Le `statut` vert/orange/rouge devient honnête : un crédit qui fait passer
  sous zéro bascule le statut, ce qui déclenche le nudge FSMA-safe existant.
- ⚠️ Asymétrie assumée (identique aux charges) : le Hero montre le **lissé**
  (200 €/mois), la carte montre le **réel dû ce mois** (600 € au trimestre).
  C'est la convention cockpit établie (ADR-009), pas une nouvelle incohérence.
- ⚠️ Les one-off ne pèsent pas sur le mensuel — trade-off explicite, documenté.
- Aucune migration DB, aucun changement de schéma, aucune dépendance. Extension
  d'un pattern existant (lissage ADR-009), pas un nouveau pattern architectural.

## Frontière Decimal / number (rappel doctrine)

Le domaine commitments reste en `number` (compte fixe d'échéances identiques,
cf. en-tête [`schedule.ts`](../../src/lib/domain/commitments/schedule.ts)). La
conversion en `Decimal` se fait **à la frontière cockpit** (`new Decimal(installmentAmountOf(c))`)
pour que la division du lissage reste exacte et homogène avec le reste du cockpit.
Le `Decimal` ne traverse jamais la frontière RSC : la page convertit via
`.toNumber()` avant de passer au Hero (comme les autres chiffres).

---

## Plan d'implémentation (TDD, voie lourde)

PR unique `feat/engagements-cockpit` (~200-260 lignes, < plafond 600). Ordre strict.

### Task 0 — Phase 0 & hygiène de branche (avant tout code)

1. **Model check** : Opus 4.8 actif + `.claude/settings.local.json` épingle
   `"model": "claude-opus-4-8"`. Si non-Opus → STOP.
2. **Branche propre depuis `origin/main` à jour** — surtout **PAS** depuis
   `feat/commitments-cockpit` (branche post-squash périmée qui porte du WIP non
   lié : `M docs/handoffs/2026-07-19-…md`, `M public/llms-full.txt`). Parquer ces
   2 fichiers (stash) → arbre propre → `git fetch origin` →
   `git switch -c feat/engagements-cockpit origin/main`.

### Task 1 — Domaine : `engagementsMensuelsLisses` (pur, testé isolément)

**Fichiers**

- Créer : `src/lib/domain/cockpit/engagements-lisses.ts`
- Créer : `src/lib/domain/cockpit/__tests__/engagements-lisses.test.ts`

**API**

```ts
import Decimal from 'decimal.js';
import { CYCLE_MONTHS, type ReferencePeriod } from './types';
import { installmentAmountOf, isFinished, type Commitment } from '../commitments';

const ordinal = (year: number, month: number): number => year * 12 + (month - 1);
const EMPTY: ReadonlySet<string> = new Set();

/**
 * Un engagement fini pèse-t-il sur le mois `ref` ? (ADR-021, règles 1-3)
 *
 * `installmentsTotal === 1` (⊇ tous les one-off) est exclu : un paiement unique
 * n'est pas une charge mensuelle récurrente. La fenêtre est en arithmétique
 * d'ordinaux (année*12 + mois−1) — équivalent prouvé au dernier élément de
 * `installmentPeriods` (offset = start + (total−1)·step) — pour éviter d'allouer
 * le tableau des échéances par ligne (Sourcery #233). `isFinished` (seule
 * allocation restante) n'est évalué qu'une fois, uniquement si la fenêtre matche.
 */
export function engagementPeseSurMois(
  c: Commitment,
  paidKeys: ReadonlySet<string>,
  ref: ReferencePeriod,
): boolean {
  if (!c.isActive || c.installmentsTotal === 1) return false;
  const step = CYCLE_MONTHS[c.frequency];
  const start = ordinal(c.startYear, c.startMonth);
  const end = start + (c.installmentsTotal - 1) * step;
  const cur = ordinal(ref.year, ref.month);
  if (cur < start || cur > end) return false;
  return !isFinished(c, paidKeys);
}

/** Σ des mensualités lissées des engagements actifs (paiements uniques exclus). */
export function engagementsMensuelsLisses(
  commitments: readonly Commitment[],
  paidKeysByCommitment: ReadonlyMap<string, ReadonlySet<string>>,
  ref: ReferencePeriod,
): Decimal {
  return commitments.reduce((acc, c) => {
    const paidKeys = paidKeysByCommitment.get(c.id) ?? EMPTY;
    if (!engagementPeseSurMois(c, paidKeys, ref)) return acc;
    return acc.plus(new Decimal(installmentAmountOf(c)).dividedBy(CYCLE_MONTHS[c.frequency]));
  }, new Decimal(0));
}
```

**Cas de test (≥ 90 % lignes/fonctions domaine)** — utiliser des `Commitment` littéraux :

1. crédit mensuel 250 €/mois (installmentsTotal 17), ref dans la fenêtre, aucune coche → 250.
2. échéancier trimestriel 600 €/trim (installmentsTotal 4), ref dans la fenêtre → 200 (lissage /3).
3. one-off (kind `one_off`, installmentsTotal 1) dû ce mois → 0 (exclu).
4. **debt à échéance unique non mensuelle** (kind `debt`, installmentsTotal 1,
   frequency `annual`, totalAmount 1200) dû ce mois → **0** (exclu — surtout PAS
   1200/12 = 100 ; edge du fallback `installmentAmountOf`).
5. engagement soldé (toutes échéances cochées) → 0.
6. **fenêtre finie trimestrielle** : quarterly 600 € × 4 ancré (2026,1) → 200 en
   janv./avr./juil./oct. 2026 (les 4 échéances) ET **0 en (2027,1)**, le mois qui
   suit la dernière échéance (pin de la sémantique de fenêtre + non-infini).
7. ref **avant** la première échéance (engagement futur pas commencé) → 0.
8. engagement inactif → 0.
9. deux engagements actifs (250 mensuel + 200 trimestriel lissé) → 450 (agrégation).
10. ledger absent pour un id (`.get` → undefined) → traité comme non-coché, pas de crash.

### Task 2 — Domaine : brancher dans `calculerSituationDuMois`

**Fichier** : Modifier `src/lib/domain/cockpit/situation-mois.ts`

- `SituationDuMoisInput` += `engagementsMensuels: Decimal` (calculé par la page).
- `SituationDuMois` += `engagementsMensuels: Decimal`.
- Recalcul :

```ts
const engagementsMensuels = input.engagementsMensuels;
const resteDisponible = capac.resteDisponible.minus(engagementsMensuels);
const capacite = resteDisponible.minus(input.budgetVieCourante);
```

- `statut` utilise le **nouveau** `resteDisponible` / `capacite` :
  ```ts
  } else if (resteDisponible.lt(0)) { statut = 'rouge'; }
  else if (capacite.lt(0) || !provisionsAJour) { statut = 'orange'; }
  ```
- Retour : `resteDisponible`, `capacite` recalculés + `engagementsMensuels`.
  `capaciteEpargneReelle` **reste inchangé** (charges-only) — aucune ripple sur
  ses autres call-sites ; l'ajustement engagements vit dans la situation.

**Champ requis (décision explicite)** : `engagementsMensuels: Decimal` est
**requis** (pas de default silencieux à 0 dans le domaine — un oubli de wiring
côté page doit casser à la compilation, pas se masquer). Conséquence : les **8
appels** existants de `calculerSituationDuMois` dans `situation-mois.test.ts` et
le call-site unique `page.tsx` doivent passer la valeur.

**Non-régression (preuve forte)** : les 8 tests existants reçoivent
`engagementsMensuels: new Decimal(0)` **sans changer une seule assertion**. Ce
run resté 100 % vert EST la preuve de non-régression (plus solide que le seul cas
`=0` isolé). Nouveaux tests ajoutés :

- engagements > 0 fait baisser `resteDisponible` et `capacite` du bon montant.
- engagements poussant `resteDisponible < 0` → statut `rouge`.
- engagements poussant `capacite < 0` (mais resteDisponible ≥ 0) → statut `orange`.

### Task 3 — Export

**Fichier** : Modifier `src/lib/domain/cockpit/index.ts` → exporter
`engagementsMensuelsLisses`, `engagementPeseSurMois`.

### Task 4 — UI Hero : ligne waterfall + segment barre

**Fichier** : Modifier `src/components/dashboard/SituationDuMoisHero.tsx`

- Prop `engagementsMensuels: number`.
- `FlowRow` inséré **après** provisions, **avant** le total « Reste disponible »,
  affiché seulement si `engagementsMensuels > 0` :
  ```tsx
  {
    props.engagementsMensuels > 0 && (
      <FlowRow
        label={t('flow.engagements')}
        value={`− ${fmt(props.engagementsMensuels)}`}
        muted
        dotClass="bg-<token>"
      />
    );
  }
  ```
- `AllocationBar` : segment `engagements` (après `provisions`) quand > 0, fill =
  token sémantique distinct de info/brand-500/accent-400/success. **Vérifier
  `globals.css` pour un token existant** (candidat : une teinte violette/neutre) ;
  **aucun nouveau token sans validation** — sinon réutiliser `--color-muted-foreground`.
- `barAria` : ajouter `{engagements}` dans les 5 locales ; dégrader proprement
  quand 0 (segment omis) — trancher le wording exact avec `ui-auditor`.
- Nudge `rouge` : `obligations` inclut désormais les engagements
  (`chargesFixes + provisionsLissees + engagementsMensuels`).

**Tests** : `SituationDuMoisHero.test.tsx` — ligne engagements visible si > 0,
absente si 0 ; `resteDisponible` affiché = valeur passée.

### Task 5 — i18n (5 locales)

**Fichier** : `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json`

- Nouvelle clé `dashboard.situation.flow.engagements` (« Engagements » / « Commitments » / …).
- `dashboard.situation.barAria` : ajouter le placeholder `{engagements}`.
- Parité stricte des clés + intégrité placeholders → `i18n-auditor`.

### Task 6 — Wiring page

**Fichier** : Modifier `src/app/[locale]/app/page.tsx`

```ts
import { engagementsMensuelsLisses } from '@/lib/domain/cockpit';
import { commitmentRowToDomain } from '@/lib/data/commitment-row';
// ...
const commitmentLedger = new Map(
  Object.entries(paidKeysByCommitment).map(([id, keys]) => [id, new Set(keys)]),
);
const engagementsMensuels = engagementsMensuelsLisses(
  commitments.map(commitmentRowToDomain),
  commitmentLedger,
  snapshot.currentPeriod,
);
```

Passer `engagementsMensuels` à `calculerSituationDuMois({ ..., engagementsMensuels })`
et au Hero via `engagementsMensuels={situation.engagementsMensuels.toNumber()}`.

### Task 7 — QA + rapport + DoD5

Gates locaux verts : `npm run typecheck`, `npm run lint`, `npm run lint:use-server`,
`npm run test`. Puis agents QA ciblés : `financial-formula-validator` (Task 1-2),
`dashboard-ux-auditor` + `ui-auditor` (Task 4), `i18n-auditor` (Task 5),
`test-runner`.

**Rapport PR obligatoire** : créer `docs/prs/PR-engagements-cockpit-report.md`
(preuve de chaque critère).

**DoD5 énumérée (aucune tâche DONE sans les 5)** :

1. Tous les checks CI verts (Lint, Typecheck, Tests, E2E, Security, Build).
2. Sourcery silencieux sur le **dernier** commit (aucun commentaire inline actif,
   aucune review non résolue) — vérif via `gh api …/comments`.
3. Reviews humaines approuvées/résolues.
4. Pas de conflit avec `main` (`mergeStateStatus: CLEAN`).
5. Rapport final livré à @thierry avec preuve de chaque critère.

## Risques & garde-fous

- **Ripple `capaciteEpargneReelle`** : évitée — on n'y touche pas, l'ajustement
  est confiné à la situation.
- **Frontière Decimal/number** : conversion à la frontière cockpit uniquement.
- **A11y de la barre** : segment + aria à valider par `ui-auditor` (risque WCAG
  si contraste du nouveau token insuffisant — cf. incident danger #dc2626).
- **Non-régression** : `engagementsMensuels = 0` doit reproduire exactement la
  sortie actuelle (test dédié Task 2).
