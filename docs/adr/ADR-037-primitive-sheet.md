# ADR-037 — La primitive `<Sheet>`, extraite et non décrétée

- **Statut** : Accepted
- **Date** : 2026-07-29
- **Accepté le** : 2026-07-29 — décision Q7/Q8 et §3.5 de [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md), approuvées par Thierry vanmeeteren
- **Proposé par** : @cc-ankora
- **Deciders** : Thierry vanmeeteren, @cc-ankora
- **Tags** : `architecture`, `ui`, `a11y`, `ios`
- **Portée** : Chantier 2 (naissance) · Chantier 4 (généralisation aux 5 panneaux restants)
- **Contrat récolté** : [`docs/specs/sheet-primitive-contract.md`](../specs/sheet-primitive-contract.md)

---

## Contexte & problème

Six panneaux glissants sont partis en production sans qu'aucun ne partage une
ligne de code avec un autre. Le relevé de l'audit, vérifié fichier par fichier :

| Fichier                        | Lignes | Piège de focus | `safe-area` |
| ------------------------------ | -----: | :------------: | :---------: |
| `ChargeEditDrawer.tsx`         |    254 |       ❌       |     ❌      |
| `ExpenseEditDrawer.tsx`        |    311 |       ❌       |     ❌      |
| `AjusterResteAVivreDrawer.tsx` |    306 |       ❌       |     ❌      |
| `SimulatorDrawer.tsx`          |    211 |       ✅       |     ✅      |
| `MoreSheet.tsx`                |    370 |       ✅       |     ✅      |
| `HeaderNav.tsx`                |    420 |       ✅       |     ✅      |

**Les trois corrects sont les trois écrits en dernier.** La qualité d'un panneau
suit sa date d'écriture, pas un contrat — et les trois défaillants sont
précisément les panneaux d'édition, ceux qu'on ouvre tous les jours.
`AjusterResteAVivreDrawer` a été supprimé par ADR-035 ; il en reste cinq.

## Decision drivers

| Driver                                   | Pourquoi c'est décisif                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| L'a11y modale ne doit plus être réécrite | Chaque réécriture est un tirage au sort ; 3 sur 6 ont perdu               |
| Le safe-area iOS est un bug ouvert       | Issue #152 — le pied du panneau collide avec l'indicateur d'accueil       |
| Une primitive s'extrait                  | Q8 : conçue _a priori_, elle a de bonnes chances d'être mal découpée      |
| La régression doit être impossible       | Pas « corrigée » : le dépôt a déjà prouvé qu'un contrat non testé se perd |

## Decision

### 1. La primitive naît dans le parcours de saisie, pas avant

`src/components/primitives/Sheet.tsx`, écrite **pour** `AddExpenseSheet` et
extraite d'elle. L'audit avait placé un chantier `<Sheet>` de 5 jours **avant**
les dépenses ; Q8 l'a inversé, et le tableau ci-dessus est la preuve du
raisonnement : les trois panneaux corrects le sont parce qu'ils ont appris des
précédents. Une primitive dérivée du call-site écrit avec le plus de soin trouve
les bonnes coutures ; dérivée de six call-sites existants, elle les devine.

### 2. Périmètre : une coquille modale, délibérément pas un générateur de formulaire

Le contrat récolté (§1, 35 cas) décrit très largement le **générateur de
formulaire** qu'était aussi `atoms/Drawer` : sept types de champs, filtrage
monétaire, suppression en deux temps. **Ce n'est pas repris.** Écrire un
framework de formulaire pour cinq call-sites qui ont chacun déjà leur corps
propre, différent, serait la définition du sur-dimensionnement.

Ce qui se généralise est le §2 — les quatre exigences d'a11y modale que la source
ne couvrait **pas** — plus l'ancrage, la poignée et le glissement. C'est
exactement le contenu de la primitive. Les enfants portent leur contenu.

### 3. Le contrat, entièrement testé

`role="dialog"` · `aria-modal` · nom accessible · `Escape` · clic sur le voile ·
piège de focus `Tab`/`Shift+Tab` · focus initial (`initialFocusRef` → premier
champ → bouton de fermeture) · **restitution du focus au déclencheur** · verrou
de défilement iOS · `env(safe-area-inset-bottom)` · bas sur mobile / droite dès
`md` · poignée 36 × 5 · glissement vers le bas pour fermer.

