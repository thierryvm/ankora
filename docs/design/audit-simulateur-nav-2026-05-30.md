# Audit — Simulateur what-if + Navigation mobile · Ankora

> **Auteur** : @cowork (Opus 4.8) · **Date** : 30 mai 2026 · **Statut** : spec d'entrée pour @cc-design + @cc-ankora
> **Déclencheur** : revue mobile-first de la PR #199 (drawer simulateur, THI-195) par @thierry
> **Décision** : **PR #199 GELÉE** — le drawer fonctionne techniquement mais ne livre pas la valeur promise. On retravaille avant merge.

---

## 0. Verdict en une phrase

Le drawer #199 passe le smoke test technique (ouverture/fermeture/ESC/X/focus/scroll-lock ✅), **mais** il ne tient pas la promesse de la landing, déconnecte le calcul de la métrique signature (« réserve libre »), part d'un scénario par défaut irréaliste, et s'appuie sur une navigation mobile peu lisible et incohérente. Merger en l'état = exactement la « fausse promesse » qui fait churner l'utilisateur.

---

## 1. Le constat central : la landing promet ce que l'app ne livre pas

La landing publique vend un simulateur précis. Le drawer livré n'en délivre qu'une coquille.

| Promesse de la landing (vérifié)                                                                                                       | Livré dans le drawer #199 (vérifié)                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Scénarios **réalistes** : « Renégocier mon GSM » (+14 €), « Changer de fournisseur d'électricité », « Couper deux streamings » (+22 €) | Défaut « **Annuler le Loyer** » — irréaliste, personne n'annule son loyer   |
| **Contexte marché** : « forfait actuel 42 €/mois · marché 18-28 €/mois »                                                               | Aucun repère de marché                                                      |
| **Projection 6 mois** sur la réserve libre (494 € → 1 192 €), 2 courbes                                                                | Aucune projection temporelle                                                |
| Un **curseur** (« Bouge le curseur. Vois l'impact… »)                                                                                  | Aucun curseur — boutons + dropdown                                          |
| Impact sur la **RÉSERVE LIBRE** (métrique signature)                                                                                   | Impact sur l'« effort financier » (total des charges), pas la réserve libre |

**C'est le cœur du chantier.** L'app doit s'aligner sur sa propre promesse marketing, sinon le décalage est une trahison silencieuse de l'utilisateur.

---

## 2. Données & calculs (vérifié live, sur la preview connectée)

**Le calcul n'est PAS faux — il est mal étiqueté.** Arithmétique vérifiée sur le scénario « Annuler une charge / Loyer 740 € » :

- `Actuel 1 986 € − 740 € = Projeté 1 246 €` ✅
- `740 € × 12 = Économie annuelle 8 880 €` ✅
- `740 / 1 986 = 37,26 %` ✅ → mais affiché « **+37,26 % / mois** »

**Problèmes de présentation (le vrai sujet) :**

1. **« Actuel / mois 1 986 € » — actuel de quoi ?** Aucun ancrage. Ce 1 986 € = l'« Effort financier lissé » du dashboard (charges fixes 1 927 € + provisions 59 €). L'utilisateur ne peut pas le deviner.
2. **« +37,26 % / mois »** est un faux ami : c'est la part de la charge supprimée sur le total des charges, **pas** une hausse mensuelle. Le « + » vert suggère un gain mensuel récurrent. Trompeur.
3. **Déconnexion de la réserve libre.** Le produit se définit par « provisions affectées vs réserve libre ». Le simulateur projette sur le total des charges, pas sur la réserve libre. Il rate sa propre signature.

**Action @cc-ankora** : faire passer le `financial-formula-validator` sur `src/lib/domain/` une fois la logique recâblée sur la réserve libre, et ajouter des tests sur le mapping Actuel→Projeté→Économie→cumul 6 mois.

---

## 3. Simulateur — produit & UX (issu du benchmark concurrentiel)

Benchmark : YNAB (« Cost to Be Me »), Monarch (forecasting drag + comparaison de scénarios), Quicken Simplifi (courbe de cashflow projeté), PocketGuard (« In My Pocket », chiffre unique), Bankin' (projection J+15). Distinction clé retenue : **outil de planning** (« à quoi ressemblerait ta vie ») vs **outil de décision** (« voilà ce qui se passe, et ce que tu peux faire maintenant »). Ankora doit être un **outil de décision**.

### P0 — Critique (sans ça, on ne merge pas)

- **S1. Remplacer le défaut « Annuler le Loyer » par 3 scénarios réalistes pré-câblés** : « Renégocier le forfait mobile », « Changer de fournisseur d'énergie », « Annuler un streaming ». Identiques à la promesse landing, immédiatement reconnaissables pour un ménage belge.
- **S2. Recâbler l'impact sur la RÉSERVE LIBRE, toujours.** Format cible : « Réserve libre : 312 €/mois → **456 €/mois** ». Supprimer le pourcentage de variation de charge isolée (sans valeur affective).

### P1 — Haute valeur (ce qui tient la promesse landing)

- **S3. Projection 6 mois en mini-courbe** : 2 lignes superposées (actuel gris / scénario accent), l'aire entre les deux matérialise l'épargne cumulée. Un sparkline suffit sur mobile — pas de Monte-Carlo.
- **S4. Cumul 6 mois en langage humain** : « En 6 mois, +828 € en réserve libre — l'équivalent de ton mois d'août. » Montant + équivalent concret = le pattern le plus mémorable en UX fintech.
- **S5. Curseur de montant sur les scénarios variables uniquement** (ex. « énergie — cible 18-28 €/mois »), avec la fourchette de marché affichée **comme repère documentaire** (pas comme conseil). Pas de curseur sur les scénarios binaires.

### P2 — Différenciation

- **S6. Superposer 2 scénarios** : « Renégocier énergie ET couper un streaming = +142 €/mois » (addition des deltas, max 2 actifs pour rester lisible mobile).
- **S7. Badge d'effort par scénario** : « Facile — 5 min par téléphone » / « Effort moyen — comparer les offres ». On décrit l'effort, pas le conseil → FSMA-safe.
- **S8. Garde-fou provisions** : si l'utilisateur simule l'annulation d'une provision affectée (ex. mutuelle), avertissement doux « Cette dépense fait partie de tes provisions affectées — vérifie l'impact sur ta couverture. » Sans bloquer l'action.

> **Note FSMA** : aucune de ces recommandations ne franchit la ligne. Contexte marché = repère factuel documentaire. Badge d'effort = description, pas recommandation. Projection = arithmétique sur données saisies manuellement. On reste « organisation + éducation budgétaire ».

---

## 4. Design — drawer + encadré « Impact » (P1)

- **Cartes imbriquées (carte-dans-carte)** : « Scénario » et « Impact » sont des cartes bordées à l'intérieur d'un drawer déjà encadré → les bordures empilées mangent l'espace utile sur mobile. **Reco** : aplatir d'un niveau — sections séparées par un espace/filet léger, pas par des cartes pleines bordées.
- **Encadré « Impact » incohérent** : manque d'ancrage (cf. §2). **Reco** : 1 chiffre héros (réserve libre projetée) + 1 ligne de cumul 6 mois + la mini-courbe. Reléguer « Actuel/Projeté » en sous-texte.
- **Hauteur du drawer** : sur mobile il occupe le plein écran. Cible recommandée : **half-sheet ~65 %** avec expansion à ~100 % (− 64 px en haut) au drag si le contenu déborde. Le contexte du dashboard derrière rassure.
- **Affordances de fermeture** (à compléter) : aujourd'hui X + backdrop + ESC ✅. Ajouter **poignée (handle) + swipe-to-dismiss à la vélocité**. Garder le bouton × explicite (obligatoire pour VoiceOver — le swipe est réservé à la navigation lecteur d'écran).

