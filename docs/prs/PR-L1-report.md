# PR L1 — Couche MARQUE : tokens papier (`.mkt-paper`)

**Date** : 8 août 2026 · **Branche** : `feat/landing-tokens-papier` · **Modèle** : Opus
**Spec** : [`prompts/PR-LAND-refonte-releve-corrige.md`](../../prompts/PR-LAND-refonte-releve-corrige.md) §PR L1
**Décision** : [ADR-039](../adr/ADR-039-portee-tokens-marketing-papier.md)

> L1 s'exécute sous Opus, pas sous l'exception Fable 5 : elle introduit un
> quatrième motif de portée dans la fondation CSS partagée et modifie de la
> doctrine d'agent. L'exception accordée le 8 août ne couvre que le travail
> **visuel** (L2, L3).

---

## 1. Ce que cette PR livre

Les six pigments « papier », la portée qui les applique, et **aucune page qui la
porte**. La landing ne change pas d'apparence : ce lot pose le mécanisme, la PR
L2 pose la classe.

Preuve de l'absence d'effet visuel, et elle vaut mieux qu'une capture : la chaîne
`mkt-paper` n'apparaît **nulle part** dans `src/` hors des marqueurs du test.
Aucun composant ne peut donc être atteint — c'est structurel, pas observationnel.

---

## 2. Relecture de plan — 🟡 puis 🟡, sept édits appliqués

`plan-reviewer` (Opus) a rendu deux verdicts. Ce qu'il a évité :

**Le piège `blockAfter()` était déjà armé, pas latent.** J'avais écrit que
« l'ordre des blocs sauve la mise ». Faux. `globals.css:134`, **à l'intérieur du
bloc `@theme`**, porte en commentaire la phrase « Dark overrides live in
`[data-theme='dark']` » — mêmes guillemets simples que le vrai sélecteur, donc
**première occurrence du fichier**. L'ancien `indexOf` y atterrissait déjà. Le
test ne passait que parce qu'aucune `{` ne sépare cette phrase du vrai bloc, si
bien que le balayage d'accolades retombait par accident sur la bonne.

**Trois de mes affirmations d'inventaire ne survivaient pas à un grep** — les
ratios, je les calculais ; les états du dépôt, je les supposais :

| affirmation                                             | réalité mesurée                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| « aucun autre fichier ne référence `design-tokens.md` » | il y en a un (`docs/superpowers/specs/2026-07-26-…:483`)                              |
| « je corrige les deux lignes fausses du §4 »            | **quatre** sont fausses, et le §2 répète les mêmes chiffres                           |
| « j'ai marqué le plan du 26 juillet SUPERSEDED »        | vrai, mais **pas là où je l'ai cherché** — c'est dans #337, pas #335 (cf. ci-dessous) |

**Et un consentement que j'allais fabriquer.** Je proposais de basculer ADR-039
en `Accepted` en écrivant dans le corps de PR que « le merge vaut GO @thierry ».
Refusé, à raison : `docs/adr/README.md:14` pose qu'un ADR est **immuable une fois
`Accepted`** — une porte à sens unique. @thierry mergerait pour le code ; lui
faire porter une seconde décision qu'il n'a pas prise, c'est la même faute qu'un
fil de revue laissé sans réponse, qui ne se distingue pas d'un fil non lu.
**Le statut reste `Proposed`.** Seule la consignation entre ici — c'est la partie
qui serait perdue, et elle ne franchit aucune porte.

---

## 3. Les fichiers

### `src/app/globals.css` (+105)

- **Six pigments bruts dans un `:root` nu** — `--color-paper`, `-line`, `-soft`,
  `-muted`, `--color-ink`, `-soft`.
- **Deux blocs de portée** : `html:not([data-theme='dark']) .mkt-paper` et son
  compagnon `html:not([data-theme='dark']) body:has(.mkt-paper)`, remappant les
  six mêmes variables sémantiques. Aucun remap en thème sombre.
- **Condition 1 de la relecture cockpit** : l'asymétrie est nommée sur place —
  il n'existe pas de `.app-surface`, et c'est délibéré.
