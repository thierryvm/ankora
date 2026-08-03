# Passation — projet Ankora

**Pour** : toute session Claude qui reprend l'orchestration du projet Ankora.
**But** : reprendre le travail avec la même méthode, sans rien redécouvrir.

> **Deux principes de rédaction — à respecter en modifiant ce fichier.**
>
> **1. Ne jamais dupliquer un état ; dire où le lire.** Un document qui décrit un état devient
> faux en silence ; un document qui pointe vers sa source vivante reste vrai. Le `README` de ce
> dépôt a annoncé une migration de design system « en cours » pendant deux mois et demi alors
> qu'elle n'avait jamais commencé — personne n'a menti, le document a vieilli. Les listes de PR,
> de chantiers, de chiffres et de dates n'ont donc pas leur place ici : elles vivent dans
> GitHub, dans `CHANGELOG.md`, dans `docs/adr/` et dans `docs/audits/`.
>
> **2. Ce dépôt est PUBLIC.** N'y écrire aucun emplacement de fichier hors dépôt, aucun état des
> dispositifs de sauvegarde ou de restauration, aucune donnée nominative, et aucun détail
> exploitable d'un défaut de sécurité non corrigé. Ces éléments existent — ils vivent dans les
> documents d'exploitation tenus hors dépôt, et les sessions en reçoivent l'accès par le canal
> privé, jamais par ce fichier.
>
> Ce qui a sa place ici : la **méthode**, les **décisions arrêtées**, les **règles**, le
> **raisonnement**, et les **pointeurs vers le dépôt**. Ça ne périme pas et ça n'expose rien.

---

## 1. Qui, quoi

**Thierry**, belge, francophone. À appeler par son prénom, en français, avec un ton chaleureux
et un peu d'humour. Il préfère la concision et déteste la complaisance : **un désaccord
argumenté vaut mieux qu'un acquiescement**. Il l'a redemandé plusieurs fois.

**Ankora** (`ankora.be`) : PWA de gestion budgétaire personnelle pour la Belgique. Lisse les
charges périodiques sur douze mois, calcule des provisions, un budget mensuel et un reste à
vivre. Positionnée comme outil d'**éducation budgétaire**, sans agrément FSMA — aucun conseil
en placement, jamais. RGPD, hébergement UE.

Stack : Next.js 16, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase (EU), Vercel,
Decimal.js en arrondi banquier, Zod, Playwright, Vitest.

**L'application sert de vraies personnes, pas des comptes de démonstration.** C'est la seule
chose à retenir de sa base d'utilisateurs, et c'est ce qui fonde les règles du §7.

---

## 2. Le rôle : orchestrateur

Tu ne codes pas toi-même. Tu lances des sessions de travail, tu lis leurs comptes rendus, tu
tranches leurs questions, et tu relaies en français clair — jamais en jargon technique brut.

**Protocole imposé à toute session fille**, à recopier dans chaque prompt :

- **Questions en texte clair dans le message final**, jamais dans un dialogue interactif à choix
  multiples. L'orchestrateur ne voit pas les dialogues ; une question posée ainsi bloque la
  session indéfiniment. Une question posée en texte termine le tour, ce qui déclenche une
  notification.
- Doute non bloquant : prendre l'option la plus prudente, la documenter, continuer.
  **Ne jamais s'arrêter en silence.**
- **Un worktree git dédié par session**, supprimé avec `git worktree remove` après merge. Deux
  sessions sur le même dossier de travail se marchent dessus même sur des branches différentes.
- **Jamais `git add .` ni `-A`** : nommer chaque fichier.
- **Distinguer systématiquement le mesuré du supposé.**
- **Ce dépôt est public** : ni chemin hors dépôt, ni donnée nominative, ni valeur mesurée d'un
  défaut de sécurité non corrigé — dans les fichiers comme dans les messages de commit et les
  descriptions de PR. Voir `CLAUDE.md`.
- Concision : pas d'annonce de ce qu'on va faire, pas de reformulation de la mission, pas de
  tableau quand trois lignes suffisent. Garder les preuves chiffrées, couper la mise en scène.
