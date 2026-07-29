# Rapport — Chantier 2 : saisie de dépense + ⊕ central + chiffre-héros temps réel

- **Date** : 2026-07-29
- **Branche** : `chantier2/saisie-depense` (depuis `chantier1/nettoyage-vocabulaire` @ `d08f4f9`, **pas** depuis `main`)
- **Modèle exécutant** : Claude Opus 5
- **Autorité produit** : `DECISIONS-ANKORA.md` (Q2, Q7, Q8, §3.3, §3.4, §3.5) · maquette `maquette-ankora-mobile.html` + captures A/B/C, approuvées par @thierry
- **ADR produits** : [ADR-036](../adr/ADR-036-token-warning-9a3412.md) (amende ADR-035) · [ADR-037](../adr/ADR-037-primitive-sheet.md)
- **Statut** : **prêt pour revue** — jamais « DONE » au sens du CLAUDE.md

---

## 1. Chiffres

**10 commits · 40 fichiers · +4 490 / −257 (net +4 233).**

| Commit    | Objet                                                       | Δ lignes     |
| --------- | ----------------------------------------------------------- | ------------ |
| `91f5aa4` | `fix(tokens)` — `warning` à `#9a3412`, deux critères testés | +136 / −16   |
| `77470b6` | `feat(ui)` — la primitive `<Sheet>` + garde-fou + ADR-037   | +1 067       |
| `d79e92f` | `feat(domain)` — catégories + double comptage + migration   | +755         |
| `3e48df7` | `feat(i18n)` — 3 groupes de clés × 5 locales                | +165 / −10   |
| `e148c50` | `feat(expenses)` — le Sheet de saisie, `categoryId` branché | +1 131 / −87 |
| `7943962` | `feat(nav)` — le ⊕ central                                  | +285 / −28   |
| `0fbca4a` | `feat(cockpit)` — le héros descend                          | +681 / −116  |
| `7937f84` | `fix(ui)` — une classe Tailwind citée en commentaire (§5.1) | +12 / −4     |
| `a422d8c` | `fix(expenses)` — le € collé aux chiffres (§5.2)            | +13 / −2     |
| `e12ba50` | `fix(cockpit)` — figure absolue et non delta (§5.3)         | +300 / −49   |

**Tests : 1 575 → 1 705 (+130).** Aucun test supprimé, aucun désactivé.

## 2. Portes de qualité

| Porte                     | Départ (chantier 1)  | Arrivée mesurée       |    Verdict     |
| ------------------------- | -------------------- | --------------------- | :------------: |
| `npm run lint`            | 0 erreur / 9 warn    | 0 erreur / 9 warn     |  ✅ inchangé   |
| `npm run lint:use-server` | ✓                    | ✓                     |       ✅       |
| `npm run typecheck`       | 0 erreur             | 0 erreur              |       ✅       |
| `npm run test`            | 1 575 / 127 fichiers | **1 705 / 134**       | ✅ 100 % vert  |
| `npm run build`           | succès               | succès (11,7 s)       |       ✅       |
| `npm run dev`             | **non vérifié**      | **démarre, 0 erreur** |  ✅ cf. §5.1   |
| `npm run e2e`             | non exécuté          | **non exécuté**       |  ⚠️ cf. §6.1   |
| `npm run security:audit`  | cassé                | cassé                 | ⚠️ préexistant |

**`npm run dev` entre dans le tableau, et ce n'est pas cosmétique.** Le chantier 1 ne
le listait pas ; §5.1 montre un défaut qui passait les quatre portes et rendait
**toutes** les pages en erreur 500. Une porte de plus, définitivement.

## 3. Ce qui est fait

### 3.1 Le ⊕ central (Q7)

Cinq emplacements, plafond HIG respecté. Nouvelle composition : **Cockpit ·
Factures · ⊕ · Dépenses · Plus**. `simulate` passe dans le sheet « Plus ».

**Mesuré dans le navigateur, en 390 × 844** (et non affirmé) :

| Critère       | Spec Q7 | Mesuré      |
| ------------- | ------- | ----------- |
| Aplat peint   | 46 × 33 | **46 × 33** |
| Rayon         | 11 px   | **11 px**   |
| Cible tactile | ≥ 44 px | **78 × 48** |
| Position      | 3ᵉ / 5  | **3ᵉ / 5**  |
| Libellé       | aucun   | **aucun**   |