- **Condition 2** : un commentaire au-dessus de `body > main` nomme ses **deux**
  consommateurs (l'app qui en dépend, la landing qui la contournera en L2).
  **La règle elle-même n'est pas modifiée.**
- Angle mort Firefox reformulé sur ce que la CI couvre réellement : les trois
  projets Playwright (Chromium desktop, mobile Safari, mobile Chrome) supportent
  tous `:has()` → **chemin compagnon 3/3, chemin de repli 0/3**.

### `src/app/__tests__/contrast-ratios.test.ts` (+277)

`blockAfter()` devient une **recherche ancrée sur du CSS strippé** : les
commentaires sont retirés (remplacés par une espace, jamais par rien — sinon deux
jetons se soudent), puis les occurrences sont parcourues jusqu'à celle qui
**débute une règle**. L'ordre entre les deux est porteur et c'est écrit : sur le
texte brut, le marqueur sombre est précédé de « live in », il ne devient
`}`-précédé qu'une fois le commentaire parti.

L'ancrage est une **recherche**, pas une validation : refuser la première
occurrence ferait planter le test le jour d'un réordonnancement — on aurait
troqué un faux positif silencieux contre une panne, ce qui n'est pas un progrès.

Ajouts : les 8 paires papier · les 4 tokens sémantiques sur **les deux** fonds de
page · « déclaré exactement une fois » ×6 · aucun pigment papier dans le bloc
sombre · les deux portées déclarent les mêmes propriétés **et** visent les mêmes
cibles · toute cible de remap est réellement déclarée · la portée ne s'applique
jamais sans son garde clair · trois témoins prouvant que le durcissement n'a pas
déplacé les blocs historiques.

### `docs/design/token-usage.md` (+150)

§3 gagne les six bruts (❌ partout) et le tableau des **quatre motifs de portée**.
§4 gagne une colonne **« Gardé »** : ✅ = la paire est recalculée à chaque
`npm run test`, ⬜ = valeur documentaire qu'aucune porte ne surveille. Cette
colonne existe parce que ce tableau avait dérivé — écrire des ratios à la main
sans dire lesquels sont tenus, c'était recréer le défaut qu'on répare.

§2 : la **règle** est juste, sa **justification** mesurait la mauvaise paire.
Elle comparait `--color-muted` à `--color-foreground`, du texte à du texte — une
paire sans signification WCAG, et dont les chiffres ne se reproduisaient pas
(3.36 → **3.75** ; 3.6 → **2.08**). Ce qui échoue réellement, c'est
`text-foreground` **posé sur** `bg-muted` : **3.75:1**, sous AA — exactement
l'anti-pattern montré en exemple. L'interdiction tient, pour cette raison-là.

### `.claude/skills/ankora-design-system/SKILL.md` (+12)

Le motif `.mkt-paper` et l'absence délibérée de `.app-surface`. « Pricing »
retiré des sections landing (composant supprimé en #307). Et la ligne 22, qui
affirmait « Dark mode is the default » : **faux**, `ThemeBootScript.tsx` suit la
préférence OS et le jeu de base de `@theme` est le clair — c'est précisément la
ligne qui aurait fait chercher au prochain lecteur une base sombre inexistante.

### `docs/adr/ADR-039-…` (+105) · `docs/adr/README.md` · `docs/design-tokens.md`

Consignation de la relecture, amendement `@theme` → `:root`, index ADR corrigé,
et un bandeau de supersession sur `design-tokens.md` (cf. §5).

---

## 4. L'amendement : `:root` et non `@theme`

ADR-039 §Décision prescrivait `@theme`. L'implémentation déclare les six dans un
`:root` nu, **et c'est plus fidèle à l'ADR qu'il ne l'était à lui-même**.

Une clé `--color-*` dans `@theme` fait générer par Tailwind toute une famille
d'utilitaires — fond, texte, bordure, anneau, séparateur, contour, curseur,
étapes de dégradé, remplissage, tracé. Elle met donc **un second vocabulaire de
couleurs à portée de chaque composant** : précisément l'alternative que le
§Alternatives écartées rejette (« divergence garantie »). Ma première parade était
un test interdisant `text-*` / `bg-*` / `border-*` — une clôture avec le portail
ouvert, comme le reviewer l'a montré en énumérant les neuf autres préfixes.
Hors `@theme`, aucune clé n'existe : il n'y a pas de classe à interdire.

**Une hypothèse écartée parce qu'elle est fausse.** La relecture avançait un
second motif : Tailwind v4 élaguerait les variables `@theme` inutilisées, ce qui
aurait rendu `var(--color-paper)` invalide. **Mesuré et réfuté** —
`--color-success-300` et `--color-accent-100` sont déclarés dans `@theme`,
consommés par aucun utilitaire, et **présents** dans le CSS compilé. Instrument
validé par un témoin positif. L'amendement ne repose donc que sur le premier
motif ; c'est écrit dans l'ADR pour que le sujet ne se rouvre pas.

---

## 5. Ce qui a été trouvé à côté

### `docs/design-tokens.md` — supplanté, pas corrigé

Ce document se déclare « Source of truth » et prescrit pour `--color-warning` la
valeur `#d97706` : **exactement celle qu'ADR-036 existe pour interdire** (3.19:1
sur blanc). Il annonce aussi une palette d'accent « Amber » là où le produit tient
le laiton, et un mécanisme de thème par `prefers-color-scheme`. Daté du 19 avril
2026 — antérieur au verrouillage laiton du 24, à ADR-035 et à ADR-036. **Tout son
corpus est pré-laiton.**

Il est **supplanté, pas réparé**. Le corriger ligne à ligne maintiendrait en vie
un quatrième siège d'autorité sur les tokens ; or ce n'est pas un manque
d'information qui l'a fait dériver, c'est qu'il y en avait un de trop. Deux
successeurs nommés, parce qu'il mélangeait deux autorités : `globals.css` pour
les **valeurs**, `token-usage.md` pour l'**usage**.

Et surtout : **son §Maintenance est abrogé explicitement.** C'est lui le danger,
pas les valeurs. Une valeur fausse est inerte tant que personne ne la copie ; une
procédure impérative en quatre étapes se suit jusqu'au bout, et son étape 2
demandait d'écrire dans ce fichier — le perpétuant à chaque changement de token.
Un bandeau en tête n'aurait pas désarmé une consigne située 185 lignes plus bas.

### `docs/adr/README.md` — index incomplet

27 fichiers dans `docs/adr/`, 15 dans l'index, et 018 affiché `Proposed` alors
que le fichier le déclare `Superseded` depuis le 5 août. Corrigé sur ces deux
points, plus la ligne 039. **Les onze restants (019-024, 034-038) ne sont pas
rattrapés ici** : ce serait un chantier de relecture à part entière, et l'ajouter
à une PR de tokens la rendrait invérifiable.

### Non traité — propriétaires nommés

- **Tableau sombre de `token-usage.md` §4** : sondé, deux lignes sur trois ne se
  reproduisent pas (`text-muted-foreground` mesure **11.68**, annoncé 9.3 ;
  `text-muted` mesure **6.76**, annoncé 3.6 « Sub-AA »). Les valeurs annoncées
  sont **pessimistes** — aucun risque d'accessibilité vivant. Non corrigées : L1
  ne touche aucune valeur sombre, et réécrire un tableau qu'elle n'exerce pas
  serait un changement non vérifié. → session cockpit, avec la refonte du §2.
- **`docs/superpowers/specs/2026-07-26-ankora-refonte-v2-plan.md`** — fausse
  alerte, et de ma part. J'ai écrit ici qu'il n'avait jamais été marqué
  supplanté, sur la foi d'un `git diff --stat` de **#335**. Le bandeau existe
  bien, avec ses deux prescriptions périmées nommées (`/app?simulate=1` et
  390 × 844) : il est dans **#337**. Chercher au mauvais endroit et conclure à
  une absence, c'est la même faute que je documente plus haut — deux fois dans la
  même PR. **Rien à faire, la dette n'existe pas.**
- **`public/llms-full.txt`** est généré par le build ET committé, donc tout build
  salit l'arbre (ici, un simple tampon de date). Écarté du commit. → dette suivie.

---

## 6. Portes

| Porte                     | Résultat                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `npm run lint`            | **0 erreur**, 9 avertissements — ligne de base inchangée              |
| `npm run lint:use-server` | ✓                                                                     |
| `npm run typecheck`       | **0 erreur**                                                          |
| `prettier --check`        | conforme (7 fichiers)                                                 |
| `npm run test`            | **160 fichiers, 2151 tests, 0 échec**                                 |
| `npm run build`           | ✓ compilé en 45 s, 166 pages statiques                                |
| `npm run dev -- -p 3200`  | `/` **200** · `/en` **200** · `/faq` **200**, 0 erreur de compilation |
| Planchers e2e             | **228 / 41 inchangés** — aucune spec `e2e/` touchée                   |

> ⚠️ **Sur `npm run test` : la première exécution a rougi, et pas pour une bonne
> raison.** Deux passages successifs du **même code** ont produit des jeux
> d'échecs **disjoints** (2 tests MFA, puis 5 tests sans rapport). Chacun des cinq
> fichiers passe **isolément en 2,3 s** contre 207 s d'environnement en suite
> complète. C'est de la contention de workers sur une machine chargée. Relancé à
> `--maxWorkers=4` : **2151/2151**. Consigné plutôt que tu par honnêteté — la CI,
> qui n'a pas ce voisinage, est l'arbitre.

### Mesure sur le CSS **compilé** (pas la source)

La porte que le plan initial n'avait pas : quatre portes vertes ne prouvent pas
qu'un octet atteint le navigateur, et les deux tests de tokens lisent le
**source**. Après `npm run build`, sur le chunk CSS unique (107 684 octets) :

| Vérification                                        | Résultat                               |
| --------------------------------------------------- | -------------------------------------- |
| les six pigments                                    | **1 déclaration chacun**               |
| les deux blocs de portée                            | présents                               |
| utilitaire `bg-paper` / `text-ink` généré           | **non** — le `:root` tient sa promesse |
| témoin d'instrument (`--color-brand-500`, consommé) | présent                                |

---

## 7. Falsification — les tests peuvent-ils échouer ?

Un test vert ne prouve rien tant qu'on ne l'a pas vu rougir. Quatre mutations,
appliquées **hors de l'arbre suivi** (sauvegarde puis restauration garantie par
`finally`, empreinte SHA-256 identique après coup) :

