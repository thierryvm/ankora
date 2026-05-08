# ADR-016 — Tracking paiements multi-sources (Option 2+3 hybride)

- **Statut** : Proposed
- **Date** : 2026-05-08
- **Proposé par** : Cowork-Opus (Architecture)
- **Validé partiellement** : 2026-05-08 par @thierry (challenges A/B/C explicites validés en chat) + délégation D-H à @cowork
- **Deciders** : Thierry vanmeeteren (Product Owner — délégation), Cowork-Opus (Architecture)
- **Tags** : `architecture`, `domain`, `ux`, `differenciation`, `onboarding`, `belgium`
- **Portée** : Phase 2 (MVP user N°1) et au-delà
- **Lié à** : ADR-001 (no-PSD2), ADR-002 (bucket-model), ADR-009 (capacité d'épargne), ADR-011 (santé provisions), ADR-012 (assistant virements), future PR-D5 (onboarding + édition mouvements)

---

## Contexte & problème

ADR-001 a verrouillé le « no-PSD2 » : Ankora n'agrège pas les comptes bancaires automatiquement. ADR-011 décrit déjà le calcul de la santé des provisions à partir d'une `Map<chargeId-year-month, boolean>` de paiements. Mais **aucun ADR ne formalise comment l'utilisateur déclare ses charges récurrentes ni comment il marque qu'une transaction est payée**.

Trois questions opérationnelles restent ouvertes :

1. **Comment Ankora sait qu'une transaction est « Payée » sans accès bancaire ?**
2. **Comment limiter la friction d'onboarding** (déclarer 10-20 charges à la main = 5 minutes, perte ~60% des signups d'après benchmarks fintech consumer) ?
3. **Comment éviter qu'un prélèvement échoué (insufficient funds, banque bloque) soit présumé payé à tort** par un cron J+1 trop optimiste ?

La table Coda d'@thierry (partagée 2026-05-07, fichier `DB_Depenses` 20 lignes) confirme empiriquement le pattern UX cible : catalogue de charges récurrentes pré-déclaré + toggle « Payé » manuel synchronisé avec le relevé bancaire. C'est le workflow réel d'un utilisateur belge non-financier qui gère ses comptes proprement, sans agrégation automatique.

Cet ADR formalise le modèle complet de tracking paiements pour V1.0 publique.

---

## Décision — drivers

Quatre objectifs en tension :

1. **Honnêteté** : Ankora ne ment pas sur l'état d'un paiement. Pas de simulation magique.
2. **Bas coût cognitif** : déclarer une charge récurrente = une fois ; après, le moins d'actions possible.
3. **Sécurité** : présomption automatique acceptable seulement si l'utilisateur garde le contrôle.
4. **Différenciation Belgique** : catalogue pré-rempli avec les fournisseurs locaux courants, lissage automatique trimestriel + annuel, micro-copy FSMA-safe.

---

## Décision adoptée

**Adopter Option 2 + Option 3 hybride** :

- **Option 2 (par défaut)** : récurrents pré-déclarés en onboarding + saisies ponctuelles manuelles + présomption automatique J+3 désactivable.
- **Option 3 (optionnelle, power users)** : import CSV depuis tableur ou banque pour fiabilisation périodique.

### 1. Data model

#### Table `recurring_templates`

```
recurring_templates
  id                    uuid PK
  workspace_id          uuid FK → workspaces ON DELETE CASCADE
  category_id           uuid FK → categories ON DELETE SET NULL (fallback "Autres")
  account_id            uuid FK → accounts ON DELETE RESTRICT
  label                 text NOT NULL
  amount                numeric(12,2) NOT NULL
  frequency             enum ('mensuelle','bimensuelle','trimestrielle','semestrielle','annuelle')
  payment_day_type      enum ('fixed_day','end_of_business_month','bimonthly_split')
  payment_day           int CHECK (payment_day BETWEEN 1 AND 31) NULL
  payment_months        int[] NOT NULL DEFAULT '{}' -- 1-12, multi-mois pour trim/sem/ann
  next_occurrence_date  date GENERATED -- calculé par cron
  active                boolean DEFAULT true
  imported_from         text NULL -- 'coda' | 'notion' | 'excel' | 'sheets' | 'airtable' | 'manual' | 'belgian_catalog'
  created_at            timestamptz DEFAULT now()
  updated_at            timestamptz DEFAULT now()
```

