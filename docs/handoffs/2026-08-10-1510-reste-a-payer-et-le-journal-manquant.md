# Handoff — 10 août 2026, 15h10 · « reste à payer », et la brique qui manque au produit

**Session** : CC Ankora (Opus 5). Démarrée sur un balayage de liens, finie sur la spec de la
seule brique qui manque au modèle du produit.

`main` = `c943b7f` · **0 PR ouverte** · 10 tickets ouverts (#343 → #357).

---

## 1. Ce qui a été mergé

| PR       | Objet                                                                            |
| -------- | -------------------------------------------------------------------------------- |
| **#346** | Parcours de bout en bout sur une vie complète + correction du harnais de semis   |
| **#347** | Balayage des 510 liens et CTA, cohérence des chiffres entre écrans               |
| **#356** | **Correctif** : « reste à payer » au cockpit oubliait les échéances d'engagement |

`main` : `495b822` → `c943b7f`. Planchers e2e **241 / 41 tenus** sur chaque PR. Tests
unitaires 2193 → **2208**.

---

## 2. Le défaut corrigé, et sa cause racine

Le cockpit annonçait **969,21 €** quand **1 369,21 €** devaient encore quitter le compte —
29 % de sous-estimation sur l'écran où le mois se décide.

**La cause n'est pas l'oubli, c'est ce qui l'a laissé vivre.** La JSDoc du composant
affirmait « the SAME definition as the charges-page banner (cross-page coherence) » pendant
que le code sommait des factures. Une propriété déclarée en commentaire, vérifiée par rien.

Même famille que le défaut du harnais corrigé le matin même : un miroir de
`paymentMonthsFromFrequency` recopié dans le script de semis, jamais testé, **et déjà
dérivé** (`annual, NaN` rendait `[null]` — un NULL dans une colonne `integer[]`).

**Deux fois dans la journée, le défaut était une affirmation sans témoin.**

---

## 3. Décisions @thierry, à ne pas rouvrir

1. **« Reste à payer » = factures + crédits + engagements.** Verbatim. A transformé #349
   d'une question de conception en bug.
2. **Option « total + renvoi »** : la carte factures affiche le total complet et une ligne
   « dont X € d'échéances » qui renvoie vers `EngagementsCard`. Pas de fusion des cartes,
   pas de lignes dupliquées.
3. **« Se connecter » sur la vitrine** : non-sujet, l'entrée est trouvable au burger.
   Partie B de #353 close ; les deux pieds de page divergents restent ouverts.
4. **Principe directeur, énoncé le 10 août** :
   > « on ne doit jamais avoir le moindre doute sur ce qu'on a comme argent disponible, ce
   > qu'on a payé, à verser en lissage pour les factures à fréquences, sur la partie
   > épargne réelle »
5. **Cohérence ≠ exhaustivité** (correction @thierry) : Ankora peut **prouver sa propre
   arithmétique** en continu, sans aucune donnée bancaire. Elle ne peut pas garantir que
   tout lui a été déclaré. Le rapprochement ne sert pas à vérifier la justesse — il l'est
   par construction — mais à mesurer **ce qui manque**.
6. **Sur le doublon (#355)** : ne pas bloquer la saisie, ne pas se contenter d'avertir —
   **résoudre**. Un bandeau installe le doute au lieu de le lever.

---

## 4. Le fond : ce que « épargne réelle » a révélé

Le mot « épargne » porte **trois notions** dans l'application, et c'est ce qui faisait croire
à une contradiction :

| Affiché                             | Réalité                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| « Épargne estimée −1 068,47 € »     | Projection du **rythme de dépense** : `236,79 − (42,11/jour × 31)` |
| « +1 851,08 € au-delà de la cible » | **Stock** du compte épargne vs cible théorique                     |
| La définition de @thierry           | **Ni l'un ni l'autre**                                             |

Sa définition — `rentrées − factures − lissage − virement vie courante` — **existe déjà**,
affichée sous le nom « **Après tes sorties de <mois> »** (−63,21 € sur le profil semé).

**Donc #351 change de nature** : ce ne sont pas deux chiffres contradictoires, c'est le bon
chiffre portant un nom qui décrit l'opération au lieu de dire ce qu'il veut dire. Correctif
de vocabulaire, pas de calcul.

Et derrière : **le journal de mouvements du modèle source (§3), jamais implémenté.** C'est
la seule route vers « jamais le moindre doute » sur l'épargne réelle — spec en cours de
rédaction (voir §7).

---

## 5. Tickets ouverts, par gravité

| #          | Objet                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| **#348**   | **Tête de file** — la case CGU est recouverte par le bandeau cookies sur `/signup` ; seul défaut qui coûte des inscriptions |
| **#355**   | Le cockpit soustrait **deux fois** une dette saisie en double, alors que l'app la détecte. Décision : résoudre, pas avertir |
| **#351**   | Deux « il te reste » + carte épargne — **relire à la lumière du §4** : c'est du vocabulaire                                 |
| **#350**   | « Reste à payer » nomme un total ET un sous-total de groupe sur `/app/charges`                                              |
| **#352**   | Cinq contrôles autonomes sous 24 px (WCAG 2.2 AA · 2.5.8) — chemins de récupération du tunnel d'auth                        |
| **#353**   | Deux pieds de page divergents (« Conditions » vs « CGU »)                                                                   |
| **#354**   | Divergence d'hydratation permanente sur le `nonce` — masquera la prochaine vraie                                            |
| **#357**   | Landing — le signal « cohérence garantie ». **Ne pas publier avant #355**                                                   |
| #343, #344 | Dettes e2e antérieures                                                                                                      |

---

## 6. Pièges d'instrument, consignés parce qu'ils se rejoueront

Relevés dans les deux audits (`docs/audits/2026-08-10-*`) :

- **L'espace fine insécable U+202F** — le formatage français l'utilise ; comparer à U+0020
  fait annoncer « introuvable » des montants pourtant affichés.
- **`innerText` sur un formulaire** — `/app/accounts` paraît vide, ses cinq soldes sont dans
  des `<input>`. Faute déjà documentée le 31 juillet, refaite le 10 août.
- **La correspondance par sous-chaîne** — `63,21` se « trouve » dans `2 263,21 €`.
- **Une coïncidence arithmétique prise pour une règle** — l'écart de 400 € entre les deux
  « reste à payer » valait exactement le total des engagements. Ça ressemblait à une règle ;
  ce n'en était pas une, et ce n'est vrai qu'en août.
- **Un garde-fou vacuole** — filtrer sur `/auth/v1/` ne voit rien : l'inscription passe par
  une Server Action, côté serveur. `[].every()` rend `true`.

**Quatre constats ⛔ retirés** pour ces raisons. Sans les corrections, les rapports
annonçaient quatre bugs inexistants.

---

## 7. ⚠️ ADR-038 EXISTE DÉJÀ — et il décide ce que cette session a re-dérivé

**Relevé par `spec-translator`, vérifié à la source.**
`docs/adr/ADR-038-journal-des-mouvements.md` — statut **Accepted**, **accepté par @thierry
le 2026-08-05**, révision 2 après un rejet complet de `plan-reviewer`. Il décide déjà :
journal de mouvements entre comptes physiques (D1), ventilation lissage/libre contrôlée
(D4), soldes dérivés au lieu de saisis (D6), solde périmé affiché comme tel (D6), arbitrage
de fin de mois (D8), RLS + export art. 20 + frontière `Decimal` (D9). Découpage en 6 PR déjà
écrit (lignes 303-313). **Aucun fichier `src/lib/domain/*movement*` n'existe** : D1-D9 sont
non implémentés.

**Faute de méthode à ne pas répéter** : la conversation de conception du 10 août a été menée
sans lire `docs/adr/`. Cinq jours de décision déjà prise, re-dérivés.

**Cause mécanique, et c'est un vrai constat** : `grep ADR-038` dans `docs/ROADMAP.md` →
**zéro résultat**. Une décision portant une migration de clé primaire sur des données de
production n'est tracée dans aucun document qui pilote « quoi et quand ». Elle était
invisible. La règle « synchronisation ROADMAP ↔ repo » du `CLAUDE.md` a été enfreinte le
5 août, et ça a coûté cette session.

### Ce que le 10 août ajoute réellement à ADR-038

Trois points absents de l'ADR, tous issus de @thierry — matière d'un **ADR-040 amendant
ADR-038**, jamais d'une réécriture (un `Accepted` est immuable) :

1. **Le reliquat de fin de mois** — « mon Belfius n'est pas à zéro une fois tout payé ».
   Absent d'ADR-038 **et** du §7 du modèle source, qui liste pourtant ce qui manque.
   Ne doit **jamais** entrer dans « Budget du mois » (chiffre nº 2 d'ADR-035).
2. **Cohérence garantie / exhaustivité non garantie** — reformule D6, qui disait
   « approximatif » là où le calcul est exact et où c'est l'écart au réel qui est incertain.
3. **Les invariants comme contrat de domaine testé** (5 fonctions pures), pas un garde-fou.

### ⛔ Conflit documentaire à trancher par @thierry, AVANT toute exécution

| Document                                              | Ce qu'il dit                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| **ADR-038** (05/08, Accepted, D9)                     | Le solde dérive des mouvements **et des `expenses`**          |
| **Plan refonte v2** (26/07, ligne 160, futur ADR-027) | « Les soldes de comptes **ne dérivent jamais** des dépenses » |

Mot pour mot contradictoires, sur le même objet (`accounts.balance`, table `expenses`).
ADR-038 est postérieur, plus spécifique, et a survécu au rejet le plus lourd du projet — mais
il **ne cite nulle part** le plan de refonte. Personne ne les a réconciliés.

**Recommandation** : ADR-038 prévaut, et la ligne 160 du plan v2 est corrigée pour dire
« les soldes dérivent des mouvements confirmés et des paiements attribués ; jamais d'une
estimation budgétaire non confirmée ». À confirmer par @thierry en une phrase.

**Question à poser telle quelle** : _« ADR-038 (accepté le 5/08) dit que le solde d'un compte
dérive aussi des dépenses. Le plan de refonte en cours prévoyait l'inverse. Je recommande de
garder ADR-038 et de corriger la phrase du plan — confirme ? »_

### Autre écart signalé au passage

`.claude/agents/llm-security-auditor.md` existe sur disque mais n'apparaît dans aucune table
de routage QA. Même trou que celui documenté le 29 juillet. Sans effet ici.

## 7bis. En cours à la fermeture

- **Environnement local encore debout** : Supabase (conteneurs `*_ankora`) + serveur dev sur
  le port **3500**, profil semé complet. Compte : `ankora-test-profil@ankora.test` /
  `TestProfil!2026`. Pour libérer : `supabase stop` et fermer le 3500.

---

## 8. À la reprise — dans cet ordre

1. **Trancher le conflit ADR-038 ↔ plan refonte v2** (§7). Rien ne s'exécute avant. Puis
   tracer ADR-038 et ADR-040 dans `docs/ROADMAP.md` — leur absence est ce qui a coûté
   cette session.
2. **#348** — le tunnel d'inscription, avec un test qui **n'installe pas** le consentement
   par avance (modèle : `e2e/consent-first-visit.spec.ts`).
3. **#351** relu comme un problème de vocabulaire (cf. §4), pas de calcul.
4. **Sourcery est à sec** — plafond hebdomadaire de 500 000 caractères de diff atteint.
   #356 n'a **pas** été relue. « Sourcery silencieux » est actuellement satisfait **à
   vide** : il se tait parce qu'il n'a pas regardé. Cf. #77. En attendant, `plan-reviewer`
   en mode adversarial est le seul filet de revue — il a rejeté la première version du plan
   #356 et attrapé le cas qui aurait aggravé le bug.

---

## 9. Note d'environnement

**L'outil Bash est inutilisable** dans cette session : chaque invocation meurt en
`expo: command not found` à la ligne 167 du préambule composé par le harnais, avant même la
commande. Vérifiés propres et hors de cause : les trois profils shell (bash démarre en `-c`,
`-lc` et `-ic`), le snapshot de shell, les hooks de `settings.json` et des six plugins,
`BASH_ENV`/`ENV`, le script de barre d'état. Un redémarrage de session régénère le
préambule.

**Sans conséquence, et volontairement non corrigé** : le protocole DevContext impose de
toute façon PowerShell pour toute commande sortante — `gh` depuis git-bash partirait sur la
config globale, donc potentiellement le compte professionnel. Bash cassé condamne ce chemin
par la mécanique plutôt que par la vigilance.