---

## 5. Navigation mobile « liquid glass » (P1) — le menu invisible

**Constat vérifié** : la barre du bas a **déjà** un matériau liquid-glass : `background: white / 0.85` + `backdrop-filter: blur(24px)`. Le problème n'est pas l'absence d'effet, c'est son **exécution sur fond blanc** : blanc translucide sur page blanche = contraste perçu ~nul, séparé par un simple liseré à 0.4 alpha (trop visible et inefficace à la fois).

**Correctifs (issus du benchmark iOS 26 Liquid Glass), pour @cc-ankora :**

```css
/* Barre nav mobile — fond teinté + saturation pour exister sur fond clair */
background: oklch(0.97 0.01 240 / 0.82); /* teinte bleu-gris très désaturée */
backdrop-filter: blur(24px) saturate(180%); /* saturate = la barre "capte" les couleurs derrière */

/* Séparation par ombre douce, PAS par bordure franche */
box-shadow:
  0 -1px 0 oklch(0 0 0 / 0.06),
  0 -8px 32px oklch(0 0 0 / 0.08);
/* Liseré haut : descendre de 0.4 → ~0.14 alpha (effet "bord de verre", pas "règle") */
```

- **Contraste des labels** : label inactif ≥ `oklch(0.52 0 0)` pour tenir le **4.5:1 WCAG AA** sur ce fond. Un gris ~0.65 (fréquent en minimalisme) échoue (~2.8:1). Label actif = emerald accent (contraste OK).
- **Fallback accessibilité obligatoire** :

