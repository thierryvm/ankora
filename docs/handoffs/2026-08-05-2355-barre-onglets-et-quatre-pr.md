# Handoff — la barre qui ne pouvait pas apparaître, et quatre PR de fond

- **Date** : 5 août 2026, 23h55 (Europe/Bruxelles)
- **Session** : @cc-ankora, Opus 5, autonomie complète accordée par @thierry
- **Branche de départ** : `chore/neutraliser-identifiants-tiers` → `main`

---

## 1. Ce qui a été livré

Six PR mergées dans la soirée. Les deux premières venaient de la session précédente.

| PR   | Objet                                                                       | Ce qui a été trouvé en le faisant                                   |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| #314 | cibles tactiles à 16 px, deux erreurs d'éditeur                             | assertion positive seule → n'encode pas une interdiction            |
| #316 | un solde rendu deux fois, un sous-titre qui promettait un calcul inexistant | —                                                                   |
| #318 | **deux constantes pour un seul numéro de version de consentement**          | cinq littéraux figés dans un test qui exerçait la branche concernée |
| #319 | **`/ai.txt` et `/llms-full.txt` en 404 en production**                      | troisième occurrence de la même faute de matcher                    |
| #320 | le `NOTICE` se génère depuis `package-lock.json`                            | **deux fausses affirmations évitées** — cf. §3                      |

---

## 2. Le défaut principal, et il n'est PAS corrigé

**La barre d'onglets du bas ne peut structurellement jamais apparaître dans la PWA
installée.** Signalé par @thierry, diagnostiqué, mesuré, **non corrigé** — le plan est en
revue au moment d'écrire.

### La mesure

Production, session authentifiée, largeur 1100 px :

| Chemin d'entrée                                                  | barres dans le DOM |
| ---------------------------------------------------------------- | ------------------ |
| document sur `/`, puis clic `<Link>` « Mon cockpit » vers `/app` | **0**              |
| rechargement **ordinaire** sur `/app`                            | **1**              |

`performance.getEntriesByType('navigation').length === 1` dans le premier cas : aucune
navigation de document cachée.

### La cause

`shouldMountBottomTabBar()` (`src/lib/layout/bottom-tab-bar-state.ts:37-43`) lit
`x-pathname` — l'en-tête de la requête **du document** — et il est consommé dans
`src/app/[locale]/layout.tsx`, un layout **partagé**. Next ne re-rend pas un layout
partagé lors d'une navigation client. La valeur est gelée pour la vie du document.

### Le défaut est PIRE que « la barre manque »

Corrigé après revue du plan : **tous les consommateurs ne sont pas figés.** Ceux qui vivent
dans le layout partagé le sont ; ceux qui sont rendus par les pages ou par
`src/app/[locale]/app/layout.tsx` sont bien recalculés, parce que `src/proxy.ts:92` pose
`x-pathname` aussi sur les requêtes RSC.

| Consommateur                                    | Rendu par          | Sur `/` → `/app` par clic       |
| ----------------------------------------------- | ------------------ | ------------------------------- |
| montage de la barre, deux décalages de bannière | layout **partagé** | figé à « pas de barre »         |
| bouton « haut de page » du groupe public        | layout de groupe   | figé                            |
| `Header.tsx:89` — suppression du burger         | pages / segment    | **recalculé → burger supprimé** |
| `Footer.tsx:22` — masquage de la nav du pied    | pages / segment    | **recalculé → nav masquée**     |

Les deux derniers sont _corrects_ : ils concluent « la barre est là, je m'efface ». Sauf
qu'elle n'est pas là. Résultat : **zéro surface de navigation sur `/app` en mobile.**

Conséquence pour le correctif : faire passer `Header` et `Footer` par le même mécanisme
client les **régresserait**. Ils restent serveur. Seuls les quatre premiers bougent.

Le manifeste porte `start_url: "/"`, une route exclue. L'application installée démarre donc
toujours sans barre, le seul chemin vers le cockpit est un `<Link>`, et en `standalone` iOS
n'offre aucun geste qui charge un nouveau document. **Permanent, pas intermittent.**

### Trois pistes écartées, et sur quelle preuve