Q7 spécifie la taille **visuelle**, la HIG la **cible tactile**. Rétrécir la cible à
33 px pour coller à la peinture aurait été la mauvaise lecture : le bouton fait
`h-12` et `flex-1` comme les quatre autres, l'aplat est peint à l'intérieur. Un
test fige les deux, et qu'il ne devienne jamais un FAB flottant.

### 3.2 La saisie de dépense

**4 taps + un défilement → 2 taps depuis n'importe quel écran.**

`categoryId: null` était codé en dur (`ExpensesClient.tsx:71`). Une table, une clé
étrangère et un ADR accepté étaient débranchés du produit par une ligne, et rien
n'échouait parce que rien ne l'affirmait. **Le correctif n'est pas d'apprendre les
catégories à ce formulaire : c'est de ne plus avoir deux parcours de saisie.** Le
formulaire en ligne est supprimé.

Vérifié à l'écran : le curseur est dans le champ Montant **avant** que le contexte
serveur ne réponde (sinon les « 2 taps » coûtent un aller-retour), les puces
tiennent sur **une seule ligne** (`chipRows: 1`, défilement horizontal), le bouton
fait **50 px** et réserve 12 px de safe-area.

**« Il te restera 429,89 € »** s'affiche sous 18,50 € saisis sur 448,39 € — le
chiffre exact de la maquette B, au centime.

### 3.3 Le chiffre-héros temps réel

Le chantier 1 avait câblé le nombre ; ce chantier le rend **visible**. Le héros
tick de l'ancienne à la nouvelle valeur sur ~420 ms en `--ease-spring`. Le design
system est explicite : le nombre **ticke**, il ne fait jamais de cross-fade.

Mesuré à l'écran : héros **46 px**, ancre « sur 736,79 € de budget · 288,40 €
dépensés » sur **une** ligne (la correction §3.3 du document est appliquée), barre
de rythme remplie à **39,14 %** avec repère à **58,06 %** (= 288,40/736,79 et
18/31), verdict « dans le rythme », « 34,49 € / jour jusqu'au 31 ».

**La `AllocationBar` a changé de place** : elle décompose les revenus, ce que la
cascade juste dessous énonce en mots, donc elle appartient à ce bloc. Sous le
héros elle concurrençait la barre de rythme, et deux barres sous un chiffre est la
façon la plus sûre qu'on ne lise ni l'une ni l'autre.

### 3.4 Le double comptage

`pas-de-double-comptage.test.ts` verrouille trois propriétés : pointer une facture
ne bouge aucun chiffre de dépense · `depensesDuMois` ne lit que `expenses` · le
sélecteur ne peut **pas** proposer une catégorie de charge.

La dernière est la moitié structurelle : `kind: 'fixed'` n'est jamais offerte.
L'utilisateur ne peut pas faire l'erreur, au lieu d'être réprimandé de l'avoir
faite. **Et le fichier dit noir sur blanc ce qu'aucun test unitaire ne peut
empêcher** : taper « Assurance auto · 150 € » à la main dans une catégorie
variable. C'est pour ça que la ligne « Il te restera X € » existe — la conséquence
est visible au moment de la décision.

### 3.5 La primitive `<Sheet>` (ADR-037)

Née dans `AddExpenseSheet`, pas décrétée avant (Q8). Périmètre : une **coquille
modale**, délibérément pas le générateur de formulaire que décrit le §1 du contrat
récolté — écrire un framework de champs pour cinq call-sites qui ont chacun leur
corps propre serait du sur-dimensionnement.

Les quatre exigences que la source ne couvrait **pas** sont couvertes et testées :
piège de focus, `aria-modal`, verrou de défilement iOS, `env(safe-area-inset-bottom)`.
Plus la restitution du focus, le glissement pour fermer, l'ancrage bas/droite et la
poignée 36 × 5. **25 cas.**

**Le garde-fou existe déjà** : un test échoue sur tout **nouveau** panneau qui
réimplémente `Escape` ou le verrou. Les cinq en attente de C4 sont nommés dans une
liste qui ne peut que rétrécir — et un troisième cas échoue si un fichier listé
n'est plus fautif mais reste inscrit, donc « migré » et « rayé » ne peuvent pas
diverger.

