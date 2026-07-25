# Handoff CC Ankora — 25 juillet 2026, 15h45

**Agent** : @cc-ankora (Opus 5)
**Mandat** : « tu avances tout seule avec précaution et à mon retour tout doit être fini » — @thierry
**Compte** : `thierryvm` vérifié sur `gh` **et** `git config` avant chaque commit

---

## 1. Ce qui a été livré

| PR   | Sujet                                                                         | État       |
| ---- | ----------------------------------------------------------------------------- | ---------- |
| #254 | agents `prod-bug-investigator` + `test-quality-auditor`                       | ✅ mergée  |
| #253 | handoff session précédente                                                    | ✅ mergée  |
| #255 | diagnostic de la course sur le cookie de langue                               | ✅ mergée  |
| #256 | correction de la cause des échecs de login locaux (`e2e-auth`)                | ✅ mergée  |
| #257 | CSP : style des toasts restauré (violations console conservées, délibérément) | ⏳ ouverte |

---

## 2. Bug 1 — sélecteur de langue qui repasse en anglais

**Cause racine établie**, **correctif non livré**, **décision d'architecture en attente de @thierry**.

`next-intl` réécrit `NEXT_LOCALE` dès que le locale résolu par l'URL diffère du cookie, et
le préfixe d'URL gagne toujours. Toute requête `/en…` alors que le cookie vaut `fr-BE`
rebascule le cookie en `en` pour un an. C'est une **course** : la requête `/en…` encore en
vol se termine après le `Set-Cookie` de la Server Action. Asymétrique par construction —
le sens FR→EN est immunisé (URLs non préfixées), d'où « ça revient toujours à l'anglais ».

### Le résultat négatif, qui est le vrai livrable

Trois correctifs middleware construits et mesurés sur build de production, **trois échecs
structurels** :

| Signal                                         | Mesure                                                 | Verdict                               |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `rsc` / `next-router-prefetch` / `sec-purpose` | envoyés par le navigateur, absents côté middleware     | Next les retire avant                 |
| `accept: text/x-component`                     | un vrai prefetch envoie `accept=(none)`                | ne matche que les `fetch()` fabriqués |
| `?_rsc=<hash>`                                 | `curl "/en?_rsc=probe"` → `nextUrl.search = "(empty)"` | Next retire aussi le paramètre        |

**Next canonise les requêtes RSC avant le middleware.** Un prefetch et une navigation
document sont indiscernables depuis `proxy.ts`. Aucun correctif à cette couche ne peut
fonctionner — ni le nôtre, ni celui de `next-intl`. Ne pas retenter cette voie.

**Piège d'ordonnancement à conserver** : toute manipulation brute de l'en-tête `set-cookie`
dans `proxy.ts` doit être la **dernière** opération, après `updateSession` — `ResponseCookies`
re-sérialise le jar entier à chaque `.set()` et restaure ce qu'on vient de retirer.

### Décision attendue de @thierry

- **Option A (recommandée)** — `localeCookie: false` : `syncCookie` devient inerte, la
  course disparaît par construction. Coût : une arrivée sur `/` nu ne mémorise plus une
  langue qui contredit `Accept-Language`. PR dédiée + `plan-reviewer`.
- **Option B** — navigation dure sur changement de langue : atténue sans supprimer la
  cause, non prouvable par un test. Jamais seule.

Diagnostic complet : `docs/audits/2026-07-25-locale-cookie-race-diagnostic.md`.
Le test de non-régression est dans la suite en `test.fixme` — il décrit le défaut tant
qu'il n'est pas clos.

---

## 3. Bug 2 — violations CSP `inline-style` (PR #257)

Cause : `sonner` insère un `<style>` **vide** puis le remplit → un élément, deux
évaluations CSP, deux violations sur chaque page. Les deux hashes prod ont été confirmés
par re-calcul depuis le paquet installé.

**Ce que ça cachait** : le CSS bloqué, `[data-sonner-toaster]{position:fixed}` ne
s'appliquait pas → **les toasts étaient mal positionnés en production**.

