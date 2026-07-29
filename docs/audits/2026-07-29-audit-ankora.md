# Audit technique et UX — Ankora

**Date** : 29 juillet 2026
**Périmètre** : `github.com/thierryvm/ankora` @ `36680f7` (main, 233 commits, 46 436 lignes TS/TSX sur 363 fichiers)
**Méthode** : lecture seule. Clone, `npm install`, `tsc --noEmit`, `eslint`, `vitest run` (par lots), lecture du domaine, des 17 migrations SQL, des 35 issues ouvertes via l'API GitHub, et du prototype `gestion-budget.html`.
**Aucune modification, aucune branche, aucun push.**

> **Convention de lecture.** Tout ce qui est marqué **[V]** a été vérifié en exécutant une commande ou en lisant le fichier cité. Tout ce qui est marqué **[H]** est une hypothèse ou une inférence de ma part, que je signale comme telle.

---

## 1. Verdict en une page

### Refonte profonde sur les fondations existantes. La réécriture n'est pas justifiée — et je le dis après avoir cherché de quoi la justifier.

**L'hypothèse de départ est fausse.** Le README annonce une « intégration React/Tailwind en cours via PR-D4 PHASE 2 (atomic design, 11 atoms) ». Ce n'est pas une migration à moitié faite. C'est une bibliothèque parallèle **qui n'a jamais été branchée** :

| Mesure                                              | Valeur **[V]**                                                 |
| --------------------------------------------------- | -------------------------------------------------------------- |
| Lignes dans `src/components/atoms/` (source + CSS)  | 2 734                                                          |
| Lignes de tests sur ces atoms                       | 2 054                                                          |
| Atoms sur 11 ayant **zéro** call-site en production | **9 / 11**                                                     |
| Écrans du cockpit (`/app/*`) utilisant un atom      | **0 / 8**                                                      |
| Écrans de l'app entière utilisant un atom           | **2 / 24** (l'admin topbar et la vitrine `/design-playground`) |
| Composants `ui/` shadcn jamais importés             | 4 / 15 (`dialog`, `form`, `sheet`, `switch`)                   |

Une bibliothèque qu'aucun écran n'importe **ne peut pas** produire d'incohérence entre écrans. La cause est ailleurs. Ce diagnostic était déjà posé en interne le 17 mai 2026 (`docs/audits/2026-05-17-thi-189-atoms-vs-ui-diagnostic.md`) et n'a jamais été suivi d'effet — le README est resté figé sur un état du monde vieux de 2 mois et demi. **[V]**

**Deuxième correction factuelle** : il n'y a pas 34 issues et 1 PR ouverte, il y a **35 issues ouvertes et 0 PR ouverte** **[V]** (API GitHub, 29/07/2026).

**Et la santé du code est excellente**, pas dégradée :

| Contrôle                                            | Résultat **[V]**                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `tsc --noEmit` (TypeScript strict)                  | **0 erreur**                                                                                         |
| `eslint`                                            | **0 erreur**, 9 warnings (imports morts, `console` dans les error boundaries)                        |
| `vitest run` (exécuté en 9 lots)                    | **1 699 tests / 126 fichiers — 100 % verts**                                                         |
| Couverture `src/lib/domain` + `schemas` + `actions` | **98,12 % statements · 100 % functions**                                                             |
| `TODO` / `FIXME` / `HACK` hors tests                | **0**                                                                                                |
| `any` réels / `@ts-ignore`                          | **0 / 0**                                                                                            |
| Tokens `@theme` définis et jamais utilisés          | **1 sur 76** (`--radius-xs`)                                                                         |
| Valeurs Tailwind arbitraires (`p-[13px]`…)          | **25** au total, dont 21 sont des `env(safe-area-*)` légitimes                                       |
| Couleurs hexadécimales en dur hors design system    | **0 dans le cockpit** (les 62 occurrences sont des logos SVG, des démos de ColorPicker et des tests) |

Ce n'est pas le profil d'un code qui « commence à souffrir ». C'est un code **discipliné dont la couche de présentation n'a jamais reçu de couche intermédiaire**.

### La vraie cause, en une phrase

Ankora a d'excellents **tokens** (76, cohérents, documentés) et d'excellents **écrans** (chacun soigné individuellement), mais **rien entre les deux**. Pas de couche « patterns ». Chaque écran recompose à la main ce que le précédent avait déjà composé. Preuve la plus nette : **7 surfaces d'overlay implémentées à la main, 2 487 lignes, zéro primitive partagée** — alors que `ui/dialog.tsx`, `ui/sheet.tsx` et `atoms/Drawer.tsx` (615 lignes, 634 lignes de tests) existent tous les trois et ne sont importés par aucune d'elles. **[V]**

### Le chiffrage qui tranche

| Option                                         | Coût                      | Ce qu'on jette                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Refonte profonde de la couche présentation** | **~28 jours** (détail §5) | ~4 000 lignes de JSX + 4 800 lignes d'atoms morts                                                                                                                                                                        |
| Réécriture complète                            | **90–120 jours [H]**      | 2 560 lignes de domaine pur testées à 98 %, 17 migrations SQL, les policies RLS, 5 locales / 1 009 clés i18n, le RGPD (file de suppression, consentements, audit log), la PWA, 136 fichiers de test, 36 specs Playwright |

