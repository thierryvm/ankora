# Brief `@cc-fable` — refonte du cockpit `/app`

**Envoyé le 23 août 2026** par @cc-ankora, dans une session Fable 5 dédiée.
Template de référence : [`claude-design-brief.md`](claude-design-brief.md).
Convention du trio : [`trio-agents.md`](trio-agents.md).

> **Pourquoi ce fichier existe.** Un brief qui ne vit que dans une fenêtre de
> conversation n'est pas relisible quand la maquette revient, et personne ne peut
> vérifier si ce qui a été livré répond à ce qui a été demandé. Les contraintes
> dures ci-dessous sont la partie qui compte : ce sont elles qui décident si un
> export est intégrable ou s'il faut le redessiner.

**État au moment de l'envoi** : la palette « papier » venait de descendre dans
l'application (PR #442), le pli du cockpit était refait (#440) et la feuille de
saisie corrigée (#441). Les chiffres de la §Problème sont relevés sur la
production, AVANT #440.

---

## Ce qu'est Ankora, en une phrase

> Ta banque te montre ce qui s'est passé. Ankora te montre ce qui est **déjà engagé**.

PWA de finances personnelles, Belgique, un utilisateur = un foyer. Pas de
connexion bancaire : tout est saisi à la main. C'est ce qui permet de regarder
**devant** — une banque ne connaît que les transactions passées.

Tu as déjà dessiné la page d'accueil de ce produit (direction A, « Le relevé
corrigé », en production depuis le 11 août). L'application a maintenant la même
palette. C'est le cockpit qu'il faut refaire.

## Le problème, mesuré au navigateur le 23 août

Le tableau de bord fait **~2 900 px sur un écran de 900**, soit 9 blocs
empilés, et **la réponse est donnée dans les 250 premiers pixels**.

```
1  hero « Il te reste 501,61 € »     250 px  ← la réponse
2  D'où vient ce chiffre             400 px  ← l'explication, le plus gros bloc
3  Santé provisions + Engagements    200 px  ← grille 2 colonnes mal appariée
4  Prochaines factures               160 px  ← dit « tout est payé ce mois »
5  3 cartes de comptes               130 px  ← 3 cartes pour 3 nombres
6  Plan du mois (3 cartes)           180 px
7  Dépenses — Août (liste)           400 px  ← double une autre page
8  3 boutons                          70 px  ← doublent la navigation
```

**Quatre de ces neuf blocs n'avaient rien à signaler ce mois-là** — « tout est
payé », « à jour », une seule échéance, un plan statique — et occupaient chacun
une carte pleine.

Un cockpit doit **rétrécir les mois calmes**. Celui-ci ne rétrécit jamais.

## La structure est décidée — elle n'est pas à rediscuter

Arbitrage @thierry du 23 août : « je te fais confiance, tranche ».

**Une réponse au-dessus du pli. Tout le reste replié, une seule colonne.**

Chaque ligne repliée **porte déjà sa réponse** : on n'ouvre que ce qu'on veut
creuser. Un bloc sans nouvelle se réduit à **une ligne**, jamais à une carte
vide.

```
Août — ton cockpit

  ✓ Tu gères bien ce mois-ci
  IL TE RESTE
  501,61 €
  sur 838,52 € · 55,73 €/jour jusqu'au 31
  ████████████░░░░░░░░░░░░░░░░

  ──────────── le pli (550 px utiles sur iPhone) ────────────

  › D'où vient ce chiffre              501,61 €
  › Ce qui arrive                  rien ce mois
  › Mes provisions                       à jour
  › Mes comptes                 4 653 € au total
  › Mes engagements              fin mars 2027
  › Mes dernières sorties             336,91 €
```

**Ce sur quoi Fable a la main** : la forme du hero, le graphisme des lignes, ce
que montre chaque section une fois ouverte, la façon dont un mois chargé se
distingue d'un mois calme, la typographie, le rythme, les transitions.

## Les vraies données (le mois d'août de l'utilisateur)

```
Revenus                  2 693 €
  − Factures mensuelles  1 575,48 €
  − Lissage des annuelles   59 €      (provisions pour factures périodiques)
  − Engagements            220 €      (échéancier de dette)
  = Budget du mois         838,52 €
  − Dépensé ce mois        336,91 €   (14 dépenses)
  = Il te reste            501,61 €
  Épargne estimée          384,42 €   (projection du rythme actuel)

Provisions   100 % — cible 130,58 €, solde réel 1 460 €, +1 329,42 € au-delà
Engagement   SPF impôt · 1 527,93 € restant · 7 échéances · fin mars 2027
Comptes      Belfius 2 693 € · Belfius Épargne 1 460 € · Revolut Vie Courante 500 €
Prochaines factures  aucune ce mois-ci
```

