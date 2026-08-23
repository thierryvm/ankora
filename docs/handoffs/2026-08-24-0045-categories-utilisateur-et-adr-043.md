---
date: 2026-08-24
heure: '00:45'
projet: ankora
agent: cc-ankora
type: handoff
---

# Les catégories que l'utilisateur crée lui-même — ADR-043 décidé et livré

## 1. Ce qui a été fait

**Sept PR mergées dans la journée du 23 août.**

| PR       | Objet                                                                   |
| -------- | ----------------------------------------------------------------------- |
| #438     | le déclencheur du menu sortait de l'écran sur trois iPhone              |
| #439     | les tiroirs suivaient la barre d'URL de Safari → `svh`                  |
| #440     | le pli du cockpit : hero 554 → 277 px, la cascade devient une carte     |
| #441     | la feuille ⊕ : cadre du montant, catégories hors écran, vide sur bureau |
| #442     | la palette « papier » descend du site vitrine dans l'application        |
| #443     | le brief Fable du cockpit, tracé dans le dépôt                          |
| **#444** | **ADR-043** — rouvre les catégories libres qu'ADR-022 avait reportées   |
| **#446** | **le code** — créer sa catégorie depuis la feuille ⊕                    |

## 2. Les décisions prises, et par qui

**@thierry, arbitrage direct** : « on ne peut même pas créer les nôtres facilement » puis
« pour la partie dépenses, c'est souvent lié à la vie courante, donc pas d'assurances,
crédits. Ne pas mélanger les catégories liées aux factures ».

**ADR-043**, cinq décisions :

- **D1** — création autorisée, `kind: 'variable'` uniquement, aucun sélecteur de type.
- **D2** — l'objection « doublons » d'ADR-022 est **acceptée**, pas écartée ; contrôle
  applicatif insensible à la casse ; **pas** d'index unique (décision de schéma reportée).
- **D3** — `category_group` reste **NULL**, jamais deviné.
- **D4** — supprimer/renommer sont une seconde décision : `ON DELETE SET NULL` déclasse
  l'historique, il faut un archivage, donc une colonne, donc un ADR.
- **D5** — la visibilité se règle côté écran ; **le tri du domaine n'est pas touché**.

**Deux arbitrages de @thierry sur le processus lui-même** (AskUserQuestion) :

1. **Coder tout de suite** plutôt qu'attendre la session suivante — le cooldown de la
   liste bannie avait déjà rempli son office (ADR + PR + deux revues indépendantes).
2. **Voie légère par défaut**, y compris sur un Server Action, dès lors qu'il ne touche
   ni à l'argent, ni à l'authz, ni aux données d'autrui. Motif : deux tours complets de
   `plan-reviewer` ont coûté **4 h 20 sans une ligne de code visible**. Un seul tour de
   revue désormais, jamais deux.

## 3. Les faits mesurés qui ont changé une décision

- **`created_at` est identique sur les 18 catégories semées.** `now()` est
  `transaction_timestamp()`, et `handle_new_user()` sème tout dans une seule transaction.
  Un tri par date de création ne trierait rien pour les nouveaux inscrits et trierait
  autrement pour les anciens. → §4(b) du plan abandonné.
- **`.ilike()` prend un motif, pas une valeur.** `%` saisi par l'utilisateur aurait rendu
  la catégorie impossible à créer, pour toujours. → contrôle déplacé dans le domaine.
- **`logAuditEvent(event, context, metadata?)`** — les métadonnées sont le **3ᵉ**
  argument, la clé de la liste blanche est **`resource_id`** en snake_case. Les deux
  erreurs se composaient en journal vide avec test vert.
- **`rose` et `pink` pointaient sur la même couleur.** Sans conséquence sur une puce de
  8 px à côté d'un nom ; cassant dès que ces jetons deviennent un **choix**.
- **Le garde-fou `sheet-is-the-only-modal` avait un faux positif.** Il matchait le
  littéral `'Escape'` ; mon code fait l'inverse d'en posséder le comportement. Détecteur
  précisé pour exiger un écouteur **global** — mesuré sur les sept fichiers d'abord.

## 4. État à l'instant

- `main` à jour, aucune PR ouverte.
- Branches locales : la branche catégories et celle de l'ADR sont supprimées (squash).
- **Aucune migration** n'a été poussée. La base n'a pas bougé.

## 5. Ce qui vient ensuite — l'ordre est fixé par Fable

Le programme d'intégration vit dans le dossier de design **gitignoré** (PR #445) : rien n'en entre dans le dépôt, captures et chiffres réels compris.

1. **Cockpit `/app`** ← prochaine étape. Worktree obligatoire, branche
   `feat/cc-design-cockpit` (libérée par Fable), **`plan-reviewer` exigé par le brief**
   (SVG écrits main, données domaine réelles, six pages derrière).
   Une carte du code accompagne le brief côté design : composition de la page, fonctions
   domaine, données manquantes, clés i18n mortes, tests et testids qui casseront.
2. Factures → 3. Engagements → 4. Comptes → 5. Réglages → 6. **Dépenses en dernier**,
   par-dessus le travail catégories de cette nuit.

**PR catégories 2** (renommer / recolorer / retirer depuis `/app/settings`) attend un ADR
d'archivage. Y verser : l'asymétrie RLS (un éditeur peut **supprimer** la catégorie d'un
autre membre mais pas la **renommer**), et le sort des 4 catégories `fixed` — présentées
séparément avec leur raison, jamais mélangées.

## 6. Pièges d'instrument rencontrés cette nuit

- **Vérifier sur quelle base le serveur de dev parle avant toute mesure.** Le basculer sur
  l'instance locale se fait **par variables d'environnement** — elles priment sur le fichier
  d'environnement dans Next — sans toucher au fichier lui-même.
- **Une sonde de 3,5 s conclut « ça ne marche pas »** sur une action serveur qui compile
  en mode dev. Boucler jusqu'à 30 s.
- **Le job PowerShell meurt à la fin de l'appel d'outil.** Serveur de dev et mesure
  doivent tenir dans **un seul** appel.
- **Un commit a atterri sur la mauvaise branche**, pourtant créée et vérifiée. Réparé par
  cherry-pick. Lire `git branch --show-current` **dans le même appel** que le commit.
- **Sourcery a atteint sa limite hebdomadaire** et n'a **pas** relu #446. La DoD est donc
  satisfaite formellement mais pas réellement sur cette PR — à relire à froid.

## 7. Planchers e2e

Mesurés sur le run de #446, tenus exactement : **268** (public) / **50** (authentifié).

## 8. Points ouverts pour @thierry

- La palette catégorielle attend un arbitrage design de Fable.
- La configuration d'environnement locale mérite une vérification : le serveur de dev ne
  devrait pas viser la base de production par défaut.
