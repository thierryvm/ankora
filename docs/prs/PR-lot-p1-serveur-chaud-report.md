# Lot P1 — garder le serveur chaud

**Date** : 15 novembre 2026
**Branche** : `fix/lot-p1-keep-warm`
**Type** : `chore(ci)` — un workflow planifié, aucun code applicatif touché
**Auteurs** : @cc-ankora (mesures, plan, workflow), `plan-reviewer` et `security-auditor` (revues Opus), @thierry (délégation : « ne me demande rien »)

Légende : **M** mesuré, **C** lu dans le code ou la doc, **S** supposé.

---

## 1. Le problème

Au lancement (PWA installée ou navigateur), la première page attend environ deux
secondes ; ensuite, tout est rapide. Diagnostic du 15 novembre : c'est le démarrage
à froid de la fonction serverless. Rien ne la garde chaude : Vercel Hobby n'autorise
que des crons quotidiens (`vercel.json:6`).

## 2. Ce que réveille quelle route (M)

Lu dans l'API Vercel (`/v11/deployments/<prod>/builds`, déploiement de production du
15 novembre). Le déploiement compte **quatre fonctions** :

| Fonction               | Région                                                         | Contenu                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pages                  | fra1, 2 048 Mo                                                 | **toutes** les pages `[locale]` : `/`, `/app`, `/app/*`, `/login`, `/signup`, `/faq`, `/glossaire`, `/legal/*`, `/admin`, `/onboarding`, `/offline`, plus `_not-found` et `_global-error` |
| route handlers         | fra1                                                           | `api/client-error`, `auth/callback`, `[locale]/opengraph-image`                                                                                                                           |
| cron                   | fra1, timeout 60 s                                             | `api/cron/gdpr` seul (`maxDuration = 60` le sépare)                                                                                                                                       |
| proxy (`src/proxy.ts`) | **8 régions** : bom1, fra1, gru1, iad1, lhr1, sfo1, sin1, syd1 | tout ce que le `matcher` couvre                                                                                                                                                           |

Conséquences vérifiées en direct :

- **Réveiller une page réveille `/app`.** Dans chaque tour froid, `GET /app` (anonyme,
  307 vers `/login`, `x-matched-path: /[locale]/app`) répond en 0,31-0,37 s juste
  après un `GET /` froid.
- **Le proxy est une fonction à part**, et elle est déployée hors d'Europe aussi. Les
  logs runtime étiquettent ses lignes avec la région de bord (cdg1 pour la Belgique,
  sin1 pour un visiteur de Singapour) : un appel parti des États-Unis réchauffe très
  probablement une instance américaine du proxy, pas celle qui sert la Belgique (S).
- `GET /fr-BE` reçoit un 307 émis par le proxy seul (aucune région de fonction dans
  `x-vercel-id`) : il sert à chronométrer le proxy isolément.

## 3. Mesures avant (M)

Depuis la Belgique, `curl` anonyme, sans cookie ni secret, `time_starttransfer`.

### Démarrage à froid de `/` (inactivité ≥ 17 min)

