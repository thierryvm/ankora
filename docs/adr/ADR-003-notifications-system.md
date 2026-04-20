# ADR-003 — Système de notifications : in-app first, email en Phase 2, Web Push en Phase 3

- **Statut** : Accepted
- **Date** : 2026-04-20
- **Accepté le** : 2026-04-20 par Thierry vanmeeteren
- **Deciders** : Thierry vanmeeteren (Product Owner), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `product`, `security`, `ux`, `gdpr`, `notifications`
- **Portée** : Phase 1 (MVP) = in-app ; Phase 2 = + email ; Phase 3 = + Web Push
- **En lien avec** :
  - [ADR-001](./ADR-001-no-psd2.md) — pas de dépendance tierce payante.
  - [ADR-002](./ADR-002-bucket-model.md) — une des sources d'événements
    critiques est la dérive d'invariance `Σ buckets ≠ solde compte`.

---

## Contexte & problème

Ankora a besoin d'alerter l'utilisateur dans plusieurs situations :

1. **Intégrité des données** — dérive d'invariance d'un compte (ADR-002),
   incohérence de provisioning, conflit de transaction.
2. **Lissage bidirectionnel** — une charge arrive à J-3, le bucket est prêt
   ou sous-provisionné, un transfert est recommandé.
3. **Objectifs budgétaires** — bucket `goal` atteint, bucket `buffer` en
   dessous du seuil minimum, échéance proche.
4. **Sécurité du compte** — connexion depuis un appareil inconnu,
   changement de mot de passe, révocation de session, tentatives suspectes.
5. **Synthèses périodiques** — récap hebdomadaire ou mensuel (digest).
6. **Phase 2 : pots partagés** — un membre a ajouté une dépense, un transfert
   requiert validation, un seuil est dépassé.

**Contraintes transverses** :

- **Budget 0 €** (ROADMAP) — aucune dépendance payante tant qu'Ankora n'a
  pas de revenus. Exit Twilio, SendGrid niveau payant, Pusher, OneSignal
  plans premium.
- **RGPD stricte** — les notifications contiennent potentiellement des
  données financières. Stockage minimal, rétention limitée, pas de PII
  dans les logs.
