---
description: Affiche l'état actuel du projet Ankora — ordre des PR, position actuelle, prochaine action
---

Lis `docs/ROADMAP.md` puis produis un rapport concis au format suivant :

## État Ankora

**Position actuelle dans la séquence PR** : _(ex: PR-1bis Vague C → D en cours)_

**PR mergées** : _(liste avec icône ✅)_

**PR en cours** : _(statut détaillé)_

**Prochaine PR à lancer** : _(ID + chemin du prompt + prérequis à vérifier)_

**Blockers connus** : _(rien ou liste)_

**Rappels budget** :

- Dépendances payantes introduites depuis le dernier audit : _(lister via `grep -r "sentry\|datadog\|logrocket\|bugsnag" package.json` — si match, alerter)_
- Variables d'env manquantes : _(check `.env.example` vs `.env.local` si présent)_

Ne propose aucune action — juste l'état. Thierry décide ensuite avec `/pr-start {ID}`.
