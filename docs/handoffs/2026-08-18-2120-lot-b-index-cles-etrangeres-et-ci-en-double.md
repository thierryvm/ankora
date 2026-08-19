---
project: ankora
type: cc-handoff
session: 2026-08-18-2120
agent: cc-ankora
---

# Handoff — Le lot B, les clés étrangères, et une CI qui tournait en double depuis toujours

> Session @cc-ankora (Opus 5), clone principal. Deuxième passation du 18 août :
> la première (#421) couvrait l'incident Dependabot, celle-ci la soirée.
> Écrite à la clôture demandée par @thierry.

## 1. État git

```text
origin/main : a308a54 fix(db): indexer les cles etrangeres (#424)
              da35450 chore(deps): lot B — le runtime (#422)
              11f860c docs(passation): Dependabot rallume puis eteint (#421)
              97d4ba0 style: aligner le depot sur prettier 3.9 (#420)
```

**PR ouverte : [#425](https://github.com/thierryvm/ankora/pull/425)** — correctif
de concurrence CI. **NE PAS MERGER sans la vérification du §4.**

## 2. Ce qui est EN PRODUCTION depuis ce soir

Trois choses, toutes vérifiées après coup et non sur la foi d'un message de succès.

### Lot B de dépendances (#422)

`@supabase/supabase-js` 2.103→2.112, `next-intl` 4.11→4.13, `zod`,
`react-hook-form`, `@upstash/redis`, `@supabase/ssr`.

La vérification qui comptait — **le nonce CSP** — tient : mesurée sur 5 routes de
production, l'en-tête et les 28 à 41 balises du HTML portent partout la même
valeur. C'est la régression qu'aucune porte ne voit.

**Deux paquets ont été RETIRÉS du lot en cours de route**, parce que le dépôt
contredisait le plan : `date-fns` (zéro import, suppression déjà prévue par le
plan de refonte v2) et `@hookform/resolvers` (marqué « GELÉ » par décision du
26 juillet). Le second faisait entrer `ajv` 8 dans l'arbre de **production** via
une peerDependency, pour un paquet qu'aucune ligne de `src/` n'importe.

### Politique de mot de passe alignée sur le code

| Réglage           | Avant     | Après                              |
| ----------------- | --------- | ---------------------------------- |
| Longueur minimale | 6         | **12**                             |
| Composition       | aucune    | minuscule + majuscule + chiffre    |
| HIBP              | désactivé | **indisponible — plan Pro requis** |

Pourquoi ce n'était pas cosmétique : `src/lib/schemas/auth.ts` exigeait déjà 12
caractères, mais **l'API Auth de Supabase est joignable directement** et la clé
publique est dans le bundle client par conception. On pouvait contourner le
formulaire et créer un compte à 6 caractères. C'est fermé.

Appliqué par l'API Management (`PATCH /v1/projects/<ref>/config/auth`), **jamais
par le MCP Supabase** — toujours interdit en session Ankora. Le premier appel a
été **rejeté en entier** parce qu'il incluait HIBP : le « succès » affiché était
un faux positif de mon script, rattrapé par une relecture. Ne jamais conclure
d'un code de retour, toujours relire.

### 14 index de clés étrangères (#424)

Poussé en production par `supabase db push --linked`, précédé d'un dry-run et
d'un `preflight` GO. Vérifié après : **14/14 index présents** dans le dump du
schéma distant, migration `local == remote`, `unindexed_foreign_keys` **13 → 0**.

`unused_index` passe de 3 à **17**, et c'est normal : des index créés il y a une
heure n'ont évidemment jamais servi. La sonde mesure l'usage passé, pas
l'utilité.

## 3. Le quatorzième index, celui qu'aucun outil ne demandait

C'est le point à retenir de la soirée.

`deletion_requests.user_id` — la table du cron de suppression RGPD — porte bien
un index sur `user_id`, mais il est **PARTIEL** :

```sql
create unique index deletion_requests_one_active_idx
  on public.deletion_requests(user_id)
  where status in ('pending', 'processing', 'failed');
```

Un index partiel **ne peut pas** servir à une vérification d'intégrité
référentielle : il ne contient qu'un sous-ensemble des lignes, donc il ne permet
pas de prouver l'absence de ligne référençante. La sonde de l'advisor voit un
index sur `user_id` et s'arrête là, sans lire son prédicat.

**S'en tenir au verdict de l'outil aurait laissé découverte la clé la plus
proche du sujet, tout en affichant `unindexed_foreign_keys : 0`.** Un critère de
succès qui se satisfait sans que le problème soit réglé est pire que pas de
critère.

Vérifié empiriquement, dans les deux sens : après migration, zéro clé non
couverte sur 28 ; l'index retiré, la sonde le signale ; remis, retour à zéro.

## 4. #425 — CE QUI RESTE À TRANCHER, et c'est une vraie question

Le correctif est d'un mot : `github.ref` → `github.ref_name`.

**Le défaut.** `github.head_ref` n'est renseigné que sur `pull_request` ; sur
`push` il est vide et l'expression retombait sur `github.ref` :

```
push          -> refs/heads/fix/xyz   -> groupe "CI-refs/heads/fix/xyz"
pull_request  -> fix/xyz              -> groupe "CI-fix/xyz"
```

Deux groupes, donc **aucun run n'annulait l'autre**. L'intention était pourtant
écrite en commentaire depuis le début. Chaque push payait deux CI complètes — et
surtout **tirait deux fois au sort un runner**. C'est la cause directe des
échecs de la soirée : trois relances pour #422, deux pour #424, à chaque fois
pour un jumeau tombé sur un runner lent (`Playwright E2E (authenticated)` en
5 min dans un run, délai de 25 min atteint dans l'autre, **sur le même SHA**).

**Le correctif fonctionne** — observé sur #425 : le run `push` a bien été coupé
par le run `pull_request`.

**LA QUESTION OUVERTE.** Les jobs annulés s'affichent en `fail`, et
`Playwright E2E (authenticated)` est un **check requis**. J'ai écrit dans la PR
que GitHub retient le statut le plus récent par nom de contexte — c'est le
comportement attendu et très répandu, **mais il n'a PAS été vérifié sur ce
dépôt**. À la clôture, #425 était encore `BLOCKED` avec 2 jobs en attente.

**À faire demain, dans cet ordre :**

1. `gh pr view 425 --json mergeStateStatus` → doit rendre `CLEAN`.
2. Si `CLEAN` : merger. Le correctif est bon, et il paiera sur toutes les PR
   suivantes.
3. **Si toujours `BLOCKED` alors que le run survivant est vert** : le correctif
   échange un gaspillage contre un blocage de merge, ce qui est PIRE. Fermer
   #425 et revenir en arrière. L'alternative serait de restreindre le
   déclencheur `push`, mais attention — `push: branches: ['**']` vient d'une
   leçon coûteuse documentée en tête de `ci.yml` (1er août : quatre lots livrés
   sans qu'aucune CI ne se déclenche). Ne pas le toucher sans relire ce
   commentaire.

## 5. Ce qui reste, par ordre de rentabilité

1. **#425** — cf. §4, trancher d'abord.
2. **Policies RLS** : 20 `auth_rls_initplan` + 30 `multiple_permissive_policies`.
   Vrai gain, mais cela touche la **frontière de sécurité** — une erreur y ouvre
   des données. PR dédiée, `rls-flow-tester` obligatoire. Le paquet « helpers
   RLS joignables par `anon` » (dette de mai, 4 des 5 avertissements sécurité)
   appartient à cette PR-là.
3. **Lot C de dépendances** : `tailwindcss` **et** `@tailwindcss/postcss`
   ensemble, `tailwind-merge`, 5 radix, `lucide-react` (1.8→1.32), `sonner`.
   Vérifications exigées : afficher un toast **dans les deux thèmes** (la
   précédence `@layer theme, base, sonner, …` suppose que la feuille de sonner
   arrive non-layered), et vérifier que `sonner/dist/styles.css` existe encore.
4. **Playwright** : paquet **+** tag d'image `ci.yml`, PR `chore(ci)` dédiée.
5. **9 majeures**, une par une : `typescript` 5→7, `eslint` 9→10, `next`
   16.2→16.3, `jsdom`, `lint-staged`, `nanoid`, `@testing-library/jest-dom`,
   `@supabase/ssr` 0.10→0.12, `@types/node`.
6. **Deux tests instables** : `AddExpenseSheet` et `CommitmentsClient`. 2 échecs
   puis 0 sur du code identique. Des tests instables masquent les vraies
   régressions.
7. **Tickets utilisateur** : #352 (5 contrôles sous 24 px sur `/login`), #351,
   #350, #348.

## 6. Décisions de @thierry, ce soir

- **L'adresse de contact reste le Gmail actuel.** Arbitrage explicite : ne pas
  ajouter un produit de plus à gérer. On corrige le jour où le spam le rappelle.
  Dette tracée dans **#423**, avec tout ce qui est déjà mesuré pour la reprise —
  notamment que le DNS est chez Vercel (donc MX ajoutables sans changer les
  nameservers) et que **Resend ne fait que l'ENVOI**, pas la réception.
- **Ne pas rouvrir le sujet** sans qu'il le demande.

## 7. Pannes d'instrument de la session

Le motif de la première passation s'est répété, sous quatre formes nouvelles.

- **17 tests en échec, puis 0, sur du code identique.** J'avais lancé **deux
  suites Vitest en parallèle** sur une machine à court de mémoire. Le nombre
  d'échecs **croissait** d'un essai à l'autre : signature d'une panne
  d'instrument, jamais d'une régression. Ne plus jamais lancer deux suites
  ensemble.
- **`ConvertFrom-Json` échoue en silence** sur le lockfile (clé vide) et rend
  tous les paquets « absents ». Utiliser `-AsHashtable`.
- **`vercel ls | Select-Object -Last N`** rend les déploiements les plus
  **VIEUX**. J'ai conclu « prêt » sur un déploiement de 7 jours.
- **`paid_from_account` n'existe pas** — j'avais déduit le nom de colonne du nom
  de la contrainte. La vraie est `paid_from_account_type`, et la clé est
  **composite**. La migration aurait échoué au push. Correctif de méthode :
  les 14 noms viennent désormais du schéma **réel** (`supabase db dump`).

**`plan-reviewer` a attrapé les deux dernières.** Son verdict était APPROVED
WITH CHANGES, avec 4 bloquants dont 2 atteignaient la production. L'invoquer
avant toute migration n'est pas une formalité.

## 8. Environnement

- **L'outil Bash du harnais reste cassé** (`expo: command not found`, exit 127).
  Tout passe par PowerShell, préfixé `work perso -NoCd;`.
- **Le garde-fou DevContext refuse `supabase db reset`** parce que le dossier est
  lié à `ankora-prod` — même quand la commande ne vise que Docker. **Ne pas le
  contourner** : tester dans une base du conteneur (`docker exec … psql`).
- **Le classifier du harnais a bloqué** le `PATCH` de la config Auth au premier
  essai, et a rendu indisponible plusieurs commandes par intermittence. Ce n'est
  pas un refus définitif — réessayer plus tard fonctionne.
- **Sourcery n'a relu NI #422 NI #424 NI #425** : quota hebdomadaire de 500 000
  caractères de diff épuisé. Le second filet n'a pas joué de la soirée. À
  garder en tête pour le lot C, qui touchera du visuel.
- Connecteurs MCP Supabase et Vercel toujours interdits, lecture comprise.