- **Hosting EU** — Supabase eu-west, Vercel Edge EU uniquement.
- **Projet vitrine** — un message perdu sur un événement critique (dérive
  d'invariance non alertée, par exemple) est inacceptable.
- **i18n 5 locales** — `fr-BE` (référence), `en`, `nl-BE`, `es-ES`, `de-DE`.
  Une notification rédigée en dur dans une langue casse l'expérience pour
  les 4 autres marchés.

**Ce qu'il faut trancher** :

1. **Quels canaux ?** In-app uniquement ? Email ? Web Push PWA ? SMS ?
2. **Quel modèle de données ?** Message stocké traduit, ou code + params
   traduits à la lecture ?
3. **Quels types d'événements ?** Enum fin ou catégorisation grossière ?
4. **Quelles préférences utilisateur ?** Tout personnalisable ou minimal
   (respect des critiques) ?
5. **Quelle rétention ?** Éphémère, 30j, 90j, archive complète ?
6. **Quelles garanties de delivery ?** At-least-once, at-most-once,
   idempotence ?

Ce choix conditionne le schéma DB, un service `notifications` côté domaine,
un worker / edge function pour l'émission, et les préférences utilisateur.

---

## Décision — drivers

Critères, classés par poids :

1. **Fiabilité sur les événements critiques** — un dérive d'invariance
   silencieuse est un échec produit majeur. Le système doit garantir qu'une
   notification `critical` arrive, est visible, et ne peut pas être
   supprimée accidentellement par l'utilisateur (seulement archivée).
2. **Budget 0 € strict** — aucun coût récurrent en Phase 1. Les canaux
   payants (SMS, emails via provider facturé) sont rejetés jusqu'à ce qu'un
   revenu soit là.
3. **Simplicité opérationnelle** — un seul canal bien fait (in-app) vaut
   mieux que 4 canaux à moitié fiables. On ajoute les canaux uniquement
   quand la Phase précédente est stable.
4. **RGPD — minimisation & rétention** — pas de PII évitable, rétention
   courte, purge automatique, pas de stockage redondant du message en
   5 langues.
5. **i18n native** — le système doit parler 5 langues sans réserver du
   code applicatif en dur. La traduction vit dans `messages/*.json`.
6. **Extensibilité Phase 2/3** — le schéma doit accueillir email puis Web
   Push sans refonte. Les préférences utilisateur doivent supporter un
   nouveau canal par ajout de clé, pas de colonne.
7. **Sécurité** — RLS Supabase stricte, pas de fuite cross-user,
   authentification SMTP sortante en Phase 2, VAPID sécurisé en Phase 3.

---

## Options considérées

### Option A — Provider SaaS complet (OneSignal, Knock, Courier)

**Description** : déléguer tout le stack (routing multi-canal, templates,
opt-in, logs) à un provider externe qui gère in-app + email + push + SMS.

| Critère             | Verdict                                                         |
| ------------------- | --------------------------------------------------------------- |
| Coût récurrent      | ❌ 20-100 €/mois minimum selon volume — incompatible budget 0 € |
| Dépendance tierce   | ❌ Vendor lock-in sur un composant central                      |
| Conformité RGPD     | ⚠️ Dépend du provider (hébergement, DPA, sous-traitants)        |
| Time-to-MVP         | ✅ Rapide — tout est prêt                                       |
| Flexibilité produit | ⚠️ Moyen — templates imposés, i18n parfois limité               |

### Option B — Tout in-house, dès Phase 1, sur tous canaux

**Description** : coder le système complet (in-app + email + push + SMS)
dès la Phase 1.

| Critère            | Verdict                                                      |
| ------------------ | ------------------------------------------------------------ |
| Coût récurrent     | ⚠️ 0 € si self-hosted, mais SMS toujours payant (rejeté)     |
| Time-to-MVP        | ❌ 6-10 semaines — incompatible avec le timing MVP           |
| Fiabilité initiale | ❌ Multi-canal non-rodé = bugs d'émission, boucles, doublons |
| Complexité opé     | ❌ 4 fois plus à maintenir dès le départ                     |

### Option C — Progressif : in-app (Phase 1) → + email (Phase 2) → + push (Phase 3)

**Description** : démarrer sur un seul canal 100 % fiable (in-app stocké
en DB), ajouter email transactionnel via SMTP custom quand la Phase 2
arrive, ajouter Web Push PWA en Phase 3.

| Critère             | Verdict                                                |
| ------------------- | ------------------------------------------------------ |
| Coût récurrent      | ✅ 0 € (in-app + SMTP ankora.be + VAPID tous gratuits) |
| Time-to-MVP         | ✅ Court — 1 canal solide, livrable en 1-2 semaines    |
| Fiabilité           | ✅ 1 canal rodé avant le suivant                       |
| Dépendances         | ✅ Aucune tierce payante                               |
| Flexibilité produit | ✅ Templates + i18n entièrement maîtrisés              |
| Complexité opé      | ✅ Progressive, matching les Phases                    |

---

## Décision

**Option C retenue**.

Phasage canaux :

- **Phase 1 (MVP)** : in-app uniquement. Table `notifications` Supabase,
  affichage dans un panel latéral, badge de non-lus, archivage.
- **Phase 2 (pots partagés + IA BYOK)** : + email transactionnel via
  **Brevo** (ex-Sendinblue, SAS française, hébergement EU, 300 mails/jour
  = 9000/mois gratuits), envoi depuis `no-reply@ankora.be`. Email
  **opt-in** pour tout sauf `critical` et `security` (opt-out).
  **Note** : Vercel ne fournit pas de SMTP natif ; leur Marketplace
  propose Resend en alternative (3000/mois gratuits, DX Next.js
  supérieure mais hébergement US via AWS). Brevo est retenu pour la
  conformité EU-first du projet vitrine. Resend reste documenté comme
  fallback si Brevo devient restrictif.
- **Phase 3 (post-revenus)** : + Web Push PWA (VAPID self-hosted,
  gratuit). Toujours opt-in. iOS < 16.4 fallback silencieux sur in-app.

**SMS rejeté définitivement** — coût récurrent + surface réglementaire
(consent GDPR + PECR) + aucune valeur vs in-app + email pour ce produit.

### Traduction concrète — modèle de données

**Table `notifications`** :

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- Type = sévérité / canal de rendu visuel
  type text not null check (type in (
    'critical','warning','info','success','security','digest'
  )),
  -- Code événement : routing + i18n. Ex : 'bucket.invariance_drift',
  -- 'charge.due_soon', 'auth.new_device_login', 'goal.reached'
  event_code text not null check (char_length(event_code) between 3 and 80),
  -- Params nécessaires au rendu i18n (ex : {bucket_label, delta_amount}).
  -- JAMAIS de PII brute (pas d'email, pas de full name hors strict besoin).
  params jsonb not null default '{}'::jsonb,
  -- Lien optionnel vers l'entité concernée, pour deeplink dans l'UI.
  entity_type text check (entity_type in (
    'bucket','charge','expense','account','workspace_member','session'
  )),
  entity_id uuid,
  -- États
  read_at timestamptz,
  archived_at timestamptz,
  -- Critical = non supprimable par l'utilisateur (archivage seulement)
  is_critical boolean generated always as (type in ('critical','security')) stored,
  -- Timing delivery
  created_at timestamptz not null default now(),
  delivered_in_app_at timestamptz not null default now(),
  delivered_email_at timestamptz,      -- Phase 2
  delivered_push_at timestamptz,       -- Phase 3
  -- Dédoublonnage idempotent (ex : si le worker retrigger)
  dedupe_key text unique
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null and archived_at is null;

create index notifications_workspace_idx
  on public.notifications (workspace_id, created_at desc);
```

**RLS** :

```sql
alter table public.notifications enable row level security;
alter table public.notifications force  row level security;

create policy "notifications_select_own" on public.notifications
  for select using (user_id = (select auth.uid()));

create policy "notifications_update_own" on public.notifications
  for update using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    -- Jamais écrire autre chose que read_at / archived_at côté client
    and (archived_at is null or is_critical = false or archived_at is not null)
  );

-- Pas de policy INSERT côté client : seules les fonctions SECURITY DEFINER
-- (émetteurs de notifications) peuvent insérer.
-- Pas de policy DELETE : archivage uniquement (audit + RGPD via purge job).
```

**Table `notification_preferences`** :

```sql
create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  -- JSONB pour ajout de canal sans migration de schéma.
  -- Forme : { "in_app": {"info": true, "digest": false, ...},
  --           "email":  {"info": true, "digest": true,  ...}, (Phase 2)
  --           "push":   {"info": false, ...} (Phase 3) }
  channels jsonb not null default
    '{"in_app":{"critical":true,"security":true,"warning":true,"info":true,"success":true,"digest":true}}'::jsonb,
  digest_frequency text not null default 'weekly'
    check (digest_frequency in ('off','daily','weekly','monthly')),
  quiet_hours_start time,            -- Phase 2 (email) — ex : 22:00
  quiet_hours_end time,              -- Phase 2 (email) — ex : 07:00
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force  row level security;

create policy "notif_prefs_own_select" on public.notification_preferences
  for select using (user_id = (select auth.uid()));

create policy "notif_prefs_own_update" on public.notification_preferences
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
```

**Garde-fou invariant : `critical` et `security` ne sont JAMAIS masquables**.
Ce contrôle est fait côté domaine + côté UI (option grisée dans l'écran
préférences).

### Événements Phase 1 (catalogue initial)

| `event_code`                   | `type`   | Déclencheur                                |
| ------------------------------ | -------- | ------------------------------------------ |
| `bucket.invariance_drift`      | critical | Σ buckets ≠ solde compte (job horaire)     |
| `bucket.goal_reached`          | success  | Bucket `goal` atteint sa cible             |
| `bucket.buffer_low`            | warning  | Bucket `buffer` < 50 % du seuil défini     |
| `bucket.smoothing_underfunded` | warning  | Un bucket `smoothing` < provision cible    |
| `charge.due_soon`              | info     | J-3 avant échéance d'une charge            |
| `charge.overdue`               | warning  | Charge non marquée payée 2j après échéance |
| `auth.new_device_login`        | security | Login depuis user-agent / IP inconnue      |
| `auth.password_changed`        | security | Changement de mot de passe                 |
| `auth.session_revoked`         | security | Session terminée côté serveur              |
| `workspace.weekly_digest`      | digest   | Récap hebdo (activé par préférence)        |

**Extension Phase 2** : `shared_pot.*` (join, leave, deposit, threshold).

### Rendu i18n

Les messages sont traduits à **la lecture**, pas à l'écriture :

```ts
// Pseudocode — hook côté UI
function renderNotification(n: Notification, t: IntlTranslator) {
  return {
    title: t(`notifications.${n.eventCode}.title`, n.params),
    body: t(`notifications.${n.eventCode}.body`, n.params),
    cta: t(`notifications.${n.eventCode}.cta`, n.params),
  };
}
```

**Avantages** :

1. L'utilisateur change de locale → les notifs existantes suivent.
2. Un typo dans une traduction est corrigeable par PR sans migration DB.
3. Minimisation RGPD : on stocke le minimum (code + params), pas 5 copies
   pré-rendues.
4. Compatible avec le glossaire i18n (`docs/i18n/GLOSSARY.md`, livré par
   PR-2b).

**Contrainte** : chaque `event_code` doit avoir ses clés dans les 5
`messages/*.json`. Un test de parité `tests/i18n/notifications-parity.test.ts`
vérifie qu'aucun code n'est orphelin dans une locale.

### Delivery & idempotence

- **At-least-once pour `critical` et `security`** via `dedupe_key` unique.
  Si le worker retry, l'insertion échoue sur la contrainte d'unicité —
  pas de doublon. Lecture idempotente côté UI.
- **At-most-once pour `info`, `success`, `digest`** — si perte, c'est
  acceptable. Pas de dedupe_key obligatoire.
- **Email (Phase 2)** : table `notification_deliveries` séparée pour
  audit, retry exponentiel, quotas SMTP.
- **Web Push (Phase 3)** : endpoint VAPID par appareil, sessions révoquées
  automatiquement après 30j d'inactivité.

### Rétention RGPD

| Type                     | Rétention                                   |
| ------------------------ | ------------------------------------------- |
| Notification lue         | 90 jours après `read_at`                    |
| Notification non lue     | 180 jours après `created_at`                |
| Notification archivée    | 365 jours après `archived_at` (audit léger) |
| `security` (auth events) | 365 jours fixes (exigence traçabilité)      |

Purge via un job mensuel edge function Supabase (cron Supabase Vault).
L'utilisateur peut exporter ses notifications via la feature
`export-my-data` (RGPD art. 20 — portabilité).

### Préférences — contraintes d'interface

Dans l'écran **Préférences → Notifications** :

- Les switches pour `critical` et `security` sont **affichés mais
  désactivés** (grisés) avec un tooltip : _« Ces alertes garantissent la
  sûreté de ton compte et l'intégrité de tes données. Elles ne peuvent
  pas être désactivées. »_
- Les autres types sont switchables par canal (in-app Phase 1, + email
  Phase 2, + push Phase 3).
- `digest_frequency` : un select `off / daily / weekly / monthly`.
- `quiet_hours` : uniquement pour les canaux push et email (pas in-app —
  l'in-app est passif).

### Sécurité — check-list défensive

- **Pas de PII dans `params`** — jamais d'email, de nom complet ou de
  numéro de compte. Utiliser des références (`bucket_id`, `charge_id`)
  rendues côté UI via jointure autorisée par RLS.
- **Rate limit** par utilisateur côté insertion (max 50 notifications /
  heure) — évite qu'un bug applicatif spam l'utilisateur.
- **CSP nonce** sur le panel notifications (déjà actif globalement).
- **SMTP Phase 2** : DKIM + SPF + DMARC sur `ankora.be`, from
  `no-reply@ankora.be`, reverse DNS cohérent.
- **VAPID Phase 3** : rotation de la clé privée annuelle, stockage dans
  Supabase Vault, jamais exposée côté client.
- **Logs** : les notifications émises sont loggées sans `params` (juste
  `user_id`, `event_code`, `created_at`) pour l'audit.

---

## Conséquences

### Positives

- **Budget 0 € respecté** sur toute la trajectoire Phase 1 → Phase 3.
- **Fiabilité maximale** sur les événements critiques — la table DB est
  la source de vérité, le worker peut retrier sans doublon.
- **RGPD-safe** — minimisation (code + params, pas de string traduite
  stockée), rétention limitée, purge automatique, portabilité.
- **i18n native** — traduction à la lecture, suit les préférences
  utilisateur, cohérente avec le reste de l'app.
- **Extensibilité Phase 2/3** — ajouter un canal = ajouter une clé dans
  `notification_preferences.channels` JSONB + un worker, pas de schéma.
- **UX mature** — préférences granulaires, `quiet_hours`, digest, tout
  ce qu'un utilisateur avisé attend d'un produit vitrine.
- **Cohérence contrats** — l'invariant ADR-002 `Σ buckets = solde` est
  directement observable via une notification `critical` déclenchée par
  le job horaire.

### Négatives

- **Phase 1 = in-app only** — un utilisateur qui ferme son navigateur ne
  voit pas un `bucket.invariance_drift` tant qu'il ne revient pas. Mitigation :
  acceptable pour MVP, le digest Phase 2 par email couvre le cas.
- **Phase 2 dépend de SMTP custom** — si la config DKIM/SPF/DMARC échoue,
  les emails tombent en spam. Mitigation : tests MX Toolbox + mail-tester
  avant go-live, provider de backup si besoin.
- **Phase 3 dépend de Web Push** — iOS < 16.4 non supporté, Safari macOS
  capricieux. Mitigation : toujours opt-in, fallback silencieux sur in-app.
- **Pas de SMS** — un utilisateur qui veut absolument un SMS pour une
  échéance critique ne sera pas satisfait. Assumé.
- **i18n à la lecture** — un bug dans `messages/*.json` rend une notif
  illisible. Mitigation : test de parité CI, clé manquante = fallback
  sur `fr-BE` et warning console.

### Risques résiduels

- **Worker d'émission silencieusement down** — aucune notification émise,
  l'utilisateur ne voit pas qu'il ne voit rien. Mitigation : heartbeat
  log horaire, alerting Supabase Status, endpoint `/api/health/notifications`.
- **Storage DB qui grossit** — à 100k users × 30 notifs / mois ×
  12 mois = 36M lignes. Mitigation : purge stricte + partitionnement par
  année en Phase 3 si volume réel le justifie.
- **Clef VAPID fuitée** (Phase 3) — attaque push sur les appareils
  enregistrés. Mitigation : rotation annuelle + révocation immédiate +
  monitoring d'anomalies.

---

## Conformité & contraintes croisées

| Contrainte                  | Respect de cette décision                                  |
| --------------------------- | ---------------------------------------------------------- |
| Budget 0 € (ROADMAP)        | ✅ Aucun coût récurrent avant Phase 3 (même en Phase 3)    |
| Hosting EU                  | ✅ Supabase eu-west, SMTP EU, VAPID self-hosted            |
| RGPD art. 5 (minimisation)  | ✅ Code + params, pas de string pré-rendue                 |
| RGPD art. 5.1.e (rétention) | ✅ 90/180/365 j selon contexte, purge auto                 |
| RGPD art. 20 (portabilité)  | ✅ Export via feature `export-my-data`                     |
| RGPD art. 32 (sécurité)     | ✅ RLS stricte, rate-limit, logs sans PII                  |
| ADR-001 (no-PSD2)           | ✅ Aucune ingestion bancaire déclenchée                    |
| ADR-002 (buckets)           | ✅ `bucket.invariance_drift` = canal d'alerte des dérives  |
| i18n 5 locales              | ✅ Rendu à la lecture, test de parité                      |
| CSP nonce + strict-dynamic  | ✅ Rien d'inline injecté dans le panel notifs              |
| Accessibilité WCAG 2.1 AA   | ✅ Panel notifs focus-trappable, live-region screen reader |

---

## Alternatives explicitement **non** retenues

- **Provider SaaS multi-canal (OneSignal, Knock, Courier)** — coût
  récurrent + dépendance tierce + RGPD à auditer par provider.
- **SMS (Twilio, Mailjet SMS)** — payant, coût variable, pas de valeur
  vs in-app + email + push.
- **Supabase Realtime pour le push** (WebSocket direct au client) — non
  viable pour un utilisateur offline. Utile en complément pour le
  _live refresh_ d'un panel ouvert, mais pas comme canal de delivery.
- **Slack / Discord / Telegram integrations** — hors-scope produit
  grand public. Reconsidérer si besoin B2B en Phase 3.
- **Stockage message pré-rendu en 5 langues** — multiplie par 5 la
  taille de la table, casse la RGPD-minimisation, rigidifie l'édito.

---

## Révision

Cet ADR sera réévalué si :

1. Un événement critique est détecté non-livré en production (→ revoir
   garanties at-least-once et monitoring).
2. Les utilisateurs demandent massivement du SMS (→ réévaluer avec un
   provider low-cost type OVH SMS ou AWS SNS via plan payant).
3. Une contrainte RGPD plus stricte émerge (ex : DPA exigeant une
   rétention < 30j pour certains contextes).
4. Un provider SaaS (Knock, Courier) devient gratuit au niveau usage
   d'Ankora → réévaluer le build-vs-buy.

Tant que ces conditions ne sont pas réunies, la décision tient.

---

## Liens & références

- [ADR-001 — No-PSD2](./ADR-001-no-psd2.md) — cadre budget 0 €, dépendances.
- [ADR-002 — Bucket model](./ADR-002-bucket-model.md) — source de
  l'événement `bucket.invariance_drift`.
- [ROADMAP.md](../ROADMAP.md) — phasage canaux aligné sur Phases 1/2/3.
- [ARCHITECTURE.md](../ARCHITECTURE.md) — couches, RLS, CSP.
- `prompts/PR-2-glossary-and-strategy.md` §2 (ton par marché) + §3 (glossaire) —
  guide pour rédiger les `notifications.*.title/body/cta`.
- `docs/i18n/GLOSSARY.md` (livré par PR-2b) — source opérationnelle des
  traductions.
- RGPD : Règlement (UE) 2016/679, articles 5, 20, 32.
- Directive (UE) 2002/58 (PECR / ePrivacy) — base légale du consentement
  pour les notifications marketing (non applicable aux critiques).
- VAPID : RFC 8292 (authenticated web push).

---

**Décision acceptée le 2026-04-20.** Toute modification requiert un ADR de supersession (ADR-NNN) qui documente la bascule.
