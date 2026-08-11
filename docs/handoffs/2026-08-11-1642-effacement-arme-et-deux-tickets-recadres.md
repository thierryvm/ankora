---
project: ankora
type: cc-handoff
session: 2026-08-11-1642
agent: cc-ankora
---

# Handoff — le droit à l'effacement est armé, et deux affirmations recadrées

> Session @cc-ankora (Opus 5), clone principal `F:\PROJECTS\Apps\ankora`.
> Carte blanche totale confirmée par @thierry ; garde-fous inchangés.

## 1. État git brut

```text
origin/main : b0d634e feat(gdpr): PR-C — la file de suppression compte ses tentatives (#372)
              5f15a5f docs(passation): ADR-042 figé après quatre tours de revue (#371)
              94206c6 docs(adr): ADR-042 — une file qui ne compte pas ses tentatives (#370)
```

PR ouvertes à la clôture : **#373** (ROADMAP) et **#374** (a11y `/signup`).

## 2. Le résultat principal — l'armement

Le droit à l'effacement était **construit, mergé et inerte depuis le 27 juillet**,
délibérément : un défaut avait été trouvé avant l'armement.

**Les trois lectures de production dues par ADR-024**, lectures seules, agrégées
côté client, aucun identifiant sorti :

| #   | Question                                                      | Mesuré                                             |
| --- | ------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Un workspace a-t-il plus d'un membre ? (rayon de destruction) | 6 workspaces, **0 partagé**                        |
| 2   | Des demandes `pending` en double ?                            | **0**                                              |
| 3   | Le journal d'audit enregistre-t-il depuis #273 ?              | **202 lignes**, plus récente il y a 17 h, 12 types |

La n° 3 était le NO-GO explicite. Elle prouve que le chemin PostgREST
`service_role` **écrit réellement en production** — jamais revérifié depuis le
correctif H3 du 27 juillet, où trois mois d'écritures avaient été refusées en
silence.

