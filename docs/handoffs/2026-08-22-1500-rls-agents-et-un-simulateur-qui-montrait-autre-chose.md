---
project: ankora
type: cc-handoff
session: 2026-08-22-1500
agent: cc-ankora
---

# Handoff — RLS en production, huit agents réparés, et un simulateur qui montrait autre chose

> Session @cc-ankora (Opus 5), clone principal. Écrite avant compaction, sur
> demande de @thierry. **Attention à la date** : la session précédente était le
> 18 août, celle-ci le **22**. Quatre jours ont passé — ne pas enchaîner les
> dates depuis la conversation.

## 1. État git

```text
origin/main : 95ac355 chore(agents): huit agents dependaient d un outil mort (#428)
              32aaf10 perf(rls): evaluer auth.uid() une fois par requete (#427)
              55d3e65 docs(passation): le lot B, les cles etrangeres (#426)
              a308a54 fix(db): indexer les cles etrangeres (#424)
```

**Une seule PR ouverte : [#429](https://github.com/thierryvm/ankora/pull/429)** —
refonte du simulateur. **Entièrement verte**, elle n'attend qu'une chose : la
relecture du micro-copy par @thierry (§4).

## 2. Ce qui est EN PRODUCTION depuis cette session

### 20 policies RLS (#427, poussée par `supabase db push`)

`auth.uid()` → `(select auth.uid())` : l'appel était évalué **une fois par ligne
examinée**, il l'est maintenant une fois par requête.

**Aucun gain n'est annoncé** : la base porte cinq comptes, rien de mesurable ne
change aujourd'hui. La valeur est que le motif soit correct avant que le volume
arrive.

Ce qui rend cette PR sûre n'est pas la rigueur mais la **structure** : `ALTER
POLICY` ne peut modifier QUE les rôles et les expressions — changer la commande
visée ou la permissivité **exige** un drop-recreate. Elle ne _pouvait_ donc pas
altérer la matrice des permissions.

Preuves : identité des 36 policies (`tablename, policyname, permissive, roles,
cmd`) **identique caractère pour caractère** avant/après ; retour arrière joué
puis rejoué ; 19 contrôles d'isolation sur base locale dans une transaction
annulée.

### 14 index de clés étrangères (#424, session du 18)

`unindexed_foreign_keys` 13 → 0.

### Politique de mot de passe

6 → **12 caractères** + composition exigée, via l'API Management. Le code
exigeait déjà 12, mais **l'API Auth de Supabase est joignable directement** :
on pouvait contourner le formulaire. **HIBP reste indisponible — plan Pro.**

## 3. Le risque que `plan-reviewer` a écarté, et qui vaut d'être retenu

Sur les six policies `*_editor_write`, mon plan initial retapait la clause
`using (is_workspace_editor(...))` sans la changer. Or `is_workspace_member`
existe juste à côté — six caractères d'écart, voisins dans le fichier. Une
confusion aurait donné le **droit d'écrire aux membres en lecture seule** sur six
tables, et **aucune de nos portes ne l'aurait vue**.

La parade n'a pas été « faire attention » : chaque `alter policy` ne fournit QUE
la clause qui contenait `auth.uid()`. Une clause omise est laissée inchangée par
PostgreSQL. **Zéro caractère saisi, zéro risque** — vérifié empiriquement avant
d'écrire la migration.

C'est le motif à réutiliser : quand un correctif est mécanique, chercher la forme
où l'erreur devient **impossible**, pas celle où elle devient improbable.

## 4. #429 — CE QUI ATTEND @thierry

**La CI est verte sur tous les jobs.** Le seul blocage est éditorial : c'est de
la surface publique, et le `CLAUDE.md` demande une relecture du micro-copy.

Textes nouveaux, en français (NL/DE/ES portent le verbatim FR, délibérément) :

| Emplacement           | Nouveau texte                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sous-titre de section | « Choisis ce que tu paierais. Vois ce que ce seul changement te rapporte, mois après mois. C'est ce que fait Ankora à chaque décision. » |
| Titre du graphique    | « Ce que ce choix te rapporte » · « cumulé sur 6 mois »                                                                                  |
| Curseur               | « Je paierais »                                                                                                                          |
| Sous le curseur       | « Tu économises {montant} par mois. »                                                                                                    |
| Aide GSM              | « Tu paies 42 € par mois. Les offres du marché descendent à 18 €. »                                                                      |
| Aide élec             | « Tu paies 168 € par mois. Trois offres de ta zone descendent à 123 €. »                                                                 |
| Aide streaming        | « Tu paies 38 € par mois pour cinq abonnements. En gardant les deux que tu regardes : 13 €. »                                            |

**Deux points soumis à son arbitrage** :

1. **« te rapporte »** — c'est une soustraction, pas une promesse de rendement,
   donc a priori hors périmètre FSMA. Mais c'est lui qui porte le risque.
   Alternatives proposées : « ce que ce choix te laisse », « ce que ça change ».
2. **Les fourchettes marché** (18 / 123 / 13 €) sont désormais **affirmées** dans
   le texte, là où c'était plus flou avant. L'avertissement du bas dit toujours
   « hypothèses moyennes ».

Titre, badge et avertissement FSMA sont **inchangés**.

## 5. Pourquoi le simulateur a été refait

Il superposait une trajectoire de réserve **codée en dur** et la même augmentée
de l'économie choisie. Sur le scénario par défaut, la courbe montait de 494 € à
1192 € : sur ces **+698 €**, **628 € (90 %)** venaient de la trajectoire inventée
et **70 €** de la décision du visiteur.

⚠️ **J'avais d'abord annoncé 88 % / 84 €. C'était faux**, et `plan-reviewer` l'a
corrigé : les 14 € du premier mois sont déjà cuits dans le point de départ, donc
ils ne participent pas à la montée. Le défaut était **pire** que mon diagnostic.

Trois changements : le graphique ne trace plus que l'écart attribuable au choix ;
le curseur porte le **prix futur** et non l'écart ; les zones de seuil sont
retirées (elles qualifiaient un _niveau_, la série est un _écart_).

**Levé au passage : BUG-iOS-010** — `aria-valuemin`/`valuemax`/`valuenow`
explicites, son cas e2e sort de `test.fixme`.

## 6. Deux pièges de tracé, et ils sont réutilisables

- **Le plafond d'axe.** L'ancien code plafonnait à `Math.max(...serie, 1500)`,
  hérité d'une réserve qui atteignait 1192 €. La nouvelle série culmine vers
  84–270 € : le même plafond l'aurait collée au bas d'un axe six fois trop haut.
  **La refonte serait partie en production en ayant l'air cassée.**
- **La couleur du mode sombre se MESURE.** Mon réflexe — prendre une teinte plus
  claire — a été **refusé par le validateur** : `#2dd4bf` sort de la bande de
  luminosité (0,785). `#0d9488` passe dans les deux thèmes. Le sombre se choisit,
  il ne se déduit pas d'une inversion.

## 7. Huit agents dépendaient d'un outil mort (#428)

Sur dix-neuf agents, **huit déclaraient `Bash`** — hors service depuis une mise à
jour du 22 août (`line 167: expo: command not found`, exit 127).

**Ce n'est ni la machine ni le dépôt** : `bash --noprofile --norc`, avec rc, et en
shell de connexion fonctionnent tous les trois ; les profils sont propres ; les
vingt-cinq instantanés de shell se sourcent sans erreur. La faute est dans la
couche du harnais, hors de portée d'un correctif ici.

`rls-flow-tester`, invoqué ce matin, n'a pas pu ouvrir une seule connexion. Il a
eu la bonne réaction — refuser de conclure — mais rien ne garantissait que les
sept autres en feraient autant.

Les huit déclarent désormais `PowerShell, Bash`, et chacun porte la panne en tête
plus le chemin vers la base locale (`docker exec supabase_db_ankora psql`).

## 8. La leçon qui a supprimé une dette fantôme

**Vitest en parallèle sature la mémoire de cette machine et TUE des workers.**

Mesuré : le run par défaut a rendu `2 failed | 1933 passed` plus quinze erreurs
fantômes ; le run série du **même commit** a rendu `2278 passed`, zéro échec.
**343 cas avaient disparu sans qu'une ligne ne le signale.**

Conséquence directe : les deux specs traînées depuis des jours comme
« instables » (`AddExpenseSheet`, `CommitmentsClient`) **ne le sont pas**. La
dette n'a jamais existé.

**Sur cette machine : `npx vitest run --no-file-parallelism`**, et tout run qui
exécute moins que le total déclaré est une panne d'instrument, jamais une
régression.

## 9. Advisors Supabase — état vérifié après les pushes

|                                | Avant            | Après                                                    |
| ------------------------------ | ---------------- | -------------------------------------------------------- |
| `auth_rls_initplan`            | 20               | **0**                                                    |
| `multiple_permissive_policies` | 30               | **30** ← inchangé : la preuve que rien d'autre n'a bougé |
| `unindexed_foreign_keys`       | 13               | **0**                                                    |
| `unused_index`                 | 3                | 16 (les index neufs n'ont pas encore servi)              |
| Sécurité                       | 5 WARN / 0 ERROR | 5 WARN / 0 ERROR                                         |

Les 5 avertissements sécurité : 4 sur une dette d'ACL de fonctions (PR dédiée,
§10) et 1 sur HIBP (plan Pro).

## 10. Ce qui reste, par ordre

1. **#429** — relecture micro-copy, puis merge.
2. **Les 30 `multiple_permissive_policies`** : `<t>_editor_write` couvre aussi
   SELECT en plus de `<t>_member_select`. Cette PR **changera la matrice** des
   permissions et exigera un **drop-recreate** des six policies — quiconque les
   recrée doit y écrire `(select auth.uid())`, sans quoi le contenu de #427
   disparaît en silence. C'est inscrit dans l'en-tête de la migration.
3. **La dette d'ACL sur des fonctions** — PR dédiée. (Détail volontairement
   non publié ici : dépôt public, défaut non corrigé.)
