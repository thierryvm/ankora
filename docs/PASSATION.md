# Passation — projet Ankora

**Pour** : toute session Claude qui reprend l'orchestration du projet Ankora pour Thierry.
**But** : reprendre le travail avec la même méthode, sans rien redécouvrir.

> **Principe de rédaction de ce document — à respecter en le modifiant.**
> Ce fichier **ne duplique jamais un état**. Il dit **où lire** l'état, jamais quel il est.
> Un document qui décrit un état devient faux en silence ; un document qui pointe vers sa
> source vivante reste vrai. Le `README` de ce dépôt a annoncé une migration de design
> system « en cours » pendant deux mois et demi alors qu'elle n'avait jamais commencé —
> personne n'a menti, le document a simplement vieilli. Les listes de PR, de chantiers
> restants, de chiffres et de dates n'ont donc pas leur place ici : elles vivent dans
> GitHub, dans `CHANGELOG.md`, dans `docs/adr/` et dans `docs/audits/`.
> Ce qui a sa place ici : la **méthode**, les **décisions arrêtées**, les **règles**, le
> **raisonnement** et les **emplacements**. Ça ne périme pas.

---

## 1. Qui, quoi

**Thierry Vanmeeteren**, belge, francophone. À appeler par son prénom, en français, avec un
ton chaleureux et un peu d'humour. Il préfère la concision et déteste la complaisance :
**un désaccord argumenté vaut mieux qu'un acquiescement**. Il l'a redemandé plusieurs fois.

**Ankora** (`ankora.be`) : PWA de gestion budgétaire personnelle pour la Belgique. Lisse les
charges périodiques sur 12 mois, calcule des provisions, un budget mensuel et un reste à
vivre. Positionnée comme outil d'**éducation budgétaire**, sans agrément FSMA — aucun conseil
en placement, jamais. RGPD, hébergement UE.

Stack : Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase (EU),
Vercel, Decimal.js en arrondi banquier, Zod, Playwright, Vitest.

L'application sert de **vraies personnes**, dont les enfants de Thierry et un ami. Leur
nombre change — il se lit en base, il ne s'écrit pas ici. Ce qui compte pour la conduite du
travail est ailleurs : voir §7, _Règles de sécurité_.

---

## 2. Le rôle : orchestrateur

Tu ne codes pas toi-même. Tu lances des sessions de travail, tu lis leurs comptes rendus, tu
tranches leurs questions, et tu relaies à Thierry en français clair — jamais en jargon
technique brut.

**Protocole imposé à toute session fille**, à recopier dans chaque prompt :

- **Questions en texte clair dans le message final**, jamais dans un dialogue interactif à
  choix multiples. L'orchestrateur ne voit pas les dialogues ; une question posée ainsi
  bloque la session indéfiniment. Une question posée en texte termine le tour, ce qui
  déclenche une notification.
- Doute non bloquant : prendre l'option la plus prudente, la documenter, continuer.
  **Ne jamais s'arrêter en silence.**
- **Un worktree git dédié par session**, rangé dans `C:\Users\Utilisateur\dev\worktrees\<nom>`,
  supprimé avec `git worktree remove` après merge. Deux sessions sur le même dossier de
  travail se marchent dessus même sur des branches différentes.
- **Jamais `git add .` ni `-A`** : nommer chaque fichier.
- **Distinguer systématiquement le mesuré du supposé.**
- Concision : pas d'annonce de ce qu'on va faire, pas de reformulation de la mission, pas de
  tableau quand trois lignes suffisent. Garder les preuves chiffrées, couper la mise en scène.
- **Mettre à jour ce document en fin de chantier — mais seulement si nécessaire.** Une
  session qui a changé une **décision**, une **règle** ou un **emplacement** met à jour
  `docs/PASSATION.md` dans la même PR. Une session qui a seulement **avancé** n'y touche
  pas : l'avancement se lit dans GitHub et dans `CHANGELOG.md`. Sans cette distinction, le
  document redevient un journal, et un journal vieillit.

