# ADR-009 — Capacité d'Épargne Réelle (KPI hero du Dashboard)

- **Statut** : Accepted
- **Date** : 2026-05-03
- **Accepté le** : 2026-05-03 par délégation explicite de @thierry à @cowork (chat session, "tu as la responsabilité des choix techniques")
- **Proposé par** : Cowork-Opus (Architecture)
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `domain`, `ux`, `differenciation`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-002 (bucket-model), ADR-012 (Assistant Virements), spec `dashboard-cockpit-vraie-vision-2026-05-03.md`, PR-D3

---

## Contexte & problème

L'analyse concurrentielle 2026 (cf. `docs/research/competitive-fintech-2026.md`) montre que les leaders (Monarch, YNAB, Lunch Money, Linxo, Bankin') affichent tous un KPI hero centré sur le **mois courant** :

- Monarch : "Cash flow ce mois : +X €"
- YNAB : "Available to assign : X €"
- Lunch Money : "Net income this month : X €"
- Linxo / Bankin' : "Solde projeté fin de mois : X €"

Ce KPI est **court-termiste** et peut **mentir gravement** sur la santé financière long-terme : un mois où il n'y a pas de facture annuelle (ex: février) affiche un solde "magnifique" alors que la facture annuelle de mars (ex: 300 € de taxe voiture) va le faire chuter brutalement. L'utilisateur ressent un effet "yo-yo" qui érode la confiance.

Ankora a une promesse différenciatrice claire (cf. NORTH_STAR.md) : "**Ton ancrage financier — sans surprise**". Cette promesse exige un KPI qui :

1. **Lisse les charges périodiques** sur l'année (pour ne pas afficher de fausse aisance les mois sans facture annuelle).
2. **Soustrait le plafond Quotidien** (pas seulement les charges fixes) pour donner le **vrai reste** disponible une fois tout couvert.
3. Reste **lisible et émotionnel** (un seul nombre, vert ou rouge, message contextuel).

Le mockup IronBudget (cf. `dashboard-cockpit-vraie-vision-2026-05-03.md`) cristallise cette intuition en un KPI nommé **"Capacité d'Épargne Réelle"** avec le slogan : "C'est ton vrai reste à vivre chaque mois, sans surprise."

Cet ADR formalise la définition mathématique du KPI, son emplacement dans le code, sa stratégie de tests, et son comportement UX.

---

## Décision — drivers

Trois objectifs en tension :

1. **Différenciation produit** : aucun concurrent ne calcule ce KPI. C'est le **cœur de la promesse Ankora**.
2. **Honnêteté financière** : ne jamais afficher un nombre flatteur qui s'effondre 2 semaines plus tard. Chaque mois doit afficher le même KPI lissé tant que les charges/revenus ne changent pas.
3. **Compréhensibilité** : un seul nombre, vert ou rouge, message court. Pas de tableau Excel.

---

## Décision adoptée

**Adopter la formule canonique suivante**, calculée dans `src/lib/domain/cockpit.ts`, fonction `capaciteEpargneReelle()` :

### Formule

```
Capacité_Épargne_Réelle = Revenus_mensuels
                        - Total_Charges_Fixes_Mensuelles
                        - Provisions_Mensuelles_Lissées
                        - Plafond_Quotidien
```

Avec :

```
Total_Charges_Fixes_Mensuelles = Σ(charges où frequence = 'monthly') de leurs montants

Provisions_Mensuelles_Lissées = Σ(charges périodiques) avec :
  - frequence = 'annual'    → montant / 12
  - frequence = 'quarterly' → montant / 3
  - frequence = 'monthly'   → 0 (déjà compté)
```

### Implémentation TypeScript (domain pur)

```typescript
// src/lib/domain/cockpit.ts
import Decimal from 'decimal.js';
import type { Charge } from './charges';

export function totalChargesMensuelles(charges: readonly Charge[]): Decimal {
  return charges
    .filter((c) => c.frequence === 'monthly')
    .reduce((acc, c) => acc.plus(c.montant), new Decimal(0));
}

export function provisionsMensuellesLissees(charges: readonly Charge[]): Decimal {
  return charges.reduce((acc, c) => {
    if (c.frequence === 'annual') return acc.plus(c.montant.dividedBy(12));
    if (c.frequence === 'quarterly') return acc.plus(c.montant.dividedBy(3));
    return acc;
  }, new Decimal(0));
}

export function effortFinancierLisse(charges: readonly Charge[]): Decimal {
  return totalChargesMensuelles(charges).plus(provisionsMensuellesLissees(charges));
}

export function capaciteEpargneReelle(input: {
  revenus: Decimal;
  charges: readonly Charge[];
  plafondQuotidien: Decimal;
}): Decimal {
  return input.revenus.minus(effortFinancierLisse(input.charges)).minus(input.plafondQuotidien);
}
```

### États UX

