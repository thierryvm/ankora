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

| #   | Titre                                                                        | Statut   | Date       |
| --- | ---------------------------------------------------------------------------- | -------- | ---------- |
| 001 | [No-PSD2 : agrégation via import manuel](./ADR-001-no-psd2.md)               | Accepted | 2026-04-20 |
| 002 | [Modèle bucket (comptes + enveloppes)](./ADR-002-bucket-model.md)            | Accepted | 2026-04-20 |
| 003 | [Système de notifications (in-app first)](./ADR-003-notifications-system.md) | Accepted | 2026-04-20 |
| 004 | [Logger structuré (Pino + wrapper Edge)](./ADR-004-structured-logging.md)    | Accepted | 2026-04-20 |

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