19 cas dans `__tests__/Sheet.test.tsx`. Les quatre exigences du §2 y sont
regroupées et nommées comme telles : ce sont celles qui manquaient, et elles
manquaient parce que rien ne les vérifiait.

### 4. Pas Radix, et pour une raison mesurée

`@radix-ui/react-dialog` est déjà une dépendance et fournirait gratuitement le
piège, `aria-modal` et la restitution du focus. Il n'est pas utilisé **à cause du
verrou de défilement** : THI-250 a établi dans ce dépôt que iOS Safari ignore
`overflow: hidden` sur `<body>` pour le rubber-band, et que le correctif qui a
tenu est `position: fixed` + un `scrollY` capturé, restauré en
`behavior: 'instant'` (le document porte `scroll-behavior: smooth`).

Ce verrou, plus le safe-area, le glissement et l'ancrage bas/droite, représentent
l'essentiel du fichier. Radix aurait fourni le tiers facile. Le
`src/components/ui/sheet.tsx` existant (Radix, 0 call-site, conservé faute de
l'arbitrage ADR-028) témoigne d'ailleurs que ce chemin avait déjà été tenté sans
prendre.

### 5. Le mouvement passe par des classes, jamais par un `style` inline

`proxy.ts` pose `style-src 'self' 'nonce-…'` sans `'unsafe-inline'` ni
`'unsafe-hashes'` : **un attribut `style` est bloqué**. Un `style={{ transform }}`
aurait fonctionné dans tous les tests et été supprimé en production — le panneau
serait apparu sans glisser, et le glissement aurait été mort. Exactement la classe
de panne muette pour laquelle ce dépôt entretient un agent.

Donc : entrée/sortie = deux états discrets → classes Tailwind ; glissement =
continu → écriture CSSOM (`panel.style.transform = …` depuis un gestionnaire
d'événement), que la CSP ne régit pas. Un test asserte le déplacement CSSOM,
faute de quoi la régression serait invisible en développement et totale en
production.

### 6. Le garde-fou : plus aucun panneau écrit à la main

`__tests__/sheet-is-the-only-modal.test.ts` parcourt `src/**/*{Drawer,Sheet}*.tsx`
et échoue si un fichier réimplémente `Escape` ou le verrou de défilement.

Les cinq panneaux en attente de migration sont **nommés dans une liste
d'exception**, parce que leur migration est le chantier C4 — et qu'un garde-fou
écrit après C4 n'aurait jamais rien empêché. La liste ne peut que **rétrécir** :
un troisième cas échoue si un fichier listé n'est plus fautif mais reste inscrit,
donc « migré » et « rayé de la liste » ne peuvent pas diverger.

## Conséquences positives

- Un seul endroit où l'a11y modale existe ; cinq à venir qui en héritent
- Issue #152 (safe-area) est structurellement close pour tout nouveau panneau
- La restitution du focus et le glissement, absents des six panneaux, existent
- La régression devient impossible, pas seulement corrigée

## Conséquences négatives / risques

- ⚠️ **Deux choses s'appellent `Sheet`** : `components/primitives/Sheet.tsx` (la
  primitive) et `components/ui/sheet.tsx` (le wrapper Radix, 0 call-site). Le
  second n'a pas été supprimé — le plan du 26/07 exige un ADR-028 explicite et
  dit « sans arbitrage : les garder ». **Arbitrage demandé** : la coexistence est
  une invitation à importer le mauvais.
- ⚠️ Le glissement pour fermer n'est câblé que sur la zone d'en-tête. Un
  glissement partant du contenu défile le contenu — comportement iOS, et le seul
  moyen que les deux gestes coexistent sans heuristique de position de scroll.
- ⚠️ Le générateur de formulaire du contrat récolté §1 n'est pas repris. Si C4
  révèle que les cinq panneaux partagent réellement leur machinerie de champs, ce
  sera une seconde primitive (`<SheetForm>`), pas un élargissement de celle-ci.

## Refs

- [`docs/specs/sheet-primitive-contract.md`](../specs/sheet-primitive-contract.md) — le contrat récolté
- [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md) §3.5, §Q8
- [ADR-034](ADR-034-suppression-atoms-et-design-playground.md) — la suppression qui a produit la récolte
- [ADR-035](ADR-035-vocabulaire-des-quatre-chiffres.md) — supprime le 6ᵉ panneau
- `src/components/layout/MoreSheet.tsx` — source du verrou de défilement iOS (THI-250)
