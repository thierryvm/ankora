# ADR-012 — Assistant Virements (calcul intelligent provisions ↔ factures du mois)

- **Statut** : Accepted
- **Date** : 2026-05-03
- **Accepté le** : 2026-05-03 par délégation explicite de @thierry à @cowork (chat session, "tu as la responsabilité des choix techniques")
- **Proposé par** : Cowork-Opus (Architecture)
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `domain`, `differenciation`, `ux`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-002 (bucket-model), ADR-011 (plan rattrapage), ADR-001 (no-PSD2), spec `dashboard-cockpit-vraie-vision-2026-05-03.md`, PR-D5

---

## Contexte & problème

Le bucket-model d'Ankora (cf. ADR-002) repose sur l'idée que les charges périodiques sont **lissées en provisions mensuelles**. L'utilisateur vire chaque mois `provisionsMensuellesTotales` vers le compte Provisions. Au moment où la facture annuelle tombe (ex: Dashlane 53 € en avril), il pioche dans ce compte pour la payer.

**Problème pratique** : ce modèle simpliste fait virer "à plein" tous les mois, même quand une facture annuelle tombe le mois courant. Exemple :

> @thierry provisionne 59 €/mois pour ses 5 factures périodiques.
> En avril, sa charge Dashlane (53 €) est due.
> Logique naïve : il vire **59 € vers Épargne** comme d'habitude, puis paye Dashlane **depuis le compte courant** (53 €).
> Résultat : il sort 59 + 53 = **112 €** du compte courant ce mois, au lieu de 59 €.

C'est **inefficace** et **anxiogène**. L'utilisateur a l'impression que les mois "à grosses factures annuelles" sont brutaux alors que justement le lissage est censé les éviter.

**Solution intelligente** : ne virer vers Épargne que la **différence** entre la provision mensuelle et les factures périodiques du mois courant.

```
Mai 2026 : aucune facture périodique due → virer 59 € vers Épargne (provision pleine)
Avril 2026 : Dashlane 53 € due → virer seulement (59 - 53) = 6 € vers Épargne
              + payer Dashlane 53 € depuis Épargne (l'argent est déjà là, lissé sur 12 mois)
Juin 2026 : Taxe voiture 300 € due → virer (59 - 300) = -241 €
              → message inverse : "À récupérer 241 € de l'épargne pour payer la taxe"
```

