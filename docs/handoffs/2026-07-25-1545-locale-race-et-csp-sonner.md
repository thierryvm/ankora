# Handoff CC Ankora — 25 juillet 2026, 15h45

**Agent** : @cc-ankora (Opus 5)
**Mandat** : « tu avances tout seule avec précaution et à mon retour tout doit être fini » — @thierry
**Compte** : `thierryvm` vérifié sur `gh` **et** `git config` avant chaque commit

---

## 1. Ce qui a été livré

| PR   | Sujet                                                   | État      |
| ---- | ------------------------------------------------------- | --------- |
| #253 | handoff session précédente                              | ✅ mergée |
| #254 | agents `prod-bug-investigator` + `test-quality-auditor` | ✅ mergée |
| #255 | diagnostic de la course sur le cookie de langue         | ✅ mergée |
| #256 | vraie cause des échecs de login locaux (`e2e-auth`)     | ✅ mergée |
| #257 | CSP : positionnement des toasts restauré en production  | ✅ mergée |
| #258 | **résolution de langue déterministe — bug fermé**       | ✅ mergée |
| #259 | trou de nav mobile + dettes des audits, tracés          | ✅ mergée |

Working tree propre, aucune PR ouverte, `main` à jour.

---

## 2. Bug 1 — sélecteur de langue qui repasse en anglais — **FERMÉ (#258)**

### Correctif livré

```ts
// src/i18n/routing.ts
localeCookie: false,
localeDetection: false,
```

La résolution se réduit au seul préfixe d'URL, avec repli sur `defaultLocale`. `syncCookie`
retourne immédiatement : la course disparaît par construction.

**Les deux flags sont indissociables.** `plan-reviewer` a trouvé que `localeCookie: false`
seul aurait transformé un bug intermittent en bug déterministe — cookie et `Accept-Language`
étant deux branches de la _même_ garde, retirer le cookie promeut `Accept-Language` en
détecteur unique, et le français (URLs non préfixées en `as-needed`) devenait inatteignable
pour un navigateur anglophone. Arbitrage re-validé par @thierry sur l'énoncé corrigé : `/`
rend toujours le français, quelle que soit la langue du navigateur.

### Le résultat négatif qui reste utile

Trois correctifs middleware ont été construits et mesurés avant d'abandonner cette couche.
**Next canonise les requêtes RSC avant le middleware** — en-têtes `rsc` /
`next-router-prefetch` / `sec-purpose` retirés, _et_ paramètre `?_rsc` retiré de l'URL. Un
prefetch et une navigation document sont indiscernables depuis `proxy.ts`. Ne pas retenter
cette voie.

**Piège d'ordonnancement à conserver** : toute manipulation brute de l'en-tête `set-cookie`
dans `proxy.ts` doit être la _dernière_ opération, après `updateSession` —
`ResponseCookies` re-sérialise le jar entier à chaque `.set()`.

### Parcours validé en direct

FR → EN → FR, puis le prefetch `/en` rejoué avec le cookie `fr-BE` : cookie intact. `/faq`
reste français, aucun 307. `/en/faq` rend en anglais **et le cookie reste `fr-BE`**.

### Régression connue, assumée, tracée

`i18n-auditor` a rendu NO-GO sur un P0 réel, confirmé par la mesure : les ~9 `redirect()`
non préfixés des gardes auth et Server Actions perdent la langue (`/app` avec cookie `en`
faisait `307 → /en/app`, fait désormais `307 → /login`, donc français). Arbitré par
@thierry : merger et enchaîner une PR de suivi. Détail dans
`docs/audits/2026-07-25-dettes-tracees-audits-i18n-seo.md`.

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

1. **PR de suivi P0** — localiser les ~9 `redirect()` non préfixés (gardes auth + Server
   Actions). Voie lourde : nouveau plan + `plan-reviewer`. Le bon pattern existe déjà dans
   `src/app/auth/callback/route.ts` (`localiseTarget()`). Aucun test E2E actuel ne peut voir
   cette régression (parcours connectés skippés en CI) → validation Playwright seedée locale.
2. **Phase 1 refonte UX — nav mobile.** @thierry a constaté que `/app/commitments` est
   inatteignable depuis la nav mobile et a explicitement choisi d'**attendre la Phase 1**
   plutôt qu'un patch isolé. Cause structurelle à fermer : destinations dupliquées dans
   `Header.tsx`, `BottomTabBar.tsx`, `MoreSheet.tsx` sans contrat commun. Attendu : registre
   unique + test qui échoue si une route de `app/**` n'y figure pas. Cf. le spec du
   programme UX, section « Défauts constatés à traiter en Phase 1 ».
3. **Sélecteur de langue des Réglages cassé** (préexistant) — le `<Select>` propose `fr-FR`
   et `en-GB`, absents de l'enum `LOCALES`, donc toute valeur autre que `fr-BE` échoue en
   validation Zod ; et l'action n'écrit ni le cookie ni ne revalide.
4. **4 bugs SEO préexistants** — pages `noindex` soumises au sitemap, canoniques
   cross-locale sur la FAQ et les pages légales, glossaire qui se canonicalise vers
   l'accueil, locales non traduites indexables.
5. **Symptôme 2 (reconnexion fantôme)** — cause **non établie**. Ce n'est pas une perte de
   session (Supabase : `sessions_timebox=0`, sessions vivantes 47 j, 0 rotation
   concurrente). Investigation séparée.
6. **Arbitrage à soumettre** — segments d'URL incohérents (`/glossaire` en français,
   `/app/*` en anglais). Les localiser = impact SEO + redirections permanentes + table
   `pathnames` sur 5 locales. Pas un bug.

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