**Emplacements**

| Quoi                               | Où                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Dépôt, clone principal             | `C:\Users\Utilisateur\dev\ankora` — public sur `github.com/thierryvm/ankora`                |
| Worktrees de session               | `C:\Users\Utilisateur\dev\worktrees\`                                                       |
| Sauvegardes de base                | `C:\Users\Utilisateur\Desktop\ankora-backup-2026-07-31\` — lire son `LISEZ-MOI.txt` d'abord |
| Design system                      | `C:\Users\Utilisateur\Desktop\ankora-design-system\`                                        |
| Décisions d'architecture           | `docs/adr/`                                                                                 |
| Rapports d'audit et de diagnostic  | `docs/audits/`                                                                              |
| Spécifications                     | `docs/specs/`                                                                               |
| Rapports de PR                     | `docs/prs/`                                                                                 |
| Migrations de base                 | `supabase/migrations/`                                                                      |
| Ce qui a été livré                 | `CHANGELOG.md`                                                                              |
| Cap produit et ordre des chantiers | `docs/NORTH_STAR.md`, `docs/ROADMAP.md`                                                     |
| Règles de travail détaillées       | `CLAUDE.md` à la racine — prévaut sur ce document en cas de conflit technique               |

---

## 3. Le diagnostic qui structure tout

Thierry se plaignait de trois choses : design incohérent, bugs à répétition, navigation
confuse. Il voulait tout réécrire. **On l'en a dissuadé, et c'était la bonne décision** : le
code est sain — TypeScript strict sans `any`, couverture élevée du domaine financier, RLS,
RGPD sérieux.

La cause réelle est ailleurs, et elle a un nom : **des garde-fous qui mentent**. À chaque
fois, un aménagement raisonnable devient un angle mort permanent.

Cinq cas mesurés, tous corrigés — ils sont le corpus de référence, pas une liste de tâches :

1. **La CI ne s'exécutait sur aucune branche** — `on: push: branches: [main, develop]`. Le
   premier signal n'arrivait qu'après le merge, c'est-à-dire en production.
2. **Six specs e2e en quarantaine, comptées comme vertes**, sans jamais s'exécuter pendant
   deux mois.
3. **Le harnais de test pré-remplissait le consentement** pour que la bannière n'intercepte
   pas les clics — donc aucun test ne visitait jamais le site comme un nouvel utilisateur.
   C'est ce qui a masqué une bannière qui **bloquait la connexion sur tous les iPhone**.
4. **Le hook `pre-commit` échouait** systématiquement, donc tout le monde utilisait
   `--no-verify`, ce qui emportait aussi le contrôle de compte du `pre-push`. Trois causes
   distinctes — `.vercel/`, `supabase/.temp/`, `.env.local` — chacune vérifiée par
   falsification.
5. **`revoke execute ... from public` ne suffit pas** : les _default privileges_ de Supabase
   accordent `EXECUTE` à `anon`, `authenticated` et `service_role`. Mesuré en production.

**La leçon opératoire** : une porte verte ne prouve rien tant qu'on ne l'a pas vue **refuser**
ce qu'elle doit refuser. Falsifier avant de conclure.

**Second motif, tout aussi structurant** : le moteur financier a plusieurs longueurs d'avance
sur l'interface. Des modules sont écrits, testés, documentés par ADR — et **jamais branchés à
un écran**. D'où la frustration de Thierry : il sait que les fonctionnalités existent et ne
les voit pas.

Conséquence pratique, et c'est ce qui doit guider l'ordre du travail : **une grande partie du
travail restant consiste à exposer ce qui existe déjà**, pas à l'écrire. Avant de créer un
module, vérifier qu'il n'existe pas déjà sans call-site :

```bash
git grep -n "nomDeLaFonction" -- src/ | grep -v __tests__
```

Un ADR « Accepted » ne garantit **pas** une surface à l'écran.

---

## 4. Ce qui est en production

**Ne pas énumérer ici.** Se lire ainsi :

- **`CHANGELOG.md`** — ce qui a été livré, en clair.
- **`main`** sur `github.com/thierryvm/ankora` — la vérité du code déployé. Vercel déploie
  automatiquement à chaque merge.
- **PR fusionnées** : `gh pr list --state merged --limit 20` — chacune porte son rapport de
  mesure dans sa description.
- **État de la CI** : `gh run list --workflow ci.yml --branch main --limit 3`.
- **`docs/prs/`** — rapports détaillés des chantiers livrés.

---

## 5. Décisions arrêtées — ne pas rouvrir

- Chiffre héros **temps réel** (descend quand on dépense), prévisionnel en ligne d'ancrage
  dessous.
- Glossaire **ADR-035** : _Il te reste · Budget du mois · Dépensé ce mois · Épargne estimée_.
  « Reste à vivre » et « reste disponible » sont **bannis** — en médiation de dettes belge,
  « reste disponible » désigne l'argent qui part aux créanciers.
  Cf. `docs/adr/ADR-035-vocabulaire-des-quatre-chiffres.md`.
- Encre neutre du héros (jamais de vert), `--color-warning: #9a3412`.
- Fréquences : 1/2/3/4/6/12, tous diviseurs de 12. **Pas de 9 mois** — aucune institution
  belge ne facture ainsi.
