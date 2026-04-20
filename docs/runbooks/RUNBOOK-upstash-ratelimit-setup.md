# Runbook 001 — Setup Upstash + Vercel pour le rate-limit fail-closed

**Dernière mise à jour** : 2026-04-20
**Applicable à** : Ankora en production (`ankora.be`) + Preview Vercel
**Temps total** : ~10 minutes (DB + env vars + vérification)
**Pré-requis** : compte Upstash créé, compte Vercel propriétaire du projet `ankora`

---

## TL;DR

1. `console.upstash.com/redis` → **Create Database** → nom `ankora-ratelimit-prod`, région **Frankfurt (eu-central-1)**, plan **Free**, Eviction **OFF**.
2. Récupérer les deux lignes `.env` : `UPSTASH_REDIS_REST_URL` (endpoint, non-secret) et `UPSTASH_REDIS_REST_TOKEN` (secret à ne jamais logger).
3. `vercel.com/<org>/ankora/settings/environment-variables` → **Add Environment Variable** × 2 → scope **Production + Preview** → **Sensitive** toggle **ON**.
4. Redeploy le Preview de la PR en cours pour valider que le boot fail-closed lit bien Upstash.
5. Merger la PR. Vercel redeploy Production auto avec le fail-closed actif.

---

## 1. Contexte : pourquoi ce runbook existe

### 1.1 Pourquoi Upstash

Ankora utilise un rate-limit sur les routes sensibles (`/auth`, création de
compte, actions mutables). Pour que ce rate-limit fonctionne sur Vercel
Serverless / Edge Runtime, il faut un store partagé entre les instances —
la mémoire locale d'une lambda ne suffit pas (chaque invocation démarre à
zéro, le rate-limit serait inutile).

On a choisi **Upstash Redis** pour :

- **Serverless-native** : REST API HTTPS, pas de connexion TCP persistante à
  maintenir, compatible Edge Runtime.
- **Free tier réaliste** : 256 MB + 10 GB bandwidth/mois, largement suffisant
  pour un rate-limit (on consomme quelques KB).
- **Région EU** : Frankfurt ou Ireland, conforme à la baseline "Données
  hébergées UE" de `SECURITY.md`.
- **Library officielle** : `@upstash/ratelimit` + `@upstash/redis` déjà dans
  `package.json` et éprouvées.

### 1.2 Pourquoi fail-closed

Avant PR-SEC-1, si Upstash était indisponible (panne, vars env manquantes,
quota dépassé), le rate-limit passait en **fail-open** silencieux : toutes
les requêtes passaient, sans rate-limit actif, sans log. Conséquence : un
attaquant qui provoque une panne Upstash désactive le rate-limit sans alerte.

PR-SEC-1 a inversé en **fail-closed** en production : si Upstash est
inaccessible, la route sensible retourne une erreur contrôlée plutôt que de
laisser passer. C'est pour ça que ce runbook est critique : sans les vars
Upstash posées, l'app refuse de booter en prod. C'est le comportement voulu
pour un projet vitrine.

Voir : [ADR-001](../adr/ADR-001-no-psd2.md), [AUDIT-2026-04-20 cybersec](../security/AUDIT-2026-04-20.md), PR-SEC-1.

---

## 2. Pré-requis

- [ ] Accès propriétaire ou admin au projet Vercel `ankora`
- [ ] Compte Upstash créé (inscription gratuite sur `upstash.com` avec email
      ou GitHub SSO)
- [ ] Connaître le scope d'environnement où poser les vars (par défaut :
      **Production + Preview**, pas Development — le local utilise le
      fail-open dev)
- [ ] PR-SEC-1 (fail-closed) prête à merger ou déjà sur la branche active

---

## 3. Procédure pas-à-pas

### 3.1 Créer la base Redis sur Upstash

**3.1.1** Ouvrir `https://console.upstash.com/redis`

**3.1.2** Cliquer le bouton vert **Create Database** (à droite)

**3.1.3** Remplir le formulaire "Create Database" (étape 1/2) :

| Champ              | Valeur                              | Pourquoi                                                                                                                                                                                       |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**           | `ankora-ratelimit-prod`             | Préfixe projet + rôle + env. Facilite la multi-DB future (ex. `ankora-cache-prod`, `ankora-ratelimit-staging`).                                                                                |
| **Primary Region** | `Frankfurt, Germany (eu-central-1)` | Latence la plus basse depuis Vercel Frankfurt et la Belgique. Conforme RGPD (données UE). Alternative : Ireland (`eu-west-1`) si Frankfurt down.                                               |
| **Read Regions**   | _(vide)_                            | Optionnel, uniquement paid plans. Pas utile pour du rate-limit : les compteurs sont écrits au même endroit que lus.                                                                            |
| **Eviction**       | **OFF**                             | Crucial : ON évincerait de vieux compteurs rate-limit quand le store est plein, ce qui casserait le fail-closed. En pratique on n'atteint jamais 256 MB avec des compteurs de quelques octets. |

