# Handoff — 5 août 2026, 17h00

**Session** : @cc-ankora (Opus 5) · **Durée** : journée complète · **Branche de fin** : `feat/decomposition-des-chiffres`

---

## 1. Objectif de la session

Rendre le site vrai sur tous les points, puis attaquer la lisibilité des chiffres du
cockpit. Le fil conducteur de la journée s'est révélé en cours de route et il est
unique : **le dépôt affirme des choses qu'il ne fait pas, et ses tests protègent
souvent le mensonge au lieu de l'interdire.**

---

## 2. Livré et mergé

| PR       | Contenu                                                                                                                                                                                                      | Preuve                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **#304** | « Données chiffrées en Belgique » (faux — Francfort/Paris/Dublin) et « 30 jours d'essai » (contredisait 4 affirmations) · CGU §8 « Gratuité » + règle des dons sans contrepartie · version CGU 1.0.0 → 1.1.0 | vérifié en prod                    |
| **#305** | « Contact » pointait sur `/` · « Sécurité » = entrée grise vers `#` · **aucun retrait du consentement sur la landing** (art. 7(3)) · libellés cookies inversés                                               | vérifié au DOM                     |
| **#306** | Nom de famille retiré de **33 fichiers** du dépôt public (dont `site.ts` → `<meta name="author">`) · ADR-038 `Accepted` · ADR-016 et ADR-018 `Superseded` · règles 10 et 11 dans `CLAUDE.md`                 | —                                  |
| **#307** | Section Tarifs supprimée · CTA harmonisés (collision de nom accessible) · FAQ « Combien ça coûte »                                                                                                           | vérifié dans le Chrome de @thierry |
| **#308** | `noindex` sur `nl-BE`/`de-DE`/`es-ES` + `hreflang` restreints · module SEO partagé avec le sitemap                                                                                                           | CI verte                           |
| **#309** | Amendement ADR-035 : **Lissage** (flux) / **À virer** (mouvement) / **Provisions** (stock)                                                                                                                   | ouverte                            |

**Trois tests épinglaient le défaut qu'ils devaient interdire** : `Hero.test.tsx` exigeait
« en Belgique », `FooterCTA.test.tsx` exigeait « 30 jours », `MktFooter.test.tsx` exigeait
`href="/"` pour un lien Contact. Tous remplacés par des **assertions négatives falsifiées
dans les deux sens**.

---

## 3. En cours — `feat/decomposition-des-chiffres`

**Commit 1 livré** : couche domaine de la règle 10.

- `chargesFixesDuMois` · `lissageDuMois` · `engagementsDuMois` → forme `{ total, parts }`,
  **total dérivé des parts**
- `totalChargesMensuelles` et `provisionsMensuellesLissees` deviennent des enveloppes —
  **615 tests de domaine passent sans qu'une assertion soit touchée**
- `PostePart.origine = { montantFacture, cycleMois } | null` : le champ qui répond à « à
  quoi correspondent ces 100 € »
- 11 cas, dont **2 de falsification** (les 9 autres passeraient si total et parts divergeaient)

**Reste sur cette PR** : `month-situation.ts` retourne les parts · mapping Decimal→number
explicite dans `page.tsx` · `<details>` dans le `<dd>` du `<dl>` (réutiliser les classes de
`ProvisionFundProjection.tsx:41-60`) · **remplacement** de `flow.provisions` par
`flow.lissage` dans `LEAF_KEYS` de `situation-i18n.test.ts:27` (sinon 5 tests rouges) ·
clé orpheline `flow.parJour` + `pace.*` non gardées · porte `npm run dev` + mesure au DOM
(`<summary>` ≥ 44 px) · planchers e2e 228 / 40 · agents `financial-formula-validator`,
`dashboard-ux-auditor`, `ui-auditor`, `i18n-auditor`, `test-quality-auditor`.

Verdict `plan-reviewer` : 🟡 APPROVED WITH CHANGES (v1 et v2 précédentes 🔴 REJECTED).

---

## 4. Le chantier suivant, signalé par @thierry en fin de session

**PWA — un seul défaut, deux symptômes.** Mesuré :

- `sw.js` appelle `skipWaiting()` (`:67`) et `clients.claim()` (`:78`)
- **`registration.update()` n'est appelé nulle part** (`ServiceWorkerRegister.tsx` ne fait
  que `register()`)
