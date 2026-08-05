# ADR-035 — Le vocabulaire des quatre chiffres

- **Statut** : Accepted
- **Date** : 2026-07-29
- **Accepté le** : 2026-07-29 par @thierry — décisions Q1, Q2 et Q3 de [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md)
- **Amendé le** : 2026-08-05 par @thierry — « provisions » désignait deux nombres de périmètres différents. Cf. §Amendement en fin de document : **Lissage** (flux) · **À virer vers l'épargne** (mouvement) · **Provisions** (stock)
- **Proposé par** : @cowork (arbitrage produit) + @cc-ankora (relevé factuel du code et des clés i18n)
- **Deciders** : @thierry, @cowork, @cc-ankora
- **Tags** : `produit`, `vocabulaire`, `i18n`, `domain`, `cockpit`
- **Portée** : Chantier 1 « nettoyage + vocabulaire » (C2, C3)
- **Amende** : [ADR-009](ADR-009-capacite-epargne-reelle.md) (la capacité d'épargne cesse d'être un chiffre d'interface)

> **Glossaire des handles** — source canonique : [`docs/design/trio-agents.md`](../design/trio-agents.md).

---

## Contexte & problème

**Le mot « reste à vivre » désigne quatre nombres différents dans l'application.** Relevé au 29/07/2026 sur `messages/fr-BE.json` et le code :

| Où                          | Libellé affiché                              | Ce que c'est réellement                                |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Cockpit, chiffre-héros      | « Reste disponible »                         | `revenus − charges − provisions lissées − engagements` |
| Cockpit, tuile du flux      | « Reste à vivre »                            | une **enveloppe budgétaire saisie par l'utilisateur**  |
| Cockpit, message capacité   | « C'est ton vrai reste à vivre chaque mois » | la **capacité d'épargne** — encore un autre nombre     |
| Page Dépenses, gros chiffre | « Reste à vivre — juillet »                  | l'enveloppe **moins** les dépenses saisies             |

Un écran contredit donc l'autre à la simple lecture. Et deux constats de veille aggravent le problème en Belgique :

1. **« Reste à vivre » a deux propriétaires établis.** En médiation de dettes et en règlement collectif de dettes, c'est le montant qu'**un juge garantit au débiteur** avant tout remboursement de créancier. En crédit, c'est `revenus − charges fixes`, avec des seuils de référence (≈ 700 €/mois isolé, 1 100 € couple). Aucun des deux sens ne correspond exactement à celui d'Ankora.
2. **« Reste disponible » — le nom actuel du chiffre-héros — signifie le contraire de ce qu'Ankora lui fait dire.** Chez le médiateur de dettes belge, le « disponible » est **ce qui part aux créanciers**, pas ce qui reste au ménage. Pour un utilisateur qui a croisé ce vocabulaire, c'est un contresens direct.

## Decision drivers

| Driver                          | Pourquoi c'est décisif                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Un mot, un nombre               | C'est la propriété qui rend le prototype HTML plus lisible que l'app                                 |
| Aucun terme emprunté à un tiers | L'app n'a pas à se battre avec une définition bancaire et une définition judiciaire pour le même mot |
| Lisibilité en une demi-seconde  | Le chiffre-héros est lu en caisse, le pouce sur l'écran                                              |
| Coût de renommage maîtrisé      | Renommer le domaine financier est le risque le plus cher du chantier ; il doit être évité            |
| Fermer la boucle de rétroaction | Saisir une dépense doit faire bouger le grand chiffre — c'est la fonctionnalité centrale attendue    |

## Decision

### 1. Les quatre chiffres, leur nom définitif et leur formule exacte

Ce tableau est la **source de vérité**. Aucune clé i18n ne doit introduire un cinquième nom.

| #   | Nom affiché (fr-BE) | Clé i18n                                   | Nom de code                    | Formule exacte                                                                                     |
| --- | ------------------- | ------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | **Il te reste**     | `dashboard.situation.heroLabel`            | `ilTeReste`                    | `resteDisponible − depensesDuMois`                                                                 |
| 2   | **Budget du mois**  | `dashboard.situation.flow.resteDisponible` | `resteDisponible` _(inchangé)_ | `revenus − chargesFixes − provisionsLissees − engagementsMensuels`                                 |
| 3   | **Dépensé ce mois** | `dashboard.situation.flow.depense`         | `depensesDuMois`               | `Σ expenses.amount` où `occurred_on` ∈ [1er du mois ; aujourd'hui]                                 |
| 4   | **Épargne estimée** | `dashboard.situation.flow.epargneEstimee`  | `epargneEstimee`               | `resteDisponible − depensesDuMois × joursDuMois / joursEcoules` ; **`null` si `joursEcoules < 7`** |

**« Il te reste » est une phrase, pas un terme, et c'est délibéré.** Un chiffre-héros répond à une question (« je peux dépenser ces 60 € ? »). Une phrase verbale y répond ; un terme oblige à se rappeler sa définition. C'est la seule des quatre lignes qui doit être compréhensible sans avoir lu la documentation.

**Mots bannis de toute l'UI et de tous les fichiers de messages** : _reste à vivre · reste disponible · budget vie courante · disponible aujourd'hui · capacité d'épargne · reste du mois_.

Jalon vérifiable :

```bash
grep -ric "reste à vivre\|reste disponible\|budget vie courante\|disponible aujourd'hui\|capacité d'épargne" messages/
# → 0
```

> **Correction du jalon, 5 août 2026.** Il cherchait `vie courante` seul, et rendait donc
> **6 sur `fr-BE.json`** — un rouge permanent qu'aucun travail ne pouvait éteindre. Les six
> occurrences sont le **nom d'un compte** (« Virement mensuel vers Vie Courante »,
> « Principal → Vie Courante »), pas le terme d'enveloppe banni : « Vie Courante » est l'un
> des trois comptes du modèle source, il reçoit un virement réel tous les mois, et son nom
> doit rester lisible dans l'interface qui pilote ce virement.
>
> Le terme banni était `budget vie courante`, et c'est lui que le jalon cherche désormais.
> **Un jalon qui ne peut pas atteindre son seuil se fait ignorer, puis arrondir** — ce qui
> coûte plus cher que de ne pas en avoir. Mesuré après correction : `0` sur les cinq
> locales.

### 2. `resteDisponible` reste le nom de code, et n'est PAS renommé

**Zéro renommage dans `src/lib/domain/` pour ce champ.** Il devient le nom interne de « Budget du mois ». C'est ce qui économise le risque le plus cher du chantier : le domaine financier porte 501 tests, 98 % de couverture et **zéro correctif en 233 commits**. On lui retire un libellé, pas son identité.

### 3. Le chiffre-héros passe en temps réel

`ilTeReste` descend quand l'utilisateur saisit une dépense. « Budget du mois » devient la ligne d'ancrage juste dessous, stable sur le mois.

**Couleur : encre neutre par défaut. `--color-danger` uniquement si le chiffre est négatif. Jamais de vert** — quand tout est vert, plus rien ne signale.

### 4. L'enveloppe budgétaire disparaît entièrement

Une fois le héros en temps réel, l'enveloppe « vie courante » n'a plus de travail : elle répondait à « puis-je dépenser ? », le héros y répond mieux et sans demander à l'utilisateur d'inventer un nombre. Garder les deux réinstallerait exactement la maladie qu'on soigne.

Conséquences :

- `reste_a_vivre_default numeric not null default 500.00` cesse d'être lue. La valeur `500` en dur côté TypeScript (`src/lib/data/workspace-snapshot.ts:349`) disparaît aussi — elle était un second point de vérité silencieux.
- `SituationDuMois.budgetVieCourante` et `.capacite` disparaissent ; `ilTeReste`, `depensesDuMois` et `epargneEstimee` apparaissent.
- `capaciteEpargneReelle()` cesse de prendre `resteAVivre`. **Son alias legacy `plafondQuotidien` part avec** : il n'existait que pour accepter `resteAVivre` sous son ancien nom, et son `@deprecated` annonçait déjà « Will be removed before v1.0 publique ».
- `previsions.ts` porte `plafondQuotidien` en **champ requis** (`:20`, `:51`) avec zéro call-site de production. Il part également — sans quoi l'affirmation « le concept d'enveloppe disparaît entièrement » serait fausse.
- `AjusterResteAVivreDrawer.tsx` (306 lignes) est **supprimé**, pas migré.
- La barre de progression ne se mesure plus contre une enveloppe mais porte un **repère de rythme** à `joursEcoules / joursDuMois`. Il ne demande **aucune saisie utilisateur** — c'est ce qui le rend supérieur à une enveloppe.

### 5. Invariant anti-double-comptage

> Une occurrence de `charge` ou de `commitment` n'est **jamais** une `expense`. Les deux univers sont disjoints. La table `expenses` ne contient que du variable saisi à la main.

**Ce garde-fou n'existe pas aujourd'hui** (`grep -i expense src/lib/domain/cockpit/` → 0 résultat). Il devient critique : `ilTeReste` combine pour la première fois les charges lissées (via `resteDisponible`) et les dépenses brutes. Sans lui, une échéance pointée « payée » **et** ressaisie comme dépense serait déduite deux fois, et le héros deviendrait faux sans que personne ne comprenne pourquoi. **Un test dédié le fige.**

Corollaire UX : les catégories de charge (Loyer, Assurance, Crédit…) doivent être **exclues** du sélecteur de catégorie de dépense.

## Conséquences positives

- Un mot, un nombre — la propriété qui manquait
- La boucle « je dépense → je vois l'effet » se ferme
- Aucun terme du glossaire n'appartient à un tiers (ni banque, ni justice)
- Le domaine financier n'est pas renommé : le risque le plus cher du chantier est évité
- Un invariant financier réel remplace une convention tacite

## Conséquences négatives / risques

- ⚠️ 5 locales × 1 451 clés à maintenir en parité (verrouillée par `situation-i18n.test.ts`)
- ⚠️ La spec e2e `dashboard-simulator-drawer.spec.ts` attend le texte « Reste disponible », qui n'existera plus. Elle est **déjà en quarantaine** ; sa raison est mise à jour.
- ⚠️ **Écart de documentation signalé** : `DECISIONS-ANKORA.md` §3.1 annonce le namespace i18n `cockpit.hero.*`. Le namespace réel dans le dépôt est `dashboard.situation.*`. Le namespace existant est conservé ; le document sera corrigé.
- ⚠️ **Renversement d'une décision de token, signalé et non tranché unilatéralement.** `DECISIONS-ANKORA.md` §3.6 impose `--color-warning: #a35a06` (clair) et `#fbbf24` (sombre) pour atteindre AA. Or `src/app/__tests__/globals-tokens.test.ts:47` verrouille explicitement `#d97706` au titre d'une **décision @cowork du 2026-04-25**, motivée par la nécessité de garder le warning distinct du laiton `--color-accent-text` (« semantic confusion : warning vs admin pigment »).

  **Mesuré** (calcul WCAG 2.1, pas appréciation visuelle) — la collision est réelle, et elle porte sur la **luminance**, pas sur la teinte :

  | Comparaison                                            | Ratio de luminance | Écart de teinte |
  | ------------------------------------------------------ | -----------------: | --------------: |
  | `#d97706` (actuel) vs laiton `#8b6914`                 |           **1,60** |             11° |
  | `#a35a06` (prescrit) vs laiton `#8b6914`               |           **1,03** |             11° |
  | `#fbbf24` (sombre prescrit) vs laiton sombre `#d4a017` |           **1,42** |               — |

  Un ratio de 1,03 signifie deux couleurs de luminance quasi identique ; combiné à 11° de teinte, le warning et le pigment admin deviennent difficiles à distinguer en mode clair. Aujourd'hui l'écart de luminance (1,60) suffit à les séparer.

  **Alternative calculée, si @thierry veut préserver la décision de 2026-04-25** : `#9a3412` → **AA 7,31** sur blanc (mieux que les 5,22 prescrits), ratio 1,44 vs laiton, 28° d'écart de teinte. Il reste franchement ambré-orangé, sans virer au rouge (qui collisionnerait avec `danger`).

  **Valeur appliquée : `#a35a06`**, celle de `DECISIONS-ANKORA.md`, parce que le document fait foi et que l'accessibilité était le problème à résoudre. Le conflit est porté ici et dans le rapport de chantier pour arbitrage. À noter enfin : `ADR-005`, provenance revendiquée par le commentaire du test, ne contient **aucun** de ces hexadécimaux (grep → 0) — la décision de 2026-04-25 n'est adossée à aucun ADR.

## Amendement du 2026-08-05 — un flux, un mouvement, un stock

**Accepté par @thierry le 2026-08-05.** Cet ADR a nommé les quatre chiffres du hero. Il en
restait un cinquième mot non arbitré, et il désignait **deux nombres différents** : « provisions ».

### Le constat, mesuré

| Où                                    | Fonction                                                            | Filtre                                                             |
| ------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Ligne du hero (`SituationDuMoisHero`) | `provisionsMensuellesLissees` — `cockpit/effort-financier-lisse.ts` | `isActive && frequency !== 'monthly'` — **aucun filtre de compte** |
| Carte de virement (`app/page.tsx`)    | `monthlyProvisionTotal` — `domain/transfer.ts`                      | `isActive && paidFrom === 'epargne'` — **toutes fréquences**       |

> Les fonctions sont désignées **par leur nom, jamais par un numéro de ligne** : un ADR se
> lit des années après le commit qui l'a motivé, et un numéro de ligne se périme au premier
> refactor. Celui-ci s'est d'ailleurs périmé le jour même de la rédaction — la version
> initiale citait `effort-financier-lisse.ts:22`, que le commit de décomposition avait déjà
> décalé. Remarque de Sourcery sur la PR #309, acceptée.

Deux périmètres, un seul mot. Conséquence directe : une charge **mensuelle payée depuis
l'épargne** compte dans la carte et pas dans la ligne du hero ; une charge **trimestrielle
payée depuis le principal** fait l'inverse. C'est la maladie que cet ADR a soignée pour
« reste à vivre », une couche plus bas — et personne ne l'avait vue.

### La décision

En regardant ce que les nombres **font** plutôt que ce qu'ils s'appellent, il y en a trois :

| Ce que c'est                                   | Nature             | Nom affiché                                                | Où                                    |
| ---------------------------------------------- | ------------------ | ---------------------------------------------------------- | ------------------------------------- |
| La part mensuelle d'une facture non mensuelle  | **flux théorique** | **Lissage**                                                | ligne du hero (`SituationDuMoisHero`) |
| Ce qui bouge réellement vers l'épargne ce mois | **instruction**    | **À virer vers l'épargne** / **À reprendre sur l'épargne** | carte de virement                     |
| Ce qui dort déjà sur l'épargne, réservé        | **stock**          | **Provisions**                                             | `ProvisionHealthGaugeCard`            |

**Les deux libellés de la carte ne coexistent jamais** : la carte lit `epargneTransferNet`
(`MonthlyTransferPlan`), un nombre **signé**, et affiche sa valeur absolue. Positif, le mois
demande d'alimenter l'épargne — « À virer vers l'épargne ». Négatif, les échéances du mois
dépassent ce qui a été mis de côté et il faut puiser — « À reprendre sur l'épargne ». Un
seul chiffre, un seul geste, et l'étiquette suit son signe. C'est le sens que @thierry décrit lui-même : « si j'ai un souci sur le mois, je
récupère un montant pour finir le mois ».

La **jauge de santé** est le composant `ProvisionHealthGaugeCard` : elle compare le solde
réellement mis de côté à ce que les échéances à venir réclament (`domain/provision.ts`).
C'est le seul des trois nombres qui décrit un **état à un instant**, et non un mouvement.

Le mot « provisions » reste là où il désigne un **stock** — le sens que lui donne l'usage
courant, et celui du mode d'emploi budgétaire de @thierry (« provision de lissage » pour la
part mensuelle, « provision disponible » pour ce qui dort sur l'épargne). Le vocabulaire de
l'application s'aligne sur celui de son utilisateur, jamais l'inverse.

**« Lissage » seul serait sec — il ne l'est que tant que la ligne ne s'ouvre pas.** La
décomposition (règle 10 de `CLAUDE.md`) rend l'étiquette courte tenable : on ouvre et on lit
« assurance habitation — 300 € tous les 3 mois ». Les deux chantiers se tiennent ; livrer le
renommage sans la décomposition rendrait l'interface plus obscure, pas moins.

### Ce que cet amendement ne répare PAS

**L'écart de périmètre reste entier.** Renommer ne rapproche pas les deux filtres. Mais une
fois les deux nombres nommés différemment, l'écart devient **visible et défendable** au lieu
d'être une contradiction silencieuse — et il pourra être arbitré pour ce qu'il est : une
question de modèle (« une charge mensuelle peut-elle être payée depuis l'épargne ? »), pas
une question de mots.

À traiter avec l'ADR des rôles de comptes, qui possède déjà `paidFrom`.

### Contrainte inchangée

Les quatre chiffres du §1 gardent leurs noms. « Lissage » n'en est pas un cinquième : il
nomme un **poste soustractif** de la formule nº 2, au même titre que « Charges fixes » et
« Engagements », qui portaient déjà leur propre étiquette. La liste des mots bannis n'est
pas modifiée.

## Refs

- **Arbitrage produit** : [`docs/specs/2026-07-29-decisions-ankora.md`](../specs/2026-07-29-decisions-ankora.md) §Q1, §Q2, §Q3, §3.1, §3.6
- **Audit technique** : [`docs/audits/2026-07-29-audit-ankora.md`](../audits/2026-07-29-audit-ankora.md) §2 douleur 3
- Conformité doctrinale (banned-list §2, cooldown) : voir [ADR-034](ADR-034-suppression-atoms-et-design-playground.md) §« Conformité doctrinale » — même raisonnement
- ADR amendé : [ADR-009](ADR-009-capacite-epargne-reelle.md)
- Sources vocabulaire belge : CPAS Berchem-Sainte-Agathe (médiation de dettes) · Tribunaux de Belgique, brochure RCD · Econono 2026 (reste à vivre en crédit)