RLS : workspace-scoped via `workspace_members`.

#### Table `transactions`

```
transactions
  id                       uuid PK
  workspace_id             uuid FK → workspaces ON DELETE CASCADE
  account_id               uuid FK → accounts ON DELETE RESTRICT
  category_id              uuid FK → categories ON DELETE SET NULL
  recurring_template_id    uuid FK → recurring_templates ON DELETE SET NULL NULL
  label                    text NOT NULL
  amount                   numeric(12,2) NOT NULL -- signé, négatif = sortie
  date_planned             date NULL -- échéance prévue (récurrent ou anticipation)
  date_realized            date NULL -- date effective du paiement
  status                   enum ('pending','presumed_paid','paid','to_complete','cancelled')
  is_manual_entry          boolean DEFAULT false
  notes                    text NULL
  edit_history             jsonb DEFAULT '[]' -- log [{timestamp, field, before, after}]
  created_at               timestamptz DEFAULT now()
  updated_at               timestamptz DEFAULT now()
```

RLS : workspace-scoped.

#### Status enum — sémantique

| Status          | Sens                                                           | Inclus dans Reste disponible |
| --------------- | -------------------------------------------------------------- | ---------------------------- |
| `pending`       | À venir (récurrent généré, non encore traité)                  | Oui (sortie anticipée)       |
| `presumed_paid` | Présumé payé par le cron J+3 (à confirmer ou corriger)         | Oui (déjà compté)            |
| `paid`          | Confirmé par l'utilisateur (toggle manuel ou import CSV match) | Oui                          |
| `to_complete`   | Saisie incomplète : montant ou catégorie manquant              | **Non** — bloque le calcul   |
| `cancelled`     | Annulé (échec prélèvement confirmé, doublon, erreur de saisie) | Non                          |

### 2. Génération automatique des instances récurrentes

Cron quotidien `tick_recurring_templates` (Supabase Edge Function ou pg_cron) :

```
Pour chaque recurring_template actif :
  Si next_occurrence_date <= today + 7 jours
     ET aucune transaction(recurring_template_id, date_planned) existe déjà :
       INSERT transaction { status: 'pending', date_planned: next_occurrence_date, ... }
       UPDATE recurring_template.next_occurrence_date = compute_next(frequency, payment_day_type, ...)

  Si transaction(status='pending', date_planned + 3 jours <= today) :
     UPDATE transaction.status = 'presumed_paid'
     UPDATE transaction.date_realized = date_planned (par défaut)
     INSERT audit_log { event: 'transaction.presumed_paid', source: 'cron', user_id: workspace_owner }
```

### 3. Strict mode (opt-in Settings)

`workspace_settings.strict_payment_mode boolean DEFAULT false`.

Si `strict_payment_mode = true` :

- Le cron NE bascule PAS automatiquement `pending → presumed_paid`.
- Une transaction reste `pending` jusqu'à action explicite de l'utilisateur (toggle « Marquer payé » ou import CSV match).
- Notification proactive J+5 : « 5 paiements en attente — vérifie sur ton relevé bancaire et confirme ».

### 4. Notification in-app mensuelle

V1 = **in-app uniquement** (budget 0 € — pas de Resend/Postmark) :

- Badge persistant header : « 5 paiements à confirmer ».
- Compteur sur PWA icon (badge API navigateur où supporté).
- Drawer batch « Confirmer tous les paiements présumés » : 1-tap par item ou « Tout confirmer » global.
- Audit log de chaque confirmation/correction (timestamp, source, before/after).

V1.1 (post-MRR > 0) : email mensuel récap via Resend ou Postmark.

### 5. Catalogue belge pré-rempli (onboarding)

Liste verrouillée pour PR-D5 onboarding step 2 « Quelles sont tes charges récurrentes ? » — l'utilisateur tap pour activer, montant pré-rempli si standard, sinon édité :