| Mutation                                | Attendu                       | Observé                             |
| --------------------------------------- | ----------------------------- | ----------------------------------- |
| une propriété retirée du bloc compagnon | garde de synchronisation      | **2 échecs**                        |
| `--color-ink` déclaré une seconde fois  | garde « exactement une fois » | **1 échec**                         |
| `--color-ink` éclairci à `#cccccc`      | paires encre/papier           | **3 échecs**                        |
| `--color-paper` assombri à `#e8e4d8`    | marge de `danger`             | **3 échecs**, dont `--color-danger` |

La quatrième mérite d'être lue : **assombrir le papier fait tomber `danger` sous
AA**, exactement le risque annoté dans le test (4.59, soit 0.09 de marge).

Et `blockAfter()`, falsifié séparément par un script qui lit le vrai fichier et
mute **en mémoire**, sans toucher au dépôt. Une seule règle insérée entre la
phrase du commentaire et le vrai bloc sombre :

| Implémentation      | `--color-card` résolu            |
| ------------------- | -------------------------------- |
| ancienne (avant L1) | **AUCUN** — bloc sombre perdu    |
| nouvelle            | `#111a2e` — toujours le bon bloc |

_(Premier jet de cette sonde : elle insérait la règle **après** le bloc sombre et
ne prouvait rien. Corrigée après vérification de l'ordre des positions — une
sonde qui regarde au mauvais endroit ne rend pas un résultat vide, elle rend un
faux résultat.)_