- Onglet 2 nommé **« À payer »**, pas « Sorties ».
- Pointage d'une échéance : bouton léger, **retour arrière** possible, jamais de dialogue de
  confirmation.
- Cibles tactiles ≥ 44 px, non négociable.
- **Dériver, ne pas générer** : les échéances se calculent depuis l'ancre et la cadence,
  jamais stockées. Cf. `docs/adr/ADR-021-engagements-dans-le-cockpit.md`.
- **L'heuristique avertit, elle ne calcule jamais.**
- Pas de tableau d'amortissement de crédit : fabriquer soixante lignes au centime depuis
  quatre nombres approximatifs contredit le principe de traçabilité.
- Pas de `holdings`, valorisations ni rendements — **ligne rouge FSMA**.
- **Règle de forage** : tout agrégat est tapable et expose sa composition. Principe
  structurant du produit.
- Taxonomie des catégories : `docs/adr/ADR-022-taxonomie-categories-et-categorisation-assistee.md`.

---

## 6. Ce qui reste — l'ordre et le raisonnement

**L'ordre ci-dessous est du jugement : il ne périme pas.** Les états, eux, se lisent ailleurs —
`gh pr list` pour les chantiers ouverts, `docs/audits/` pour les diagnostics, `docs/adr/` pour
les décisions, `supabase/migrations/` comparé à `supabase migration list --linked` pour ce qui
reste à appliquer en base.

1. **Le double comptage charges ↔ engagements.** Une dette saisie aux deux endroits est
   comptée deux fois. Conception validée : un engagement fait autorité sur sa mensualité,
   l'utilisateur ne saisit qu'une fois, son échéance reste pointable. Réconcilier aussi
   « Restant Principal », qui ignore les engagements que « Budget du mois » déduit.
   _Pourquoi en premier_ : c'est le seul défaut restant qui produit un **chiffre faux**.
2. **Les défauts de navigation.** Plage de largeurs sans aucun menu, navigation tronquée au
   lieu de se replier, débordement horizontal. Même racine probable. Exiger le test qui ferme
   la classe entière : _à toute largeur, au moins un chemin de navigation entièrement visible,
   et aucun débordement horizontal._
   _Pourquoi ici_ : un défaut qu'on corrige cas par cas revient ; c'est la classe qu'on ferme.
3. **Le compte Épargne décomposable.** Il mélange provisions de lissage et épargne
   personnelle, indistinguables à l'écran. La part provisions est **dérivable** du moteur —
   rien à étiqueter, rien à saisir. Et chaque virement proposé doit dire **pour quelles
   échéances**.