| Catégorie            | Fournisseurs proposés                               |
| -------------------- | --------------------------------------------------- |
| Mutuelles            | Solidaris, Partenamut, CM, Helan                    |
| Banques              | Belfius, BNPP Fortis, KBC, ING, Argenta             |
| Streaming            | Netflix, Disney+, Spotify, Apple One, Voo Streaming |
| Telco                | Voo, Orange, Proximus, Telenet, Mobile Vikings      |
| Énergie              | Engie, Luminus, Lampiris, Eneco, Mega               |
| Assurances           | AG, Ethias, AXA, P&V                                |
| Abonnements digitaux | Dashlane, 1Password, iCloud, Google One             |

Onboarding cible : ≤ 60 secondes pour les utilisateurs qui activent ≥ 5 charges du catalogue.

### 6. Import CSV multi-sources (Option 3)

5 sources supportées en V1 :

| Source        | Format export           | Notes                                                                    |
| ------------- | ----------------------- | ------------------------------------------------------------------------ |
| Coda          | CSV natif               | Ligne 1 = headers ; pattern verbatim de DB_Depenses Thierry              |
| Notion        | ZIP de CSV              | Auto-détecte le CSV racine le plus volumineux ; ignore rollups/linked DB |
| Excel         | CSV via Save As         | Charset UTF-8 ou ISO-8859-1 auto-détecté                                 |
| Google Sheets | CSV via File → Download | Standard CSV RFC 4180                                                    |
| Airtable      | CSV natif               | Headers en première ligne                                                |

**Mapping de colonnes guidé** :

```
Name | Libellé        → label
Catégorie            → category_id (fuzzy match avec catalogue Ankora ; fallback "Autres")
Fréquence            → frequency enum (mapping FR/EN : Mensuelle/Monthly → mensuelle, etc.)
Montant              → amount Decimal (parsing virgule/point décimal ambigu)
```

**Ce qu'on N'IMPORTE PAS** : les transactions individuelles (toggle « Payé » Coda, dates de paiement passées). Seul le **catalogue récurrents** est importé. L'historique passé reste dans le tableur source en archive.

### 7. Sécurité CSV injection (OWASP)

Sanitization stricte au parse, côté serveur :

- **Strip toute cellule** commençant par `=`, `+`, `-`, `@`, `'`, `tab` (vecteur formula injection Excel/Sheets).
- **Limites** : 10 MB max / 1000 rows max / 30s timeout parser.
- **ZIP** (Notion) : reject si > 50 MB ou > 100 fichiers.
- **MIME type validation** côté serveur via `file-type` lib (pas seulement extension).
- **Charset** : auto-détection UTF-8/ISO-8859-1 ; fallback UTF-8 si ambigu.
- **Audit log** de chaque import (source, taille, nb_rows_parsed, nb_rows_rejected).

### 8. Edge cases fréquence

