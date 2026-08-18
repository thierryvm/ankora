# PR-D3 — Effort Lissé + Capacité Réelle hero radar — Rapport final

- **Date** : 2026-05-06 21:22 (UTC+2)
- **Auteur** : @cc-ankora (Opus 4.7, claude-opus-4-7)
- **Modèle vérifié** : ✅ Phase 0 OK
- **Branche** : `feat/cc-design-handoff-v3-pr-d3-hero-radar`
- **Commit** : `a7ae5ad feat(cockpit): Effort Lissé + Capacité Réelle hero radar (PR-D3)`
- **PR ouverte** : **https://github.com/thierryvm/ankora/pull/121**
- **mergeStateStatus initial** : `UNSTABLE` (CI en cours, normal)

---

## TL;DR @cowork — 60 secondes

1. **Bloc 2 hero radar livré** : 2 cards Server Components (Effort Financier Lissé + Capacité d'Épargne Réelle) rendues au-dessus du Bloc 1 dans `/app`.
2. **KPI différenciateur Ankora ON** : la Capacité Réelle = `revenus − effort − plafond`, lissée annuellement. Aucun concurrent ne ship ce calcul. Affichage emerald (≥ 0) + `+` prefix / rose (< 0) + AlertCircle, glow blob bottom-right matchant.
3. **Zéro migration DB** : helper `toCockpitCharges()` adapte `Charge → CockpitCharge` à partir du snapshot existant. `plafondQuotidien` re-utilise `vie_courante_monthly_transfer` (Phase 2 audit flag résolu).
4. **Mini-CTA daily** intégré sur l'AccountCard daily_card si plafond non configuré, via prop `extraHint?` (narrow API addition).
5. **i18n 5 locales en lockstep** (no FR placeholders).
6. **22 Vitest + 4 E2E** écrits, **645/645 vitest pass**. Lint + typecheck + use-server + build tous verts.

---

## Décisions @cowork suivies (toutes intégrées)

| #   | Décision @cowork                                           | Application                                                               |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Démarrer ce soir avec Design System Session #1             | ✅ visuel cohérent tokens existants (brand-\* / muted-foreground / ring-) |
| 2   | Server Components (pas Client) pour KPI                    | ✅ math + i18n côté serveur, hydratation cost = 0                         |
| 3   | Decimal.js obligatoire                                     | ✅ tout passe par `Decimal` du module cockpit                             |
| 4   | `plafondQuotidien` = `snapshot.vieCouranteMonthlyTransfer` | ✅ pas de migration                                                       |
| 5   | Mini-CTA "Régler le plafond quotidien" si null/0           | ✅ AccountCard `extraHint` slot, link vers /app/accounts                  |
| 6   | Bloc 2 grid-cols-2 desktop, 1 col mobile                   | ✅ `grid gap-4 md:grid-cols-2`                                            |
| 7   | i18n 5 locales avec parité                                 | ✅ `dashboard.{effort,capacite,daily}` patché en lockstep                 |
| 8   | Pas de Bloc 3 / pas de migration / pas de scope creep      | ✅ scope strictement respecté                                             |

---

## Architecture livrée

### Composants (Server Components)

| Fichier                                            | Rôle                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/components/dashboard/EffortFinancierCard.tsx` | Big number 4xl + breakdown 2-cell (charges fixes / provisions). Blue gradient + Shield icon. |
| `src/components/dashboard/CapaciteEpargneCard.tsx` | Big number coloré (emerald/rose), prefix + sur positifs, glow blob, message contextuel.      |

Visual semantics :

- **Effort** : ring blue-500/15, gradient subtle blue, ShieldCheck top-right.
- **Capacité positive** : ring emerald-500/15, value text-emerald-600 (dark: 400), CheckCircle2 emerald, glow emerald-500/20.
- **Capacité négative** : ring rose-500/15, value text-rose-600 (dark: 400), AlertCircle rose, glow rose-500/20.
- **Capacité = 0** : positif sans `+` prefix (≥ 0 contract).

### Adapter

```ts
// src/lib/data/workspace-snapshot.ts
export function toCockpitCharges(charges: readonly Charge[]): readonly CockpitCharge[] {
  return charges.map((c) => ({
    id: c.id,
    label: c.label,
    amount: c.amount,
    frequency: c.frequency,
    paymentMonths: [c.dueMonth] as readonly number[],
    paymentDay: 1,
    isActive: c.isActive,
  }));
}
```

Stub safe parce que `effortFinancierLisse()` et `capaciteEpargneReelle()` ne lisent que `amount`, `frequency`, `isActive`. PR-D4+ swappera vers les colonnes canoniques `payment_months[]` / `payment_day`.

### Wiring `page.tsx`

```tsx
const cockpitCharges = toCockpitCharges(snapshot.charges);
const dailyPlafondMissing =
  snapshot.vieCouranteMonthlyTransfer === null || snapshot.vieCouranteMonthlyTransfer === 0;
const tDaily = await getTranslations('dashboard.daily');

// Bloc 2 — toujours visible (canonical narrative)
<section className="grid gap-4 md:grid-cols-2">
  <EffortFinancierCard charges={cockpitCharges} locale={locale} />
  <CapaciteEpargneCard
    revenus={monthlyIncome}
    charges={cockpitCharges}
    plafondQuotidien={vieCouranteTransferAmount}
    locale={locale}
  />
</section>;

// Mini-CTA daily — extraHint slot
const extraHint =
  accountType === 'daily_card' && dailyPlafondMissing ? (
    <Link href="/app/accounts">…cta_set_plafond</Link>
  ) : undefined;
<AccountCard {...account} extraHint={extraHint} />;
```

---

## Quality gates ✅

| Gate                      | Résultat                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `npm run lint`            | ✅ 0 erreur, 7 warnings `no-console` (intentionnel, error boundaries) |
| `npm run lint:use-server` | ✅ All `use server` files contain only async exports                  |
| `npm run typecheck`       | ✅ 0 erreur                                                           |
| `npx vitest run` (full)   | ✅ **645/645 tests pass**, 66 fichiers (2 nouveaux test files)        |
| `npm run build`           | ✅ exit code 0, all routes prerender                                  |

### Tests détaillés

| Fichier                                 | Cas | Couverture                                                                                                                                             |
| --------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EffortFinancierCard.test.tsx`          | 5   | empty state (0), monthly-only, annual lissage (1200/12=100), mix (1500+100+15=1615), inactive ignored                                                  |
| `CapaciteEpargneCard.test.tsx`          | 7   | title, positive emerald + `+`, negative rose + warning, capacité=0 unsigned, revenus=0, decimal precision (12×53/12=53), @thierry mixed fixture (-159) |
| `dashboard-cockpit-bloc2.spec.ts` (E2E) | 4   | both cards visible, negative variant rose, mini-CTA daily, iPhone viewport (skip auto sans Supabase)                                                   |
| **i18n parity** (5 locales)             | 10  | `dashboard.effort.*` + `dashboard.capacite.*` couvert dans chaque locale                                                                               |

---

## DoD canonique 5/5 — état actuel

| #   | Critère DoD                           | État                                             |
| --- | ------------------------------------- | ------------------------------------------------ |
| 1   | `gh pr checks` ✅ tous verts          | ⏳ CI en cours sur `a7ae5ad`                     |
| 2   | Sourcery silent sur le DERNIER commit | ⏭ Sourcery `skipping` (rate limit hebdo accepté) |
| 3   | Threads humains résolus               | ⏳ aucun thread humain ouvert (PR fraîche)       |
| 4   | Branch up-to-date with main           | ✅ basée sur `d8b606f` (PR-LEGAL-1 mergée)       |
| 5   | mergeStateStatus CLEAN                | ⏳ `UNSTABLE` initial post-push (normal)         |

**À surveiller** : Playwright E2E job va potentiellement échouer sur BUG-iOS-011 #116 (overflow iPhone SE landing). **Accepté @cowork** pour le merge bypass admin.

---

## Statut CI initial post-push

```
check-sourcery-resolved        pass    2s
label                          pass    4s
Vercel Preview Comments        pass    0
Vercel                         pass    0   (deployment ready)
Sourcery review                skipping
Lint + Typecheck + Unit Tests  pending 0
Security audit                 pending 0
```

---

## Backlog post-merge (flag pour @cowork)

1. **PR-D3-bis raffinement visuel** — si mockups Claude Design #3 (week-end 10-11 mai) imposent des animations (motion) ou un layout différent, prévoir une mini-PR post-merge. Pour cette PR-D3, le KPI est fonctionnellement correct sur Design System Session #1.
2. **Refactor Bloc 1 (4 KPIs existants)** — actuellement coexistent au-dessus du Bloc 2 ajouté. PR-D4 décidera si on remplace, déplace ou garde en sus selon les mockups CD#3.
3. **Snapshot SELECT extension** — la query `workspace-snapshot.ts:122` ne lit pas encore `payment_months` / `payment_day`. Le stub via `toCockpitCharges()` est safe pour PR-D3, mais PR-D4 (toggle paye) en aura besoin.
4. **AccountCard `extraHint` API** — si pattern réutilisé en PR-D5 pour des hints contextuels (santé provisions, etc.), formaliser dans `docs/CONVENTIONS.md` ou similaire.

---

## Actions @cowork demandées

- [ ] Vérifier la PR #121 → CI lint/typecheck/test/build verts
- [ ] Smoke test sur Vercel preview ([https://ankora-...vercel.app/app](https://github.com/thierryvm/ankora/pull/121) — login compte test → Bloc 2 visible)
- [ ] Approuver + squash merge avec **bypass admin** sur Playwright iPhone SE (BUG-iOS-011 connu/accepté)
- [ ] (optionnel) Décider visuel définitif post-mockups CD#3 → PR-D3-bis ou validation directe

## Pour @thierry (validation post-merge empirique)

- **Desktop** ankora.be/app : 2 hero cards visibles, Capacité Réelle emerald + message positif si revenus > effort + plafond.
- **Mobile iPhone 14 PWA standalone** : 2 cards stack vertical lisibles, glow visible.
- **Tester avec valeurs charges variées** : ajouter une grosse charge mensuelle pour flipper le sign emerald → rose et voir le warning message.
- **Mini-CTA "Régler le plafond quotidien"** visible sur la card Carte Quotidien si `vie_courante_monthly_transfer` n'est pas configuré.

---

**Push done ≠ task done.** Squash merge attendu après ta validation finale + bypass admin Playwright.

🎯 PR-D3 = LE KPI différenciateur Ankora vs concurrents. Step 1 vers une app utilisable user N°1 @thierry.

— @cc-ankora (Opus 4.7) · 2026-05-06 21:22 UTC+2
