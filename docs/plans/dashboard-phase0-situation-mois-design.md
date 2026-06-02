# Situation du Mois — Hero Dashboard (Phase 0) — Spec de design

> Épic **THI-327** (refonte `/app` en cockpit de décision) · Phase 0 · 2026-06-02
> Brainstorm validé section par section avec @thierry · Direction « Calm Financial OS »

## Goal

Remplacer le double-bloc héros actuel du dashboard ([`EffortFinancierCard`](../../src/components/dashboard/EffortFinancierCard.tsx) + [`CapaciteEpargneCard`](../../src/components/dashboard/CapaciteEpargneCard.tsx)) par **un seul Hero « Situation du mois »** : une narration en cascade (revenus → charges → provisions → reste disponible → épargne) qui répond, en un coup d'œil, à « comment je vais ce mois-ci ? ». C'est le **NORTH_STAR §"Dashboard Excellence" #1 (Hero cashflow waterfall, jamais construit)** — le keystone manquant.

## Architecture (2-3 phrases)

Une **fonction domaine pure** `calculerSituationDuMois()` compose les calculs existants (`effortFinancierLisse`, `capaciteEpargneReelle`, `calculerSanteProvisions`) et dérive un statut 🟢🟠🔴/⚪. La page passe des `number` (jamais un `Decimal` à travers la frontière RSC) à un **Server Component** `SituationDuMoisHero`, qui compose pastille de statut + chiffre-héros + barre d'allocation fine SVG-maison + flow vertical + nudge contextuel. Aucun calcul financier nouveau, aucune migration, aucun schéma touché.

## Tech stack

TypeScript strict · `decimal.js` (domaine pur) · Next.js 16 Server Components · Tailwind 4 tokens sémantiques · `next-intl` (5 locales, FR+EN réels) · Vitest (domaine TDD + composant) · Playwright seedé (ground-truth).

---

## 1. Vocabulaire (verrouillé — vocab produit existant adopté)

