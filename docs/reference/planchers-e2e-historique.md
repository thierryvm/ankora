# Planchers e2e — l'historique des mesures

> Déplacé depuis `CLAUDE.md` le 6 août 2026. **La règle vit toujours dans
> `CLAUDE.md`** ; ce fichier ne garde que le journal des relevés, qui n'a pas
> besoin d'être en contexte à chaque session pour rester consultable.
>
> Chaque entrée dit ce qui a été **mesuré**, pas ce qui était attendu. C'est ce
> qui distingue un plancher d'une estimation, et c'est pour ça qu'on ne jette
> pas ces lignes.

## Le nombre de cas e2e exécutés ne descend jamais

**Critère permanent, ajouté le 26 juillet 2026.** Une CI verte ne vaut que ce
qu'elle exécute. Le 26 juillet, le job `Playwright E2E` affichait **214 passed /
173 skipped** : 44,7 % de la suite ne tournait nulle part, et tous les parcours
connectés étaient dans les 173. Un `gh pr checks ✅` ne disait rien des surfaces
les plus sensibles de l'app.

Deux jobs, donc **deux planchers distincts** — un chiffre global agrégé serait
ininterprétable au premier conflit, donc ignoré :

| Job                              | Plancher au 23 août 2026                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Playwright E2E`                 | **268 passed** (259 au 22/08, 253 plus tôt le 22/08, 247 au 11/08, 241 plus tôt le 11/08, 231 au 09/08, 228 au 06/08) |
| `Playwright E2E (authenticated)` | **50 passed** (45 avant, +5 `gdpr-deletion-queue` — PR-C)                                                             |

> **Public : 259 → 268, mesuré le 2026-08-23**, à la correction de l'en-tête
> mobile ([#438](https://github.com/thierryvm/ankora/pull/438)). **+3 cas × 3
> projets iPhone** — la spec vit sous `e2e/mobile-ios/`, elle ne tourne donc que
> sur les trois presets WebKit, et elle couvre trois pages (`/faq`, `/glossaire`,
> `/legal/cgu`).
>
> Delta mesuré **dans les deux sens avant le premier push** : **477 → 486**
> déclarés. Déclarés et exécutés coïncident, aucun cas remplacé ni réveillé.
>
> **Piège d'instrument rencontré ici, et il vaut d'être noté** : `git stash push`
> **sans `-u`** n'emporte pas un fichier non suivi. Les deux premières mesures
> portaient donc sur le même arbre et rendaient **486 des deux côtés** — un delta
> de 0 parfaitement crédible, et faux. Une spec neuve est toujours non suivie au
> moment où l'on mesure son delta : c'est le cas le plus fréquent, pas un cas
> limite.
>
> Falsification dans les deux sens : sans le correctif, 3 échecs sur iPhone SE ;
> avec, 9/9. Le test n'assert PAS `toBeVisible()` — vrai pour un élément peint
> hors du viewport, c'est-à-dire l'état exact qu'on corrige — mais
> `elementFromPoint` au centre du bouton.
>
> **Confirmé sur la CI de la PR** (run `32640067745`) : public
> **268 passed / 218 skipped**, authentifié **50 passed / 5 skipped**. Le nombre
> de `skipped` ne bouge pas.

---

> **Public : 253 → 259, mesuré le 2026-08-22**, à la correction des cibles
> tactiles ([#432](https://github.com/thierryvm/ankora/pull/432)). Une seule
> source, et c'est le cas le plus simple du journal : **+2 cas × 3 projets**.
> `e2e/a11y/cibles-tactiles.spec.ts` n'est pas sous `mobile-ios/`, elle tourne
> donc sur `chromium-desktop`, `mobile-safari` et `mobile-chrome`.
>
> Delta mesuré **dans les deux sens avant le premier push**, par
> `npx playwright test --list` sur la branche puis sur `main` : **471 → 477**
> déclarés. Ici le +6 déclaré et le +6 exécuté coïncident — contrairement au
> relèvement précédent, aucun cas n'a été remplacé ni réveillé, il n'y a que de
> l'ajout.
>
> Falsification dans les deux sens, elle aussi avant le push : sans le correctif,
> `« /login "Mot de passe oublié ?" — hauteur de cible (mesurée 20.00 px,
plancher 24) »` → 2 failed ; avec, 6 passed. Un test de plancher qui n'a pas
> été **vu rouge** ne prouve pas qu'il mesure quelque chose.
>
> **Confirmé sur la CI de la PR** (run `32580942195`) : public
> **259 passed / 218 skipped**, authentifié **50 passed / 5 skipped**. Le nombre
> de `skipped` ne bouge pas, ce qui est le contrôle attendu : les deux cas ajoutés
> s'exécutent partout où ils sont découverts, aucun ne dort.

---

> **Public : 247 → 253, mesuré le 2026-08-22**, à la refonte du simulateur
> ([#429](https://github.com/thierryvm/ankora/pull/429)). Deux sources, et elles
> se distinguent :
>
> - **+1 cas × 3 projets** — `e2e/landing-sections.spec.ts` gagne « double le
>   graphique d'une vue tableau » : la refonte ajoute une vue tableau que rien
>   n'exerçait, et sans elle les valeurs intermédiaires ne seraient atteignables
>   qu'à la souris.
> - **+1 `test.fixme` levé × 3 projets iPhone** — `e2e/mobile-ios/simulator.spec.ts`,
>   BUG-iOS-010. Le curseur porte désormais `aria-valuemin` / `aria-valuemax` /
>   `aria-valuenow` explicites, donc le cas s'exécute au lieu de dormir. **Un
>   plancher qui monte parce qu'un cas cesse d'être ignoré vaut mieux qu'un
>   plancher qui monte parce qu'on a écrit un test de plus.**
>
> **Delta mesuré dans les deux sens AVANT le premier push**, par
> `npx playwright test --list` sur la branche puis sur `main` :
> **468 → 471 cas déclarés, soit +3.** Deux cas remplacés au passage (zones de
> seuil et KPI annuel) plutôt que supprimés — d'où un delta de +3 et non +6 sur
> les déclarés, alors que les _exécutés_ gagnent 6 : les deux cas remplacés
> tournaient déjà.
>
> **Confirmé sur la CI de la PR** (run `32574663536`) : public
> **253 passed / 218 skipped**, authentifié **50 passed / 5 skipped**.

> **Planchers inchangés (247 / 50), lecture PR L3 du 2026-08-11** (#376, dernière
> PR du programme landing). Aucune spec ajoutée ni retirée — delta **0 mesuré
> dans les deux sens** par `npx playwright test --list` avec le diff puis avec
> la spec restaurée de HEAD : **462 cas dans 41 fichiers, identiques**. Seul le
> contenu d'assertions bouge (`mainEntity` 4 → 5, sonde 375 px durcie vers
> `body.scrollWidth` — #344, mesurée verte sur main avant d'entrer).
>
> **Un piège de lecture à connaître** : les jobs de la PR affichent
> **241 passed / 50 passed** (run `31506385973`) pendant que ce tableau disait
> déjà 247 — les deux sont vrais. La branche L3 est partie de `b0d634e`,
> AVANT le +6 de #348 (`299386e`) ; sa CI a donc exécuté la suite d'avant.
> Un plancher se compare **au niveau de la base de la branche**, jamais au
> tableau du jour — c'est le delta qui se transporte, pas la valeur absolue
> (règle déjà écrite pour les machines, elle vaut aussi pour les bases). La
> fusion porte les deux changements — **mesuré sur la CI de main post-merge**
> (run `31515868208`, squash `e74a499`) : public **247 passed / 221 skipped**,
> authentifié **50 passed / 5 skipped**. Les deux planchers du tableau, exacts.

---

> **Public : 241 → 247, mesuré le 2026-08-11**, à la correction de
> [#348](https://github.com/thierryvm/ankora/issues/348). Deux cas ajoutés à
> `e2e/consent-first-visit.spec.ts`, **× trois projets** (`chromium-desktop`,
> `mobile-safari`, `mobile-chrome`) — la spec n'est pas sous `mobile-ios/`, donc
> les trois projets iPhone ne la découvrent pas.
>
> **Mesuré dans les deux sens** : la spec rend **`6 passed`** en excluant les deux
> nouveaux titres et **`12 passed`** avec. Delta **+6**, sans reste.
>
> **Authentifié inchangé à 50** : ce fichier ne porte aucun marqueur de seed
> (`adminClientOrNull`, `seededUser`), donc la sélection authentifiée ne le
> découvre pas et `e2e/authenticated-specs.json` ne bouge pas.
>
> Les deux cas restent sur le `test` de base de `@playwright/test`, jamais sur la
> fixture partagée — c'est tout l'objet de ce fichier. Y brancher la fixture
> reviendrait à les supprimer sans le dire.

---

> **Authentifié : 45 → 50, mesuré le 2026-08-11**, à la livraison de PR-C (ADR-042).
> Les cinq cas s'ajoutent à `e2e/gdpr-deletion-queue.spec.ts`, **sans nouveau
> fichier de spec** : la sélection authentifiée est détectée par contenu et ce
> fichier y figurait déjà, donc `e2e/authenticated-specs.json` ne bouge pas.
>
> **Mesuré dans les deux sens, même machine, même serveur, même base locale** :
> la spec rend **`6 passed`** en excluant les cinq nouveaux titres
> (`--grep-invert`) et **`11 passed`** avec. Delta **+5**, sans reste.
>
> **Plancher public inchangé à 241** : le `describe` entier saute sans clé
> `service_role` **et** sans Supabase locale (`test.skip(!admin)` puis
> `test.skip(!isLocalSupabase)`), et un cas sauté ne sort pas de `N passed`.
>
> Ce que ces cinq cas prouvent et qu'aucun Vitest ne peut rendre : une écriture
> et deux lectures privilégiées sur une table en `FORCE ROW LEVEL SECURITY` —
> là où l'incident H3 a montré qu'on peut ne toucher **aucune ligne sans lever
> d'erreur** — et le parcours complet d'une demande en quarantaine (annuler,
> puis redéposer), qui traverse l'index d'unicité.
>
> **Réparation d'instrument nécessaire au passage** : Playwright peut cliquer un
> bouton **avant que React n'ait attaché son gestionnaire**. Le cliché d'échec
> montrait le champ de confirmation rempli et le bouton toujours `disabled` —
> un composant rendu, mais qui n'écoutait pas. `clickUntilSettled()` réessaie le
> **clic**, jamais l'assertion : la condition de sortie est lue en base.
>
> **Authentifié : 41 → 45, mesuré le 2026-08-10**, à la livraison J1 (ADR-038 D3).
> `e2e/attribution-paiements.spec.ts` ajoute 4 cas, exécutés par
> `chromium-desktop` seul — la spec n'est pas sous `mobile-ios/`, donc le projet
> `iPhone 14` ne la découvre pas.
>
> **Mesuré dans les deux sens, même machine, même serveur, même build** : la
> sélection authentifiée complète rend **`41 passed / 5 skipped`** sans la spec
> et **`45 passed / 5 skipped`** avec. Delta **+4**, sans reste. Le plancher local
> tombe ici sur la valeur CI, ce qui n'est pas garanti et ne se suppose pas d'un
> relevé à l'autre : **c'est le delta qui se compare.**
>
> **Plancher public inchangé à 241** : la spec y est découverte par les trois
> projets non-iPhone et y **saute** — vérifié sans clé `service_role`,
> `12 skipped`, zéro passé, zéro échec.
>
> Trois des quatre cas vérifient des garanties de **base de données** (trigger de
> gel, clé étrangère composite, non-propagation d'un `UPDATE`) qu'aucun Vitest ne
> peut rendre : les tests d'action travaillent sur un faux client. Le quatrième
> passe par l'interface et couvre le geste groupé de `src/lib/actions/obligations.ts`,
> **qui n'a aucun test Vitest** — ni le fichier, ni ses deux insertions par lot.
>
> **Ce que cette mesure a coûté en réparation de harnais** : `.env.local` porte
> une URL Upstash **factice**, et en build de production `rateLimit()` échoue
> FERMÉ — la toute première connexion renvoie « Service temporairement
> indisponible », ce qui se lit comme un bug applicatif. La CI ne rencontre pas
> ça parce qu'elle monte `serverless-redis-http` devant un Redis nu. Reproduire
> ces deux conteneurs en local est la condition pour qu'un cas authentifié qui
> se connecte prouve quoi que ce soit.

> **Public : 231 → 241, mesuré le 2026-08-10**, au correctif de l'en-tête collant.
> Trois mouvements, tous dans le même sens et tous mesurés :
>
> - **+6** — `e2e/mobile-ios/sticky-header.spec.ts`, nouvelle : 2 cas (`/` et
>   `/faq`) × 3 projets iPhone.
> - **+3** — `test.fixme(true)` levé sur « body has overflow-x », endormi depuis
>   le 4 mai au motif que WebKit renverrait toujours `visible`. Re-mesuré : il
>   renvoie `hidden` puis `clip`, les deux valeurs que ce motif disait
>   impossibles.
> - **+1** — `test.fixme` levé sur la branche iPhone SE du premier cas, endormi
>   depuis le 9 mai (BUG-iOS-011).
>
> **Mesuré dans les deux sens, même machine, même serveur** : `landing.spec.ts`
> seule sur les 3 projets iPhone rend `11 passed / 10 skipped` avant, et
> `21 passed / 6 skipped` avec la nouvelle spec et les deux `fixme` levés. Le
> delta `+10 passed / −4 skipped` se décompose sans reste (6 + 3 + 1), et les 4
> sautés en moins sont exactement les 4 cas réveillés.
>
> **Ce que ce relèvement dit sur le plancher précédent** : les 231 comptaient
> quatre cas qui ne prouvaient rien, et le site expédiait pendant ce temps trois
> en-têtes `sticky` inertes sur toutes ses pages. Aucune porte n'a rougi en trois
> mois — c'est @thierry qui l'a vu sur un iPhone réel. Un plancher mesure ce
> qu'on exécute, jamais ce qu'on couvre.

> **Public : 228 → 231, mesuré le 2026-08-09**, à la PR L2 du programme landing
> (#339, squash `c378978`). Relevé dans le log du run `31335138067`, SHA
> `14c1325` : job public `231 passed / 198 skipped`, **0 failed, 0 flaky** ; job
> authentifié `41 passed / 5 skipped`, **inchangé**.
>
> **Le +3 est un cas par projet iPhone, pas trois specs nouvelles.** L2 lève le
> `fixme` BUG-iOS-HERO-OVERFLOW, qui neutralisait le même cas sur les trois
> presets iPhone. C'est le mouvement sain décrit dans la règle : un plancher qui
> MONTE parce qu'un trou a été bouché — ici un défaut de débordement horizontal
> que la suite constatait sans jamais le faire rougir.
>
> **Relevé après coup, et c'est la faute à ne pas rejouer.** Le chiffre a été
> mesuré avant le merge, mais ni `CLAUDE.md` ni ce journal ne l'ont reçu : ils
> ont annoncé **228** pendant que la CI en exécutait 231. Un plancher écrit trop
> bas ne rougit jamais — il laisse passer une suppression de trois cas sans que
> rien ne bouge. C'est exactement la classe de défaut que ce garde-fou existe
> pour attraper, et il a failli être aveugle à son propre relèvement. La
> consignation du plancher fait partie de la PR qui le déplace, pas du suivi.

> **Authentifié : 40 → 41, mesuré le 2026-08-06.**
> `e2e/bottom-tab-bar-client-navigation.spec.ts` atteint le cockpit PAR UN CLIC,
> depuis un document chargé sur `/`, et vérifie qu'aucun document n'a été
> rechargé entre-temps. **+1 seul cas, pas +2** : les projets iPhone sont
> restreints à `e2e/mobile-ios/`, cette spec ne tourne donc que sur
> `chromium-desktop` — mesuré en lançant les deux projets, Playwright annonce
> « Running 1 test ».
>
> **Plancher public inchangé à 228** : la spec y est découverte et y **saute**
> (`test.skip(!admin, …)` au niveau `describe`), vérifié en local — `1 skipped`,
> zéro passé.
>
> Le delta a été mesuré **dans les deux sens sur la même machine** : sur le code
> d'avant le correctif, la spec échoue sur `getByTestId('bottom-tab-bar')` —
> `element(s) not found` — et non sur une étape antérieure. Elle n'est donc pas
> vacuole.
>
> **Cette mesure a exigé de réparer le harnais local d'abord**, et deux écarts
> avec la CI l'empêchaient de rien prouver : cf. le §« Faire tourner le job
> authentifié en local » de `docs/runbooks/`.

> **Plancher public : 228, OBSERVÉ le 2026-08-02.** Il était attendu à 224 +4
> depuis le 29 juillet et n'avait jamais été relevé — la note ci-dessous
> réclamait « la valeur mesurée à la première CI verte ». C'est fait : run
> `30752902825`, `228 passed, 195 skipped`. Le solde calculé (−2 ADR-034,
> +6 consentement) tombait juste, mais il ne valait rien tant qu'il n'était pas
> vu ; il l'est maintenant, et le chiffre remplace l'estimation.
>
> **Authentifié : 39 → 40, mesuré le 2026-08-03.** `e2e/navigation-usable-first-visit.spec.ts`,
> un seul cas, exécuté par `chromium-desktop` uniquement (même raison que
> `navigation-reachable` : la spec n'est pas sous `mobile-ios/`). Mesuré en local
> **dans les deux sens** sur la même machine et la même stack : la liste complète
> des specs authentifiées rend **`38 passed`** sans elle et **`39 passed`** avec.
> Delta local +1, delta CI attendu +1. Les valeurs absolues diffèrent de la CI
> (39/40) parce que l'environnement local n'est pas la parité CI — **c'est le
> delta qui se compare**. Dans le job public elle ajoute 3 sautés et 0 passé
> (vérifié sans clé `service_role` : `3 skipped`), donc le plancher public ne
> bouge pas.
>
> **Authentifié : 38 → 39**, `e2e/navigation-reachable.spec.ts` (PR #293), un
> seul cas, exécuté par `chromium-desktop` uniquement — la spec n'est pas sous
> `mobile-ios/`, donc le projet `iPhone 14` ne la découvre pas. Dans le job
> public elle ajoute 3 sautés et 0 passé, donc le plancher public ne bouge pas
> de son fait.
>
> Mesuré aussi en local avant le push, dans les deux sens : `origin/main` rend
> `37 passed` sur cette machine et la branche `38`. Le delta local (+1) et le
> delta CI (+1) concordent ; les valeurs absolues diffèrent parce que
> l'environnement local n'est pas la parité CI. **C'est le delta qui se compare,
> jamais le nombre absolu d'une machine à l'autre.**

> **⚠️ Plancher public à re-mesurer (chantier 1, 29 juillet 2026).** ADR-034 a
> supprimé `/design-playground` et sa spec `e2e/design-playground.spec.ts`
> (1 cas × 2 projets non-webkit → **−2 attendus**). Le chiffre **n'est pas
> corrigé ici** : la doctrine exige un nombre **observé**, et il ne l'a pas été.
> Les e2e n'ont pas pu tourner sur la machine du chantier — Docker absent, donc
> pas de `supabase start`, et le projet Supabase lié est la **production** :
> les specs authentifiées ne sautent qu'en l'absence de clé `service_role`, donc
> les lancer aurait écrit de vraies lignes en prod. **À la première CI verte
> après ce chantier : relever la ligne `N passed` du job public et inscrire la
> valeur mesurée ici.** Le job authentifié n'est pas affecté par ADR-034.
>
> **Toujours pas mesuré au 31 juillet 2026** — Docker est installé depuis, mais le
> plancher public exige un second build (les `NEXT_PUBLIC_*` sont inlinées à la
> compilation, et le job public tourne sur un Supabase factice) plus les six
> projets. Reporté délibérément par @thierry : coût élevé, valeur documentaire.
> Le chiffre reste **attendu à −2, jamais observé** — donc pas inscrit.
>
> **Second delta en attente, même jour : +6.** `e2e/consent-first-visit.spec.ts`
> ajoute 2 cas, exécutés par `chromium-desktop`, `mobile-safari` et
> `mobile-chrome` (elle n'est pas sous `mobile-ios/`, donc pas par les trois
> projets iPhone). Vérifié en local sur ces trois projets : **`6 passed`**. Le
> solde attendu du plancher public est donc **−2 +6 = +4**, à confirmer par
> mesure — un delta calculé n'est pas un plancher observé.

> **Job authentifié : 31 → 38, mesuré le 31 juillet 2026.** Première exécution
> réelle de ce job depuis sa création : Docker n'existait pas sur la machine, et
> le projet Supabase lié était la production. Relevé en parité CI (stack locale,
> CLI Supabase épinglée 2.84.2, `retries: 2`, `--workers=1`, `chromium-desktop` +
> `iPhone 14`) : **`38 passed, 5 skipped`**, aucun échec, aucun flaky.
>
> Le +7 ne vient d'aucune spec nouvelle : la quarantaine était appliquée au
> **fichier** alors que les échecs sont par **cas**. `dashboard-cockpit-bloc2`
> (2 cas verts sur 6) et `dashboard-simulator-drawer` (5 sur 6) retenaient sept
> cas qui passaient. Ils sortent de la liste ; leurs 5 cas réellement cassés
> portent un `test.skip(true, raison)` à leur propre niveau.
>
> Les 4 entrées restantes ont été **vues rouges**, pas supposées. Les deux
> étiquetées « READY TO VERIFY » au chantier 1 ne le sont pas : elles échouent sur
> des **montants** (`accounts:75` attend `500,00`, `dashboard-expenses:64` attend
> `5,00 €`), ce qu'une relecture de libellés ne pouvait pas voir.

Le relèvement du 27 juillet est mesuré, pas déduit : `gdpr-deletion-queue.spec.ts`
n'apparaît que dans **un** des deux projets du job authentifié (`iPhone 14` filtre sur
`**/mobile-ios/**`), d'où +6 et non +12. Dans le job public elle ajoute **18 sautés et
0 passé** — 6 cas × 3 projets — donc le plancher public ne bouge pas.

Le chiffre est passé de 30 à 31 en cours de PR : `test-quality-auditor` a montré que les
trois corrections UI n'avaient aucun test, et le sixième cas les couvre. Un plancher qui
monte parce qu'un trou a été trouvé est le seul mouvement sain de ce tableau.

**Un plancher qui DESCEND parce qu'un cas ne prouvait rien est le second.** Le 27 juillet,
`cron-gdpr-auth` a été annoncée à +12 puis ramenée à **+9** : `silent-failure-auditor` a
mesuré que `CRON_SECRET` n'est défini dans aucun bloc `env` de `ci.yml`, donc que ces cas
sortent par la première branche de la route et n'atteignent jamais la comparaison de
secret. Un quatrième cas affirmait que les deux refus sont indiscernables — en CI ils sont
littéralement la même branche, l'assertion ne pouvait pas échouer. Retiré plutôt que laissé
à ressembler à un garde-fou. **Un plancher bâti sur des cas vacuoles est pire qu'un
plancher plus bas.**

Chaque relèvement est **mesuré en local avant le premier push**, jamais estimé.
Une spec authentifiée ajoutée sous `e2e/` est aussi découverte par le job public :
elle doit y **sauter** (`test.skip(!admin, …)`) et non échouer, sinon c'est le
plancher public qui bouge.

Le second job porte en plus une **liste de quarantaine** dans
`e2e/authenticated-specs.json` : 6 specs découvertes et comptées mais pas
exécutées, chacune avec sa raison, imprimées à chaque run. Cette liste ne doit
que **rétrécir**. Y ajouter une entrée est un aveu qui se justifie par écrit dans
le rapport de PR, jamais un raccourci pour faire passer une CI.

Mesure — relever la ligne `N passed` / `N skipped` du reporter de **chaque** job :

```bash
gh run view <run-id> --log | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)"
```

> **`flaky` fait partie de l'alternance depuis le 31 juillet 2026, et ce n'est pas
> cosmétique.** Playwright compte à part un cas qui échoue puis passe au retry : il
> sort de `N passed` et gagne sa propre ligne `N flaky`. La commande précédente ne
> filtrait que `passed|skipped` — un cas devenu instable faisait donc **baisser le
> plancher sans qu'aucune ligne n'explique pourquoi**, sur un job pourtant vert.
> Mesuré : `dashboard-account-rename.spec.ts:9` s'est comportée exactement ainsi en
> local (`1 flaky, 1 passed` après échec puis succès au retry #1). Un plancher qui
> baisse sans cause visible se fait arrondir ; c'est la faute que toute cette
> section existe pour empêcher. `failed` est ajouté pour la même raison : un zéro
> absent est une information.
>
> **Un cas `flaky` ne compte pas comme vert.** Il compte comme un cas qui a besoin
> d'être regardé — pas comme un cas qui prouve quelque chose.

Une PR qui fait **baisser** l'un de ces nombres est refusée, sauf justification
écrite dans le rapport de PR. Supprimer une spec obsolète est légitime ; le faire
sans le dire ne l'est pas. Même logique côté sélection : `e2e/authenticated-specs.json`
est committée et toute divergence avec la découverte fait échouer le job, parce
qu'une suite qui rétrécit en silence est pire qu'une suite absente — elle inspire
confiance.

**Règle de refus**: ne JAMAIS déclarer une tâche terminée sans avoir
explicitement vérifié les 5 critères ci-dessus. Un push sans vérif Sourcery
= tâche incomplète, point.
