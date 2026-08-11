---
project: ankora
type: cc-handoff
session: 2026-08-11-2110
agent: cc-ankora
---

# Handoff — huit PR, un schéma rattrapé en production, et trois libellés qui mentaient

> Session @cc-ankora (Opus 5), clone principal. Suite du handoff de 16 h 42,
> qui couvre l'armement du droit à l'effacement.

## 1. État git

```text
origin/main : 2e9930d fix(legal): l'adresse de contact a enfin la source unique (#381)
              e74a499 feat(landing): L3 (#376, Fable 5)
              299386e fix(a11y): les cases de /signup redeviennent une cible de 24 px (#374)
```

PR ouverte : **#383** (cohérence de la landing) — @thierry la merge lui-même dès
la CI verte.

## 2. Ce qui a été livré après la compaction

| PR         | Objet                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| #373, #375 | passation et ROADMAP                                                                |
| #374       | cible tactile de 24 px sur `/signup` — un retour Codex **fondé** corrigé au passage |
| #380       | « Factures » partout dans l'interface, cinq locales (#365)                          |
| #381       | l'adresse de contact obtient la source unique qu'elle s'attribuait                  |
| #383       | trois libellés de la landing qui ne disaient pas la vérité                          |

## 3. Le rattrapage qui comptait le plus

**La migration ADR-042 n'était pas en production.** Vercel avait déployé le code
de PR-C, personne n'avait poussé le schéma : les cinq colonnes que ce code lit
rendaient `42703`. Rien n'avait cassé pour une seule raison — la file était vide.

Poussée, puis vérifiée dans les deux sens. Le témoin qui compte est **négatif** :
un statut inventé rend `23514` (violation de CHECK) et non `23503` (clé
étrangère), donc la contrainte élargie est en place et refuse.

**Règle qui en découle, écrite au ROADMAP** : toute PR portant une migration se
termine par `supabase db push --linked`, ou elle n'est pas terminée.

## 4. Trois corrections à mes propres affirmations

C'est le motif de la journée, et il vaut plus que les livraisons.

1. **« Mon changement casse deux tests MFA. »** Faux. Conclusion tirée d'**une
   seule paire d'exécutions** ; trois exécutions vertes ont suivi sur le même
   arbre. C'est un test instable → [#382](https://github.com/thierryvm/ankora/issues/382).
2. **« Aucune spec n'assertit sur les libellés de #365. »** Le ticket le disait,
   je l'ai cru une minute. Il y en a **onze**. Et mon premier balayage en ratait
   deux, parce qu'il comparait en respectant la casse là où les specs écrivent
   leurs expressions régulières en minuscules.
3. **« Le placeholder `{email}` fuit sur toutes les pages. »** Faux : next-intl
   sérialise le bundle de messages COMPLET dans chaque page, donc une recherche
   dans le HTML brut rend un faux positif partout. Il fallait lire le DOM.

## 5. Pièges de plateforme, mesurés

- **Un `.next` laissé par `next build` fait rendre 404 à `next dev`** sur toutes
  les routes sauf `/`. Supprimer `.next` suffit. Coûté un diagnostic.
- **`vercel env pull` ne rend pas la valeur d'une variable `--sensitive`** : il
  écrit un remplaçant entre crochets (11 caractères). Rejouer des sondes avec ça
  rend `401` partout, « bon jeton » compris.
- **`supabase status -o env` est ambigu** pour le wrapper DevContext
  (`-OutVariable`) : forme longue `--output env`.
- **Playwright ne typecheck pas** ce qu'il transpile : un objet de seed au
  mauvais type passe et casse à l'exécution.

## 6. Ce que la landing disait de faux

Trouvé en auditant l'accueil contre sa spec, aucun introduit par le programme
landing :

- Le graphique annonçait « 6 mois à partir d'aujourd'hui » sous un axe **figé**
  sur « mai … oct ». Faux dix mois sur douze ; entièrement dans le passé à partir
  de novembre.
- « Voir un exemple » menait à l'inscription — jamais un exemple, alors que
  l'exemple est la carte affichée juste à côté.
- « Produit » et « Simulateur » mesuraient 20 px de haut, sous le plancher de 24.

## 7. Ce qui reste

Ordre convenu, détail dans la mémoire de session :

1. **#378** — les toasts. Cause établie (`sonner` injecte sa feuille sans nonce,
   la CSP refuse, `position: fixed` disparaît), correctif identifié (importer
   `sonner/dist/styles.css`), **non écrit**.
2. Ce qui ment à l'utilisateur : #355, #351, #350.
3. Ce qui rend les tests menteurs : #343, #344, #354, #382.
4. **J2** — ADR-038 D1 + ADR-041 F2, session dédiée, `plan-reviewer` obligatoire.
5. Dette sécurité : `is_workspace_member` / `is_workspace_editor` joignables par
   `anon`. PR dédiée.
6. **Documentation utilisateur** — format arbitré, exécution en attente.

**Le cockpit reste le gros morceau** : 5 des 8 sections existent. Manquent la
timeline 6 mois, les enveloppes rééquilibrables, les objectifs avec ETA et
l'activité récente.

## 8. En attente d'une décision de @thierry

- **L'alias `contact@ankora.be`.** Depuis #381 c'est une ligne à changer, mais la
  boîte n'existe pas. Aucune obfuscation ne protégerait : un `mailto:` doit
  rester directement utilisable pour l'identification de l'éditeur.
- **Le libellé « Tester un changement »** posé dans #383.

## 9. Environnement

Pile Supabase locale debout (`*_ankora`, API `54421`, base `54422`). La pile du
projet professionnel tourne en parallèle (`supabase_db_OVB`, `54322`) — nommer
le conteneur. Connecteurs MCP Supabase et Vercel toujours interdits en session
Ankora, lecture comprise.