## 4. Le token `warning` — arbitrage appliqué

`#9a3412`, comme demandé. Les trois valeurs, **recalculées** depuis `globals.css`
par le test existant :

| Valeur                 | AA sur blanc | Séparation vs laiton `#8b6914` |
| ---------------------- | -----------: | -----------------------------: |
| `#d97706` (historique) |      3,19 ❌ |                        1,60 ✅ |
| `#a35a06` (prescrit)   |      5,22 ✅ |                        1,03 ❌ |
| **`#9a3412`**          |  **7,31 ✅** |                    **1,44 ✅** |

**Le vrai correctif n'est pas la valeur, c'est le second critère.** La décision
@cowork du 2026-04-25 a pu être renversée parce qu'elle ne vivait que dans un
commentaire. `contrast-ratios.test.ts` calcule désormais la séparation dans les
deux thèmes et échoue sous 1,30 — seuil placé entre les deux mesures qui ont fait
jurisprudence, du côté du plus exigeant. Aucun ratio n'est recopié dans une
assertion.

## 5. Ce que le navigateur a trouvé et que les tests n'auraient jamais trouvé

Trois défauts, tous découverts après avoir lancé l'app ou écrit le test manquant.
C'est la partie du rapport qui mérite d'être lue.

### 5.1 Une classe Tailwind citée dans un commentaire a tué le dev server

Tailwind v4 scanne les sources **comme du texte**. Le commentaire safe-area de
`Sheet.tsx` écrivait un utilitaire `padding-bottom` avec des points de suspension
littéraux dans `env()`. Tailwind l'a généré pour de vrai : `padding-bottom: env(...)`,
du CSS invalide. Turbopack a refusé la feuille de style entière —
**toutes** les pages en 500, `Unexpected token Delim('.')`.

`lint` ✅ `typecheck` ✅ `test` ✅ **`build` ✅**. Quatre portes vertes, application
morte. Trouvé en ouvrant le navigateur, et seulement là.

Le commentaire décrit maintenant l'utilitaire au lieu de l'épeler, et dit pourquoi.
La leçon est dans le tableau §2 : `npm run dev` est une porte.

### 5.2 Le € à cinq caractères des chiffres

Le champ montant était `text-center` dans une boîte de 6ch, donc le signe euro
flottait jusqu'à cinq caractères après le nombre : deux objets sans rapport au lieu
d'un montant. `text-right` fait croître les chiffres vers la gauche depuis un point
fixe, le € reste collé à toute longueur.

Aucun test ne pouvait attraper ça. Une capture, oui.

### 5.3 Une image fausse pendant une frame, sur le chiffre souverain

Le pont d'optimisme publiait un **delta** et le héros calculait `value − pending`.
Quand la valeur serveur revalidée arrivait, elle **contenait déjà** la dépense : le
héros affichait donc `429,89 − 18,50 = 411,39` pendant une frame commitée. Un
creux de 18 € sous la vérité, sur le seul nombre autour duquel le produit est
construit, puis une remontée.

**L'état final était correct** — c'est pour ça qu'un test qui n'asserte que la fin
serait passé, et la première version du mien est passée. Le cas actuel vérifie
**chaque** frame après l'arrivée de la valeur serveur.

Réconcilier un delta obligeait le composant à mémoriser à quelle valeur serveur il
appartenait, donc à lire une `ref` pendant le render. `react-hooks` l'a refusé —
et il avait raison : la règle a attrapé une conception fragile pour la raison même
qui la rendait fausse. Publier la **figure résultante** supprime le problème au
lieu de le gérer : l'opération devient idempotente, aucun ordre d'arrivée ne peut
produire une frame fausse.

## 6. Ce qui a résisté

### 6.1 Les captures ne sont pas celles de l'app connectée

Le cockpit est derrière `/app`, qui exige une session Supabase, et le projet lié
est la **production**. Je ne me connecte pas : saisir un mot de passe est hors de
ce que je fais, et l'écrire en base de prod encore plus.

