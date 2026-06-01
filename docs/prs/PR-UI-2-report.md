# PR-UI-2 — Badge fréquence charges : sobre + visible + distinct (THI-299)

> **Branche** : `feat/thi-299-charges-frequency-badge` · **Ticket** : THI-299
> **Auteur** : @cc-ankora (orchestrateur, @cowork en debrief) · **Date** : 2026-06-01

---

## 1. Objectif

Le badge fréquence de la liste charges (`ChargesClient.tsx`) était **invisible et indistinct** :

- `bg-surface-muted` sur `bg-card` ≈ 1.05:1 → pilule invisible.
- texte `text-muted-foreground` = identique au `charges-row-next-due` → indistinct.
- rendait le **mot entier** (`tFreq(c.frequency)`, namespace `common.frequency`).

Décision @thierry verrouillée : **PAS de color-coding** (la couleur reste réservée au `color_token` catégorie). Différencier par **abréviation + icône neutre**, WCAG ≥ 4.5:1, tokens sémantiques, zéro hex.

## 2. Solution livrée

Tag **borderless** : icône de récurrence neutre + abréviation locale en `text-foreground`. La visibilité + la distinction reposent sur **trois signaux opaques, 100% tokens** (au lieu d'un conteneur invisible) :

1. l'icône `<Repeat>` (lucide, `text-muted-foreground`, `size-3`, décorative) ;
2. la couleur `text-foreground` (vs `text-muted-foreground` du next-due — AAA sur card) ;
3. la forme **abrégée** (Mens./Trim./Sem./Ann.).

```tsx
<span data-testid="charges-row-frequency"
  className="text-foreground inline-flex w-fit shrink-0 items-center gap-1 text-xs font-medium md:order-3">
  <Repeat aria-hidden="true" className="text-muted-foreground size-3" />
  <abbr title={tFreq(...)} aria-hidden="true" className="no-underline">{tFreqAbbr(...)}</abbr>
  <span className="sr-only">{tFreq(...)}</span>
</span>
```

### Pourquoi borderless (et pas le chip outlined initialement prévu)

Le plan initial utilisait `border-border-strong`. Les audits `ui-auditor` + `mobile-ios-auditor` ont révélé que **`--color-border-strong` est un token fantôme** : référencé dans `token-usage.md` §3 + `claude-design-brief.md` mais **jamais défini dans `globals.css`**. Un chip outlined aurait eu une bordure invisible (~1.16:1) — soit exactement le bug du ticket. Plutôt que de définir le token (décision de **valeur** de design = arbitrage @thierry/@cowork, interdit en même session que l'implémentation, doctrine banned-list #2), le badge est passé en borderless. Le token fantôme est tracé séparément en **THI-314**.

### a11y

- Icône décorative : `aria-hidden="true"`.
- L'abréviation visible est `aria-hidden` ; le **mot complet** est exposé aux lecteurs d'écran via `sr-only` (robuste : VoiceOver iOS n'annonce pas fiablement `<abbr title>`).
- Les voyants gardent le mot complet au survol via `title`.

## 3. Clés i18n — nouveau namespace `common.frequencyAbbr` (5 locales)

`common.frequency` (mots complets) **inchangé** — consommé par 4 surfaces (selects ChargesClient + ChargeEditDrawer + OnboardingWizard + SimulatorClient). Les abréviations sont des **nouvelles** clés.

| Enum       | fr-BE | nl-BE  | en    | de-DE   | es-ES |
| ---------- | ----- | ------ | ----- | ------- | ----- |
| monthly    | Mens. | Mnd.   | Mo.   | Mtl.    | Mens. |
| quarterly  | Trim. | Kwart. | Qtr.  | Quartl. | Trim. |
| semiannual | Sem.  | Halfj. | Semi. | Halbj.  | Sem.  |
| annual     | Ann.  | Jaarl. | Ann.  | Jährl.  | Anual |

de-DE quarterly = **`Quartl.`** (pas `Vj.` : collision avec _Vorjahr_ en contexte financier, flag i18n-auditor appliqué). Glossaire `docs/i18n-glossary.md` bumpé **v1.2** avec la table + les décisions.

## 4. Fichiers modifiés

- `src/app/[locale]/app/charges/ChargesClient.tsx` — badge + hook `tFreqAbbr` + import `Repeat`.
- `messages/{fr-BE,en,nl-BE,de-DE,es-ES}.json` — namespace `common.frequencyAbbr`.
- `src/app/[locale]/app/charges/__tests__/ChargesClient.test.tsx` — asserts abréviation + `title` (matcher `getByTitle`).
- `docs/i18n-glossary.md` — table abréviations + v1.2.

## 5. QA — agents (DoD)

| Agent                | Verdict                  | Résolution                                                                                                                                 |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `plan-reviewer`      | 🟡 APPROVED WITH CHANGES | 4 consommateurs `common.frequency` documentés, matcher `title` corrigé, invariant géométrie e2e noté, DoD ajoutée — tous intégrés          |
| `i18n-auditor`       | PASS_WITH_NOTES          | `Vj.`→`Quartl.` appliqué ; glossaire v1.2 ; `Sem.`/`Semi.`/`Anual` jugés acceptables (contexte 4 valeurs + mot complet dispo)              |
| `ui-auditor`         | BLOCK → résolu           | F1/F2/F3 (token fantôme + contraste bordure) éliminés par le borderless ; F5 (abbr VoiceOver) → `sr-only` ; F6 (`aria-hidden`) → `="true"` |
| `mobile-ios-auditor` | PASS_WITH_NOTES → résolu | token fantôme idem ; pas d'overflow iPhone SE (label `truncate` + chip `shrink-0`) ; `no-underline` OK WebKit                              |

**Note densité (non bloquante, pour live-test @thierry)** : icône `Repeat` ×N lignes — risque de charge visuelle à confirmer en live. L'icône est subordonnée (`text-muted-foreground`) sous le texte (`text-foreground`).

## 6. Tests

- `vitest` `ChargesClient.test.tsx` : **18/18** pass.
- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur. `npm run lint:use-server` : pass.
- JSON valide ×5 locales.
- e2e `charges-list-desktop` : invariant préservé (badge garde `shrink-0`, markup identique sur toutes les lignes → spread géométrique = 0).

## 7. Hors scope (tracé)

- **Groupement / total bas** = THI-300 (PR-UI-3a).
- **Token `--color-border-strong`** = THI-314 (définition + doc, décision valeur @thierry).
- `common.frequency` mots complets : intouchés.

## 8. Définition de DONE

1. CI verts (Lint, Typecheck, Tests, E2E, Security, Build) : ⏳ à confirmer post-push
2. Sourcery silencieux sur dernier commit : ⏳
3. Review humaine : ⏳ @thierry
4. Pas de conflit main : ⏳
5. Rapport (ce doc) : ✅
6. Live-test @thierry clair/sombre (visibilité + distinction + densité icône) : ⏳ **bloquant avant merge**