Décision 2026-06-02 après ground-truth de `CapaciteEpargneCard` (qui est **déjà** un tryptique avec ce vocabulaire + un drawer d'édition). On **n'invente rien** et on **ne renomme rien** : on réutilise les mots établis pour préserver la cohérence produit (carte Capacité + simulateur disent déjà ces mots).

| Concept domaine   | Calcul                                        | **Label UI canonique**                               |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| `resteDisponible` | revenus − charges fixes − provisions lissées  | **« Reste disponible »** ◀ chiffre-héros             |
| `resteAVivre`     | budget vie courante (input user, défaut 500€) | **« Reste à vivre »** (+ drawer « Ajuster ce mois ») |
| `capacite`        | resteDisponible − resteAVivre                 | **« Capacité épargne »**                             |

**Conséquence** : le simulateur ([`SimulatorClient.tsx`](../../src/app/[locale]/app/simulator/SimulatorClient.tsx)) dit **déjà** « Reste disponible » → **parité automatique, zéro changement simulateur**. Le « synonym drift » interdit par `dashboard-ux-auditor` est évité par construction.

## 2. Mapping data (zéro calcul nouveau)

```
Revenus              = snapshot.monthlyIncome            (number | null)
− Charges fixes      = totalChargesMensuelles(charges)
− Provisions lissées = provisionsMensuellesLissees(charges)
─────────────────────────────────────────────────────────
= Reste disponible   = resteDisponible                   ◀ CHIFFRE-HÉROS
     · Reste à vivre  = budgetVieCourante (= resteAVivre)
     · Capacité épg.  = capacite
```

Toutes ces valeurs sortent déjà de [`capaciteEpargneReelle()`](../../src/lib/domain/cockpit/capacite-epargne-reelle.ts) (`{ effortFinancierLisse, resteDisponible, resteAVivre, capacite, isPositive }`). La santé des provisions sort de [`calculerSanteProvisions()`](../../src/lib/domain/cockpit/sante-provisions.ts) (`{ statut, deficitEpargne, rattrapageMensuel }`).

## 3. Statut (3 paliers + état incomplet)

Calculé **dans le domaine** (la fonction renvoie l'enum + les faits bruts ; le composant choisit la copy). Pas de copy/i18n dans le domaine.

```
si  !hasRevenus (monthlyIncome === null)        → 'incomplet'   ⚪
sinon si resteDisponible < 0                     → 'rouge'       🔴
sinon si capacite < 0  OU  provisions en déficit → 'orange'      🟠
sinon                                            → 'vert'        🟢
```

| Statut       | Sens                                                                     | Ton                                                                   |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 🟢 vert      | capacité ≥ 0 ET provisions à jour                                        | rassurant, pas de nudge                                               |
| 🟠 orange    | capacité < 0 (train de vie > revenus dispo) **ou** provisions en déficit | nudge calme + lien plan                                               |
| 🔴 rouge     | charges + provisions > revenus (`resteDisponible < 0`)                   | honnête mais doux + lien plan                                         |
| ⚪ incomplet | revenus non configurés (`monthlyIncome === null`)                        | **fix THI-335** : neutre, zéro chiffre négatif, zéro rouge, CTA setup |

**THI-335** : l'état actuel affiche une capacité « −1 711 € » rouge anxiogène quand aucun revenu n'est saisi. Le statut `incomplet` court-circuite tout calcul de cascade et n'affiche **aucun montant négatif** — juste un CTA calme « Configure tes revenus ».

## 4. Sélection du nudge (couche composant, FSMA-safe)

Chaque état non-vert affiche **un** message calme + **un** lien vers le plan de virements existant (`#plan-heading`, ADR-012) — jamais une alerte sèche, jamais de conseil d'investissement (FSMA). **Priorité orange** (si capacité < 0 ET déficit provisions cumulés) : le nudge « capacité < 0 » prime (problème plus fondamental), le déficit provisions est secondaire.

| Statut                                       | Copy FR (lead + corps)                                                                                                                                           | Action                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 🟢 vert                                      | « Tu gères bien ce mois-ci »                                                                                                                                     | —                                                |
| 🟠 orange (capacité < 0)                     | « À ajuster ce mois-ci » · « Ton épargne passe sous zéro ({capacite}). Regarde le plan pour rééquilibrer. »                                                      | lien « Voir le plan » → `#plan-heading`          |
| 🟠 orange (provisions déficit, capacité ≥ 0) | « Provisions à renflouer » · « Il manque {deficit} pour couvrir tes charges à venir. Rattrapage suggéré : {rattrapage}/mois. »                                   | lien « Voir le plan » → `#plan-heading`          |
| 🔴 rouge                                     | « Tes charges dépassent tes revenus » · « Tes charges et provisions ({obligations}) dépassent tes revenus ({revenus}). On regarde ensemble ce qui peut bouger. » | lien « Voir le plan » → `#plan-heading`          |
| ⚪ incomplet                                 | « Complète ta situation » · « Ajoute tes revenus pour voir ton reste disponible ce mois. »                                                                       | CTA « Configurer mes revenus » → `/app/accounts` |

> Copy EN équivalente fournie dans le plan d'implémentation. Les 3 locales post-launch (nl-BE, de-DE, es-ES) reçoivent la copy FR en miroir (pattern existant du repo — parité de clés, pas de traduction NL/DE/ES en v1.0).

## 5. Forme visuelle (flow vertical + barre fine — verrouillé)

```
🟢  Tu gères bien ce mois-ci                 ← pastille statut (icône + texte, jamais couleur seule)

Reste disponible            1 480 €          ← chiffre-héros (text-4xl, tabular-nums) + tooltip (jargon)
Ce qu'il te reste après tes charges          ← sous-titre humain

▓▓▓▓▒▒▒░░░░░░░░██████                         ← AllocationBar fine (~6px), tokens sémantiques

 Revenus                   2 800 €           ← flow vertical (lignes fines, montants alignés à droite)
  └ Charges fixes          − 980 €
  └ Provisions lissées     − 340 €
 ──────────────────────────────────          ← trait de total
 Reste disponible          1 480 €
   · Reste à vivre            500 €  [Ajuster ce mois]   ← AjusterResteAVivreDrawer préservé
   · Capacité épargne         980 €  · ≈ X €/jour        ← per-day attaché au budget vie courante (sémantiquement correct)
```

**Per-day** : le « ≈ X €/jour » est attaché à la **ligne vie courante** (`budgetVieCourante / joursRestants`) = l'argent réellement dépensable au quotidien — **pas** au reste disponible (qui inclut l'épargne, ce serait trompeur). Décision prise en spec self-review ; à confirmer par @thierry à la revue.

### AllocationBar (composant présentationnel réutilisable)

- Barre horizontale unique = 100% des revenus. Segments gauche→droite : Charges fixes · Provisions lissées · Reste à vivre · Capacité épargne. Chaque largeur = `valeur / revenus`, clampée ≥ 0.
- Tokens sémantiques uniquement (aucun hex) : charges/provisions en teintes neutres-brand, capacité en `success`. Mapping exact des tokens fixé dans le plan (cf. [`docs/design/token-usage.md`](../design/token-usage.md)).
- **Edge orange** (capacité < 0) : segment « Capacité épargne » à 0, « Reste à vivre » clampé au reste disponible.
- **Edge rouge** (resteDisponible < 0) : charges + provisions remplissent 100% en teinte `danger`, pas de segments reste/épargne, end-cap de débordement (signal « obligations > revenus »).
- **Incomplet** : AllocationBar masquée (pas de revenus → pas de proportion).
- Réutilisable pour la « barre empilée comptes » des phases suivantes (philosophie enveloppes).

## 6. Architecture composants (fichiers + responsabilités)

| Fichier                                                   | Action                                 | Responsabilité                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/domain/cockpit/situation-mois.ts`                | **créer**                              | Fonction pure `calculerSituationDuMois()` — compose effort + capacité + santé provisions, dérive le statut. Decimal in/out. **Keystone testé TDD.**                |
| `src/lib/domain/cockpit/__tests__/situation-mois.test.ts` | **créer**                              | Couverture des 4 statuts + edges (revenus null, 0 charge, resteDisponible négatif, déficit provisions).                                                            |
| `src/lib/domain/cockpit/index.ts`                         | modifier                               | `export * from './situation-mois'`                                                                                                                                 |
| `src/components/dashboard/AllocationBar.tsx`              | **créer**                              | Barre fine SVG-maison présentationnelle (props `segments[]` → tokens). Pur, sans état.                                                                             |
| `src/components/dashboard/SituationDuMoisHero.tsx`        | **créer**                              | Server Component. Reçoit des `number` + l'enum statut. Compose pastille + héros + AllocationBar + flow + nudge. Réutilise `AjusterResteAVivreDrawer`.              |
| `src/app/[locale]/app/page.tsx`                           | modifier                               | Remplace la section `grid md:grid-cols-2` (L112-124) par le Hero. Appelle `calculerSituationDuMois`, mappe en `number`, calcule `joursRestants` (Europe/Brussels). |
| `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json`              | modifier                               | Namespace `dashboard.situation.*` (parité 5 locales).                                                                                                              |
| `EffortFinancierCard.tsx` + `CapaciteEpargneCard.tsx`     | **supprimer si non utilisés ailleurs** | Subsumés par le Hero. Vérifier les usages (grep) dans le plan avant suppression ; conserver `AjusterResteAVivreDrawer` (réutilisé).                                |

### Signature domaine (contrat)

```ts
export type SituationStatut = 'vert' | 'orange' | 'rouge' | 'incomplet';

export type SituationDuMois = Readonly<{
  statut: SituationStatut;
  hasRevenus: boolean;
  revenus: Decimal; // 0 si incomplet
  chargesFixes: Decimal;
  provisionsLissees: Decimal;
  resteDisponible: Decimal; // chiffre-héros
  budgetVieCourante: Decimal; // = resteAVivre input
  capacite: Decimal;
  provisionsAJour: boolean;
  deficitEpargne: Decimal; // > 0 si déficit (pour le nudge)
  rattrapageMensuel: Decimal; // pour le nudge provisions
}>;

export function calculerSituationDuMois(input: {
  revenus: Decimal | null; // null = incomplet (THI-335)
  charges: readonly CockpitCharge[];
  budgetVieCourante: Decimal;
  soldeEpargneActuel: Decimal;
  payments: PaymentLedger;
  ref: ReferencePeriod;
}): SituationDuMois;
```

## 7. Accessibilité (WCAG 2.2 AA)

- Statut jamais signalé par la **couleur seule** : icône Lucide + libellé texte systématiques.
- AllocationBar : `role="img"` + `aria-label` décrivant la répartition (« Sur 2 800 €, 980 € de charges, 340 € de provisions, 500 € de vie courante, 980 € d'épargne possible »). Segments décoratifs `aria-hidden`.
- Chiffre-héros : `tabular-nums`, contraste AA sur fond. Tooltip jargon accessible au clavier (`tabIndex={0}` + `aria-label`), pattern repris de la carte existante.
- Sémantique : `<section aria-labelledby>`, flow en `<dl>`/`<dt>`/`<dd>` (réutilise le pattern `SubStat` existant).
- Cibles tactiles ≥ 44px (drawer Ajuster, lien plan).
- `ankora-form-control-16` non concerné (pas d'input ici hors drawer existant).

## 8. Tests

**Domaine (TDD, financial-formula-validator)** — `situation-mois.test.ts` :

- vert : revenus 2800, charges → capacité ≥ 0 + provisions à jour.
- orange (capacité < 0) : reste à vivre > reste disponible.
- orange (déficit provisions) : capacité ≥ 0 mais solde épargne < cible.
- rouge : charges + provisions > revenus (resteDisponible < 0).
- incomplet : `revenus = null` → statut incomplet, aucun montant négatif propagé.
- edges : 0 charge, charges inactives ignorées, Decimal exact (pas de number).

**Composant (Vitest + RTL)** — `SituationDuMoisHero` :

- rendu par statut (4 cas) : bon libellé, bon nudge, présence/absence du lien plan.
- état incomplet : CTA setup présent, aucun « − » ni montant négatif rendus.
- AllocationBar : proportions correctes ; edge rouge → teinte danger + pas de segment épargne.
- drawer « Ajuster ce mois » présent sur la ligne vie courante.

**E2E (Playwright seedé, ground-truth)** : dashboard rend le Hero, screenshots desktop + mobile, statut vert sur user seedé avec charges.

## 9. Scope

**IN (Phase 0)** : la fonction domaine + le Hero + l'AllocationBar + le fix THI-335 + i18n (5 locales) + tests + suppression des 2 cartes subsumées.

**OUT (phases suivantes)** : jauge provisions, prochaines factures, comptes, plan virements, dépenses → **inchangés ce PR**. Charges/Dépenses missions = P2/P3. Aucune migration, aucun schéma, **simulateur non touché**, aucune dépendance ajoutée.

## 10. Risques & gates

- **Voie LOURDE** (touche `src/lib/domain/`) : `plan-reviewer` (obligatoire) → puis build TDD → `financial-formula-validator` (domaine) + `dashboard-ux-auditor` **Layer 0** + `ui-auditor` + `mobile-ios-auditor` + `i18n-auditor` + `lighthouse-auditor` + `test-runner`.
- PR cible < 600 lignes. Pas de Server Action nouvelle (drawer existant réutilisé). Pas de `proxy.ts`/auth/CSP/migration.
- **Risque copy** : per-day attaché à la vie courante (cf. §5) — à confirmer @thierry.
- **Risque suppression** : vérifier qu'`EffortFinancierCard`/`CapaciteEpargneCard` ne sont pas référencés ailleurs (simulateur, tests) avant `rm` — sinon garder + cesser le rendu seulement.