Rapport ~4×. Et la réécriture ne réglerait **aucune** des trois douleurs, parce qu'aucune des trois ne vient de l'architecture : elles viennent du vocabulaire produit, de l'absence de primitives partagées, et de la couche plateforme Next 16. Réécrire, c'est repayer 90 jours pour retrouver les mêmes trois problèmes avec du code plus jeune.

**Une seule chose mérite d'être jetée sans regret** : `src/components/atoms/` et `/design-playground` (5 112 lignes au total), qui coûtent 7 issues P0/P1 ouvertes et zéro valeur utilisateur.

---

## 2. Diagnostic des trois douleurs

### Douleur 1 — « Design incohérent d'un écran à l'autre »

**Cause racine : l'absence de primitive de surface partagée. Pas la migration.**

Six panneaux glissants sont en production. Aucun ne partage une ligne de code avec un autre **[V]** :

| Fichier                        | Lignes | `Escape` | Piège de focus | Verrou de scroll | `safe-area` | `aria-modal` |
| ------------------------------ | -----: | :------: | :------------: | :--------------: | :---------: | :----------: |
| `ChargeEditDrawer.tsx`         |    254 |    ✅    |       ❌       |        ✅        |     ❌      |      ✅      |
| `ExpenseEditDrawer.tsx`        |    311 |    ✅    |       ❌       |        ✅        |     ❌      |      ✅      |
| `AjusterResteAVivreDrawer.tsx` |    306 |    ✅    |       ❌       |        ✅        |     ❌      |      ✅      |
| `SimulatorDrawer.tsx`          |    211 |    ✅    |       ✅       |        ✅        |     ✅      |      ✅      |
| `MoreSheet.tsx`                |    370 |    ✅    |       ✅       |        ✅        |     ✅      |      ✅      |
| `HeaderNav.tsx` (drawer)       |    420 |    ✅    |       ✅       |        ✅        |     ✅      |      ✅      |
| _(mort)_ `atoms/Drawer.tsx`    |    615 |    ✅    |       ❌       |        ❌        |     ❌      |      ✅      |

**Les trois drawers d'édition — ceux que tu ouvres tous les jours — n'ont ni piège de focus ni gestion du safe-area iOS.** Les trois qui les ont sont ceux écrits plus tard. Chaque nouveau drawer réapprend le métier ; les trois plus anciens ne l'ont jamais appris. C'est exactement ce que produit l'absence de primitive : la qualité dépend de la date d'écriture du fichier, pas d'un contrat.

**Deuxième source, mesurable : le mode sombre est troué sur les couleurs sémantiques.** Sur 76 tokens, 20 ont un override en mode sombre. Les quatre couleurs de statut n'en ont **aucun** **[V]** (`src/app/globals.css`) :

| Utilitaire                   | Contraste sur carte claire `#fff` | Sur carte sombre `#111a2e` |
| ---------------------------- | --------------------------------: | -------------------------: |
| `text-danger` (`#dc2626`)    |                           4,83 ✅ |     **3,59 ❌ (AA = 4,5)** |
| `text-success` (`#059669`)   |                       **3,77 ❌** |                    4,60 ✅ |
| `text-warning` (`#d97706`)   |                       **3,19 ❌** |                    5,44 ✅ |
| `text-info` (`#0284c7`)      |                       **4,10 ❌** |                **4,23 ❌** |
| `text-brand-600` (`#0d9488`) |                       **3,74 ❌** |                    4,63 ✅ |

Ces utilitaires sont employés **70 fois** dans le code de production **[V]**, dont dans `SituationDuMoisHero` (le chiffre-héros de ton argent), `ProvisionHealthGaugeCard` et `SimulatorClient`. **Un seul thème est correct à la fois pour chaque couleur.** L'app se revendique WCAG 2.2 AA ; sur ce point précis elle ne l'est dans aucun des deux thèmes. Correctif : 8 lignes de CSS. Ce n'est pas un chantier, c'est un oubli — mais il explique une partie de l'impression de « ça ne va pas ensemble » selon le thème.

**Troisième source, mineure mais réelle** : `CardTitle` rend un `<div>`, pas un `<h*>` (`src/components/ui/card.tsx:23`) **[V]**. Utilisé 33 fois. Conséquence : aucune carte du cockpit n'existe dans la navigation par titres d'un lecteur d'écran, et — c'est le point cruel — **six specs e2e ont été écrites contre `getByRole('heading')` et n'auraient jamais pu passer** (voir douleur 2).

### Douleur 2 — « Bugs à répétition »

**Cause racine : la couche plateforme Next 16, pas le design. Aggravée par un filet e2e qui n'a jamais couru.**

Répartition des 48 commits `fix` sur 233 **[V]** :

| Domaine                                       |  Nb | Nature                                                                               |
| --------------------------------------------- | --: | ------------------------------------------------------------------------------------ |
| `i18n`                                        |   6 | course sur le cookie de langue, redirections serveur, résolution déterministe        |
| `security` / `csp` / `privacy`                |   7 | CSP + Turbopack, client `service_role` fuyant la session                             |
| `ci`                                          |   4 | outillage                                                                            |
| `ui` / `layout` / `footer`                    |   6 | alignements, focus                                                                   |
| `sw` (service worker)                         |   2 | mise en cache des payloads RSC → reconnexions forcées, langue qui revient en arrière |
| `dashboard` / `simulator` / `actions` / `503` |   8 | frontières RSC/Server Actions Next 16, propagation `NEXT_REDIRECT`                   |
| autres                                        |  15 | seo, gdpr, legal, glossary…                                                          |