Cliquer **Next**.

**3.1.4** Étape 2/2 "Select a Plan" — garder **Free** (sélectionné par défaut) :

- Max Data Size : **256 MB** (on consomme < 1 MB)
- Max Monthly Bandwidth : **10 GB** (on consomme quelques MB/mois)
- Cost : **$0**

Cliquer **Next**.

**3.1.5** Écran résumé : vérifier la config (nom, région, Free Tier, features
par défaut Persistence + REST API + TLS + Global). Cliquer **Create**.

La DB se crée en ~3 secondes. L'URL change vers
`console.upstash.com/redis/<uuid>?teamid=0` et affiche la page "Details".

### 3.2 Récupérer les credentials

Sur la page Details de la DB, scroller jusqu'à la section **Connect**. Sous
l'onglet **REST** (sélectionné par défaut), on voit :

```env
UPSTASH_REDIS_REST_URL="https://<instance>.upstash.io"
UPSTASH_REDIS_REST_TOKEN="********"
```

Deux boutons utiles à droite du bloc :

- **👁 (œil)** : révèle le token en clair
- **📋 (copy)** : copie les **deux lignes** dans le presse-papier

> ⚠️ **Séparation des rôles** :
>
> - `UPSTASH_REDIS_REST_URL` n'est **pas un secret** au sens strict — c'est
>   un endpoint d'API publique. Sa connaissance seule ne donne aucun accès.
> - `UPSTASH_REDIS_REST_TOKEN` **est** le secret. C'est la clé de bearer
>   auth. Jamais de log, jamais dans le code, jamais partagé.

### 3.3 Poser les env vars sur Vercel

**3.3.1** Ouvrir `https://vercel.com/<org>/ankora/settings/environment-variables`