| `payment_day_type`      | Sémantique                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixed_day`             | Jour fixe (`payment_day` 1-31). Si > nb jours du mois (ex: 31 février) → dernier jour du mois.                                                                 |
| `end_of_business_month` | Dernier jour ouvrable du mois (Belgique : skip samedi/dimanche/jours fériés Belgique). Mutuelles courantes.                                                    |
| `bimonthly_split`       | 2 occurrences par mois aux jours `payment_day` (ex: 15) et `payment_day + 15` (ex: 30, ou dernier jour si mois plus court). Salaires belges, certains crédits. |

**Hors scope V1** : date glissante weekend (si jour fixe tombe samedi/dimanche → vendredi précédent). À documenter post-V1.

### 9. Mobile UX (tap-drawer 3 actions)

Sur ligne de transaction (Bloc 8 Activité récente du dashboard ou liste Charges) :

- **Tap** sur la ligne → drawer light (mobile bottom sheet, desktop side drawer) avec 3 actions principales :
  1. **Marquer payé** (toggle direct, repaint la ligne en vert clair pattern Coda).
  2. **Modifier** (ouvre `TransactionDrawer` éditeur complet : date, libellé, montant, catégorie, statut, notes).
  3. **Supprimer** (soft delete avec confirmation modal ; status devient `cancelled` ; rollback 24h via audit log).
- **« Compléter »** = cas spécial du Modifier drawer : si la transaction est `to_complete`, le champ `amount` est en rouge avec message « Montant manquant, complète-le pour réintégrer cette charge dans ton Reste disponible ».
- **Pas de swipe** : pattern ambigu pour les actions destructives ; fat-finger risk élevé.

### 10. Pattern visuel toggle « Payé » (référence Coda Thierry)

- Toggle ON → ligne entière repainte en `--color-success-50` background + `--color-success-700` foreground accent (vert clair).
- Toggle OFF → ligne en background neutre (default).
- Strikethrough sur le montant si payé (pattern noté du Canvas Thierry 2026-05-07).
- Tag « PAYÉ » vert en pill à droite si statut `paid` ou `presumed_paid`.
- Tag « PRÉSUMÉ » amber pour `presumed_paid` (différenciation visuelle critique pour Strict mode opt-in).
- Tag « À COMPLÉTER » orange pour `to_complete`.
- Tag « ANNULÉ » gris pour `cancelled` + barré.

### 11. Killer feature onboarding — Import CSV

Argument marketing landing v1.0 : **« Tu as déjà ton tableur ? Ankora le mange en 30 secondes. »**

UX onboarding alternatif (étape 2 si import) :

1. Drag & drop fichier OU bouton « Importer depuis Coda / Notion / Excel / Google Sheets / Airtable ».
2. Server parse + détection structure.
3. Modal mapping de colonnes (auto-pré-rempli, l'utilisateur valide ou ajuste).
4. Preview des 20 premières lignes mappées.
5. Confirmation → INSERT batch dans `recurring_templates` avec `imported_from = 'coda'` (ou autre).

Time to onboarded (cible) : ≤ 30 secondes pour un utilisateur Coda/Notion/Excel.

---

## Conséquences positives

- ✅ **Différenciation Belgique** : catalogue pré-rempli avec mutuelles + banques + telco + énergie locales. Aucun concurrent (Mint/Monarch/YNAB) ne fait ça.
- ✅ **Lissage automatique trimestriel/annuel** : la table Coda Thierry montre `0 € ce mois` pour les annuelles non échues — Ankora les provisionne mensuellement (cf. ADR-002 + ADR-011).
- ✅ **Bas coût cognitif** : import CSV résout 90% du problème onboarding pour les utilisateurs ayant un tableur existant ; catalogue belge résout les autres.
- ✅ **Honnêteté** : status `presumed_paid` distinct de `paid`, l'utilisateur sait exactement où il en est.
- ✅ **Sécurité** : Strict mode opt-in pour les profils prudents, sanitize CSV OWASP, audit log toutes les présomptions.
- ✅ **Mobile-first cohérent** : tap-drawer 3 actions, pas de swipe ambigu, pattern iOS/Android natif.
- ✅ **Pédagogique FSMA-safe** : aucun message « nous recommandons », tout reste constat factuel + suggestion d'action utilisateur.

## Conséquences négatives

- ❌ **Dépendance manuelle persistante** : sans PSD2, l'utilisateur doit toujours marquer ses paiements (au mieux 1 fois par mois en batch). Mitigation : présomption J+3 pour 80% des cas, batch UI 1-tap par item, et import CSV mensuel pour les power users.
- ❌ **Risque présomption à tort** : prélèvement échoué = présumé payé (audit log permet rollback mais l'utilisateur peut être surpris). Mitigation : Strict mode + notif J+5 « vérifie ton relevé ».
- ❌ **Complexité parser CSV multi-sources** : 5 formats, mapping fuzzy, sanitize strict. Mitigation : tests Vitest exhaustifs (≥ 30 cas) + sample fixtures par source.
- ❌ **Catalogue belge à maintenir** : si Solidaris fusionne avec Helan ou si un nouveau telco apparaît, la liste doit suivre. Mitigation : table `belgian_catalog_providers` versionnée en migration, mise à jour trimestrielle manuelle.
- ❌ **Notif in-app uniquement V1** : un utilisateur qui n'ouvre pas l'app pendant 1 mois rate les confirmations. Mitigation : email V1.1 quand budget le permet ; en attendant, push notif PWA gratuit là où supporté.

---

## Alternatives évaluées

### Alternative 1 — Saisie manuelle 100% (Option 1 du brainstorm)

L'utilisateur saisit chaque transaction et marque chaque paiement à la main.

**Rejetée** : coût cognitif énorme. Décrochage attendu ~3 semaines. Élimine les ponctuels mais le récurrent doit être automatisé.

### Alternative 2 — Présomption J+1 sans Strict mode

Présumer payé dès le lendemain de l'échéance prévue, pas de mode strict.

**Rejetée** : risque trop élevé pour les prélèvements échoués (insufficient funds, banque bloque). 24h trop court pour que l'utilisateur ait visibilité sur son relevé. J+3 est un meilleur compromis ; Strict mode pour les profils prudents.

### Alternative 3 — Présomption J+7

Étendre à une semaine pour réduire les faux positifs.

**Rejetée** : trop long. Pendant 7 jours, le statut reste flou. J+3 = sweet spot (le prélèvement effectif tombe en général dans les 48h post-échéance bancaire belge).

### Alternative 4 — Photo ticket + OCR (Option 4 du brainstorm)

OCR sur ticket Carrefour pour catégorisation automatique.

**Rejetée pour V1** : coût LLM inference incompatible budget 0 €. À reconsidérer V2 quand revenus.

### Alternative 5 — PSD2 / Open Banking

Agrégation bancaire automatique via API PSD2.

**Rejetée** : verrouillé par ADR-001 (FSMA + complexité conformité + coût licence agrégateur).

### Alternative 6 — Email notification V1

Resend / Postmark pour rappel mensuel.

**Rejetée pour V1** : viole budget 0 €. Resend free tier = 3 000 emails/mois mais limité à un seul domaine vérifié. Acceptable post-MRR > 0. V1.1.

---

## Plan d'implémentation

### PR-D5 (onboarding + édition mouvements)

1. **Migrations Supabase** :
   - `recurring_templates` table + RLS workspace-scoped + GENERATED `next_occurrence_date`
   - `transactions` table + RLS + status enum + `edit_history` JSONB
   - `belgian_catalog_providers` seed (28 fournisseurs initiaux)
   - `workspace_settings.strict_payment_mode boolean DEFAULT false`
2. **Domain pur** (`src/lib/domain/transactions/`) :
   - `computeNextOccurrence(template, today)` avec edge cases fréquence
   - `presumePaymentIfDue(transaction, today, gracePeriodDays = 3)` — déterministe pure
   - Tests Vitest ≥ 40 cas couvrant fréquences, edge cases, Strict mode
3. **Server Actions** :
   - `createRecurringTemplate(input)` avec Zod parse + audit log
   - `updateTransactionStatus(id, status)` avec edit_history append
   - `importFromCsv(file, source)` avec sanitization OWASP + parser dispatch
4. **Cron Edge Function** `tick_recurring_templates` :
   - Schedule `0 6 * * *` (06:00 UTC quotidien)
   - Genère instances `pending` à J-7
   - Bascule `pending → presumed_paid` à J+3 (sauf Strict mode)
5. **UI** :
   - Onboarding step 2 « Charges récurrentes » (catalogue belge + import CSV)
   - `TransactionDrawer` éditeur (réutilise pattern EditDrawer Surface 2/4)
   - `BatchConfirmDrawer` pour notif mensuelle
   - Pattern toggle « Payé » + ligne verte (référence Coda Thierry)
6. **i18n** : ~25 nouvelles clés `messages/{fr-BE,en}.json`
7. **Tests E2E Playwright** : import CSV Coda, onboarding catalogue, toggle paiement, Strict mode
8. **Agents QA** : `financial-formula-validator`, `rls-flow-tester`, `security-auditor` (CSV sanitize), `i18n-auditor`, `mobile-ios-auditor`

### Sécurité — checklist

- [ ] Sanitize CSV cells starting with `= + - @ ' tab`
- [ ] Limites parser : 10 MB / 1000 rows / 30s timeout
- [ ] ZIP scan : reject > 50 MB ou > 100 fichiers
- [ ] MIME validation server-side via `file-type` lib
- [ ] Charset auto-detection UTF-8/ISO-8859-1
- [ ] Audit log toutes les imports + toutes les présomptions cron
- [ ] RLS workspace-scoped sur toutes les nouvelles tables
- [ ] Rate limit `importFromCsv` : 5 imports / 15 min / IP