- dans l'app installée, **aucune affordance de rechargement** : pas de barre d'adresse
- `CACHE_VERSION` est une constante éditée à la main

Hypothèse à valider : le bouton `+` absent et l'impossibilité de rafraîchir sont la **même
cause** — du JavaScript d'un déploiement antérieur. Le `skipWaiting()` inconditionnel
permet en plus à un nouveau SW de prendre la main **sans rechargement de page**, donc un
état mixte ancien JS / nouveaux assets.

Correctif attendu : détection de nouvelle version + affordance « recharger » visible,
`update()` au retour de visibilité, et arbitrage sur le `skipWaiting()` aveugle.

**Menu mobile — 13 entrées dans une seule feuille** « Plus » (Se déconnecter, Simuler,
Engagements, Comptes, Paramètres, Admin, FAQ, Glossaire, CGU, Confidentialité, Cookies,
Mode clair, FR/EN). Refonte mobile-first demandée : quels liens, où, comment.

---

## 5. Décisions prises (verrouillées)

1. **ADR-038 `Accepted`**, D0 comprise (migration de clé primaire sur `accounts`, données
   de production). Exécution en 6 PR ordonnées.
2. **Vocabulaire** : Lissage / À virer vers l'épargne / Provisions. Le renommage et la
   décomposition se livrent **ensemble** (écrit dans l'amendement).
3. **Contrat groupé** : une charge = ce qui quitte le compte, **toujours**. Sous-lignes
   optionnelles, avec leur catégorie, somme contrôlée et refusée si l'écart n'est pas nul.
   L'analyse par catégorie lit les sous-lignes quand elles existent.
4. **Posture** : pas de page Tarifs, code d'invitation à venir, `noindex` sur les locales
   non traduites. Le nom reste dans la politique de confidentialité (art. 13 RGPD).
5. **Pas de dons** : Ko-fi / GitHub Sponsors feraient d'Ankora une activité économique et
   réactiveraient les obligations d'identification.

---

## 6. Défauts trouvés et NON corrigés

| Constat                                                                                                                                                                 | Gravité               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `<Analytics />` et `<SpeedInsights />` montés **sans condition** alors que la politique cookies ET le README affirment un consentement préalable                        | conformité            |
| L'acceptation des CGU n'est **jamais enregistrée** (scope `tos` déclaré, jamais écrit) alors que la case est obligatoire au signup                                      | preuve                |
| Deux périmètres pour « provisions » : hero `frequency !== 'monthly'`, carte `paidFrom === 'epargne'`. Renommer ne les rapproche pas                                     | modèle                |
| **La branche morte est plus complète que celle qui tourne** : `calculerAssistantVirements` porte le rattrapage de déficit d'ADR-011, la carte affichée ne l'a jamais eu | fonctionnalité perdue |
| Cockpit **vert** possible pour quelqu'un à −400 € : le statut ne lit le solde d'aucun compte. Pas d'`overdraft_limit`                                                   | produit               |
| `CLAUDE.md` affirme Klaro (non installé), un compte d'agents à revérifier, un ordre de PR périmé                                                                        | doctrine              |
| Mentions légales absentes ; le slug de l'org Vercel contient le nom de famille et apparaît dans chaque check de PR publique                                             | juridique             |

---

## 7. Hors Ankora

**DevContext** (`C:\Users\thier\Desktop\Contextes-Clients`) corrigé et testé sous
PowerShell 7 : le perso devient un contexte comme les autres (`ctx-off` basculait vers
l'état global de la machine — les clients étaient blindés, le perso non), wrapper `vercel`
pour `-Q/--global-config` (aucune variable d'environnement ne le fait), et `ctx` rend
désormais un verdict GO/NO-GO au lieu de rapporter.

Trouvé par l'exécution, invisible à la lecture : `$home` est une variable automatique **en
lecture seule** — `ctx-off` aurait levé au premier appel. Parse vert ≠ commande qui tourne.

---

## 8. Reprise

1. Finir `feat/decomposition-des-chiffres` (§3).
2. Merger #308 et #309.
3. Chantier PWA (§4) — le plus visible pour @thierry.
4. Refonte du menu mobile (§4).
5. Gate consentement analytics, puis enregistrement de l'acceptation CGU.
6. Journal des mouvements, D0 en premier.

**Rappel** : `npm run preflight` avant **chaque** action sortante — la bascule du compte
`gh` a été mesurée en cours de session les 26 juillet et 5 août.