| Capacité | Couleur | Icône        | Message                                                    |
| -------- | ------- | ------------ | ---------------------------------------------------------- |
| ≥ 0      | emerald | CheckCircle2 | "C'est ton vrai reste à vivre chaque mois, sans surprise." |
| < 0      | rose    | AlertCircle  | "Attention, ton train de vie global dépasse tes revenus."  |

**Affichage** : carte Dashboard avec :

- Header "Capacité d'Épargne Réelle"
- Nombre principal (4xl, font-bold) coloré selon signe, préfixe `+` si positif
- Message contextuel (sm, text-zinc-400)
- Glow décoratif au coin (bg-emerald-500/20 ou bg-rose-500/20)

**Pas de pourcentages, pas de barres, pas de comparaisons mois M-1.** La force du KPI vient de sa simplicité émotionnelle.

---

## Conséquences positives

- ✅ **Différenciation produit immédiate** : aucun concurrent n'affiche ce KPI, c'est mémorable et copiable sur la landing v3 ("Combien tu peux VRAIMENT épargner ce mois ?").
- ✅ **Stable mois après mois** : tant que charges et revenus ne changent pas, le KPI ne change pas. Pas d'effet yo-yo.
- ✅ **Honnêteté** : si l'utilisateur dépasse son train de vie en équivalent annuel, le KPI passe au rouge **dès le premier mois** (pas après 6 mois quand le solde réel a fondu).
- ✅ **Domain pur testable** : zéro I/O, zéro state, totalement déterministe. Couverture Vitest ≥ 95 % facile.
- ✅ **Décision actionnable** : un KPI rouge est un signal clair "il faut réduire une charge ou augmenter le revenu". Couplé au Simulateur d'Action (PR-D8), l'utilisateur peut tester instantanément l'impact d'une économie.
- ✅ **Pédagogie** : le slogan "ton vrai reste à vivre, sans surprise" devient un asset de communication produit (landing, blog, glossaire).

## Conséquences négatives

- ❌ **Complexité conceptuelle pour novices** : un user habitué à Monarch/YNAB peut être surpris de voir "Capacité d'Épargne -250 €" alors que son compte courant affiche +800 € (parce que la facture annuelle de 1200 € arrive dans 4 mois). Mitigation : tooltip explicatif sur la card + onboarding pédagogique + lien vers `/glossaire/capacite-epargne-reelle`.
- ❌ **Sensibilité aux inputs incorrects** : si l'utilisateur oublie de saisir une charge périodique, le KPI surestime sa capacité. Mitigation : nudge onboarding "Tu as déclaré X charges. Es-tu sûr de ne pas en avoir oublié ?" (PR-D6).
- ❌ **Édge case revenus = 0** : KPI massivement négatif. Couverte côté UX par un état "Configure ton revenu pour calibrer ton cockpit" si `revenus = 0`.
- ❌ **Précision décimale critique** : `montant.dividedBy(12)` peut donner des décimales infinies (4.4166666...). On utilise Decimal.js avec arrondi à 2 décimales pour l'affichage, mais on garde la précision interne pour les calculs cumulés.

---

## Alternatives évaluées

### Alternative 1 — Cash flow mois courant (style Monarch)

Calculer simplement `Revenus - Charges_fixes_du_mois - Charges_périodiques_du_mois`.

**Rejetée** : c'est exactement ce que Monarch et concurrence font. Pas différenciateur, et trompeur les mois sans facture annuelle.

### Alternative 2 — Solde projeté fin de mois (style Linxo)

Calculer `Solde_actuel + Revenus_mois - Σ(charges_à_venir_ce_mois)`.

**Rejetée** : nécessiterait un agrégateur PSD2 pour `Solde_actuel`. ADR-001 (no-PSD2) tranche contre. De plus, c'est un projeté court-terme, pas un KPI lissé.

### Alternative 3 — Inclure le déficit Provisions dans le calcul

Soustraire aussi `deficitEpargne` (cf. ADR-011 Plan rattrapage) du Capacité Réelle pour pénaliser un user qui n'a pas constitué ses provisions.

**Rejetée** : le déficit Provisions est un KPI de **rattrapage** (court-terme, exceptionnel, lissé sur 3 mois — cf. ADR-011). Le Capacité Réelle est un KPI de **régime de croisière** (ce qu'il reste si l'utilisateur tient ses provisions à jour). Mélanger les deux dans la même formule rendrait le KPI illisible et instable. Le déficit reste affiché séparément dans la sub-card "Santé des Provisions" de l'Assistant Virements.

### Alternative 4 — KPI "Marge Brute" sans plafond Quotidien

Calculer `Revenus - effortFinancierLisse` sans soustraire le plafond Quotidien.

**Rejetée** : laisse l'utilisateur croire qu'il a 800 € de marge alors qu'il dépense 500 € en courses/essence/loisirs. La promesse "ton vrai reste à vivre" exige de soustraire toutes les sorties prévisibles.