---

## Risques

- **Risque 1 — Cron `tick_recurring_templates` qui faillit silencieusement** : si l'Edge Function plante, les présomptions ne tombent pas, statut reste `pending` indéfiniment. Mitigation : healthcheck endpoint + Sentry alert + dashboard admin "Last cron success".
- **Risque 2 — CSV avec encoding pourri** : caractères belges (é, à, ç) cassés. Mitigation : fallback UTF-8 + warning UI à l'import.
- **Risque 3 — Catalogue belge obsolète** : Solidaris a fusionné en 2025 avec Mutualité Socialiste, certains telco changent de nom. Mitigation : revue trimestrielle manuelle, alias `provider_aliases` table pour historique.
- **Risque 4 — Race condition cron + import CSV simultanés** : un import peut créer un doublon avec une instance générée par le cron au même moment. Mitigation : clé unique `(recurring_template_id, date_planned)` sur `transactions`.
- **Risque 5 — Présomption à tort détectée tardivement** : utilisateur réalise après 2 mois que la transaction n'a jamais eu lieu. Mitigation : audit log permet rollback ; notif J+5 réduit drastiquement le risque ; Strict mode pour profils sensibles.

---

## Métriques de succès

À mesurer 4 semaines post-PR-D5 :

- **Time-to-first-charge-declared** : médiane du délai entre signup et 1ère charge récurrente créée. Cible : ≤ 60 secondes pour les utilisateurs qui passent par le catalogue belge ; ≤ 30 secondes pour ceux qui importent un CSV.
- **Taux d'utilisateurs avec ≥ 5 charges récurrentes après onboarding** : Cible ≥ 70 % (signal que le catalogue + import couvrent les besoins courants).
- **Taux de Strict mode opt-in** : % de workspaces qui activent `strict_payment_mode = true`. Cible 10-25 % (niche profils prudents).
- **Taux de présomption corrigée** : % de transactions `presumed_paid` qui sont ensuite annulées par l'utilisateur. Cible ≤ 5 % (signal que J+3 + sanity bancaire belge fonctionne).
- **NPS sur la question « Comprends-tu pourquoi telle charge est marquée présumée payée ? »** : Cible ≥ 80 %.
- **Taux d'import CSV** parmi les nouveaux signups : Cible ≥ 30 % (signal que la killer feature attire la cible Coda/Notion users).

---

## Décision finale

À valider explicitement par @thierry. Statut `Proposed` jusqu'à confirmation en chat session ou par PR de merge de cet ADR. Les choix A/B/C ont déjà été validés par @thierry 2026-05-08 ; les choix D-H ont été tranchés en délégation par @cowork. Cet ADR consolide l'ensemble en spec unique commit-ready.

---

## Références canoniques

- ADR-001 (no-PSD2) : pourquoi pas d'agrégation bancaire
- ADR-002 (bucket-model) : lissage automatique trimestriel/annuel
- ADR-009 (capacité d'épargne) : intégration des sorties anticipées dans le KPI hero
- ADR-011 (santé provisions) : utilisation des paiements pour bascule statut « À jour » / « Déficit »
- ADR-012 (assistant virements) : virement recommandé qui inclut le rattrapage de déficit
- Spec `dashboard-cockpit-vraie-vision-2026-05-03.md` (vault Athenaeum) pour la vision Dashboard cockpit complète
- Table Coda `DB_Depenses` partagée par @thierry 2026-05-07 (référence UX du toggle « Payé » + ligne verte + totaux auto)