`CRON_SECRET` posé, **redéployé**, puis vérifié : sans jeton `401`, mauvais jeton
`401`, **bon jeton `200`** avec
`{"claimed":0,"deleted":0,"failed":0,"purged":0,"purgeOk":true,"capped":false,"stuck":0}`.
Cron enregistré `/api/cron/gdpr` `0 3 * * *`. [#285](https://github.com/thierryvm/ankora/issues/285) fermée.

### Le défaut que la vérification a attrapé, et qui justifie tout le rituel

**La première pose de la variable a échoué EN SILENCE.** La CLI Vercel bascule en
mode non interactif dès qu'elle détecte un agent, et ne lit alors pas l'entrée
standard — laquelle, dans ce harnais, est de toute façon branchée sur le
périphérique nul. Le redéploiement a suivi, et les trois sondes ont rendu `401`,
**y compris avec le bon jeton**.

Sans la troisième sonde, l'armement aurait été annoncé sans exister. **Poser la
variable n'est pas armer.** Forme retenue : `vercel env add … --value $secret
--yes --sensitive` — le secret reste une variable, il n'entre jamais dans la
transcription ; résiduel nommé : une seconde d'exposition à la liste des
processus locaux.

### Merger le code ne pousse pas le schéma — mesuré le soir même

Quelques heures après l'armement, la production n'avait **aucune** des cinq colonnes
d'ADR-042. `supabase migration list --linked` montrait `20260811000001` en local,
colonne distante vide ; la sonde de colonnes rendait `42703 column … does not
exist` sur les cinq.

Le déploiement Vercel avait suivi le merge de #372, pas la migration : le code
déployé lisait donc des colonnes absentes. Rien n'avait cassé pour une seule
raison — **la file était vide**. Un utilisateur demandant son effacement ce
soir-là aurait eu un écran d'état en erreur.

`supabase db push --linked` appliqué, puis vérifié dans les deux sens :

| Sonde                                      | Avant      | Après             |
| ------------------------------------------ | ---------- | ----------------- |
| Les cinq colonnes                          | `42703` ×5 | `200` ×5          |
| `rpc/claim_pending_deletions(5)`           | —          | `200` `[]`        |
| Tri `order=attempts.asc,scheduled_for.asc` | —          | `200`             |
| Statut inventé (témoin **négatif**)        | —          | `400` **`23514`** |

La dernière ligne est celle qui compte : `23514` est une violation de CHECK. Si
la contrainte de statut avait été supprimée sans être remplacée, c'est la clé
étrangère qui aurait parlé (`23503`). Le code d'erreur prouve que la contrainte
élargie est bien en place et qu'elle refuse.

**Rappel de doctrine** : `supabase db push` est manuel et ne suit aucun merge.
Toute PR portant une migration se termine par cette poussée, ou elle n'est pas
terminée.

### Troisième sonde mal placée de la journée

Vouloir rejouer les trois appels d'armement après la migration a produit
`401 / 401 / 401` — **y compris avec « le bon jeton »**. Le jeton n'en était pas
un : `vercel env pull` **ne rend pas la valeur d'une variable marquée
sensible**, il écrit un remplaçant entre crochets. La sonde envoyait ce
remplaçant.

Ce qui a évité la fausse conclusion « l'armement est cassé » : avoir imprimé la
**longueur** du jeton avant de s'en servir — 11 caractères là où on en attendait
des dizaines. Un témoin de forme coûte une ligne et vaut une session.

La preuve du chemin cron a donc été refaite **côté base** (tableau ci-dessus)
plutôt que côté HTTP : la fonction réécrite existe, s'exécute, et sa contrainte
refuse. L'authentification de la route, elle, avait déjà été prouvée à
l'armement et rien ne l'a touchée depuis.

## 3. PR-C (#372) — ce qu'il faut en retenir

Cinq colonnes, un statut `failed` dans l'index d'unicité, une quarantaine
**conjonctive** (5 tentatives ET 5 jours d'ancre), l'écran qui cesse de mentir.

**Un écart assumé à la lettre de l'ADR, mesuré et non raisonné.** G9 décrit le
filtre `attempts < 5` de la réclamation comme « redondant avec la quarantaine ».
Écrit littéralement il ne l'est pas : entre la 5ᵉ tentative et le 5ᵉ jour la
ligne devient **ni réclamable ni quarantainable**. Falsification en base locale :
`claimed=0 status=pending` — la file gèle cinq jours sans marquer une ligne. La
ceinture porte donc le **même prédicat** que la quarantaine.

**Retour de revue Codex, fondé.** Après une relance, `scheduled_for` reste celui
d'origine — donc dans le passé, puisqu'il faut avoir été quarantainé pour être
relancé. Les deux écrans le présentaient comme la prochaine échéance : le
compteur gelé de #285 reconstruit **dans son propre correctif**. Corrigé en
`0d47c9e`, falsifié dans les deux sens.

## 4. Deux affirmations recadrées — et c'est le motif de la session

**#348 disait « la case CGU est inatteignable, l'utilisateur ne peut pas
soumettre ».** Mesuré sur les quatre viewports, iPhone SE 320 × 568 compris :
une fois la case amenée en haut de l'écran, `elementFromPoint` en son centre rend
bien la case. Elle est recouverte **à la position d'arrivée** — friction, pas mur.
La réserve `--consent-height` de juillet fait son travail.

Ce qui était vrai : la cible tactile, **308 × 20 px** contre 24 exigés
(WCAG 2.2 AA · 2.5.8). Corrigé par `min-h-6` sur les labels — la cible **est le
label**, la case ne fait que 16 px.

**Codex n'a pas été installé aujourd'hui.** Première affirmation de ma part,
fausse : j'interrogeais `/pulls/N/reviews` alors qu'il postait des _commentaires_.
Il est présent depuis le 10 août 15 h 36, muet par épuisement de quota. Décision
@thierry : on garde l'accès, c'est un second filet — il a trouvé un défaut que
Sourcery avait manqué, Sourcery étant lui-même à court de quota.

## 5. Planchers e2e

| Job                              | Avant | Après   | Delta mesuré dans les deux sens |
| -------------------------------- | ----- | ------- | ------------------------------- |
| `Playwright E2E`                 | 241   | **247** | 6 → 12 sur la spec, × 3 projets |
| `Playwright E2E (authenticated)` | 45    | **50**  | 6 → 11 sur la spec              |

Les deux confirmés dans les logs CI pour PR-C (`241 passed`, `50 passed`).

## 6. Deux réparations d'instrument, à ne pas réapprendre

1. **Playwright clique avant que React n'écoute.** Le cliché montrait le champ
   rempli et le bouton toujours `disabled` — rendu, mais pas à l'écoute.
   `clickUntilSettled()` réessaie le **clic**, jamais l'assertion : la condition
   de sortie est lue en base.
2. **Le `message` d'`expect.poll` est construit AVANT la boucle.** Le mien
   rapportait « reçu par `null` » alors que rien n'avait été mesuré, ce qui
   désignait la mauvaise cause. Remplacé par une boucle qui retourne sa dernière
   mesure. Un message d'échec qui invente sa donnée coûte une session.

Corollaire déjà payé deux fois aujourd'hui : **une sonde qui regarde ailleurs ne
rend pas un résultat vide, elle rend une fausse certitude.**

## 7. Anti-pièges de plateforme

- **`$args` est une variable automatique PowerShell.** L'assigner fait
  silencieusement perdre les valeurs — Playwright a tourné sur toute la suite au
  lieu d'une spec.
- **`[locale]` est une classe de caractères** pour `Get-Content`/`Get-ChildItem` :
  utiliser `-LiteralPath`, ou passer par les outils d'édition.
- **PostgREST unifie les colonnes d'un insert en lot** : une clé omise sur une
  ligne part en `NULL` explicite, que `not null` refuse quel que soit le défaut.
- **`vercel env add` ne lit pas stdin** dans ce harnais (voir §2).
- **`public/llms-full.txt`** est resali par le build (horodatage) — le restaurer
  avant de committer. Deux fois aujourd'hui.

## 8. Ce qui reste, par ordre

> #373 et #374 sont mergées (#374 après un retour Codex fondé : le garde de
> cible arrondissait au-dessus du plancher, donc 23,6 px passait pour 24 —
> falsifié en rétrécissant le label depuis la page, jamais depuis la source).
> La migration ADR-042 est en production (cf. §2).

1. **[#365](https://github.com/thierryvm/ankora/issues/365)** — « Charges » →
   « Factures », ~1 h, mesurée : ~40 chaînes dans le périmètre sur 61, ~21
   exclusions (public/FAQ/légal, `chargesFixes`, et les faux amis
   « télécharger »/« recharger »). Aucune spec e2e ni Vitest n'assertit sur ces
   libellés.
2. **Ce qui ment à l'utilisateur** : [#355](https://github.com/thierryvm/ankora/issues/355)
   (dette comptée deux fois), [#351](https://github.com/thierryvm/ankora/issues/351)
   (deux « il te reste »), [#350](https://github.com/thierryvm/ankora/issues/350).
3. **Ce qui rend les tests menteurs** : [#343](https://github.com/thierryvm/ankora/issues/343),
   [#344](https://github.com/thierryvm/ankora/issues/344),
   [#354](https://github.com/thierryvm/ankora/issues/354) (divergence
   d'hydratation sur le `nonce` — **mesurée aujourd'hui** : `ThemeBootScript`,
   `nonce="…"` côté serveur contre `nonce=""` côté client, sur `/login`).
4. **J2** (ADR-038 D1 + ADR-041 F2) — session dédiée, `plan-reviewer` obligatoire.
5. **Dette sécurité connue** : `is_workspace_member` / `is_workspace_editor`
   restent exécutables par `anon`. PR sécurité dédiée, jamais bundlée.

**En parallèle, non bloqué** : L3 de la landing, pilotée par Fable 5 dans le
worktree `ankora-landing`. Le prompt lui a été remis ; le worktree est resté sur
`docs/handoff-l2-roadmap`, branche mergée et supprimée — il doit resynchroniser
avant tout.

## 9. Environnement

Pile Supabase locale debout (`*_ankora`, API `127.0.0.1:54421`, base `54422`).
**La pile du projet professionnel tourne en parallèle** (`supabase_db_OVB`, port 54322) — nommer explicitement le conteneur à chaque commande.

Rappel toujours actif : les connecteurs MCP Supabase et Vercel de claude.ai sont
branchés sur les comptes **professionnels**. Interdits en session Ankora, lecture
comprise. Tout passe par la CLI, préfixée `work perso -NoCd`, avec
`npm run preflight` → GO avant chaque action sortante.
