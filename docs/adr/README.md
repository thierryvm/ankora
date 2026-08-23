# Architecture Decision Records (ADR) — Ankora

Ce dossier regroupe les décisions d'architecture qui ont un impact structurel
sur Ankora. Chaque ADR documente **le contexte**, **les options envisagées**,
**la décision retenue** et **ses conséquences** pour que toute personne qui
rejoint le projet (ou toute future itération de Claude Code) puisse comprendre
pourquoi telle ou telle route a été prise — et ne pas la défaire par accident.

## Format

Les ADR suivent le format [MADR](https://adr.github.io/madr/) (Markdown Any
Decision Records) — light, lisible, versionnable en git.

Chaque ADR est immuable une fois `Accepted`. Pour le faire évoluer :

1. créer un nouvel ADR qui explique la bascule,
2. marquer l'ancien `Superseded by ADR-NNN`,
3. ne **jamais** réécrire l'ancien (l'historique est précieux).

## Statuts

| Statut       | Signification                                              |
| ------------ | ---------------------------------------------------------- |
| `Proposed`   | Rédigé, en attente de validation par Thierry               |
| `Accepted`   | Validé, décision active — respectée par le code et les PRs |
| `Deprecated` | Plus recommandé mais pas remplacé (ex : feature retirée)   |
| `Superseded` | Remplacé par un autre ADR (lien vers le successeur)        |

## Index