- **Mettre à jour ce document en fin de chantier — seulement si nécessaire.** Une session qui a
  changé une **décision**, une **règle** ou un **emplacement** met à jour `docs/PASSATION.md`
  dans la même PR. Une session qui a seulement **avancé** n'y touche pas : l'avancement se lit
  dans GitHub et dans `CHANGELOG.md`. Sans cette distinction, le document redevient un journal,
  et un journal vieillit.

**Où lire quoi, dans le dépôt**

| Quoi                               | Où                                                                |
| ---------------------------------- | ----------------------------------------------------------------- |
| Décisions d'architecture           | `docs/adr/`                                                       |
| Rapports d'audit et de diagnostic  | `docs/audits/`                                                    |
| Défauts constatés et instruits     | `docs/bugs/`                                                      |
| Spécifications                     | `docs/specs/`                                                     |
| Rapports de chantier               | `docs/prs/`                                                       |
| Modes opératoires                  | `docs/runbooks/`                                                  |
| Migrations de base                 | `supabase/migrations/`                                            |
| Ce qui a été livré                 | `CHANGELOG.md`                                                    |
| Cap produit et ordre des chantiers | `docs/NORTH_STAR.md`, `docs/ROADMAP.md`                           |
| Règles de travail détaillées       | `CLAUDE.md` — prévaut sur ce document en cas de conflit technique |

**Documents hors dépôt.** Certains livrables — audit de base de données, sauvegardes, notes de
sécurité — ne sont volontairement pas versionnés ici : ce dépôt est public. Ils vivent sur la
machine de Thierry. Demande-lui où avant de chercher, et ne les committe jamais.

Les chemins de travail locaux (clone, worktrees, ressources hors dépôt) sont transmis par le
même canal, pas ici.

---

## 3. Le diagnostic qui structure tout

Thierry se plaignait de trois choses : design incohérent, bugs à répétition, navigation confuse.
Il voulait tout réécrire. **On l'en a dissuadé, et c'était la bonne décision** : le code est sain
— TypeScript strict sans `any`, couverture élevée du domaine financier, RLS, RGPD sérieux.

La cause réelle est ailleurs, et elle a un nom : **des garde-fous qui mentent**. À chaque fois,
un aménagement raisonnable devient un angle mort permanent. Quatre cas, tous corrigés — c'est un
corpus de méthode, pas une liste de tâches :

1. **La CI ne s'exécutait sur aucune branche.** Le premier signal n'arrivait qu'après le merge,
   c'est-à-dire en production.
2. **Des specs e2e en quarantaine, comptées comme vertes**, sans jamais s'exécuter pendant deux
   mois.
3. **Le harnais de test pré-remplissait le consentement** pour que la bannière n'intercepte pas
   les clics — donc aucun test ne visitait jamais le site comme un nouvel utilisateur. C'est ce
   qui a masqué une bannière qui **bloquait la connexion sur iPhone**.
4. **Un hook `pre-commit` qui échouait systématiquement**, donc contourné par habitude — ce qui
   emportait aussi le contrôle du `pre-push`. Trois causes distinctes, chacune vérifiée par
   falsification.

**La leçon opératoire, valable partout** : une porte verte ne prouve rien tant qu'on ne l'a pas
vue **refuser** ce qu'elle doit refuser. Falsifier avant de conclure.

**Second motif, tout aussi structurant** : le moteur financier a plusieurs longueurs d'avance sur
l'interface. Des modules sont écrits, testés, documentés par ADR — et **jamais branchés à un
écran**. D'où la frustration : les fonctionnalités existent et ne se voient pas.

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
- **`main`** — la vérité du code déployé ; Vercel déploie à chaque merge.
- **PR fusionnées** : `gh pr list --state merged --limit 20`.
- **État de la CI** : `gh run list --workflow ci.yml --branch main --limit 3`.
- **`docs/prs/`** — rapports détaillés des chantiers livrés.

---

## 5. Décisions arrêtées — ne pas rouvrir

