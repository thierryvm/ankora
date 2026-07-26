# Handoff CC Ankora — 26 juillet 2026, 01h30

**Agent** : @cc-ankora (Opus 5)
**Compte** : `thierryvm` vérifié sur `gh` et `git config` avant chaque commit
**État de sortie** : `main` à jour, working tree propre, **0 PR ouverte**, serveurs de test arrêtés

---

## 1. Livré cette session

| PR   | Sujet                                                       | État      |
| ---- | ----------------------------------------------------------- | --------- |
| #261 | les redirections serveur portent la langue de l'utilisateur | ✅ mergée |
| #262 | registre unique des destinations de nav (Phase 1, lot 1)    | ✅ mergée |
| #263 | un seul contrôle de langue, un seul écrivain                | ✅ mergée |
| #264 | canoniques cross-locale et URLs noindex au sitemap          | ✅ mergée |

Plus tôt dans la même session (voir handoff précédent) : #253 à #260.

---

## 2. Ce que chaque PR ferme

### #261 — les redirections perdaient la langue

Contrepartie de #258, arbitrée par @thierry. En `localePrefix: 'as-needed'`, le préfixe du
français est `/fr-BE`, jamais la chaîne vide : `/login` ne matche donc aucun préfixe, et
c'était la branche cookie de `localeDetection` qui rattrapait. Elle a disparu avec #258.

14 `redirect()` localisés dans les gardes auth et Server Actions, via le `redirect` de
`@/i18n/navigation` — qui retourne `never` et dont le type **impose** la locale.

**Piège évité** : un helper `async` aurait été dangereux. `no-floating-promises` n'est pas
activé (pas de lint typé), donc un `await` oublié sur une garde d'auth n'aurait levé **ni
erreur TypeScript ni erreur de lint** — l'exécution aurait continué et l'utilisateur serait
passé **non authentifié**.

Mesuré : `/en/app` faisait `307 → /login` (français), fait désormais `307 → /en/login`.

**Non localisé délibérément** : l'URL OAuth Google (absolue, externe) sous l'alias explicite
`redirectToExternalUrl` ; et `auth/callback` garde sa résolution par cookie, la route étant
exclue du matcher du proxy.

### #262 — l'oubli d'une destination devient impossible

`/app/commitments` était inatteignable depuis la nav mobile. La cause n'était pas le lien
manquant : les destinations étaient déclarées **trois fois** sans contrat commun.

`src/components/layout/app-destinations.ts` les déclare une seule fois. Son test lit le
système de fichiers **dans les deux sens** — une route sans entrée échoue, une entrée vers
une route supprimée échoue aussi.

Aucun changement visuel. Icônes et clés i18n restent dans les surfaces (module server-safe,
clés next-intl typées) mais deviennent exhaustives par le type.

### #263 — le sélecteur de langue des Réglages

Il ne pouvait rien enregistrer d'autre que le français (`fr-FR`/`en-GB` absents de l'enum
serveur), et même ça n'avait aucun effet visible : deux écrivains divergents de la même
préférence. La carte Profil rend désormais le `LocaleSwitcher` existant (FR | EN, décision
@thierry), et `setLocaleAction` est le seul écrivain.

### #264 — SEO

Canoniques cross-locale (`/en/faq` déclarait la page française canonique), index du glossaire
qui se canonicalisait vers l'accueil, 15 URLs `noindex` au sitemap, locales non traduites
soumises à l'indexation.

---

## 3. Reste à faire, par ordre de priorité

### 1. Lot 2 de la refonte UX — redesign de la nav mobile