### Alternative 5 — Soustraire les dépenses Quotidien réelles (pas le plafond)

Calculer `Revenus - effortFinancierLisse - dépenses_quotidiennes_du_mois_en_cours`.

**Rejetée** : le KPI fluctuerait jour après jour selon les achats, ce qui le rend inutilisable comme "régime de croisière". On utilise le **plafond** (intention user) plutôt que le réel (variabilité). La live decrement dans la card "Dépenses du Quotidien" couvre l'aspect réel (cf. ADR-010).

---

## Plan d'implémentation

1. **PR-D1 (Foundations)** :
   - Créer `src/lib/domain/cockpit.ts` avec les 4 fonctions pures (`totalChargesMensuelles`, `provisionsMensuellesLissees`, `effortFinancierLisse`, `capaciteEpargneReelle`)
   - Créer `src/lib/domain/__tests__/cockpit.test.ts` avec ≥ 15 cas Vitest :
     - Charges vides → effort = 0, capacité = revenus - quotidien
     - 1 charge mensuelle 100 → effort = 100
     - 1 charge annuelle 1200 → provisions = 100/mois
     - 1 charge trimestrielle 300 → provisions = 100/mois
     - Mix 3 mensuelles + 2 annuelles + 1 trimestrielle (cas réel @thierry)
     - Capacité négative (revenus = 1000, charges = 1500) → assertion vert/rouge
     - Edge case revenus = 0 → capacité = -charges - quotidien
     - Edge case Decimal précision (montant 4.41 / 12 → cumul stable sur 12 itérations)
     - Edge case charges avec frequence inconnue (TS doit l'interdire à compile-time, sinon throw runtime)
2. **PR-D3 (Bloc 1 radar UI)** :
   - Composant `CapaciteEpargneReelleCard` qui consomme le calcul via Server Component + props sérialisées (Decimal → string → reconstitué côté client si interactivité)
   - Glow décoratif via Tailwind (pas de lib animation ; Motion peut venir post-launch)
   - Tooltip explicatif au hover sur le KPI : "Cette valeur soustrait toutes tes charges (lissées sur l'année) et ton plafond Quotidien à tes revenus mensuels. C'est ce qu'il te reste réellement chaque mois pour épargner ou pour les imprévus."
   - Tests Playwright : "user change le revenu → KPI recalcule en <1s"
3. **i18n** : 3 nouvelles clés `messages/{fr-BE,en}.json` :
   ```json
   "dashboard.capaciteEpargneReelle.title": "Capacité d'Épargne Réelle",
   "dashboard.capaciteEpargneReelle.messagePositive": "C'est ton vrai reste à vivre chaque mois, sans surprise.",
   "dashboard.capaciteEpargneReelle.messageNegative": "Attention, ton train de vie global dépasse tes revenus.",
   "dashboard.capaciteEpargneReelle.tooltip": "..."
   ```
4. **Glossaire public** (déjà disponible via `/glossaire`) : ajouter la définition canonique du concept dans `content/glossary/{fr-BE,en}.json`.

---

## Risques

- **Risque 1 — Mauvaise interprétation user** : "Pourquoi ma Capacité est négative alors que mon compte est positif ?". Mitigation : tooltip + onboarding + glossaire.
- **Risque 2 — Précision décimale sur sommes longues** : Decimal.js gère bien, mais audit obligatoire. Tests Vitest avec assertions `toEqual(new Decimal('100.50'))` strictes.
- **Risque 3 — KPI non actionnable si trop abstrait** : si l'utilisateur ne sait pas quoi faire d'un nombre rouge, le KPI échoue. Mitigation : couplage avec Simulateur d'Action (PR-D8) qui donne un chemin concret pour repasser au vert.
- **Risque 4 — Régression mois après mois** : si on permet l'historique de KPI, un user pourrait voir "ma Capacité a chuté de 100 € entre avril et mai". Mitigation v1.0 : pas d'historique, KPI mois courant uniquement. v1.1 : potentiellement un graph 12 mois.

---

## Métriques de succès

À mesurer 4 semaines post-PR-D3 :

- **Compréhension user** : enquête NPS sur le Dashboard. Question : "Sur 10, à quel point la Capacité d'Épargne Réelle te paraît claire ?". Cible : moyenne ≥ 7/10.
- **Adoption tooltip** : taux de hover sur le KPI dans la première session. Cible : ≥ 30 % des nouveaux users.
- **Lien avec landing** : taux de visite du glossaire `/glossaire/capacite-epargne-reelle` depuis le Dashboard. Cible : ≥ 5 % des sessions.
- **Délai pour passer rouge → vert** : après que le KPI passe rouge, combien de jours avant que l'utilisateur applique une action (charge supprimée/réduite ou revenu mis à jour). Cible : médiane ≤ 14 jours.

---

## Décision finale

À valider par @thierry. En attendant validation explicite, statut `Proposed`.