---

## 7bis. Relecture de code indépendante — Sourcery étant hors quota

Sourcery n'a relu aucune PR de cette série (quota hebdomadaire épuisé). Une
relecture indépendante a donc été menée à sa place, et **elle a trouvé un défaut
que ma propre falsification avait manqué.**

### Le défaut : les paires ne passaient pas par le remap

Le `describe` s'appelait « the pairs the remap creates » et le SKILL promettait
que le test « recalcule chaque paire ». En réalité les paires étaient **codées en
dur à partir des pigments bruts** — `fileToken('color-ink')` sur
`fileToken('color-paper')` — sans jamais consulter `remapPairs()`. Le test ne
savait pas quelle variable sémantique pointait sur quel pigment.

Conséquence, vérifiée par mutation : repointer `--color-foreground` sur
`--color-paper-line` dans **les deux** blocs laissait la suite **entièrement
verte**, avec le corps de texte de la landing à **1.21:1**.

Mes quatre mutations initiales ne pouvaient pas le voir : elles portaient sur les
**valeurs** et sur la **symétrie des deux blocs**, jamais sur la **justesse d'une
cible**. C'est la limite d'une falsification écrite par l'auteur du test.

**Correctif** : `underPaper(semantic)` résout chaque token à travers le remap —
pigment si remappé, valeur `@theme` sinon — et les paires sont exprimées en
termes **sémantiques** (`--color-foreground` sur `--color-background`). Un
mauvais ciblage déplace donc un ratio, et un ratio déplacé échoue. Ajouter un
token au remap fait suivre le test automatiquement.