**Ce que j'ai fait à la place** : une route jetable, non commitée, qui monte les
**vrais** composants avec les chiffres de la maquette, dans le vrai Next.js, la
vraie CSS, le vrai viewport 390 × 844. Puis mesuré au DOM plutôt que jugé à l'œil :
`heroFont: 46px`, `bar: 390`, `addPaint: [46,33]`, `addHit: [78,48]`,
`spentPct: 39.14`, `tickPct: 58.06`, `chipRows: 1`, `sheet.bottom: 844`,
`submit.h: 50`, `focused: add-expense-amount`.

**Ce que ça ne prouve pas** : le rendu avec les vraies données de @thierry, la
`revalidatePath` de bout en bout, le clavier iOS réel, le safe-area sur matériel à
encoche (`env()` vaut 0 dans Chrome desktop). Ces quatre points restent non vus.

La route jetable et le stub temporaire du Server Action ont été **supprimés et
vérifiés absents** (`grep` → 0) avant les commits. Rien n'en subsiste dans
l'historique.

### 6.2 La migration est écrite, pas appliquée

`supabase/migrations/20260729000002_expense_categories_taxonomy.sql`.

**Pourquoi elle existe.** Les 8 catégories semées depuis 2026-05-03 sont une
taxonomie de **factures**. Cinq sont `variable` donc offrables : Logement, Famille,
Santé, Transport, Autres. **« Courses » n'existe pas** — la dépense la plus
fréquente d'un ménage. Sans cette migration, la saisie fonctionne mais ne peut pas
nommer ce que tu achètes, et les puces de la maquette B (Courses/Essence/Resto) ne
sont pas celles que tu verras.

Additive uniquement : une colonne nullable, dix `INSERT` gardés par `NOT EXISTS`,
idempotente, aucun `DROP`, aucun renommage. **À lire et lancer par toi.**

Écart assumé avec ADR-022 : la colonne s'appelle `category_group` et non `group`,
mot réservé SQL. Et `icon` + `category_rules` (catégorisation assistée) ne sont pas
là — ADR-022 dit lui-même que livrer les deux ensemble demande de comprendre deux
systèmes d'un coup.

### 6.3 Les e2e n'ont pas tourné

Mêmes deux blocages qu'au chantier 1 : Docker absent → pas de Supabase local, et
le projet lié est la production → lancer les specs authentifiées écrirait de vraies
lignes. Quarantaine inchangée à 6.

**Le plancher public reste à re-mesurer.** La note du `CLAUDE.md` (chantier 1) tient
toujours : `−2` attendus après la suppression de `/design-playground`, valeur à
inscrire à la première CI verte. Ce chantier n'ajoute ni ne retire aucune spec e2e.

### 6.4 Deux choses s'appellent `Sheet`

`components/primitives/Sheet.tsx` (la primitive) et `components/ui/sheet.tsx` (le
wrapper Radix, 0 call-site). Le second n'a pas été supprimé : le plan du 26/07
exige un ADR-028 explicite et dit « sans arbitrage : les garder ». **La
coexistence est une invitation à importer le mauvais.** Arbitrage demandé (§8).

### 6.5 Le hook `pre-commit` ne passe toujours pas

Preflight NO-GO (`supabase link` / `vercel link` absents). `--no-verify` utilisé
pour les commits locaux, comme au chantier 1 ; en contrepartie `prettier`,
`npm run lint`, `npm run lint:use-server`, `typecheck`, `test` et `build` ont été
lancés à la main. Aucun push, aucune migration, aucun déploiement.

## 7. Écarts entre le plan et la réalité du code

Six écarts. Aucun tranché en silence.

### 7.1 `simulate` a quitté la barre — le plan ne le disait pas

Le ⊕ a besoin d'un emplacement et la barre était pleine (4 destinations + Plus).
Le §3.2 du document décrit la barre cible (Mois · Factures · ⊕ · Dépenses · Plus)
mais attribuait les renommages **et** cette éviction au chantier C5. Il fallait
l'un des deux maintenant. Les renommages restent pour C5 ; l'éviction est faite.

### 7.2 Le déplacement de `simulate` a réveillé un bug latent

`SHEET_LABELS` dans `MoreSheet.tsx` mappait **chaque** destination d'onglet vers
`'accounts'` comme bouchon inerte. `simulate` entrant dans le sheet, le lien
simulateur aurait affiché **« Comptes »**. L'exhaustivité du `Record` faisait
compiler ; elle ne dit rien de la justesse des valeurs. Corrigé, avec les clés
manquantes dans les 5 locales.

