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

1. **La barre d'onglets** — plan en revue. Six consommateurs figés de la même façon
   (montage, deux décalages de bannière, burger du header, nav du pied, bouton haut de
   page), plus la réserve d'espace à conditionner, plus une spec e2e qui atteint `/app`
   **par clic** et ne fait aucun `goto` ensuite.
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
