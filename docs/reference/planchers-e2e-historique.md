# Planchers e2e — l'historique des mesures

> Déplacé depuis `CLAUDE.md` le 6 août 2026. **La règle vit toujours dans
> `CLAUDE.md`** ; ce fichier ne garde que le journal des relevés, qui n'a pas
> besoin d'être en contexte à chaque session pour rester consultable.
>
> Chaque entrée dit ce qui a été **mesuré**, pas ce qui était attendu. C'est ce
> qui distingue un plancher d'une estimation, et c'est pour ça qu'on ne jette
> pas ces lignes.

### Le nombre de cas e2e exécutés ne descend jamais

**Critère permanent, ajouté le 26 juillet 2026.** Une CI verte ne vaut que ce
qu'elle exécute. Le 26 juillet, le job `Playwright E2E` affichait **214 passed /
173 skipped** : 44,7 % de la suite ne tournait nulle part, et tous les parcours
connectés étaient dans les 173. Un `gh pr checks ✅` ne disait rien des surfaces
les plus sensibles de l'app.

Deux jobs, donc **deux planchers distincts** — un chiffre global agrégé serait
ininterprétable au premier conflit, donc ignoré :

| Job                              | Plancher au 6 août 2026                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `Playwright E2E`                 | **228 passed** (224 au 31/07 — **enfin mesuré**, cf. infra)     |
| `Playwright E2E (authenticated)` | **41 passed** (40 avant, +1 `bottom-tab-bar-client-navigation`) |

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