**12 des 48 correctifs (25 %) portent les scopes `i18n`, `sw`, `csp`, `actions` et `503-diag`** — l'intégration de Next.js 16 / React 19, pas Ankora. En y ajoutant les correctifs `dashboard` et `simulator`, qui sont eux aussi des problèmes de frontière RSC / Server Action 503 et non de logique métier, on monte à **17 sur 48 (35 %)**. **Zéro correctif ne porte sur `src/lib/domain`.** **[V]**

**Le mécanisme qui laisse passer les régressions est identifié noir sur blanc dans le repo** : `e2e/authenticated-specs.json` **[V]**. Sur 15 specs e2e authentifiées, **6 sont en quarantaine** parce qu'elles « décrivent un tableau de bord qui n'existe plus ». Le commentaire du fichier est sans appel :

> « Elles ont été mergées, le cockpit a été reconstruit, et rien n'a protesté : la CI les sautait faute de Supabase. Les exécuter pour la première fois le 26/07/2026 est ce qui a révélé ceci. »

**Le filet de sécurité du cockpit a été vert pendant deux mois sans jamais s'exécuter.** C'est la cause mécanique des « bugs à répétition ». Elle a été corrigée le 26 juillet (job CI `e2e-authenticated` avec Supabase local, `#271`) — trois jours avant cet audit. Les 6 specs restent à réécrire.

**Et 7 issues P0/P1 ouvertes portent sur des composants morts** : `#150`, `#151`,
`#152`, `#154`, `#155`, `#156`, `#157` visent `Drawer`, `IconPicker`,
`ColorPicker`, `Tabs`, `Chip` — tous à **zéro call-site en production** **[V]**.
Elles sont ouvertes depuis 80 jours, étiquetées P0/P1, et n'ont **aucun impact
utilisateur**. Le backlog signale un incendie dans une pièce vide, ce qui masque
les vraies priorités.

> **Correction de formulation (2026-07-30).** Cette phrase écrivait « `#150` à
> `#157` », soit un intervalle de **8** numéros pour **7** issues. Le compte de 7
> était juste, l'intervalle non : **`#153` était déjà fermée depuis le 2026-05-10**
> (`completed` — ThemeToggle, PR-B) et ne concerne pas `atoms/`. Les sept sont
> donc énumérées ci-dessus plutôt que bornées. Vérifié par l'API issue par issue.
>
> **Statut au 2026-07-30** : les sept sont fermées en `not_planned` (2026-07-29),
> conformément à ADR-034 — le code n'a pas été corrigé, il a été supprimé.

### Douleur 3 — « Navigation et parcours utilisateur confus »

**Cause racine : le vocabulaire, pas les routes. Les routes ont déjà été réparées.**

La navigation est **la partie la mieux conçue de l'app** **[V]** : `src/components/layout/app-destinations.ts` est un registre unique, et `app-destinations.test.ts` lit le système de fichiers et échoue si une route sous `src/app/[locale]/app/` n'a pas d'entrée. Oublier une destination est devenu impossible. C'était le bug d'Engagements que tu avais signalé le 25/07 ; il n'est pas juste corrigé, il est rendu non reproductible.

Le problème est sémantique. **Le mot « reste à vivre » désigne quatre nombres différents dans l'app** **[V]** (`messages/fr-BE.json` + code) :

| Où                          | Libellé affiché                                  | Ce que c'est réellement                              |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Cockpit, chiffre-héros      | « **Reste disponible** »                         | revenus − charges − provisions lissées − engagements |
| Cockpit, tuile du flux      | « **Reste à vivre** »                            | une **enveloppe budgétaire que tu saisis toi-même**  |
| Cockpit, message capacité   | « C'est ton vrai **reste à vivre** chaque mois » | la **capacité d'épargne** (encore un autre nombre)   |
| Page Dépenses, gros chiffre | « **Reste à vivre** — juillet »                  | l'enveloppe **moins** les dépenses saisies           |

**Ta définition** — revenus − (factures du mois + lissage des charges) — c'est le premier. Dans le code il s'appelle `resteDisponible`, dans l'UI « Reste disponible ». **Le code calcule donc bien ce que tu veux, mais sous un autre nom, pendant que le nom que tu emploies est collé sur trois autres nombres.** C'est suffisant à soi seul pour qu'un écran contredise l'autre à la lecture.

**Aggravant, et je crois que c'est le piège le plus coûteux de l'app** : `reste_a_vivre_default` a une **valeur par défaut de 500,00 € en base** (`supabase/migrations/20260526000001`, `not null default 500.00`) **[V]**. Un utilisateur qui n'a jamais renseigné ce champ voit une barre de progression, un « il te reste X € », un « Y €/jour » et un badge « dépassement » **calculés contre un budget qu'il n'a jamais choisi**. Le chiffre a l'air d'une mesure ; c'est une constante d'usine.

**Comptage de taps pour tes trois actions fréquentes (mobile)** **[V]**, depuis le cockpit :

