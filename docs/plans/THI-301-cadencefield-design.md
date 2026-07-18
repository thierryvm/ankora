# THI-301 — `CadenceField` : design spec

> 2026-06-02 · @cc-ankora · branche `feat/thi-301-cadence-field`
> Ticket : [THI-301](https://linear.app/thierryvm/issue/THI-301) (Low · Tech Debt / UX)
> Statut : design **validé @thierry 2026-06-02** (brainstorming). Étape suivante : `writing-plans` → `plan-reviewer` → code.

## 1. Problème

La saisie de la cadence d'une charge récurrente est laide et confuse :

- 3 selects/inputs séparés — `frequency` (select), `dueMonth` (1-12, select), `paymentDay` (1-31, `<input type=number>`).
- Le mois d'échéance (`dueMonth`) est **toujours** affiché, y compris pour les charges **mensuelles** où il n'a aucun sens → bruit cognitif.
- Dupliqué à l'identique dans deux points de saisie : le form **create** inline ([ChargesClient.tsx](../../src/app/[locale]/app/charges/ChargesClient.tsx)) et le drawer **edit** ([ChargeEditDrawer.tsx](../../src/app/[locale]/app/charges/ChargeEditDrawer.tsx)).

Décision produit (@thierry, audit @cowork §6) : une charge récurrente s'exprime en **jour-du-mois + fréquence** (« Prélevé le 15 »), pas en date complète. La dépense ponctuelle garde son `<input type=date>` natif (intouchée).

## 2. Décisions verrouillées (@thierry)

1. **Cluster unifié** : un seul composant `CadenceField` couvre fréquence + (mois-ancre si non-mensuel) + jour.
2. **Garder `paymentDay` 1-31** (pas de cap à 28). **Zéro modif schéma** ([charge.ts:49-53](../../src/lib/schemas/charge.ts)). Rationale : narrower à 28 invaliderait des charges existantes (29/30/31) et dégraderait le cas courant (loyer le 30, salaire le 31) pour un cas-bord février déjà géré.
3. **Cadence régulière, tout éditable** (décision 2026-06-02) : fréquence + mois-ancre + jour sont TOUS modifiables en create ET edit. Rien n'est verrouillé — une erreur de saisie se corrige, jamais besoin de recréer la charge. Pas d'aperçu "read-only" qui donne une sensation de blocage.
4. **Option explicite « Dernier jour du mois »** (best practice récurrence) : map sur `paymentDay = 31` sous le capot (le clamp domaine fait déjà 31j→31, 30j→30, fév→28/29 = exactement "dernier jour"). Aucune migration. Règle l'exigence bissextile **par le design**, pas par un piège.
5. **Dates irrégulières = HORS THI-301** : un échéancier à dates spécifiques non-régulières (ex. Jan, Mar, Août pour une même charge) relève de la feature **« plans d'apurement »** (échéancier fini), pas du modèle charge récurrente. THI-301 ne gère que les cadences régulières (mensuel/trimestriel/semestriel/annuel).
6. **Pas de wheel JS custom** : `<select>` natifs (a11y iOS native imbattable).
7. **La dépense ponctuelle garde `<input type=date>` natif** (hors scope).
8. **Bissextile** : la date due réelle doit toujours refléter l'année en cours. Déjà garanti par le clamp année-conscient domaine — voir §5 frontière.

## 3. Architecture

- **Nouveau composant feature-local** : `src/app/[locale]/app/charges/CadenceField.tsx` (`'use client'`).
- **Consommé par les deux** points de saisie (create inline + edit drawer) → une seule source visuelle, cohérence create/edit garantie.
- **Pas un atom global** : le modèle (fréquence + mois-ancre + jour) est spécifique au domaine charge. Promotable en atom plus tard si réutilisé (YAGNI). On ne touche pas l'atom `Drawer` (les charges ne l'utilisent pas).

### Interface du composant

```ts
type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

interface CadenceValue {
  frequency: Frequency;
  dueMonth: number; // 1-12 — anchor ; ignoré visuellement si monthly
  paymentDay: number; // 1-31
}

interface CadenceFieldProps {
  value: CadenceValue;
  onChange: (next: CadenceValue) => void;
  idPrefix?: string; // pour les <label htmlFor> (a11y, useId côté parent)
  disabled?: boolean;
}
```

- **Composant contrôlé** (state détenu par le parent) : s'intègre dans les deux forms sans dupliquer la logique de submit existante.
- **Sortie = `{ frequency, dueMonth, paymentDay }`** : exactement ce que `createChargeAction` / `updateChargeAction` consomment déjà (via `paymentMonthsFromFrequency` côté appelant, inchangé).

## 4. Comportement (UX)

**Sélecteur de jour** : `<select>` listant `1 … 28`, puis une option finale **« Dernier jour du mois »** (= `paymentDay 31`). Les valeurs 29/30 restent sélectionnables (rares) mais l'option "Dernier jour" couvre proprement l'intention end-of-month sans piège bissextile. Aucune valeur n'est verrouillée — tout est ré-éditable à tout moment (create comme edit).