4. **Lot C de dépendances** : `tailwindcss` **et** `@tailwindcss/postcss`
   ensemble, `tailwind-merge`, 5 radix, `lucide-react` 1.8→1.32, `sonner`.
   Vérifier un toast **dans les deux thèmes** et que `sonner/dist/styles.css`
   existe encore.
5. **Playwright** : paquet + tag d'image `ci.yml`, PR dédiée.
6. **9 majeures**, une par une.
7. **Tickets utilisateur** : #352, #351, #350, #348, #378.
8. **#390** — 6 vulnérabilités hautes hors production, re-vérifier le 15/09.

**Le cockpit reste le gros morceau** : 5 sections sur 8. Manquent la timeline
6 mois, les enveloppes rééquilibrables, les objectifs d'épargne avec ETA, et
l'activité récente. C'est le produit, pas de la dette.

## 11. Environnement

- **`gh` et `git` : toujours par PowerShell, préfixés `work perso -NoCd;`.**
- **Sourcery n'a relu aucune PR de la journée** — quota hebdomadaire épuisé
  depuis le 18. Le second filet n'a pas joué de toute la session.
- **#425 a été fermée** (correctif de concurrence CI) : le correctif marchait,
  mais les jobs annulés comptent comme des échecs sur un check requis, donc il
  échangeait un gaspillage de CI contre un blocage de merge. Constat écrit dans
  la PR pour que personne ne le retente.
- Connecteurs MCP Supabase et Vercel toujours interdits, lecture comprise.