C'est ce calcul que le mockup IronBudget appelle l'**Assistant Virements**. C'est le **cœur différenciateur** d'Ankora vs concurrence (Monarch / YNAB / Lunch Money / Linxo / Bankin' ne le font pas).

Cet ADR formalise la formule, son implémentation, et l'UX associée.

---

## Décision — drivers

Trois objectifs en tension :

1. **Différenciation produit** : ce calcul doit être identifiable comme "ce qu'Ankora fait que les autres ne font pas". Asset marketing + landing.
2. **Cohérence métier** : compatible avec ADR-002 (bucket-model) et ADR-011 (plan rattrapage). Pas de double-comptage.
3. **Réversibilité** : permettre les **3 directions** de virement (vers Épargne / depuis Épargne / aucun virement) selon les cas.

---

## Décision adoptée

**Adopter la formule canonique** suivante, calculée dans `src/lib/domain/cockpit/assistant-virements.ts` :

### Formule

```
totalPeriodiquesMois = Σ(charges périodiques avec mois courant ∈ payment_months)
                       de leurs montants

transfertRecommande = provisionMensuelleTotale - totalPeriodiquesMois

transfertRecommandeAjuste = transfertRecommande + rattrapageMensuel
                            (cf. ADR-011)
```

### 3 états UX

| Condition                       | État                   | Couleur | Message                                                                                                              |
| ------------------------------- | ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `transfertRecommandeAjuste > 0` | À virer vers Épargne   | bleu    | "À virer vers l'Épargne : X €"                                                                                       |
| `transfertRecommandeAjuste < 0` | À récupérer de Épargne | emerald | "À récupérer de l'Épargne : X €" + "Les factures annuelles de ce mois dépassent ta provision. Utilise ton épargne !" |
| `transfertRecommandeAjuste = 0` | Aucun virement         | zinc    | "Aucun virement nécessaire ce mois-ci. Les provisions couvrent exactement les factures périodiques."                 |

### Détail provisions item-par-item

Sous le montant principal, afficher la décomposition de `provisionMensuelleTotale` :

```
Détail des 59,00 € de provisions :
- Dashlane (annuelle 53€)        +4,42 €
- S.W.D.E (trimestrielle 45€)    +15,00 €
- Taxe voiture (annuelle 300€)   +25,00 €
- Taxe poubelle (annuelle 120€)  +10,00 €
- Taxe égout (annuelle 55€)      +4,58 €
```

Cette transparence est **essentielle** pour la confiance utilisateur : il voit d'où vient le 59 €.

### Implémentation TypeScript (domain pur)

```typescript
// src/lib/domain/cockpit/assistant-virements.ts
import Decimal from 'decimal.js';
import type { Charge } from '@/lib/domain/charges';

export type AssistantVirementsInput = {
  charges: readonly Charge[];
  refMonth: number; // 1-12
  refYear: number;
  rattrapageMensuel: Decimal; // depuis ADR-011
};

export type AssistantVirementsOutput = {
  provisionMensuelleTotale: Decimal;
  totalPeriodiquesMois: Decimal;
  transfertRecommande: Decimal;
  transfertRecommandeAjuste: Decimal;
  direction: 'vers_epargne' | 'depuis_epargne' | 'aucun';
  detailProvisions: ReadonlyArray<{
    chargeId: string;
    nom: string;
    frequence: 'annual' | 'quarterly';
    montantOriginal: Decimal;
    provisionLissee: Decimal;
  }>;
};

export function calculerAssistantVirements(
  input: AssistantVirementsInput,
): AssistantVirementsOutput {
  const chargesPeriodiques = input.charges.filter((c) => c.frequence !== 'monthly');

  // Provision mensuelle lissée par charge
  const detailProvisions = chargesPeriodiques.map((c) => {
    const cycleMonths = c.frequence === 'annual' ? 12 : 3;
    return {
      chargeId: c.id,
      nom: c.nom,
      frequence: c.frequence,
      montantOriginal: c.montant,
      provisionLissee: c.montant.dividedBy(cycleMonths),
    };
  });

  const provisionMensuelleTotale = detailProvisions.reduce(
    (acc, d) => acc.plus(d.provisionLissee),
    new Decimal(0),
  );

  // Total des factures périodiques échéant ce mois-ci
  const totalPeriodiquesMois = chargesPeriodiques
    .filter((c) => c.paymentMonths.includes(input.refMonth))
    .reduce((acc, c) => acc.plus(c.montant), new Decimal(0));

  const transfertRecommande = provisionMensuelleTotale.minus(totalPeriodiquesMois);
  const transfertRecommandeAjuste = transfertRecommande.plus(input.rattrapageMensuel);

  const direction = transfertRecommandeAjuste.gt(0)
    ? 'vers_epargne'
    : transfertRecommandeAjuste.lt(0)
      ? 'depuis_epargne'
      : 'aucun';

  return {
    provisionMensuelleTotale,
    totalPeriodiquesMois,
    transfertRecommande,
    transfertRecommandeAjuste,
    direction,
    detailProvisions,
  };
}
```

---

## Conséquences positives

- ✅ **Différenciation produit unique** : aucun concurrent ne propose ce calcul. Asset marketing fort, à mettre en avant landing v3.
- ✅ **Élimine le pic de cash flow** : les mois à grosses factures annuelles ne brutalisent plus le compte courant.
- ✅ **Pédagogie** : le détail provisions item-par-item enseigne à l'utilisateur **pourquoi** sa provision mensuelle a la valeur qu'elle a.
- ✅ **Réversibilité naturelle** : direction `depuis_epargne` quand les périodiques ce mois > provision (ex: mois où une grosse annuelle tombe). L'algo gère sans effort spécifique.
- ✅ **Domain pur testable** : zéro I/O, déterministe, couverture Vitest visée ≥ 95 %.
- ✅ **FSMA-safe** : le calcul ne fait QUE produire un montant suggéré. **L'utilisateur reste maître de l'exécution du virement** (manuelle dans son interface bancaire). Aucune transaction, aucun PSD2.

## Conséquences négatives

- ❌ **Complexité conceptuelle pour novices** : un utilisateur habitué à "épargne = montant fixe / mois" peut être surpris de voir "à virer 6 €" en avril alors qu'il visait 59 €. Mitigation : tooltip explicatif "Ce mois-ci, ta facture Dashlane (53€) est payée depuis l'Épargne, donc tu n'as à virer que la différence (6€) pour les 4 autres provisions" + onboarding pédagogique (PR-D6).
- ❌ **Dépendance forte à `payment_months` correctement renseigné** : si l'utilisateur oublie de cocher "avril" dans les mois d'échéance Dashlane, l'Assistant Virements suggère de virer 59 € au lieu de 6 €. L'utilisateur paye double. Mitigation : nudge onboarding "As-tu vérifié les mois d'échéance de tes charges annuelles ?".
- ❌ **Cas "aucun virement" peut sembler bizarre** : "Aucun virement nécessaire ce mois" peut surprendre. Mitigation : message explicatif clair.
- ❌ **Cas "depuis épargne" anxiogène la première fois** : "Tu dois récupérer 241 € de ton épargne" peut alarmer un user qui voit son épargne baisser. Mitigation : message explicatif "Cet argent était déjà sur l'épargne pour cette facture précise — tu utilises le bucket comme prévu". Couplage visuel avec le détail provisions (ex: "Sur les 300 € de Taxe voiture, 275 € viennent de tes provisions cumulées et 25 € de ta provision de ce mois").

---

## Alternatives évaluées

### Alternative 1 — Virement plein chaque mois (ne pas soustraire les périodiques du mois)

Calculer simplement `transfertRecommande = provisionMensuelleTotale`, et payer les factures du mois depuis le compte courant.

**Rejetée** : c'est exactement ce que tous les concurrents font. Pas différenciateur, et anxiogène pour les mois à grosses factures annuelles.

### Alternative 2 — Rétro-calculer le solde idéal (pull, pas push)

Au lieu de suggérer un virement, suggérer "ton solde Épargne devrait être de X € à la fin du mois, ajuste-toi". Charge à l'utilisateur de calculer combien virer.

**Rejetée** : pas actionnable. L'utilisateur doit faire le calcul mental. C'est précisément ce qu'Ankora doit faire à sa place.

### Alternative 3 — Virer = provisionMensuelleTotale, gérer les factures périodiques en notification séparée

Garder le virement mensuel constant à 59 €, et notifier séparément "facture Dashlane 53 € due ce mois, à payer depuis Épargne".

**Rejetée** : 2 mouvements à gérer manuellement (vire 59 + paye 53 depuis épargne) au lieu d'1 (vire 6). Cognitive overhead inutile.

### Alternative 4 — Inclure les mensuelles aussi dans le "à virer"

Calculer `transfert = totalCharges_du_mois` (mensuelles + périodiques). Faire un seul virement vers le compte courant.

**Rejetée** : confond le compte Provisions (pour les variables) et le compte Principal (pour les fixes). Casse la sémantique account_type (cf. ADR-008).

### Alternative 5 — Multi-buckets affectés (ADR-002 strict)

Au lieu d'un compte Provisions global, avoir 1 bucket par charge périodique avec son propre solde (Bucket Dashlane, Bucket Taxe voiture, etc.).

**Rejetée v1.0** : trop complexe à manager (5+ buckets pour @thierry). v1.1 : reconsidérer si l'utilisateur exprime ce besoin (cf. ADR-015 future Savings Buckets segregation, A10).

---

## Plan d'implémentation

1. **PR-D1 (Foundations)** :
   - Créer `src/lib/domain/cockpit/assistant-virements.ts` avec `calculerAssistantVirements()`
   - Tests Vitest ≥ 20 cas couvrant :
     - Mois sans facture périodique → virer = provision pleine
     - Mois avec 1 facture annuelle = provision → virer = 0
     - Mois avec facture > provision → direction = depuis_epargne, montant absolu
     - Mois avec multiples factures (3 trimestrielles + 1 annuelle) → somme correcte
     - Sans charges périodiques → provision = 0, virer = 0
     - Avec rattrapage > 0 → ajustement correct
     - Avec rattrapage = 0 (à jour) → pas d'ajout
     - Cas réel @thierry (Dashlane avril, Taxe poubelle/égout mars, etc.)
2. **PR-D5 (Bloc droite)** :
   - Composant `VirementsAssistantCard` avec card hero (gradient bleu/vert)
   - Sub-card `SanteProvisionsCard` (cf. ADR-011) intégrée
   - Détail provisions item-par-item dans une section dépliable
   - Couleurs dynamiques selon direction
   - Tests E2E Playwright "user toggle paye charge périodique → Assistant Virements recalcule"
3. **i18n** : 8 nouvelles clés `messages/{fr-BE,en}.json` :
   ```json
   "virements.title": "Assistant Virements",
   "virements.provisionsMensuelles": "Provisions mensuelles :",
   "virements.facturesAnnuelles": "Factures annuelles ce mois-ci :",
   "virements.aVirer": "À virer vers l'Épargne :",
   "virements.aRecuperer": "À récupérer de l'Épargne :",
   "virements.aucun": "Aucun virement nécessaire ce mois-ci. Les provisions couvrent exactement les factures périodiques.",
   "virements.descriptionAVirer": "Couvre tes provisions mensuelles, déduction faite des factures de ce mois.",
   "virements.descriptionDepuis": "Les factures annuelles de ce mois dépassent ta provision. Utilise ton épargne !",
   "virements.detailHeader": "Détail des {amount} € de provisions :"
   ```
4. **Glossaire public** : ajouter "Assistant Virements" dans `content/glossary/{fr-BE,en}.json` avec exemple chiffré pour pédagogie SEO.

---

## Risques

- **Risque 1 — Mauvaise UX si formule mal expliquée** : "Tu dois récupérer 241 € de ton épargne" peut paniquer. Mitigation : message contextuel rassurant + tooltip + lien vers glossaire.
- **Risque 2 — Calcul erroné si `payment_months` mal renseigné** : l'algo dépend de cette donnée. Mitigation : validation Zod stricte (array de SMALLINT entre 1 et 12) + nudge onboarding.
- **Risque 3 — Cumul rattrapage explose** : si déficit énorme + plusieurs factures gros mois → `transfertRecommandeAjuste` peut dépasser revenus. Mitigation : warning UX explicite + cap sur le rattrapage (cf. ADR-011 risque 4).
- **Risque 4 — Double-comptage avec ADR-002 bucket-model** : assurer que `provisionMensuelleTotale` n'inclut JAMAIS les charges mensuelles. Test Vitest dédié + commentaire défensif dans le code.

---

## Métriques de succès

À mesurer 4 semaines post-PR-D5 :

- **Adoption Assistant Virements** : % d'utilisateurs qui visualisent la card au moins 1× par semaine. Cible : ≥ 70 %.
- **Action après notification** : si la notif "À virer X €" est affichée, l'utilisateur met-il à jour `soldeEpargne` (proxy de virement réel) dans les 7 jours ? Cible : ≥ 50 %.
- **Compréhension utilisateur** : enquête NPS "Sur 10, à quel point comprends-tu pourquoi le montant à virer change selon le mois ?" Cible : ≥ 7/10 moyenne.
- **Hover sur tooltip** : taux de hover/click sur l'icône info de la card. Cible : ≥ 30 % nouveaux users.
- **Mention dans support** : nombre de tickets/messages "je ne comprends pas le montant à virer". Cible : ≤ 5 % du volume support post-launch.

---

## Décision finale

À valider par @thierry. En attendant validation explicite, statut `Proposed`.