- **Mensuel** → « Prélevé le `[15 ▾]` de chaque mois ». **Mois-ancre masqué** (inutile en mensuel = gain UX vs aujourd'hui).
- **Trimestriel / Semestriel / Annuel** → « Prélevé le `[15 ▾]` à partir de `[mars ▾]` ». Le mois-ancre est un **select éditable** ; changer l'ancre OU la fréquence recalcule toute la cadence (rien de figé).
- **Ligne de résumé** (confirmation, best practice) : phrase humaine dérivée de l'état courant — ex. « le 15 : mars, juin, sept, déc » (trimestriel ancré mars) ou « le dernier jour de chaque mois » (mensuel + Dernier jour). Les mois calculés via `paymentMonthsFromFrequency(frequency, dueMonth)` (fonction pure existante, inchangée) sont affichés **dans ce résumé** — informatif, pas un champ verrouillé.
- Selects natifs stylés via les tokens design-system (mêmes classes que les selects existants du form charge — pas de nouveau token).

```
MENSUEL                              TRIMESTRIEL
 Fréquence ( Mensuel   v )            Fréquence ( Trimestriel v )
 Prélevé le [ 15 v ] de chaque mois   Prélevé le [15 v] à partir de [mars v]
   (... 1..28, 'Dernier jour')          (jour: 1..28, 'Dernier jour')
 -> 'le 15 de chaque mois'            -> 'le 15 : mars, juin, sept., déc.'
                                        (changer ancre/freq = tout bouge)
```

## 5. Frontière domaine (non négociable)

`CadenceField` **ne calcule aucune date**. Il ne fait que saisir `paymentDay` (entier 1-31). La date due réelle reste calculée exclusivement par [next-due-date.ts:44](../../src/lib/domain/charges/next-due-date.ts) :

```ts
const lastDayOfMonth = daysInMonth(year, month); // année-conscient (UTC, Date day-0)
const day = Math.min(charge.paymentDay, lastDayOfMonth);
```

Aucune logique de date côté UI → le clamp bissextile (testé fév non-bissextile / 2024 bissextile / avril) reste l'unique source de vérité. Le helper UI « le 31 → dernier jour » est purement informatif, il ne duplique pas le calcul.

## 6. Scope

**Inclus :**

- `CadenceField.tsx` + ses tests Vitest.
- Câblage dans le form **create** (`ChargesClient.tsx`) et le drawer **edit** (`ChargeEditDrawer.tsx`), en remplaçant les 3 champs séparés par `<CadenceField>`.
- i18n : libellés « Prélevé le », « de chaque mois », « à partir de », option « Dernier jour du mois », ligne de résumé × 5 locales (fr-BE référence ; en prod-visible ; nl-BE/de-DE/es-ES alignés glossaire).
- Démo dans `design-playground` (dev-only) pour la QA visuelle locale.
- Maj des tests existants `ChargesClient` / `ChargeEditDrawer` impactés par le remplacement des champs.

**Exclus (ne PAS bundler) :**

- Toute modif du schéma `charge.ts` ou du domaine (on réutilise `paymentDay`/`dueMonth`/`frequency` tels quels).
- **Dates irrégulières / échéancier à dates spécifiques** = feature « plans d'apurement » (séparée). THI-301 = cadences régulières uniquement.
- La dépense ponctuelle (`<input type=date>` natif intouché).
- La consolidation des deux forms (create inline vs edit drawer) en un seul — hors scope, on partage juste le `CadenceField`.
- Migration des charges vers l'atom `Drawer`.
- La refonte dashboard (épic Linear séparé).

## 7. Tests & DoD

- **`plan-reviewer` APPROVED avant tout code** (voie LOURDE : touche create + edit + nouveau composant).
- **Vitest `CadenceField`** : mensuel masque le mois-ancre ; non-mensuel affiche un select mois-ancre **éditable** ; l'option « Dernier jour » émet `paymentDay = 31` ; la ligne de résumé reflète l'état courant (mensuel vs mois calculés) ; changer ancre/fréquence recalcule le résumé ; `onChange` émet `{frequency, dueMonth, paymentDay}` corrects ; clamp NON dupliqué (le composant n'altère jamais `paymentDay`, aucun calcul de date côté UI).
- **Tests existants** create/edit mis à jour (sélecteurs).
- **QA agents** : `ui-auditor` + `mobile-ios-auditor` + `test-runner` (DoD ticket).
- **QA visuelle Chrome local** : `npm run dev` → `/design-playground` desktop + émulation iPhone (le form `/app/charges` réel est auth-gated, non atteignable en Chrome frais).
- Gates Ankora : typecheck 0, lint 0, lint:use-server, tests 100%.

## 8. Risques / points d'attention

- **a11y** : chaque `<select>` doit avoir un `<label>` associé (via `idPrefix` + `useId`). La ligne de résumé est `aria-live`-neutre (texte statique de confirmation, pas une alerte).
- **Régression tests** : le remplacement des `data-testid` des 3 champs par ceux du `CadenceField` cassera les sélecteurs e2e/unit existants → à mettre à jour dans le même lot.
- **Cohérence visuelle create vs edit** : les deux forms ont des conteneurs différents (inline vs drawer) ; `CadenceField` doit être agnostique du conteneur (pas de largeur fixe, hérite du flux parent).
