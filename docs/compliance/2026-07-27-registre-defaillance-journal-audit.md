# Registre — défaillance du journal d'audit (art. 24 + art. 5(2) RGPD)

**Responsable de traitement** : Thierry Van Meeterens — Ankora
**Constaté** : 26 juillet 2026 · **Mesuré en production** : 27 juillet 2026
**Corrigé par** : PR #273 (`fix/h3-service-role-client`)
**Qualification** : défaillance d'une mesure d'accountability. **Pas** une
violation de données au sens de l'art. 4(12). Ni notification APD (art. 33), ni
information des personnes concernées (art. 34) — motivation au §4.

---

## 1. Les faits

Du **16 avril 2026** (création de la base) au merge de la PR #273, le journal
d'audit de production n'a enregistré **aucun** événement émis depuis un contexte
authentifié.

**Cause technique, mesurée.** `createAdminClient()` associait la clé
`service_role` à un adaptateur de cookies `@supabase/ssr`. En présence d'un
cookie de session, le SDK envoyait le JWT de l'utilisateur en `Authorization` à
la place de la clé ; le client retombait en rôle `authenticated`, à qui la table
`audit_log` est révoquée (`20260416000002_rls_policies.sql:110`) et explicitement
niée (`20260417000003`).

Deux inserts, même clé, même base, même table, seul le bocal à cookies change :

```
service_role, SANS cookie          INSERTED
service_role, AVEC cookie session  DENIED  [42501] permission denied for table audit_log
```

**La défaillance était silencieuse par construction** : `logAuditEvent()` ne lève
jamais d'exception, elle journalise l'échec sur stderr et rend la main. Aucun
parcours utilisateur n'a été interrompu, et rien n'a signalé le problème.

## 2. Preuve — contenu réel de `public.audit_log` en production

Relevé le 27 juillet 2026 sur `ankora-prod` (`fkscfvoouwufyjwnfvhb`) :

| `event_type`                | n   | dernier              | contexte                 |
| --------------------------- | --- | -------------------- | ------------------------ |
| `auth.rate_limited`         | 22  | 2026-07-26 17:59 UTC | avant toute session      |
| `admin.access.rate_limited` | 21  | 2026-05-18 16:35 UTC | requête non authentifiée |
| `auth.signup`               | 2   | 2026-04-20 09:49 UTC | avant toute session      |
| `auth.password_reset`       | 1   | 2026-04-17 19:19 UTC | avant toute session      |

**Les quatre seuls types présents sont ceux qui s'écrivent avant qu'un cookie de
session n'existe.** Aucun autre n'a jamais atteint la table.

Absents, alors que l'application est utilisée depuis avril — ce que prouve la
présence même de `auth.signup` et de `auth.rate_limited` : des gens se sont
inscrits et ont tenté de se connecter, mais **pas une seule connexion réussie
n'a été journalisée** :

- `auth.login`, `auth.logout`, `auth.mfa_enabled`, `auth.mfa_disabled`
- l'intégralité des mutations financières — `charge.*`, `expense.*`,
  `commitment.*`, `account.*`, `workspace.*`
- l'intégralité des événements RGPD — `gdpr.consent_*`, `gdpr.export_*`,
  `gdpr.deletion_*`
- `admin.access.granted` et `admin.access.denied`

**Personnes concernées — chiffre réel.** Relevé le 27 juillet 2026 :
**5 comptes**, aucun compte de test, dont **1 seul** connecté dans les 30 derniers
jours. Trois de ces comptes appartiennent à des **tiers** (proches du responsable
de traitement) ; deux sont ceux du responsable lui-même. Les tiers sont des
personnes concernées au sens du RGPD et disposent de l'ensemble de leurs droits.

Le compteur « 47 utilisateurs actifs mensuels » du tableau de bord Supabase ne
mesure **pas** 47 personnes : il compte les utilisateurs distincts ayant émis une
requête d'authentification pendant le cycle de facturation, et `npm run e2e:auth`
exerce les parcours connectés **contre la production** en créant des comptes
jetables `ankora-e2e+<hex>@ankora.test`. Supprimés en fin de test, ils restent
comptabilisés pour le cycle.