| Action                         |                                                                              Taps | Verdict                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Cocher une facture payée**   |        **2** (onglet Factures → pastille de la ligne), avec mise à jour optimiste | Excellent. C'est le meilleur parcours de l'app.                                                                                    |
| **Consulter le reste à vivre** |                                                                         **0 à 1** | Le chiffre est là, en haut du cockpit — mais sous un nom que tu n'emploies pas, et trois autres chiffres portent ton nom ailleurs. |
| **Ajouter une dépense**        | **4 taps + 1 scroll** (onglet Dépenses → champ Libellé → champ Montant → Ajouter) | Correct mais pas fluide. Surtout : **aucun retour sur le cockpit.**                                                                |

Ce dernier point est le vrai trou. `calculerSituationDuMois` **ne soustrait pas les dépenses saisies** du chiffre-héros **[V]** : `resteDisponible = revenus − charges − provisions − engagements`. Tu peux dépenser 400 € en courses, le grand chiffre du cockpit ne bouge pas d'un centime. Le seul endroit où tes dépenses agissent, c'est la barre locale de la page Dépenses, contre l'enveloppe de 500 € par défaut. **La boucle « je dépense → je vois l'effet » n'est pas fermée.** C'est précisément la fonctionnalité que tu décris comme centrale.

---

## 3. Ce qui est bon et doit être préservé

Je liste ce qui, à mon avis, vaut plus que ce qu'on va refaire.

**Le domaine financier — à conserver intégralement, sans y toucher.** `src/lib/domain/` : 6 sous-domaines, 2 560 lignes de code pur, arithmétique en `Decimal.js` (jamais de flottants sur l'argent), fonctions pures sans dépendance React ni DB. **501 tests sur le seul domaine, 1 699 au total, 98,12 % de couverture, 100 % des fonctions** **[V]**. Il y a même 4 fichiers de tests de propriété (`*.property.test.ts`). Zéro correctif `fix(domain)` en 233 commits. C'est du travail d'orfèvre et c'est le cœur de la valeur d'Ankora.

**Le système de tokens.** 76 tokens dans `@theme`, dont **75 réellement utilisés** **[V]**. Échelle typographique sémantique (`--text-h1`…`--text-num-xl`), échelle de rayons, d'ombres, de durées et de courbes d'animation. Les commentaires expliquent les décisions et leurs contraintes d'accessibilité (le laiton `#8b6914` choisi pour son AA 5,09:1). C'est la fondation du redesign, pas un obstacle.

**Le registre de navigation.** `app-destinations.ts` + son test qui lit le disque. Le pattern à généraliser, pas à remplacer.

**Le modèle de données.** 17 migrations, RLS activée **et forcée** sur chaque table, audit log avec deny explicite, `charge_payments` et `commitment_payments` avec contrainte d'unicité par période (le pointage est idempotent). Le modèle `commitments` couvre proprement trois besoins réels avec un seul objet (crédit, échéancier SPF, facture ponctuelle) et **dérive** le solde restant au lieu de le stocker — il ne peut donc pas dériver. **[V]**

**La rigueur d'ingénierie.** 0 `any`, 0 `@ts-ignore`, 0 `TODO`. Chaque décision non évidente est commentée avec sa date, son incident et son ADR. Les commentaires du code (`globals.css` sur le layering CSP/sonner, `bottom-tab-bar.routes.ts` sur la frontière RSC) valent de la documentation d'architecture. 24 ADR, 29 handoffs, 34 rapports de PR.

**L'infrastructure produit** : 5 locales / 1 009 clés, RGPD (consentements, file de suppression, export, audit log), PWA, CI en 5 jobs dont Lighthouse contre la production. Refaire ça, c'est 3 à 4 mois.

**Sur la page Dépenses en particulier**, deux détails montrent que la bonne intuition est déjà là **[V]** : le total du mois est calculé **côté serveur sur la liste complète** et non sur les 50 lignes affichées (commentaire : « past the 51st current-month expense it would … overstate what's left — a lie about the user's money ») ; et la ligne entière est la cible tactile (44 px), la suppression étant passée derrière une confirmation dans le drawer — parce que tu avais cru pendant des semaines qu'on ne pouvait pas éditer une dépense. Ce niveau d'attention doit être le standard, pas l'exception.

---

## 4. Ce qui doit être refait — par couche

| #   | Couche                          | Constat chiffré **[V]**                                                                    | Décision                                                                                         | Coût **[H]** |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -----------: |
| A   | **Vocabulaire produit**         | 4 nombres nommés « reste à vivre » ; défaut caché à 500 €                                  | ADR de nommage + renommage des clés i18n + suppression du défaut silencieux                      |      **2 j** |
| B   | **Primitive de surface**        | 7 overlays, 2 487 lignes, 0 primitive ; 3/6 sans piège de focus                            | Un `<Sheet>` unique (focus trap, Escape, scroll lock, safe-area, `aria-modal`) + migration des 6 |      **5 j** |
| C   | **Page Dépenses**               | 4 taps, pas de catégorie à la saisie, boucle de feedback ouverte                           | Saisie 1-tap, catégorie, feedback immédiat sur le vrai reste à vivre                             |      **6 j** |
| D   | **Cockpit**                     | 7 sections ; les dépenses sont la **7ᵉ sur 7**                                             | 3 blocs, priorité au quotidien                                                                   |      **5 j** |
| E   | **Contrastes & tokens sombres** | 4 couleurs de statut sans override dark, 68 usages, 5 combinaisons sous AA                 | 8 lignes de CSS + vérif automatisée                                                              |      **2 j** |
| F   | **Code mort**                   | 5 112 lignes (atoms + playground) ; 4 composants `ui/` à 0 usage ; 7 issues P0/P1 fantômes | Suppression + fermeture des issues                                                               |      **2 j** |
| G   | **Filet e2e**                   | 6/15 specs authentifiées en quarantaine                                                    | Réécriture contre le cockpit réel                                                                |      **3 j** |
| H   | **Modèle financier — écarts**   | fréquence 9 mois impossible ; pas d'amortissement d'intérêts                               | Voir ci-dessous                                                                                  |      **4 j** |
|     |                                 |                                                                                            | **Total**                                                                                        |    **~29 j** |

### Détail du point H — les deux écarts du modèle financier

**Ce que le modèle supporte proprement [V]** : charges 1 / 3 / 6 / 12 mois avec lissage exact en `Decimal` ; provisions et santé des provisions (déficit, rattrapage mensuel) ; engagements finis (crédit, échéancier, ponctuel) avec solde dérivé ; revenus ; dépenses horodatées avec catégorie ; pointage par période, idempotent.

**Écart 1 — la fréquence « tous les 9 mois » n'existe pas.** La contrainte SQL est `check (frequency in ('monthly','quarterly','semiannual','annual'))` et `CYCLE_MONTHS` ne connaît que 1/3/6/12 **[V]**. Et le contournement est structurellement bloqué : les échéances sont stockées dans `payment_months[]`, un tableau de mois 1–12 qui **se répète chaque année**. Un cycle de 9 mois ne boucle pas sur une année civile. Le supporter demande de changer d'ancrage : passer de « quels mois de l'année » à « date d'ancrage + pas en mois », comme le fait déjà `commitments`. Ce n'est pas trivial — mais ton prototype HTML, lui, propose bien « Tous les 9 mois » dans sa liste de cadences **[V]**. Si une de tes 19 charges est réellement à 9 mois, elle est aujourd'hui **mal modélisée dans Ankora**.

**Écart 2 — « crédit avec amortissement » n'est pas un amortissement.** `commitments` modélise un crédit comme _N mensualités identiques_ et dérive le solde restant. Il n'y a ni taux, ni TAEG, ni répartition capital/intérêts **[V]**. Pour du pilotage de trésorerie c'est suffisant et honnête ; pour « suivre l'amortissement d'un crédit » au sens bancaire, ça ne l'est pas. **Décision produit, pas technique** — voir §7, question 5.

**Écart 3 — le calcul du reste à vivre.** Ta définition est implémentée, mais elle s'appelle `resteDisponible`, et elle **ignore les dépenses déjà engagées**. Corriger cela, ce n'est pas changer la formule : c'est décider si le chiffre-héros est _prévisionnel_ (ce que je peux dépenser ce mois) ou _temps réel_ (ce qu'il me reste maintenant). Voir §7, question 2.

