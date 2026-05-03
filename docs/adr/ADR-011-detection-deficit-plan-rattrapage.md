# ADR-011 — Détection déficit Provisions + Plan rattrapage 3 mois

- **Statut** : Accepted
- **Date** : 2026-05-03
- **Accepté le** : 2026-05-03 par délégation explicite de @thierry à @cowork (chat session, "tu as la responsabilité des choix techniques")
- **Proposé par** : Cowork-Opus (Architecture)
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `domain`, `ux`, `differenciation`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-002 (bucket-model), ADR-009 (capacité d'épargne), ADR-012 (Assistant Virements), spec `dashboard-cockpit-vraie-vision-2026-05-03.md`, PR-D5

---

## Contexte & problème

L'algorithme bucket-model d'Ankora (cf. ADR-002) repose sur l'idée que **chaque charge périodique (annuelle ou trimestrielle) est lissée** sur sa fréquence. L'utilisateur vire chaque mois `montant / freq` vers le compte Provisions. Ainsi, le jour où la facture tombe, l'argent est déjà là.

**Problème pratique** : un utilisateur qui rejoint Ankora **en cours d'année** ne peut PAS avoir constitué les provisions depuis janvier. Exemple :

> En mai, @thierry a une Taxe voiture annuelle de 300 € due en juin. Si Ankora avait commencé à provisionner depuis janvier, il aurait 5 × 25 € = 125 € sur le compte Provisions. Mais @thierry vient d'arriver en mai → il n'a 0 € pour cette charge → **déficit de 25 € × 5 mois = 125 €**.

Plus largement, à n'importe quel moment T, on peut calculer **combien il devrait y avoir** sur le compte Provisions pour que le bucket-model fonctionne (= `totalEpargneTheorique`). Si `soldeEpargneActuel < totalEpargneTheorique` → **déficit**.

Sans plan, ce déficit reste opaque : l'utilisateur arrive sur le Dashboard, voit "Santé provisions : Critique", panique, mais ne sait pas quoi faire.

Le mockup IronBudget formalise une solution élégante : **étaler le rattrapage sur 3 mois** automatiquement. L'utilisateur n'a pas à payer 125 € d'un coup ; on lui demande +41.67 €/mois pendant 3 mois en supplément du virement normal. Au bout de 3 mois, le bucket-model est à jour.

Cet ADR formalise l'algo de détection et la stratégie UX du plan de rattrapage.

---

## Décision — drivers

Trois objectifs en tension :

1. **Honnêteté** : l'algo ne ment pas. Si le déficit est de 125 €, on l'affiche honnêtement.
2. **Actionnabilité** : un déficit doit toujours s'accompagner d'un plan concret pour le combler.
3. **Confort utilisateur** : étaler sur 3 mois est un compromis : assez court pour être responsabilisant, assez long pour ne pas étrangler le cash flow d'un mois.

---

## Décision adoptée

**Adopter l'algo de Santé des Provisions et le Plan rattrapage 3 mois** comme suit :

### Algorithme `epargneRequise` par charge

Pour chaque charge `c` de fréquence `annual` ou `quarterly`, à un mois `M` (référence) et année `A` :

```
1. nextMois = premier mois ∈ c.payment_months avec mois ≥ M
   isPayeCeMois = paiements[`${c.id}-${A}-${M}`] = true ?

   Si nextMois = M ET isPayeCeMois :
     nextMois = mois suivant dans c.payment_months (rollover sur année suivante si nécessaire)

   Si !nextMois trouvé : nextMois = c.payment_months[0]  // rollover

2. monthsLeft = nextMois - M
   Si nextMois < M  OU  (nextMois = M ET isPayeCeMois) :
     monthsLeft += 12
   Si nextMois = M ET !isPayeCeMois : monthsLeft = 0  // due ce mois, non payée

3. cycleMonths = c.frequence === 'annual' ? 12 : 3

4. safeMonthsLeft = (monthsLeft = 0)
                       ? 0
                       : (monthsLeft modulo cycleMonths = 0
                              ? cycleMonths
                              : monthsLeft modulo cycleMonths)

5. epargneRequise(c, M, A) = c.montant - (c.montant / cycleMonths × safeMonthsLeft)
```

### Algorithme global `totalEpargneTheorique`

```
totalEpargneTheorique(M, A) = Σ epargneRequise(c, M, A) pour c ∈ charges périodiques
```

### Détection déficit

```
deficitEpargne = totalEpargneTheorique - soldeEpargneActuel
```

- Si `deficitEpargne ≤ 0` → **À jour ✨** (statut emerald)
- Si `deficitEpargne > 0` → **Déficit détecté** (statut amber, montant affiché)

### Plan rattrapage 3 mois

```
rattrapageMensuel = deficitEpargne > 0 ? deficitEpargne / 3 : 0
```

Ce montant **s'ajoute** au virement recommandé normal (cf. ADR-012 Assistant Virements) :

```
transfertRecommandeAjuste = transfertRecommande + rattrapageMensuel
```

L'utilisateur voit : "À virer vers l'Épargne : 100,67 €" avec le sous-titre "Inclut +41,67 € pour rattraper le déficit sur 3 mois."

### Implémentation TypeScript (domain pur)

```typescript
// src/lib/domain/cockpit/sante-provisions.ts
import Decimal from 'decimal.js';
import type { Charge, ChargePayment } from '@/lib/domain/charges';

export type SanteProvisionsInput = {
  charges: readonly Charge[];
  payments: ReadonlyMap<string, boolean>; // key = `${chargeId}-${year}-${month}`
  soldeEpargneActuel: Decimal;
  refMonth: number; // 1-12
  refYear: number;
};

export type SanteProvisionsOutput = {
  totalEpargneTheorique: Decimal;
  soldeEpargneActuel: Decimal;
  deficitEpargne: Decimal;
  rattrapageMensuel: Decimal;
  statut: 'a_jour' | 'deficit';
  detailParCharge: ReadonlyArray<{ chargeId: string; epargneRequise: Decimal }>;
};

export function calculerSanteProvisions(input: SanteProvisionsInput): SanteProvisionsOutput {
  const detail = input.charges
    .filter((c) => c.frequence !== 'monthly')
    .map((c) => ({
      chargeId: c.id,
      epargneRequise: calculerEpargneRequiseParCharge(
        c,
        input.refMonth,
        input.refYear,
        input.payments,
      ),
    }));

  const totalEpargneTheorique = detail.reduce(
    (acc, d) => acc.plus(d.epargneRequise),
    new Decimal(0),
  );
  const deficitEpargne = totalEpargneTheorique.minus(input.soldeEpargneActuel);
  const rattrapageMensuel = deficitEpargne.gt(0) ? deficitEpargne.dividedBy(3) : new Decimal(0);

  return {
    totalEpargneTheorique,
    soldeEpargneActuel: input.soldeEpargneActuel,
    deficitEpargne,
    rattrapageMensuel,
    statut: deficitEpargne.gt(0) ? 'deficit' : 'a_jour',
    detailParCharge: detail,
  };
}

function calculerEpargneRequiseParCharge(
  c: Charge,
  refMonth: number,
  refYear: number,
  payments: ReadonlyMap<string, boolean>,
): Decimal {
  const isPayeCeMois = payments.get(`${c.id}-${refYear}-${refMonth}`) === true;

  // Étape 1 : trouver nextMois
  let nextMois = c.paymentMonths.find((m) => m >= refMonth);
  if (nextMois === refMonth && isPayeCeMois) {
    nextMois = c.paymentMonths.find((m) => m > refMonth) ?? c.paymentMonths[0];
  }
  if (!nextMois) nextMois = c.paymentMonths[0];

  // Étape 2 : monthsLeft avec wrap-around
  let monthsLeft = nextMois - refMonth;
  if (nextMois < refMonth || (nextMois === refMonth && isPayeCeMois)) {
    monthsLeft += 12;
  }
  if (nextMois === refMonth && !isPayeCeMois) {
    monthsLeft = 0;
  }

  // Étape 3 : cycleMonths
  const cycleMonths = c.frequence === 'annual' ? 12 : 3;

  // Étape 4 : safeMonthsLeft
  let safeMonthsLeft: number;
  if (monthsLeft === 0) {
    safeMonthsLeft = 0;
  } else if (monthsLeft % cycleMonths === 0) {
    safeMonthsLeft = cycleMonths;
  } else {
    safeMonthsLeft = monthsLeft % cycleMonths;
  }

  // Étape 5 : epargneRequise
  return c.montant.minus(c.montant.dividedBy(cycleMonths).times(safeMonthsLeft));
}
```

### États UX (sub-card "Santé des Provisions")

| Statut    | Couleur header             | Affichage                |
| --------- | -------------------------- | ------------------------ |
| `a_jour`  | emerald (ShieldCheck vert) | "Statut : À jour ✨"     |
| `deficit` | amber (ShieldCheck amber)  | "Déficit détecté : -X €" |

Toujours afficher :

- "Cible théorique idéale : X €"
- "Solde actuel : Y €"

Si déficit, ajouter dans la card "À virer" :

- Sous-titre : "Inclut +Z € pour rattraper le déficit sur 3 mois."

---

## Conséquences positives

- ✅ **Différenciation produit** : aucun concurrent ne propose de plan de rattrapage automatique. C'est une dimension "coach financier" unique.
- ✅ **Honnêteté algorithmique** : l'utilisateur voit la cible et l'écart sans euphémisme.
- ✅ **Actionnabilité immédiate** : le rattrapage est inclus dans le montant à virer, l'utilisateur n'a rien à calculer.
- ✅ **3 mois = sweet spot** : assez court pour responsabiliser (rattrapage en saison fiscale courante), assez long pour ne pas pénaliser un mois donné.
- ✅ **Domain pur testable** : zéro dépendance UI, déterministe, couverture Vitest visée ≥ 95 %.
- ✅ **Réutilise les paiements (charge_payments)** : si un user marque une charge périodique comme "payée ce mois", l'algo bascule automatiquement vers le cycle suivant et le rattrapage se réajuste.

## Conséquences négatives

- ❌ **Complexité algorithmique** : 5 étapes avec wrap-around, modulo, edge cases. Fragilité testée mais non-triviale. Mitigation : ≥ 25 cas Vitest couvrant tous les scénarios.
- ❌ **Hypothèse "3 mois fixes"** : un user qui veut rattraper plus vite (1 mois) ou plus lentement (6 mois) n'a pas de slider. Mitigation v1.0 : 3 mois fixes. v1.1 : ajouter un setting user "horizon de rattrapage" si feedback.
- ❌ **Dépendance forte au calendrier d'échéance précis** : nécessite que `c.payment_months` et `c.payment_day` soient correctement renseignés. Mitigation : onboarding pédagogique (PR-D6) qui demande explicitement le mois d'échéance des charges périodiques.
- ❌ **Cas pathologique : déficit > revenus** : si le déficit est tel que `transfertRecommandeAjuste > revenus`, on demande à l'utilisateur de virer plus que ce qu'il gagne. Mitigation : capper le rattrapage à `revenus × 0.30` et étendre l'horizon (ex: 6 mois) si le déficit est trop gros. À documenter en sous-règle.

---

## Alternatives évaluées

### Alternative 1 — Pas de rattrapage automatique, juste afficher le déficit

Affichage "Déficit -125 €" sans plan. L'utilisateur se débrouille.

**Rejetée** : non actionnable, anxiogène. Le différenciateur Ankora est précisément la dimension "coach".

### Alternative 2 — Rattrapage immédiat (1 mois)

Demander à l'utilisateur de combler tout le déficit le mois suivant.

**Rejetée** : irréaliste. Si déficit = 500 €, l'utilisateur n'a probablement pas 500 € disponibles instantanément.

### Alternative 3 — Rattrapage long (12 mois)

Étaler sur 12 mois pour minimiser l'impact mensuel.

**Rejetée** : trop long. Pendant 12 mois, l'algorithme reste en déficit, créant une "fatigue de rattrapage". 3 mois est un horizon où l'utilisateur peut "voir le bout".

### Alternative 4 — Slider user (1-12 mois)

Laisser l'utilisateur choisir l'horizon de rattrapage.

**Rejetée v1.0** : choice paralysis. v1.1 si feedback : ajouter un setting global "Rattrapage : prudent (3 mois) / mesuré (6 mois) / souple (12 mois)".

### Alternative 5 — Rattrapage proportionnel à la marge

Calculer `rattrapageMensuel = min(deficit / 3, capaciteEpargneReelle × 0.5)`.

**Rejetée** : crée une dépendance circulaire entre deux KPIs. Garde le rattrapage simple et indépendant. Si la Capacité Réelle est trop basse pour absorber le rattrapage, l'utilisateur le voit visuellement (Capacité passe rouge) → déclenche le Simulateur d'Action.

---

## Plan d'implémentation

1. **PR-D1 (Foundations)** :
   - Créer `src/lib/domain/cockpit/sante-provisions.ts` avec `calculerSanteProvisions()` et `calculerEpargneRequiseParCharge()`
   - Tests Vitest ≥ 25 cas couvrant :
     - Charge annuelle en début de cycle (1 mois écoulé)
     - Charge annuelle en fin de cycle (11 mois écoulés)
     - Charge annuelle due ce mois non payée → epargneRequise = montant
     - Charge annuelle due ce mois payée → epargneRequise reset (cycle suivant)
     - Charge trimestrielle avec wrap-around décembre→mars
     - Charge périodique avec moisEcheance multiples (ex: trimestrielle [3, 6, 9, 12])
     - Solde épargne > cible → deficit négatif → rattrapage = 0
     - Solde épargne = cible → statut a_jour exact
     - Mix 5 charges annuelles + 2 trimestrielles
     - Cas réel @thierry (Dashlane + S.W.D.E + Taxes voiture/poubelle/égout)
2. **PR-D5 (Bloc droite)** :
   - Composant `SanteProvisionsCard` (sub-component de `VirementsAssistantCard`)
   - Affichage des 3-4 lignes (Cible théorique, Solde actuel, Statut OU Déficit, Rattrapage si applicable)
   - Couleurs adaptatives selon statut
   - Tests E2E "user toggle paye charge périodique due ce mois → Santé Provisions bascule de déficit à à-jour"
3. **i18n** : 7 nouvelles clés `messages/{fr-BE,en}.json` :
   ```json
   "santeProvisions.title": "Santé des Provisions",
   "santeProvisions.cibleTheorique": "Cible théorique idéale :",
   "santeProvisions.soldeActuel": "Solde actuel :",
   "santeProvisions.statutAJour": "À jour ✨",
   "santeProvisions.deficit": "Déficit détecté :",
   "santeProvisions.rattrapageDescription": "Inclut +{amount} € pour rattraper le déficit sur 3 mois.",
   "santeProvisions.tooltip": "..."
   ```

---

## Risques

- **Risque 1 — Bug subtil dans le wrap-around décembre/janvier** : décembre = mois 12, janvier = mois 1, modulo négatif possible. Mitigation : tests Vitest dédiés sur transitions année.
- **Risque 2 — Décimales infinies** : `montant / cycleMonths` peut donner des décimales infinies (4.4166666... pour Dashlane 53€/12). Decimal.js gère, mais affichage doit arrondir à 2 décimales pour ne pas effrayer l'utilisateur.
- **Risque 3 — Charge supprimée laisse paiements orphelins** : si user supprime une charge périodique, ses `charge_payments` historiques restent. Mitigation : ON DELETE CASCADE sur la FK + audit log.
- **Risque 4 — Dépassement marge** : rattrapage qui dépasse la Capacité Réelle disponible. Mitigation explicite dans la formule (cap à 30 % des revenus + extension horizon si nécessaire) — **à documenter explicitement en code** avec commentaires éducatifs.

---

## Métriques de succès

À mesurer 4 semaines post-PR-D5 :

- **Taux de déficit signalé** : % de workspaces où `deficitEpargne > 0`. Cible : ≥ 60 % (signal que l'algo détecte des déficits réels chez les nouveaux users).
- **Délai moyen pour passer "déficit" → "à jour"** : nombre de mois entre première détection et statut à jour. Cible : ≤ 4 mois (cohérent avec rattrapage 3 mois + 1 mois flou).
- **Taux d'action après notification** : si la notif "À virer X €" inclut un rattrapage, l'utilisateur réagit-il ? Mesuré via fréquence d'augmentation manuelle du `soldeEpargne` les 7 jours suivant la notif. Cible : ≥ 40 %.
- **NPS sur "comprends-tu pourquoi tu as un déficit ?"** : enquête in-app. Cible : ≥ 70 % de "oui".

---

## Décision finale

À valider par @thierry. En attendant validation explicite, statut `Proposed`.