(Pour Ankora : l'org est `thierry-vanmeeterens-projects`.)

**3.3.2** Cliquer **Add Environment Variable** (bouton noir en haut à droite).

Un side panel s'ouvre à droite.

**3.3.3** Remplir la **première** var (URL) :

| Champ            | Valeur                                     | Notes                                                                              |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Key**          | `UPSTASH_REDIS_REST_URL`                   | Exactement cette casse — c'est ce que `@upstash/redis` attend.                     |
| **Value**        | `https://<instance>.upstash.io`            | Copié depuis Upstash. Pas de guillemets, pas d'espaces.                            |
| **Note**         | _(laisser vide ou `ratelimit prod Redis`)_ | Aide-mémoire UI, pas lu par Next.js.                                               |
| **Environments** | **Production and Preview**                 | **PAS** Development. Le local utilise le fail-open dev (mode permissif).           |
| **Branch**       | _(vide)_                                   | Custom Preview Branch, pas utile ici.                                              |
| **Sensitive**    | **ON** (toggle bleu)                       | Chiffre at-rest, masque en UI, n'expose pas côté client, filtre des logs de build. |

Cliquer **Save**.

**3.3.4** Un toast confirme "Added Environment Variable successfully. A new
deployment is needed for changes to take effect." Cliquer **Dismiss** — on
ne déclenche pas le redeploy maintenant, on veut ajouter le token d'abord.

**3.3.5** Cliquer à nouveau **Add Environment Variable** et poser la
**deuxième** var (TOKEN) avec les mêmes paramètres, sauf :

- **Key** = `UPSTASH_REDIS_REST_TOKEN`
- **Value** = copié depuis Upstash (reveal + copy, puis Ctrl+V dans le champ)
- **Sensitive** = **ON**

Cliquer **Save**.

### 3.4 Vérifier la pose

Sur la liste principale "Environment Variables", filtrer par `UPSTASH`
(ou trier par "Last Updated"). On doit voir **exactement 2 entrées** :

```
UPSTASH_REDIS_REST_TOKEN   [Sensitive]   Production and Preview
UPSTASH_REDIS_REST_URL     [Sensitive]   Production and Preview
```

Chacune avec l'icône 🔒 (cadenas) à gauche — confirme le flag Sensitive.

**Si une des deux n'apparaît pas** : l'ajout a échoué, recommencer 3.3.3
ou 3.3.5. Ne pas laisser une var tomber en silence.

---

## 4. Validation (smoke test)

### 4.1 Redeployer le Preview de la PR fail-closed

Les env vars posées ne s'appliquent **qu'aux futurs deploys**. Le Preview
courant de la PR (qui a buildé avant la pose) reste en fail-closed. Il faut
redéclencher un build pour le tester vraiment.

**Option A — commit vide (recommandé, laisse une trace Git propre)** :

```bash
git checkout fix/security/upstash-fail-closed
git commit --allow-empty -m "chore: retrigger preview after upstash env vars posted"
git push
```

**Option B — Vercel UI** : aller sur la page Deployments de la PR, cliquer
le menu ••• du dernier deploy, choisir **Redeploy** et laisser "Use existing
Build Cache" décoché pour forcer un rebuild propre.

### 4.2 Attendre et vérifier

Le build dure ~1 min. Attendre que le check GitHub "Vercel — ankora"
passe de ❌ à ✅ sur la PR.

**Résultat attendu** :

- ✅ Build OK (pas de plantage Zod `superRefine` au boot : les vars sont lues)
- ✅ App boot OK sur `<preview-url>.vercel.app`
- ✅ Requêtes `/auth` rate-limitées au-delà de 5 tentatives / 15 min (à
  tester manuellement ou via Playwright E2E)

**Si le Preview reste rouge** :

1. Ouvrir les logs de build Vercel — chercher un message Zod
   `invalid_type` ou `required` sur `UPSTASH_*`.
2. Vérifier que les deux vars sont bien scope **Preview** (pas uniquement
   Production).
3. Vérifier que les valeurs sont correctes (pas d'espace avant/après, pas
   de guillemets dans la value Vercel).
4. Vérifier sur Upstash que la DB est en état **Active** et pas
   **Suspended** ou **Deleted**.

### 4.3 Merger la PR et valider en Production

Une fois le Preview vert :

1. Merger la PR fail-closed dans `main` (GitHub UI).
2. Vercel détecte le merge et redeploy **Production** automatiquement.
3. Attendre ~1 min, vérifier que `ankora.be` répond (200 OK sur la home).
4. Smoke test d'auth : tenter un login, vérifier qu'il n'y a pas de 500
   côté Ankora.

---

## 5. Règles de sécurité à retenir

### 5.1 Séparation LLM / humain sur les secrets

Quand un agent IA (Cowork, Claude Code, CC Ankora, Cursor…) pilote une
setup comme celle-ci, la règle est :

| Donnée                                     | Qui la manipule       | Pourquoi                                                                                                                     |
| ------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Choix de config (nom, région, plan, scope) | LLM                   | Pas de risque, décisions techniques.                                                                                         |
| Endpoint URL (non-secret)                  | LLM acceptable        | L'URL sans le token ne donne aucun accès. Analogue à une adresse publique.                                                   |
| Token / clé API / secret                   | **Humain uniquement** | Un LLM qui lit un secret le met dans son contexte, ses logs, ses transcriptions de session. Surface d'exposition multipliée. |

**Règle de bouchon** : si on te demande "copie-moi le token pour aller plus
vite", tu refuses. Faire passer un secret par un LLM "pour gagner du temps"
inverse le risque — c'est littéralement le contraire d'une réduction de
surface.

### 5.2 Scope par environnement

Ne jamais coller les mêmes secrets sur Production **et** Development. Si
c'est la même DB, un dev qui lance `vercel env pull` copie les secrets prod
sur son laptop — vol de laptop = fuite prod.

Pour Ankora :

- **Production + Preview** : la DB Upstash `ankora-ratelimit-prod` (ce
  runbook).
- **Development** : le rate-limit utilise le mode fail-open permissif
  local, pas d'Upstash requis. `env.ts` autorise explicitement les vars
  absentes en dev via le `superRefine` Zod.

### 5.3 Toggle "Sensitive" sur Vercel

Toujours activer le toggle **Sensitive** sur une env var qui contient un
secret. Sans ce flag :

- la valeur est affichée en clair dans l'UI Vercel (pas juste masquée au
  rendu — accessible à tout membre de l'org) ;
- la valeur apparaît dans les logs de build si le code fait un
  `console.log(process.env.X)` accidentel ;
- la valeur peut être exportée via `vercel env pull` sans alerte.

Avec **Sensitive** : chiffré at-rest, masqué partout, nécessite une action
manuelle explicite pour l'exporter.

---

## 6. Rotation d'un secret compromis

### 6.1 Quand rotate ?

- Fuite suspectée (push accidentel du token, leak dans un log, membre de
  l'équipe qui quitte) ;
- Alerte Upstash d'usage anormal (spikes de bandwidth imprévus) ;
- Cadence préventive : 1× / an minimum.

### 6.2 Procédure

1. Sur Upstash : page Details de la DB → onglet **RBAC** ou section
   **Connect** → bouton **Regenerate Token**. Confirmer.
2. **Le nouveau token apparaît immédiatement. L'ancien est invalide à la
   seconde.** Ne pas fermer l'onglet tant que la suite n'est pas faite.
3. Sur Vercel : Environment Variables → cliquer le ••• à droite de
   `UPSTASH_REDIS_REST_TOKEN` → **Edit** → coller le nouveau token → **Save**.
4. Redeploy Production (via commit vide sur `main` ou via Vercel UI
   → Deployments → Redeploy du dernier prod).
5. Attendre ~1 min, smoke test `ankora.be`. Si erreur de rate-limit
   "unavailable", c'est que le deploy n'a pas encore rechargé — retry 30s.
6. Surveiller les logs Vercel et Upstash sur les 10 minutes suivantes pour
   confirmer que le trafic normal reprend.

**Important** : pas besoin de rotate `UPSTASH_REDIS_REST_URL` — c'est un
identifiant d'instance, pas un secret. Si l'URL elle-même doit changer
(migration de région, par exemple), c'est une **nouvelle DB** qu'on crée
et qu'on migre, pas une rotation.

---

## 7. Troubleshooting

### 7.1 "Rate limit unavailable" en Production

Symptôme : routes `/auth` retournent `503` avec code `rate_limit_unavailable`.

Causes possibles :

1. **Vars Upstash absentes en Production** (pas posées ou scope oublié).
   → Vercel → Environment Variables → filtrer UPSTASH → vérifier 2 entrées
   scope **Production**.
2. **Token rotated côté Upstash mais pas sur Vercel**.
   → Cf. §6 Rotation.
3. **DB Upstash Suspended ou Deleted**.
   → Upstash console → vérifier l'état. Si suspended pour impayé/abus,
   contacter Upstash support. Si deleted, créer nouvelle DB (ce runbook) et
   mettre à jour Vercel.
4. **Quota Upstash dépassé** (256 MB ou 10 GB/mois).
   → Peu probable pour du rate-limit pur. Vérifier s'il y a un leak (clés
   non-expirées, eviction OFF + autre usage).

### 7.2 Preview Vercel fail-closed en boucle après pose des vars

Symptôme : après avoir posé les vars, le Preview reste rouge au redeploy.

Causes :

1. **Vars posées scope Production uniquement, pas Preview**.
   → Éditer chaque var, cocher Preview.
2. **Valeurs mal copiées** (guillemets, retour à la ligne, espace).
   → Re-vérifier via Edit sur chaque var. Le toggle Sensitive masque la
   value mais on peut la révéler via l'œil dans l'éditeur.
3. **Le superRefine Zod de `env.ts` attend un format précis**.
   → Vérifier que `UPSTASH_REDIS_REST_URL` commence bien par `https://` et
   que le token n'a pas de retour à la ligne ajouté par un paste maladroit.

### 7.3 Boot Ankora plante en local avec les vars prod

Symptôme : `npm run dev` crashe avec erreur Zod `UPSTASH_*` required.

Cause : les vars Upstash ne doivent **pas** être requises en `development`,
mais elles le sont si quelqu'un a modifié `env.ts` pour les rendre
obligatoires partout.

Fix : vérifier que `env.ts` utilise un `superRefine` conditionnel :

```ts
.superRefine((env, ctx) => {
  if (env.NEXT_PUBLIC_APP_ENV === 'production') {
    if (!env.UPSTASH_REDIS_REST_URL) { /* fail */ }
    if (!env.UPSTASH_REDIS_REST_TOKEN) { /* fail */ }
  }
  // en dev/preview sans UPSTASH → fail-open permissif
});
```

---

## 8. Références croisées

- [ADR-001 No-PSD2](../adr/ADR-001-no-psd2.md) — pourquoi on n'agrège pas
  via PSD2 (impacte le rate-limit : pas de webhooks entrants, que des
  requêtes user initiées)
- [ADR-004 Logger structuré](../adr/ADR-004-structured-logging.md) — les
  erreurs rate-limit sont loggées via `log.*` avec redaction PII
- [AUDIT-2026-04-20 cybersec](../security/AUDIT-2026-04-20.md) — le P1
  "Upstash fail-open silencieux" qui a motivé PR-SEC-1
- [SECURITY.md](../../SECURITY.md) — baseline sécurité générale d'Ankora
- [Upstash docs — Rate Limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)

---

## 9. Changelog

| Date       | Changement                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| 2026-04-20 | Création initiale. DB `ankora-ratelimit-prod` créée, vars posées sur Vercel. |