| Heure (UTC) | `/`                                                            | `/app` juste après |
| ----------- | -------------------------------------------------------------- | ------------------ |
| 16:42       | 2,10 s                                                         | 0,33 s             |
| 18:14       | 1,65 s                                                         | 0,33 s             |
| 18:48       | 1,07 s                                                         | 0,32 s             |
| 19:05       | 1,86 s                                                         | 0,31 s             |
| 21:46       | 0,83 s (tiède : premier appel après le déploiement de #543, S) | 0,37 s             |

**Médiane à froid : 1,65 s.** À chaud, `/` répond en 0,21, 0,24, 0,25, 0,29, 0,31 et
0,32 s : **médiane ≈ 0,27 s**.

Cinq tours sur huit, à 17 min d'intervalle, ont trouvé la fonction des pages déjà
chaude : d'autres visiteurs l'avaient réveillée entre-temps. Seuls les tours au-delà
de 0,5 s comptent comme froids.

### Au bout de combien de temps l'instance est-elle libérée ?

Mesuré sur la fonction des route handlers, que seul le protocole de mesure appelle
(`GET /api/client-error`, 405) :

| Inactivité | TTFB           | État               |
| ---------- | -------------- | ------------------ |
| 5 min      | 0,21 s, 0,20 s | chaud              |
| 7,5 min    | 0,80 s         | froid              |
| 10 min     | 0,27 s, 0,86 s | l'un, puis l'autre |
| 15 min     | 0,89 s, 0,89 s | froid              |
| 20 min     | 0,86 s         | froid              |

**L'instance est libérée entre 5 et 7,5 minutes d'inactivité.** On suppose le même
comportement pour la fonction des pages (S). Un ping toutes les 5 minutes est donc
juste à la limite : tout retard de la planification GitHub laisse refroidir.

### La part du proxy

Non mesurée : `GET /fr-BE` a répondu en 0,16-0,21 s à chaque tour, le proxy n'a
jamais été pris à froid. Borne raisonnée : la fonction des route handlers, petite,
paie environ 0,6 s à froid ; le proxy est petit lui aussi, d'où l'hypothèse de
0,3 à 0,6 s (S).

## 4. Le mécanisme retenu

`.github/workflows/keep-warm.yml` : toutes les 5 minutes (minutes 2, 7, 12…, loin
de l'heure pile où GitHub est le plus chargé), **un seul** `GET https://ankora.be/app`
anonyme.

- **`/app` seulement.** C'est le `start_url` de la PWA, et la requête la moins chère
  qui exécute la fonction des pages (307 avant tout rendu du tableau de bord). Le
  job exige `307` **et** `x-matched-path: /[locale]/app` : la preuve que la fonction
  elle-même a répondu, et non le CDN. Si la page devenait un jour statique, le job
  le dirait au lieu de réussir sans rien réchauffer.
- **Pas la fonction des route handlers** : elle n'est pas sur le chemin du lancement
  (`auth/callback` ne sert qu'après un lien reçu par e-mail), et chaque cible de plus
  double l'exposition au quota CPU (§ 6).
- **Moindre privilège** : `permissions: {}`, aucun secret, aucun cookie, aucune action
  tierce (`uses:` absent, rien à épingler), pas de checkout, garde contre les forks
  (`if: github.repository == 'thierryvm/ankora'`), aucune expression `${{ }}` dans le
  script.
- **Un ping froid se voit** : au-delà d'1 s, le job émet un avertissement « cold
  start ». C'est le compteur qui décide du GO/NO-GO (§ 7).

### Option écartée : un service de ping externe

Un pinger situé en Europe réchaufferait aussi l'instance européenne du proxy. Mais
tous ceux qui sont gratuits demandent un compte, donc une décision de @thierry. Suivi
listé au § 9.

## 5. Gain attendu — une hypothèse, pas une promesse

Un lancement qui tombe dans une fenêtre réchauffée : la fonction des pages est chaude,
le TTFB serveur passe de 1,65 s (médiane froide) à environ 0,3-0,9 s. Le reste dépend
de l'instance européenne du proxy, qu'un runner GitHub hors d'Europe ne réchauffe pas.
Un lancement qui tombe dans un trou de planification : inchangé.

## 6. Coût, au budget 0 €

Sur Hobby, `vercel usage` répond « billing cost data unavailable », et `vercel metrics`
(CPU, froid/chaud) exige l'add-on payant Observability Plus, non acheté. Les chiffres
ci-dessous sont donc des bornes calculées (le temps CPU ne dépasse jamais le temps
mural, le TTFB est une borne haute).

Quotas Hobby (doc Vercel lue le 15 novembre 2026) : Active CPU 4 h, mémoire provisionnée
360 Go-h, 1 million d'invocations par mois. **Les dépasser met la production en pause**
(503 `DEPLOYMENT_PAUSED`).

| Poste                   | Calcul (8 640 exécutions nominales par mois)  | Part du quota |
| ----------------------- | --------------------------------------------- | ------------- |
| Invocations             | 8 640 pages + 8 640 proxy = 17 280            | 1,7 %         |
| Mémoire                 | ≤ 8 640 × 2 Go × 2 s = 9,6 Go-h               | 2,7 %         |
| Active CPU, tout chaud  | ≤ 8 640 × 0,3 s = 0,72 h                      | 18 %          |
| Active CPU, 10 % froids | ≤ 8 640 × (0,1 × 1,9 + 0,9 × 0,3) s = 1,1 h   | 28 %          |
| Active CPU, 25 % froids | ≤ 8 640 × (0,25 × 1,9 + 0,75 × 0,3) s = 1,7 h | 42 %          |
| Active CPU, tout froid  | ≤ 8 640 × 1,9 s = 4,6 h (borne pessimiste)    | **> quota**   |

GitHub Actions : gratuit pour un dépôt public. La ligne mémoire suppose une facturation
à la durée de la requête (S) : la marge reste large même si le chiffre réel est
plusieurs fois plus élevé.

Les seuils du § 7 sont fixés au plus prudent : à 10 % de pings froids, le keeper ajoute
au plus 1,1 h (28 % du quota). Un démarrage à froid évité à un vrai visiteur rend
d'ailleurs le CPU qu'il aurait coûté ; ce gain n'est pas compté.

D'où le GO/NO-GO du § 7 : un keeper qui rate sa fenêtre paie un démarrage à froid à
chaque passage, sans rien apporter.

## 7. Vérification après merge — GO / NO-GO

Une planification ne tourne que depuis `main` : rien ne peut tourner avant le merge.

Commandes `gh` lancées depuis PowerShell, préfixées `work perso -NoCd &&`.

1. **T + 3 h** (≈ 36 exécutions) : `gh run list --workflow keep-warm.yml` et
   `gh run view --log` → intervalle réel, part de pings froids (TTFB > 1 s), région de
   bord du runner et temps de connexion. Plus de 25 % de froids →
   `gh workflow disable keep-warm.yml` (réversible) et rapport.
2. **T + 24 h** : on garde seulement si les pings froids restent ≤ 10 %.
3. Puis au moins cinq lancements à froid depuis la Belgique, à des heures quelconques ;
   médiane comparée à 1,65 s. Les chiffres arrivent dans ce rapport par une PR de
   documentation.
4. **Chaque mois** : relecture datée du taux de pings froids et de la page Usage Vercel
   (ligne P1 de la ROADMAP). Un avertissement GitHub n'envoie pas d'e-mail : sans cette
   relecture, une dérive de la planification passerait inaperçue.

Le runner est le plus souvent aux États-Unis : son TTFB inclut l'aller-retour
transatlantique et le proxy américain. Le seuil d'1 s compte donc trop de froids plutôt
que pas assez, et coupe plus tôt : l'erreur va dans le sens prudent.

_Résultats : à compléter après le merge._

## 8. Décisions prises (délégation de @thierry)

- **D1 — le job échoue bruyamment** si la prod ne répond pas ou répond autre chose
  qu'un 307 de `/[locale]/app` : c'est aussi une alerte de disponibilité gratuite.
  `--retry 2 --retry-delay 5` absorbe les erreurs passagères. Prix accepté : pendant
  une vraie panne, environ 12 e-mails d'échec par heure.
- **D2 — une seule cible** (§ 4).
- **D3 — épingler le proxy en Europe** est hors périmètre. La config de `proxy.ts`
  n'accepte que `matcher` (doc Next 16 installée,
  `01-app/03-api-reference/03-file-conventions/proxy.md`) ; un réglage côté Vercel est
  une décision d'architecture : ADR, puis PR dans une session suivante.

## 9. Risques résiduels et suivis

- **Dérive de la planification GitHub** : l'intervalle réel n'existe qu'après le merge.
- **Désactivation** des planifications après 60 jours sans activité sur le dépôt
  (GitHub prévient par e-mail avant de couper).
- **Conditions d'utilisation de GitHub Actions** : un keep-alive léger (un `curl` par
  exécution) reste dans l'usage toléré, mais c'est une zone grise.
- **Bruit de logs** : chaque ping passe par `updateSession()`, qui écrit
  `middleware: session ended, cookies cleared` au niveau `info`
  (`src/lib/supabase/middleware.ts:85`), comme pour tout visiteur anonyme : environ
  8 640 lignes par mois. Aucune écriture Supabase, Upstash ni audit.
- **Le proxy européen** reste froid au lancement (§ 5).
- **Suivi** : recalculer les seuils du § 7 sur la consommation réelle relevée sur la page
  Usage du tableau de bord Vercel.
- **Un edge compromis** pourrait faire passer le keeper pour sain : `x-vercel-id` est lu
  en dernier, si bien qu'un `|` glissé dedans ne décale pas les champs vérifiés.
- **Suivi pour @thierry** : un pinger européen gratuit (compte requis).

## 10. Ligne ROADMAP — « Programme — une seule grammaire »

Cette section arrive avec la PR #542 (brouillon). En attendant, `docs/ROADMAP.md` porte
une section « Lot P — lancement rapide » ; la ligne à reporter dans le programme :

| Lot | Contenu                                                                               | État                            |
| --- | ------------------------------------------------------------------------------------- | ------------------------------- |
| P1  | Garder le serveur chaud : `keep-warm.yml`, un ping anonyme de `/app` toutes les 5 min | PR ouverte, GO/NO-GO à T + 24 h |

## 11. Preuves de validation avant push

- `actionlint 1.7.12` sur le fichier commité : 0 constat (shellcheck absent de la machine).
- L'étape déclare `shell: bash` : GitHub l'exécute alors avec
  `bash --noprofile --norc -eo pipefail {0}`. Le bloc `run:`, extrait tel quel du
  fichier commité et lancé de la même façon contre la prod :

  ```text
  status=307 connect=0.030792s ttfb=0.339448s edge=cdg1 x-vercel-id=cdg1::fra1::… x-matched-path=/[locale]/app
  exit=0
  ```

  Cas négatif (`TARGET=https://ankora.be/`) :

  ```text
  status=200 connect=0.054042s ttfb=0.229410s edge=cdg1 x-vercel-id=cdg1::fra1::… x-matched-path=/[locale]
  ::error::expected 307 from /[locale]/app, got 200 from '/[locale]'
  exit=1
  ```

- Porte `npm run dev` (Tailwind v4 scanne aussi ce rapport et la ROADMAP) : serveur
  démarré dans le worktree, `GET /` → 200, `GET /login` → 200, aucune erreur ni
  avertissement de compilation dans la sortie.
- `prettier --check` vert sur les trois fichiers.

## 12. Definition of Done

| Critère                                                    | État                                                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `plan-reviewer` (Opus)                                     | 🟡 approuvé avec 3 corrections, intégrées (seuils prudents, porte `npm run dev`, `shell: bash`)           |
| `security-auditor` (Opus) sur le workflow                  | PASS_WITH_NOTES : champ vérifié lu avant `x-vercel-id`, relecture mensuelle, phrasé public ; tout intégré |
| CI verte (Lint, Typecheck, Tests, E2E ×2, Security, Build) | à reporter                                                                                                |
| Sourcery et Codex traités dans leurs fils                  | à reporter                                                                                                |
| Pas de conflit avec `main`, `mergeStateStatus` CLEAN       | à reporter                                                                                                |
| GO/NO-GO à T + 3 h et T + 24 h, médianes après             | PR de documentation après merge                                                                           |

Planchers e2e inchangés : aucune spec touchée.