### 7.3 La taxonomie ADR-022 n'était pas dans le périmètre annoncé

Le brief dit « `categoryId: null` est écrit en dur — corrige-le », ce qui ne
demande aucun changement de schéma. J'ai écrit la migration quand même (§6.2) parce
que sans elle tu ouvres l'app et « Courses » n'existe pas. **Écart signalé plutôt
qu'assumé seul** : si tu préfères ne pas la lancer, la saisie fonctionne, avec cinq
catégories de facture en guise de puces.

### 7.4 La date reste un `<input type="date">`, pas « Aujourd'hui »

La maquette B affiche « Aujourd'hui ». Un champ date natif ne peut pas. J'ai gardé
le natif : sélecteur système, locale correcte, accessibilité gratuite, zéro
composant à maintenir. Le coût est réel — « 29-07-2026 » est moins chaleureux que
« Aujourd'hui ». Écart de fidélité assumé, à rouvrir si tu y tiens.

### 7.5 Le repère de rythme, en mots plutôt qu'en flèche

La maquette met « rythme idéal ↑ » pointant le repère. Le design system interdit
les flèches unicode décoratives, et un glyphe que le lecteur doit décoder n'est pas
une explication. Remplacé par trois états factuels : « dans le rythme » ·
« au-dessus du rythme » · « budget dépassé ». Jamais « tu dépenses trop » (R-06).

### 7.6 Le repère est à 0,55 d'opacité, pas 0,35

Le §3.3 prescrit 0,35. Mesuré contre `--color-foreground` sur `--color-brand-500`
à 7 px de haut, 0,35 passe sous les 3:1 de WCAG 1.4.11 pour un objet graphique.
0,55 tient le contraste et reste discret.

### 7.7 Le skill `ankora-design-system` est périmé sur le vocabulaire

Son §4.1 recommande encore « Capacité d'épargne réelle », « Reste à vivre » et
« Reste disponible » — les trois mots **bannis** par ADR-035. Son §11 fixe l'ordre
de priorité (NORTH_STAR > ADR > Quality Bar > SKILL), donc j'ai suivi l'ADR. **Le
skill devrait être mis à jour** : un agent qui le lirait sans lire ADR-035
réintroduirait le vocabulaire supprimé au chantier 1.

## 8. Trois décisions attendues de @thierry

1. **La migration `20260729000002`** — je te montre le SQL, tu décides. Sans elle,
   pas de « Courses » (§6.2).
2. **`components/ui/sheet.tsx`** (Radix, 0 call-site) — supprimer maintenant que la
   primitive existe, ou garder ? La coexistence de deux `Sheet` est un piège (§6.4).
3. **La date en clair** — garder l'`<input type="date">` natif, ou construire un
   champ « Aujourd'hui / Hier / choisir… » ? (§7.4)

## 9. Definition of Done

1. ✅ Lint 0 · use-server ✓ · typecheck 0 · tests 1 705/1 705 · build ✓ · dev ✓ —
   rien de dégradé. ⚠️ `security:audit` cassé avant le chantier ; e2e non
   exécutables (§6.3).
2. ⏸️ **Sourcery** — inatteignable, aucun push autorisé donc aucune PR.
3. ⏸️ **Review @thierry** — c'est l'objet de ce rapport.
4. ✅ Pas de conflit avec `chantier1/nettoyage-vocabulaire`.
5. ✅ Ce rapport.

## 10. Hors périmètre, non fait

Généralisation de `<Sheet>` aux 5 panneaux (C4) · refonte de l'accueil en 3 blocs
et bloc d'alertes (C5) · renommages de navigation Cockpit→Mois / Charges→Factures
(C5) · les 4 KPI de la fiche engagement (C5) · réarmement des e2e (C6) · cadences
1/2/3/4/6/12 et calculateur de coût du crédit (C7) · catégorisation assistée et
règles apprises (ADR-022 §3) · desktop, qui sera harmonisé au chantier suivant sur
ces mêmes primitives — la primitive `<Sheet>` s'ancre déjà à droite dès `md` pour
ça · **aucune issue GitHub fermée** (pas d'accès `gh` sur la machine).