### Deux hypothèses à moi, deux réfutations par les agents

1. `plan-reviewer` a réfuté ma piste **Radix / `get-nonce`** : ce singleton-là remplit son
   `<style>` avant de l'insérer, il ne peut donc pas produire un hash de chaîne vide. Il a
   désigné `sonner` — confirmé ensuite par re-calcul, match exact sur les deux hashes.
2. `security-auditor` a posé un **NO-GO** sur ma première version, qui épinglait les deux
   hashes dans `style-src` pour faire taire la console. Motif : autoriser un `<style>`, ce
   n'est pas le tolérer, c'est **l'appliquer**. La copie injectée est _non-layered_, donc
   elle l'emporte sur toute couche — les hashes annulaient exactement la protection
   `@layer` du même diff. Et comme sonner utilise `theme: 'light'` par défaut, son
   `--normal-bg: #fff` aurait gagné sur `bg-card` → **toast fond blanc en thème sombre**.

### Ce qui est livré : option (a)

Import layered uniquement, pas de hash. Arbitrage assumé : deux avertissements console
cosmétiques valent mieux qu'une régression visuelle en sombre et qu'un CSS tiers exécuté au
sommet de notre cascade. Bénéfice secondaire : une future version compromise de sonner
resterait bloquée par la CSP.

|                             | violations     | positionnement | fond du toast (sombre) |
| --------------------------- | -------------- | -------------- | ---------------------- |
| Avant (production actuelle) | 2              | `static` ✗     | `rgb(17, 26, 46)`      |
| Après (build prod local)    | 2 _(assumées)_ | `fixed` ✓      | `rgb(17, 26, 46)` ✓    |

La décision est documentée dans `src/app/globals.css` et verrouillée par une assertion E2E
qui échoue si un hash réapparaît dans `style-src`.

**⚠️ À signaler à @thierry** : les 2 violations console qu'il avait relevées **restent
visibles**. C'est délibéré et documenté — les supprimer casserait les toasts en thème
sombre. Le vrai défaut (positionnement) est corrigé.

## 4. Reste à faire

1. **#257** — finir la DoD5 (CI, Sourcery, threads, `CLEAN`) puis merger
2. **Bug 1** — @thierry tranche entre Option A et Option B, puis PR dédiée + `plan-reviewer`
3. **Radix / `get-nonce`** — bug réel mais **non mesuré** : `react-style-singleton` n'a
   toujours pas de nonce. Nécessite `get-nonce` en dépendance explicite (`package.json`,
   voie lourde) et un `setNonce()` en corps de render — jamais dans un `useEffect`, les
   effects remontant des enfants vers les parents. Mesurer d'abord.
4. **Symptôme 2 (reconnexion fantôme)** — cause **non établie**. Ce n'est pas une perte de
   session (Supabase : `sessions_timebox=0`, sessions vivantes 47 j, 0 rotation
   concurrente). Investigation séparée, surtout pas dans la même PR.
5. **Refonte UX** — phases 1c (nav mobile) et 1d (consolidation ui↔atoms) non entamées

---

## 5. Leçons de la session

**« Un test vert contre une forme de requête inventée ne prouve rien. »** Le premier
correctif de la locale avait des tests unitaires verts et ne changeait rien dans le
navigateur : les mocks fabriquaient un en-tête que Next ne transmet jamais. La règle
appliquée depuis : mesurer le signal réel **avant** d'écrire le prédicat, jamais l'inverse.

**Le sous-agent qui contredit a plus de valeur que celui qui valide.** Deux fois sur ce
seul bug CSP : `plan-reviewer` a réfuté mon diagnostic (preuve tirée de `node_modules`),
puis `security-auditor` a posé un NO-GO sur mon correctif en montrant que ses deux moitiés
se contredisaient. Sans eux je livrais une régression visuelle en thème sombre.

**Ne pas livrer un troisième correctif non prouvé sur un bug déjà mal corrigé deux fois.**
Reverter et documenter le cul-de-sac vaut mieux qu'un pari. Le résultat négatif mesuré est
un livrable à part entière.
