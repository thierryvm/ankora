# GDPR Audit — PR-SEC-ADMIN (2026-05-10)

**Branch**: `feat/sec-admin-hardening` (HEAD 861be8a)
**Auditor**: gdpr-compliance-auditor
**Verdict**: COMPLIANT_WITH_NOTES (1 P1 + 2 P2)

---

## Findings

### P1 — Art. 17 droit à l'effacement : `attempted_user_id` orphelin dans metadata jsonb

**Files**: `src/lib/auth/require-admin.ts:71`, `src/lib/gdpr/deletion.ts:42-45`

Lors d'un `admin.access.denied`, `attempted_user_id: user.id` est écrit dans la colonne `metadata jsonb`. `executeDeletion()` pseudonymise les colonnes FK (`user_id`, `ip_address`, `user_agent`) mais ne touche pas le jsonb metadata. Après effacement d'un compte, toutes les lignes `admin.access.denied` qui réfèrent cet UUID dans `metadata->>'attempted_user_id'` restent identifiantes.

Pattern Ankora cascade `users.id ON DELETE SET NULL` couvre la FK colonne, pas le jsonb non-FK.

**Fix (recommandation 1 — purge)** :

```sql
UPDATE public.audit_log
SET metadata = metadata - 'attempted_user_id'
WHERE metadata->>'attempted_user_id' = $userId;
```

Dans `executeDeletion()` Supabase JS avant `auth.admin.deleteUser`.

**Fix (recommandation 2 — pseudonymisation)** : remplacer `attempted_user_id` par hash HMAC-SHA256 non-réversible. Préserve corrélabilité investigation sans identifiabilité directe.

**Convergence avec security-auditor P1-B** : security-auditor recommande de **retirer** complètement `attempted_user_id` du metadata car redondant avec `user_id` colonne canonique. Cette fix éliminerait aussi le problème GDPR P1 ici. → Retenue.

---

### P2-A — Art. 5(1)(e) limitation de conservation : purge `audit_log` déclarée mais non planifiée

**Files**: `supabase/migrations/20260417000002_rls_hardening.sql:67-84`, `messages/fr-BE.json:408`

La fonction `purge_audit_log_older_than_12_months()` existe en base + privacy policy s'engage à 12 mois max. Aucun `pg_cron` ni Edge Function scheduled trouvé. Engagement non tenu en pratique.

Les nouveaux events `admin.access.*` s'accumulent sans purge → volume significatif sous scans automatisés.

**Fix** : documenter le vecteur cron + créer Edge Function `supabase/functions/audit-log-purge` OU migration `pg_cron` si plan Supabase le permet.

Pré-existant pré-PR-SEC-ADMIN, aggravé par cette PR. À résoudre avant V1.0 publique fin juin.

---

### P2-B — Art. 5(1)(e) : analytics Upstash Redis rétention non documentée

**File**: `src/lib/security/rate-limit.ts:72-77`

Le limiter `admin` utilise `analytics: true` (cohérent avec les 4 autres kinds). Upstash analytics stocke des métriques agrégées par identifiant avec rétention Upstash interne non sous contrôle Ankora. Privacy policy liste Upstash comme sous-traitant EU mais ne précise pas la rétention analytics.

**Fix (option A)** : `analytics: false` sur kind `admin` (les autres restent). Perte de visibilité métriques admin rate-limit, mais admin volume = très bas, valeur de l'analytics ici est marginale.

**Fix (option B)** : enrichir privacy policy §s4 avec rétention analytics Upstash.

Risque résiduel faible — analytics agrégées probablement aggregate sans IP brute, mais non vérifié côté Upstash.

---

## PASS verifications

| Article                                 | Area                                                             | Status                                                                                |
| --------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 5(1)(c) minimisation — `path` whitelist | `src/lib/security/audit-log.ts:66-88`                            | PASS (pour `/admin` racine. Note : sub-routes futurs `/admin/users/:id` à normaliser) |
| 6(1)(f) intérêt légitime                | `messages/fr-BE.json:406-409`                                    | PASS (privacy policy énumère obligation légale + intérêt légitime)                    |
| 17(3)(b) pseudonymisation audit log     | `src/lib/gdpr/deletion.ts:42-45`                                 | PASS pour FK colonnes (P1 ci-dessus pour jsonb)                                       |
| 25 privacy by design — RLS deny-all     | `supabase/migrations/20260417000003_audit_log_explicit_deny.sql` | PASS                                                                                  |
| 5(1)(d) exactitude IP extraction        | `src/lib/auth/require-admin.ts:33`                               | PASS (Vercel injecte IP réelle premier hop)                                           |

---

## Corrections requises avant merge

**Bloquant (P1)** : retirer `attempted_user_id` du metadata denied event (converge avec security-auditor P1-B). Le `user_id` colonne canonique sert déjà la corrélation. Ferme P1 GDPR + P1 security en une seule modification.

**À faire avant V1.0 publique (P2)** :

- Planifier invocation `purge_audit_log_older_than_12_months()` via pg_cron ou Edge Function.
- Soit désactiver `analytics: true` sur kind `admin`, soit enrichir privacy policy avec rétention analytics Upstash.

---

## Fichiers audités

- `src/lib/security/audit-log.ts`
- `src/lib/security/rate-limit.ts`
- `src/lib/auth/require-admin.ts`
- `src/lib/gdpr/deletion.ts`
- `supabase/migrations/20260416000001_initial_schema.sql`
- `supabase/migrations/20260417000002_rls_hardening.sql`
- `supabase/migrations/20260417000003_audit_log_explicit_deny.sql`
- `src/app/[locale]/(public)/legal/privacy/page.tsx`
- `messages/fr-BE.json`
- `docs/adr/ADR-019-admin-security-baseline.md`
- `docs/runbooks/RUNBOOK-upstash-ratelimit-setup.md`

_Rapport assemblé 2026-05-10 par @cc-ankora à partir des findings retournés par le gdpr-compliance-auditor agent (réponse text, pas de Write direct)._