4. **Brancher les modules déjà écrits.** Notifications de reversement, prévisions,
   accumulateur de projection. Chercher les call-sites avant de conclure (§3). _Pourquoi
   rentable_ : le coût est celui d'un écran, pas d'un moteur.
5. **Le design system, puis les graphiques de répartition.** Dans cet ordre, et après que les
   catégories de dépense soient réellement peuplées : un camembert à deux parts n'apprend rien.
6. **Le plan de remise en ordre de la base.** Séquencé, une migration à la fois, jamais en
   bloc. Le rapport d'audit porte le plan complet, son ordre et son prérequis absolu — il vit
   dans `docs/audits/`, sous le préfixe daté `…-audit-bdd-ankora.md`. **S'il n'y est pas, il
   est resté sur une branche non fusionnée** : `git branch -a --list '*audit*'`, puis
   `git log --oneline --all -- docs/audits/` pour le retrouver.
7. **`transfers` : investir n'est pas dépenser.** Meilleure idée issue de l'analyse externe,
   sans la partie patrimoine (ligne rouge FSMA, §5).
8. **Revenu-flux.** Juste sur le fond, mais **après** : ne pas ajouter un module invisible de
   plus tant que §4 n'est pas fait.
9. **Mettre à jour les agents QA** en une passe unique, à partir du corpus de défaillances
   mesurées (§3) plutôt qu'au fil de l'eau.

_Aucune estimation de durée n'est inscrite ici : un nombre de jours est un état, il vieillit
comme les autres._

---

## 7. Règles de sécurité, non négociables

- Le projet Supabase lié est la **PRODUCTION** de personnes réelles, **sans PITR ni sauvegarde
  automatique**. Jamais de `db push` ni de migration sans **sauvegarde fraîche vérifiée par
  restauration** et accord explicite de Thierry.
- **Vérifier que la sauvegarde couvre l'état courant**, pas seulement qu'elle existe : compter
  les espaces en base et dans la copie. Une migration a déjà été arrêtée parce qu'un espace
  créé après la sauvegarde n'y figurait pas.
- **Appliquer une migration à la fois.** `db push` n'a aucun sélecteur : il pousse tout ce qui
  est en attente. Pour n'en appliquer qu'une, déplacer temporairement les autres hors de
  `supabase/migrations/`, vérifier par `--dry-run`, pousser, **remettre les fichiers**.
- **Ne jamais faire exécuter du SQL à Thierry.** C'est ce qui a dérapé une fois.
- Ne jamais lire, afficher ou committer `.env.local`.
- **Plus de push direct sur `main`** : branche, PR, checks verts, merge. Contourner une
  protection de branche, c'est réinstaller le défaut décrit au §3.
- Ne pas demander à Thierry ses secrets — ils vont dans Vercel et Supabase, par lui.
- **Préflight avant toute opération sortante** : `npm run preflight` doit rendre **GO**. Deux
  comptes GitHub et deux comptes Supabase coexistent sur cette machine (un personnel, un
  professionnel) ; une bascule silencieuse enverrait du code personnel sur l'infrastructure
  professionnelle.

---

## 8. Ce qui a marché, et qu'il faut garder

Les meilleurs résultats sont venus de sessions qui **ont refusé d'obéir** : celle qui a
démenti un diagnostic sur le middleware, celle qui a refusé d'appliquer une couleur qui
cassait la palette, celle qui a arrêté une migration parce qu'un espace manquait à la
sauvegarde, celle qui a corrigé son propre commentaire quand la mesure l'a démenti.

Encourage ça explicitement dans chaque prompt. Et applique-le à Thierry lui-même : il a eu
tort au moins deux fois, et le lui dire a fait avancer le projet.

Le corollaire opératoire, celui qui distingue une porte satisfaite d'une porte contournée :
quand un contrôle bloque, **corriger la cause et relancer le contrôle** — jamais le
contourner au motif qu'il n'est pas obligatoire.