---

## 5. Plan de refonte séquencé

Chaque chantier a un jalon **vérifiable par une commande ou un test**, pas par une impression.

### Étape 0 — Nettoyer le terrain (2 j) · _débloque tout le reste_

Supprimer `src/components/atoms/`, `/design-playground`, et les 4 composants `ui/` à 0 usage. Fermer les 7 issues P0/P1 fantômes en les référençant. Mettre le README à jour (il annonce un état du monde faux depuis 2 mois).
**Jalon** : −5 112 lignes, 35 → 28 issues, `tsc` et `vitest` toujours verts.

### Étape 1 — Fixer le vocabulaire (2 j) · _débloque 2, 3 et 4_

Un ADR qui nomme **une fois pour toutes** les quatre nombres. Ma proposition, à valider par toi (§7 q.1) :

- **« Reste du mois »** = revenus − factures du mois − lissage − engagements _(l'actuel `resteDisponible`, ton « reste à vivre »)_
- **« Budget vie courante »** = l'enveloppe saisie _(l'actuel `resteAVivre`)_
- **« Disponible aujourd'hui »** = budget vie courante − dépenses saisies
- **« Capacité d'épargne »** = reste du mois − budget vie courante

Puis : purge des clés `fr-BE.json` + suppression du défaut à 500 € (remplacé par `null` → l'UI demande la valeur au lieu de l'inventer).
**Jalon** : `grep -ci "reste à vivre" messages/fr-BE.json` renvoie exactement le nombre d'occurrences du concept unique.

### Étape 2 — La primitive `<Sheet>` (5 j) · _débloque 3 et 4_

Un composant, un contrat : piège de focus, `Escape`, verrou de scroll, `env(safe-area-inset-bottom)`, `aria-modal`, ancrage bas sur mobile / droite sur desktop. Migrer les 6 drawers dessus.
**Jalon** : un test qui parcourt `src/**/*Drawer*.tsx` et `*Sheet*.tsx` et échoue si un fichier implémente son propre `keydown Escape` — le même pattern que `app-destinations.test.ts`, qui a déjà prouvé qu'il marche.

### Étape 3 — La page Dépenses devient l'écran-pivot (6 j) · **priorité mobile**

C'est le cœur du quotidien ; elle mérite le meilleur traitement de l'app. Détail en §6.
**Jalon** : ajout d'une dépense en **2 taps** depuis n'importe quel écran, et le chiffre du haut bouge dans la même image.

