---
project: ankora
type: cc-handoff
session: 2026-08-10-0100
agent: cc-ankora
---

# Handoff — l'en-tête collant inerte depuis trois mois, et la clôture de L2

> Session @cc-ankora (Opus 5), clone principal `F:\PROJECTS\Apps\ankora`.
> Merges exécutés sous délégation @thierry, chacun après vérification complète.
> Quota session à 87 % au moment d'écrire ; hebdomadaire à 41 %.

## 1. État git brut

```text
origin/main : fa142ff fix(css): les trois en-têtes « collants » ne collaient nulle part (#342)
              21a674a docs(e2e): le plancher public annonçait 228 pendant que la CI en exécutait 231 (#341)
              8107f07 docs(passation): handoff L2 en miroir + ROADMAP (#340)
              c378978 feat(landing): le hero « relevé corrigé » (#339 = L2)
              685d172 feat(pwa): l'icône installée mène au cockpit (#336)
              7e3df34 feat(design): la portée papier de la landing (#338 = L1)
              20c8fa7 refactor(simulateur): une seule porte (#337)
              3410f29 docs(refonte): inventaire + architecture cible (#335)
```

Aucune PR ouverte. Aucune branche locale en cours. Worktrees : `ankora` (principal),
`ankora-landing` (Fable 5), `ankora-refonte`.

## 2. Ce que la session a livré

| PR   | Objet                                                                   | État                    |
| ---- | ----------------------------------------------------------------------- | ----------------------- |
| #340 | Handoff L2 miroir + section landing du ROADMAP                          | ✅ mergée (par Fable 5) |
| #341 | Plancher e2e 228 → 231 + ordre contraint L1→L2→L3                       | ✅ mergée               |
| #342 | En-tête collant : `overflow-x` hidden → clip, + spec, + 2 `fixme` levés | ✅ mergée               |
| #343 | Ticket — `dashboard.spec.ts` ne s'exécute nulle part                    | 📋 ouvert               |
| #344 | Ticket — `documentElement.scrollWidth` est une sonde aveugle            | 📋 ouvert               |

## 3. Le défaut principal, et comment il a été trouvé

**@thierry, sur iPhone réel** : « le menu de la page d'accueil n'est pas sticky ».

Cause **mesurée** (Playwright WebKit, A/B dans le même chargement, 900 px de
défilement) : `html, body { overflow-x: hidden }`, posé le 4 mai (`cf67a18`). CSS
Overflow 3 promeut l'autre axe à `auto` quand un axe n'est ni `visible` ni `clip` —
`html` et `body` devenaient donc des conteneurs de défilement, et tout descendant
`position: sticky` résolvait son scrollport sur `body`, qui ne défile pas.

**Trois en-têtes inertes pendant trois mois** : `MktNav` (landing), `Header` (autres
pages publiques), `AdminTopbar` (admin). La barre du bas est `fixed`, donc épargnée —
ce que @thierry avait remarqué, et qui pointait déjà la bonne famille de causes.

Correctif : `overflow-x: clip`. Vérifié **en production** après déploiement :
`body.overflow = clip/visible`, en-tête à `0px` après 900 px, sur `/` et `/faq`.

## 4. Les deux symptômes n'en faisaient qu'un — méthode à réutiliser

Le second symptôme (contenu passant sous la barre de statut iOS, heure illisible)
semblait indépendant. Une hypothèse de contraste s'imposait : papier clair + barre
`black-translucent` en glyphes blancs.