- Chiffre héros **temps réel** (descend quand on dépense), prévisionnel en ligne d'ancrage dessous.
- Glossaire **ADR-035** : _Il te reste · Budget du mois · Dépensé ce mois · Épargne estimée_.
  « Reste à vivre » et « reste disponible » sont **bannis** — en médiation de dettes belge,
  « reste disponible » désigne l'argent qui part aux créanciers.
  Cf. `docs/adr/ADR-035-vocabulaire-des-quatre-chiffres.md`.
- Encre neutre du héros (jamais de vert), `--color-warning: #9a3412`.
- Fréquences : 1/2/3/4/6/12, tous diviseurs de 12. **Pas de 9 mois** — aucune institution belge
  ne facture ainsi.
- Onglet 2 nommé **« À payer »**, pas « Sorties ».
- Pointage d'une échéance : bouton léger, **retour arrière** possible, jamais de dialogue de
  confirmation.
- Cibles tactiles ≥ 44 px, non négociable.
- **Dériver, ne pas générer** : les échéances se calculent depuis l'ancre et la cadence, jamais
  stockées. Cf. `docs/adr/ADR-021-engagements-dans-le-cockpit.md`.
- **`start` d'un engagement = sa PREMIÈRE échéance**, pas la date de signature ni celle du
  déblocage des fonds. ADR-021 D3 disait l'inverse ; **corrigé**. Toute la dérivation part de
  cette ancre, donc s'y tromper décale l'échéancier entier d'une période.
- **Ventilation de l'épargne : par table de mouvements, jamais par colonne saisie.** Un solde
  saisi ment dès le lendemain ; un mouvement daté reste vrai et se rejoue. Même table que
  `transfers` (§6.3). Un mouvement porte **date, compte source, compte destination, montant, et
  sa ventilation entre part de lissage et part d'épargne libre**. Les soldes en sont **dérivés**,
  jamais stockés — corollaire direct de « dériver, ne pas générer ».
- **Une dépense porte son compte source.** Le modèle actuel n'en connaît qu'un seul, implicite.
  Un foyer répartit ses dépenses sur plusieurs comptes, et une dépense sans compte source est
  inexploitable dès qu'on veut dériver des soldes : on sait qu'un montant est sorti, jamais d'où.
  C'est un prérequis de la table de mouvements, pas une amélioration d'interface.
- **Un mouvement va d'un compte à un autre, il n'est pas une simple entrée ou sortie.** Certains
  comptes ne peuvent pas payer directement : leur argent doit d'abord transiter par un compte
  courant avant d'être dépensé. Le modèle doit donc représenter `source → destination`, et un
  chemin en deux étapes doit rester lisible comme **un seul geste économique** — sinon
  l'utilisateur voit deux mouvements là où il n'a fait qu'une chose, et les totaux doublent.
- **L'heuristique avertit, elle ne calcule jamais.**
- Pas de tableau d'amortissement de crédit : fabriquer soixante lignes au centime depuis quatre
  nombres approximatifs contredit le principe de traçabilité.
- Pas de `holdings`, valorisations ni rendements — **ligne rouge FSMA**.
- **Règle de forage — principe NON NÉGOCIABLE, pas une préférence d'interface.**
  **Tout agrégat doit pouvoir se déplier et montrer ce qu'il contient déjà.**
  Justification mesurée, et c'est ce qui la fait passer de confort à principe : lors d'une
  session de test, un calcul de virement mené à la main a **déduit deux fois une provision déjà
  retirée en amont**. Exactement le défaut que l'application corrige par ailleurs — le double
  comptage charges ↔ engagements (§6.1) — reproduit mentalement, et pour la même raison : un
  montant qui apparaît à deux endroits sans qu'on voie qu'il est **déjà** déduit.
  Un agrégat qui ne se déplie pas ne cache pas seulement un détail : il cache ce qui a déjà été
  soustrait. Le forage rend une **classe entière** d'erreurs impossible — pour l'utilisateur
  comme pour celui qui code.
- Taxonomie des catégories :
  `docs/adr/ADR-022-taxonomie-categories-et-categorisation-assistee.md`.

---