Dessiner avec ces chiffres. Montrer aussi **le même écran un mois chargé**
(trois factures dans les 14 jours, provisions à 62 %, il te reste 87 €) — c'est
là que la structure se prouve.

## Les tokens — les utiliser, n'en inventer aucun

| token                      | clair (papier) | sombre (navy) |
| -------------------------- | -------------- | ------------- |
| `--color-background`       | `#faf9f6`      | `#0b1120`     |
| `--color-foreground`       | `#171d26`      | `#e2e8f0`     |
| `--color-muted-foreground` | `#3d4a5c`      | `#cbd5e1`     |
| `--color-border`           | `#e7e4dc`      | `#1e293b`     |
| `--color-card`             | `#ffffff`      | `#111a2e`     |
| `--color-surface-soft`     | `#fbfaf7`      | `#0f172a`     |
| `--color-surface-muted`    | `#f3f1ea`      | `#0f172a`     |
| `--color-brand-700`        | `#0f766e`      | idem          |
| `--color-brand-text`       | `#0f766e`      | `#2dd4bf`     |
| `--color-accent-text`      | `#8b6914`      | `#d4a017`     |
| `--color-success`          | `#047857`      | `#34d399`     |
| `--color-warning`          | `#9a3412`      | `#fbbf24`     |
| `--color-danger`           | `#dc2626`      | `#f87171`     |
| `--color-info`             | `#0369a1`      | `#38bdf8`     |

`--color-danger` sur papier vaut 4,59:1 — **0,09 au-dessus de AA**. Ne pas
l'assombrir, ne pas le poser sur une surface plus claire.

## Contraintes dures — une seule violée et la maquette est inintégrable

- **Mobile d'abord, 390 × 844.** Fenêtre réellement utile : **550 px** (en-tête
  collant 65 + barre d'onglets 49 déduits). Bureau 1280 en second.
- **SVG écrit à la main. Aucune bibliothèque de graphiques** — budget 0 €.
- **Aucun style inline** : la CSP est stricte, un attribut `style` est refusé.
- **WCAG 2.2 AA**, cibles tactiles ≥ 44 px, `prefers-reduced-motion` respecté.
- **FR et EN.** Aucun texte en dur : tout est une clé de traduction.
- **FSMA — aucun conseil en placement.** Les « actions » sont le plan de
  virements que l'utilisateur s'est donné, pas un conseil. On énonce des faits :
  « tu dépenses plus vite que la moyenne du mois », jamais « tu dépenses trop ».
- **Deux règles du produit** (`CLAUDE.md` §10 et §11) :
  - tout total s'ouvre sur sa décomposition ;
  - toute action d'un clic se défait d'un clic, et l'affichage porte la date de
    l'action, jamais un simple état.

## Ce qu'il ne faut PAS faire

**Ne copier aucune app bancaire.** Leurs graphiques sont **rétrospectifs par
construction** — camembert par catégorie, barres du mois, comparaison au mois
dernier — parce qu'une banque ne connaît que le passé. Ankora n'a pas de flux de
transactions : la rétrospective y serait tapée à la main et incomplète.

On leur emprunte le **métier** — qualité de rendu, lisibilité à 390 px,
animation qui explique au lieu de décorer, chiffres tabulaires — et **jamais le
sujet**. Les graphiques d'Ankora regardent devant.

Pas de fond dégradé décoratif, pas de verre dépoli empilé, pas d'icône qui
remplace un mot, pas de grand nombre qui n'est pas LE nombre.

## Livrable attendu

**Deux ou trois directions**, chacune avec :

1. Le cockpit à **390 px**, mois calme et mois chargé, en clair **et** en sombre.
2. Le même à **1280 px**.
3. Une section dépliée, pour montrer ce que « ouvrir » veut dire.
4. Une note courte : ce que cette direction privilégie, et ce qu'elle sacrifie.

Le reste du produit garde son langage actuel — ne pas redessiner la navigation,
la feuille de saisie, ni les autres pages.

---

## À la réception — ce qui sera vérifié avant intégration

Rappel de la doctrine `CLAUDE.md` §« exports Claude Design » : jamais de merge
direct, toujours une branche `feat/cc-design-<surface>`, et les agents QA
`ui-auditor`, `dashboard-ux-auditor` et `gdpr-compliance-auditor` passent avant
la revue humaine. Les tokens de production sont la source de vérité : une couleur
absente du tableau ci-dessus se remplace par la sienne, elle ne s'ajoute pas.