**Écartée par la mesure de @thierry, pas par un avis** : il était en thème sombre (où la
portée papier ne s'applique pas) et voyait le défaut **dans les deux thèmes**. Un défaut
de contraste dépend du thème.

**Prédiction falsifiable posée puis vérifiée sur l'appareil** : « si l'en-tête inerte est
la cause, la barre doit être lisible tant qu'on n'a pas défilé ». Réponse : « à son
niveau haut max, l'heure est lisible ; si je scrolle, tout passe en dessous ». Un seul
défaut, un seul correctif.

## 5. Ce que la falsification a appris

Le `plan-reviewer` a corrigé une **erreur de raisonnement** : je craignais que `clip`
fasse rougir les sondes de débordement, alors que le risque était qu'elles **ne puissent
plus jamais rougir**. Mesuré avec un intrus de 200 px trop large :

- `body.scrollWidth` → **détecte**, sous `hidden` comme sous `clip`. Aucune vacuité
  introduite par le correctif.
- `documentElement.scrollWidth` → **aveugle dans les deux cas**, donc déjà aveugle avant.
  Deux cas du dépôt n'ont que cette assertion : ils sont verts par construction. → #344.

## 6. Planchers e2e

**231 → 241**, mesuré en local dans les deux sens puis **confirmé en CI** sur le dernier
commit (`241 passed / 194 skipped`, 0 failed, 0 flaky). Décomposition sans reste : +6
(nouvelle spec, 2 cas × 3 projets iPhone), +3 (`fixme(true)` levé), +1 (branche SE levée).
Authentifié inchangé à **41**.

Fait notable : les deux `fixme` **passent en CI**. Leur motif de mai — « ça échoue dans
GitHub Actions » — est réfuté.

## 7. Anti-pièges pour la session suivante

1. **Un mécanisme déclaré n'est pas un mécanisme qui marche.** `sticky` était dans le
   balisage et `getComputedStyle().position` rendait bien `sticky`. Tout ce qui lit la
   source validait. Il fallait **défiler**. Corollaire : tout mécanisme qui n'existe que
   pendant une interaction exige un test qui produit cette interaction.
2. **Une phrase non vérifiée coûte des mois.** Un commentaire du 4 mai affirmait un
   _quirk_ WebKit ; il a endormi un test ET fait choisir la mauvaise règle CSS. Réfuté en
   une mesure. Ne jamais écrire dans un commentaire une affirmation qu'on n'a pas mesurée.
3. **Ne pas raccourcir les commentaires porteurs de mesure.** Sourcery l'a demandé ; c'est
   écarté par écrit dans #342. Le commentaire fautif de mai était _court_.
4. **`git stash -u` pour mesurer un « avant »** fonctionne bien, mais penser à vérifier le
   `pop` (fichier non suivi inclus).
5. **Le build resalit `public/llms-full.txt`** (horodatage). Le remettre avant de committer.
6. **Vitest : `--maxWorkers=4`** en local, sinon contention et échecs disjoints d'un run à
   l'autre. 2193/2193 avec.

## 8. Ce qui reste, par ordre

**Immédiat, côté @thierry** — la seule chose non tranchée : **rouvrir la PWA depuis
l'icône, scroller, regarder la zone de l'heure**. Si elle est respectée, le défaut est
clos. Sinon, c'est un second défaut propre au plein écran, et `statusBarStyle:
'black-translucent'` devient le suspect — à mesurer à part, sans le mélanger.

**Ensuite** :

- **L3** — dernières sections de la landing au ton « relevé », 5ᵉ FAQ-objection, migration
  waterfall, SEO. Pilotée par Fable 5, worktree `ankora-landing`. L'ordre L1→L2→L3 est
  contraint (documenté au ROADMAP).
- **Chantiers app 3 à 7** : étiquettes a11y `/app/accounts`, édition sur place + date de
  saisie, fusion charges/engagements dans `/app/charges`, pli du cockpit, cascade.
- **Tickets #343 et #344**, chacun sa PR.
- **Dettes** : tableau sombre de `token-usage.md` (2 lignes sur 3 non reproductibles),
  index ADR (11 absents), 4 clés i18n orphelines, `esbuild` low dev-only (overrides npm en
  PR dédiée, **jamais `--force`**), dette 2FA.