```css
@media (prefers-reduced-transparency: reduce) {
  .tab-bar {
    background: oklch(0.96 0.006 240 / 0.97);
    backdrop-filter: none;
  }
}
```

- **À tester** : réglage iOS « Increase Contrast » (force des fonds opaques) — la barre doit rester lisible sans blur.
- **À vérifier (bug connu iOS 26)** : appliquer `env(safe-area-inset-bottom)` aussi sur le **backdrop** du drawer, pas seulement le contenu (gap bas signalé dans Safari/Chrome iOS 26).

---

## 6. Cohérence des dates (P1)

**Constat vérifié** : page **Dépenses** = `<input type="date">` natif (30/05/2026) ; simulateur « ajouter une charge » = **Fréquence + Mois seul**. Deux traitements de date dans la même app.

**Reco** : un composant `DateField` unique à 3 modes :

- `mode="date"` → `<input type="date">` natif (roue iOS, 0 friction, accessibilité garantie) — pour une dépense ponctuelle.
- `mode="month"` → deux `<select>` natifs (Mois / Année) — pour un budget mensuel (l'input date force une date complète, illogique pour un mois).
- `mode="frequency"` → chips segmentés (Hebdo / Mensuel / Trimestriel / Annuel) — une fréquence est une **catégorie**, jamais une roue de date.

> Ne **pas** réimplémenter un wheel custom JS : l'accessibilité (ARIA/VoiceOver/focus) du natif iOS est imbattable pour des semaines de travail.

---

## 7. Information Architecture & navigation (P1/P2)

**Constat vérifié — un même lien, plusieurs noms :**

| Route            | Desktop         | Barre mobile | Menu « Plus »   |
| ---------------- | --------------- | ------------ | --------------- |
| `/app`           | Tableau de bord | Cockpit      | **Mon cockpit** |
| `/app/charges`   | **Charges**     | **Factures** | —               |
| `/app/simulator` | Simulateur      | Simuler      | —               |
| `/app/accounts`  | Comptes         | _(absent)_   | Comptes         |

- **Triple appellation de `/app`** et **Charges ≠ Factures** pour la même page → confusion cross-device. **Reco** : un lexique unique (1 route = 1 nom), décliné en version courte mobile si besoin mais **sémantiquement identique** (ex. « Cockpit » partout, ou « Tableau de bord » partout ; trancher « Charges » vs « Factures » — ce sont deux concepts différents, clarifier lequel est juste).
- **Menu « Plus »** mélange routes app (Comptes, Paramètres, Admin) et liens marketing/légal (Ressources, FAQ, Glossaire, CGU, Confidentialité). **Reco** : séparer « navigation app » et « ressources/légal » par un filet ou deux groupes.
- **Landing vs dashboard connecté** : la landing reste accessible connecté (header CTA « Ouvrir mon cockpit »). Vérifier la cohérence des CTA et qu'aucun lien mort/incohérent ne traîne entre les deux contextes (à auditer dans la PR nav).

---

## 8. Roadmap priorisée → PRs

| Prio   | Lot                 | Items                                                                   | Owner                   | Type PR          |
| ------ | ------------------- | ----------------------------------------------------------------------- | ----------------------- | ---------------- |
| **P0** | Simulateur — fond   | S1 (scénarios réalistes) · S2 (réserve libre) · §2 (libellés + mapping) | @cc-ankora              | `feat`           |
| **P1** | Simulateur — valeur | S3 (projection 6 mois) · S4 (cumul humain) · S5 (curseur + marché)      | @cc-design → @cc-ankora | `feat`           |
| **P1** | Nav liquid glass    | §5 (tint/saturate/shadow/contraste/fallback)                            | @cc-ankora              | `fix(ui)` dédiée |
| **P1** | Dates unifiées      | §6 (`DateField` 3 modes)                                                | @cc-ankora              | `refactor(ui)`   |
| **P1** | Drawer design       | §4 (aplatir cartes, half-sheet, handle/swipe)                           | @cc-design → @cc-ankora | `feat(ui)`       |
| **P2** | IA / lexique nav    | §7 (noms uniques, séparation Plus, audit liens)                         | @cc-ankora              | `refactor`       |
| **P2** | Simulateur — diff.  | S6 (2 scénarios) · S7 (badge effort) · S8 (garde-fou provisions)        | @cc-design → @cc-ankora | `feat`           |

**Séquencement suggéré** : P0 d'abord (corrige la fausse promesse + le calcul), puis P1 par lots (chacun = 1 PR, 1 objectif), P2 ensuite. #199 reste gelée ; on peut soit l'amender en P0, soit la fermer et repartir propre sur `feat/thi-195-simulator-v2` (à trancher avec @thierry).

---

## 9. Garde-fous FSMA (transverse, non négociable)

Tout texte produit reste « organisation + éducation budgétaire ». Interdits : « tu devrais placer/investir », « on te recommande de… ». Le contexte marché et les badges d'effort sont des **repères factuels**, jamais du conseil. Aucune donnée bancaire importée (saisie manuelle). Cohérent avec la FAQ landing déjà en place (« Ankora ne fournit pas de conseil en placement »).

---

## 10. Sources

**Benchmark concurrentiel** : Monarch Forecasting, YNAB « Cost to Be Me » (juil. 2025), Quicken Simplifi Projected Cash Flow, PocketGuard « Leftover », Bankin'/Linxo (Solicio 2026), Centinel vs Monarch (avr. 2026), Eleken budget app design.

**UX mobile / iOS** : Apple Newsroom iOS 26 Liquid Glass (juin 2025), Apple Dev « Adopting Liquid Glass » + HIG Sheets, let's dev (accessibilité Liquid Glass), Dmytro Hanin (iOS 26 tab bar), Chrome Devs `prefers-reduced-transparency`, NN/G Bottom Sheets (2024), MUI iOS 26 safe-area bug #46953, Mobbin Date Picker.

_(URLs complètes dans les rapports des deux sous-agents de recherche, archivables avec ce document.)_

---

## Addendum — précisions @thierry (30 mai 2026)

### Décision VERROUILLÉE — « Réserve libre » = la cible du recâblage S2

@thierry a confirmé le modèle (+ tableau Coda de référence) :

> **Réserve libre = l'argent envoyé sur le compte de vie quotidienne (Revolut)**
> **= Revenus − (factures + charges du mois) − provisions de lissage.**

Exemple réel : `2 466 € (revenus) − 1 895 € (charges mensuelles du mois) − ~59 € (provisions lissées) ≈ 507 €`.
C'est exactement l'« Argent disponible +507 € » de la landing, et le « Reste disponible » (~514 €) du dashboard.

**Le simulateur doit faire bouger CE chiffre** (Reste disponible / réserve libre) :

- **PAS** « Reste à vivre » (= budget de vie _nécessaire_ du mois, variable ~400-450 €, concept aval).
- **Capacité d'épargne réelle** (≈ 114 €) = Réserve libre − Reste à vivre = le surplus qui part en épargne s'il n'est pas dépensé.

Mapping dashboard : **Reste disponible = réserve libre (cible S2)** · Reste à vivre = besoin · Capacité d'épargne = surplus.

### Scénarios S1 réalistes — tirés des vraies charges (tableau Coda @thierry)

- **Renégocier télécom** : Orange 89 €/mois, Voo 78 €/mois (afficher la fourchette marché en repère documentaire).
- **Couper un abonnement** : Playstation 9 €, Apple One 3 €, ou combo (Voo + Playstation).
- **Renégocier énergie/assurance** : MEGA 55 €, Assurance auto 150 €.
- Charges non-mensuelles (S.W.D.E trimestrielle, taxes voiture/poubelle/égout + Dashlane annuelles) → alimentent les **provisions de lissage**, ne sont pas dans les charges « du mois ».

> @cc-ankora : utiliser des fixtures réalistes de ce type, **jamais « annuler le Loyer »**. Les euros exacts viennent du **domaine Ankora** (données saisies dans l'app), pas du tableau Coda — celui-ci est le modèle de référence de @thierry, à **ne pas hardcoder**.

### Nouvelle feature (HORS P0 — backlog dédié) — Boucle de notifications provisions ↔ factures

@thierry veut un système de notifications **bidirectionnel**, cœur de la valeur « provisions affectées » :

1. **Rappel de versement** — un peu avant la date prévue : « verse X € vers ton compte de lissage (épargne) ».
2. **Rappel de paiement** — à l'échéance : « paie la/les facture(s) lissée(s) Y », avec le détail, depuis le compte principal (Belfius).

FSMA-safe (rappels organisationnels, jamais de conseil). À cadrer en **feature dédiée** — NE PAS l'intégrer au P0 simulateur.
