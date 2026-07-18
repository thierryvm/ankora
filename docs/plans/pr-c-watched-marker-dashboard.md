# PR-C — Marqueur « à surveiller » + dashboard factures remanié (THI-329)

> Plan @cc-ankora 2026-07-18. Epic « Factures cohérentes » (spec : `docs/plans/epic-factures-coherentes-spec.md`, section PR-B d'origine).
> Voie LOURDE (migration + Server Action) — plan-reviewer OBLIGATOIRE avant code.
> Modèle : Fable 5 épinglé explicitement par @thierry (classe > Opus, pas un downgrade silencieux).

## Goal

Le dashboard répond enfin au verbatim @thierry (P5) : « Ce mois-ci → afficher 5 factures par dates non payées + le montant restant à payer + un mot d'explication ; Mois prochain → uniquement des factures validées avec un marqueur ». Décisions VERROUILLÉES 2026-06-05 : marqueur = `is_watched`, toggle = bouton inline (comme Payé).

## État vérifié (code, 2026-07-18)

- Dashboard `/app` : Hero Situation (THI-327 P0 livré) → Jauge provisions → **`ProchainesFacturesCard`** (buckets J-7/J-14/J-30 + overdue, `getUpcomingCharges`) → comptes → plan virements → dépenses. La card factures est la cible.
- `nextUnpaidDueDate` (#223) dispo dans le domaine — donne la prochaine occurrence NON payée + isOverdue par charge.
- Pattern Server Action : `charges.ts` (`requireUserWorkspace`-style ctx → `rateLimit('mutation', user)` → Zod → authz workspace → write → `logAuditEvent` → `revalidateDashboard()` + `revalidateAppPath('charges')`). `CHARGE_PAYMENT_TOGGLED` existe dans `audit-log.ts:33`.
- `chargeInputSchema` a `isActive` (l.62) — `isWatched` s'y calque. Types générés `src/lib/supabase/types.ts` : Row/Insert/Update de `charges` (l.249+) éditées à la main (append d'un champ, vérifié par typecheck ; regen CLI au prochain cycle).
- **THI-348** : `TONE_CLASSES` danger (`bg-danger/15 text-danger`) + info (`text-brand-700`) échouent WCAG AA en dark — la card étant réécrite, on corrige ici (ticket soldé).

## Scope (fichiers exacts)

| Fichier                                                              | Action                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260718000001_charges_is_watched.sql`          | **NEW** — `alter table public.charges add column is_watched boolean not null default false;` (RLS par table inchangée, pas de backfill nécessaire)                                                                                                                                                          |
| `src/lib/supabase/types.ts`                                          | `is_watched: boolean` (Row) / `is_watched?: boolean` (Insert, Update) sur `charges`                                                                                                                                                                                                                         |
| `src/lib/schemas/charge.ts`                                          | `isWatched: z.boolean().default(false)` dans `chargeInputSchema`                                                                                                                                                                                                                                            |
| `src/lib/security/audit-log.ts`                                      | `CHARGE_WATCH_TOGGLED: 'charge.watch_toggled'`                                                                                                                                                                                                                                                              |
| `src/lib/actions/charges.ts`                                         | **NEW action** `toggleWatchAction(id: string)` : ctx → rate-limit → fetch charge (authz workspace via RLS + vérif appartenance comme update/delete) → `update({ is_watched: !current })` → audit (chargeId + nouvel état, pas de PII) → revalidate dashboard+charges → `ActionResult<{ watched: boolean }>` |
| `src/lib/data/workspace-snapshot.ts`                                 | SELECT `is_watched` + mapping `isWatched` dans `rawCharges` (et `charges` domaine si `Charge` l'expose — vérifier `toCockpitCharges` non impacté)                                                                                                                                                           |
| `src/lib/domain/types.ts` (ou types charge)                          | `isWatched: boolean` sur le type `Charge`/`RawCharge` selon la chaîne réelle                                                                                                                                                                                                                                |
| `src/components/dashboard/ProchainesFacturesCard.tsx`                | **RÉÉCRITURE** (voir design)                                                                                                                                                                                                                                                                                |
| `src/components/dashboard/__tests__/ProchainesFacturesCard.test.tsx` | adapté au nouveau contrat                                                                                                                                                                                                                                                                                   |
| `src/app/[locale]/app/charges/ChargesClient.tsx`                     | bouton inline « À surveiller » (icône `Bookmark`, 44px mobile) par ligne, `useOptimistic` set watched, même pattern que Payé                                                                                                                                                                                |
| `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx`      | tests toggle watch                                                                                                                                                                                                                                                                                          |
| `src/app/[locale]/app/page.tsx`                                      | passe `todayIso`/`currentPeriod` déjà présents — vérifier props nouvelles (`currentPeriod`)                                                                                                                                                                                                                 |
| `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json`                         | cf. i18n                                                                                                                                                                                                                                                                                                    |

## Design — nouvelle `ProchainesFacturesCard`

Deux sections (remplacent les 4 buckets) :

1. **« Ce mois-ci »** (`dashboard.upcomingBills.thisMonth`) : factures **dues ce mois non payées** (via `nextUnpaidDueDate` par charge : garder si `dueDateIso` ∈ mois courant OU overdue), triées par date (overdue en tête, tone danger sur la ligne), **cap 5** (demande explicite @thierry — distinct du trim auto rejeté qui capait « Mois prochain ») + lien « Voir toutes » existant. Header droit = **« reste à payer » du mois** (somme des dues-ce-mois non payées — MÊME définition que le bandeau de la page charges, cohérence cross-page) + sous-titre d'explication (`thisMonthHint` : « Factures du mois encore à payer — coche-les sur la page Charges. »). État vide = « Tout est payé ce mois » (aligné bandeau charges).
2. **« À surveiller »** (`watched`) : charges `is_watched` actives **non payées pour leur prochaine occurrence**, chaque ligne = label + prochaine date (`nextUnpaidDueDate`) + montant. Vide → section masquée. Explication courte (`watchedHint`).

Supprimés : buckets j7/j14/j30 (fragmentation critiquée), « Mois prochain » auto. `getUpcomingCharges`/`upcoming.ts` reste dans le domaine (non supprimé — d'autres usages potentiels ; la card ne l'appelle plus). Si `getUpcomingCharges` n'a plus AUCUN call-site → le retirer est un chore séparé, PAS ce PR (scope).

**a11y/THI-348 dans la réécriture** : overdue = badge blanc-sur-`danger` plein (pattern #224 validé) ; plus de `text-brand-700` → `text-brand-text` ; tones dark-safe uniquement.

## i18n (×5)

- `dashboard.upcomingBills` : `thisMonth`, `thisMonthHint`, `thisMonthEmpty`, `watched`, `watchedHint`, `remainingLabel` (réutiliser le wording du bandeau charges), garder `itemCount`, `daysOverdue/dueToday/daysUntil`, `viewAll`, `empty`. Clés buckets `j7/j14/j30` deviennent orphelines → les retirer des 5 locales (`buckets.overdue` réutilisé pour le badge).
- `app.charges` : `watchAria` (« Surveiller {label} »), `unwatchAria`, `toastWatched`, `toastUnwatched` ; `errors.charges.watchFailed`.

## Tests

- Action (`__tests__/charges.test.ts` pattern existant) : toggle authz (charge d'un autre workspace → not-found/denied), rate-limit, audit émis, flip persistant.
- Card : « Ce mois-ci » cap 5 + tri par date + overdue en tête + reste à payer correct + vide ; « À surveiller » liste les watched non payées, masquée sinon ; payée → sort des deux sections.
- ChargesClient : bouton watch aria-pressed, optimiste, toast.

## Non-goals

Reset mensuel + alerte oubli (PR suivante) · CadenceField (PR-D) · suppression `upcoming.ts` · refonte graphique globale dashboard (phases THI-327 suivantes).

## Risk tiering / QA — voie LOURDE

plan-reviewer (ce doc) → security-auditor (nouvelle Server Action) → rls-flow-tester (migration) → dashboard-ux-auditor (card) → i18n-auditor → test-runner. DoD5 + smoke @thierry (desktop/mobile/dark).