### Un second défaut : le fond que la classe ne peignait pas

Le commentaire affirmait que sur Firefox 113-120 « le contenu de page rend papier
(cette classe peint son propre fond) ». **La portée ne déclarait que six
variables, aucun `background`** — le repli aurait rendu une landing intégralement
ardoise. ADR-039 supposait pourtant cette ligne : c'est l'implémentation qui a
manqué la marche, pas le commentaire qui mentait. `background:
var(--color-background)` ajouté à la portée, qui devient auto-suffisante — L2 n'a
plus à penser à poser un utilitaire de fond.

### Les autres corrections

| Constat                                                                                                                                                                                               | Correction                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « déclaré exactement une fois » n'épingle pas la **portée** : déplacer un pigment vers un bloc conditionnel gardait le compte à 1                                                                     | troisième garde interlockée — chaque pigment est déclaré dans le `:root` **inconditionnel**, localisé par son contenu                                                                    |
| le garde anti-remap-non-gardé ne voyait qu'une seule écriture de la faute (`.foo, .mkt-paper {`, `body .mkt-paper {`, `@media { .mkt-paper {` passaient)                                              | juge le **prédicat** : toute règle mentionnant la classe **et déclarant des variables** doit porter le garde clair. Ne rougira donc pas sur la règle de mise en page que L2 doit ajouter |
| `blockAfter()` prenait « la `{` suivante » sans vérifier qu'elle appartient à la règle du marqueur — une at-rule déclarative (`@layer …;`) aurait rendu un bloc étranger, en silence                  | mine désamorcée en une ligne : un `;` avant la `{` disqualifie l'occurrence                                                                                                              |
| fusionner les deux blocs en liste de sélecteurs — le réflexe DRY devant deux blocs identiques — ferait **jeter la règle entière** sur Firefox 113-120 (une liste de sélecteurs n'est pas _forgiving_) | interdiction écrite dans le CSS, avec le mécanisme nommé                                                                                                                                 |
| `SKILL.md` promettait « every pair », alors que 10 des 23 lignes du §4 sont ⬜                                                                                                                        | reformulé — c'est cette formulation qui a fait dériver le §4                                                                                                                             |
| `remapPairs` comparé en ordre, `declaredProps` trié : réordonner un bloc faisait rougir l'un et pas l'autre                                                                                           | les deux triés                                                                                                                                                                           |
| la paire CTA figurait sous « pairs the remap creates » alors qu'aucun de ses tokens n'est remappé                                                                                                     | sortie dans son propre cas, avec le motif écrit                                                                                                                                          |
| `tokenIn` / `fileToken` / `declarationCount` n'écrivaient pas le même motif de déclaration                                                                                                            | alignés                                                                                                                                                                                  |

### Falsification, seconde passe

| Mutation                                                   | Observé                             |
| ---------------------------------------------------------- | ----------------------------------- |
| `--color-foreground` repointé sur `--color-paper-line`     | **3 échecs** (0 avant le correctif) |
| `surface-soft` et `surface-muted` intervertis              | **1 échec**                         |
| `--color-ink` déplacé du `:root` vers un bloc conditionnel | **1 échec**                         |
| remap non gardé écrit en liste de sélecteurs               | **1 échec**                         |

La deuxième mérite un mot : elle passait encore **après** le correctif principal,
parce que les deux teintes papier sont voisines et qu'aucun contraste ne bouge.
Un test de contraste ne peut pas voir une inversion d'élévation. Plutôt qu'une
assertion qui recopierait la table de remap, l'**intention** est encodée : une
surface « soft » est plus claire qu'une surface « muted » — règle qui vaut aussi
dans le jeu ardoise, et que l'inversion casse.

Suite passée de **53 à 60 cas**.

## 8. DoD

1. ⏳ CI verte — à vérifier après push
2. ⏳ Sourcery muet sur le dernier commit — **quota hebdomadaire épuisé** au
   8 août ; un `check-sourcery-resolved` vert signifiera « rien à résoudre », pas
   « contenu examiné ». À ne pas rapporter comme une revue qui aurait eu lieu.
3. ⏳ Fils résolus
4. ⏳ `mergeStateStatus` = `CLEAN`
5. ✅ Ce rapport

**@thierry merge.** Et le passage d'ADR-039 en `Accepted` reste **une décision
séparée**, à prendre explicitement — pas un effet de bord de ce merge.