| #   | Titre                                                                                                                      | Statut                       | Date       |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| 001 | [No-PSD2 : agrégation via import manuel](./ADR-001-no-psd2.md)                                                             | Accepted                     | 2026-04-20 |
| 002 | [Modèle bucket (comptes + enveloppes)](./ADR-002-bucket-model.md)                                                          | Accepted                     | 2026-04-20 |
| 003 | [Système de notifications (in-app first)](./ADR-003-notifications-system.md)                                               | Accepted                     | 2026-04-20 |
| 004 | [Logger structuré (Pino + wrapper Edge)](./ADR-004-structured-logging.md)                                                  | Accepted                     | 2026-04-20 |
| 005 | [PR-3a anticipée comme prérequis architectural](./ADR-005-pr3a-anticipated-design-system.md)                               | Accepted                     | 2026-04-25 |
| 006 | [Testing strategy v1.0](./ADR-006-testing-strategy-v1.md)                                                                  | Accepted                     | 2026-04-26 |
| 007 | [Payment tracking consolidation](./ADR-007-payment-tracking-consolidation.md)                                              | Superseded by ADR-011 + 012  | 2026-05-03 |
| 008 | [Naming comptes user-defined (display_name + account_type)](./ADR-008-account-naming-and-typing.md)                        | Accepted                     | 2026-05-03 |
| 009 | [Capacité d'épargne réelle — KPI hero + formule (amendé 2026-05-09 : 3 concepts UX)](./ADR-009-capacite-epargne-reelle.md) | Accepted                     | 2026-05-03 |
| 010 | [Live decrement quotidien](./ADR-010-live-decrement-quotidien.md)                                                          | Accepted                     | 2026-05-03 |
| 011 | [Détection déficit + plan rattrapage 3 mois](./ADR-011-detection-deficit-plan-rattrapage.md)                               | Accepted                     | 2026-05-03 |
| 012 | [Assistant virements (calcul intelligent provisions ↔ factures du mois)](./ADR-012-assistant-virements.md)                 | Accepted                     | 2026-05-03 |
| 016 | [Tracking paiements multi-sources (présomption J+3 + import CSV 5 sources)](./ADR-016-tracking-paiements-multi-sources.md) | Proposed                     | 2026-05-08 |
| 017 | [Plans d'apurement (table installment_plans + génération auto N transactions)](./ADR-017-plans-apurement.md)               | Proposed                     | 2026-05-09 |
| 018 | [Provisions bidirectionnelles : audit trail OUT/IN](./ADR-018-provisions-bidirectionnelles-audit-trail.md)                 | Superseded by ADR-038        | 2026-05-09 |
| 019 | [Admin route security baseline](./ADR-019-admin-security-baseline.md)                                                      | Accepted                     | 2026-05-10 |
| 020 | [Frontière `atoms/` vs `ui/`](./ADR-020-atoms-vs-ui-canonical-frontier.md)                                                 | Superseded par 034           | 2026-05-18 |
| 021 | [Engagements dans le cockpit (effort lissé fini)](./ADR-021-engagements-dans-le-cockpit.md)                                | Proposed                     | 2026-05-18 |
| 022 | [Taxonomie des catégories et catégorisation assistée](./ADR-022-taxonomie-categories-et-categorisation-assistee.md)        | Accepted (amendé 043)        | 2026-07-26 |
| 023 | [Délai de grâce de la suppression de compte : 30 → 14 jours](./ADR-023-delai-de-grace-suppression-de-compte.md)            | Accepted                     | 2026-07-27 |
| 024 | [File de suppression de compte : reprise plutôt qu'atomicité](./ADR-024-file-de-suppression-de-compte.md)                  | Accepted                     | 2026-07-27 |
| 034 | [Suppression de `atoms/` et de `/design-playground`](./ADR-034-suppression-atoms-et-design-playground.md)                  | Accepted                     | 2026-07-29 |
| 035 | [Le vocabulaire des quatre chiffres](./ADR-035-vocabulaire-des-quatre-chiffres.md)                                         | Accepted                     | 2026-07-29 |
| 036 | [`--color-warning` à `#9a3412`](./ADR-036-token-warning-9a3412.md)                                                         | Accepted                     | 2026-07-29 |
| 037 | [La primitive `<Sheet>`, extraite et non décrétée](./ADR-037-primitive-sheet.md)                                           | Accepted                     | 2026-07-29 |
| 038 | [Le journal des mouvements](./ADR-038-journal-des-mouvements.md)                                                           | Accepted (amendé 040, 041)   | 2026-08-05 |
| 039 | [Portée des tokens « papier » de la landing (`.mkt-paper`)](./ADR-039-portee-tokens-marketing-papier.md)                   | Accepted (Q1 inversée 08-23) | 2026-08-08 |
| 040 | [Ordre d'exécution du journal (D0 en dernier)](./ADR-040-ordre-execution-du-journal.md)                                    | Accepted                     | 2026-08-10 |
| 041 | [Provisionner n'est pas payer](./ADR-041-provisionner-nest-pas-payer.md)                                                   | Accepted                     | 2026-08-10 |
| 042 | [File de suppression : compter les tentatives](./ADR-042-file-de-suppression-compter-les-tentatives.md)                    | Proposed                     | 2026-08-10 |
| 043 | [Les catégories que l'utilisateur crée lui-même](./ADR-043-categories-creees-par-l-utilisateur.md)                         | Accepted (amende 022)        | 2026-08-23 |

> **Note numérotation** : ADR-013/014/015 jamais rédigés (réservés en buffer lors de la consolidation ADR-007 → 011/012, finalement non utilisés). La numérotation reprend à 016 pour les ADRs de la session 2026-05-08.
>
> **025 à 033 ne correspondent à aucun fichier** — vérifié par glob le 23 août 2026. La raison n'est pas documentée et n'est pas inventée ici : le tableau saute de 024 à 034 parce que le dossier le fait.
>
> **Ce tableau a été complété le 23 août 2026** : dix ADRs existants (019 à 024, 034 à 037) n'y figuraient pas. Un index qui liste 21 entrées pour 31 fichiers ne se lit pas comme incomplet — il se lit comme exhaustif, et c'est pire. Les lignes ajoutées sont recopiées des en-têtes de chaque fichier, pas reconstituées de mémoire.

> **Pour les ADRs `Proposed`** (016, 017) : à valider en `Accepted` post-PR-D5 (implémentation effective des tables `installment_plans` + `provision_transfers` + tracking paiements multi-sources).
>
> **ADR-039** : le GO @thierry est arrivé le 23 août 2026, et il a **inversé la réponse Q1**. La portée `.mkt-paper` est supprimée, les six pigments sont devenus les valeurs claires de `@theme` (PR #442). L'ADR porte l'addendum daté ; cette ligne ne dit plus « attend le GO », parce que le code est en production.

> ⚠️ **Cet index est incomplet — mesuré le 8 août 2026.** `docs/adr/` contient
> 27 fichiers ; ce tableau en listait 15, et affichait 018 en `Proposed` alors
> que le fichier le déclare `Superseded` depuis le 5 août. La PR L1 corrige ces
> deux points et ajoute sa propre ligne (039). **Elle ne rattrape pas les onze
> restants** (019-024, 034-038) : ce serait un chantier de relecture à part
> entière, et l'ajouter à une PR de tokens le rendrait invérifiable. À traiter
> dans une PR dédiée.
>
> **Rattrapage partiel le 10 août 2026** : 038, 040 et 041 sont ajoutés parce
> qu'ils forment le programme **en cours** — un ADR qu'on ne trouve pas est un
> ADR qu'on re-dérive, et c'est arrivé le 10 août sur ADR-038 précisément. Les
> dix restants (019-024, 034-037) attendent toujours leur PR dédiée.

## Conventions de nommage

```
ADR-NNN-short-kebab-case-title.md
```

- `NNN` : numéro zéro-padded (001, 002, …)
- Titre en kebab-case, 3-6 mots max
- Tout en minuscules

## Quand rédiger un nouvel ADR ?

Un ADR est justifié si la décision :

- a des conséquences durables (schéma DB, dépendance tierce, contrat d'API,
  choix de framework) ;
- engage des coûts (monétaires, humains, techniques) à moyen terme ;
- est **non triviale à renverser** — si on peut revenir en arrière en 1h, pas
  besoin d'ADR, un commentaire dans le code suffit.

À l'inverse, **pas** d'ADR pour :

- un choix de nommage,
- un refactor local,
- un bump de dépendance mineur,
- une règle de linting.

## Lien avec le ROADMAP

Le ROADMAP pilote **quoi** et **quand** on livre. Les ADR documentent **pourquoi**
on livre de cette façon-là. Les deux se lisent ensemble : le ROADMAP pointe vers
les ADR qui conditionnent une PR, les ADR référencent le ROADMAP pour situer
leur contexte.