### Étape 4 — Le cockpit passe de 7 sections à 3 (5 j)

Aujourd'hui l'ordre est : hero → santé provisions → engagements → prochaines factures → comptes → plan du mois → **dépenses (7/7)**. Sur iPhone, la fonctionnalité que tu utilises tous les jours est à cinq écrans de défilement.
**Jalon** : sur viewport 390×844, les trois chiffres qui comptent sont visibles sans défiler.

### Étape 5 — Contrastes AA (2 j) · _indépendant, faisable en parallèle_

Overrides sombres pour `danger`/`success`/`warning`/`info`, valeurs claires corrigées.
**Jalon** : un test unitaire qui calcule le ratio de chaque paire token/surface et échoue sous 4,5:1. Les 5 combinaisons du §2 passent.

### Étape 6 — Réarmer le filet e2e (3 j) · _à faire après 3 et 4, pas avant_

Réécrire les 6 specs en quarantaine contre le cockpit réel. Corriger `CardTitle` en `<h3>` au passage — c'est la cause de 3 des 6 quarantaines.
**Jalon** : `e2e/authenticated-specs.json` a un bloc `quarantine` vide.

### Étape 7 — Modèle financier (4 j) · _optionnel, dépend de tes réponses au §7_

Ancrage + pas en mois pour les charges (débloque 9 mois et toute autre cadence), et/ou amortissement réel des crédits.

**Chemin critique** : 0 → 1 → 2 → 3 → 4 → 6. Les étapes 5 et 7 sont détachables.
**Premier jalon utilisateur perceptible** : fin de l'étape 3, soit **~15 jours ouvrés**.

---

## 6. Recommandations UX/UI concrètes

### Ce que le prototype HTML fait mieux — et pourquoi

J'ai lu `gestion-budget.html` (1 386 lignes, autonome, tes vraies données : 19 charges, effort lissé 1 863,21 €/mois). Tu as raison de le trouver plus lisible. Quatre raisons précises, toutes transposables **[V]** :

**1. Un mot, un nombre.** « Reste à vivre » apparaît exactement une fois, comme `revenus − effort lissé`. Ta définition, un seul endroit, aucune ambiguïté. C'est _la_ chose à copier.

**2. Quatre KPI et puis c'est tout.** Le tableau de bord ouvre sur : Effort lissé / mois · Équivalent annuel · Revenus mensuels · Reste à vivre. Quatre cartes de même forme, sur une ligne. Ankora ouvre sur un hero à 4 sous-chiffres, puis 6 sections. **Le prototype impose une hiérarchie ; Ankora propose une liste.**

**3. Les alertes viennent avant les données.** Juste sous les KPI : taux d'endettement vs seuil 33 %, échéances en retard (avec montant et lien), échéances sous 7 jours. Ankora a l'information (`ProchainesFacturesCard` avec buckets J-7/J-14/J-30) mais la place en 4ᵉ section, sans hiérarchie d'urgence. **Le prototype dit « regarde ça » ; Ankora dit « voici tout ».**

**4. Le nommage est celui d'un utilisateur, pas d'un modèle.** « Charges », « Échéancier », « Crédits », « Plans de paiement », « Réglages » — cinq mots, aucun jargon. Ankora dit « Cockpit », « Engagements », « Comptes », « Simuler ». _Engagements_ est le pire : c'est le terme du modèle de données, il recouvre à la fois ton crédit voiture et ton échéancier SPF, et rien dans le mot ne le laisse deviner.