- **« La barre est cachée sous une couche »** (hypothèse de @thierry) — la bande blanche
  vient de `Footer.tsx:43`, un `padding-bottom` de 56 px **inconditionnel** sous `xl`. Il
  ne dépend pas de la barre : il ne prouve rien. Et une barre recouverte le serait aussi
  après rechargement.
- **Le Service Worker** — c'est ce que j'avais annoncé en premier, **à tort**. `sw.js` ne
  met en cache aucune navigation (`request.mode === 'navigate'` → `fetch` toujours). Le v5
  en `waiting` est le comportement **voulu** depuis #311 : le `skipWaiting()` a été retiré
  délibérément.
- **THI-324 / `isBypass()`** — hors du chemin : `isBypass()` n'est consulté qu'après le
  filtre d'actifs, et les navigations sortent avant.

### Pourquoi une session précédente l'avait cru réfuté

Elle n'avait testé qu'un chemin : **connexion → `/app`**. Un `redirect()` de Server Action
refait une requête HTTP **sans** `Next-Router-State-Tree`, donc le layout EST re-rendu.
C'est le seul chemin d'entrée qui fonctionne, et c'était celui-là.

Et `e2e/navigation-reachable.spec.ts:76-80` fait `page.goto()` avant de mesurer. Un `goto`
charge un document : **ce harnais ne pouvait pas voir ce défaut**. C'est l'angle mort nommé
au § « Un harnais ment aussi par l'état qu'il installe ».

---

## 3. Deux fausses affirmations évitées en codant le NOTICE

Le plan approuvé disait de lire `node_modules` et de se fier aux drapeaux `dev` du
lockfile. Les deux étaient faux, et je ne l'ai su qu'en écrivant le code.

1. **`node_modules` est la mauvaise source** : dépendante de la plateforme (300 entrées
   `os`/`optional`), aveugle aux doublons imbriqués (151 entrées — `intl-messageformat`
   existe deux fois, et **l'audit manuel avait lu la mauvaise**), non committée.
2. **Les drapeaux `dev` se contredisent** : `sharp` est `devOptional` (donc production,
   `next` le déclare en `optionalDependencies` et Vercel installe `--omit=dev`), mais son
   propre binaire natif `@img/sharp-linux-x64` est marqué `dev: true`. S'y fier faisait
   écrire « aucune licence copyleft en production » alors que des binaires
   **LGPL-3.0-or-later** peuvent être déployés.

Le générateur calcule donc l'atteignabilité lui-même, et la porte de licence est
recalibrée **par déclencheur** : AGPL/SSPL (usage réseau) font échouer ; GPL/LGPL/MPL
(distribution) sont **nommées** puisque Ankora ne distribue rien.

---

## 4. Sourcery est hors quota

Quota hebdomadaire du dépôt épuisé. **Aucune** PR de ce soir n'a été relue par lui.

Contre-mesure mise en place : un sous-agent de revue de code, lancé sur le diff. Il a
rapporté un constat réel sur #318 (cinq littéraux figés dans le test qui exerce la branche
concernée), corrigé avant merge. À reconduire tant que le quota n'est pas revenu.

Les plans ont tous été validés par `plan-reviewer` — deux d'entre eux **rejetés** au
premier tour, avec des motifs justes.

---

## 5. Ce qui reste, par ordre de valeur