Le gros morceau, et celui qui compte pour @thierry (« l'expérience utilisateur est mauvaise
et donc perte de clients potentielle »). Le lot 1 (#262) a posé la base : les destinations
sont désormais dans un registre unique et l'oubli est impossible. Le lot 2 traite ce que le
lot 1 s'est interdit de toucher :

- **répartition barre / sheet** à arbitrer sur pièces. Aujourd'hui 4 onglets + le reste dans
  le « … », choisi pour ne rien casser, pas parce que c'est la bonne hiérarchie.
- **`/app/commitments` ne porte aucun `aria-current`** — même comportement qu'`/admin`.
  Limite assumée du lot 1, à résoudre ici.
- **le sheet grandit avec son contenu** et occupe déjà une part notable d'un iPhone SE.
  Constaté pendant le lot 1 : un test e2e a cassé parce que le sheet couvrait le centre du
  backdrop. À traiter par la hiérarchie, pas par accumulation.
- **Liquid Glass** et grammaire mobile-first, cf. `docs/superpowers/specs/2026-07-24-ankora-refonte-ux-program-design.md`.

Agents à passer : `mobile-liquid-glass-auditor`, `mobile-ios-auditor`, `ui-auditor`.
`plan-reviewer` en amont — il a rattrapé 3 erreurs réelles sur le lot 1.

### 2. Reconnexion fantôme — cause NON établie

@thierry : « si je reviens à la page d'accueil et que je reviens sur le cockpit, il me
demande encore de me reconnecter ».

Ce n'est **pas** une perte de session : Supabase montre `sessions_timebox=0`, des sessions
vivant 47 jours, aucune rotation concurrente de refresh token. C'est un problème de
rendu/navigation client. Aucun diagnostic à ce jour — lancer `prod-bug-investigator` avant
toute hypothèse.

### 3. Dettes tracées, non urgentes

Détail dans `docs/audits/2026-07-25-dettes-tracees-audits-i18n-seo.md` :

- **Header `Link` de next-intl** : annonce les 5 locales, plus large que ce que le sitemap
  soumet depuis #264. Corriger implique `proxy.ts`, réservé à une PR dédiée par la note de
  `routing.ts`.
- **`public/llms.txt`** annonce le néerlandais comme langue opérationnelle alors que
  `LOCALES_VISIBLE` vaut FR + EN. Correctif d'une ligne.
- **`public/llms-full.txt`** contient une duplication apparente (la section 1 recopie
  `llms.txt` en entier) relevée par `seo-geo-auditor`. Vérifier avec `git log -p` si c'est
  neuf ou préexistant.
- **`CardTitle` rend un `<div>`**, jamais un vrai titre — concerne la hiérarchie de titres de
  toute l'app.
- **P2 a11y sur le champ langue des Réglages** : pas d'`aria-describedby` « s'applique
  immédiatement ».
- **Dette de traduction** `landing.*` en nl-BE / de-DE / es-ES : français verbatim.

---

## 4. Frictions d'environnement à connaître

Elles m'ont coûté du temps deux fois chacune.

- **`playwright.config.ts` ne charge pas `.env.local`.** Un `npx playwright test` direct
  skippe les specs `seededUser` même quand `SUPABASE_SERVICE_ROLE_KEY` existe. Charger côté
  terminal : `set -a; . ./.env.local; set +a`.
- **`npm run e2e:auth` sert un build de production**, où `rateLimit()` échoue en fermé sur
  l'Upstash factice de `.env.local` — la **première** connexion casse. Passer par le serveur
  dev, où il échoue en ouvert.
- **La variable lue est `E2E_BASE_URL`**, pas `PLAYWRIGHT_BASE_URL`. Et le port 3000 est
  occupé par un autre projet de @thierry (site airsoft) : utiliser un port dédié, ne jamais
  tuer le 3000.
- **Les specs mobiles exigent `--workers=1`** sur cette machine, sinon elles échouent sur
  `browserContext.newPage` par contention de ressources — pas une régression produit.

---

## 5. Leçons de la session

**Les sous-agents m'ont corrigé cinq fois, et à chaque fois ils avaient raison.**
`plan-reviewer` a réfuté un diagnostic CSP (je visais Radix, c'était `sonner`), montré que
mon correctif de langue aurait rendu le français **inatteignable** pour les navigateurs
anglophones, et relevé que trois surfaces utilisaient des libellés différents que j'allais
uniformiser en silence. `security-auditor` a bloqué une version qui aurait donné des toasts
blancs en thème sombre. `ui-auditor` a vu que j'introduisais deux `radiogroup` indiscernables
sur la page Réglages. Sans eux : cinq régressions livrées.

**Écrire la limite avant le merge, pas la découvrir après.** Chaque PR de cette session porte
une section « limites assumées ». Celle du lot 1 (`aria-current` absent sur
`/app/commitments`) est devenue une entrée du lot 2 au lieu d'un bug à re-découvrir.

**Un test vert ne prouve rien s'il ne peut pas devenir rouge.** Chaque test de non-régression
de cette session a été vérifié falsifiable en réintroduisant la panne. Deux fois, ça a révélé
que le test ne testait pas ce que je croyais.