## 6. Ce qui reste — l'ordre et le raisonnement

**L'ordre ci-dessous est du jugement : il ne périme pas.** Les états se lisent ailleurs —
`gh pr list` pour les chantiers ouverts, `docs/audits/` et `docs/bugs/` pour les diagnostics,
`supabase/migrations/` comparé à l'historique appliqué pour ce qui reste à passer en base.

1. **Le double comptage charges ↔ engagements.** Une dette saisie aux deux endroits est comptée
   deux fois. Conception validée : un engagement fait autorité sur sa mensualité, l'utilisateur
   ne saisit qu'une fois, son échéance reste pointable. Réconcilier aussi « Restant Principal »,
   qui ignore les engagements que « Budget du mois » déduit.
   _Pourquoi en premier_ : c'est le seul défaut restant qui produit un **chiffre faux**.
2. **Les défauts de navigation.** Plage de largeurs sans aucun menu, navigation tronquée au lieu
   de se replier, débordement horizontal. Même racine probable. Exiger le test qui ferme la
   classe entière : _à toute largeur, au moins un chemin de navigation entièrement visible, et
   aucun débordement horizontal._
   _Pourquoi ici_ : un défaut qu'on corrige cas par cas revient ; c'est la classe qu'on ferme.
3. **Le compte Épargne décomposable, fusionné avec `transfers`.** Il mélange provisions de
   lissage et épargne personnelle, indistinguables à l'écran. **Décidé** : la ventilation se
   fera par une **table de mouvements**, pas par une colonne saisie — un solde saisi ment dès
   le lendemain, un mouvement daté reste vrai et se rejoue. Ce choix règle du même coup
   « investir n'est pas dépenser » : c'est la même table, donc **un seul coût pour deux
   besoins**. La part de provisions reste **dérivable** du moteur — rien à étiqueter à la main. Et
   chaque virement proposé doit dire **pour quelles échéances**.
   Toujours sans partie patrimoine — valorisations et rendements sont une ligne rouge FSMA (§5).
4. **Brancher les modules déjà écrits.** Notifications de reversement, prévisions, accumulateur
   de projection. Chercher les call-sites avant de conclure (§3).
   _Pourquoi rentable_ : le coût est celui d'un écran, pas d'un moteur.
5. **Séparer date d'échéance et date de paiement.** Elles sont aujourd'hui **confondues** : le
   pointage écrit la date d'échéance, pas celle du versement réel. Tant qu'elles le restent, un
   paiement en retard est indiscernable d'un paiement à l'heure, et aucun historique de
   ponctualité n'est possible. Manque identifié, pas encore spécifié.
6. **Le design system, puis les graphiques de répartition.** Dans cet ordre. Le préalable des
   catégories de dépense est levé — la taxonomie est en base.

   **Le desktop n'a jamais été dérivé du mobile, il a été laissé à lui-même.** C'est le cœur du
   chantier d'harmonisation, et les quatre défauts ci-dessous en sont le symptôme mesuré sur une
   seule surface — le panneau de saisie de dépense. Aucun n'est bloquant, aucun ne justifie un
   correctif isolé : les corriger un par un traiterait les symptômes et laisserait la cause.
   Ils appartiennent au design system.
   1. **Le panneau latéral de saisie est vide aux deux tiers en desktop.** Les champs occupent
      le haut, l'action principale est ancrée en bas, un vaste espace mort les sépare. Le
      composant a été conçu comme une feuille mobile, où la hauteur est contrainte ; transposé
      en pleine hauteur d'écran, la contrainte disparaît et la mise en page ne tient plus.
      Ce n'est pas un réglage d'espacement : c'est un composant qui n'a qu'un seul mode.
   2. **La rangée de catégories laisse apparaître une barre de défilement native.** Elle signale
      un contenu qui déborde sans que le débordement ait été traité — même famille que la rangée
      de pastilles déjà relevée sur mobile et que la navigation qui se tronque au lieu de se
      replier. Le motif se répète : un conteneur horizontal qui délègue au système ce qu'il
      devrait décider lui-même.
   3. **L'icône du sélecteur de date est sombre sur fond sombre**, à la limite du visible. C'est
      un **manquement WCAG 2.2 AA sur un contrôle interactif**, pas une préférence esthétique —
      les contrôles natifs n'héritent pas des jetons de thème, il faut le leur imposer.
   4. **Le champ de date entre en collision avec les gestionnaires de mots de passe.** Leur icône
      d'auto-remplissage se superpose au bouton du calendrier et **empêche d'ouvrir le
      sélecteur** : défaut fonctionnel, pas cosmétique. La parade usuelle est un `autocomplete`
      explicite sur le champ, **à valider par mesure** plutôt qu'à supposer — une extension tierce
      décide seule de ce qu'elle décore.