1. **La barre d'onglets** — plan **✅ APPROVED au troisième tour**, prêt à coder. Périmètre
   atomique : les **quatre** lectures d'une seule décision (montage, deux décalages de
   bannière, bouton haut de page) passent côté client ; `Header` et `Footer` restent
   serveur — les toucher est la régression. Plus un ternaire d'une ligne sur
   `Footer.tsx:43` (réserve inconditionnelle même pour un visiteur anonyme). Hors
   périmètre : `app/layout.tsx:28`, dont la réserve devient juste dès que le montage l'est.

   Trois pièges nommés pour la spec e2e : `chromium-desktop` fait 1280 px, exactement la
   largeur où `xl:hidden` fait disparaître la barre ; assertion sur la géométrie et non sur
   le compte (`display:none` compte 1) ; et sous 640 px le seul chemin vers le cockpit est
   le tiroir, pas le bouton. Plancher authentifié **40 → 41**, public **228 inchangé**.

   À mesurer avant/après : le poids du bundle de la landing. Aujourd'hui le chunk de la
   barre n'y est pas référencé ; une décision client le rendrait joignable.

   **Le prop est conservé.** `ScrollToTop`, `UpdateBanner` et `ConsentBanner` reçoivent déjà
   `liftedForBottomBar` en prop, et trois fichiers de test assertent sur ce contrat
   (`ScrollToTop.test.tsx:22-42`, `UpdateBanner.test.tsx:75-77`, les tests de
   `ConsentBanner`). Le prop était déjà la bonne frontière — **seule la moitié qui
   l'alimente était fausse.** Un composant client mince lit `usePathname()` et le passe. Les
   trois fichiers restent verts, et c'est ce qui prouve que le périmètre a été tenu.

   **Quatre verrous à écrire, chacun né d'un incident réel :**
   - **Frontière `'use client'`** : `bottom-tab-bar.routes.ts:1-17` documente qu'un Server
     Component important une valeur non-composant depuis un module `'use client'` fait
     planter le rendu de **toutes** les pages (PR #182). Le fournisseur importe **depuis**
     la liste d'exclusion ; aucun module serveur n'importe depuis lui.
   - **`usePathname` vient de `@/i18n/navigation`**, jamais de `next/navigation` — le second
     rendrait `/en/app` et casserait l'exclusion sur toutes les locales non par défaut.
   - **Gaté = non rendu, jamais `hidden`** : `e2e/mobile-ios/bottom-tab-bar.spec.ts:312-325`
     assert `toHaveCount(0)` pour l'anonyme. Une barre masquée en CSS rendrait ces cas verts
     tout en expédiant la nav aux visiteurs anonymes.
   - **`e2e/mobile-ios/bottom-tab-bar.spec.ts:301-310` devient porteur** : c'est la seule
     preuve automatisée que la transition d'authentification remet la racine à jour.
     **Interdiction d'y ajouter un `goto`/`reload` pour la stabiliser** — ce geste
     supprimerait la preuve sans faire baisser aucun chiffre.

   Et un piège pour plus tard : ajouter `staleTimes.dynamic > 0` dans `next.config.ts`
   figerait `Header` et `Footer` à leur tour, et ressusciterait la contradiction.

   **Pourquoi ce correctif n'a pas été écrit dans la nuit du 5 au 6 août** : il touche le
   layout racine en production, il fait une quinzaine de fichiers, et il exige deux mesures
   de plancher e2e **en local, dans les deux sens, avant le premier push**. Entamer une
   modification structurelle en fin de session longue est précisément le geste que la
   doctrine de ce dépôt existe pour empêcher. Le plan est approuvé et autoportant : la
   prochaine session exécute sans rejouer la revue.

2. **Carte de virement ADR-035** — plan **approuvé** avec 6 corrections, prêt à coder.
   L'amendement du 5 août a déjà décidé les libellés (« À virer vers l'épargne » / « À
   reprendre sur l'épargne ») ; ils ne sont pas livrés. Renommage et décomposition partent
   **ensemble**, l'ADR l'exige.
3. **CGU au signup** — deux cases cochées, validées, puis **jetées** : aucune ligne
   `user_consents` de scope `tos` n'est jamais écrite. Contrainte à résoudre : sans
   session après `signUp`, la RLS refuse l'insertion. Demande `plan-reviewer`.
4. **Page `/security`** + `security.txt` (issue #79) — faits vérifiés et rassemblés.
5. **Branche morte ADR-011**, **ADR-038 D0** (migration de clé primaire en production,
   session dédiée).

---

## 6. Écarté ce soir, avec sa raison

- **Violations CSP `style-src` et avertissement d'hydratation** : **inexistants**. Rien sur
  les pages publiques ni sur `/app` en production. La seule entrée console est un
  `kEvalViolation` tracé jusqu'à la sonde `allowsEval` de Zod v4 — un `new Function("")`
  volontaire dans un `try/catch`, avec repli. Comportement voulu.
- **Menu mobile à 15 entrées** : territoire de la refonte, à trancher avec elle.

---

## 7. État des comptes

`npm run preflight` → GO avant **chaque** action sortante (7 fois ce soir). Compte GitHub,
Vercel, Supabase : `thierryvm` sur les trois. Aucune écriture Supabase, aucun déploiement
manuel, aucune migration.