**Et ce que le prototype fait mal — soyons justes** : `localStorage` uniquement (un cache vidé = tout est perdu) ; Tailwind chargé depuis un CDN (aucune CSP possible, et l'app meurt si le CDN tombe — il y a d'ailleurs un `fallback` dans le CSS, ce qui prouve que l'auteur y a pensé) ; mono-utilisateur ; aucun RGPD ; **aucun suivi de dépenses** — il gère les charges et les échéances, pas ton quotidien ; et surtout **sa navigation est une barre d'onglets horizontale qui déborde en haut de l'écran** (`overflow-x-auto`), c'est-à-dire le pire endroit pour un pouce. La barre d'onglets basse d'Ankora est objectivement meilleure sur mobile. **Ce qu'il faut lui prendre, c'est la hiérarchie et le vocabulaire, pas la structure de navigation.**

### Architecture de navigation cible — mobile d'abord

Garder la barre basse (4 onglets + Plus) et **renommer** :

```
[ Mois ]   [ Factures ]   [ ⊕ ]   [ Dépenses ]   [ Plus ]
```

- **Mois** _(ex-Cockpit)_ — la situation. Un mot que tu emploies.
- **Factures** _(ex-Charges)_ — déjà le bon mot, déjà le meilleur parcours (2 taps).
- **⊕** — **bouton d'ajout de dépense au centre, en flottant**. Aujourd'hui : 4 taps + un défilement. Cible : **2 taps depuis n'importe où**. C'est l'action la plus fréquente de l'app ; elle mérite le pouce, pas un onglet.
- **Dépenses** — l'historique et le suivi.
- **Plus** — Crédits & échéanciers _(ex-Engagements)_, Comptes, Simuler, Réglages.

### Structure cible du tableau de bord

Trois blocs. Rien d'autre au-dessus de la ligne de flottaison sur un iPhone 390 px.

```
┌─────────────────────────────────────┐
│  IL TE RESTE                        │
│  1 247,50 €                         │  ← revenus − factures − lissage − engagements
│  pour finir juillet · 12 jours      │     MOINS les dépenses déjà saisies
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  soit 103 €/j   │
├─────────────────────────────────────┤
│  ⚠ 2 factures en retard      340 €  │  ← n'apparaît que s'il y a lieu
│  · Assurance auto      12/07  180 € │
│  · Mutuelle            14/07  160 € │
├─────────────────────────────────────┤
│  CE MOIS         8/14 factures ▓▓░░ │
│  Provisions      à jour           ✓ │
│  Épargne possible          +312 €   │
└─────────────────────────────────────┘
             (défilement)
   Comptes · Plan du mois · Simuler
```

Trois principes derrière ce schéma :

1. **Un seul grand chiffre**, celui que tu vas chercher, avec ton nom dessus, et **il bouge quand tu saisis une dépense**.
2. **Les alertes conditionnelles précèdent les données permanentes** — emprunt direct au prototype.
3. Comptes, Plan du mois et Simuler descendent sous la ligne de flottaison. Ce sont des écrans de configuration, consultés une fois par mois. Ils occupent aujourd'hui trois des sept sections.

### La page Dépenses — le vrai chantier

**Modèle de données** : `expenses(id, workspace_id, created_by, label, amount, occurred_on, category_id, note, created_at)` — correct et suffisant. Un index sur `(workspace_id, occurred_on desc)`. Rien à changer côté schéma. **[V]**

**Ce qui manque, par ordre d'impact** :

1. **La boucle de feedback est ouverte.** Tu saisis 45 €, le grand chiffre du cockpit ne bouge pas. C'est _le_ défaut central. Fermer la boucle est un changement d'une ligne dans `calculerSituationDuMois` — mais c'est une décision produit (§7 q.2), pas un correctif.
2. **`category_id` est ignoré à la saisie.** `createExpenseAction({ …, categoryId: null })` en dur dans `ExpensesClient.tsx:73` **[V]**. Les catégories existent en base, sont typées, ont un ADR (ADR-022 sur la taxonomie et la catégorisation locale)… et le formulaire ne les propose pas. Conséquence : aucune répartition possible, alors que le prototype affiche un donut par catégorie que tu apprécies.
3. **La saisie coûte 4 taps.** Cible : le ⊕ ouvre un `<Sheet>` avec le pavé numérique focalisé, la date préremplie à aujourd'hui, et 4 à 6 puces de catégorie récemment utilisées. Montant → catégorie → c'est fait.
4. **Aucun retour optimiste.** `ChargesClient` utilise `useOptimistic` pour le pointage — la coche répond instantanément **[V]**. `ExpensesClient` attend l'aller-retour serveur. Le pattern existe déjà dans le repo, à trois fichiers de distance.
5. **La barre se mesure contre un budget fictif.** Tant que `reste_a_vivre_default = 500` existe, cette barre ment poliment.

À conserver absolument : le total serveur autoritatif, la ligne entière comme cible 44 px, la suppression derrière confirmation, le formulaire toujours visible.

### Mobile — ce que j'ai vérifié et ce que je n'ai pas pu vérifier

**Vérifié statiquement [V]** :

- Barre d'onglets basse : `h-12` (48 px) + `pb-[env(safe-area-inset-bottom)]` — conforme.
- Pastille « payé » : `size-11` (44 px) sur mobile, `size-7` sur desktop — conforme et bien pensé.
- Lignes de dépense : `min-h-11` — conforme. 27 occurrences de cibles ≥ 44 px sur 17 fichiers.
- `env(safe-area-inset-*)` : présent dans Header, Footer, BottomTabBar, MoreSheet, HeaderNav, ScrollToTop, SimulatorDrawer — **absent des 3 drawers d'édition**.
- Aucun `<table>` dans le cockpit : les listes sont en `<li>` avec grille responsive. Pas de débordement horizontal par ce biais.
- Playwright déclare bien des projets `mobile-safari` et `mobile-chrome`, et 8 specs `e2e/mobile-ios/`.

**Non vérifié, et je ne veux pas le laisser croire** : je n'ai **pas** lancé le serveur de développement ni pris de captures. L'app exige des variables d'environnement Supabase que je n'ai pas, et le cockpit exige une session authentifiée. Tout ce qui précède sur le mobile est de l'analyse statique. **Les issues #149 / #116 / #112 (débordement horizontal de 10–18 px sur iPhone SE) restent ouvertes et non reproduites ici** — elles étaient déjà décrites comme dépendantes de l'environnement CI. **[V que les issues existent, non vérifié que le bug existe]**

---

## 7. Questions ouvertes — réponds en cochant

### Q1. Le vocabulaire du reste à vivre

Quatre nombres, un seul nom. Il faut trancher.

1. **Adopter ma proposition** : « Reste du mois » / « Budget vie courante » / « Disponible aujourd'hui » / « Capacité d'épargne ».
2. **Garder « reste à vivre » pour TON chiffre** (revenus − factures − lissage) et renommer tout le reste.
3. **Supprimer l'enveloppe budgétaire.** Un seul chiffre, celui du cockpit ; la page Dépenses n'affiche plus de budget mais la consommation réelle.
4. Autre — tu proposes les mots.

### Q2. Le chiffre-héros : prévisionnel ou temps réel ?

C'est la question la plus structurante de tout l'audit.

1. **Temps réel** — le hero soustrait les dépenses déjà saisies. Le chiffre descend dans la journée. _Ferme la boucle, mais le chiffre bouge tout le temps._
2. **Prévisionnel** — le hero reste stable tout le mois ; les dépenses ne s'affichent que dans une jauge secondaire. _L'état actuel._
3. **Les deux, empilés** : grand chiffre = prévisionnel, ligne juste dessous = « dont X € déjà dépensés, reste Y € ». **[Ma recommandation.]**
4. Un commutateur dans les réglages.

### Q3. Le budget vie courante par défaut de 500 €

1. **Le supprimer** : tant que tu ne l'as pas saisi, on n'affiche ni barre ni €/jour, juste une invite. **[Ma recommandation.]**
2. **Le déduire** de la moyenne de tes 3 derniers mois de dépenses.
3. Le garder mais l'annoncer explicitement (« budget par défaut, à ajuster »).
4. Le rendre obligatoire à l'onboarding.

### Q4. La fréquence « tous les 9 mois »

1. **Nécessaire** — une de mes 19 charges est à 9 mois. _(→ +4 j : ancrage + pas en mois)_
2. **Pas nécessaire** — 1/3/6/12 me suffisent, le prototype la proposait par symétrie.
3. Pas maintenant, mais je veux que le modèle ne l'interdise plus.

### Q5. L'amortissement des crédits

1. **Le modèle actuel suffit** : N mensualités identiques, solde restant dérivé. _(→ 0 j)_
2. Je veux le **taux et la répartition capital/intérêts**. _(→ +4 j)_
3. Je veux juste la **date de fin et le nombre d'échéances restantes** — déjà calculées, à mieux afficher. _(→ +0,5 j)_

### Q6. Le sort des 5 112 lignes d'atoms

1. **Supprimer** `atoms/` et `/design-playground`, fermer les 7 issues associées. **[Ma recommandation.]**
2. Les garder comme référence visuelle, mais sortir `/design-playground` du bundle de production.
3. Les brancher pour de vrai. _(→ +10 j, et ça ne règle aucune des trois douleurs.)_

### Q7. Le bouton ⊕ central dans la barre d'onglets

1. **Oui, ⊕ au centre** → ajout de dépense en 2 taps depuis n'importe où. **[Ma recommandation.]**
2. Non — un bouton flottant en bas à droite sur la seule page Dépenses.
3. Non — garder 5 onglets, améliorer seulement le formulaire.

### Q8. Ordre de bataille

1. **Suivre le plan** : nettoyage → vocabulaire → Sheet → Dépenses → cockpit → e2e. **[Ma recommandation.]**
2. **Dépenses d'abord**, tout de suite, quitte à refaire une passe après.
3. **Contrastes + e2e d'abord** (5 j) : stabiliser avant de transformer.
4. Nettoyage + vocabulaire seulement (4 j), puis on refait le point.

---

## Annexe — méthode et limites

**Ce que j'ai exécuté** : `git clone` · `npm install` (1,1 Go, 638 paquets) · `tsc --noEmit` → 0 erreur · `eslint` → 0 erreur / 9 warnings · `vitest run` en 9 lots → 1 699 tests, 126 fichiers, 100 % verts · `vitest --coverage` sur le périmètre du domaine → 98,12 % · lecture intégrale de `globals.css`, `src/lib/domain/cockpit/*`, `ExpensesClient.tsx`, `ChargesClient.tsx`, `app/page.tsx`, `BottomTabBar.tsx`, `app-destinations.ts`, des 17 migrations SQL et de `gestion-budget.html` · calcul des ratios de contraste WCAG en Python sur les valeurs réelles des tokens · API GitHub pour les 35 issues et les 0 PR.

**Ce que je n'ai pas pu faire, et qui limite ce rapport** :

- **Aucune capture d'écran, aucune exécution du serveur** — pas de variables Supabase, et le cockpit exige une session. Toute l'analyse mobile est statique.
- **Les tests e2e Playwright n'ont pas été lancés** (ils exigent un Supabase local). Je n'ai donc pas pu confirmer par moi-même que les 6 specs en quarantaine échouent : je m'appuie sur le diagnostic écrit dans `authenticated-specs.json`, daté du 26/07/2026.
- **Les estimations en jours sont des ordres de grandeur [H]**, calibrés pour un développeur seul assisté d'agents, sur la base du rythme observé dans l'historique (233 commits en 3,5 mois). Elles n'ont pas la même solidité que les mesures du §1.
- Je n'ai pas audité la sécurité applicative, les performances runtime, ni le coût d'infrastructure — hors périmètre.

**Sources**

- Dépôt : [thierryvm/ankora](https://github.com/thierryvm/ankora) @ `36680f7`
- Issues ouvertes : [API GitHub](https://api.github.com/repos/thierryvm/ankora/issues?state=open&per_page=100) — 35 au 29/07/2026
- Diagnostic interne antérieur : `docs/audits/2026-05-17-thi-189-atoms-vs-ui-diagnostic.md`
- Quarantaine e2e : `e2e/authenticated-specs.json`
- Prototype comparé : `gestion-budget.html` (1 386 lignes)