7. **Le plan de remise en ordre de la base.** Séquencé, une migration à la fois, jamais en bloc.
   Le rapport d'audit porte le plan et son ordre. **Il n'est pas versionné** : il fait partie des
   documents hors dépôt (§2) — demande-le à Thierry.
8. **Revenu-flux.** Juste sur le fond, mais **après** : ne pas ajouter un module invisible de plus
   tant que le point 4 n'est pas fait.
9. **Mettre à jour les agents QA** en une passe unique, à partir du corpus de défaillances
   mesurées (§3) plutôt qu'au fil de l'eau.
10. **Le préflight rend NO-GO dans un worktree qui vise la stack locale.** Il ne résout
    `.env.local` depuis le clone principal que si les variables sont **absentes**, jamais si un
    fichier local existe et vise légitimement `localhost` — il lit alors « pointe ailleurs ».
    Développer en local et committer deviennent exclusifs, et le contournement redevient
    tentant. Corriger dans `scripts/preflight-accounts.mjs`, PR dédiée.
    _Troisième cas de la même famille en deux jours, et c'est le motif du §3 : un garde-fou qui
    plante est pire qu'un garde-fou permissif — on apprend à passer outre._

_Aucune estimation de durée n'est inscrite ici : un nombre de jours est un état, il vieillit
comme les autres._

---

## 7. Règles de conduite, non négociables

- Le projet Supabase lié est la **PRODUCTION**, avec des données financières de personnes
  réelles. Toute opération de base — migration, `db push`, script d'écriture — exige l'accord
  explicite de Thierry et le respect du mode opératoire tenu **hors dépôt**. Aucune session ne
  décide seule d'écrire en base.
- **Appliquer une migration à la fois.** `db push` n'a aucun sélecteur : il pousse tout ce qui
  est en attente. Vérifier par `--dry-run` avant, et contrôler le résultat après.
- **Ne jamais faire exécuter du SQL à Thierry.** C'est ce qui a dérapé une fois.
- Ne jamais lire, afficher ou committer `.env.local`.
- **Plus de push direct sur `main`** : branche, PR, checks verts, merge. Contourner une
  protection de branche, c'est réinstaller le défaut décrit au §3.
- Quand un contrôle bloque, **corriger la cause et le relancer** — jamais le contourner au motif
  qu'il n'est pas obligatoire. C'est la différence entre satisfaire une porte et la contourner.
- Ne pas demander à Thierry ses secrets — ils vont dans Vercel et Supabase, par lui.
- **Préflight avant toute opération sortante** : `npm run preflight` doit rendre **GO**. Deux
  jeux de comptes coexistent sur le poste (un personnel, un professionnel) ; une bascule
  silencieuse enverrait du code personnel sur l'infrastructure professionnelle.

---

## 8. Ce qui a marché, et qu'il faut garder

Les meilleurs résultats sont venus de sessions qui **ont refusé d'obéir** : celle qui a démenti
un diagnostic sur le middleware, celle qui a refusé une couleur qui cassait la palette, celle qui
a arrêté une migration parce que la sauvegarde ne couvrait pas l'état courant, celle qui a
corrigé son propre commentaire quand la mesure l'a démenti.

Encourage ça explicitement dans chaque prompt. Et applique-le à Thierry lui-même : il a eu tort
au moins deux fois, et le lui dire a fait avancer le projet.