**Recoupement indépendant de la défaillance.** `auth.users.last_sign_in_at` est
renseigné pour les 5 comptes (connexions réelles entre avril et juillet 2026),
alors que `audit_log` ne contient **aucune** ligne `auth.login`. Deux sources
indépendantes, une seule conclusion.

## 3. Ce qui n'a PAS été perdu

Deux couches de preuve n'empruntent pas ce client et sont restées intactes :

| Preuve                             | Vecteur                                                   | État        |
| ---------------------------------- | --------------------------------------------------------- | ----------- |
| Consentement (art. 7(1))           | `user_consents`, via le client de session soumis à la RLS | **Intacte** |
| Registre des demandes d'effacement | `deletion_requests`, politique `deletion_self_insert`     | **Intacte** |

La démonstrabilité du consentement — l'obligation la plus lourdement sanctionnée
— n'a donc jamais été compromise.

## 4. Analyse de risque, et pourquoi il n'y a pas de notification

**Le sens de la défaillance est protecteur (fail-closed).** Un client
`service_role` qui retombe en rôle `authenticated` obtient **moins** de droits,
jamais plus. Toutes les requêtes concernées ont été soit refusées, soit exécutées
sous la RLS de l'utilisateur lui-même, sur ses propres lignes.

Conséquences :

- **Aucune donnée personnelle exposée**, à personne.
- **Aucune altération, aucune destruction** de données détenues.
- **Aucune perte de disponibilité** pour les personnes concernées : leurs données
  financières n'ont jamais été en jeu, la RLS a tenu — et a même été
  sur-appliquée.

L'art. 4(12) définit la violation comme la destruction, la perte, l'altération ou
la divulgation **de données à caractère personnel**. Ici, les lignes d'audit
n'ont jamais été créées : c'est la défaillance d'une mesure d'accountability, pas
une atteinte à des données détenues.

→ **Pas d'art. 33** (notification à l'Autorité de protection des données).
→ **Pas d'art. 34** (information des personnes concernées).
→ **Consignation art. 24 + 5(2)** : le présent document.

## 5. Manquements constitués

- **Art. 32(1)(b) et (d)** — la politique de confidentialité déclare un
  « audit log append-only » comme mesure de sécurité. Une mesure déclarée qui
  n'a pas fonctionné pendant trois mois est un manquement en soi. Circonstance
  aggravante : l'art. 32(1)(d) impose de « tester, analyser et évaluer
  régulièrement l'efficacité » des mesures — la défaillance était silencieuse et
  rien ne la testait.
- **Art. 5(2)** — impossibilité de démontrer _quand_ un export ou une demande
  d'effacement a été traité sur la période. Subsiste `deletion_requests.requested_at` ;
  rien pour l'export.

## 6. Mesures correctives

**Prises** (PR #273) :

1. Client `service_role` reconstruit sans cookies, et **scellé** par l'option
   `accessToken` : l'espace `.auth` est inaccessible, aucune session ne peut
   plus lui être attachée après coup.
2. `error_code` ajouté au journal d'échec — c'est le code `42501` qui aurait
   nommé ce bug en dix secondes.
3. Test de non-régression de bout en bout en intégration continue : un parcours
   connecté réel vérifie que `auth.login` et `account.renamed` atteignent la
   table. Prouvé rouge sur le code non corrigé, vert après.
4. Garde-fou de frontière client/serveur vérifié en CI.

**À prendre** :

5. **Alerte sur échec d'écriture d'audit** (art. 32(1)(d)). Sans détection, la
   prochaine défaillance silencieuse durera aussi longtemps. C'est la mesure la
   plus importante de cette liste.
6. Planification de `purge_audit_log_older_than_12_months()`, jamais programmée —
   art. 5(1)(e).

## 7. Risque résiduel

Toute investigation de sécurité portant sur la période du **16 avril au 27
juillet 2026** ne peut pas s'appuyer sur `audit_log`. Les sources subsistantes
sont les journaux applicatifs Vercel (rétention limitée), les journaux Supabase,
et `user_consents` / `deletion_requests` pour les preuves de consentement et de
demande d'effacement.

---

**Établi par** @cc-ankora (Claude Opus 5), sur mesure directe en production, le
27 juillet 2026. À relire et contresigner par le responsable de traitement.
